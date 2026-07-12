/**
 * lib/invoice/repo.ts — DB-Zugriff des Rechnungsmoduls (doc 10 §5).
 *
 * Bündelt Lesen (Aussteller/Kunde/Projekt/abrechenbare Einträge, Rechnung mit
 * Posten) und die transaktionalen Schreibpfade (Entwurf anlegen, finalisieren,
 * stornieren) hinter einer schmalen API, damit die Route-Handler dünn bleiben.
 * Nutzt den `pg.Pool` aus @/lib/db direkt (parametrisiertes SQL). Wichtig:
 * node-postgres liefert BIGINT als String — epoch-ms/`*_cents` werden beim Lesen
 * defensiv per Number() koerciert (doc 05 §8).
 */
import type { PoolClient } from "pg";
import { uuidv7 } from "uuidv7";
import { pool } from "@/lib/db";
import type { BillableEntry, DraftItem, InvoiceCustomer, IssuerProfile } from "./types.js";
import type { InvoiceTotals, TaxContext } from "./tax.js";
import {
  buildCustomerSnapshot,
  buildProjectSnapshot,
  buildRateSnapshot,
  buildRoundingSnapshot,
  type SnapshotProject,
} from "./snapshot.js";
import { allocateNumber, formatInvoiceNumber, sequenceKey } from "./number.js";
import { recordAudit } from "./audit.js";

/** BIGINT/Numeric-String → number (null-sicher). */
function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}
function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Aktueller Actor für Audit (user_id, sonst main_account_id). */
export function actorId(auth: { user_id?: string; main_account_id: string }): string {
  return auth.user_id ?? auth.main_account_id;
}

/** Aussteller-Profil (§14 Nr. 1/3) aus main_accounts + settings-Override. */
export async function resolveIssuer(mainAccountId: string): Promise<IssuerProfile> {
  const acc = await pool.query(
    `SELECT display_name, company_name, email, default_currency, default_locale
       FROM main_accounts WHERE id = $1 LIMIT 1`,
    [mainAccountId],
  );
  const a = acc.rows[0] as
    | { display_name: string; company_name: string | null; email: string | null; default_currency: string; default_locale: string }
    | undefined;

  const setting = await pool.query(
    `SELECT value_json FROM settings
      WHERE main_account_id = $1 AND scope = 'account' AND device_id IS NULL AND key = 'issuer_profile'
      LIMIT 1`,
    [mainAccountId],
  );
  const ov = (setting.rows[0]?.value_json ?? {}) as {
    address?: string;
    tax_number?: string;
    vat_id?: string;
    small_business?: boolean;
  };

  return {
    display_name: a?.display_name ?? "",
    company_name: a?.company_name ?? null,
    email: a?.email ?? null,
    address: ov.address ?? null,
    tax_number: ov.tax_number ?? null,
    vat_id: ov.vat_id ?? null,
    small_business: ov.small_business === true,
    currency: a?.default_currency ?? "EUR",
    locale: a?.default_locale ?? "de-DE",
  };
}

/** Kunde (scoped) laden. */
export async function loadCustomer(
  mainAccountId: string,
  customerId: string,
): Promise<InvoiceCustomer | null> {
  const res = await pool.query(
    `SELECT id, name, company, contact_person, email, billing_address, vat_id, customer_number,
            default_tax_rate, reverse_charge_hint, small_business_hint, default_currency,
            default_invoice_note, default_hourly_rate_cents, payment_term_days
       FROM customers WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [customerId, mainAccountId],
  );
  const r = res.rows[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    company: r.company,
    contact_person: r.contact_person,
    email: r.email,
    billing_address: r.billing_address,
    vat_id: r.vat_id,
    customer_number: r.customer_number,
    default_tax_rate: r.default_tax_rate,
    reverse_charge_hint: r.reverse_charge_hint,
    small_business_hint: r.small_business_hint,
    default_currency: r.default_currency,
    default_invoice_note: r.default_invoice_note,
    payment_term_days: r.payment_term_days == null ? null : Number(r.payment_term_days),
  };
}

/** Kunden-Standard-Stundensatz (Fallback für Satz-Auflösung). */
export async function customerDefaultRate(mainAccountId: string, customerId: string): Promise<number | null> {
  const res = await pool.query(
    `SELECT default_hourly_rate_cents FROM customers WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
    [customerId, mainAccountId],
  );
  return numOrNull(res.rows[0]?.default_hourly_rate_cents);
}

/** Projekt-Kerndaten (scoped) für den Projekt-Snapshot. */
export async function loadProject(
  mainAccountId: string,
  projectId: string,
): Promise<SnapshotProject | null> {
  const res = await pool.query(
    `SELECT id, name, project_code, billing_type, customer_id
       FROM projects WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
    [projectId, mainAccountId],
  );
  const r = res.rows[0];
  return r ? { id: r.id, name: r.name, project_code: r.project_code, billing_type: r.billing_type, customer_id: r.customer_id } : null;
}

/** Filter für die Auswahl abrechenbarer Einträge. */
export interface EntrySelector {
  customer_id?: string;
  project_id?: string;
  /** Explizite Eintrags-IDs (überschreiben Zeitraum). */
  time_entry_ids?: string[];
  /** Zeitraum in epoch-ms [from, to). */
  from?: number;
  to?: number;
}

/**
 * Lädt abrechenbare, noch nicht fakturierte, abgeschlossene Einträge
 * (doc 10 §5.1 Fn 1). `label` = "Projekt · Aufgabe". Einträge ohne
 * `rate_snapshot` fallen im Aufrufer auf den Kunden-Standardsatz zurück.
 */
export async function loadBillableEntries(
  mainAccountId: string,
  sel: EntrySelector,
): Promise<BillableEntry[]> {
  const where: string[] = [
    "te.main_account_id = $1",
    "te.is_billable = true",
    "te.invoice_id IS NULL",
    "te.status <> 'invoiced'",
    "te.deleted_at IS NULL",
    "te.actual_ended_at IS NOT NULL",
    "te.billing_duration_seconds > 0",
  ];
  const params: unknown[] = [mainAccountId];

  if (sel.time_entry_ids && sel.time_entry_ids.length > 0) {
    params.push(sel.time_entry_ids);
    where.push(`te.id = ANY($${params.length})`);
  } else {
    if (sel.customer_id) {
      params.push(sel.customer_id);
      where.push(`(te.customer_id = $${params.length} OR p.customer_id = $${params.length})`);
    }
    if (sel.project_id) {
      params.push(sel.project_id);
      where.push(`te.project_id = $${params.length}`);
    }
    if (typeof sel.from === "number") {
      params.push(sel.from);
      where.push(`te.actual_started_at >= $${params.length}`);
    }
    if (typeof sel.to === "number") {
      params.push(sel.to);
      where.push(`te.actual_started_at < $${params.length}`);
    }
  }

  const res = await pool.query(
    `SELECT te.id, te.project_id, te.task_id, te.description, te.timezone,
            te.actual_started_at, te.actual_ended_at, te.billing_duration_seconds,
            te.net_work_duration_seconds, te.rate_snapshot, te.billing_amount_snapshot,
            te.rounding_rule_id, te.rounding_reason, te.rounding_delta_seconds,
            p.name AS project_name, t.name AS task_name
       FROM time_entries te
       LEFT JOIN projects p ON p.id = te.project_id
       LEFT JOIN tasks t ON t.id = te.task_id
      WHERE ${where.join(" AND ")}
      ORDER BY te.actual_started_at ASC`,
    params,
  );

  return res.rows.map((r): BillableEntry => {
    const label = `${r.project_name ?? "Ohne Projekt"}${r.task_name ? ` · ${r.task_name}` : ""}`;
    const snap = r.rate_snapshot as { amount_cents?: unknown; currency?: unknown; source?: string } | null;
    return {
      id: r.id,
      project_id: r.project_id,
      task_id: r.task_id,
      label,
      description: r.description,
      timezone: r.timezone,
      actual_started_at: num(r.actual_started_at),
      actual_ended_at: numOrNull(r.actual_ended_at),
      billing_duration_seconds: num(r.billing_duration_seconds),
      net_work_duration_seconds: num(r.net_work_duration_seconds),
      rate_snapshot:
        snap && snap.amount_cents != null && snap.currency != null
          ? { amount_cents: Number(snap.amount_cents), currency: String(snap.currency), source: snap.source }
          : null,
      billing_amount_snapshot: numOrNull(r.billing_amount_snapshot),
      rounding_rule_id: r.rounding_rule_id,
      rounding_reason: r.rounding_reason,
      rounding_delta_seconds: numOrNull(r.rounding_delta_seconds),
    };
  });
}

/** Eingabe zum Anlegen eines Rechnungsentwurfs. */
export interface CreateDraftInput {
  mainAccountId: string;
  actor: string;
  device_id?: string | null;
  customer: InvoiceCustomer;
  project: SnapshotProject | null;
  entries: BillableEntry[];
  items: DraftItem[];
  totals: InvoiceTotals;
  tax: TaxContext;
  currency: string;
  issueDate: string;
  serviceDate?: string | null;
  servicePeriodStart?: string | null;
  servicePeriodEnd?: string | null;
  paymentDueDate?: string | null;
  notes?: string | null;
}

/** Legt Rechnung (draft) + Posten + Eintragsverknüpfungen transaktional an. */
export async function createDraftInvoice(input: CreateDraftInput): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invoiceId = uuidv7();
    const now = Date.now();

    const customerSnapshot = buildCustomerSnapshot(input.customer);
    const projectSnapshot = buildProjectSnapshot(input.project);
    const rateSnapshot = buildRateSnapshot(input.items);
    const roundingSnapshot = buildRoundingSnapshot(input.entries);

    await client.query(
      `INSERT INTO invoices
         (id, main_account_id, customer_id, invoice_number, type, status, issue_date,
          service_period_start, service_period_end, service_date, payment_due_date, currency,
          net_amount_cents, tax_amount_cents, gross_amount_cents, tax_rate,
          small_business_note, reverse_charge_note,
          customer_snapshot, project_snapshot, rate_snapshot, rounding_snapshot,
          notes, created_at, updated_at, sync_version, local_revision)
       VALUES ($1,$2,$3,NULL,'standard','draft',$4,
               $5,$6,$7,$8,$9,
               $10,$11,$12,$13,
               $14,$15,
               $16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,
               $20,$21,$21,0,0)`,
      [
        invoiceId,
        input.mainAccountId,
        input.customer.id,
        input.issueDate,
        input.servicePeriodStart ?? null,
        input.servicePeriodEnd ?? null,
        input.serviceDate ?? null,
        input.paymentDueDate ?? null,
        input.currency,
        input.totals.net_cents,
        input.totals.tax_cents,
        input.totals.gross_cents,
        String(input.tax.tax_rate),
        input.tax.treatment === "small_business" ? input.tax.note : null,
        input.tax.treatment === "reverse_charge" ? input.tax.note : null,
        JSON.stringify(customerSnapshot),
        projectSnapshot ? JSON.stringify(projectSnapshot) : null,
        JSON.stringify(rateSnapshot),
        JSON.stringify(roundingSnapshot),
        input.notes ?? null,
        now,
      ],
    );

    // Posten + Eintragsverknüpfungen.
    let position = 1;
    for (const it of input.items) {
      const itemId = uuidv7();
      await client.query(
        `INSERT INTO invoice_items
           (id, main_account_id, invoice_id, kind, position, description, quantity, unit,
            unit_price_cents, net_amount_cents, tax_rate, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          itemId,
          input.mainAccountId,
          invoiceId,
          it.kind,
          position,
          it.description,
          String(it.quantity),
          it.unit,
          it.unit_price_cents,
          it.net_amount_cents,
          String(it.tax_rate),
          now,
        ],
      );
      for (const link of it.links) {
        await client.query(
          `INSERT INTO invoice_time_entries
             (invoice_id, time_entry_id, invoice_item_id, main_account_id, billed_duration_seconds, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (invoice_id, time_entry_id) DO NOTHING`,
          [invoiceId, link.time_entry_id, itemId, input.mainAccountId, link.billed_duration_seconds, now],
        );
      }
      position += 1;
    }

    await recordAudit(client, {
      main_account_id: input.mainAccountId,
      actor_id: input.actor,
      device_id: input.device_id ?? null,
      entity_type: "invoices",
      entity_id: invoiceId,
      action: "invoice_created",
      after: { type: "standard", status: "draft", gross_amount_cents: input.totals.gross_cents },
      source: "api",
    });

    await client.query("COMMIT");
    return invoiceId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Rechnung + Posten + verknüpfte Eintrags-IDs (scoped). */
export async function getInvoiceWithItems(
  mainAccountId: string,
  invoiceId: string,
): Promise<{
  invoice: Record<string, unknown>;
  items: Record<string, unknown>[];
  time_entry_ids: string[];
} | null> {
  const inv = await pool.query(`SELECT * FROM invoices WHERE id = $1 AND main_account_id = $2 LIMIT 1`, [
    invoiceId,
    mainAccountId,
  ]);
  if (inv.rows.length === 0) return null;
  const items = await pool.query(
    `SELECT * FROM invoice_items WHERE invoice_id = $1 AND main_account_id = $2 ORDER BY position ASC`,
    [invoiceId, mainAccountId],
  );
  const links = await pool.query(
    `SELECT time_entry_id FROM invoice_time_entries WHERE invoice_id = $1 AND main_account_id = $2`,
    [invoiceId, mainAccountId],
  );
  return {
    invoice: inv.rows[0],
    items: items.rows,
    time_entry_ids: links.rows.map((r) => r.time_entry_id as string),
  };
}

/** Rechnungen auflisten (scoped, optional Status/Kunde). */
export async function listInvoices(
  mainAccountId: string,
  opts: { status?: string; customer_id?: string; limit: number; offset: number },
): Promise<Record<string, unknown>[]> {
  const where = ["main_account_id = $1"];
  const params: unknown[] = [mainAccountId];
  if (opts.status) {
    params.push(opts.status);
    where.push(`status = $${params.length}`);
  }
  if (opts.customer_id) {
    params.push(opts.customer_id);
    where.push(`customer_id = $${params.length}`);
  }
  params.push(opts.limit, opts.offset);
  const res = await pool.query(
    `SELECT id, invoice_number, type, status, customer_id, issue_date, currency,
            net_amount_cents, tax_amount_cents, gross_amount_cents, tax_rate, finalized_at, created_at
       FROM invoices WHERE ${where.join(" AND ")}
      ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  return res.rows;
}

/**
 * Finalisiert einen Entwurf (doc 10 §5.6): Nummer atomar vergeben, Snapshots
 * (Kunde/Projekt) neu einfrieren, Status draft → finalized, verknüpfte Einträge
 * als `invoiced` markieren. Wirft Error mit Code-präfix bei ungültigem Zustand.
 */
export async function finalizeInvoice(params: {
  mainAccountId: string;
  actor: string;
  device_id?: string | null;
  invoiceId: string;
}): Promise<{ invoice_number: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inv = await client.query(
      `SELECT id, status, customer_id, project_snapshot, payment_due_date, issue_date
         FROM invoices WHERE id = $1 AND main_account_id = $2 FOR UPDATE`,
      [params.invoiceId, params.mainAccountId],
    );
    const row = inv.rows[0];
    if (!row) throw new Error("NOT_FOUND:Rechnung nicht gefunden.");
    if (row.status !== "draft") throw new Error("CONFLICT:Nur Entwürfe können finalisiert werden.");

    const year = new Date().getUTCFullYear();
    const { number } = await allocateNumber(
      client,
      params.mainAccountId,
      sequenceKey("invoice", year),
      (seq) => formatInvoiceNumber(year, seq),
    );

    // Kunde/Projekt zum Finalisierungszeitpunkt neu einfrieren.
    const customer = await loadCustomer(params.mainAccountId, row.customer_id);
    const customerSnapshot = customer ? buildCustomerSnapshot(customer) : null;
    const projSnapId = (row.project_snapshot as { id?: string } | null)?.id;
    const project = projSnapId ? await loadProject(params.mainAccountId, projSnapId) : null;
    const projectSnapshot = buildProjectSnapshot(project);

    const now = Date.now();
    await client.query(
      `UPDATE invoices
          SET invoice_number = $1, status = 'finalized', finalized_at = $2, updated_at = $2,
              customer_snapshot = COALESCE($3::jsonb, customer_snapshot),
              project_snapshot = COALESCE($4::jsonb, project_snapshot)
        WHERE id = $5 AND main_account_id = $6`,
      [
        number,
        now,
        customerSnapshot ? JSON.stringify(customerSnapshot) : null,
        projectSnapshot ? JSON.stringify(projectSnapshot) : null,
        params.invoiceId,
        params.mainAccountId,
      ],
    );

    // Verknüpfte Einträge sperren/als fakturiert markieren (nur wenn noch frei).
    await client.query(
      `UPDATE time_entries
          SET invoice_id = $1, status = 'invoiced', updated_at = $2
        WHERE main_account_id = $3 AND invoice_id IS NULL
          AND id IN (SELECT time_entry_id FROM invoice_time_entries WHERE invoice_id = $1)`,
      [params.invoiceId, now, params.mainAccountId],
    );

    await recordAudit(client, {
      main_account_id: params.mainAccountId,
      actor_id: params.actor,
      device_id: params.device_id ?? null,
      entity_type: "invoices",
      entity_id: params.invoiceId,
      action: "invoice_finalized",
      before: { status: "draft" },
      after: { status: "finalized", invoice_number: number },
      source: "api",
    });

    await client.query("COMMIT");
    return { invoice_number: number };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Storniert eine finalisierte Rechnung über eine Gegenrechnung
 * (type=cancellation, negierte Beträge; doc 10 §5.6). Das Original bleibt
 * erhalten und wird auf `cancelled` gesetzt. Liefert die neue Storno-Rechnung.
 */
export async function cancelInvoice(params: {
  mainAccountId: string;
  actor: string;
  device_id?: string | null;
  invoiceId: string;
  reason?: string | null;
}): Promise<{ cancellation_id: string; invoice_number: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const inv = await client.query(
      `SELECT * FROM invoices WHERE id = $1 AND main_account_id = $2 FOR UPDATE`,
      [params.invoiceId, params.mainAccountId],
    );
    const orig = inv.rows[0];
    if (!orig) throw new Error("NOT_FOUND:Rechnung nicht gefunden.");
    if (orig.status !== "finalized" && orig.status !== "sent" && orig.status !== "paid") {
      throw new Error("CONFLICT:Nur finalisierte Rechnungen können storniert werden.");
    }
    if (orig.type === "cancellation") throw new Error("CONFLICT:Storno-Rechnungen können nicht storniert werden.");

    const year = new Date().getUTCFullYear();
    const { number } = await allocateNumber(
      client,
      params.mainAccountId,
      sequenceKey("invoice", year),
      (seq) => formatInvoiceNumber(year, seq),
    );

    const cancellationId = uuidv7();
    const now = Date.now();
    const issueDate = new Date(now).toISOString().slice(0, 10);

    await client.query(
      `INSERT INTO invoices
         (id, main_account_id, customer_id, invoice_number, type, status, issue_date, currency,
          net_amount_cents, tax_amount_cents, gross_amount_cents, tax_rate,
          small_business_note, reverse_charge_note,
          customer_snapshot, project_snapshot, rate_snapshot, rounding_snapshot,
          finalized_at, cancels_invoice_id, notes, created_at, updated_at, sync_version, local_revision)
       VALUES ($1,$2,$3,$4,'cancellation','finalized',$5,$6,
               $7,$8,$9,$10,
               $11,$12,
               $13::jsonb,$14::jsonb,$15::jsonb,$16::jsonb,
               $17,$18,$19,$17,$17,0,0)`,
      [
        cancellationId,
        params.mainAccountId,
        orig.customer_id,
        number,
        issueDate,
        orig.currency,
        -num(orig.net_amount_cents),
        -num(orig.tax_amount_cents),
        -num(orig.gross_amount_cents),
        String(orig.tax_rate),
        orig.small_business_note,
        orig.reverse_charge_note,
        JSON.stringify(orig.customer_snapshot),
        orig.project_snapshot ? JSON.stringify(orig.project_snapshot) : null,
        JSON.stringify(orig.rate_snapshot),
        JSON.stringify(orig.rounding_snapshot),
        now,
        params.invoiceId,
        params.reason ?? `Storno zu ${orig.invoice_number ?? params.invoiceId}`,
      ],
    );

    // Negierte Postenkopie.
    const items = await client.query(
      `SELECT kind, position, description, quantity, unit, unit_price_cents, net_amount_cents, tax_rate
         FROM invoice_items WHERE invoice_id = $1 AND main_account_id = $2 ORDER BY position ASC`,
      [params.invoiceId, params.mainAccountId],
    );
    for (const it of items.rows) {
      await client.query(
        `INSERT INTO invoice_items
           (id, main_account_id, invoice_id, kind, position, description, quantity, unit,
            unit_price_cents, net_amount_cents, tax_rate, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
        [
          uuidv7(),
          params.mainAccountId,
          cancellationId,
          it.kind,
          it.position,
          `Storno: ${it.description}`,
          String(-Number(it.quantity)),
          it.unit,
          it.unit_price_cents,
          -num(it.net_amount_cents),
          String(it.tax_rate),
          now,
        ],
      );
    }

    await client.query(`UPDATE invoices SET status = 'cancelled', updated_at = $1 WHERE id = $2 AND main_account_id = $3`, [
      now,
      params.invoiceId,
      params.mainAccountId,
    ]);

    await recordAudit(client, {
      main_account_id: params.mainAccountId,
      actor_id: params.actor,
      device_id: params.device_id ?? null,
      entity_type: "invoices",
      entity_id: params.invoiceId,
      action: "invoice_cancelled",
      before: { status: orig.status },
      after: { status: "cancelled", cancellation_id: cancellationId, cancellation_number: number },
      reason: params.reason ?? null,
      source: "api",
    });

    await client.query("COMMIT");
    return { cancellation_id: cancellationId, invoice_number: number };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

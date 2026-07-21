/**
 * app/api/invoices, Rechnungen auflisten (GET) + Entwurf erstellen (POST).
 *
 * POST erstellt eine Rechnung (status `draft`) aus abrechenbaren Zeiteinträgen
 * (per IDs oder Zeitraum + optional Projekt) und/oder freien Posten. Positionen
 * = `billing_duration_seconds × rate_snapshot` via `computeAmountCents`
 * (doc 10 §5.1 Fn 1). Steuer + §19/§13b-Hinweis aus Aussteller/Kunde
 * (doc 10 §5.3,§5.5). Keine Nummer im Entwurf, erst bei Finalisierung
 * (doc 10 §5.6).
 */
import { z } from "zod";
import { json, apiError, requireAuth, parseJson } from "@/lib/api";
import { publishEvent } from "@/lib/events";
import {
  actorId,
  buildExtraItems,
  buildHourlyItems,
  computeTotals,
  createDraftInvoice,
  loadBillableEntries,
  listInvoices,
  loadCustomer,
  loadProject,
  resolveIssuer,
  resolveTaxContext,
  type FallbackRate,
} from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const extraItemSchema = z.object({
  kind: z.enum(["flat", "discount", "expense", "travel"]),
  description: z.string().min(1),
  quantity: z.number().optional(),
  unit: z.enum(["hours", "days", "piece", "percent"]).optional(),
  unit_price_cents: z.number().int().optional(),
  net_amount_cents: z.number().int(),
});

const createSchema = z
  .object({
    customer_id: z.string().uuid(),
    project_id: z.string().uuid().optional(),
    time_entry_ids: z.array(z.string().uuid()).optional(),
    period: z.object({ from: z.number().int(), to: z.number().int() }).optional(),
    service_date: z.string().optional(),
    service_period_start: z.string().optional(),
    service_period_end: z.string().optional(),
    notes: z.string().optional(),
    extra_items: z.array(extraItemSchema).optional(),
  })
  .refine(
    (v) => (v.time_entry_ids && v.time_entry_ids.length > 0) || v.period || (v.extra_items && v.extra_items.length > 0),
    { message: "time_entry_ids, period oder extra_items erforderlich" },
  );

const INVOICE_STATUS = ["draft", "finalized", "sent", "paid", "cancelled"] as const;

/** BIGINT-Strings der Rechnungszeile → Number (API-JSON). */
function serializeInvoice(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    net_amount_cents: row.net_amount_cents == null ? null : Number(row.net_amount_cents),
    tax_amount_cents: row.tax_amount_cents == null ? null : Number(row.tax_amount_cents),
    gross_amount_cents: row.gross_amount_cents == null ? null : Number(row.gross_amount_cents),
    finalized_at: row.finalized_at == null ? null : Number(row.finalized_at),
    created_at: row.created_at == null ? null : Number(row.created_at),
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const GET = requireAuth(async (req, _ctx, auth) => {
  const sp = req.nextUrl.searchParams;
  const statusRaw = sp.get("status");
  const status = statusRaw && (INVOICE_STATUS as readonly string[]).includes(statusRaw) ? statusRaw : undefined;
  const customer_id = sp.get("customer_id") ?? undefined;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);
  const rows = await listInvoices(auth.main_account_id, { status, customer_id, limit, offset });
  return json({ invoices: rows.map(serializeInvoice), limit, offset });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const body = await parseJson(req, createSchema);
  const mainAccountId = auth.main_account_id;

  const customer = await loadCustomer(mainAccountId, body.customer_id);
  if (!customer) return apiError("not_found", "Kunde nicht gefunden.");

  const issuer = await resolveIssuer(mainAccountId);
  const currency = customer.default_currency ?? issuer.currency;
  const tax = resolveTaxContext({
    issuerSmallBusiness: issuer.small_business,
    customerReverseCharge: customer.reverse_charge_hint === true,
    customerTaxRate: Number(customer.default_tax_rate ?? "19"),
  });

  // Abrechenbare Einträge auswählen (IDs haben Vorrang vor Zeitraum).
  const entries =
    body.time_entry_ids && body.time_entry_ids.length > 0
      ? await loadBillableEntries(mainAccountId, { time_entry_ids: body.time_entry_ids })
      : body.period
        ? await loadBillableEntries(mainAccountId, {
            customer_id: body.customer_id,
            project_id: body.project_id,
            from: body.period.from,
            to: body.period.to,
          })
        : [];

  const fallbackRate: FallbackRate = {
    amount_cents: 0,
    currency,
    source: "default",
  };

  const hourly = buildHourlyItems(entries, tax.tax_rate, fallbackRate);
  const extras = body.extra_items ? buildExtraItems(body.extra_items, tax.tax_rate) : [];
  const items = [...hourly, ...extras];
  if (items.length === 0) {
    return apiError("validation_error", "Keine abrechenbaren Positionen gefunden.");
  }

  const totals = computeTotals(items);
  const project = body.project_id ? await loadProject(mainAccountId, body.project_id) : null;

  const issueDate = todayIso();
  const paymentDueDate =
    customer.payment_term_days != null
      ? new Date(Date.now() + customer.payment_term_days * 86_400_000).toISOString().slice(0, 10)
      : null;

  const invoiceId = await createDraftInvoice({
    mainAccountId,
    actor: actorId(auth),
    device_id: auth.device_id ?? null,
    customer,
    project,
    entries,
    items,
    totals,
    tax,
    currency,
    issueDate,
    serviceDate: body.service_date ?? null,
    servicePeriodStart: body.service_period_start ?? null,
    servicePeriodEnd: body.service_period_end ?? null,
    paymentDueDate,
    notes: body.notes ?? null,
  });

  // Live-Event nur bei echtem Gerät (sync_events.device_id → devices FK).
  if (auth.device_id) {
    await publishEvent({
      type: "invoice.created",
      main_account_id: mainAccountId,
      device_id: auth.device_id,
      entity_type: "invoices",
      entity_id: invoiceId,
      operation: "create",
      data: { invoice_id: invoiceId, status: "draft", gross_amount_cents: totals.gross_cents },
    });
  }

  return json(
    {
      id: invoiceId,
      status: "draft",
      currency,
      tax_treatment: tax.treatment,
      item_count: items.length,
      entry_count: entries.length,
      totals,
    },
    { status: 201 },
  );
});

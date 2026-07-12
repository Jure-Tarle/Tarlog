/**
 * /api/customers/[id] — Detail, Ändern (mit Audit), Soft-Delete
 * (doc 06 §A.2 `customers`).
 *
 * GET    : einzelner Kunde (gescoped, nicht soft-gelöscht) → 404 sonst.
 * PATCH  : partielles Update. Audit-Pflicht bei Satz-/Steuer-Änderung → schreibt
 *          `rate_changed` bzw. bei Standard-Rundungsregel `rounding_rule_changed`
 *          (doc 06 customers-Meta). Update + Audit laufen in EINER Transaktion.
 * DELETE : Soft-Delete (`deleted_at`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  mapDbError,
  notFound,
  numericToString,
  resolveActor,
} from "@/lib/crud/http";
import { customerUpdateSchema, type CustomerUpdate } from "@/lib/crud/schemas";
import { writeAudit } from "@/lib/crud/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IdCtx = { params: Promise<{ id: string }> };
type CustomerRow = typeof schema.customers.$inferSelect;
type CustomerSet = Partial<typeof schema.customers.$inferInsert>;

function scoped(id: string, mainAccountId: string) {
  return and(
    eq(schema.customers.id, id),
    eq(schema.customers.main_account_id, mainAccountId),
    isNull(schema.customers.deleted_at),
  );
}

export const GET = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const [row] = await db
    .select()
    .from(schema.customers)
    .where(scoped(id, auth.main_account_id))
    .limit(1);
  if (!row) throw notFound("Kunde");
  return json({ data: row });
});

/** Baut das partielle Update-Set aus den bereitgestellten Feldern. */
function buildSet(input: CustomerUpdate, now: number): CustomerSet {
  const set: CustomerSet = { updated_at: now };
  if (input.name !== undefined) set.name = input.name;
  if (input.company !== undefined) set.company = input.company ?? null;
  if (input.contact_person !== undefined)
    set.contact_person = input.contact_person ?? null;
  if (input.email !== undefined) set.email = input.email ?? null;
  if (input.phone !== undefined) set.phone = input.phone ?? null;
  if (input.billing_address !== undefined)
    set.billing_address = input.billing_address ?? null;
  if (input.shipping_address !== undefined)
    set.shipping_address = input.shipping_address ?? null;
  if (input.vat_id !== undefined) set.vat_id = input.vat_id ?? null;
  if (input.customer_number !== undefined)
    set.customer_number = input.customer_number ?? null;
  if (input.payment_term_days !== undefined)
    set.payment_term_days = input.payment_term_days;
  if (input.default_currency !== undefined)
    set.default_currency = input.default_currency;
  if (input.default_hourly_rate_cents !== undefined)
    set.default_hourly_rate_cents = input.default_hourly_rate_cents ?? null;
  if (input.default_day_rate_cents !== undefined)
    set.default_day_rate_cents = input.default_day_rate_cents ?? null;
  if (input.default_rounding_rule_id !== undefined)
    set.default_rounding_rule_id = input.default_rounding_rule_id ?? null;
  if (input.default_invoice_note !== undefined)
    set.default_invoice_note = input.default_invoice_note ?? null;
  if (input.default_language !== undefined)
    set.default_language = input.default_language ?? null;
  if (input.internal_notes !== undefined)
    set.internal_notes = input.internal_notes ?? null;
  if (input.external_notes !== undefined)
    set.external_notes = input.external_notes ?? null;
  if (input.status !== undefined) set.status = input.status;
  if (input.default_tax_rate !== undefined)
    set.default_tax_rate = numericToString(input.default_tax_rate);
  if (input.reverse_charge_hint !== undefined)
    set.reverse_charge_hint = input.reverse_charge_hint;
  if (input.small_business_hint !== undefined)
    set.small_business_hint = input.small_business_hint;
  if (input.preferred_export_detail !== undefined)
    set.preferred_export_detail = input.preferred_export_detail;
  return set;
}

/** True, wenn ein abrechnungsrelevanter Satz/Steuersatz tatsächlich geändert wird. */
function rateChanged(input: CustomerUpdate, before: CustomerRow): boolean {
  if (
    input.default_hourly_rate_cents !== undefined &&
    (input.default_hourly_rate_cents ?? null) !== before.default_hourly_rate_cents
  )
    return true;
  if (
    input.default_day_rate_cents !== undefined &&
    (input.default_day_rate_cents ?? null) !== before.default_day_rate_cents
  )
    return true;
  if (
    input.default_tax_rate !== undefined &&
    (before.default_tax_rate == null ||
      Number(before.default_tax_rate) !== input.default_tax_rate)
  )
    return true;
  return false;
}

export const PATCH = requireAuth<IdCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  const input = await parseJson(req, customerUpdateSchema);
  const actor = resolveActor(auth);
  const now = Date.now();

  try {
    const updated = await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(schema.customers)
        .where(scoped(id, auth.main_account_id))
        .limit(1);
      if (!before) throw notFound("Kunde");

      const doRate = rateChanged(input, before);
      const doRounding =
        input.default_rounding_rule_id !== undefined &&
        (input.default_rounding_rule_id ?? null) !==
          before.default_rounding_rule_id;

      const [row] = await tx
        .update(schema.customers)
        .set(buildSet(input, now))
        .where(scoped(id, auth.main_account_id))
        .returning();
      if (!row) throw notFound("Kunde");

      if (doRate)
        await writeAudit(tx, {
          actor_id: actor.actor_id,
          main_account_id: auth.main_account_id,
          device_id: actor.device_id,
          entity_type: "customers",
          entity_id: id,
          action: "rate_changed",
          before_json: before as Record<string, unknown>,
          after_json: row as Record<string, unknown>,
          source: "api",
        });
      if (doRounding)
        await writeAudit(tx, {
          actor_id: actor.actor_id,
          main_account_id: auth.main_account_id,
          device_id: actor.device_id,
          entity_type: "customers",
          entity_id: id,
          action: "rounding_rule_changed",
          before_json: before as Record<string, unknown>,
          after_json: row as Record<string, unknown>,
          source: "api",
        });
      return row;
    });
    return json({ data: updated });
  } catch (err) {
    mapDbError(err);
  }
});

export const DELETE = requireAuth<IdCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const now = Date.now();
  const [row] = await db
    .update(schema.customers)
    .set({ deleted_at: now, updated_at: now })
    .where(scoped(id, auth.main_account_id))
    .returning();
  if (!row) throw notFound("Kunde");
  return json({ data: { id, deleted_at: now } });
});

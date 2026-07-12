/**
 * /api/customers — Liste + Anlegen (doc 06 §A.2 `customers`, doc 10 §1).
 *
 * GET  : paginierte, `main_account`-gescopte Liste; Filter `status`, `q`
 *        (Name/Firma), `include_deleted`. Standard: nur `deleted_at IS NULL`.
 * POST : legt einen Kunden an (Server vergibt `id`; `main_account_id` aus Auth).
 *        Kein Audit bei Anlage (doc 06: Audit-Pflicht nur bei Satz-/Steuer-
 *        ÄNDERUNG — siehe PATCH in [id]/route.ts).
 */
import { and, eq, ilike, isNull, or, type SQL } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import { json, parseJson, requireAuth } from "@/lib/api";
import { db, schema } from "@/lib/db";
import {
  countRows, parseListQuery,
  numericToString,
  orderByCreatedAt,
  pageMeta,
  mapDbError,
} from "@/lib/crud/http";
import { customerCreateSchema, customerQuerySchema } from "@/lib/crud/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const q = parseListQuery(req, customerQuerySchema);
  const conds: SQL[] = [
    eq(schema.customers.main_account_id, auth.main_account_id),
  ];
  if (!q.include_deleted) conds.push(isNull(schema.customers.deleted_at));
  if (q.status) conds.push(eq(schema.customers.status, q.status));
  if (q.q) {
    const term = `%${q.q}%`;
    const search = or(
      ilike(schema.customers.name, term),
      ilike(schema.customers.company, term),
    );
    if (search) conds.push(search);
  }

  const rows = await db
    .select()
    .from(schema.customers)
    .where(and(...conds))
    .orderBy(orderByCreatedAt(schema.customers.created_at, q.order))
    .limit(q.limit)
    .offset(q.offset);
  const total = await countRows(schema.customers, conds);

  return json({ data: rows, pagination: pageMeta(q, total) });
});

export const POST = requireAuth(async (req, _ctx, auth) => {
  const input = await parseJson(req, customerCreateSchema);
  const now = Date.now();
  try {
    const [row] = await db
      .insert(schema.customers)
      .values({
        id: uuidv7(),
        main_account_id: auth.main_account_id,
        name: input.name,
        company: input.company ?? null,
        contact_person: input.contact_person ?? null,
        email: input.email ?? null,
        phone: input.phone ?? null,
        billing_address: input.billing_address ?? null,
        shipping_address: input.shipping_address ?? null,
        vat_id: input.vat_id ?? null,
        customer_number: input.customer_number ?? null,
        payment_term_days: input.payment_term_days,
        default_currency: input.default_currency,
        default_hourly_rate_cents: input.default_hourly_rate_cents ?? null,
        default_day_rate_cents: input.default_day_rate_cents ?? null,
        default_rounding_rule_id: input.default_rounding_rule_id ?? null,
        default_invoice_note: input.default_invoice_note ?? null,
        default_language: input.default_language ?? null,
        internal_notes: input.internal_notes ?? null,
        external_notes: input.external_notes ?? null,
        status: input.status,
        default_tax_rate: numericToString(input.default_tax_rate),
        reverse_charge_hint: input.reverse_charge_hint,
        small_business_hint: input.small_business_hint,
        preferred_export_detail: input.preferred_export_detail,
        created_at: now,
        updated_at: now,
      })
      .returning();
    return json({ data: row }, { status: 201 });
  } catch (err) {
    mapDbError(err);
  }
});

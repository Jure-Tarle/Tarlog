/**
 * customers.ts — customer CRUD (doc 06 A.2 `customers`). Inserts go through the
 * `create_customer` bridge command (Rust owns the write + `main_account_id`);
 * reads use the `list_customers` bridge command; updates/soft-deletes are local
 * SQL (no bridge command exists for them). Validation via @tarlog/core
 * `customerSchema`.
 */
import { createCustomer as bridgeCreate, listCustomers as bridgeList } from "../lib/bridge";
import { execute, select } from "../lib/db";
import { getContext, now } from "./context";
import { writeAudit } from "./audit";
import { notifyChange } from "./backup";
import { uuidv7 } from "uuidv7";
import { customerSchema, type CustomerInput, type Uuid } from "@tarlog/core";

export type CustomerRow = CustomerInput;

/** Draft for {@link createCustomer} — id/main_account_id are filled here. */
export type CustomerDraft = Omit<Partial<CustomerInput>, "main_account_id"> & {
  name: string;
};

/** Columns a client may patch via {@link updateCustomer}. */
const PATCHABLE = new Set<keyof CustomerInput>([
  "name",
  "company",
  "contact_person",
  "email",
  "phone",
  "vat_id",
  "customer_number",
  "payment_term_days",
  "default_currency",
  "default_hourly_rate_cents",
  "default_day_rate_cents",
  "default_rounding_rule_id",
  "default_tax_rate",
  "reverse_charge_hint",
  "small_business_hint",
  "preferred_export_detail",
  "status",
]);

/** List customers, optional status filter (via the bridge command). */
export function listCustomers(status?: string | null): Promise<CustomerRow[]> {
  return bridgeList({ status: status ?? null });
}

/** One customer by id, or null (local read). */
export async function getCustomer(id: Uuid): Promise<CustomerRow | null> {
  const ctx = await getContext();
  const rows = await select<CustomerRow>(
    `SELECT * FROM customers WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [id, ctx.mainAccountId],
  );
  return rows[0] ?? null;
}

/** Create a customer: validate → `create_customer` → audit → backup trigger. */
export async function createCustomer(draft: CustomerDraft): Promise<CustomerRow> {
  const ctx = await getContext();
  const input: CustomerInput = customerSchema.parse({
    ...draft,
    id: draft.id ?? uuidv7(),
    main_account_id: ctx.mainAccountId,
  });
  const row = await bridgeCreate(input);
  await writeAudit({
    action: "entry_updated",
    entity_type: "customer",
    entity_id: input.id,
    after: input as unknown as Record<string, unknown>,
  });
  await notifyChange();
  return row;
}

/** Patch a customer's whitelisted columns (local SQL). Returns the fresh row. */
export async function updateCustomer(
  id: Uuid,
  patch: Partial<CustomerInput>,
): Promise<CustomerRow> {
  const before = await getCustomer(id);
  if (!before) throw new Error(`updateCustomer: Kunde ${id} nicht gefunden`);
  await applyPatch("customers", id, patch, PATCHABLE);
  const after = await getCustomer(id);
  await writeAudit({
    action: "entry_updated",
    entity_type: "customer",
    entity_id: id,
    before: before as unknown as Record<string, unknown>,
    after: after as unknown as Record<string, unknown>,
  });
  await notifyChange();
  return after!;
}

/** Soft-delete (archive) a customer: set `deleted_at` + status archived. */
export async function archiveCustomer(id: Uuid): Promise<void> {
  const ctx = await getContext();
  const ts = now();
  await execute(
    `UPDATE customers SET deleted_at = $1, status = 'archived', updated_at = $2
      WHERE id = $3 AND main_account_id = $4`,
    [ts, ts, id, ctx.mainAccountId],
  );
  await writeAudit({ action: "entry_deleted", entity_type: "customer", entity_id: id });
  await notifyChange();
}

/**
 * Build + run a dynamic UPDATE from a whitelisted patch. Shared by the CRUD
 * modules. Booleans are stored as 0/1 (SQLite `{ mode: "boolean" }`).
 */
export async function applyPatch<T extends Record<string, unknown>>(
  table: string,
  id: Uuid,
  patch: Partial<T>,
  allowed: ReadonlySet<keyof T>,
): Promise<void> {
  const ctx = await getContext();
  const cols: string[] = [];
  const vals: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (!allowed.has(key as keyof T)) continue;
    cols.push(`${key} = $${cols.length + 1}`);
    vals.push(typeof value === "boolean" ? (value ? 1 : 0) : value);
  }
  if (cols.length === 0) return;
  cols.push(`updated_at = $${cols.length + 1}`);
  vals.push(now());
  const idParam = `$${vals.length + 1}`;
  const accParam = `$${vals.length + 2}`;
  vals.push(id, ctx.mainAccountId);
  await execute(
    `UPDATE ${table} SET ${cols.join(", ")} WHERE id = ${idParam} AND main_account_id = ${accParam}`,
    vals,
  );
}

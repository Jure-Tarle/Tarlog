/**
 * app/api/invoices/[id] — einzelne Rechnung mit Posten + verknüpften Einträgen
 * (doc 10 §5). Read-only; Mutationen laufen über /finalize bzw. /cancel.
 */
import { apiError, json, requireAuth } from "@/lib/api";
import { getInvoiceWithItems } from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

function serializeInvoice(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    net_amount_cents: row.net_amount_cents == null ? null : Number(row.net_amount_cents),
    tax_amount_cents: row.tax_amount_cents == null ? null : Number(row.tax_amount_cents),
    gross_amount_cents: row.gross_amount_cents == null ? null : Number(row.gross_amount_cents),
    tax_rate: row.tax_rate == null ? null : Number(row.tax_rate),
    finalized_at: row.finalized_at == null ? null : Number(row.finalized_at),
    created_at: row.created_at == null ? null : Number(row.created_at),
    updated_at: row.updated_at == null ? null : Number(row.updated_at),
  };
}

function serializeItem(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    quantity: row.quantity == null ? null : Number(row.quantity),
    unit_price_cents: row.unit_price_cents == null ? null : Number(row.unit_price_cents),
    net_amount_cents: row.net_amount_cents == null ? null : Number(row.net_amount_cents),
    tax_rate: row.tax_rate == null ? null : Number(row.tax_rate),
  };
}

export const GET = requireAuth<RouteCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  const data = await getInvoiceWithItems(auth.main_account_id, id);
  if (!data) return apiError("not_found", "Rechnung nicht gefunden.");
  return json({
    invoice: serializeInvoice(data.invoice),
    items: data.items.map(serializeItem),
    time_entry_ids: data.time_entry_ids,
  });
});

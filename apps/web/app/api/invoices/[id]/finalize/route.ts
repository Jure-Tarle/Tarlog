/**
 * app/api/invoices/[id]/finalize — Entwurf finalisieren (doc 10 §5.6).
 *
 * draft → finalized: fortlaufende Nummer atomar vergeben, Snapshots einfrieren,
 * verknüpfte Einträge als fakturiert sperren (Immutability). Audit
 * `invoice_finalized`. Nicht-Entwürfe → 409.
 */
import { apiError, json, requireAuth } from "@/lib/api";
import { publishEvent } from "@/lib/events";
import { actorId, finalizeInvoice } from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export const POST = requireAuth<RouteCtx>(async (_req, ctx, auth) => {
  const { id } = await ctx.params;
  let result: { invoice_number: string };
  try {
    result = await finalizeInvoice({
      mainAccountId: auth.main_account_id,
      actor: actorId(auth),
      device_id: auth.device_id ?? null,
      invoiceId: id,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("NOT_FOUND:")) return apiError("not_found", msg.slice("NOT_FOUND:".length));
    if (msg.startsWith("CONFLICT:")) return apiError("conflict", msg.slice("CONFLICT:".length));
    throw err;
  }

  if (auth.device_id) {
    await publishEvent({
      type: "invoice.created",
      main_account_id: auth.main_account_id,
      device_id: auth.device_id,
      entity_type: "invoices",
      entity_id: id,
      operation: "update",
      data: { invoice_id: id, status: "finalized", invoice_number: result.invoice_number },
    });
  }

  return json({ id, status: "finalized", invoice_number: result.invoice_number });
});

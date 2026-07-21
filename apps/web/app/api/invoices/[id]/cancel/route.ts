/**
 * app/api/invoices/[id]/cancel, finalisierte Rechnung stornieren (doc 10 §5.6).
 *
 * Erzeugt eine Storno-Rechnung (type=cancellation, cancels_invoice_id, negierte
 * Beträge/Posten), setzt das Original auf `cancelled`. Das Original wird nie
 * gelöscht (revisionsfähig). Audit `invoice_cancelled`.
 */
import { z } from "zod";
import { apiError, json, parseJson, requireAuth } from "@/lib/api";
import { publishEvent } from "@/lib/events";
import { actorId, cancelInvoice } from "@/lib/invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

const cancelSchema = z.object({ reason: z.string().optional() });

export const POST = requireAuth<RouteCtx>(async (req, ctx, auth) => {
  const { id } = await ctx.params;
  // Body ist optional; leerer Body → kein Grund.
  let reason: string | undefined;
  try {
    const body = await parseJson(req, cancelSchema);
    reason = body.reason;
  } catch {
    reason = undefined;
  }

  let result: { cancellation_id: string; invoice_number: string };
  try {
    result = await cancelInvoice({
      mainAccountId: auth.main_account_id,
      actor: actorId(auth),
      device_id: auth.device_id ?? null,
      invoiceId: id,
      reason: reason ?? null,
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
      entity_id: result.cancellation_id,
      operation: "create",
      data: { cancels_invoice_id: id, cancellation_id: result.cancellation_id, invoice_number: result.invoice_number },
    });
  }

  return json(
    { id, status: "cancelled", cancellation_id: result.cancellation_id, cancellation_number: result.invoice_number },
    { status: 201 },
  );
});

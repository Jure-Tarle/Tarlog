/**
 * app/api/exports/json — verlustfreier JSON-Komplettexport (doc 10 §6.1
 * Format JSON; doc 09 Art. 20 Datenportabilität, doc 12 Testfall 36).
 * Exportiert alle account-gescopeten Domänendaten (ohne Geheimnisse),
 * maschinenlesbar und wieder importierbar. Erzeugt einen exports-Eintrag.
 */
import { requireAuth } from "@/lib/api";
import { actorId } from "@/lib/invoice";
import { allocateExportNumber, dumpAccount, recordExport, sha256Hex } from "../_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (_req, _ctx, auth) => {
  const data = await dumpAccount(auth.main_account_id, { includeAudit: true });

  const payload = {
    schema: "ptl.dsgvo-export",
    schema_version: 1,
    exported_at: Date.now(),
    main_account_id: auth.main_account_id,
    data,
  };
  const jsonText = JSON.stringify(payload);
  const checksum = sha256Hex(jsonText);

  const exportNumber = await allocateExportNumber(auth.main_account_id);
  await recordExport({
    mainAccountId: auth.main_account_id,
    actor: actorId(auth),
    device_id: auth.device_id ?? null,
    export_number: exportNumber,
    format: "json",
    variant: null,
    filter: { scope: "full_account", dsgvo: true },
    timezone: "UTC",
    filename: `${exportNumber}.json`,
    mime_type: "application/json; charset=utf-8",
    size_bytes: Buffer.byteLength(jsonText, "utf8"),
    checksum,
  });

  return new Response(jsonText, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${exportNumber}.json"`,
      "cache-control": "no-store",
    },
  });
});

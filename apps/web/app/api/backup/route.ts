/**
 * app/api/backup — authentifizierter JSON-Vollexport (doc 12 §1 Nr. 9, Server-
 * Modus). Liefert eine konsistente, account-gescopete Kopie aller Domänendaten
 * (ohne Geheimnisse) und protokolliert sie in `backups` (kind=manual,
 * target=server_pg, integrity_status=ok) mit SHA-256-Prüfsumme.
 */
import { uuidv7 } from "uuidv7";
import { requireAuth } from "@/lib/api";
import { pool } from "@/lib/db";
import { dumpAccount, sha256Hex } from "../exports/_shared.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (_req, _ctx, auth) => {
  const data = await dumpAccount(auth.main_account_id, { includeAudit: true });

  const payload = {
    schema: "ptl.backup",
    schema_version: 1,
    created_at: Date.now(),
    main_account_id: auth.main_account_id,
    data,
  };
  const jsonText = JSON.stringify(payload);
  const size = Buffer.byteLength(jsonText, "utf8");
  const checksum = sha256Hex(jsonText);
  const now = Date.now();

  await pool.query(
    `INSERT INTO backups
       (id, main_account_id, kind, target, storage_path, size_bytes, encrypted, checksum_sha256,
        integrity_status, created_at)
     VALUES ($1,$2,'manual','server_pg','inline:stream',$3,false,$4,'ok',$5)`,
    [uuidv7(), auth.main_account_id, size, checksum, now],
  );

  const filename = `backup-${new Date(now).toISOString().slice(0, 10)}-${checksum.slice(0, 8)}.json`;
  return new Response(jsonText, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
});

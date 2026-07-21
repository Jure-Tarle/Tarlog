/**
 * app/api/exports, Exporthistorie (doc 10 §7.1 Report 20). Listet erzeugte
 * Exporte inkl. Dateimetadaten (scoped). GET mit limit/offset.
 */
import { json, requireAuth } from "@/lib/api";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = requireAuth(async (req, _ctx, auth) => {
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 50));
  const offset = Math.max(0, Number(sp.get("offset")) || 0);

  const res = await pool.query(
    `SELECT e.id, e.export_number, e.format, e.variant, e.period_start, e.period_end,
            e.timezone, e.checksum, e.created_at,
            f.filename, f.mime_type, f.size_bytes, f.checksum_sha256
       FROM exports e
       LEFT JOIN export_files f ON f.export_id = e.id
      WHERE e.main_account_id = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3`,
    [auth.main_account_id, limit, offset],
  );

  const exports = res.rows.map((r) => ({
    ...r,
    size_bytes: r.size_bytes == null ? null : Number(r.size_bytes),
    created_at: r.created_at == null ? null : Number(r.created_at),
  }));

  return json({ exports, limit, offset });
});

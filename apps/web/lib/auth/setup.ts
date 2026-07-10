/**
 * lib/auth/setup.ts — Erststart-/Main-Account-Zustand (doc 02 §4, doc 05 §9.3).
 *
 * Genau EIN main_account darf existieren (Single-Person-Produkt). Diese Helfer
 * lesen den Zustand; die eigentliche Anlage (transaktional + Advisory-Lock)
 * macht `POST /api/auth/setup`.
 */
import { pool } from "@/lib/db";

/** `true`, sobald der eine main_account existiert (Setup abgeschlossen). */
export async function isSetupComplete(): Promise<boolean> {
  const res = await pool.query<{ count: number }>(
    "SELECT COUNT(*)::int AS count FROM main_accounts",
  );
  return (res.rows[0]?.count ?? 0) > 0;
}

export interface PrimaryMainAccount {
  id: string;
  email: string | null;
  password_hash: string | null;
}

/**
 * Liefert den (einzigen) main_account für den Login. Optional per E-Mail
 * gefiltert; ohne Filter der zuerst angelegte.
 */
export async function getPrimaryMainAccount(
  email?: string,
): Promise<PrimaryMainAccount | null> {
  const res = email
    ? await pool.query<PrimaryMainAccount>(
        `SELECT id, email, password_hash FROM main_accounts
          WHERE email = $1 LIMIT 1`,
        [email],
      )
    : await pool.query<PrimaryMainAccount>(
        `SELECT id, email, password_hash FROM main_accounts
          ORDER BY created_at ASC LIMIT 1`,
      );
  return res.rows[0] ?? null;
}

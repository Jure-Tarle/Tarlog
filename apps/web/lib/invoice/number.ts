/**
 * lib/invoice/number.ts — fortlaufende, lückenlose Nummernkreise (doc 10 §5.6).
 *
 * Rechnungsnummern RE-{JAHR}-{NNNN} werden ATOMAR erst bei Finalisierung
 * vergeben (Entwürfe haben keine finale Nummer) — so bleibt die Folge lückenlos,
 * auch bei verworfenen Entwürfen. Der Zähler liegt in `settings`
 * (scope=account, key je Kreis). Konkurrierende Vergaben werden über einen
 * transaktionalen Advisory-Lock (`pg_advisory_xact_lock`) serialisiert; der Lock
 * fällt bei COMMIT/ROLLBACK automatisch. Nur innerhalb einer offenen
 * Transaktion (BEGIN … COMMIT) aufrufen.
 */
import { uuidv7 } from "uuidv7";
import type { PoolClient } from "pg";

/** Rechnungsnummer, z. B. RE-2026-0001. */
export function formatInvoiceNumber(year: number, seq: number, prefix = "RE"): string {
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

/** Exportnummer, z. B. EX-2026-0001. */
export function formatExportNumber(year: number, seq: number): string {
  return `EX-${year}-${String(seq).padStart(4, "0")}`;
}

/** settings-Key eines Jahres-Nummernkreises. */
export function sequenceKey(kind: string, year: number): string {
  return `number_sequence:${kind}:${year}`;
}

/**
 * Vergibt die nächste Sequenznummer für (main_account, key) und liefert die
 * formatierte Nummer. MUSS in einer laufenden Transaktion aufgerufen werden.
 */
export async function allocateNumber(
  client: PoolClient,
  mainAccountId: string,
  key: string,
  format: (seq: number) => string,
): Promise<{ number: string; seq: number }> {
  // Serialisiert die Zuteilung je (Account,Key) für die gesamte Transaktion.
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${mainAccountId}:${key}`]);

  const sel = await client.query(
    `SELECT id, value_json FROM settings
      WHERE main_account_id = $1 AND scope = 'account' AND device_id IS NULL AND key = $2
      LIMIT 1`,
    [mainAccountId, key],
  );

  const now = Date.now();
  let current = 0;
  let rowId: string | undefined;
  if (sel.rows.length > 0) {
    const row = sel.rows[0] as { id: string; value_json: { current?: number } | null };
    rowId = row.id;
    current = typeof row.value_json?.current === "number" ? row.value_json.current : 0;
  }

  const seq = current + 1;
  const number = format(seq);
  const valueJson = JSON.stringify({ current: seq, updated_at: now });

  if (rowId) {
    await client.query(`UPDATE settings SET value_json = $1::jsonb, updated_at = $2 WHERE id = $3`, [
      valueJson,
      now,
      rowId,
    ]);
  } else {
    await client.query(
      `INSERT INTO settings
         (id, main_account_id, scope, device_id, key, value_json, created_at, updated_at, sync_version, local_revision)
       VALUES ($1, $2, 'account', NULL, $3, $4::jsonb, $5, $5, 0, 0)`,
      [uuidv7(), mainAccountId, key, valueJson, now],
    );
  }

  return { number, seq };
}

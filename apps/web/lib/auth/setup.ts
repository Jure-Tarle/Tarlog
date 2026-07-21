/**
 * lib/auth/setup.ts, Erststart-/Main-Account-Zustand (doc 02 §4, doc 05 §9.3).
 *
 * Genau EIN main_account darf existieren (Single-Person-Produkt). Diese Helfer
 * lesen den Zustand; die eigentliche Anlage (transaktional + Advisory-Lock)
 * macht `POST /api/auth/setup`.
 */
import { pool } from "@/lib/db";
import type { PoolClient } from "pg";
import { uuidv7 } from "uuidv7";
import { APP_VERSION } from "@/lib/version";

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

/**
 * Löst innerhalb einer bestehenden Transaktion das browserindividuelle Gerät
 * auf. Nur die bevorzugte Cookie-ID darf wiederverwendet werden; ohne gültigen
 * Treffer entsteht ein neues Web-Gerät samt Local Profile. So teilen sich zwei
 * Browser niemals versehentlich dieselbe `device_id`.
 */
export async function resolveActiveWebDevice(
  client: PoolClient,
  mainAccountId: string,
  preferredDeviceId?: string | null,
  options: { now?: number; createId?: () => string } = {},
): Promise<string> {
  const now = options.now ?? Date.now();
  const createId = options.createId ?? uuidv7;

  if (preferredDeviceId) {
    const existing = await client.query<{ id: string }>(
      `SELECT id
         FROM devices
        WHERE id = $1
          AND main_account_id = $2
          AND platform = 'web'
          AND revoked IS NOT TRUE
          AND deleted_at IS NULL
        LIMIT 1
        FOR UPDATE`,
      [preferredDeviceId, mainAccountId],
    );
    const existingId = existing.rows[0]?.id;
    if (existingId) {
      await client.query(
        `UPDATE devices
            SET server_connected = TRUE,
                permission_status = 'active',
                sync_status = 'synced',
                app_version = $1,
                updated_at = $2
          WHERE id = $3 AND main_account_id = $4`,
        [APP_VERSION, now, existingId, mainAccountId],
      );
      return existingId;
    }
  }

  const deviceId = createId();
  const localProfileId = createId();
  await client.query(
    `INSERT INTO devices
       (id, main_account_id, device_name, platform, app_version,
        sync_status, local_db_version, server_connected, permission_status,
        revoked, connected_at, created_at, updated_at)
     VALUES ($1,$2,'Web-Browser','web',$3,'synced',1,TRUE,'active',FALSE,$4,$4,$4)`,
    [deviceId, mainAccountId, APP_VERSION, now],
  );
  await client.query(
    `INSERT INTO local_profiles
       (id, main_account_id, device_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$4)`,
    [localProfileId, mainAccountId, deviceId, now],
  );
  return deviceId;
}

/**
 * Transaktionale Fassade für den Login. Der Account-Lock hält Geräteanlage und
 * Profilanlage zusammen; widerrufene/gelöschte Cookie-Geräte werden ersetzt.
 */
export async function getOrCreateActiveWebDevice(
  mainAccountId: string,
  preferredDeviceId?: string | null,
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `tarlog:web-device:${mainAccountId}`,
    ]);
    const id = await resolveActiveWebDevice(
      client,
      mainAccountId,
      preferredDeviceId,
    );
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

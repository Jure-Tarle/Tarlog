/**
 * lib/auth/pairing.ts, kurzlebige Geräte-Pairing-Codes (doc 05 §9.3 Schritt 3).
 *
 * Ablauf: Admin (authentifiziert im Browser) erzeugt einen kurzen Code. Das NEUE
 * Gerät (noch ohne Token) sendet den Code an `POST /api/devices/connect` und
 * erhält einmalig ein Device-Token. Der Code ist einmal verwendbar und läuft
 * schnell ab.
 *
 * Speicherung BEWUSST nur In-Memory (globalThis-gecacht): nur der SHA-256-Hash
 * des Codes wird gehalten, nie der Klartext. Prozess-lokal wie das Rate-Limiting
 * (Single-Node-Self-Host). Übersteht keinen Neustart / keine Mehr-Instanz ,
 * offener Punkt für einen späteren persistenten Store.
 */
import { createHash, randomInt } from "node:crypto";

/** Alphabet ohne mehrdeutige Zeichen (kein 0/O/1/I), gut abtippbar. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LEN = 8;
const DEFAULT_TTL_SECONDS = 600; // 10 min

interface PairingEntry {
  main_account_id: string;
  device_name?: string;
  expires_at: number;
}

const g = globalThis as unknown as {
  __ptlPairing?: Map<string, PairingEntry>;
};
const store = g.__ptlPairing ?? new Map<string, PairingEntry>();
g.__ptlPairing = store;

/** Normalisiert Nutzereingabe (Bindestriche/Leerzeichen egal, Groß/Klein egal). */
function normalize(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function hash(codeNormalized: string): string {
  return createHash("sha256").update(codeNormalized).digest("hex");
}

/** Entfernt abgelaufene Einträge (Lazy-GC bei jeder Operation). */
function prune(now: number): void {
  for (const [k, v] of store) {
    if (v.expires_at <= now) store.delete(k);
  }
}

function randomCode(): string {
  let out = "";
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

export interface CreatedPairingCode {
  /** Anzeige-Code, in 4er-Gruppen (z. B. `ABCD-EF23`). NUR jetzt sichtbar. */
  code: string;
  expires_at: number;
  ttl_seconds: number;
}

/** Erzeugt einen neuen Pairing-Code für einen main_account. */
export function createPairingCode(
  mainAccountId: string,
  opts?: { deviceName?: string; ttlSeconds?: number },
): CreatedPairingCode {
  const now = Date.now();
  prune(now);
  const ttl = Math.min(Math.max(opts?.ttlSeconds ?? DEFAULT_TTL_SECONDS, 60), 3600);
  const raw = randomCode();
  const expiresAt = now + ttl * 1000;
  store.set(hash(raw), {
    main_account_id: mainAccountId,
    device_name: opts?.deviceName,
    expires_at: expiresAt,
  });
  const display = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  return { code: display, expires_at: expiresAt, ttl_seconds: ttl };
}

/**
 * Prüft + VERBRAUCHT einen Code (einmalig). Liefert den gebundenen
 * main_account_id-Kontext oder `null` bei ungültig/abgelaufen.
 */
export function consumePairingCode(code: string): PairingEntry | null {
  const now = Date.now();
  prune(now);
  const key = hash(normalize(code));
  const entry = store.get(key);
  if (!entry) return null;
  store.delete(key); // Single-Use.
  if (entry.expires_at <= now) return null;
  return entry;
}

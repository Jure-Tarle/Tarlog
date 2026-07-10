/**
 * lib/auth/ratelimit.ts — leichtgewichtiges In-Memory-Rate-Limiting
 * (doc 09 §5 Nr. 15 — Brute-Force-/Flooding-Schutz auf Auth-Endpunkten).
 *
 * Fixed-Window pro Schlüssel (z. B. IP). BEWUSST prozess-lokal: für den
 * Single-Node-Self-Host-Betrieb (server.mjs = ein Prozess) ausreichend. Bei
 * horizontaler Skalierung gehört das hinter Redis (offener Punkt). Über
 * globalThis gecacht, damit Next-HMR den Zähler nicht bei jedem Reload verwirft.
 */
interface Window {
  count: number;
  resetAt: number;
}

const g = globalThis as unknown as { __ptlRateLimit?: Map<string, Window> };
const buckets = g.__ptlRateLimit ?? new Map<string, Window>();
g.__ptlRateLimit = buckets;

/**
 * Verbraucht ein Kontingent für `key`. Liefert `true`, wenn der Request
 * innerhalb des Limits liegt, sonst `false` (→ Aufrufer wirft `rate_limited`).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= limit) return false;
  existing.count += 1;
  return true;
}

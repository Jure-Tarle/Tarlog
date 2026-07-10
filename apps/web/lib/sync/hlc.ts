/**
 * lib/sync/hlc.ts — Hybrid Logical Clock (doc 04 §1.1).
 *
 * HLC = (physical_ms, logical_counter, node). Monoton auch bei rückspringender
 * Wall-Clock; liefert eine total geordnete, geräteübergreifend vergleichbare
 * Marke für Feld-Level-LWW und Konflikterkennung (doc 04 §6). Der Server ist
 * Vertrauensanker: er `receive`t eingehende Geräte-HLCs (Uhr-Normalisierung,
 * Konfliktfall 10) und `send`et eigene Marken bei kanonischen Mutationen.
 *
 * Kanonisches Stringformat: "<physical>:<logical>:<node>" (Dezimal). `parseHlc`
 * ist tolerant gegenüber dem Fallback aus lib/events.ts ("<hex>:<hex>").
 */

/** Zerlegte HLC. */
export interface Hlc {
  /** Physische Wall-Clock in epoch-ms. */
  physical: number;
  /** Logischer Zähler (bricht Gleichstände bei gleicher physical). */
  logical: number;
  /** Knoten-/Gerätekennung (letzter Tie-Breaker). */
  node: string;
}

const SEP = ":";

/** Serialisiert eine HLC in das kanonische Stringformat. */
export function formatHlc(h: Hlc): string {
  return `${h.physical}${SEP}${h.logical}${SEP}${h.node}`;
}

/**
 * Parst einen HLC-String. Tolerant: fehlende Teile werden zu 0/"" ergänzt.
 * Der lib/events.ts-Fallback "<hex>:<hex>" wird als Dezimal gelesen — das ist
 * für die Ordnung unkritisch, solange derselbe Parser vergleicht.
 */
export function parseHlc(s: string): Hlc {
  const parts = s.split(SEP);
  const physical = Number.parseInt(parts[0] ?? "0", 10);
  const logical = Number.parseInt(parts[1] ?? "0", 10);
  const node = parts.length > 2 ? parts.slice(2).join(SEP) : "";
  return {
    physical: Number.isFinite(physical) ? physical : 0,
    logical: Number.isFinite(logical) ? logical : 0,
    node,
  };
}

/** Totalordnung zweier HLCs: physical → logical → node. */
export function compareHlc(a: Hlc, b: Hlc): number {
  if (a.physical !== b.physical) return a.physical < b.physical ? -1 : 1;
  if (a.logical !== b.logical) return a.logical < b.logical ? -1 : 1;
  if (a.node === b.node) return 0;
  return a.node < b.node ? -1 : 1;
}

/** Vergleich direkt auf Strings (für LWW ohne vorheriges Parsen). */
export function compareHlcStrings(a: string, b: string): number {
  return compareHlc(parseHlc(a), parseHlc(b));
}

// ---------------------------------------------------------------------------
// Server-HLC-Uhr (prozessweit, monoton). Persistenz der letzten Marke passiert
// über sync_states.last_hlc; hier reicht der In-Memory-Stand pro Prozess.
// ---------------------------------------------------------------------------

const DEFAULT_NODE = "server";
let clock: Hlc = { physical: 0, logical: 0, node: DEFAULT_NODE };

/**
 * HLC-`send`: erzeugt die nächste Marke für eine lokal ausgelöste (kanonische)
 * Server-Mutation. l = max(last.physical, now); logical steigt bei
 * physical-Gleichstand, sonst 0.
 */
export function serverSendHlc(node: string = DEFAULT_NODE, now: number = Date.now()): string {
  const physical = Math.max(clock.physical, now);
  const logical = physical === clock.physical ? clock.logical + 1 : 0;
  clock = { physical, logical, node };
  return formatHlc(clock);
}

/**
 * HLC-`receive`: integriert eine eingehende Geräte-HLC (Sync-Push) und liefert
 * die neue Server-Marke. Standard-HLC-Regel über beide Uhren + now.
 */
export function serverReceiveHlc(
  remote: string,
  node: string = DEFAULT_NODE,
  now: number = Date.now(),
): string {
  const r = parseHlc(remote);
  const physical = Math.max(clock.physical, r.physical, now);
  let logical: number;
  if (physical === clock.physical && physical === r.physical) {
    logical = Math.max(clock.logical, r.logical) + 1;
  } else if (physical === clock.physical) {
    logical = clock.logical + 1;
  } else if (physical === r.physical) {
    logical = r.logical + 1;
  } else {
    logical = 0;
  }
  clock = { physical, logical, node };
  return formatHlc(clock);
}

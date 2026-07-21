/**
 * sync/hlc.ts, Hybrid Logical Clock (doc 04 §1.1).
 *
 * `(physical_ms, logical_counter, device_id)`, monotone even when the wall
 * clock jumps backwards, and totally ordered across devices. Serialized as a
 * fixed-width, lexicographically sortable string so `ORDER BY hlc` in SQL and
 * string compare in JS agree.
 *
 * Format: `<physical:15><logical:6>-<device>` e.g.
 * `000001720000000000042-8f14e45f...`. Physical is zero-padded to 15 digits
 * (covers epoch-ms well past year 5000), logical to 6 digits.
 */
import type { Uuid } from "@tarlog/core";

const PHYS_WIDTH = 15;
const LOG_WIDTH = 6;

export interface Hlc {
  physical: number;
  logical: number;
  device: Uuid;
}

/** Serialize an HLC to its sortable string form. */
export function formatHlc(h: Hlc): string {
  const p = String(h.physical).padStart(PHYS_WIDTH, "0");
  const l = String(h.logical).padStart(LOG_WIDTH, "0");
  return `${p}${l}-${h.device}`;
}

/** Parse a serialized HLC. Throws on malformed input. */
export function parseHlc(s: string): Hlc {
  const dash = s.indexOf("-");
  if (dash !== PHYS_WIDTH + LOG_WIDTH) {
    throw new Error(`invalid hlc: ${s}`);
  }
  const physical = Number(s.slice(0, PHYS_WIDTH));
  const logical = Number(s.slice(PHYS_WIDTH, PHYS_WIDTH + LOG_WIDTH));
  const device = s.slice(dash + 1);
  return { physical, logical, device };
}

/**
 * Per-device HLC generator. Keep one instance per device id. `send()` stamps a
 * new local event; `receive()` merges a remote stamp to stay monotone ahead of
 * peers (doc 04 §1.1, the server may normalize on gross skew).
 */
export class HlcClock {
  private last: Hlc;

  constructor(
    private readonly device: Uuid,
    /** Seed from persisted last HLC to survive restarts (optional). */
    seed?: string | null,
    private readonly wall: () => number = () => Date.now(),
  ) {
    this.last = seed ? parseHlc(seed) : { physical: 0, logical: 0, device };
  }

  /** Current serialized HLC without advancing. */
  peek(): string {
    return formatHlc(this.last);
  }

  /** Stamp a new outgoing event, advancing the clock. */
  send(): string {
    const now = this.wall();
    if (now > this.last.physical) {
      this.last = { physical: now, logical: 0, device: this.device };
    } else {
      this.last = {
        physical: this.last.physical,
        logical: this.last.logical + 1,
        device: this.device,
      };
    }
    return formatHlc(this.last);
  }

  /** Merge a remote HLC so subsequent local stamps stay ordered after it. */
  receive(remote: string): void {
    const r = parseHlc(remote);
    const now = this.wall();
    const physical = Math.max(this.last.physical, r.physical, now);
    let logical: number;
    if (physical === this.last.physical && physical === r.physical) {
      logical = Math.max(this.last.logical, r.logical) + 1;
    } else if (physical === this.last.physical) {
      logical = this.last.logical + 1;
    } else if (physical === r.physical) {
      logical = r.logical + 1;
    } else {
      logical = 0;
    }
    this.last = { physical, logical, device: this.device };
  }
}

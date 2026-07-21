/**
 * Rounding module (doc 07 §3). Integer-second arithmetic only, no floats in
 * the rounding decision. Produces billing_duration_seconds,
 * rounding_delta_seconds, rounding_reason.
 *
 * Pure functions, no I/O. Canonical case (doc 07 §4): net 4200 s, rule
 * ceil_started_interval interval 900 → billing 4500, delta +300,
 * reason "ceil_started_interval:900s".
 */
import type {
  IntervalSeconds,
  RoundingMode,
  RoundingResult,
  RoundingRule,
  Seconds,
} from "../types.js";

/** Interval-based modes require rule.interval_seconds (doc 07 §3.2). */
const INTERVAL_MODES: ReadonlySet<RoundingMode> = new Set<RoundingMode>([
  "always_up",
  "always_down",
  "commercial",
  "nearest_interval",
  "ceil_started_interval",
]);

/**
 * Build the traceable rounding_reason string "MODE:INTERVALs" (doc 07 §3.1),
 * e.g. "ceil_started_interval:900s". Threshold modes append the minimum,
 * deferred modes append the deferral scope.
 */
function reasonInterval(mode: RoundingMode, interval: IntervalSeconds): string {
  return `${mode}:${interval}s`;
}

/**
 * Core integer-second rounding math for interval-based modes (doc 07 §3.4).
 * Uses only integer division/modulo, no float rounding drift.
 */
function roundToInterval(net: Seconds, mode: RoundingMode, interval: IntervalSeconds): Seconds {
  const full = Math.trunc(net / interval); // whole intervals fully contained
  const rest = net - full * interval; // leftover seconds in [0, interval)
  if (rest === 0) return full * interval; // exactly on an interval boundary

  switch (mode) {
    case "always_down":
      return full * interval; // floor
    case "always_up":
    case "ceil_started_interval":
      return (full + 1) * interval; // ceil, every started interval counts full
    case "commercial":
    case "nearest_interval":
      // round half up: bump when leftover ≥ half the interval (integer compare)
      return rest * 2 >= interval ? (full + 1) * interval : full * interval;
    default:
      // unreachable, INTERVAL_MODES guards the caller
      return full * interval;
  }
}

/** Assemble a RoundingResult, deriving the signed delta = billing − net. */
function result(billing: Seconds, net: Seconds, reason: string): RoundingResult {
  return {
    billing_duration_seconds: billing,
    rounding_delta_seconds: billing - net,
    rounding_reason: reason,
  };
}

/**
 * Fn 4 (doc 07 §2/§3): apply a rounding rule to net seconds → RoundingResult.
 * All 9 modes. Net is clamped ≥ 0 defensively; negative net is a caller bug
 * (computeNetSeconds already clamps).
 */
export function applyRounding(net_seconds: Seconds, rule: RoundingRule): RoundingResult {
  const net = net_seconds < 0 ? 0 : net_seconds;

  switch (rule.mode) {
    case "none":
      // Pass-through: billing = net, delta = 0.
      return result(net, net, "none");

    case "always_up":
    case "always_down":
    case "commercial":
    case "nearest_interval":
    case "ceil_started_interval": {
      const interval = requireInterval(rule);
      const billing = roundToInterval(net, rule.mode, interval);
      return result(billing, net, reasonInterval(rule.mode, interval));
    }

    case "min_per_entry": {
      // billing = max(net, minimum). If an interval is also set, round after
      // the floor (doc: "sonst Intervall danach"). No interval → raw max.
      const minimum = requireMinimum(rule);
      const floored = net < minimum ? minimum : net;
      if (rule.interval_seconds !== undefined) {
        const interval = rule.interval_seconds;
        // Ceil the raised value onto the interval grid (started interval full).
        const billing = roundToInterval(floored, "ceil_started_interval", interval);
        return result(billing, net, `min_per_entry:${minimum}s:${interval}s`);
      }
      return result(floored, net, `min_per_entry:${minimum}s`);
    }

    case "min_per_day":
      // Per-day minimum is an aggregate over the day; the single entry passes
      // net through unchanged. Aggregate rounding happens outside this fn.
      return result(net, net, "min_per_day:deferred:day");

    case "min_per_project":
      // Per-project minimum is an aggregate over the billing period; single
      // entry passes net through unchanged. Aggregate rounding is external.
      return result(net, net, "min_per_project:deferred:project");

    default: {
      // Exhaustiveness guard, a new RoundingMode must be handled here.
      const exhaustive: never = rule.mode;
      throw new Error(`Unbekannter Rundungsmodus: ${String(exhaustive)}`);
    }
  }
}

/**
 * Non-persisting preview of rounding for the UI. Identical math and identical
 * reason to applyRounding, the preview must match what will be stored.
 */
export function roundingPreview(net_seconds: Seconds, rule: RoundingRule): RoundingResult {
  return applyRounding(net_seconds, rule);
}

/** Interval-based mode without interval_seconds is a rule-configuration error. */
function requireInterval(rule: RoundingRule): IntervalSeconds {
  if (rule.interval_seconds === undefined) {
    throw new Error(`Rundungsmodus '${rule.mode}' benötigt interval_seconds`);
  }
  return rule.interval_seconds;
}

/** Threshold mode without minimum_seconds is a rule-configuration error. */
function requireMinimum(rule: RoundingRule): Seconds {
  if (rule.minimum_seconds === undefined) {
    throw new Error(`Rundungsmodus '${rule.mode}' benötigt minimum_seconds`);
  }
  return rule.minimum_seconds;
}

/** Exported for callers that want to branch on mode class (interval vs threshold). */
export function isIntervalMode(mode: RoundingMode): boolean {
  return INTERVAL_MODES.has(mode);
}

/**
 * Billing module (doc 07 §2 functions 11–14, §4/§5; doc 10 §4). Integer-cent
 * arithmetic only — Geld nie als Float (doc 10, "Bewusste Entscheidungen").
 * calculateEntry is the main per-entry pipeline (1→2→3→4→11).
 */
import {
  CALCULATION_VERSION,
  type BudgetInput,
  type CalcResult,
  type Cents,
  type DayRateRule,
  type FixedFeeInput,
  type RateSnapshot,
  type RoundingRule,
  type Seconds,
  type TimeEntryCalcInput,
} from "../types.js";
import { applyRounding } from "../rounding/index.js";
import { computeBreakSeconds, computeGrossSeconds, computeNetSeconds } from "../time/index.js";

/** Sekunden je Stunde. */
const SECONDS_PER_HOUR = 3600;

/**
 * Fn 11: billing_amount_snapshot in cents = round(billing_seconds/3600 × rate).
 * Integer-Arithmetik: Math.round((billing_seconds × amount_cents) / 3600).
 */
export function computeAmountCents(billing_seconds: Seconds, rate: RateSnapshot): Cents {
  return Math.round((billing_seconds * rate.amount_cents) / SECONDS_PER_HOUR);
}

/** Rate resolution: task > project > customer > default (doc 07 §5). */
export interface ResolveRateOptions {
  task?: RateSnapshot;
  project?: RateSnapshot;
  customer?: RateSnapshot;
  default?: RateSnapshot;
}

/**
 * Resolve the effective rate by precedence task > project > customer > default
 * (doc 10 §4.0). Der erste vorhandene Satz gewinnt; `source` weist die Herkunft
 * aus. Kein Satz → Fehler (Raten-Auflösung nicht möglich).
 */
export function resolveRate(opts: ResolveRateOptions): RateSnapshot {
  if (opts.task) return { ...opts.task, source: "task" };
  if (opts.project) return { ...opts.project, source: "project" };
  if (opts.customer) return { ...opts.customer, source: "customer" };
  if (opts.default) return { ...opts.default, source: "default" };
  throw new Error("Raten-Auflösung fehlgeschlagen: kein Satz (task/project/customer/default) gesetzt");
}

/** Ergebnis der Tagessatz-Klassifikation (doc 10 §4.2) mit Berechnungsspur. */
export interface DayRateResult {
  /** Betrag in cents (voller Tag / halber Tag / 0). */
  amount_cents: Cents;
  /** Klassifikation der Netto-Zeit. */
  classification: "full_day" | "half_day" | "none";
  /** Angefangene Zusatzstunden über full_day_from (nur bei full_day, wenn Satz gesetzt). */
  extra_hours: number;
  /** Nachvollziehbare Herleitung (Netto → Klassifikation → Betrag). */
  reason: string;
}

/**
 * Fn 12: day-rate amount in cents for a day's net seconds (doc 10 §4.2).
 * ≥ full_day_from_seconds → full_day_cents (+ extra_hour_cents je angefangener
 * Stunde über full_day_from, wenn Satz gesetzt); ≥ half_day_from_seconds →
 * half_day_cents; sonst 0 mit Hinweis.
 */
export function computeDayRate(net_day_seconds: Seconds, rule: DayRateRule): Cents {
  return computeDayRateDetailed(net_day_seconds, rule).amount_cents;
}

/** Wie computeDayRate, liefert aber die volle Berechnungsspur (Report/PDF). */
export function computeDayRateDetailed(net_day_seconds: Seconds, rule: DayRateRule): DayRateResult {
  if (net_day_seconds >= rule.full_day_from_seconds) {
    let amount = rule.full_day_cents;
    let extraHours = 0;
    // Zusatzstunden nur wenn extra_hour_cents gesetzt (extra_hours_mode = hourly).
    if (rule.extra_hour_cents !== undefined) {
      const extraSeconds = net_day_seconds - rule.full_day_from_seconds;
      // je angefangener Stunde → aufrunden.
      extraHours = Math.ceil(extraSeconds / SECONDS_PER_HOUR);
      amount += extraHours * rule.extra_hour_cents;
    }
    return {
      amount_cents: amount,
      classification: "full_day",
      extra_hours: extraHours,
      reason:
        `voller Tag (netto ${net_day_seconds}s ≥ ${rule.full_day_from_seconds}s)` +
        (extraHours > 0 ? ` + ${extraHours} Zusatzstunde(n)` : ""),
    };
  }
  if (net_day_seconds >= rule.half_day_from_seconds) {
    return {
      amount_cents: rule.half_day_cents,
      classification: "half_day",
      extra_hours: 0,
      reason: `halber Tag (netto ${net_day_seconds}s ≥ ${rule.half_day_from_seconds}s)`,
    };
  }
  return {
    amount_cents: 0,
    classification: "none",
    extra_hours: 0,
    reason: `kein Tagessatz (netto ${net_day_seconds}s < ${rule.half_day_from_seconds}s Mindestschwelle)`,
  };
}

/** Fixed-fee profitability margin (doc 07 fn 13). */
export interface FixedFeeMargin {
  /** Internal cost of actual time in cents. */
  actual_cost_cents: Cents;
  /** Margin in cents = fixed_fee_cents − actual_cost_cents. */
  margin_cents: Cents;
  /** Margin as fraction of fixed fee. */
  margin_ratio: number;
  /** Actual seconds exceed the budgeted hours. */
  over_budget: boolean;
}

/**
 * Fn 13: fixed-fee margin from actual seconds vs. budget + internal rate
 * (doc 10 §4.3). cost = actual_seconds/3600 × internal_rate_cents;
 * margin_cents = fixed_fee_cents − cost; margin_ratio = margin / fixed_fee.
 */
export function computeFixedFeeMargin(actual_seconds: Seconds, f: FixedFeeInput): FixedFeeMargin {
  const actual_cost_cents = Math.round((actual_seconds * f.internal_rate_cents) / SECONDS_PER_HOUR);
  const margin_cents = f.fixed_fee_cents - actual_cost_cents;
  const margin_ratio = f.fixed_fee_cents !== 0 ? margin_cents / f.fixed_fee_cents : 0;
  const over_budget = actual_seconds > f.budget_hours * SECONDS_PER_HOUR;
  return { actual_cost_cents, margin_cents, margin_ratio, over_budget };
}

/** Budget-usage result (doc 07 fn 14). */
export interface BudgetUsage {
  /** Fraction of time budget consumed (0..1+), or null if no time budget. */
  seconds_ratio: number | null;
  /** Fraction of money budget consumed (0..1+), or null if no money budget. */
  cents_ratio: number | null;
  /** Warning thresholds that have been reached/exceeded. */
  crossed_thresholds: number[];
}

/**
 * Fn 14: budget usage from consumed vs. budgeted seconds/cents + thresholds
 * (doc 10 §7 Budgetreport). pct je Dimension + überschrittene warn_thresholds.
 */
export function computeBudgetUsage(used_seconds: Seconds, used_cents: Cents, b: BudgetInput): BudgetUsage {
  const seconds_ratio =
    b.budget_seconds !== undefined && b.budget_seconds > 0 ? used_seconds / b.budget_seconds : null;
  const cents_ratio = b.budget_cents !== undefined && b.budget_cents > 0 ? used_cents / b.budget_cents : null;

  // Maßgebliche Auslastung = höchste vorhandene Dimension.
  const ratios = [seconds_ratio, cents_ratio].filter((r): r is number => r !== null);
  const maxRatio = ratios.length > 0 ? Math.max(...ratios) : 0;

  const crossed_thresholds = b.warn_thresholds.filter((t) => maxRatio >= t).sort((a, x) => a - x);

  return { seconds_ratio, cents_ratio, crossed_thresholds };
}

/**
 * Main per-entry pipeline (doc 07 §2, doc 10 §4): compose functions
 * 1 → 2 → 3 → 4 → 11 (gross → break → net → rounding → amount) into a full
 * 12-field CalcResult. actual_duration_seconds = gross (BRUTTO, unverändert).
 * calculation_version = CALCULATION_VERSION; rate_snapshot + billing_amount_snapshot
 * eingefroren.
 */
export function calculateEntry(input: TimeEntryCalcInput, rule: RoundingRule, rate: RateSnapshot): CalcResult {
  if (input.actual_ended_at === null) {
    throw new Error("calculateEntry: laufender Eintrag (actual_ended_at = null) kann nicht abgerechnet werden");
  }
  const actual_ended_at = input.actual_ended_at;

  const gross = computeGrossSeconds(input.actual_started_at, actual_ended_at);
  const breakSec = computeBreakSeconds(input.breaks);
  const net = computeNetSeconds(gross, breakSec);
  const rounding = applyRounding(net, rule);
  const billing_amount_snapshot = computeAmountCents(rounding.billing_duration_seconds, rate);

  return {
    actual_started_at: input.actual_started_at,
    actual_ended_at,
    actual_duration_seconds: gross, // BRUTTO — nie durch Rundung verändert
    break_duration_seconds: breakSec,
    net_work_duration_seconds: net,
    billing_duration_seconds: rounding.billing_duration_seconds,
    rounding_rule_id: rule.id,
    rounding_delta_seconds: rounding.rounding_delta_seconds,
    rounding_reason: rounding.rounding_reason,
    calculation_version: CALCULATION_VERSION,
    rate_snapshot: rate,
    billing_amount_snapshot,
  };
}

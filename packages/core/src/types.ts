/**
 * Project Time Ledger — Core contract (types.ts).
 *
 * This is THE CONTRACT. All engine modules (time, rounding, compliance,
 * billing, schemas) and all apps depend on these types. Field names match
 * docs/project-time-ledger/07-zeitberechnung-rundung.md and 06-datenmodell.md
 * EXACTLY — any divergence is a data-model bug.
 *
 * Conventions (docs 05-architektur.md §8):
 *  - Instants: UTC epoch-ms (number) + IANA `timezone` (string) per entry.
 *  - Durations: integer seconds (`*_seconds`).
 *  - Money: integer cents (`*_cents`) + ISO-4217 `currency`.
 *  - IDs: UUIDv7 (package "uuidv7"); represented as string here.
 */

// ---------------------------------------------------------------------------
// Primitive aliases (documentation-only; enforced by zod at the edges)
// ---------------------------------------------------------------------------

/** UTC instant as epoch milliseconds. */
export type EpochMs = number;
/** IANA timezone identifier, e.g. "Europe/Berlin". */
export type IanaTimezone = string;
/** Integer duration in seconds. */
export type Seconds = number;
/** Integer money amount in minor units (cents). */
export type Cents = number;
/** ISO-4217 currency code, e.g. "EUR". */
export type CurrencyCode = string;
/** UUIDv7 string. */
export type Uuid = string;
/** Local calendar day as "YYYY-MM-DD" in an entry's timezone. */
export type LocalDate = string;

/**
 * Engine algorithm version. Every calculation result carries this. Bump when
 * the calculation logic changes (new rounding algo, corrected DST handling);
 * existing entries keep their stored version and are never silently
 * recomputed (doc 07 §1.4).
 */
export const CALCULATION_VERSION = 1 as const;
export type CalculationVersion = typeof CALCULATION_VERSION;

// ---------------------------------------------------------------------------
// Break + time-entry calculation input
// ---------------------------------------------------------------------------

/** A single break within a time entry (feeds break_duration_seconds). */
export interface BreakInput {
  /** Break start, UTC epoch-ms. */
  started_at: EpochMs;
  /** Break end, UTC epoch-ms. NULL/undefined while the break is still active. */
  ended_at: EpochMs | null;
}

/**
 * Raw input for the per-entry calculation pipeline. Only raw measured fields —
 * derived values (net, billing, deltas) are computed by the engine.
 */
export interface TimeEntryCalcInput {
  /** Actual start, raw measured, UTC epoch-ms. */
  actual_started_at: EpochMs;
  /** Actual end, raw measured, UTC epoch-ms. NULL while still running. */
  actual_ended_at: EpochMs | null;
  /** IANA timezone stored on the entry (calendar/DST logic uses this). */
  timezone: IanaTimezone;
  /** All breaks belonging to this entry. */
  breaks: BreakInput[];
}

// ---------------------------------------------------------------------------
// Rounding (doc 07 §3)
// ---------------------------------------------------------------------------

/** The 9 rounding modes (doc 07 §3.2). */
export type RoundingMode =
  | "none"
  | "always_up"
  | "always_down"
  | "commercial"
  | "nearest_interval"
  | "min_per_entry"
  | "min_per_day"
  | "min_per_project"
  | "ceil_started_interval";

/** Allowed interval durations in seconds (doc 07 §3.3): 5/6/10/15/30/60 min. */
export type IntervalSeconds = 300 | 360 | 600 | 900 | 1800 | 3600;

/**
 * A rounding rule as applied by the engine. `interval_seconds` is required for
 * interval-based modes (always_up/down, commercial, nearest_interval,
 * ceil_started_interval); `minimum_seconds` for threshold modes
 * (min_per_entry/day/project).
 */
export interface RoundingRule {
  id: Uuid;
  mode: RoundingMode;
  interval_seconds?: IntervalSeconds;
  minimum_seconds?: Seconds;
}

/** Output of applyRounding — the three rounding fields (doc 07 §3.1). */
export interface RoundingResult {
  /** Rounded billable seconds. */
  billing_duration_seconds: Seconds;
  /** Signed: billing − net. Positive = rounded up, negative = down, 0 = none. */
  rounding_delta_seconds: Seconds;
  /** Human-traceable reason, e.g. "ceil_started_interval:900s". */
  rounding_reason: string;
}

// ---------------------------------------------------------------------------
// Rate + billing (doc 07 §5, doc 06 billing_rates)
// ---------------------------------------------------------------------------

/** Frozen rate snapshot (doc 07 §5). Immutable once finalized. */
export interface RateSnapshot {
  /** Rate amount in cents (per hour = per 3600 s unless day-rate context). */
  amount_cents: Cents;
  /** ISO-4217 currency. */
  currency: CurrencyCode;
  /** Where the rate was resolved from (task > project > customer > default). */
  source: "task" | "project" | "customer" | "default" | "manual";
  /** Optional validity start (rate historisation), UTC epoch-ms. */
  valid_from?: EpochMs;
}

/**
 * Full per-entry calculation result — all 12 fields of the time entry
 * (doc 07 §3.1). `actual_duration_seconds` (gross = ended − started) is NEVER
 * altered by rounding; `billing_duration_seconds` is the rounded result.
 */
export interface CalcResult {
  /** 1. Raw start, UTC epoch-ms. */
  actual_started_at: EpochMs;
  /** 2. Raw end, UTC epoch-ms. */
  actual_ended_at: EpochMs;
  /** 3. Gross duration = ended − started. Never altered by rounding. */
  actual_duration_seconds: Seconds;
  /** 4. Sum of all breaks. */
  break_duration_seconds: Seconds;
  /** 5. Net = actual − break (clamped ≥ 0). Basis of rounding. */
  net_work_duration_seconds: Seconds;
  /** 6. Rounded billable seconds. */
  billing_duration_seconds: Seconds;
  /** 7. FK to the applied rounding rule. */
  rounding_rule_id: Uuid;
  /** 8. Signed delta = billing − net. */
  rounding_delta_seconds: Seconds;
  /** 9. Traceable rounding reason. */
  rounding_reason: string;
  /** 10. Engine version used for this calculation. */
  calculation_version: CalculationVersion;
  /** 11. Frozen rate snapshot. */
  rate_snapshot: RateSnapshot;
  /** 12. Frozen billing amount in cents = billing_duration_seconds × rate. */
  billing_amount_snapshot: Cents;
}

// ---------------------------------------------------------------------------
// Timer states (doc 06 timer_states, doc 05 conventions)
// ---------------------------------------------------------------------------

/** The 7 timer states. */
export type TimerStatus =
  | "idle"
  | "running"
  | "paused"
  | "stopped"
  | "needs_description"
  | "sync_pending"
  | "conflict";

// ---------------------------------------------------------------------------
// Compliance (doc 08)
// ---------------------------------------------------------------------------

/** Traffic-light compliance status. */
export type ComplianceStatus = "green" | "yellow" | "red";

/** Result of a single compliance rule evaluation (doc 08 §2.1). */
export interface ComplianceRuleResult {
  /** Stable rule id, e.g. "de_break_over_6h". */
  rule_id: string;
  status: ComplianceStatus;
  /** User-facing message / recommendation. */
  message: string;
  /** Time entries that triggered the result. */
  affected_entry_ids: Uuid[];
  /** Local calendar day the result applies to. */
  subject_date: LocalDate;
}

/**
 * Severity default of a compliance profile (doc 06 compliance_profiles.severity).
 * Distinct from the per-result traffic light (ComplianceStatus).
 */
export type ComplianceProfileSeverity = "info" | "warning" | "violation";

/** Versioned country/jurisdiction compliance profile — all 9 fields (doc 08 §5.1). */
export interface ComplianceProfile {
  /** ISO 3166-1 alpha-2, plus special value "EU". */
  country_code: string;
  /** Clear-text name, e.g. "Deutschland (ArbZG)". */
  jurisdiction_name: string;
  /** Validity start "YYYY-MM-DD". */
  valid_from: LocalDate;
  /** Validity end "YYYY-MM-DD"; undefined = currently valid. */
  valid_until?: LocalDate;
  /** Machine-readable rule set (thresholds, severities, holidays). */
  rules_json: Record<string, unknown>;
  /** Legal source reference. */
  source_note: string;
  /** Profile default severity; overridable per rule in rules_json. */
  severity: ComplianceProfileSeverity;
  /** User-visible explanation for the UI ("explain rule"). */
  user_visible_explanation: string;
  /** Evaluation-logic version, mirrored into compliance_results. */
  calculation_version: number;
}

/**
 * Aggregated per-day summary fed into the day-level compliance checks
 * (breaks, daily max, night work, Sunday/holiday).
 */
export interface DayEntrySummary {
  /** Local calendar day "YYYY-MM-DD". */
  date: LocalDate;
  /** Net work seconds for the day (basis of daily-limit rules). */
  net_seconds: Seconds;
  /** Total break seconds for the day. */
  break_seconds: Seconds;
  /** Duration in seconds of each individual break block (for the ≥15min rule). */
  break_blocks: Seconds[];
  /** First entry start of the day, UTC epoch-ms (for rest-period check). */
  first_start_at: EpochMs;
  /** Last entry end of the day, UTC epoch-ms (for rest-period check). */
  last_end_at: EpochMs;
  /** Local weekday is Sunday. */
  is_sunday: boolean;
  /** Local day is a public holiday per the profile. */
  is_holiday: boolean;
  /** Any work overlaps the night window (23:00–06:00). */
  has_night_work: boolean;
}

// ---------------------------------------------------------------------------
// Day rate / fixed fee / budget (doc 06 day_rate_rules, fixed_fee_contracts, budgets)
// ---------------------------------------------------------------------------

/** Day-rate rule (doc 06 day_rate_rules; doc 07 fn 12). */
export interface DayRateRule {
  /** Full day billed from this many net seconds. */
  full_day_from_seconds: Seconds;
  /** Half day billed from this many net seconds. */
  half_day_from_seconds: Seconds;
  /** Full-day rate in cents. */
  full_day_cents: Cents;
  /** Half-day rate in cents. */
  half_day_cents: Cents;
  /** Optional per-extra-hour rate in cents (extra_hours_billing = hourly). */
  extra_hour_cents?: Cents;
}

/** Fixed-fee profitability input (doc 06 fixed_fee_contracts; doc 07 fn 13). */
export interface FixedFeeInput {
  /** Agreed fixed fee in cents. */
  fixed_fee_cents: Cents;
  /** Budgeted hours for the contract. */
  budget_hours: number;
  /** Internal cost rate in cents (per hour) for margin calculation. */
  internal_rate_cents: Cents;
}

/** Budget-usage input (doc 06 budgets; doc 07 fn 14). */
export interface BudgetInput {
  /** Budget in seconds (time budget), if set. */
  budget_seconds?: Seconds;
  /** Budget in cents (money budget), if set. */
  budget_cents?: Cents;
  /** Warning thresholds as fractions, e.g. [0.8, 1.0]. */
  warn_thresholds: number[];
}

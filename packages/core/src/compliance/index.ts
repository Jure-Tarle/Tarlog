/**
 * Compliance module (doc 08). Pure day-level, rest-period and (EU) week-level
 * evaluation against versioned country profiles. Uses net work time, never
 * billing time (doc 08 §2.1). Framework-free, no I/O.
 *
 * DE profile = ArbZG §3/§4/§5; EU profile = RL 2003/88/EG. Both are versioned
 * ComplianceProfile constants; the numeric thresholds live in `rules_json` so
 * the rule set stays data-driven (doc 08 §5.2).
 */
import type {
  ComplianceProfile,
  ComplianceRuleResult,
  ComplianceStatus,
  DayEntrySummary,
  EpochMs,
  Seconds,
} from "../types.js";
import { CALCULATION_VERSION } from "../types.js";

// ---------------------------------------------------------------------------
// Threshold constants (integer seconds) — mirror rules_json (doc 08 §5.2).
// ---------------------------------------------------------------------------

/** Break block below this many seconds does not count as a Ruhepause (R3). */
const MIN_BREAK_BLOCK_SECONDS: Seconds = 15 * 60; // 900
/** > 6h net requires ≥ 30min break (R1). */
const OVER_6H_SECONDS: Seconds = 6 * 3600; // 21600
const MIN_BREAK_OVER_6H_SECONDS: Seconds = 30 * 60; // 1800
/** > 9h net requires ≥ 45min break (R2). */
const OVER_9H_SECONDS: Seconds = 9 * 3600; // 32400
const MIN_BREAK_OVER_9H_SECONDS: Seconds = 45 * 60; // 2700
/** > 8h net = Risiko/Ausgleich (R4/R5). */
const STANDARD_8H_SECONDS: Seconds = 8 * 3600; // 28800
/** > 10h net = schwerer Verstoß (R6). */
const MAX_10H_SECONDS: Seconds = 10 * 3600; // 36000
/** < 11h between days = Ruhezeitverstoß (R7). */
const MIN_REST_SECONDS: Seconds = 11 * 3600; // 39600
/** EU: > 48h Ø Woche = Risiko (RL 2003/88/EG Art. 6). */
const EU_WEEKLY_48H_SECONDS: Seconds = 48 * 3600; // 172800

/**
 * Result of the EU weekly average check. Not part of the core contract type
 * set — defined and exported here (doc 08 §4 rule `eu_weekly_48h`).
 */
export interface WeekComplianceResult {
  rule_id: string;
  status: ComplianceStatus;
  message: string;
  /** Net work seconds evaluated for the week. */
  net_seconds_week: Seconds;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sum of break blocks that count as a real Ruhepause, i.e. ≥ 15min (R3). */
function countingBreakSeconds(breakBlocks: readonly Seconds[]): Seconds {
  let total = 0;
  for (const block of breakBlocks) {
    if (block >= MIN_BREAK_BLOCK_SECONDS) total += block;
  }
  return total;
}

/** Round seconds to whole minutes for readable German messages. */
function toMinutes(seconds: Seconds): number {
  return Math.round(seconds / 60);
}

function result(
  rule_id: string,
  status: ComplianceStatus,
  message: string,
  subject_date: string,
  affected_entry_ids: string[] = [],
): ComplianceRuleResult {
  return { rule_id, status, message, affected_entry_ids, subject_date };
}

// ---------------------------------------------------------------------------
// Day-level evaluation (doc 08 §2.1) — DE rules R1..R6, R8, R9.
// ---------------------------------------------------------------------------

/**
 * Evaluate one day against a profile → list of per-rule results.
 *
 * Only rules with something to report emit a result; a clean day still emits a
 * single green `de_daily_standard_8h` (R4) so the UI has a positive signal.
 */
export function evaluateDay(day: DayEntrySummary, profile: ComplianceProfile): ComplianceRuleResult[] {
  const results: ComplianceRuleResult[] = [];
  const net = day.net_seconds;
  const date = day.date;

  // R3: only break blocks ≥ 15min count toward the mandatory break (R1/R2).
  const countedBreak = countingBreakSeconds(day.break_blocks);
  const hasShortBlocks = day.break_blocks.some((b) => b > 0 && b < MIN_BREAK_BLOCK_SECONDS);
  if (hasShortBlocks) {
    results.push(
      result(
        "de_break_min_block",
        "yellow",
        `ArbZG §4: Pausenblöcke unter 15 Minuten zählen nicht als Ruhepause und werden nicht auf die Pflichtpause angerechnet.`,
        date,
      ),
    );
  }

  // R1: > 6h net → ≥ 30min break. Exactly 6h is ok. > 9h is handled by R2.
  if (net > OVER_6H_SECONDS && net <= OVER_9H_SECONDS && countedBreak < MIN_BREAK_OVER_6H_SECONDS) {
    results.push(
      result(
        "de_break_over_6h",
        "red",
        `ArbZG §4: Bei mehr als 6 Stunden Arbeitszeit sind mindestens 30 Minuten Pause vorgeschrieben; dokumentiert sind nur ${toMinutes(
          countedBreak,
        )} Minuten. Pause um mindestens ${toMinutes(MIN_BREAK_OVER_6H_SECONDS - countedBreak)} Minuten ergänzen.`,
        date,
      ),
    );
  }

  // R2: > 9h net → ≥ 45min break.
  if (net > OVER_9H_SECONDS && countedBreak < MIN_BREAK_OVER_9H_SECONDS) {
    results.push(
      result(
        "de_break_over_9h",
        "red",
        `ArbZG §4: Bei mehr als 9 Stunden Arbeitszeit sind mindestens 45 Minuten Pause vorgeschrieben; dokumentiert sind nur ${toMinutes(
          countedBreak,
        )} Minuten. Pause um mindestens ${toMinutes(MIN_BREAK_OVER_9H_SECONDS - countedBreak)} Minuten ergänzen.`,
        date,
      ),
    );
  }

  // R6: > 10h net = schwerer Verstoß (red). R4/R5: > 8h..10h = Risiko (yellow).
  // R4: ≤ 8h = konform (green).
  if (net > MAX_10H_SECONDS) {
    results.push(
      result(
        "de_daily_over_10h",
        "red",
        `ArbZG §3: Die Nettoarbeitszeit von ${toMinutes(
          net,
        )} Minuten überschreitet die zulässige Tageshöchstarbeitszeit von 10 Stunden.`,
        date,
      ),
    );
  } else if (net > STANDARD_8H_SECONDS) {
    results.push(
      result(
        "de_daily_extend_10h",
        "yellow",
        `ArbZG §3: Die Nettoarbeitszeit von ${toMinutes(
          net,
        )} Minuten überschreitet die Regelarbeitszeit von 8 Stunden. Zulässig bis 10 Stunden nur mit Ausgleich (Ø 8 Stunden in 24 Wochen).`,
        date,
      ),
    );
  } else {
    results.push(
      result(
        "de_daily_standard_8h",
        "green",
        `ArbZG §3: Nettoarbeitszeit von ${toMinutes(net)} Minuten innerhalb der Regelarbeitszeit von 8 Stunden.`,
        date,
      ),
    );
  }

  // R8: Sonn-/Feiertagsarbeit markieren (Hinweis, gelb).
  if (day.is_sunday || day.is_holiday) {
    const label = day.is_sunday && day.is_holiday ? "Sonn- und Feiertag" : day.is_sunday ? "Sonntag" : "Feiertag";
    results.push(
      result(
        "de_sunday_holiday",
        "yellow",
        `ArbZG §9 ff.: Arbeit an einem ${label} ist gesondert markiert.`,
        date,
      ),
    );
  }

  // R9: Nachtarbeit markieren (Hinweis, gelb).
  if (day.has_night_work) {
    results.push(
      result(
        "de_night_work",
        "yellow",
        `ArbZG §2/§6: Nachtarbeit im Zeitfenster 23:00–06:00 ist gesondert markiert.`,
        date,
      ),
    );
  }

  return results;
}

// ---------------------------------------------------------------------------
// Rest-period evaluation (doc 08 §2.1) — DE rule R7 / EU rule eu_rest_11h.
// ---------------------------------------------------------------------------

/**
 * Evaluate the daily rest period (doc 08 rule de_rest_11h / eu_rest_11h):
 * gap between previous day's last end and next day's first start.
 * Returns a red result if the gap is < 11h, otherwise null (no violation).
 */
export function evaluateRestPeriod(
  prevDayLastEnd: EpochMs,
  nextDayFirstStart: EpochMs,
): ComplianceRuleResult | null {
  const gapSeconds = Math.floor((nextDayFirstStart - prevDayLastEnd) / 1000);
  if (gapSeconds >= MIN_REST_SECONDS) return null;

  // subject_date = local day the rest period ends on. Without a timezone here we
  // use the UTC calendar day of the next start; the caller (day iterator) owns
  // timezone-correct dates and may override subject_date if needed.
  const subjectDate = new Date(nextDayFirstStart).toISOString().slice(0, 10);
  const gapMinutes = toMinutes(Math.max(0, gapSeconds));
  return result(
    "de_rest_11h",
    "red",
    `ArbZG §5: Zwischen zwei Arbeitstagen sind mindestens 11 Stunden Ruhezeit vorgeschrieben; hier liegen nur ${gapMinutes} Minuten. Eintrag am Folgetag später beginnen oder Vortag früher beenden.`,
    subjectDate,
  );
}

// ---------------------------------------------------------------------------
// Week-level evaluation (doc 08 §4) — EU rule eu_weekly_48h.
// ---------------------------------------------------------------------------

/**
 * Evaluate the EU weekly average limit (RL 2003/88/EG Art. 6): > 48h net per
 * week = Risiko (yellow). ≤ 48h = green. Used by the EU profile; the DE profile
 * does not carry a weekly rule (doc 08 §2 lists only daily/rest rules).
 */
export function evaluateWeek(net_seconds_week: Seconds): WeekComplianceResult {
  if (net_seconds_week > EU_WEEKLY_48H_SECONDS) {
    return {
      rule_id: "eu_weekly_48h",
      status: "yellow",
      message: `RL 2003/88/EG Art. 6: Die durchschnittliche Wochenarbeitszeit von ${toMinutes(
        net_seconds_week,
      )} Minuten überschreitet 48 Stunden. Im Referenzzeitraum ausgleichen.`,
      net_seconds_week,
    };
  }
  return {
    rule_id: "eu_weekly_48h",
    status: "green",
    message: `RL 2003/88/EG Art. 6: Wochenarbeitszeit von ${toMinutes(
      net_seconds_week,
    )} Minuten innerhalb der 48-Stunden-Grenze.`,
    net_seconds_week,
  };
}

// ---------------------------------------------------------------------------
// Versioned profiles (doc 08 §5). rules_json is data-driven (doc 08 §5.2).
// ---------------------------------------------------------------------------

/** German ArbZG profile (doc 08 §2, §5.2). Version 1 of the DE evaluation logic. */
export const GERMAN_PROFILE: ComplianceProfile = {
  country_code: "DE",
  jurisdiction_name: "Deutschland (ArbZG)",
  valid_from: "2000-01-01",
  rules_json: {
    profile: "DE",
    night_window: { start: "23:00", end: "06:00" },
    min_break_block_minutes: 15,
    breaks: [
      { rule_id: "de_break_over_6h", over_minutes: 360, min_break_minutes: 30, severity: "violation" },
      { rule_id: "de_break_over_9h", over_minutes: 540, min_break_minutes: 45, severity: "violation" },
    ],
    daily_limits: {
      standard_hours: 8,
      max_hours: 10,
      compensation_window_weeks: 24,
      over_standard_severity: "warning",
      over_max_severity: "violation",
    },
    daily_rest: { rule_id: "de_rest_11h", min_rest_hours: 11, severity: "violation" },
    flags: {
      sunday: true,
      public_holidays: ["2026-01-01", "2026-04-03", "2026-05-01", "2026-12-25", "2026-12-26"],
      night_work: true,
      mark_backdated: true,
    },
    calculation_version: 1,
  },
  source_note: "ArbZG §3/§4/§5, BAG 1 ABR 22/21, EuGH C-55/18",
  severity: "violation",
  user_visible_explanation:
    "Deutsches Arbeitszeitgesetz: Pausenpflicht (30/45 Minuten), Tageshöchstarbeitszeit (8/10 Stunden) und 11 Stunden Ruhezeit.",
  calculation_version: CALCULATION_VERSION,
};

/** Generic EU profile (doc 08 §4). Fallback + basis for country derivations. */
export const EU_PROFILE: ComplianceProfile = {
  country_code: "EU",
  jurisdiction_name: "EU (RL 2003/88/EG)",
  valid_from: "2000-01-01",
  rules_json: {
    profile: "EU",
    night_window: { start: "23:00", end: "06:00" },
    // Generic: no fixed break minutes — set by the country profile (doc 08 §4).
    weekly: { rule_id: "eu_weekly_48h", max_hours_avg: 48, reference_period_months: 4, severity: "warning" },
    daily_rest: { rule_id: "eu_rest_11h", min_rest_hours: 11, severity: "violation" },
    break: { rule_id: "eu_break_over_6h", over_minutes: 360, severity: "warning" },
    night_work: { rule_id: "eu_night_work", max_hours_avg_per_24h: 8 },
    calculation_version: 1,
  },
  source_note: "RL 2003/88/EG Art. 3/4/5/6/8",
  severity: "warning",
  user_visible_explanation:
    "EU-Arbeitszeitrichtlinie als generisches Fallback-Profil: 48-Stunden-Woche (Ø), 11 Stunden Ruhezeit, Pause ab 6 Stunden.",
  calculation_version: CALCULATION_VERSION,
};

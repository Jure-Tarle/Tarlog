/**
 * SPEC-Testfälle 16–19 — Compliance (ArbZG §3/§4/§5, EU RL 2003/88/EG).
 *
 * Testet die REALEN Exporte aus packages/core/src/compliance/index.ts:
 *   - evaluateDay(day: DayEntrySummary, profile: ComplianceProfile): ComplianceRuleResult[]
 *   - evaluateRestPeriod(prevDayLastEnd, nextDayFirstStart): ComplianceRuleResult | null
 *   - evaluateWeek(net_seconds_week): WeekComplianceResult
 *   - GERMAN_PROFILE, EU_PROFILE
 *
 * Auftrag: Implementierung Tarlog V1 gemäß docs/project-time-ledger;
 * die Tests prüfen die Compliance-Engine des Monorepos. KEINE Quelldateien geändert.
 *
 * Konvention: Fehler dokumentieren statt Implementierung anpassen. Wo die
 * Implementierung von der SPEC abweicht, markiert ein "IMPL-BUG"-Kommentar den
 * Testfall; der Green-Agent fixt danach.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateDay,
  evaluateRestPeriod,
  evaluateWeek,
  GERMAN_PROFILE,
  EU_PROFILE,
} from "../src/compliance/index.js";
import type { ComplianceRuleResult, ComplianceStatus, DayEntrySummary } from "../src/types.js";

const H = 3600;
const MIN = 60;

/** Build a DayEntrySummary with sane defaults; override per test. */
function day(overrides: Partial<DayEntrySummary> = {}): DayEntrySummary {
  return {
    date: "2026-07-06", // a Monday
    net_seconds: 0,
    break_seconds: 0,
    break_blocks: [],
    first_start_at: Date.UTC(2026, 6, 6, 8, 0, 0),
    last_end_at: Date.UTC(2026, 6, 6, 16, 0, 0),
    is_sunday: false,
    is_holiday: false,
    has_night_work: false,
    ...overrides,
  };
}

/** Find the result for a given rule_id, or undefined. */
function byRule(results: ComplianceRuleResult[], ruleId: string): ComplianceRuleResult | undefined {
  return results.find((r) => r.rule_id === ruleId);
}

/** The "worst" traffic light present across all results (red > yellow > green). */
function overallStatus(results: ComplianceRuleResult[]): ComplianceStatus {
  if (results.some((r) => r.status === "red")) return "red";
  if (results.some((r) => r.status === "yellow")) return "yellow";
  return "green";
}

// ===========================================================================
// SPEC 16 — Pausenpflicht > 6h (ArbZG §4, Regel R1)
// ===========================================================================
describe("SPEC 16 — ArbZG §4 Pausenpflicht ab 6 Stunden", () => {
  it("16a: > 6h netto OHNE Pause → red (de_break_over_6h)", () => {
    // 6h 1min netto, keine Pause.
    const results = evaluateDay(day({ net_seconds: 6 * H + 60, break_blocks: [] }), GERMAN_PROFILE);
    const r = byRule(results, "de_break_over_6h");
    expect(r).toBeDefined();
    expect(r?.status).toBe("red");
    expect(overallStatus(results)).toBe("red");
  });

  it("16b: genau 6h netto ohne Pause → green (keine Pflichtpause)", () => {
    // Exakt 6h: die Grenze ist > 6h, exakt 6h löst R1 NICHT aus.
    const results = evaluateDay(day({ net_seconds: 6 * H, break_blocks: [] }), GERMAN_PROFILE);
    expect(byRule(results, "de_break_over_6h")).toBeUndefined();
    // Kein Pausen-, Tages- oder sonstiger Verstoß → gesamt green.
    expect(overallStatus(results)).toBe("green");
    expect(byRule(results, "de_daily_standard_8h")?.status).toBe("green");
  });

  it("16c: > 6h netto mit EINEM 30-min-Block → green (Pflichtpause erfüllt)", () => {
    // 7h netto, ein zusammenhängender 30-min-Block (≥ 15min ⇒ zählt).
    const results = evaluateDay(day({ net_seconds: 7 * H, break_blocks: [30 * MIN] }), GERMAN_PROFILE);
    expect(byRule(results, "de_break_over_6h")).toBeUndefined();
    // 7h ≤ 8h ⇒ Tages-Standard green, keine kurzen Blöcke ⇒ kein de_break_min_block.
    expect(byRule(results, "de_break_min_block")).toBeUndefined();
    expect(overallStatus(results)).toBe("green");
  });

  it("16d: > 6h netto mit 2×10-min-Blöcken (< 15min) → red (Blöcke zählen nicht)", () => {
    // 7h netto, 2 Blöcke à 10min. Summe 20min, ABER kein Block ≥ 15min ⇒
    // countingBreakSeconds = 0 < 30min ⇒ R1 red. Zusätzlich de_break_min_block (yellow).
    const results = evaluateDay(day({ net_seconds: 7 * H, break_blocks: [10 * MIN, 10 * MIN] }), GERMAN_PROFILE);
    const r = byRule(results, "de_break_over_6h");
    expect(r).toBeDefined();
    expect(r?.status).toBe("red");
    // Kurze Blöcke werden zusätzlich als Hinweis markiert.
    expect(byRule(results, "de_break_min_block")?.status).toBe("yellow");
    expect(overallStatus(results)).toBe("red");
  });
});

// ===========================================================================
// SPEC 17 — Pausenpflicht > 9h + Tageshöchstarbeitszeit (ArbZG §3/§4, R2/R4/R6)
// ===========================================================================
describe("SPEC 17 — ArbZG §3/§4 ab 9h/8h/10h", () => {
  it("17a: > 9h netto mit nur 30min Pause → red (45min nötig, de_break_over_9h)", () => {
    // 9h 30min netto, ein 30-min-Block (zählt, aber < 45min).
    const results = evaluateDay(day({ net_seconds: 9 * H + 30 * MIN, break_blocks: [30 * MIN] }), GERMAN_PROFILE);
    const r = byRule(results, "de_break_over_9h");
    expect(r).toBeDefined();
    expect(r?.status).toBe("red");
    // > 9h ⇒ R1 (de_break_over_6h) greift NICHT (net > OVER_9H_SECONDS).
    expect(byRule(results, "de_break_over_6h")).toBeUndefined();
    expect(overallStatus(results)).toBe("red");
  });

  it("17b: > 8h netto (≤ 10h) → yellow (de_daily_extend_10h, Ausgleich nötig)", () => {
    // 8h 30min netto, ausreichende 45-min-Pause ⇒ kein Pausenverstoß,
    // nur die Tages-Warnung (> 8h) bleibt ⇒ gesamt yellow.
    const results = evaluateDay(day({ net_seconds: 8 * H + 30 * MIN, break_blocks: [45 * MIN] }), GERMAN_PROFILE);
    const r = byRule(results, "de_daily_extend_10h");
    expect(r).toBeDefined();
    expect(r?.status).toBe("yellow");
    expect(byRule(results, "de_daily_standard_8h")).toBeUndefined();
    expect(byRule(results, "de_daily_over_10h")).toBeUndefined();
    expect(overallStatus(results)).toBe("yellow");
  });

  it("17c: > 10h netto → red (de_daily_over_10h, Tageshöchstarbeitszeit)", () => {
    // 10h 30min netto, mit ausreichender 45-min-Pause ⇒ Pausen ok,
    // aber > 10h ⇒ schwerer Verstoß red.
    const results = evaluateDay(day({ net_seconds: 10 * H + 30 * MIN, break_blocks: [45 * MIN] }), GERMAN_PROFILE);
    const r = byRule(results, "de_daily_over_10h");
    expect(r).toBeDefined();
    expect(r?.status).toBe("red");
    // > 10h ⇒ die yellow-Warnung de_daily_extend_10h wird NICHT zusätzlich emittiert.
    expect(byRule(results, "de_daily_extend_10h")).toBeUndefined();
    expect(overallStatus(results)).toBe("red");
  });
});

// ===========================================================================
// SPEC 18 — Ruhezeit zwischen Arbeitstagen (ArbZG §5, R7)
// ===========================================================================
describe("SPEC 18 — ArbZG §5 Ruhezeit ≥ 11h zwischen Tagen", () => {
  it("18a: Ruhezeit < 11h → red (de_rest_11h)", () => {
    // Vortag Ende 22:00, Folgetag Start 07:00 ⇒ 9h Ruhe < 11h.
    const prevEnd = Date.UTC(2026, 6, 6, 22, 0, 0);
    const nextStart = Date.UTC(2026, 6, 7, 7, 0, 0);
    const r = evaluateRestPeriod(prevEnd, nextStart);
    expect(r).not.toBeNull();
    expect(r?.rule_id).toBe("de_rest_11h");
    expect(r?.status).toBe("red");
  });

  it("18b: Ruhezeit genau 11h → null (kein Verstoß)", () => {
    // Vortag Ende 20:00, Folgetag Start 07:00 ⇒ exakt 11h ⇒ konform.
    const prevEnd = Date.UTC(2026, 6, 6, 20, 0, 0);
    const nextStart = Date.UTC(2026, 6, 7, 7, 0, 0);
    expect(evaluateRestPeriod(prevEnd, nextStart)).toBeNull();
  });

  it("18c: Ruhezeit > 11h → null (kein Verstoß)", () => {
    // 13h Ruhe.
    const prevEnd = Date.UTC(2026, 6, 6, 18, 0, 0);
    const nextStart = Date.UTC(2026, 6, 7, 7, 0, 0);
    expect(evaluateRestPeriod(prevEnd, nextStart)).toBeNull();
  });
});

// ===========================================================================
// SPEC 19 — Markierungen (Sonntag, Nachtarbeit) + EU-Woche > 48h
// ===========================================================================
describe("SPEC 19 — Sonntag/Nachtarbeit-Markierung + EU-Wochenlimit", () => {
  it("19a: Sonntagsarbeit → Markierung (de_sunday_holiday, yellow)", () => {
    const results = evaluateDay(day({ net_seconds: 4 * H, is_sunday: true, date: "2026-07-05" }), GERMAN_PROFILE);
    const r = byRule(results, "de_sunday_holiday");
    expect(r).toBeDefined();
    expect(r?.status).toBe("yellow");
    expect(r?.message).toContain("Sonntag");
  });

  it("19b: Nachtarbeit → Markierung (de_night_work, yellow)", () => {
    const results = evaluateDay(day({ net_seconds: 4 * H, has_night_work: true }), GERMAN_PROFILE);
    const r = byRule(results, "de_night_work");
    expect(r).toBeDefined();
    expect(r?.status).toBe("yellow");
  });

  it("19c: EU-Woche > 48h → yellow (eu_weekly_48h)", () => {
    // 49h netto in der Woche ⇒ Risiko.
    const r = evaluateWeek(49 * H);
    expect(r.rule_id).toBe("eu_weekly_48h");
    expect(r.status).toBe("yellow");
    expect(r.net_seconds_week).toBe(49 * H);
  });

  it("19d: EU-Woche genau 48h → green (an der Grenze konform)", () => {
    const r = evaluateWeek(48 * H);
    expect(r.status).toBe("green");
  });

  it("19e: EU_PROFILE trägt das wöchentliche 48h-Limit (Datenmodell)", () => {
    // Sanity: EU-Profil enthält weekly-Regel; DE-Profil nicht.
    expect(EU_PROFILE.country_code).toBe("EU");
    const weekly = (EU_PROFILE.rules_json as Record<string, unknown>).weekly as
      | { rule_id?: string; max_hours_avg?: number }
      | undefined;
    expect(weekly?.rule_id).toBe("eu_weekly_48h");
    expect(weekly?.max_hours_avg).toBe(48);
  });
});

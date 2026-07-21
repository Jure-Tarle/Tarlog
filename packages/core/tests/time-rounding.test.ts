/**
 * SPEC-Testfälle 8,15 (docs/project-time-ledger/12-qualitaet.md §2).
 * Pausen, Rundung 15 min (KANON 70→75 min), Mitternacht-Split, Sommer-/Winterzeit,
 * Zeitzonen, alle 9 Rundungsmodi, calculateEntry Ende-zu-Ende inkl.
 * billing_amount_snapshot. Testet REALE Exporte aus @tarlog/core (src via NodeNext).
 * KEINE Quelldatei wird geändert, bei Rot: Fehler dokumentiert, nicht gefixt.
 */
import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import {
  computeBreakSeconds,
  computeGrossSeconds,
  computeNetSeconds,
  computeNetSecondsForInput,
  resolveDayBoundary,
  spansMidnight,
  splitAtMidnight,
  toLocal,
} from "../src/time/index.js";
import { applyRounding } from "../src/rounding/index.js";
import { calculateEntry } from "../src/billing/index.js";
import type {
  BreakInput,
  RateSnapshot,
  RoundingRule,
  TimeEntryCalcInput,
} from "../src/types.js";

// --- Helfer: lokale Wanduhr → UTC epoch-ms in einer IANA-Zone -----------------
function at(
  zone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number {
  const dt = DateTime.fromObject({ year, month, day, hour, minute }, { zone });
  if (!dt.isValid) throw new Error(`Test-Setup: ungültige Zeit ${dt.invalidReason}`);
  return dt.toMillis();
}

const BERLIN = "Europe/Berlin";
const NY = "America/New_York";

// Kanonische Rundungsregel: ceil_started_interval 900s (15 min).
const RULE_CEIL_15: RoundingRule = {
  id: "00000000-0000-7000-8000-000000000001",
  mode: "ceil_started_interval",
  interval_seconds: 900,
};

// ============================================================================
// SPEC 8, Pausenberechnung (mehrere Pausen, Überlappung)
// net = actual − break; mehrere Pausen korrekt summiert.
// ============================================================================
describe("SPEC 8, Pausenberechnung", () => {
  it("summiert mehrere nicht-überlappende Pausen (computeBreakSeconds)", () => {
    const breaks: BreakInput[] = [
      { started_at: 1_000_000, ended_at: 1_000_000 + 600_000 }, // 600 s
      { started_at: 2_000_000, ended_at: 2_000_000 + 300_000 }, // 300 s
      { started_at: 3_000_000, ended_at: 3_000_000 + 900_000 }, // 900 s
    ];
    expect(computeBreakSeconds(breaks)).toBe(1800);
  });

  it("net = actual − break (computeNetSeconds)", () => {
    const gross = computeGrossSeconds(0, 3_600_000); // 3600 s
    const brk = computeBreakSeconds([{ started_at: 0, ended_at: 900_000 }]); // 900 s
    expect(computeNetSeconds(gross, brk)).toBe(2700);
  });

  it("laufende Pause (ended_at=null) zählt 0", () => {
    const breaks: BreakInput[] = [
      { started_at: 0, ended_at: 600_000 }, // 600 s
      { started_at: 700_000, ended_at: null }, // läuft → 0
    ];
    expect(computeBreakSeconds(breaks)).toBe(600);
  });

  it("überlappende Pausen: computeNetSecondsForInput summiert Pausen (Doku 06 §break_duration_seconds, 07 §2 Fn 2)", () => {
    // Eintrag 0..3600 s. Zwei Pausen die sich überlappen: 0..1200 und 600..1800.
    const input: TimeEntryCalcInput = {
      actual_started_at: 0,
      actual_ended_at: 3_600_000,
      timezone: BERLIN,
      breaks: [
        { started_at: 0, ended_at: 1_200_000 }, // 1200 s
        { started_at: 600_000, ended_at: 1_800_000 }, // 1200 s, überlappt 600 s
      ],
    };
    // DOKU (06 Zeile 332 "Summe aller Pausen"; 07 §2 Fn 2 "Summe aller
    // time_entry_breaks"): break_duration_seconds ist die SUMME aller Pausen,
    // keine Union/Entdopplung. Jede Pause wird ans Eintrag-Intervall geklemmt
    // und summiert: 1200 + 1200 = 2400. Überlappungserkennung ist eine
    // UI-Warnung (Doku 03 §8, 11 §8), keine Engine-Entdopplung.
    // net = 3600 − 2400 = 1200.
    expect(computeNetSecondsForInput(input)).toBe(1200);
  });
});

// ============================================================================
// SPEC 9, Rundung auf 15 Minuten: netto 70 min → billing 4500 (75 min)
// ============================================================================
describe("SPEC 9, Rundung 15 min (ceil_started_interval)", () => {
  it("netto 4200 s (70 min) → billing_duration_seconds = 4500", () => {
    const r = applyRounding(4200, RULE_CEIL_15);
    expect(r.billing_duration_seconds).toBe(4500);
  });

  it("reason ist nachvollziehbar (ceil_started_interval:900s)", () => {
    const r = applyRounding(4200, RULE_CEIL_15);
    expect(r.rounding_reason).toBe("ceil_started_interval:900s");
  });

  it("exakt auf Intervall (4500 s) bleibt 4500, delta 0", () => {
    const r = applyRounding(4500, RULE_CEIL_15);
    expect(r.billing_duration_seconds).toBe(4500);
    expect(r.rounding_delta_seconds).toBe(0);
  });
});

// ============================================================================
// SPEC 10, 70 min → 75 min Abrechnungszeit, rounding_delta_seconds = +300
// ============================================================================
describe("SPEC 10, delta +300 (1h10 → 1h15)", () => {
  it("rounding_delta_seconds = +300", () => {
    const r = applyRounding(4200, RULE_CEIL_15);
    expect(r.rounding_delta_seconds).toBe(300);
  });

  it("delta = billing − net", () => {
    const r = applyRounding(4200, RULE_CEIL_15);
    expect(r.rounding_delta_seconds).toBe(r.billing_duration_seconds - 4200);
  });
});

// ============================================================================
// SPEC 11, actual_duration_seconds bleibt exakt 4200 (Rundung überschreibt nie)
// ============================================================================
describe("SPEC 11, actual_duration_seconds unverändert", () => {
  it("calculateEntry: gross bleibt 4200 trotz billing 4500", () => {
    const input: TimeEntryCalcInput = {
      actual_started_at: 0,
      actual_ended_at: 4_200_000, // exakt 4200 s
      timezone: BERLIN,
      breaks: [],
    };
    const rate: RateSnapshot = { amount_cents: 9000, currency: "EUR", source: "project" };
    const res = calculateEntry(input, RULE_CEIL_15, rate);
    expect(res.actual_duration_seconds).toBe(4200);
    expect(res.net_work_duration_seconds).toBe(4200);
    expect(res.billing_duration_seconds).toBe(4500);
    // getrennt nachweisbar: actual ≠ billing
    expect(res.actual_duration_seconds).not.toBe(res.billing_duration_seconds);
  });
});

// ============================================================================
// SPEC 12, über Mitternacht (splitAtMidnight Europe/Berlin)
// Start 23:30, Ende 00:45 = 75 min, als "über Mitternacht" markiert, Split.
// ============================================================================
describe("SPEC 12, über Mitternacht", () => {
  const start = at(BERLIN, 2025, 1, 15, 23, 30);
  const end = at(BERLIN, 2025, 1, 16, 0, 45);
  const input: TimeEntryCalcInput = {
    actual_started_at: start,
    actual_ended_at: end,
    timezone: BERLIN,
    breaks: [],
  };

  it("gross = 4500 s (75 min)", () => {
    expect(computeGrossSeconds(start, end)).toBe(4500);
  });

  it("spansMidnight = true", () => {
    expect(spansMidnight(input)).toBe(true);
  });

  it("splitAtMidnight liefert 2 Segmente, verlustfrei (Summe = 4500 s)", () => {
    const segs = splitAtMidnight(input);
    expect(segs).toHaveLength(2);
    const sum = segs.reduce(
      (acc, s) => acc + computeGrossSeconds(s.actual_started_at, s.actual_ended_at!),
      0,
    );
    expect(sum).toBe(4500);
    // Segment 1 endet an lokaler Mitternacht des Folgetags.
    expect(resolveDayBoundary(segs[0]!.actual_started_at, BERLIN)).toBe("2025-01-15");
    expect(resolveDayBoundary(segs[1]!.actual_started_at, BERLIN)).toBe("2025-01-16");
  });
});

// ============================================================================
// SPEC 13, Sommerzeit: 30.03.2025 01:30→03:30 Europe/Berlin = 3600 echte s
// Uhr springt +1 h; Wanduhr-Differenz 2 h, reale Dauer 1 h.
// ============================================================================
describe("SPEC 13, Sommerzeit (Frühjahr +1h)", () => {
  const start = at(BERLIN, 2025, 3, 30, 1, 30);
  const end = at(BERLIN, 2025, 3, 30, 3, 30);

  it("reale Dauer = 3600 s (nicht 7200)", () => {
    expect(computeGrossSeconds(start, end)).toBe(3600);
  });

  it("Offset ändert sich über den Übergang (+60 → +120 min)", () => {
    expect(toLocal(start, BERLIN).offsetMinutes).toBe(60);
    expect(toLocal(end, BERLIN).offsetMinutes).toBe(120);
  });
});

// ============================================================================
// SPEC 14, Winterzeit: 26.10.2025 01:30→03:30 Europe/Berlin = 10800 echte s
// Uhr springt −1 h; Wanduhr-Differenz 2 h, reale Dauer 3 h.
// ============================================================================
describe("SPEC 14, Winterzeit (Herbst −1h)", () => {
  const start = at(BERLIN, 2025, 10, 26, 1, 30);
  const end = at(BERLIN, 2025, 10, 26, 3, 30);

  it("reale Dauer = 10800 s (nicht 7200, keine negative/doppelte Stunde)", () => {
    expect(computeGrossSeconds(start, end)).toBe(10800);
  });

  it("Offset ändert sich über den Übergang (+120 → +60 min)", () => {
    expect(toLocal(start, BERLIN).offsetMinutes).toBe(120);
    expect(toLocal(end, BERLIN).offsetMinutes).toBe(60);
  });
});

// ============================================================================
// SPEC 15, Zeitzonen: resolveDayBoundary America/New_York vs Europe/Berlin
// Derselbe UTC-Instant → unterschiedlicher lokaler Kalendertag; Dauer identisch.
// ============================================================================
describe("SPEC 15, Zeitzonen", () => {
  // 15.01.2025 03:00 UTC → Berlin 04:00 (15.), NY 22:00 (14.)
  const instant = DateTime.fromObject(
    { year: 2025, month: 1, day: 15, hour: 3, minute: 0 },
    { zone: "UTC" },
  ).toMillis();

  it("resolveDayBoundary: Berlin = 2025-01-15, NY = 2025-01-14", () => {
    expect(resolveDayBoundary(instant, BERLIN)).toBe("2025-01-15");
    expect(resolveDayBoundary(instant, NY)).toBe("2025-01-14");
  });

  it("Dauer ist zonenunabhängig (UTC-Epoch): 3600 s in beiden Zonen", () => {
    const end = instant + 3_600_000;
    expect(computeGrossSeconds(instant, end)).toBe(3600);
    // Reise über Zonen verfälscht Dauer nicht: gleiche epochs, gleiche Dauer.
    const inputBerlin: TimeEntryCalcInput = {
      actual_started_at: instant,
      actual_ended_at: end,
      timezone: BERLIN,
      breaks: [],
    };
    const inputNy: TimeEntryCalcInput = { ...inputBerlin, timezone: NY };
    expect(computeNetSecondsForInput(inputBerlin)).toBe(computeNetSecondsForInput(inputNy));
  });
});

// ============================================================================
// Alle 9 Rundungsmodi, je min. 1 Assertion (doc 07 §3.2).
// Netto 4200 s (70 min); Intervall 900 s; minimum 5400 s wo nötig.
// ============================================================================
describe("Alle 9 Rundungsmodi", () => {
  const NET = 4200;
  const id = "00000000-0000-7000-8000-0000000000ff";

  it("none: pass-through, delta 0", () => {
    const r = applyRounding(NET, { id, mode: "none" });
    expect(r.billing_duration_seconds).toBe(4200);
    expect(r.rounding_delta_seconds).toBe(0);
  });

  it("always_up: 4200 → 4500", () => {
    const r = applyRounding(NET, { id, mode: "always_up", interval_seconds: 900 });
    expect(r.billing_duration_seconds).toBe(4500);
  });

  it("always_down: 4200 → 3600", () => {
    const r = applyRounding(NET, { id, mode: "always_down", interval_seconds: 900 });
    expect(r.billing_duration_seconds).toBe(3600);
  });

  it("commercial (round half up): 4200 rest 600 < 450? nein 600≥450 → 4500", () => {
    // 4200 = 4*900 + 600; halbes Intervall = 450; 600 ≥ 450 → aufrunden.
    const r = applyRounding(NET, { id, mode: "commercial", interval_seconds: 900 });
    expect(r.billing_duration_seconds).toBe(4500);
  });

  it("nearest_interval: 4200 (rest 600 ≥ 450) → 4500", () => {
    const r = applyRounding(NET, { id, mode: "nearest_interval", interval_seconds: 900 });
    expect(r.billing_duration_seconds).toBe(4500);
  });

  it("nearest_interval: 4100 (rest 500 ≥ 450) → 4500, aber 3800 (rest 200 < 450) → 3600", () => {
    const up = applyRounding(4100, { id, mode: "nearest_interval", interval_seconds: 900 });
    const down = applyRounding(3800, { id, mode: "nearest_interval", interval_seconds: 900 });
    expect(up.billing_duration_seconds).toBe(4500);
    expect(down.billing_duration_seconds).toBe(3600);
  });

  it("min_per_entry: net 4200 < min 5400 → 5400", () => {
    const r = applyRounding(NET, { id, mode: "min_per_entry", minimum_seconds: 5400 });
    expect(r.billing_duration_seconds).toBe(5400);
  });

  it("min_per_entry: wendet erst die Mindestdauer und danach die Intervallrundung an", () => {
    const r = applyRounding(1300, {
      id,
      mode: "min_per_entry",
      minimum_seconds: 1800,
      interval_seconds: 900,
    });
    expect(r.billing_duration_seconds).toBe(1800);

    const aboveMinimum = applyRounding(1900, {
      id,
      mode: "min_per_entry",
      minimum_seconds: 1800,
      interval_seconds: 900,
    });
    expect(aboveMinimum.billing_duration_seconds).toBe(2700);
  });

  it("min_per_day: deferred pass-through (aggregat extern)", () => {
    const r = applyRounding(NET, { id, mode: "min_per_day", minimum_seconds: 5400 });
    expect(r.billing_duration_seconds).toBe(4200);
    expect(r.rounding_reason).toBe("min_per_day:deferred:day");
  });

  it("min_per_project: deferred pass-through (aggregat extern)", () => {
    const r = applyRounding(NET, { id, mode: "min_per_project", minimum_seconds: 5400 });
    expect(r.billing_duration_seconds).toBe(4200);
    expect(r.rounding_reason).toBe("min_per_project:deferred:project");
  });

  it("ceil_started_interval: 4200 → 4500 (KANON)", () => {
    const r = applyRounding(NET, { id, mode: "ceil_started_interval", interval_seconds: 900 });
    expect(r.billing_duration_seconds).toBe(4500);
    expect(r.rounding_delta_seconds).toBe(300);
  });
});

// ============================================================================
// calculateEntry, Ende-zu-Ende inkl. billing_amount_snapshot.
// KANON: Rate 9000 cents/h × 4500 s = 11250 cents.
// ============================================================================
describe("calculateEntry, Pipeline Ende-zu-Ende", () => {
  const rate: RateSnapshot = { amount_cents: 9000, currency: "EUR", source: "project" };

  it("KANON: 70 min brutto, keine Pause → billing 4500, amount 11250 cents", () => {
    const input: TimeEntryCalcInput = {
      actual_started_at: 0,
      actual_ended_at: 4_200_000,
      timezone: BERLIN,
      breaks: [],
    };
    const res = calculateEntry(input, RULE_CEIL_15, rate);
    expect(res.actual_duration_seconds).toBe(4200);
    expect(res.break_duration_seconds).toBe(0);
    expect(res.net_work_duration_seconds).toBe(4200);
    expect(res.billing_duration_seconds).toBe(4500);
    expect(res.rounding_delta_seconds).toBe(300);
    expect(res.rounding_reason).toBe("ceil_started_interval:900s");
    expect(res.billing_amount_snapshot).toBe(11250);
    expect(res.calculation_version).toBe(1);
    expect(res.rounding_rule_id).toBe(RULE_CEIL_15.id);
    expect(res.rate_snapshot).toBe(rate);
  });

  it("mit Pause: 90 min brutto − 20 min Pause = 70 min netto → billing 4500, amount 11250", () => {
    // brutto 5400 s, Pause 1200 s → netto 4200 s → gerundet 4500 s.
    const input: TimeEntryCalcInput = {
      actual_started_at: 0,
      actual_ended_at: 5_400_000,
      timezone: BERLIN,
      breaks: [{ started_at: 1_000_000, ended_at: 2_200_000 }], // 1200 s
    };
    const res = calculateEntry(input, RULE_CEIL_15, rate);
    expect(res.actual_duration_seconds).toBe(5400);
    expect(res.break_duration_seconds).toBe(1200);
    expect(res.net_work_duration_seconds).toBe(4200);
    expect(res.billing_duration_seconds).toBe(4500);
    expect(res.billing_amount_snapshot).toBe(11250);
  });

  it("laufender Eintrag (actual_ended_at=null) wirft Fehler", () => {
    const input: TimeEntryCalcInput = {
      actual_started_at: 0,
      actual_ended_at: null,
      timezone: BERLIN,
      breaks: [],
    };
    expect(() => calculateEntry(input, RULE_CEIL_15, rate)).toThrow();
  });
});

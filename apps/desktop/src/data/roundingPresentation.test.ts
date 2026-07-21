import { describe, expect, it } from "vitest";
import { presentRounding } from "./roundingPresentation";

describe("rounding presentation", () => {
  it("turns internal rule identifiers into readable German", () => {
    expect(presentRounding({
      billing_duration_seconds: 3_600,
      rounding_delta_seconds: 100,
      rounding_reason: "ceil_started_interval:900s",
    })).toEqual({
      label: "Auf 15 Minuten aufgerundet",
      detail: "+2 Min. gegenüber der Nettozeit",
    });
  });
});

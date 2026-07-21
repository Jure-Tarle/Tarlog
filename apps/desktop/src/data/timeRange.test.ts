import { describe, expect, it } from "vitest";
import { adjustRangeForStartChange } from "./timeRange";

describe("adjustRangeForStartChange", () => {
  it("moves the end forward by the existing duration when the new start would invalidate the range", () => {
    expect(adjustRangeForStartChange("08:00", "08:30", "10:00", false)).toEqual({
      start: "10:00",
      end: "10:30",
      endsNextDay: false,
    });
  });

  it("keeps the end unchanged when it is still after the new start", () => {
    expect(adjustRangeForStartChange("08:00", "08:30", "08:15", false)).toEqual({
      start: "08:15",
      end: "08:30",
      endsNextDay: false,
    });
  });

  it("also adjusts when start and end would become identical", () => {
    expect(adjustRangeForStartChange("08:00", "08:30", "08:30", false)).toEqual({
      start: "08:30",
      end: "09:00",
      endsNextDay: false,
    });
  });

  it("moves an end across midnight and marks it as next day", () => {
    expect(adjustRangeForStartChange("08:00", "08:30", "23:50", false)).toEqual({
      start: "23:50",
      end: "00:20",
      endsNextDay: true,
    });
  });

  it("does not change an explicit next-day end", () => {
    expect(adjustRangeForStartChange("22:00", "06:00", "23:00", true)).toEqual({
      start: "23:00",
      end: "06:00",
      endsNextDay: true,
    });
  });
});

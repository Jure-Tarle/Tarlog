/**
 * shared.ts — small helpers reused by the ledger pages. No DB access of its own;
 * it only composes the finished `src/data` repositories + @ptl/core aggregates.
 */
import { useEffect, useState } from "react";
import { session } from "../data/session";
import { entries, type TimeEntry, type Break } from "../data/repositories";
import { buildDaySummaries, evaluateDays, type DayCompliance } from "../data/aggregates";
import type { IanaTimezone } from "@ptl/core";
import { deviceTimezone } from "../data/format";

/** Resolve the account timezone once (falls back to the device zone). */
export function useTimezone(): IanaTimezone {
  const [tz, setTz] = useState<IanaTimezone>(() => deviceTimezone());
  useEffect(() => {
    let alive = true;
    void session().then((s) => {
      if (alive && s.timezone) setTz(s.timezone);
    });
    return () => {
      alive = false;
    };
  }, []);
  return tz;
}

/** Entries in a range plus their breaks and the per-day compliance verdicts. */
export interface RangeData {
  list: TimeEntry[];
  breaksByEntry: Map<string, Break[]>;
  days: DayCompliance[];
}

/** Load entries in [from,to), fetch each entry's breaks, evaluate compliance. */
export async function loadRange(
  from: number,
  to: number,
  tz: IanaTimezone,
): Promise<RangeData> {
  const list = await entries.inRange(from, to);
  const breaksByEntry = new Map<string, Break[]>();
  await Promise.all(
    list.map(async (e) => {
      breaksByEntry.set(e.id, await entries.breaks(e.id));
    }),
  );
  const summaries = buildDaySummaries(list, breaksByEntry, tz);
  return { list, breaksByEntry, days: evaluateDays(summaries) };
}

/** Build an id→name lookup from a list of {id,name} rows. */
export function nameMap<T extends { id: string; name: string }>(rows: T[]): Map<string, string> {
  return new Map(rows.map((r) => [r.id, r.name]));
}

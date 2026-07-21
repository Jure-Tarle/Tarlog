const MINUTES_PER_DAY = 24 * 60;
const FALLBACK_DURATION_MINUTES = 30;

function toMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function toTimeValue(minutes: number): string {
  const normalized = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

export type AdjustedTimeRange = {
  start: string;
  end: string;
  endsNextDay: boolean;
};

/**
 * Keeps a valid range while the start time is edited. The existing end stays
 * untouched whenever it is still after the new start. If it would become
 * invalid, the previous duration is carried forward instead.
 */
export function adjustRangeForStartChange(
  previousStart: string,
  previousEnd: string,
  nextStart: string,
  endsNextDay: boolean,
): AdjustedTimeRange {
  const previousStartMinutes = toMinutes(previousStart);
  const previousEndMinutes = toMinutes(previousEnd);
  const nextStartMinutes = toMinutes(nextStart);

  const unchanged = { start: nextStart, end: previousEnd, endsNextDay };
  if (previousStartMinutes == null || previousEndMinutes == null || nextStartMinutes == null) return unchanged;

  // With an explicit next-day end, the range remains ordered for every start time.
  if (endsNextDay || nextStartMinutes < previousEndMinutes) return unchanged;

  const previousDuration = previousEndMinutes - previousStartMinutes;
  const duration = previousDuration > 0 ? previousDuration : FALLBACK_DURATION_MINUTES;
  const nextEndMinutes = nextStartMinutes + duration;

  return {
    start: nextStart,
    end: toTimeValue(nextEndMinutes),
    endsNextDay: nextEndMinutes >= MINUTES_PER_DAY,
  };
}

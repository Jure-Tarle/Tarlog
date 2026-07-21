/**
 * Heute (doc 11 §7 nr. 11): today's entries with net time, breaks and the
 * day total. A quiet ledger list, one row per entry, tabular figures aligned
 * on the right, a summary card on top. Data via `entries.inRange` for the local
 * day window; sums are plain aggregation (no billing/rounding math here, that
 * stays in @tarlog/core when entries are created).
 */
import { useMemo } from "react";
import { View } from "react-native";
import { Body, Card, Label, Mono, Placeholder, Row, Screen, SectionHeader } from "../../src/components/ui";
import { space } from "../../src/components/theme";
import { useStore } from "../../src/components/useStore";
import { deviceTimezone, endOfDayMs, formatHms, localDate, nowMs, startOfDayMs } from "../../src/lib/time";
import { entries as entryStore } from "../../src/data";
import type { TimeEntry } from "../../src/data";

/** "HH:MM" local wall-clock label for an instant in a given zone. */
function clock(atMs: number, zone: string): string {
  return new Date(atMs).toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: zone,
  });
}

export default function TodayScreen() {
  const zone = deviceTimezone();
  const today = localDate(nowMs(), zone);
  const from = startOfDayMs(today, zone);
  const to = endOfDayMs(today, zone);

  const { data, loading, pending } = useStore<TimeEntry[]>(() => entryStore.inRange(from, to), [from, to]);
  const list = data ?? [];

  const totals = useMemo(() => {
    let net = 0;
    let brk = 0;
    let billing = 0;
    for (const e of list) {
      net += e.net_work_duration_seconds;
      brk += e.break_duration_seconds;
      billing += e.billing_duration_seconds;
    }
    return { net, brk, billing };
  }, [list]);

  return (
    <Screen>
      <Body>
        <Card>
          <Label muted>{today}</Label>
          <View style={{ height: space.sm }} />
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View>
              <Label faint>Netto</Label>
              <Mono size="lg" tone="accent">
                {formatHms(totals.net)}
              </Mono>
            </View>
            <View>
              <Label faint>Pausen</Label>
              <Mono size="lg">{formatHms(totals.brk)}</Mono>
            </View>
            <View>
              <Label faint>Abrechenbar</Label>
              <Mono size="lg">{formatHms(totals.billing)}</Mono>
            </View>
          </View>
        </Card>

        <View>
          <SectionHeader>Einträge</SectionHeader>
          <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
            {pending ? (
              <Placeholder title="Keine Einträge" detail="Eintrags-Store folgt." />
            ) : loading ? (
              <Placeholder loading title="Lade Tag …" />
            ) : list.length === 0 ? (
              <Placeholder title="Heute noch nichts erfasst" detail="Starte den Timer oder trage nach." />
            ) : (
              list.map((e) => (
                <Row
                  key={e.id}
                  primary={e.description ?? "(ohne Beschreibung)"}
                  secondary={`${clock(e.actual_started_at, e.timezone)},${
                    e.actual_ended_at != null ? clock(e.actual_ended_at, e.timezone) : "…"
                  }${e.is_backdated ? " | nachgetragen" : ""}`}
                  figure={formatHms(e.net_work_duration_seconds)}
                  figureSub={e.is_billable ? "abrechenbar" : "intern"}
                />
              ))
            )}
          </Card>
        </View>
      </Body>
    </Screen>
  );
}

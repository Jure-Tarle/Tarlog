/**
 * Woche (doc 11 §7 nr. 12): sieben Tageszeilen mit Nettozeit, Pausen und
 * Abrechnungszeit, plus Wochensumme. Rein lesend über `entries.inRange` für das
 * lokale Wochenfenster; keine Rundungsmathematik hier (die liegt in @tarlog/core).
 */
import { useMemo } from "react";
import { View } from "react-native";
import { Body, Card, Label, Mono, Placeholder, Row, Screen, SectionHeader } from "../../src/components/ui";
import { space } from "../../src/components/theme";
import { useStore } from "../../src/components/useStore";
import { deviceTimezone, endOfDayMs, formatHms, localDate, nowMs, startOfDayMs } from "../../src/lib/time";
import { entries as entryStore } from "../../src/data";
import type { TimeEntry } from "../../src/data";

const DAY_MS = 86_400_000;

/** Die sieben lokalen Kalendertage der laufenden Woche, Montag zuerst (ISO). */
function weekDays(zone: string): string[] {
  const startToday = startOfDayMs(localDate(nowMs(), zone), zone);
  const dow = (new Date(startToday).getDay() + 6) % 7; // JS: 0 = Sonntag
  const monday = startToday - dow * DAY_MS;
  return Array.from({ length: 7 }, (_, i) => localDate(monday + i * DAY_MS, zone));
}

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

interface Bucket {
  net: number;
  brk: number;
  billing: number;
  count: number;
}

export default function WeekScreen() {
  const zone = deviceTimezone();
  const days = useMemo(() => weekDays(zone), [zone]);
  const from = startOfDayMs(days[0]!, zone);
  const to = endOfDayMs(days[6]!, zone);

  const { data, loading, pending } = useStore<TimeEntry[]>(
    () => entryStore.inRange(from, to),
    [from, to],
  );
  const list = data ?? [];

  const byDay = useMemo(() => {
    const m = new Map<string, Bucket>();
    for (const d of days) m.set(d, { net: 0, brk: 0, billing: 0, count: 0 });
    for (const e of list) {
      const bucket = m.get(localDate(e.actual_started_at, e.timezone || zone));
      if (!bucket) continue;
      bucket.net += e.net_work_duration_seconds;
      bucket.brk += e.break_duration_seconds;
      bucket.billing += e.billing_duration_seconds;
      bucket.count += 1;
    }
    return m;
  }, [list, days, zone]);

  const totals = useMemo(() => {
    let net = 0;
    let brk = 0;
    let billing = 0;
    for (const b of byDay.values()) {
      net += b.net;
      brk += b.brk;
      billing += b.billing;
    }
    return { net, brk, billing };
  }, [byDay]);

  return (
    <Screen>
      <Body>
        <Card>
          <Label muted>{`${days[0]} – ${days[6]}`}</Label>
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
              <Label faint>Abrechnung</Label>
              <Mono size="lg">{formatHms(totals.billing)}</Mono>
            </View>
          </View>
        </Card>

        <View>
          <SectionHeader>Tage</SectionHeader>
          <Card style={{ padding: 0, paddingHorizontal: space.lg }}>
            {pending ? (
              <Placeholder title="Keine Daten" detail="Lokale Datenbank noch nicht initialisiert." />
            ) : loading ? (
              <Placeholder loading title="Lade Woche …" />
            ) : (
              days.map((d) => {
                const b = byDay.get(d)!;
                return (
                  <Row
                    key={d}
                    primary={dayLabel(d)}
                    secondary={
                      b.count === 0
                        ? "keine Einträge"
                        : `${b.count} Einträge · Pause ${formatHms(b.brk)}`
                    }
                    figure={b.count === 0 ? "—" : formatHms(b.net)}
                    figureSub={b.count === 0 ? undefined : formatHms(b.billing)}
                  />
                );
              })
            )}
          </Card>
        </View>
      </Body>
    </Screen>
  );
}

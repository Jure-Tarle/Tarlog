/**
 * Nachtrag (doc 03 §7, doc 11 §7 nr. 6): Arbeitszeit rückwirkend erfassen, wenn
 * der Timer vergessen wurde. Datum + Start/Ende als lokale Wandzeit, Projekt
 * optional, Pflichtgrund aus den elf Spec-Gründen. Die Berechnung (netto,
 * Rundung, Betrag) macht `entries.backdate` über @tarlog/core.
 */
import { useMemo, useState } from "react";
import { View } from "react-native";
import {
  Body,
  Button,
  Card,
  Field,
  Label,
  Mono,
  Placeholder,
  Screen,
  Segmented,
  SectionHeader,
} from "../../src/components/ui";
import { space } from "../../src/components/theme";
import { useStore } from "../../src/components/useStore";
import { deviceTimezone, formatHms, localDate, nowMs } from "../../src/lib/time";
import { entries as entryStore, projects as projectStore } from "../../src/data";
import type { Project } from "../../src/data";

/** Die elf Nachtragsgründe der Spezifikation (§7.2); Werte wie im Core-Enum. */
const REASONS = [
  { value: "forgot_to_start", label: "Start vergessen" },
  { value: "forgot_to_stop", label: "Stopp vergessen" },
  { value: "worked_offline", label: "Offline gearbeitet" },
  { value: "meeting", label: "Meeting" },
  { value: "phone_call", label: "Telefonat" },
  { value: "travel_time", label: "Reisezeit" },
  { value: "client_work", label: "Kundenarbeit" },
  { value: "internal_work", label: "Interne Arbeit" },
  { value: "calendar_import", label: "Kalendertermin" },
  { value: "correction", label: "Korrektur" },
  { value: "other", label: "Sonstiges" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

/** "YYYY-MM-DD" + "HH:MM" → epoch-ms (lokale Gerätezeit). */
function toEpoch(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const ms = new Date(`${date}T${time.length === 4 ? `0${time}` : time}:00`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

export default function BackdateScreen() {
  const zone = deviceTimezone();
  const { data: projectList } = useStore<Project[]>(() => projectStore.list(), []);

  const [date, setDate] = useState(localDate(nowMs(), zone));
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("11:30");
  const [breakMin, setBreakMin] = useState("0");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [reason, setReason] = useState<Reason | null>("forgot_to_start");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const startMs = toEpoch(date, start);
  const endMs = toEpoch(date, end);
  const breakSeconds = Math.max(0, Math.round(Number(breakMin) || 0) * 60);

  const preview = useMemo(() => {
    if (startMs == null || endMs == null || endMs <= startMs) return null;
    const gross = Math.floor((endMs - startMs) / 1000);
    return { gross, net: Math.max(0, gross - breakSeconds) };
  }, [startMs, endMs, breakSeconds]);

  const valid = preview != null && reason != null && description.trim().length > 0;

  async function save() {
    if (!valid || startMs == null || endMs == null) return;
    setBusy(true);
    setMessage(null);
    try {
      const entry = await entryStore.backdate({
        project_id: projectId ?? undefined,
        timezone: zone,
        actual_started_at: startMs,
        actual_ended_at: endMs,
        breaks:
          breakSeconds > 0
            ? [{ started_at: startMs, ended_at: startMs + breakSeconds * 1000 }]
            : undefined,
        description: description.trim(),
        is_billable: true,
        backdate_reason: reason ?? undefined,
      });
      setMessage(`Nachtrag gespeichert (${formatHms(entry.net_work_duration_seconds)} netto).`);
      setDescription("");
    } catch (e) {
      setMessage(`Fehler: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Body>
        <Card>
          <Label muted>Vergessene Arbeitszeit nachtragen</Label>
          <View style={{ height: space.sm }} />
          <Field label="Datum" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
          <Field label="Start" value={start} onChangeText={setStart} placeholder="09:00" />
          <Field label="Ende" value={end} onChangeText={setEnd} placeholder="17:00" />
          <Field
            label="Pause (Minuten)"
            value={breakMin}
            onChangeText={setBreakMin}
            keyboardType="number-pad"
            placeholder="30"
          />
          <Field
            label="Tätigkeitsbeschreibung"
            value={description}
            onChangeText={setDescription}
            placeholder="Was wurde gemacht?"
            multiline
          />
        </Card>

        {preview ? (
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <View>
                <Label faint>Brutto</Label>
                <Mono size="lg">{formatHms(preview.gross)}</Mono>
              </View>
              <View>
                <Label faint>Pause</Label>
                <Mono size="lg">{formatHms(breakSeconds)}</Mono>
              </View>
              <View>
                <Label faint>Netto</Label>
                <Mono size="lg" tone="accent">
                  {formatHms(preview.net)}
                </Mono>
              </View>
            </View>
          </Card>
        ) : (
          <Placeholder title="Zeiten prüfen" detail="Das Ende muss nach dem Start liegen." />
        )}

        {(projectList ?? []).length > 0 ? (
          <View>
            <SectionHeader>Projekt</SectionHeader>
            <Card>
              <Segmented
                options={(projectList ?? []).slice(0, 4).map((p) => ({ value: p.id, label: p.name }))}
                value={projectId}
                onChange={setProjectId}
              />
            </Card>
          </View>
        ) : null}

        <View>
          <SectionHeader>Grund für den Nachtrag</SectionHeader>
          <Card>
            <Segmented<Reason>
              options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
              value={reason}
              onChange={setReason}
            />
          </Card>
        </View>

        <Card>
          <Button
            label={busy ? "Speichert …" : "Nachtrag speichern"}
            onPress={save}
            variant="primary"
            disabled={!valid || busy}
            grow
          />
          {message ? (
            <>
              <View style={{ height: space.sm }} />
              <Label muted>{message}</Label>
            </>
          ) : null}
        </Card>
      </Body>
    </Screen>
  );
}

/**
 * Timer area (doc 11 §7 nr. 1,10): the live capture surface.
 *
 * A large tabular running clock sits at the top (single accent, quiet 1 Hz
 * pulse while running). Below it: project + task selection, a description field
 * (mandatory per project config), and the state-machine controls
 * start / pause / resume / stop. All state comes from `timer.*` in src/data;
 * this screen never touches the DB directly. While the store is still stubbed,
 * the controls call through and surface a neutral "folgt" note instead of
 * crashing (offline-safe scaffold).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, StyleSheet, View } from "react-native";
import {
  Body,
  Button,
  Card,
  Field,
  Label,
  Mono,
  Placeholder,
  Row,
  Screen,
  SectionHeader,
} from "../../src/components/ui";
import { space, useTheme } from "../../src/components/theme";
import { runStore, useStore } from "../../src/components/useStore";
import { formatHms, nowMs } from "../../src/lib/time";
import { projects as projectStore, tasks as taskStore, timer as timerStore } from "../../src/data";
import type { TimerState } from "../../src/data";

/** Net elapsed seconds for a timer state, excluding paused time. */
function elapsedSeconds(state: TimerState | null, atMs: number): number {
  if (!state || state.started_at == null) return 0;
  const anchor = state.status === "paused" && state.paused_at != null ? state.paused_at : atMs;
  const gross = Math.floor((anchor - state.started_at) / 1000);
  return Math.max(0, gross - state.accumulated_pause_seconds);
}

export default function TimerScreen() {
  const { colors } = useTheme();
  const { data: state, pending, reload } = useStore<TimerState | null>(() => timerStore.getState());
  const projects = useStore(() => projectStore.list());

  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);

  const tasks = useStore(() => taskStore.list(projectId ?? undefined), [projectId]);

  const status = state?.status ?? "idle";
  const running = status === "running";
  const paused = status === "paused";
  const needsDescription = status === "needs_description";

  // 1 Hz tick only while running (reduced motion: no animation, just numbers).
  const [tick, setTick] = useState(nowMs());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick(nowMs()), 1000);
    return () => clearInterval(id);
  }, [running]);

  const seconds = useMemo(() => elapsedSeconds(state, tick), [state, tick]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => subscription.remove();
  }, []);

  // Quiet accent pulse while running (doc 11 §1 motion).
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!running || reduceMotion) {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, running, pulse]);

  async function act(fn: () => Promise<unknown>, okMsg: string) {
    const res = await runStore(fn);
    if (res.ok) {
      setNote(okMsg);
      reload();
    } else if (res.pending) {
      setNote("Timer-Store folgt (noch nicht implementiert).");
    } else {
      setNote(res.error);
    }
  }

  const start = () =>
    act(
      () =>
        timerStore.start({
          project_id: projectId ?? undefined,
          description: description.trim() || undefined,
        }),
      "Timer gestartet.",
    );
  const pause = () => state && act(() => timerStore.pause(state.timer_id), "Pausiert.");
  const resume = () => state && act(() => timerStore.resume(state.timer_id), "Fortgesetzt.");
  const stop = () =>
    state &&
    act(
      () => timerStore.stop(state.timer_id, { description: description.trim() || undefined }),
      "Gestoppt.",
    );

  const statusLabel = {
    idle: "Bereit",
    running: "Läuft",
    paused: "Pausiert",
    stopped: "Gestoppt",
    needs_description: "Beschreibung nötig",
    sync_pending: "Sync ausstehend",
    conflict: "Konflikt",
  }[status];

  return (
    <Screen>
      <Body>
        {/* Hero clock */}
        <Card active={running || paused}>
          <View style={styles.heroHead}>
            <View style={styles.statusRow}>
              <Animated.View
                accessible={false}
                style={[
                  styles.pulseDot,
                  { backgroundColor: running ? colors.accent : colors.textFaint, opacity: pulse },
                ]}
              />
              <Label muted>{statusLabel}</Label>
            </View>
          </View>
          <Mono size="hero" tone={running || paused ? "accent" : "text"}>
            {formatHms(seconds)}
          </Mono>

          <View style={styles.controls}>
            {status === "idle" || status === "stopped" ? (
              <Button label="Starten" variant="primary" onPress={start} grow />
            ) : null}
            {running ? (
              <>
                <Button label="Pause" onPress={pause} grow />
                <Button label="Stopp" variant="danger" onPress={stop} grow />
              </>
            ) : null}
            {paused ? (
              <>
                <Button label="Fortsetzen" variant="primary" onPress={resume} grow />
                <Button label="Stopp" variant="danger" onPress={stop} grow />
              </>
            ) : null}
            {needsDescription ? (
              <Button label="Speichern" variant="primary" onPress={stop} grow />
            ) : null}
          </View>

          {needsDescription ? (
            <Label faint>Dieses Projekt verlangt eine Beschreibung vor dem Abschluss.</Label>
          ) : null}
          {note ? <Label faint>{note}</Label> : null}
        </Card>

        {/* Project selection (doc 11 §7 nr. 7) */}
        <View>
          <SectionHeader>Projekt</SectionHeader>
          <Card style={styles.pad0}>
            {projects.pending ? (
              <Placeholder title="Keine Projekte" detail="Projekt-Store folgt." />
            ) : projects.loading ? (
              <Placeholder loading title="Lade Projekte …" />
            ) : (projects.data ?? []).length === 0 ? (
              <Placeholder title="Noch keine Projekte angelegt" />
            ) : (
              (projects.data ?? []).map((p) => (
                <Row
                  key={p.id}
                  primary={p.name}
                  secondary={p.billing_type}
                  figure={p.id === projectId ? "✓" : undefined}
                  accent={p.id === projectId}
                  onPress={() => setProjectId(p.id === projectId ? null : p.id)}
                />
              ))
            )}
          </Card>
        </View>

        {/* Task selection (doc 11 §7 nr. 8) */}
        <View>
          <SectionHeader>Aufgabe</SectionHeader>
          <Card style={styles.pad0}>
            {tasks.pending ? (
              <Placeholder title="Keine Aufgaben" detail="Aufgaben-Store folgt." />
            ) : (tasks.data ?? []).length === 0 ? (
              <Placeholder title="Keine Aufgaben für dieses Projekt" />
            ) : (
              (tasks.data ?? []).map((t) => (
                <Row key={t.id} primary={t.name} secondary={t.default_billable ? "abrechenbar" : "intern"} />
              ))
            )}
          </Card>
        </View>

        {/* Description (doc 11 §7 nr. 9) */}
        <View>
          <SectionHeader>Beschreibung</SectionHeader>
          <Card>
            <Field
              label="Was wurde getan?"
              value={description}
              onChangeText={setDescription}
              placeholder="z. B. Anforderungsanalyse, Call mit Kunde …"
              multiline
            />
          </Card>
        </View>
      </Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  heroHead: { marginBottom: space.sm },
  statusRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  pulseDot: { width: 10, height: 10, borderRadius: 999 },
  controls: { flexDirection: "row", gap: space.sm, marginTop: space.lg },
  pad0: { padding: 0, paddingHorizontal: space.lg },
});

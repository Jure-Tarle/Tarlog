"use client";
/**
 * DashboardLive, Dashboard-Elemente 1, 13, 14 (doc 11 §3): laufender Timer
 * (Live-Puls, Ein-Klick Pause/Stopp) sowie Schnellstart aus zuletzt genutzten
 * Projekten. Stopp öffnet den vollständigen Stopp-Dialog auf /timer; hier nur
 * die schnellen Aktionen.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { deviceTimezone } from "@/lib/ui/format";
import { Button, ButtonLink, Select, StatusLine } from "@/lib/ui/controls";
import { TimerTicker } from "@/lib/ui/TimerTicker";
import type { TimerRow } from "@/lib/ui/queries";

export function DashboardLive({
  initialTimer,
  recentProjects,
}: {
  initialTimer: TimerRow | null;
  recentProjects: Array<{ id: string; name: string }>;
}): React.ReactElement {
  const router = useRouter();
  const [timer, setTimer] = useState<TimerRow | null>(initialTimer);
  const [projectId, setProjectId] = useState(recentProjects[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = timer?.status ?? "idle";
  const active = status === "running" || status === "paused";

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Timer-Dienst nicht erreichbar.");
    } finally {
      setBusy(false);
    }
  }

  async function start() {
    await run(async () => {
      const res = await api.post<{ timer?: TimerRow }>(API.timerStart, {
        project_id: projectId || null,
        timezone: deviceTimezone(),
      });
      setTimer(res?.timer ?? null);
    });
  }
  async function pause() {
    await run(async () => {
      const res = await api.post<{ timer?: TimerRow }>(API.timerPause);
      setTimer(res?.timer ?? null);
    });
  }
  async function resume() {
    await run(async () => {
      const res = await api.post<{ timer?: TimerRow }>(API.timerResume);
      setTimer(res?.timer ?? null);
    });
  }

  return (
    <div
      className="feature-panel timer-feature-panel"
      style={{
        border: "1px solid var(--color-border)",
        borderLeft: active ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
        borderRadius: "var(--radius)",
        background: "var(--color-surface-raised)",
        padding: 18,
        display: "flex",
        flexWrap: "wrap",
        gap: 16,
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <div>
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {active ? `${timer?.projectName ?? "Ohne Projekt"}${timer?.taskName ? " | " + timer.taskName : ""}` : "Kein Timer aktiv"}
        </div>
        <div style={{ marginTop: 8 }}>
          <TimerTicker timer={timer} size={32} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {active ? (
          <>
            {status === "running" ? (
              <Button onClick={pause} disabled={busy}>Pause</Button>
            ) : (
              <Button variant="primary" onClick={resume} disabled={busy}>Fortsetzen</Button>
            )}
            <ButtonLink
              href="/timer"
              variant="primary"
              aria-disabled={busy}
              onClick={(event) => { if (busy) event.preventDefault(); }}
            >
              Stoppen…
            </ButtonLink>
          </>
        ) : (
          <>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} style={{ width: 200 }}>
              <option value="">Ohne Projekt</option>
              {recentProjects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button variant="primary" onClick={start} disabled={busy}>Schnellstart</Button>
          </>
        )}
      </div>
      {error ? <div style={{ flexBasis: "100%" }}><StatusLine kind="error">{error}</StatusLine></div> : null}
    </div>
  );
}

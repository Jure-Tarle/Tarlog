/**
 * Dashboard — Tages-/Wochenüberblick (doc 11 §3).
 *
 * Live timer, heutige + Wochenzeit, abrechenbar vs. nicht abrechenbar,
 * Compliance-Ampel (@tarlog/core evaluateDay via aggregates) und Schnellstart aus
 * den letzten Einträgen. Nur src/data + bridge, keine eigenen DB-Zugriffe.
 */
import { useMemo } from "react";
import { Page, Card, StatGrid, StatTile, Button, ComplianceBadge, AsyncBody, EmptyState, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { useTimer, elapsedSeconds } from "../data/timer";
import { useTick } from "../data/hooks";
import { entries } from "../data/repositories";
import { projects as projectRepo } from "../data/repositories";
import { overallStatus } from "../data/aggregates";
import { sumBillableSeconds, sumNonBillableSeconds, sumNet } from "../data/aggregates";
import { fmtHMS, fmtHM, fmtHoursDecimal, dayRange, weekRange, weekLabel } from "../data/format";
import { useTimezone, loadRange, nameMap } from "./shared";

function go(id: string) {
  window.location.hash = `#/${id}`;
}

export default function Dashboard() {
  const tz = useTimezone();
  const timer = useTimer();
  const now = useTick(timer.active);

  const today = useMemo(() => dayRange(tz), [tz]);
  const week = useMemo(() => weekRange(tz), [tz]);

  const todayData = useAsync(() => loadRange(today.from, today.to, tz), [today.from, today.to, tz]);
  const weekData = useAsync(() => loadRange(week.from, week.to, tz), [week.from, week.to, tz]);
  const recent = useAsync(() => entries.recent(6), []);
  const proj = useAsync(() => projectRepo.list({ status: "active" }), []);

  const elapsed = elapsedSeconds(timer.state, now);
  const projNames = nameMap(proj.data ?? []);

  const todayNet = todayData.data ? sumNet(todayData.data.list) : 0;
  const weekNet = weekData.data ? sumNet(weekData.data.list) : 0;
  const billable = todayData.data ? sumBillableSeconds(todayData.data.list) : 0;
  const nonBillable = todayData.data ? sumNonBillableSeconds(todayData.data.list) : 0;
  const todayStatus = todayData.data ? overallStatus(todayData.data.days) : "green";

  return (
    <Page
      title="Dashboard"
      hint={weekLabel(tz)}
      actions={<Button variant="primary" onClick={() => go("timer")}>Zum Timer</Button>}
    >
      <StatGrid>
        <StatTile
          label={timer.active ? (timer.state?.status === "paused" ? "Timer pausiert" : "Timer läuft") : "Kein Timer"}
          value={<span className={timer.active ? "" : "faint"}>{fmtHMS(elapsed)}</span>}
          accent={timer.state?.status === "running"}
          sub={timer.state?.project_id ? projNames.get(timer.state.project_id) ?? "Projekt" : "kein Projekt"}
          onClick={() => go("timer")}
        />
        <StatTile label="Heute netto" value={fmtHM(todayNet)} sub={fmtHoursDecimal(todayNet)} onClick={() => go("today")} />
        <StatTile label="Woche netto" value={fmtHM(weekNet)} sub={fmtHoursDecimal(weekNet)} onClick={() => go("week")} />
        <StatTile label="Abrechenbar heute" value={fmtHM(billable)} sub="fakturierbar" />
        <StatTile label="Nicht abrechenbar" value={fmtHM(nonBillable)} sub="intern / pausen" />
        <StatTile
          label="Compliance heute"
          value={<ComplianceBadge status={todayStatus} />}
          tone={todayStatus}
          onClick={() => go("compliance")}
        />
      </StatGrid>

      <div className="grid-2">
        <Card
          title="Schnellstart"
          subtitle="Zuletzt erfasst — mit einem Klick neu starten"
          actions={<Button variant="ghost" onClick={() => go("backdating")}>Nachtragen</Button>}
        >
          <AsyncBody state={recent} empty={<EmptyState title="Noch keine Einträge" >Starte den ersten Timer, um Schnellstarts zu sehen.</EmptyState>}>
            {(rows) => (
              <div className="stack stack--tight">
                {rows.map((e) => (
                  <div key={e.id} className="cluster">
                    <Button
                      variant="ghost"
                      className="btn--sm"
                      disabled={timer.active}
                      onClick={() => void timer.start({ projectId: e.project_id, taskId: e.task_id, description: e.description })}
                    >
                      ▶ Start
                    </Button>
                    <span className="muted" style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {e.description || "(ohne Beschreibung)"}
                    </span>
                    {e.project_id ? <Tag tone="accent">{projNames.get(e.project_id) ?? "Projekt"}</Tag> : null}
                    {!e.is_billable ? <Tag tone="muted">intern</Tag> : null}
                  </div>
                ))}
              </div>
            )}
          </AsyncBody>
        </Card>

        <Card title="Timer-Steuerung" subtitle="Immer erreichbar (doc 11 §2)">
          <div className="timerface">
            <span className={`timerface__elapsed ${timer.state?.status === "running" ? "timerface__elapsed--running" : ""} num`}>
              {fmtHMS(elapsed)}
            </span>
            <span className="timerface__meta">
              {timer.active ? (timer.state?.status === "paused" ? "pausiert" : "läuft") : "bereit"}
            </span>
            <div className="cluster">
              {!timer.active ? (
                <Button variant="primary" onClick={() => void timer.start({})}>Starten</Button>
              ) : timer.state?.status === "paused" ? (
                <Button variant="primary" onClick={() => void timer.resume()}>Fortsetzen</Button>
              ) : (
                <Button onClick={() => void timer.pause()}>Pause</Button>
              )}
              <Button variant="ghost" onClick={() => go("timer")}>Stoppen…</Button>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  );
}

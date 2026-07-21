import { useMemo } from "react";
import { ArrowUpRight, Clock3, Coffee, Play, Plus, ReceiptText } from "lucide-react";
import { Page, Card, Button, StatGrid, StatTile, AsyncBody, EmptyState, ComplianceBadge, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { projects as projectRepo, type TimeEntry } from "../data/repositories";
import { sumNet, sumBreak, sumBillableSeconds, overallStatus } from "../data/aggregates";
import { fmtHM, fmtClock, fmtDayLong, fmtDurationShort, dayRange } from "../data/format";
import { buildTimeline } from "../data/timeOverview";
import { useTimezone, loadRange, nameMap } from "./shared";
import { t } from "../i18n";

function go(path: string) {
  window.location.hash = `#/${path}`;
}

export default function Today() {
  const tz = useTimezone();
  const range = useMemo(() => dayRange(tz), [tz]);
  const data = useAsync(() => loadRange(range.from, range.to, tz), [range.from, range.to, tz]);
  // Project labels enrich the timeline but must never make the time ledger fail.
  const projectState = useAsync(() => projectRepo.list(), []);
  const projectNames = nameMap(projectState.data ?? []);
  const rows = useMemo(() => buildTimeline(data.data?.list ?? []), [data.data?.list]);
  const net = data.data ? sumNet(data.data.list) : 0;
  const breaks = data.data ? sumBreak(data.data.list) : 0;
  const billable = data.data ? sumBillableSeconds(data.data.list) : 0;
  const status = data.data ? overallStatus(data.data.days) : "green";
  const complianceAvailable = Boolean(data.data?.days.length);

  return (
    <Page
      className="time-overview-page"
      title={t("Heute")}
      hint={fmtDayLong(Date.now(), tz)}
      actions={<><Button variant="primary" onClick={() => go("timer")}><Play size={15}/>{t("Timer starten")}</Button><Button variant="ghost" onClick={() => go("backdating")}><Plus size={15}/>{t("Arbeit nachtragen")}</Button></>}
    >
      <StatGrid balanced>
        <StatTile label={t("Arbeitszeit")} value={fmtHM(net)} sub={t((data.data?.list.length ?? 0) === 1 ? "{n} Eintrag" : "{n} Einträge", { n: data.data?.list.length ?? 0 })} accent />
        <StatTile label={t("Pausen")} value={fmtHM(breaks)} sub={t(breaks ? "von der Arbeitszeit abgezogen" : "keine Pause erfasst")} />
        <StatTile label={t("Abrechenbar")} value={fmtHM(billable)} sub={net ? t("{percent} % der Nettozeit", { percent: Math.round((billable / net) * 100) }) : t("noch keine Arbeitszeit")} />
        <StatTile label={t("Arbeitszeitregeln")} value={complianceAvailable ? <ComplianceBadge status={status} /> : t("Nicht geprüft")} sub={complianceAvailable ? t("Tagesprüfung öffnen") : t("noch keine Arbeitszeit")} tone={complianceAvailable ? status : undefined} onClick={() => go("compliance")} />
      </StatGrid>

      <Card
        title={t("Tagesverlauf")}
        subtitle={projectState.error ? t("Einträge und echte Zeitlücken · Projektnamen derzeit nicht verfügbar") : t("Einträge und echte Zeitlücken in chronologischer Reihenfolge")}
      >
        <AsyncBody
          state={{ data: data.data?.list ?? null, error: data.error, loading: data.loading }}
          empty={<EmptyState title={t("Heute noch keine Arbeitszeit")}><span>{t("Starte den Timer für aktuelle Arbeit oder trage einen bereits abgeschlossenen Zeitraum nach.")}</span><div className="empty__actions"><Button variant="primary" onClick={() => go("timer")}><Play size={15}/>{t("Timer starten")}</Button><Button variant="ghost" onClick={() => go("backdating")}><Plus size={15}/>{t("Nachtragen")}</Button></div></EmptyState>}
        >
          {() => rows.length ? (
            <ol className="today-timeline" aria-label={t("Chronologischer Tagesverlauf")}>
              {rows.map((row, index) => row.kind === "gap" ? (
                <li className="today-timeline__gap" key={`gap-${row.from}-${row.to}`}>
                  <span className="today-timeline__rail" aria-hidden><span /></span>
                  <div className="today-gap__time num"><time dateTime={new Date(row.from).toISOString()}>{fmtClock(row.from, tz)}</time><span>,</span><time dateTime={new Date(row.to).toISOString()}>{fmtClock(row.to, tz)}</time></div>
                  <div className="today-gap__label"><Clock3 size={14}/><span>{t("Freier Zeitraum")}</span><strong>{fmtDurationShort(row.seconds)}</strong></div>
                  <Button variant="ghost" className="btn--sm" onClick={() => go("backdating")}>{t("Nachtragen")}</Button>
                </li>
              ) : <TimelineEntry key={row.entry.id || index} entry={row.entry} timezone={tz} projectName={row.entry.project_id ? projectNames.get(row.entry.project_id) : undefined} />)}
            </ol>
          ) : <EmptyState title={t("Keine abgeschlossenen Einträge")}><span>{t("Laufende Timer erscheinen nach dem Stoppen im Tagesverlauf.")}</span></EmptyState>}
        </AsyncBody>
      </Card>
    </Page>
  );
}

function TimelineEntry({ entry, timezone, projectName }: { entry: TimeEntry; timezone: string; projectName?: string }) {
  const start = fmtClock(entry.actual_started_at, entry.timezone || timezone);
  const end = entry.actual_ended_at ? fmtClock(entry.actual_ended_at, entry.timezone || timezone) : "…";
  return (
    <li className="today-timeline__entry">
      <span className="today-timeline__rail" aria-hidden><span /></span>
      <div className="today-entry__time num"><time dateTime={new Date(entry.actual_started_at).toISOString()}>{start}</time><span>,</span><time dateTime={entry.actual_ended_at ? new Date(entry.actual_ended_at).toISOString() : undefined}>{end}</time></div>
      <div className="today-entry__work">
        <strong>{entry.description || t("Ohne Beschreibung")}</strong>
        <div className="today-entry__context">
          {entry.project_id && projectName ? <button type="button" className="text-link" onClick={() => go(`projects/${encodeURIComponent(entry.project_id!)}`)}>{projectName}<ArrowUpRight size={12}/></button> : <span>{t(entry.project_id ? "Projekt nicht verfügbar" : "Ohne Projekt")}</span>}
          {entry.is_backdated ? <Tag tone="muted">{t("Nachtrag")}</Tag> : null}
        </div>
      </div>
      <div className="today-entry__facts">
        {entry.break_duration_seconds ? <span><Coffee size={13}/>{t("{duration} Pause", { duration: fmtHM(entry.break_duration_seconds) })}</span> : null}
        <span><ReceiptText size={13}/>{t(entry.is_billable ? "Abrechenbar" : "Intern")}</span>
      </div>
      <strong className="today-entry__duration num">{fmtHM(entry.net_work_duration_seconds ?? 0)}</strong>
    </li>
  );
}

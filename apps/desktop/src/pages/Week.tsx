import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Page, Card, Button, StatGrid, StatTile, ComplianceBadge, Loading, ErrorNote, EmptyState } from "../components/ui";
import { useAsync } from "../data/hooks";
import { sumNet, sumBreak, sumBillableSeconds, overallStatus } from "../data/aggregates";
import { fmtHM, fmtHoursDecimal, weekRange, weekLabel } from "../data/format";
import { buildWeekOverview, weekBarPercent } from "../data/timeOverview";
import { DateTime } from "luxon";
import { useTimezone, loadRange } from "./shared";
import type { ComplianceStatus } from "@tarlog/core";
import { t } from "../i18n";

function go(path: string) {
  window.location.hash = `#/${path}`;
}

export default function Week() {
  const timezone = useTimezone();
  const [offset, setOffset] = useState(0);
  const reference = useMemo(() => DateTime.now().setZone(timezone).plus({ weeks: offset }).toMillis(), [timezone, offset]);
  const range = useMemo(() => weekRange(timezone, reference), [timezone, reference]);
  const data = useAsync(() => loadRange(range.from, range.to, timezone), [range.from, range.to, timezone]);
  const days = useMemo(() => buildWeekOverview(data.data?.list ?? [], range.from, timezone), [data.data?.list, range.from, timezone]);
  const statusByDate = new Map<string, ComplianceStatus>((data.data?.days ?? []).map((day) => [day.summary.date, day.status]));
  const net = data.data ? sumNet(data.data.list) : 0;
  const breaks = data.data ? sumBreak(data.data.list) : 0;
  const billable = data.data ? sumBillableSeconds(data.data.list) : 0;
  const status = data.data ? overallStatus(data.data.days) : "green";
  const complianceAvailable = Boolean(data.data?.days.length);
  const maximumDaySeconds = Math.max(1, ...days.map((day) => day.netSeconds));

  return (
    <Page
      className="time-overview-page week-overview-page"
      title={t("Woche")}
      hint={weekLabel(timezone, reference)}
      actions={<><div className="week-period-toolbar" role="toolbar" aria-label={t("Woche auswählen")}><Button variant="ghost" className="week-period-toolbar__arrow" aria-label={t("Vorige Woche")} onClick={() => setOffset((current) => current - 1)}><ChevronLeft size={16}/></Button><Button variant="ghost" disabled={offset === 0} onClick={() => setOffset(0)}><CalendarDays size={14}/>{offset === 0 ? t("Diese Woche") : t("Zur aktuellen Woche")}</Button><Button variant="ghost" className="week-period-toolbar__arrow" aria-label={t("Nächste Woche")} onClick={() => setOffset((current) => current + 1)}><ChevronRight size={16}/></Button></div><Button variant="primary" onClick={() => go("backdating")}><Plus size={15}/>{t("Arbeit nachtragen")}</Button></>}
    >
      <StatGrid balanced>
        <StatTile label={t("Arbeitszeit")} value={fmtHM(net)} sub={fmtHoursDecimal(net)} accent />
        <StatTile label={t("Pausen")} value={fmtHM(breaks)} sub={t(breaks ? "in dieser Woche" : "keine Pause erfasst")} />
        <StatTile label={t("Abrechenbar")} value={fmtHM(billable)} sub={net ? t("{percent} % der Nettozeit", { percent: Math.round((billable / net) * 100) }) : t("noch keine Arbeitszeit")} />
        <StatTile label={t("Arbeitszeitregeln")} value={complianceAvailable ? <ComplianceBadge status={status} /> : t("Nicht geprüft")} sub={complianceAvailable ? t("Wochenstatus") : t("noch keine Arbeitszeit")} tone={complianceAvailable ? status : undefined} onClick={() => go("compliance")} />
      </StatGrid>

      <Card title={t("Sieben Tage")} subtitle={t("{week} | Montag bis Sonntag", { week: weekLabel(timezone, reference) })}>
        {data.loading && !data.data ? <Loading /> : data.error && !data.data ? <ErrorNote error={data.error} /> : <>
          {!data.data?.list.length ? <div className="week-empty"><EmptyState title={t("In dieser Woche ist noch keine Arbeitszeit erfasst")}><span>{t("Leere Tage bleiben zur Orientierung sichtbar. Trage vergangene Arbeit nach oder wechsle zu einer anderen Woche.")}</span></EmptyState></div> : null}
          <ol className="week-day-list" aria-label={t("Tage in {week}", { week: weekLabel(timezone, reference) })}>
            {days.map((day) => {
              const dayStatus = statusByDate.get(day.key);
              return <li className={`week-day-row ${day.weekend ? "is-weekend" : ""} ${day.entries.length ? "has-time" : "is-empty"}`} key={day.key}>
                <div className="week-day-row__date"><strong>{day.weekday}</strong><time className="num" dateTime={day.key}>{day.dateLabel}</time>{day.weekend ? <span>{t("Wochenende")}</span> : null}</div>
                <div className="week-day-row__work"><div><span>{day.entries.length ? t(day.entries.length === 1 ? "{n} Eintrag" : "{n} Einträge", { n: day.entries.length }) : t("Keine Arbeitszeit")}</span><strong className="num">{day.entries.length ? fmtHM(day.netSeconds) : "00:00"}</strong></div><span className="week-day-row__track" aria-hidden><i style={{ width: `${weekBarPercent(day.netSeconds, maximumDaySeconds)}%` }}/></span></div>
                <div className="week-day-row__metric"><span>{t("Pause")}</span><strong className="num">{day.entries.length ? fmtHM(day.breakSeconds) : ","}</strong></div>
                <div className="week-day-row__metric"><span>{t("Abrechenbar")}</span><strong className="num">{day.entries.length ? fmtHM(day.billableSeconds) : ","}</strong></div>
                <div className="week-day-row__status">{dayStatus ? <ComplianceBadge status={dayStatus} /> : <span className="week-day-row__unchecked">{t("Nicht geprüft")}</span>}</div>
              </li>;
            })}
          </ol>
          <footer className="week-summary" aria-label={t("Wochensumme")}><span>{t("Wochensumme")}</span><span>{t((data.data?.list.length ?? 0) === 1 ? "{n} Eintrag" : "{n} Einträge", { n: data.data?.list.length ?? 0 })}</span><span className="num">{t("{duration} Pause", { duration: fmtHM(breaks) })}</span><span className="num">{t("{duration} abrechenbar", { duration: fmtHM(billable) })}</span><strong className="num">{fmtHM(net)}</strong></footer>
        </>}
      </Card>
    </Page>
  );
}

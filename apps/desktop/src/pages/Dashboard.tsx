/** Customizable, device-local dashboard built on the shared data layer. */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarDays, CalendarRange, CircleGauge, Clock3, Focus, ListChecks, Play, ReceiptText, ShieldCheck, TimerReset } from "lucide-react";
import { Page, Card, Button, ComplianceBadge, AsyncBody, EmptyState, Tag } from "../components/ui";
import { useAsync, useTick } from "../data/hooks";
import { useTimer, elapsedSeconds } from "../data/timer";
import { entries, projects as projectRepo } from "../data/repositories";
import { overallStatus, sumBillableSeconds, sumNonBillableSeconds, sumNet } from "../data/aggregates";
import { fmtHMS, fmtHM, fmtHoursDecimal, fmtIsoDate, dayRange, weekRange, monthRange, weekLabel } from "../data/format";
import {
  loadDashboardLayout,
  saveDashboardLayout,
  type DashboardWidgetId,
} from "../data/dashboardLayout";
import { useTimezone, loadRange, nameMap } from "./shared";
import { DashboardWidgetGrid } from "./DashboardWidgetGrid";
import {
  completeDashboardLayoutLoad,
  failDashboardLayoutLoad,
  pendingDashboardLayoutLoad,
} from "../data/dashboardEditor";
import { t } from "../i18n";

function go(id: string) {
  window.location.hash = `#/${id}`;
}

function MetricWidget({
  icon,
  eyebrow,
  value,
  detail,
  onClick,
}: {
  icon: ReactNode;
  eyebrow: string;
  value: ReactNode;
  detail: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="dashboard-metric__icon">{icon}</span>
      <span className="dashboard-metric__eyebrow">{eyebrow}</span>
      <strong className="dashboard-metric__value num">{value}</strong>
      <span className="dashboard-metric__detail">{detail}</span>
      {onClick ? <ArrowRight className="dashboard-metric__arrow" size={16} aria-hidden="true" /> : null}
    </>
  );
  return onClick ? <button type="button" className="dashboard-metric" onClick={onClick}>{content}</button> : <div className="dashboard-metric">{content}</div>;
}

export default function Dashboard() {
  const tz = useTimezone();
  const timer = useTimer();
  const now = useTick(timer.active);
  const [layoutLoad, setLayoutLoad] = useState(pendingDashboardLayoutLoad);

  const today = useMemo(() => dayRange(tz), [tz]);
  const week = useMemo(() => weekRange(tz), [tz]);
  const month = useMemo(() => monthRange(tz), [tz]);
  const todayData = useAsync(() => loadRange(today.from, today.to, tz), [today.from, today.to, tz]);
  const weekData = useAsync(() => loadRange(week.from, week.to, tz), [week.from, week.to, tz]);
  const monthData = useAsync(() => loadRange(month.from, month.to, tz), [month.from, month.to, tz]);
  const recent = useAsync(() => entries.recent(6), []);
  const proj = useAsync(() => projectRepo.list({ status: "active" }), []);

  useEffect(() => {
    let active = true;
    void loadDashboardLayout()
      .then((saved) => {
        if (active) setLayoutLoad(completeDashboardLayoutLoad(saved));
      })
      .catch(() => {
        if (active) setLayoutLoad(failDashboardLayoutLoad());
      });
    return () => { active = false; };
  }, []);

  const elapsed = elapsedSeconds(timer.state, now);
  const projNames = nameMap(proj.data ?? []);
  const todayNet = todayData.data ? sumNet(todayData.data.list) : 0;
  const weekNet = weekData.data ? sumNet(weekData.data.list) : 0;
  const monthNet = monthData.data ? sumNet(monthData.data.list) : 0;
  const billable = todayData.data ? sumBillableSeconds(todayData.data.list) : 0;
  const nonBillable = todayData.data ? sumNonBillableSeconds(todayData.data.list) : 0;
  const todayStatus = todayData.data ? overallStatus(todayData.data.days) : "green";
  const entriesToday = todayData.data?.list.length ?? 0;
  const activeProjects = new Set((monthData.data?.list ?? []).map((entry) => entry.project_id).filter(Boolean)).size;
  const activeDays = new Set((weekData.data?.list ?? []).map((entry) => fmtIsoDate(entry.actual_started_at, entry.timezone || tz))).size;
  const todayEntries = todayData.data?.list ?? [];
  const focusToday = todayEntries.length
    ? todayEntries.reduce((longest, entry) => (entry.net_work_duration_seconds ?? 0) > (longest.net_work_duration_seconds ?? 0) ? entry : longest)
    : null;

  function renderWidget(id: DashboardWidgetId) {
    switch (id) {
      case "today":
        return <MetricWidget icon={<Clock3 size={18} aria-hidden="true" />} eyebrow={t("Heute netto")} value={fmtHM(todayNet)} detail={fmtHoursDecimal(todayNet)} onClick={() => go("today")} />;
      case "week":
        return <MetricWidget icon={<CalendarDays size={18} aria-hidden="true" />} eyebrow={t("Diese Woche")} value={fmtHM(weekNet)} detail={weekLabel(tz)} onClick={() => go("week")} />;
      case "month":
        return <MetricWidget icon={<CalendarRange size={18} aria-hidden="true" />} eyebrow={t("Dieser Monat")} value={fmtHM(monthNet)} detail={t("Nettoarbeitszeit im laufenden Monat")} onClick={() => go("reports")} />;
      case "entriesToday":
        return <MetricWidget icon={<ListChecks size={18} aria-hidden="true" />} eyebrow={t("Einträge heute")} value={entriesToday} detail={entriesToday === 1 ? t("erfasster Zeitblock") : t("erfasste Zeitblöcke")} onClick={() => go("today")} />;
      case "billable":
        return <MetricWidget icon={<ReceiptText size={18} aria-hidden="true" />} eyebrow={t("Abrechenbar heute")} value={fmtHM(billable)} detail={t("fakturierbare Zeit")} />;
      case "nonBillable":
        return <MetricWidget icon={<TimerReset size={18} aria-hidden="true" />} eyebrow={t("Nicht abrechenbar")} value={fmtHM(nonBillable)} detail={t("interne Arbeitszeit")} />;
      case "activeProjects":
        return <MetricWidget icon={<BriefcaseBusiness size={18} aria-hidden="true" />} eyebrow={t("Aktive Projekte")} value={activeProjects} detail={t("mit Zeit im laufenden Monat")} onClick={() => go("projects")} />;
      case "activeDays":
        return <MetricWidget icon={<CalendarDays size={18} aria-hidden="true" />} eyebrow={t("Aktive Tage")} value={`${activeDays} / 7`} detail={t("Tage mit Einträgen in dieser Woche")} onClick={() => go("week")} />;
      case "focusToday":
        return <MetricWidget icon={<Focus size={18} aria-hidden="true" />} eyebrow={t("Längster Fokusblock heute")} value={focusToday ? fmtHM(focusToday.net_work_duration_seconds ?? 0) : "00:00"} detail={focusToday?.description || t("Noch kein Fokusblock erfasst")} onClick={() => go("today")} />;
      case "compliance":
        return (
          <MetricWidget
            icon={<ShieldCheck size={18} aria-hidden="true" />}
            eyebrow={t("Compliance heute")}
            value={<ComplianceBadge status={todayStatus} />}
            detail={t("Arbeits- und Pausenzeiten geprüft")}
            onClick={() => go("compliance")}
          />
        );
      case "timer":
        return (
          <Card title={t("Timer")} subtitle={timer.state?.project_id ? projNames.get(timer.state.project_id) ?? t("Projekt") : t("Bereit für den nächsten Fokusblock")}>
            <div className="dashboard-timer">
              <CircleGauge className={timer.active ? "dashboard-timer__icon is-active" : "dashboard-timer__icon"} size={25} aria-hidden="true" />
              <span className={`dashboard-timer__time num ${timer.state?.status === "running" ? "is-running" : ""}`}>{fmtHMS(elapsed)}</span>
              <span className="dashboard-timer__status">{timer.active ? (timer.state?.status === "paused" ? t("Pausiert") : t("Tracking läuft")) : t("Kein aktiver Timer")}</span>
              <div className="cluster dashboard-timer__actions">
                {!timer.active ? (
                  <Button variant="primary" onClick={() => void timer.start({})}><Play size={14} fill="currentColor" aria-hidden="true" /> {t("Starten")}</Button>
                ) : timer.state?.status === "paused" ? (
                  <Button variant="primary" onClick={() => void timer.resume()}>{t("Fortsetzen")}</Button>
                ) : (
                  <Button onClick={() => void timer.pause()}>{t("Pause")}</Button>
                )}
                <Button variant="ghost" onClick={() => go("timer")}>{timer.active ? t("Öffnen und stoppen") : t("Projekt wählen")}</Button>
              </div>
            </div>
          </Card>
        );
      case "quickStart":
        return (
          <Card title={t("Schnellstart")} subtitle={t("Zuletzt erfasste Arbeit erneut starten")} actions={<Button variant="ghost" onClick={() => go("backdating")}>{t("Nachtragen")}</Button>}>
            <AsyncBody state={recent} empty={<EmptyState title={t("Noch keine Einträge")}>{t("Starte den ersten Timer, um Schnellstarts zu sehen.")}</EmptyState>}>
              {(rows) => (
                <div className="dashboard-quicklist">
                  {rows.map((entry) => (
                    <button
                      type="button"
                      key={entry.id}
                      className="dashboard-quickrow"
                      disabled={timer.active}
                      onClick={() => void timer.start({ projectId: entry.project_id, taskId: entry.task_id, description: entry.description })}
                    >
                      <span className="dashboard-quickrow__play"><Play size={12} fill="currentColor" aria-hidden="true" /></span>
                      <span className="dashboard-quickrow__copy">
                        <strong>{entry.description || t("Ohne Beschreibung")}</strong>
                        <span>{entry.project_id ? projNames.get(entry.project_id) ?? t("Projekt") : t("Ohne Projekt")}</span>
                      </span>
                      {!entry.is_billable ? <Tag tone="muted">{t("intern")}</Tag> : null}
                    </button>
                  ))}
                </div>
              )}
            </AsyncBody>
          </Card>
        );
    }
  }

  return (
    <Page
      title={t("Dashboard")}
      hint={weekLabel(tz)}
      className="dashboard-page"
      actions={<Button variant="primary" onClick={() => go("timer")}>{t("Zum Timer")}</Button>}
    >
      {layoutLoad.warning ? <div className="dashboard-load-warning" role="status" aria-live="polite">{layoutLoad.warning}</div> : null}
      {!layoutLoad.ready ? (
        <div className="dashboard-layout-loading" role="status" aria-live="polite">
          <span className="loading__spinner" aria-hidden="true" />
          {t("Dashboard-Anordnung wird geladen…")}
        </div>
      ) : (
        <DashboardWidgetGrid
          value={layoutLoad.layout}
          onSave={async (next) => {
            const saved = await saveDashboardLayout(next);
            setLayoutLoad(completeDashboardLayoutLoad(saved));
            return saved;
          }}
          renderWidget={renderWidget}
        />
      )}
    </Page>
  );
}

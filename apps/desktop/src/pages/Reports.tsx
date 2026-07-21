/**
 * Reports, Bereich 9 (doc 10 §Reports). Zeitraumauswahl (Woche/Monat) mit
 * getrennter Ausweisung von tatsächlicher Zeit (actual/netto) und
 * Abrechnungszeit (billing), plus Projektaufschlüsselung. Nur data + @tarlog/core.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, ChevronRight, Clock3, ReceiptText } from "lucide-react";
import { Page, Card, StatGrid, StatTile, SegmentedControl, AsyncBody, EmptyState, TableWrap, Button, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { entries as entryRepo, projects as projectRepo } from "../data/repositories";
import { sumNet, sumBillableSeconds, sumNonBillableSeconds, sumAmountCents } from "../data/aggregates";
import { fmtHM, fmtMoney } from "../data/format";
import { useTimezone, loadRange, nameMap } from "./shared";
import type { TimeEntry } from "../data/repositories";
import { listTasks } from "../data/tasks";
import { activitiesByDescription, activitiesByTask } from "../data/projectAnalytics";
import { fmtClock, fmtDate } from "../data/format";
import {
  activityHeatmapRange,
  buildActivityHeatmap,
  buildTrendBuckets,
  reportRange,
  type ActivityWeek,
  type ReportPeriod,
  type TrendBucket,
} from "../data/reportAnalytics";
import { t } from "../i18n";

// Labels bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const PERIOD_OPTIONS: Array<{ value: ReportPeriod; label: string }> = [
  { value: "week", label: "Woche" },
  { value: "month", label: "Monat" },
  { value: "quarter", label: "Quartal" },
  { value: "year", label: "Jahr" },
];

export default function Reports() {
  const selectedProjectId = decodeURIComponent(window.location.hash.split("/")[2] ?? "");
  const tz = useTimezone();
  const [period, setPeriod] = useState<ReportPeriod>("week");
  const range = useMemo(() => reportRange(period, tz), [tz, period]);
  const heatmapRange = useMemo(() => activityHeatmapRange(tz), [tz]);
  const data = useAsync(() => loadRange(range.from, range.to, tz), [range.from, range.to, tz]);
  const heatmapData = useAsync(() => entryRepo.inRange(heatmapRange.from, heatmapRange.to), [heatmapRange.from, heatmapRange.to]);
  const proj = useAsync(() => projectRepo.list(), []);
  const projNames = nameMap(proj.data ?? []);
  const taskList = useAsync(() => listTasks(selectedProjectId || null), [selectedProjectId]);
  const taskNames = nameMap(taskList.data ?? []);
  const periodOptions = PERIOD_OPTIONS.map((option) => ({ ...option, label: t(option.label) }));

  const list = data.data?.list ?? [];
  const net = sumNet(list);
  const billing = list.reduce((a, e) => a + (e.billing_duration_seconds ?? 0), 0);
  const billable = sumBillableSeconds(list);
  const nonBillable = sumNonBillableSeconds(list);
  const amount = sumAmountCents(list);
  const trend = useMemo(() => buildTrendBuckets(list, period, tz, range), [list, period, tz, range]);
  const heatmap = useMemo(() => buildActivityHeatmap(heatmapData.data ?? [], tz), [heatmapData.data, tz]);

  // Gruppierung je Projekt (actual vs billing getrennt).
  const byProject = new Map<string, TimeEntry[]>();
  for (const e of list) {
    const key = e.project_id ?? "__none";
    (byProject.get(key) ?? byProject.set(key, []).get(key)!).push(e);
  }
  const projectBreakdown = [...byProject.entries()]
    .map(([projectId, rows]) => ({
      key: projectId,
      label: projectId === "__none" ? t("Ohne Projekt") : projNames.get(projectId) ?? projectId,
      seconds: sumNet(rows),
      entries: rows.length,
    }))
    .sort((a, b) => b.seconds - a.seconds);

  const selectedRows = selectedProjectId ? byProject.get(selectedProjectId) ?? [] : [];
  const selectedProject = (proj.data ?? []).find((project) => project.id === selectedProjectId);

  if (selectedProjectId) {
    const selectedNet = sumNet(selectedRows);
    const selectedBilling = selectedRows.reduce((sum, entry) => sum + (entry.billing_duration_seconds ?? 0), 0);
    const taskRanking = activitiesByTask(selectedRows, taskNames).slice(0, 6);
    const workRanking = activitiesByDescription(selectedRows).slice(0, 6);
    const roundingDiff = selectedBilling === selectedNet
      ? null
      : `${selectedBilling > selectedNet ? "+" : "−"}${fmtHM(Math.abs(selectedBilling - selectedNet))}`;
    return (
      <Page
        title={selectedProject?.name ?? t("Reportdetails")}
        hint={t("{range} | Projektreport", { range: range.label })}
        actions={
          <>
            <SegmentedControl<ReportPeriod>
              value={period}
              onChange={setPeriod}
              ariaLabel={t("Zeitraum")}
              options={periodOptions}
            />
            <Button variant="ghost" onClick={() => { window.location.hash = "#/reports"; }}><ArrowLeft size={15} />{t("Übersicht")}</Button>
          </>
        }
      >
        <section className="report-detail-hero">
          <span className="detail-eyebrow">{t("Detailreport")}</span>
          <div><h2>{selectedProject?.name ?? t("Projekt")}</h2><Tag tone="accent">{t("{n} Einträge", { n: selectedRows.length })}</Tag></div>
          <p>{t("Tatsächliche Arbeit, Rundung und Tätigkeiten für den gewählten Zeitraum.")}</p>
        </section>
        <StatGrid balanced>
          <StatTile label={t("Nettozeit")} value={fmtHM(selectedNet)} sub={t("tatsächlich gearbeitet")} accent />
          <StatTile label={t("Abrechnungszeit")} value={fmtHM(selectedBilling)} sub={roundingDiff === null ? t("keine Rundungsdifferenz") : t("{diff} Rundungsdifferenz", { diff: roundingDiff })} />
          <StatTile label={t("Abrechenbar")} value={fmtHM(sumBillableSeconds(selectedRows))} sub={t("{n} Einträge", { n: selectedRows.filter((entry) => entry.is_billable).length })} />
          <StatTile label={t("Umsatz")} value={fmtMoney(sumAmountCents(selectedRows))} sub={t("gespeicherte Abrechnungswerte")} />
        </StatGrid>
        <Card title={t("Zeitverlauf")} subtitle={t("Arbeitszeit im {range}", { range: range.label })}>
          <TrendChart buckets={buildTrendBuckets(selectedRows, period, tz, range)} />
        </Card>
        <div className="detail-grid">
          <Card title={t("Tätigkeiten")} subtitle={t("Nach Arbeitszeit sortiert")}>
            <ReportRanking rows={workRanking} />
          </Card>
          <Card title={t("Aufgaben")} subtitle={t("Verteilung im Zeitraum")}>
            <ReportRanking rows={taskRanking} />
          </Card>
        </div>
        <Card title={t("Einträge im Detail")} subtitle={t("Netto- und Abrechnungszeit bleiben getrennt nachvollziehbar")}>
          {selectedRows.length ? (
            <div className="report-entry-list">
              {selectedRows.map((entry) => (
                <article className="report-entry" key={entry.id}>
                  <span className="report-entry__icon">{entry.is_backdated ? <ReceiptText size={15} /> : <Clock3 size={15} />}</span>
                  <div className="report-entry__main"><strong>{entry.description || taskNames.get(entry.task_id ?? "") || t("Ohne Beschreibung")}</strong><span>{fmtDate(entry.actual_started_at, entry.timezone || tz)} | {fmtClock(entry.actual_started_at, entry.timezone || tz)},{fmtClock(entry.actual_ended_at ?? entry.actual_started_at, entry.timezone || tz)}</span></div>
                  {entry.is_backdated ? <Tag tone="muted">{t("Nachtrag")}</Tag> : null}
                  <div className="report-entry__metric"><span>{t("Netto")}</span><strong className="num">{fmtHM(entry.net_work_duration_seconds ?? 0)}</strong></div>
                  <div className="report-entry__metric"><span>{t("Abrechnung")}</span><strong className="num">{fmtHM(entry.billing_duration_seconds ?? 0)}</strong></div>
                  <div className="report-entry__metric"><span>{t("Wert")}</span><strong className="num">{fmtMoney(entry.billing_amount_snapshot ?? 0)}</strong></div>
                </article>
              ))}
            </div>
          ) : <EmptyState title={t("Keine Projektzeiten im Zeitraum")} />}
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title={t("Reports")}
      hint={range.label}
      actions={
        <SegmentedControl<ReportPeriod>
          value={period}
          onChange={setPeriod}
          ariaLabel={t("Zeitraum")}
          options={periodOptions}
        />
      }
    >
      <StatGrid balanced>
        <StatTile label={t("Tatsächlich (netto)")} value={fmtHM(net)} sub={t("echte Arbeitszeit")} accent />
        <StatTile label={t("Abrechnung (gerundet)")} value={fmtHM(billing)} sub={t("fakturierbare Zeit")} />
        <StatTile label={t("Abrechenbar")} value={fmtHM(billable)} sub={t("intern: {value}", { value: fmtHM(nonBillable) })} />
        <StatTile label={t("Umsatz")} value={fmtMoney(amount)} sub={t("aus Abrechnungszeit")} />
      </StatGrid>

      <div className="reports-visual-grid">
        <Card title={t("Zeitverlauf")} subtitle={t("Tatsächliche Arbeitszeit | {range}", { range: range.label })}>
          <TrendChart buckets={trend} />
        </Card>
        <Card title={t("Projektverteilung")} subtitle={t("Anteil an der tatsächlichen Arbeitszeit")}>
          <ProjectDistribution rows={projectBreakdown} />
        </Card>
      </div>

      <Card title={t("Aktivität")} subtitle={t("Dein Arbeitsrhythmus der letzten 12 Monate")}>
        <ActivityHeatmap weeks={heatmap} />
      </Card>

      <Card title={t("Nach Projekt")} subtitle={t("Tatsächliche Zeit und Abrechnungszeit getrennt ausgewiesen")}>
        <AsyncBody
          state={{ data: data.data?.list ?? null, error: data.error, loading: data.loading }}
          empty={<EmptyState title={t("Keine Zeiten im Zeitraum")} />}
        >
          {() => (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t("Projekt")}</th>
                    <th className="right">{t("Einträge")}</th>
                    <th className="right">{t("Netto (actual)")}</th>
                    <th className="right">{t("Abrechnung (billing)")}</th>
                    <th className="right">{t("Umsatz")}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byProject.entries()].map(([pid, rows]) => (
                    <tr key={pid}>
                      <td>{pid === "__none" ? <span className="faint">{t("ohne Projekt")}</span> : <a className="table-link table-link--row" href={`#/reports/${encodeURIComponent(pid)}`}><span>{projNames.get(pid) ?? pid}</span><ChevronRight size={15} /></a>}</td>
                      <td className="right num">{rows.length}</td>
                      <td className="right num">{fmtHM(sumNet(rows))}</td>
                      <td className="right num">{fmtHM(rows.reduce((a, e) => a + (e.billing_duration_seconds ?? 0), 0))}</td>
                      <td className="right num">{fmtMoney(sumAmountCents(rows))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>{t("Summe")}</td>
                    <td className="right num">{list.length}</td>
                    <td className="right num">{fmtHM(net)}</td>
                    <td className="right num">{fmtHM(billing)}</td>
                    <td className="right num">{fmtMoney(amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
          )}
        </AsyncBody>
      </Card>
    </Page>
  );
}

function TrendChart({ buckets }: { buckets: TrendBucket[] }) {
  const maxSeconds = Math.max(0, ...buckets.map((bucket) => bucket.seconds));
  const totalSeconds = buckets.reduce((sum, bucket) => sum + bucket.seconds, 0);
  const activeBuckets = buckets.filter((bucket) => bucket.seconds > 0).length;

  if (maxSeconds === 0) return <EmptyState title={t("Noch keine Zeiten in diesem Zeitraum")} />;

  return (
    <figure className={`report-trend ${buckets.length > 16 ? "is-dense" : ""}`} aria-label={t("Zeitverlauf der tatsächlichen Arbeitszeit")}>
      <figcaption className="report-chart-summary">
        <div><span>{t("Gesamt")}</span><strong className="num">{fmtHM(totalSeconds)}</strong></div>
        <div><span>{t("Aktive Abschnitte")}</span><strong className="num">{activeBuckets}</strong></div>
        <div><span>{t("Ø aktiv")}</span><strong className="num">{fmtHM(Math.round(totalSeconds / Math.max(1, activeBuckets)))}</strong></div>
      </figcaption>
      <div className="report-trend__plot" style={{ gridTemplateColumns: `repeat(${buckets.length}, minmax(0, 1fr))` }}>
        {buckets.map((bucket) => (
          <div className="report-trend__bucket" key={bucket.key} title={t("{label}: {value}", { label: bucket.accessibleLabel, value: fmtHM(bucket.seconds) })}>
            <span className="report-trend__value num">{bucket.seconds > 0 ? fmtHM(bucket.seconds) : ""}</span>
            <span className="report-trend__track" aria-hidden><i style={{ height: bucket.seconds > 0 ? `${Math.max(8, (bucket.seconds / maxSeconds) * 100)}%` : "0%" }} /></span>
            <span className="report-trend__label">{bucket.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function ProjectDistribution({ rows }: { rows: Array<{ key: string; label: string; seconds: number; entries: number }> }) {
  const total = rows.reduce((sum, row) => sum + row.seconds, 0);
  if (!rows.length || total === 0) return <EmptyState title={t("Noch keine Projektzeiten")} />;

  return (
    <div className="report-distribution">
      {rows.slice(0, 6).map((row, index) => {
        const share = row.seconds / total;
        return (
          <div className="report-distribution__row" key={row.key}>
            <span className={`report-distribution__dot report-distribution__dot--${(index % 4) + 1}`} aria-hidden />
            <div className="report-distribution__content">
              <div><strong>{row.label}</strong><span className="num">{Math.round(share * 100)} %</span></div>
              <span className="report-distribution__track"><i className={`report-distribution__fill--${(index % 4) + 1}`} style={{ width: `${Math.max(3, share * 100)}%` }} /></span>
              <small>{row.entries} {row.entries === 1 ? t("Eintrag") : t("Einträge")}</small>
            </div>
            <strong className="num">{fmtHM(row.seconds)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function ActivityHeatmap({ weeks }: { weeks: ActivityWeek[] }) {
  const activeDays = weeks.flatMap((week) => week.days).filter((day) => day.seconds > 0);
  const totalSeconds = activeDays.reduce((sum, day) => sum + day.seconds, 0);

  return (
    <figure className="report-heatmap" aria-label={t("Aktivitätskalender der letzten 12 Monate")}>
      <figcaption className="report-chart-summary report-chart-summary--heatmap">
        <div><span>{t("Aktive Tage")}</span><strong className="num">{activeDays.length}</strong></div>
        <div><span>{t("Arbeitszeit")}</span><strong className="num">{fmtHM(totalSeconds)}</strong></div>
        <div className="report-heatmap__legend" aria-label={t("Weniger bis mehr Aktivität")}><span>{t("Weniger")}</span>{[0, 1, 2, 3, 4].map((level) => <i className={`is-level-${level}`} key={level} />)}<span>{t("Mehr")}</span></div>
      </figcaption>
      <div className="report-heatmap__scroller">
        <div className="report-heatmap__months" aria-hidden>
          {weeks.map((week) => <span key={week.key}>{week.monthLabel}</span>)}
        </div>
        <div className="report-heatmap__body">
          <div className="report-heatmap__weekdays" aria-hidden><span>{t("Mo")}</span><span /><span>{t("Mi")}</span><span /><span>{t("Fr")}</span><span /><span>{t("So")}</span></div>
          <div className="report-heatmap__weeks">
            {weeks.map((week) => (
              <div className="report-heatmap__week" key={week.key}>
                {week.days.map((day) => (
                  <span
                    className={`report-heatmap__day is-level-${day.level}`}
                    key={day.date}
                    title={t("{label}: {value}", { label: day.label, value: day.seconds ? fmtHM(day.seconds) : t("keine Zeit") })}
                    aria-label={t("{label}: {value}", { label: day.label, value: day.seconds ? fmtHM(day.seconds) : t("keine Zeit") })}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </figure>
  );
}

function ReportRanking({ rows }: { rows: ReturnType<typeof activitiesByDescription> }) {
  if (!rows.length) return <EmptyState title={t("Noch keine Daten")} />;
  return (
    <ol className="ranking-list ranking-list--compact">
      {rows.map((row, index) => (
        <li key={row.key}>
          <span className="ranking-list__index num">{index + 1}</span>
          <div className="ranking-list__content"><div><strong>{row.label}</strong><span>{row.entries}×</span></div><span className="ranking-list__bar"><i style={{ width: `${Math.max(4, row.share * 100)}%` }} /></span></div>
          <strong className="num">{fmtHM(row.seconds)}</strong>
        </li>
      ))}
    </ol>
  );
}

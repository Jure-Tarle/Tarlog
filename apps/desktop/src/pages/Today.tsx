/**
 * Today — Tagesübersicht (doc 11 §4.1): Einträge, Lücken und Pausen einer
 * Timeline, plus Tagessumme und Compliance-Verdikt. Reine Leseansicht über
 * loadRange (src/data + @ptl/core); Aktionen verlinken in den Nachtragsassistenten.
 */
import { useMemo } from "react";
import { Page, Card, Button, StatGrid, StatTile, AsyncBody, EmptyState, ComplianceBadge, Tag, TableWrap } from "../components/ui";
import { useAsync } from "../data/hooks";
import { projects as projectRepo } from "../data/repositories";
import { sumNet, sumBreak, sumBillableSeconds, overallStatus } from "../data/aggregates";
import { fmtHM, fmtClock, fmtDayLong, fmtDurationShort, dayRange } from "../data/format";
import { useTimezone, loadRange, nameMap } from "./shared";
import type { TimeEntry } from "../data/repositories";

function go(id: string) {
  window.location.hash = `#/${id}`;
}

/** Row model: an entry, or a gap between two entries. */
type Row =
  | { kind: "entry"; entry: TimeEntry }
  | { kind: "gap"; from: number; to: number };

function buildRows(list: TimeEntry[]): Row[] {
  const done = list.filter((e) => e.actual_ended_at != null).sort((a, b) => a.actual_started_at - b.actual_started_at);
  const rows: Row[] = [];
  let prevEnd: number | null = null;
  for (const e of done) {
    if (prevEnd != null && e.actual_started_at - prevEnd >= 60_000) {
      rows.push({ kind: "gap", from: prevEnd, to: e.actual_started_at });
    }
    rows.push({ kind: "entry", entry: e });
    prevEnd = e.actual_ended_at!;
  }
  return rows;
}

export default function Today() {
  const tz = useTimezone();
  const range = useMemo(() => dayRange(tz), [tz]);
  const data = useAsync(() => loadRange(range.from, range.to, tz), [range.from, range.to, tz]);
  const proj = useAsync(() => projectRepo.list(), []);
  const projNames = nameMap(proj.data ?? []);

  const net = data.data ? sumNet(data.data.list) : 0;
  const brk = data.data ? sumBreak(data.data.list) : 0;
  const billable = data.data ? sumBillableSeconds(data.data.list) : 0;
  const status = data.data ? overallStatus(data.data.days) : "green";

  return (
    <Page
      title="Heute"
      hint={fmtDayLong(Date.now(), tz)}
      actions={
        <>
          <Button onClick={() => go("backdating")}>Nachtragen</Button>
          <Button variant="ghost" onClick={() => go("backdating")}>Lücke füllen</Button>
          <Button variant="ghost" onClick={() => go("backdating")}>Pause erfassen</Button>
        </>
      }
    >
      <StatGrid>
        <StatTile label="Netto" value={fmtHM(net)} sub="gearbeitet" accent />
        <StatTile label="Pausen" value={fmtHM(brk)} />
        <StatTile label="Abrechenbar" value={fmtHM(billable)} />
        <StatTile label="Compliance" value={<ComplianceBadge status={status} />} tone={status} onClick={() => go("compliance")} />
      </StatGrid>

      <Card title="Timeline" subtitle="Einträge und Lücken des Tages">
        <AsyncBody
          state={{ data: data.data?.list ?? null, error: data.error, loading: data.loading }}
          empty={<EmptyState title="Heute noch nichts erfasst">Starte einen Timer oder trage rückwirkend nach.</EmptyState>}
        >
          {(list) => {
            const rows = buildRows(list as TimeEntry[]);
            if (rows.length === 0) return <EmptyState title="Keine abgeschlossenen Einträge" />;
            return (
              <TableWrap>
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Zeit</th>
                      <th>Beschreibung</th>
                      <th>Projekt</th>
                      <th className="right">Pause</th>
                      <th className="right">Netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) =>
                      r.kind === "gap" ? (
                        <tr key={`gap-${i}`} className="muted">
                          <td className="num faint">{fmtClock(r.from, tz)}–{fmtClock(r.to, tz)}</td>
                          <td colSpan={2}><Tag tone="muted">Lücke · {fmtDurationShort(Math.floor((r.to - r.from) / 1000))}</Tag></td>
                          <td className="right faint">—</td>
                          <td className="right">
                            <Button variant="ghost" className="btn--sm" onClick={() => go("backdating")}>füllen</Button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={r.entry.id}>
                          <td className="num">{fmtClock(r.entry.actual_started_at, tz)}–{r.entry.actual_ended_at ? fmtClock(r.entry.actual_ended_at, tz) : "…"}</td>
                          <td>{r.entry.description || <span className="faint">(ohne Beschreibung)</span>} {r.entry.is_backdated ? <Tag tone="muted">Nachtrag</Tag> : null}</td>
                          <td>{r.entry.project_id ? projNames.get(r.entry.project_id) ?? "—" : <span className="faint">—</span>}</td>
                          <td className="right num">{r.entry.break_duration_seconds ? fmtHM(r.entry.break_duration_seconds) : "—"}</td>
                          <td className="right num">{fmtHM(r.entry.net_work_duration_seconds ?? 0)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}>Tagessumme</td>
                      <td className="right num">{fmtHM(brk)}</td>
                      <td className="right num">{fmtHM(net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </TableWrap>
            );
          }}
        </AsyncBody>
      </Card>
    </Page>
  );
}

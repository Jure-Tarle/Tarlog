/**
 * Week — Wochentabelle (doc 11 §4). Sieben Tageszeilen mit Netto, Pause,
 * abrechenbar und Compliance-Ampel, plus Wochensumme. Navigierbar über die
 * Vor/Zurück-Steuerung. Nur src/data + @ptl/core.
 */
import { useMemo, useState } from "react";
import { Page, Card, Button, StatGrid, StatTile, TableWrap, StatusDot, Loading, ErrorNote } from "../components/ui";
import { useAsync } from "../data/hooks";
import { sumNet, sumBreak, sumBillableSeconds, overallStatus } from "../data/aggregates";
import { fmtHM, fmtHoursDecimal, weekRange, weekLabel, fmtIsoDate } from "../data/format";
import { DateTime } from "luxon";
import { useTimezone, loadRange } from "./shared";
import type { ComplianceStatus } from "@ptl/core";
import type { TimeEntry } from "../data/repositories";

export default function Week() {
  const tz = useTimezone();
  const [offset, setOffset] = useState(0);
  const ref = useMemo(() => DateTime.now().setZone(tz).plus({ weeks: offset }).toMillis(), [tz, offset]);
  const range = useMemo(() => weekRange(tz, ref), [tz, ref]);
  const data = useAsync(() => loadRange(range.from, range.to, tz), [range.from, range.to, tz]);

  const statusByDate = new Map<string, ComplianceStatus>((data.data?.days ?? []).map((d) => [d.summary.date, d.status]));

  // Seven day buckets from Monday.
  const days = useMemo(() => {
    const start = DateTime.fromMillis(range.from, { zone: tz });
    return Array.from({ length: 7 }, (_, i) => start.plus({ days: i }));
  }, [range.from, tz]);

  const byDay = new Map<string, TimeEntry[]>();
  for (const e of data.data?.list ?? []) {
    const key = fmtIsoDate(e.actual_started_at, e.timezone || tz);
    (byDay.get(key) ?? byDay.set(key, []).get(key)!).push(e);
  }

  const net = data.data ? sumNet(data.data.list) : 0;
  const brk = data.data ? sumBreak(data.data.list) : 0;
  const billable = data.data ? sumBillableSeconds(data.data.list) : 0;
  const status = data.data ? overallStatus(data.data.days) : "green";

  return (
    <Page
      title="Woche"
      hint={weekLabel(tz, ref)}
      actions={
        <>
          <Button variant="ghost" onClick={() => setOffset((o) => o - 1)}>‹ Vorige</Button>
          <Button variant="ghost" onClick={() => setOffset(0)} disabled={offset === 0}>Diese Woche</Button>
          <Button variant="ghost" onClick={() => setOffset((o) => o + 1)}>Nächste ›</Button>
        </>
      }
    >
      <StatGrid>
        <StatTile label="Woche netto" value={fmtHM(net)} sub={fmtHoursDecimal(net)} accent />
        <StatTile label="Pausen" value={fmtHM(brk)} />
        <StatTile label="Abrechenbar" value={fmtHM(billable)} />
        <StatTile label="Compliance" value={<StatusDot status={status} />} tone={status} />
      </StatGrid>

      <Card title="Tage" subtitle={`${weekLabel(tz, ref)} · Mo–So`}>
        {data.loading && !data.data ? <Loading /> : data.error && !data.data ? <ErrorNote error={data.error} /> : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th className="right">Einträge</th>
                    <th className="right">Pause</th>
                    <th className="right">Abrechenbar</th>
                    <th className="right">Netto</th>
                    <th style={{ width: 40 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => {
                    const key = d.toFormat("yyyy-MM-dd");
                    const rows = byDay.get(key) ?? [];
                    const st = statusByDate.get(key);
                    return (
                      <tr key={key}>
                        <td>{d.setLocale("de").toFormat("ccc, dd.MM.")}</td>
                        <td className="right num">{rows.length || "—"}</td>
                        <td className="right num">{rows.length ? fmtHM(sumBreak(rows)) : "—"}</td>
                        <td className="right num">{rows.length ? fmtHM(sumBillableSeconds(rows)) : "—"}</td>
                        <td className="right num">{rows.length ? fmtHM(sumNet(rows)) : "—"}</td>
                        <td>{st ? <StatusDot status={st} /> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Summe</td>
                    <td className="right num">{data.data?.list.length ?? 0}</td>
                    <td className="right num">{fmtHM(brk)}</td>
                    <td className="right num">{fmtHM(billable)}</td>
                    <td className="right num">{fmtHM(net)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </TableWrap>
        )}
      </Card>
    </Page>
  );
}

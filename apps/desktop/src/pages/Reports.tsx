/**
 * Reports — Bereich 9 (doc 10 §Reports). Zeitraumauswahl (Woche/Monat) mit
 * getrennter Ausweisung von tatsächlicher Zeit (actual/netto) und
 * Abrechnungszeit (billing), plus Projektaufschlüsselung. Nur data + @tarlog/core.
 */
import { useMemo, useState } from "react";
import { Page, Card, StatGrid, StatTile, SegmentedControl, AsyncBody, EmptyState, TableWrap } from "../components/ui";
import { useAsync } from "../data/hooks";
import { projects as projectRepo } from "../data/repositories";
import { sumNet, sumBillableSeconds, sumNonBillableSeconds, sumAmountCents } from "../data/aggregates";
import { fmtHM, fmtMoney, weekRange, monthRange, weekLabel } from "../data/format";
import { useTimezone, loadRange, nameMap } from "./shared";
import type { TimeEntry } from "../data/repositories";

type Period = "week" | "month";

export default function Reports() {
  const tz = useTimezone();
  const [period, setPeriod] = useState<Period>("week");
  const range = useMemo(() => (period === "week" ? weekRange(tz) : monthRange(tz)), [tz, period]);
  const data = useAsync(() => loadRange(range.from, range.to, tz), [range.from, range.to, tz]);
  const proj = useAsync(() => projectRepo.list(), []);
  const projNames = nameMap(proj.data ?? []);

  const list = data.data?.list ?? [];
  const net = sumNet(list);
  const billing = list.reduce((a, e) => a + (e.billing_duration_seconds ?? 0), 0);
  const billable = sumBillableSeconds(list);
  const nonBillable = sumNonBillableSeconds(list);
  const amount = sumAmountCents(list);

  // Gruppierung je Projekt (actual vs billing getrennt).
  const byProject = new Map<string, TimeEntry[]>();
  for (const e of list) {
    const key = e.project_id ?? "__none";
    (byProject.get(key) ?? byProject.set(key, []).get(key)!).push(e);
  }

  return (
    <Page
      title="Reports"
      hint={period === "week" ? weekLabel(tz) : "Aktueller Monat"}
      actions={
        <SegmentedControl<Period>
          value={period}
          onChange={setPeriod}
          ariaLabel="Zeitraum"
          options={[
            { value: "week", label: "Woche" },
            { value: "month", label: "Monat" },
          ]}
        />
      }
    >
      <StatGrid>
        <StatTile label="Tatsächlich (netto)" value={fmtHM(net)} sub="echte Arbeitszeit" accent />
        <StatTile label="Abrechnung (gerundet)" value={fmtHM(billing)} sub="fakturierbare Zeit" />
        <StatTile label="Abrechenbar" value={fmtHM(billable)} sub={`intern: ${fmtHM(nonBillable)}`} />
        <StatTile label="Umsatz" value={fmtMoney(amount)} sub="aus Abrechnungszeit" />
      </StatGrid>

      <Card title="Nach Projekt" subtitle="Tatsächliche Zeit und Abrechnungszeit getrennt ausgewiesen">
        <AsyncBody
          state={{ data: data.data?.list ?? null, error: data.error, loading: data.loading }}
          empty={<EmptyState title="Keine Zeiten im Zeitraum" />}
        >
          {() => (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Projekt</th>
                    <th className="right">Einträge</th>
                    <th className="right">Netto (actual)</th>
                    <th className="right">Abrechnung (billing)</th>
                    <th className="right">Umsatz</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byProject.entries()].map(([pid, rows]) => (
                    <tr key={pid}>
                      <td>{pid === "__none" ? <span className="faint">ohne Projekt</span> : projNames.get(pid) ?? pid}</td>
                      <td className="right num">{rows.length}</td>
                      <td className="right num">{fmtHM(sumNet(rows))}</td>
                      <td className="right num">{fmtHM(rows.reduce((a, e) => a + (e.billing_duration_seconds ?? 0), 0))}</td>
                      <td className="right num">{fmtMoney(sumAmountCents(rows))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>Summe</td>
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

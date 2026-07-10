/**
 * Compliance — Bereich 13 (doc 08). Tagesweise Ampel (grün/gelb/rot) gegen das
 * deutsche Arbeitszeitprofil (ArbZG) mit Regel-Erklärung je betroffenem Tag.
 * Auswertung via @ptl/core (evaluateDay/evaluateRestPeriod) über die
 * aggregates-Schicht; reine Leseansicht.
 */
import { useMemo } from "react";
import { Page, Card, StatGrid, StatTile, AsyncBody, EmptyState, ComplianceBadge, StatusDot } from "../components/ui";
import { useAsync } from "../data/hooks";
import { overallStatus } from "../data/aggregates";
import { fmtHM, monthRange, fmtDayLong } from "../data/format";
import { useTimezone, loadRange } from "./shared";

export default function Compliance() {
  const tz = useTimezone();
  const range = useMemo(() => monthRange(tz), [tz]);
  const data = useAsync(() => loadRange(range.from, range.to, tz), [range.from, range.to, tz]);

  const days = data.data?.days ?? [];
  const status = data.data ? overallStatus(days) : "green";
  const withFindings = days.filter((d) => d.results.length > 0);

  return (
    <Page title="Compliance" hint="Deutsches Arbeitszeitprofil (ArbZG) — keine Rechtsberatung">
      <StatGrid>
        <StatTile label="Monatsstatus" value={<ComplianceBadge status={status} />} tone={status} />
        <StatTile label="Tage geprüft" value={String(days.length)} />
        <StatTile label="Auffällige Tage" value={String(withFindings.filter((d) => d.status !== "green").length)} />
      </StatGrid>

      <Card title="Tage mit Hinweisen" subtitle="ArbZG §3/§4/§5 — Pausen, Höchstarbeitszeit, Ruhezeit">
        <AsyncBody
          state={{ data: withFindings.length ? withFindings : null, error: data.error, loading: data.loading }}
          empty={<EmptyState title="Keine Compliance-Hinweise">Alle geprüften Tage sind konform.</EmptyState>}
        >
          {(list) => (
            <div className="stack">
              {list.map((d) => (
                <div key={d.summary.date} className="inset">
                  <div className="rowline">
                    <ComplianceBadge status={d.status} />
                    <strong>{fmtDayLong(d.summary.first_start_at ?? range.from, tz)}</strong>
                    <span className="muted">
                      Netto {fmtHM(d.summary.net_seconds)} · Pause {fmtHM(d.summary.break_seconds)}
                    </span>
                  </div>
                  <ul className="rulelist">
                    {d.results.map((r, i) => (
                      <li key={`${d.summary.date}-${i}`} className="rulelist__item">
                        <StatusDot status={r.status} />
                        <span>{r.message}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </AsyncBody>
      </Card>
    </Page>
  );
}

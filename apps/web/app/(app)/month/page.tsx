/**
 * /month — Monatsübersicht (doc 11 §2 Nr. 5, §4.1 Nr. 3): Monatsraster mit
 * Tagessummen und Compliance-Markern. Jede Zelle verlinkt in die Tagesansicht.
 */
import { PageHeader, LoadError, Grid, StatTile, type Traffic } from "@/lib/ui/ui";
import { Button } from "@/lib/ui/controls";
import { formatMoney, secondsToHM, toLocalDate } from "@/lib/ui/format";
import {
  requireAccount,
  listEntries,
  listComplianceResults,
  sumEntries,
  monthRange,
  todayIso,
} from "@/lib/ui/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default async function MonthPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<React.ReactElement> {
  const account = await requireAccount();
  const sp = await searchParams;
  const tz = account.timezone;
  const iso = sp.date ?? todayIso(tz);
  const range = monthRange(tz, iso);
  const firstIso = toLocalDate(range.start, tz);
  const [yy, mm] = firstIso.split("-").map(Number);
  const prevIso = `${(mm ?? 1) === 1 ? (yy ?? 1970) - 1 : yy}-${pad((mm ?? 1) === 1 ? 12 : (mm ?? 1) - 1)}-01`;
  const nextIso = `${(mm ?? 1) === 12 ? (yy ?? 1970) + 1 : yy}-${pad((mm ?? 1) === 12 ? 1 : (mm ?? 1) + 1)}-01`;

  let body: React.ReactElement;
  try {
    const [entries, compliance] = await Promise.all([
      listEntries(account.id, range),
      listComplianceResults(account.id, range.start),
    ]);
    const month = sumEntries(entries);

    const byDay = new Map<string, { net: number; count: number }>();
    for (const e of entries) {
      const d = toLocalDate(e.actual_started_at, tz);
      const cur = byDay.get(d) ?? { net: 0, count: 0 };
      cur.net += e.net_work_duration_seconds ?? 0;
      cur.count += 1;
      byDay.set(d, cur);
    }
    const worst = (d: string): Traffic | null => {
      const c = compliance.filter((x) => x.scope_date === d);
      if (c.length === 0) return null;
      return c.some((x) => x.severity === "red") ? "red" : c.some((x) => x.severity === "yellow") ? "yellow" : "green";
    };

    // Kalendergitter: Leerzellen bis zum ersten Wochentag (Mo=0).
    const daysInMonth = new Date(Date.UTC(yy ?? 1970, mm ?? 1, 0)).getUTCDate();
    const firstDow = (new Date(Date.UTC(yy ?? 1970, (mm ?? 1) - 1, 1)).getUTCDay() + 6) % 7;
    const cells: Array<string | null> = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(`${yy}-${pad(mm ?? 1)}-${pad(day)}`);

    const dot = (s: Traffic) => (s === "red" ? "var(--color-danger)" : s === "yellow" ? "var(--color-warn)" : "var(--color-ok)");

    body = (
      <>
        <Grid min={190} style={{ marginBottom: 18 }}>
          <StatTile label="Monat netto" value={secondsToHM(month.netSeconds) + " h"} accent />
          <StatTile label="Abrechenbar" value={secondsToHM(month.billableSeconds) + " h"} />
          <StatTile label="Umsatz" value={formatMoney(month.billableAmountCents, account.currency)} />
          <StatTile label="Pausen" value={secondsToHM(month.breakSeconds) + " h"} />
        </Grid>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
          {WD.map((w) => (
            <div key={w} style={{ fontSize: 11, fontWeight: 600, color: "var(--color-text-muted)", textAlign: "center", padding: "2px 0" }}>{w}</div>
          ))}
          {cells.map((d, i) =>
            d === null ? (
              <div key={`e-${i}`} />
            ) : (
              (() => {
                const info = byDay.get(d);
                const w = worst(d);
                const isToday = d === todayIso(tz);
                return (
                  <a
                    key={d}
                    href={`/today?date=${d}`}
                    style={{
                      display: "block",
                      textDecoration: "none",
                      color: "inherit",
                      border: "1px solid var(--color-border)",
                      borderTop: isToday ? "2px solid var(--color-accent)" : "1px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      background: info ? "var(--color-surface-raised)" : "var(--color-surface-sunken)",
                      padding: 8,
                      minHeight: 66,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--color-text-faint)" }}>{Number(d.slice(8))}</span>
                      {w ? <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: dot(w) }} /> : null}
                    </div>
                    {info ? (
                      <div className="tabular" style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>{secondsToHM(info.net)}</div>
                    ) : null}
                  </a>
                );
              })()
            ),
          )}
        </div>
      </>
    );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader
        title="Monat"
        subtitle={firstIso.slice(0, 7)}
        actions={
          <div style={{ display: "flex", gap: 8 }}>
            <a href={`/month?date=${prevIso}`}><Button size="sm">‹ Vormonat</Button></a>
            <a href="/month"><Button size="sm">Aktuell</Button></a>
            <a href={`/month?date=${nextIso}`}><Button size="sm">Folgemonat ›</Button></a>
          </div>
        }
      />
      {body}
    </section>
  );
}

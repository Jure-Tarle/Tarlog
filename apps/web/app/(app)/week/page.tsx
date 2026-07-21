/**
 * /week, Wochenübersicht (doc 11 §2 Nr. 4, §4.1). 7-Tage-Raster mit
 * Tagessummen (netto/abrechenbar) und 48-h-EU-Richtwert. Die Drag-and-Drop-
 * Timesheet-Interaktion ist Desktop-Ausbau (doc 11 §4.2); hier die dichte
 * Lesesicht mit Direktlink je Tag in die Tagesansicht.
 */
import { PageHeader, LoadError, Grid, StatTile, ComplianceBadge, type Traffic } from "@/lib/ui/ui";
import { RealtimeRefresher } from "@/lib/ui/RealtimeRefresher";
import { ButtonLink } from "@/lib/ui/controls";
import { formatMoney, secondsToHM, toLocalDate } from "@/lib/ui/format";
import {
  requireAccount,
  listEntries,
  listComplianceResults,
  sumEntries,
  weekRange,
  todayIso,
} from "@/lib/ui/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}
const WD = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<React.ReactElement> {
  const account = await requireAccount();
  const sp = await searchParams;
  const tz = account.timezone;
  const iso = sp.date ?? todayIso(tz);
  const range = weekRange(tz, iso);
  const mondayIso = toLocalDate(range.start, tz);

  let body: React.ReactElement;
  try {
    const [entries, compliance] = await Promise.all([
      listEntries(account.id, range),
      listComplianceResults(account.id, range.start),
    ]);
    const week = sumEntries(entries);
    const days = Array.from({ length: 7 }, (_, i) => shiftIso(mondayIso, i));
    const byDay = new Map<string, typeof entries>();
    for (const e of entries) {
      const d = toLocalDate(e.actual_started_at, tz);
      const arr = byDay.get(d) ?? [];
      arr.push(e);
      byDay.set(d, arr);
    }
    const complianceByDay = (d: string): Traffic => {
      const c = compliance.filter((x) => x.scope_date === d);
      return c.some((x) => x.severity === "red") ? "red" : c.some((x) => x.severity === "yellow") ? "yellow" : "green";
    };
    const overEu = week.netSeconds / 3600 > 48;

    body = (
      <>
        <Grid min={190} style={{ marginBottom: 18 }}>
          <StatTile label="Woche netto" value={secondsToHM(week.netSeconds) + " h"} accent hint={overEu ? "über 48 h (EU-Richtwert)" : "EU-Richtwert 48 h"} />
          <StatTile label="Abrechenbar" value={secondsToHM(week.billableSeconds) + " h"} />
          <StatTile label="Pausen" value={secondsToHM(week.breakSeconds) + " h"} />
          <StatTile label="Umsatz (Woche)" value={formatMoney(week.billableAmountCents, account.currency)} />
        </Grid>

        <div className="week-grid">
          {days.map((d, i) => {
            const de = byDay.get(d) ?? [];
            const s = sumEntries(de);
            const isToday = d === todayIso(tz);
            return (
              <a
                key={d}
                href={`/today?date=${d}`}
                className={`week-day-card${isToday ? " is-today" : ""}`}
              >
                <div className="week-day-heading">
                  <span>{WD[i]}</span>
                  <span>{d.slice(8)}.{d.slice(5, 7)}.</span>
                </div>
                <div className="week-day-duration tabular">{secondsToHM(s.netSeconds)}</div>
                <div className="week-day-count">{de.length} Einträge</div>
                <div className="week-day-compliance">
                  {de.length > 0 ? <ComplianceBadge status={complianceByDay(d)} /> : null}
                </div>
              </a>
            );
          })}
        </div>
      </>
    );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader
        title="Woche"
        subtitle={`Kalenderwoche ab ${mondayIso}`}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <RealtimeRefresher types={["time_entry."]} />
            <ButtonLink href={`/week?date=${shiftIso(mondayIso, -7)}`} size="sm">‹ Vorwoche</ButtonLink>
            <ButtonLink href="/week" size="sm">Diese Woche</ButtonLink>
            <ButtonLink href={`/week?date=${shiftIso(mondayIso, 7)}`} size="sm">Folgewoche ›</ButtonLink>
          </div>
        }
      />
      {body}
    </section>
  );
}

/**
 * /today, Tagesübersicht (doc 11 §2 Nr. 3, doc 03 §7.5, alle 10 Elemente):
 * erfasste Zeiten, Lücken, mögliche vergessene Arbeit, Pausen, Überlappungen,
 * Tagesgesamtzeit, Compliance-Status + Buttons Nachtragen / Lücke / Pause.
 */
import {
  PageHeader,
  Card,
  Table,
  Th,
  Td,
  EmptyState,
  LoadError,
  ComplianceBadge,
  Badge,
  Grid,
  StatTile,
  type Traffic,
} from "@/lib/ui/ui";
import { RealtimeRefresher } from "@/lib/ui/RealtimeRefresher";
import { ButtonLink } from "@/lib/ui/controls";
import { formatTime, secondsToHM, secondsToHMS } from "@/lib/ui/format";
import {
  requireAccount,
  listEntries,
  listComplianceResults,
  sumEntries,
  dayRange,
  todayIso,
  type EntryRow,
} from "@/lib/ui/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
function shiftIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

const GAP_MIN_SECONDS = 300; // Lücken ab 5 Min. anzeigen

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}): Promise<React.JSX.Element> {
  const account = await requireAccount();
  const sp = await searchParams;
  const iso = sp.date ?? todayIso(account.timezone);
  const tz = account.timezone;

  let body: React.JSX.Element;
  try {
    const range = dayRange(tz, iso);
    const [entries, compliance] = await Promise.all([
      listEntries(account.id, range),
      listComplianceResults(account.id, range.start),
    ]);
    const dayCompliance = compliance.filter((c) => c.scope_date === iso);
    const worst: Traffic = dayCompliance.some((c) => c.severity === "red")
      ? "red"
      : dayCompliance.some((c) => c.severity === "yellow")
        ? "yellow"
        : "green";
    const sums = sumEntries(entries);

    // Zeilen inkl. Lücken + Überlappungen zwischen aufeinanderfolgenden Einträgen.
    type Row =
      | { kind: "entry"; e: EntryRow }
      | { kind: "gap"; start: number; end: number }
      | { kind: "overlap"; start: number; end: number };
    const rows: Row[] = [];
    entries.forEach((e, i) => {
      rows.push({ kind: "entry", e });
      const next = entries[i + 1];
      if (next && e.actual_ended_at != null) {
        const delta = next.actual_started_at - e.actual_ended_at;
        if (delta >= GAP_MIN_SECONDS * 1000) rows.push({ kind: "gap", start: e.actual_ended_at, end: next.actual_started_at });
        else if (delta < 0) rows.push({ kind: "overlap", start: next.actual_started_at, end: e.actual_ended_at });
      }
    });

    body = (
      <>
        <Grid min={180} style={{ marginBottom: 18 }}>
          <StatTile label="Tagesgesamt (netto)" value={secondsToHM(sums.netSeconds) + " h"} accent />
          <StatTile label="Pausen" value={secondsToHM(sums.breakSeconds) + " h"} />
          <StatTile label="Abrechenbar" value={secondsToHM(sums.billableSeconds) + " h"} />
          <StatTile label="Compliance" value={<ComplianceBadge status={worst} />} href="/compliance" />
        </Grid>

        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <ButtonLink href={`/nachtrag?date=${iso}`} variant="primary">Arbeitszeit nachtragen</ButtonLink>
          <ButtonLink href={`/nachtrag?date=${iso}&kind=gap`}>Lücke als Arbeit erfassen</ButtonLink>
          <ButtonLink href={`/nachtrag?date=${iso}&kind=break`}>Pause einfügen</ButtonLink>
        </div>

        {entries.length === 0 ? (
          <EmptyState
            title="Keine Einträge an diesem Tag"
            hint="Trage vergessene Arbeitszeit nach oder starte den Timer."
            action={<ButtonLink href={`/nachtrag?date=${iso}`} variant="primary">Arbeitszeit nachtragen</ButtonLink>}
          />
        ) : (
          <Table
            head={
              <>
                <Th width={130}>Zeit</Th>
                <Th>Projekt / Beschreibung</Th>
                <Th align="right">Netto</Th>
                <Th align="right">Abrechnung</Th>
                <Th align="center">Status</Th>
              </>
            }
          >
            {rows.map((r, idx) => {
              if (r.kind === "gap") {
                return (
                  <tr key={`gap-${idx}`} style={{ background: "var(--color-surface-sunken)" }}>
                    <Td mono muted>{formatTime(r.start, tz)},{formatTime(r.end, tz)}</Td>
                    <Td muted>
                      Lücke ({secondsToHM((r.end - r.start) / 1000)} h), mögliche vergessene Arbeit
                    </Td>
                    <Td /><Td />
                    <Td align="center">
                      <ButtonLink href={`/nachtrag?date=${iso}&start=${r.start}&end=${r.end}`} size="sm">Nachtragen</ButtonLink>
                    </Td>
                  </tr>
                );
              }
              if (r.kind === "overlap") {
                return (
                  <tr key={`ov-${idx}`}>
                    <Td mono muted>{formatTime(r.start, tz)},{formatTime(r.end, tz)}</Td>
                    <Td><ComplianceBadge status="yellow" label="Überschneidung" /></Td>
                    <Td /><Td /><Td />
                  </tr>
                );
              }
              const e = r.e;
              return (
                <tr key={e.id}>
                  <Td mono>
                    {formatTime(e.actual_started_at, tz)},{e.actual_ended_at ? formatTime(e.actual_ended_at, tz) : "…"}
                    {e.crosses_midnight ? <div style={{ fontSize: 10, color: "var(--color-warn)" }}>Mitternacht</div> : null}
                  </Td>
                  <Td>
                    <div style={{ fontWeight: 500 }}>{e.projectName ?? "Ohne Projekt"}</div>
                    <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{e.description ?? ","}</div>
                    <div style={{ marginTop: 4, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {e.status === "draft" ? <Badge tone="muted">Entwurf</Badge> : null}
                      {e.is_backdated ? <Badge tone="muted">nachgetragen</Badge> : null}
                      {e.break_duration_seconds ? <Badge tone="muted">Pause {secondsToHM(e.break_duration_seconds)}</Badge> : null}
                    </div>
                  </Td>
                  <Td align="right" mono>{secondsToHMS(e.net_work_duration_seconds)}</Td>
                  <Td align="right" mono>{e.is_billable ? secondsToHMS(e.billing_duration_seconds) : ","}</Td>
                  <Td align="center">{e.is_billable ? <Badge tone="accent">abrechenbar</Badge> : <Badge tone="muted">intern</Badge>}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </>
    );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader
        title="Heute"
        subtitle={iso}
        actions={
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <RealtimeRefresher types={["time_entry.", "timer.stopped"]} />
            <ButtonLink href={`/today?date=${shiftIso(iso, -1)}`} size="sm">‹ Vortag</ButtonLink>
            <ButtonLink href="/today" size="sm">Heute</ButtonLink>
            <ButtonLink href={`/today?date=${shiftIso(iso, 1)}`} size="sm">Folgetag ›</ButtonLink>
          </div>
        }
      />
      {body}
    </section>
  );
}

/**
 * /reports — Zeitraum/Filter, Ist vs. Abrechnung (doc 11 §2 Nr. 9, §4.1 Nr. 6).
 * Serverseitig aus der DB gerechnet (actual vs. billing je Projekt), damit der
 * Report ohne separaten API-Dienst belastbar ist. Filter über ein natives
 * GET-Formular (kein Client-JS, keine Router-Typreibung).
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Card } from "@/lib/ui/ui";
import { formatMoney, secondsToHM, toLocalDate } from "@/lib/ui/format";
import { requireAccount, listProjects, listEntries, dayRange, monthRange } from "@/lib/ui/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputStyle = {
  padding: "6px 9px",
  fontSize: 13.5,
  border: "1px solid var(--color-border-strong)",
  borderRadius: "var(--radius-sm)",
  background: "var(--color-surface)",
  color: "var(--color-text)",
} as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; project?: string; billable?: string }>;
}): Promise<React.ReactElement> {
  const account = await requireAccount();
  const sp = await searchParams;
  const tz = account.timezone;
  const month = monthRange(tz);
  const from = sp.from ?? toLocalDate(month.start, tz);
  const to = sp.to ?? toLocalDate(Date.now(), tz);

  let filters: React.ReactElement;
  let body: React.ReactElement;
  try {
    const projects = await listProjects(account.id);
    filters = (
      <Card style={{ marginBottom: 18 }}>
        <form action="/reports" method="get" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12.5 }}>
            <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>Von</div>
            <input type="date" name="from" defaultValue={from} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>Bis</div>
            <input type="date" name="to" defaultValue={to} style={inputStyle} />
          </label>
          <label style={{ fontSize: 12.5 }}>
            <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>Projekt</div>
            <select name="project" defaultValue={sp.project ?? ""} style={{ ...inputStyle, minWidth: 160 }}>
              <option value="">alle</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 12.5 }}>
            <div style={{ color: "var(--color-text-muted)", marginBottom: 4 }}>Abrechenbarkeit</div>
            <select name="billable" defaultValue={sp.billable ?? ""} style={inputStyle}>
              <option value="">alle</option>
              <option value="yes">nur abrechenbar</option>
              <option value="no">nur intern</option>
            </select>
          </label>
          <button
            type="submit"
            style={{ ...inputStyle, background: "var(--color-accent)", color: "var(--color-accent-contrast)", border: "1px solid var(--color-accent)", cursor: "pointer", fontWeight: 500 }}
          >
            Anwenden
          </button>
        </form>
      </Card>
    );

    const range = { start: dayRange(tz, from).start, end: dayRange(tz, to).end };
    let entries = await listEntries(account.id, range);
    if (sp.project) entries = entries.filter((e) => e.project_id === sp.project);
    if (sp.billable === "yes") entries = entries.filter((e) => e.is_billable);
    if (sp.billable === "no") entries = entries.filter((e) => !e.is_billable);

    // Gruppierung je Projekt: Ist (netto) vs. Abrechnung (gerundet) + Betrag.
    const groups = new Map<string, { name: string; count: number; actual: number; billing: number; amount: number }>();
    for (const e of entries) {
      const key = e.project_id ?? "—";
      const g = groups.get(key) ?? { name: e.projectName ?? "Ohne Projekt", count: 0, actual: 0, billing: 0, amount: 0 };
      g.count += 1;
      g.actual += e.net_work_duration_seconds ?? 0;
      if (e.is_billable) {
        g.billing += e.billing_duration_seconds ?? 0;
        g.amount += e.billing_amount_snapshot ?? 0;
      }
      groups.set(key, g);
    }
    const rows = [...groups.values()].sort((a, b) => b.actual - a.actual);
    const total = rows.reduce(
      (t, r) => ({ count: t.count + r.count, actual: t.actual + r.actual, billing: t.billing + r.billing, amount: t.amount + r.amount }),
      { count: 0, actual: 0, billing: 0, amount: 0 },
    );

    body =
      rows.length === 0 ? (
        <EmptyState title="Keine Daten im Zeitraum" hint="Passe Zeitraum oder Filter an." />
      ) : (
        <Table
          head={
            <>
              <Th>Projekt</Th>
              <Th align="right">Einträge</Th>
              <Th align="right">Ist (netto)</Th>
              <Th align="right">Abrechnung</Th>
              <Th align="right">Δ Rundung</Th>
              <Th align="right">Betrag</Th>
            </>
          }
        >
          {rows.map((r) => (
            <tr key={r.name}>
              <Td>{r.name}</Td>
              <Td align="right" mono muted>{r.count}</Td>
              <Td align="right" mono>{secondsToHM(r.actual)} h</Td>
              <Td align="right" mono>{secondsToHM(r.billing)} h</Td>
              <Td align="right" mono muted>{secondsToHM(Math.abs(r.billing - r.actual))} h</Td>
              <Td align="right" mono>{formatMoney(r.amount, account.currency)}</Td>
            </tr>
          ))}
          <tr style={{ background: "var(--color-surface-sunken)", fontWeight: 600 }}>
            <Td>Summe</Td>
            <Td align="right" mono>{total.count}</Td>
            <Td align="right" mono>{secondsToHM(total.actual)} h</Td>
            <Td align="right" mono>{secondsToHM(total.billing)} h</Td>
            <Td align="right" mono>{secondsToHM(Math.abs(total.billing - total.actual))} h</Td>
            <Td align="right" mono>{formatMoney(total.amount, account.currency)}</Td>
          </tr>
        </Table>
      );
  } catch {
    filters = <></>;
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Reports" subtitle={`Zeitraum ${from} – ${to}`} actions={<a href="/exports"><span style={{ fontSize: 13, color: "var(--color-accent)" }}>Als Datei exportieren →</span></a>} />
      {filters}
      {body}
    </section>
  );
}

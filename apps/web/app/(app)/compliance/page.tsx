/**
 * /compliance — Tagesliste grün/gelb/rot + Regelerklärung + Override (doc 11 §2
 * Nr. 13, doc 08). Ampel trägt immer Symbol + Text (Farbe nie allein).
 */
import { PageHeader, LoadError, EmptyState, Card, ComplianceBadge, Badge, type Traffic } from "@/lib/ui/ui";
import { GERMAN_PROFILE } from "@ptl/core";
import { requireAccount, listComplianceResults, monthRange } from "@/lib/ui/queries";
import { ComplianceOverride } from "./ComplianceOverride";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RANK: Record<Traffic, number> = { green: 0, yellow: 1, red: 2 };

export default async function CompliancePage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  try {
    const month = monthRange(account.timezone);
    const results = await listComplianceResults(account.id, month.start);

    // Nach Tag gruppieren, absteigend.
    const byDay = new Map<string, typeof results>();
    for (const r of results) {
      const d = r.scope_date ?? "—";
      const arr = byDay.get(d) ?? [];
      arr.push(r);
      byDay.set(d, arr);
    }
    const days = [...byDay.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

    body =
      results.length === 0 ? (
        <EmptyState title="Keine Compliance-Auffälligkeiten" hint="Für den aktuellen Zeitraum sind alle Tage grün." />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {days.map(([date, items]) => {
            const worst: Traffic = items.reduce<Traffic>((w, i) => (RANK[i.severity] > RANK[w] ? i.severity : w), "green");
            return (
              <Card key={date} padded={false}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--color-border)" }}>
                  <span className="tabular" style={{ fontWeight: 600 }}>{date}</span>
                  <ComplianceBadge status={worst} />
                </div>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {items.map((i) => (
                    <li key={i.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border)", display: "flex", gap: 12, alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 320px" }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <ComplianceBadge status={i.severity} />
                          <Badge tone="muted">{i.rule_code}</Badge>
                        </div>
                        <p style={{ margin: "6px 0 0", fontSize: 13.5 }}>{i.message}</p>
                      </div>
                      <div><ComplianceOverride id={i.id} existing={i.override_reason} /></div>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Compliance" subtitle="Arbeitszeit-Prüfung: Pausen, Höchstzeiten, Ruhezeit" />
      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 6 }}>{GERMAN_PROFILE.jurisdiction_name}</div>
        <p style={{ margin: 0, fontSize: 13, color: "var(--color-text-muted)" }}>{GERMAN_PROFILE.user_visible_explanation}</p>
        <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--color-text-faint)" }}>
          Richtwerte: Pause 30 Min. ab 6 h / 45 Min. ab 9 h · Höchstarbeitszeit 8 h (bis 10 h) · Ruhezeit 11 h · Quelle: {GERMAN_PROFILE.source_note}
        </p>
      </Card>
      {body}
    </section>
  );
}

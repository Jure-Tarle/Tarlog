/**
 * /projects — Projektliste + Anlage (doc 11 §2 Nr. 7). Zeigt Abrechnungsart,
 * Satz, Kunde und Stopp-Konfiguration (Beschreibungspflicht).
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Badge } from "@/lib/ui/ui";
import { formatMoney } from "@/lib/ui/format";
import { requireAccount, listProjects, listCustomers, listRoundingRules } from "@/lib/ui/queries";
import { ProjectForm } from "./ProjectForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BILLING_LABEL: Record<string, string> = {
  hourly: "stundenweise",
  day_rate: "Tagessatz",
  fixed_fee: "Festpreis",
  retainer: "Retainer",
  non_billable: "nicht abrechenbar",
};

function rate(p: { billing_type: string; hourly_rate_cents: number | null; day_rate_cents: number | null; fixed_fee_cents: number | null }, cur: string): string {
  if (p.billing_type === "day_rate") return p.day_rate_cents != null ? formatMoney(p.day_rate_cents, cur) + " / Tag" : "—";
  if (p.billing_type === "fixed_fee") return p.fixed_fee_cents != null ? formatMoney(p.fixed_fee_cents, cur) : "—";
  if (p.billing_type === "non_billable") return "—";
  return p.hourly_rate_cents != null ? formatMoney(p.hourly_rate_cents, cur) + " / h" : "—";
}

export default async function ProjectsPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  let form: React.ReactElement | null = null;
  try {
    const [projects, customers, rules] = await Promise.all([
      listProjects(account.id),
      listCustomers(account.id),
      listRoundingRules(account.id),
    ]);
    form = <ProjectForm customers={customers.map((c) => ({ id: c.id, name: c.name }))} rules={rules.map((r) => ({ id: r.id, name: r.name }))} />;
    body =
      projects.length === 0 ? (
        <EmptyState title="Noch keine Projekte" hint="Projekte tragen Abrechnungsart, Satz und Stopp-Konfiguration." action={form} />
      ) : (
        <Table
          head={
            <>
              <Th>Projekt</Th>
              <Th>Kunde</Th>
              <Th>Abrechnung</Th>
              <Th align="right">Satz</Th>
              <Th align="center">Status</Th>
            </>
          }
        >
          {projects.map((p) => (
            <tr key={p.id}>
              <Td>
                <div style={{ fontWeight: 500 }}>{p.name}</div>
                <div style={{ marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {p.project_code ? <Badge tone="muted">{p.project_code}</Badge> : null}
                  {p.description_required ? <Badge tone="muted">Beschreibung Pflicht</Badge> : null}
                </div>
              </Td>
              <Td muted>{p.customerName ?? "intern"}</Td>
              <Td>{BILLING_LABEL[p.billing_type] ?? p.billing_type}</Td>
              <Td align="right" mono>{rate(p, account.currency)}</Td>
              <Td align="center"><Badge tone={p.status === "active" ? "accent" : "muted"}>{p.status ?? "active"}</Badge></Td>
            </tr>
          ))}
        </Table>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Projekte" subtitle="Abrechnungsart, Budget und Stopp-Konfiguration" actions={form} />
      {body}
    </section>
  );
}

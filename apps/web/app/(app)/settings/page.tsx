/**
 * /settings — Profil, Rundungsregeln, Nummernkreis (doc 11 §2 Nr. 14).
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, SectionTitle, Badge } from "@/lib/ui/ui";
import { requireAccount, listRoundingRules, listSettings } from "@/lib/ui/queries";
import { ProfileForm, RoundingRuleForm, NumberRangeForm } from "./SettingsForms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODE_LABEL: Record<string, string> = {
  none: "keine",
  always_up: "immer auf",
  always_down: "immer ab",
  commercial: "kaufmännisch",
  nearest_interval: "nächstes Intervall",
  ceil_started_interval: "angefangenes Intervall",
  min_per_entry: "Min. je Eintrag",
  min_per_day: "Min. je Tag",
  min_per_project: "Min. je Projekt",
};

export default async function SettingsPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let content: React.ReactElement;
  try {
    const [rules, settings] = await Promise.all([listRoundingRules(account.id), listSettings(account.id)]);
    const nr = settings.find((s) => s.key === "invoice_number_range")?.value_json ?? {};
    const numberRange = {
      prefix: typeof nr.prefix === "string" ? nr.prefix : "RE-",
      next_number: String(typeof nr.next_number === "number" ? nr.next_number : 1),
      padding: String(typeof nr.padding === "number" ? nr.padding : 3),
    };

    content = (
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <ProfileForm
          initial={{
            displayName: account.displayName,
            companyName: account.companyName,
            currency: account.currency,
            timezone: account.timezone,
            locale: account.locale,
          }}
        />

        <div>
          <SectionTitle>Rundungsregeln</SectionTitle>
          {rules.length === 0 ? (
            <EmptyState title="Keine Rundungsregeln" hint="Lege unten eine Regel an (9 Modi, Intervalle 5–60 Min.)." />
          ) : (
            <Table
              head={
                <>
                  <Th>Name</Th>
                  <Th>Modus</Th>
                  <Th align="right">Intervall</Th>
                  <Th align="right">Minimum</Th>
                  <Th align="center">Geltung</Th>
                </>
              }
            >
              {rules.map((r) => (
                <tr key={r.id}>
                  <Td><span style={{ fontWeight: 500 }}>{r.name}</span></Td>
                  <Td>{MODE_LABEL[r.mode] ?? r.mode}</Td>
                  <Td align="right" mono>{r.interval_minutes != null ? `${r.interval_minutes} Min.` : "—"}</Td>
                  <Td align="right" mono>{r.min_duration_seconds != null ? `${Math.round(r.min_duration_seconds / 60)} Min.` : "—"}</Td>
                  <Td align="center"><Badge tone="muted">{r.scope ?? "global"}</Badge></Td>
                </tr>
              ))}
            </Table>
          )}
          <div style={{ marginTop: 14 }}>
            <RoundingRuleForm />
          </div>
        </div>

        <NumberRangeForm initial={numberRange} />
      </div>
    );
  } catch {
    content = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Einstellungen" subtitle="Profil, Rundungsregeln, Rechnungs-Nummernkreis" />
      {content}
    </section>
  );
}

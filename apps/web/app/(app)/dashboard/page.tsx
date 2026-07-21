/**
 * /dashboard, Einstieg mit 15 Elementen (doc 11 §3). Kompaktes Kachel-Raster,
 * tabulare Ziffern, EINE Akzentfarbe für aktiven Timer + Primäraktion. Zahlen
 * werden serverseitig gelesen und via Sync-Kanal live aktualisiert.
 */
import {
  PageHeader,
  Grid,
  StatTile,
  LoadError,
  SectionTitle,
  ComplianceBadge,
  type Traffic,
} from "@/lib/ui/ui";
import { RealtimeRefresher } from "@/lib/ui/RealtimeRefresher";
import { ButtonLink } from "@/lib/ui/controls";
import { formatMoney, formatRelative, secondsToHM } from "@/lib/ui/format";
import {
  requireAccount,
  getTimer,
  getDashboard,
  getConflictCount,
  listComplianceResults,
  listDevices,
  weekRange,
} from "@/lib/ui/queries";
import { DashboardLive } from "./DashboardLive";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage(): Promise<React.JSX.Element> {
  const account = await requireAccount();
  const cur = account.currency;

  let body: React.JSX.Element;
  try {
    const week = weekRange(account.timezone);
    const [timer, dash, conflicts, compliance, devices] = await Promise.all([
      getTimer(account.id),
      getDashboard(account),
      getConflictCount(account.id),
      listComplianceResults(account.id, week.start),
      listDevices(account.id),
    ]);

    const reds = compliance.filter((c) => c.severity === "red").length;
    const yellows = compliance.filter((c) => c.severity === "yellow").length;
    const complianceStatus: Traffic = reds > 0 ? "red" : yellows > 0 ? "yellow" : "green";
    const openWarnings = reds + yellows;

    const lastSync = devices.reduce<number | null>((m, d) => Math.max(m ?? 0, d.last_sync_at ?? 0) || m, null);
    const connected = devices.some((d) => d.server_connected);

    body = (
      <>
        <DashboardLive initialTimer={timer} recentProjects={dash.recentProjects} />

        <SectionTitle>Heute</SectionTitle>
        <Grid min={190}>
          <StatTile label="Heutige Arbeitszeit" value={secondsToHM(dash.today.netSeconds) + " h"} accent href="/today" />
          <StatTile label="Pausenzeit" value={secondsToHM(dash.today.breakSeconds) + " h"} href="/today" />
          <StatTile label="Abrechenbar heute" value={secondsToHM(dash.today.billableSeconds) + " h"} href="/today" />
          <StatTile label="Nicht abrechenbar" value={secondsToHM(dash.today.nonBillableSeconds) + " h"} href="/today" />
        </Grid>

        <SectionTitle>Woche &amp; Monat</SectionTitle>
        <Grid min={190}>
          <StatTile
            label="Wochenarbeitszeit"
            value={secondsToHM(dash.week.netSeconds) + " h"}
            hint={dash.week.netSeconds / 3600 > 48 ? "über 48 h (EU-Richtwert)" : "EU-Richtwert 48 h"}
            href="/week"
          />
          <StatTile label="Monatsumsatz" value={formatMoney(dash.month.billableAmountCents, cur)} href="/reports" />
          <StatTile
            label="Offene Rechnungszeit"
            value={formatMoney(dash.openBillingAmountCents, cur)}
            hint={secondsToHM(dash.openBillingSeconds) + " h nicht fakturiert"}
            href="/invoices"
          />
          <StatTile label="Abrechenbar (Woche)" value={secondsToHM(dash.week.billableSeconds) + " h"} href="/reports" />
        </Grid>

        <SectionTitle>Status &amp; offene Punkte</SectionTitle>
        <Grid min={190}>
          <StatTile label="Unvollständige Einträge" value={dash.draftCount} hint="Entwürfe vervollständigen" href="/today" />
          <StatTile label="Nachgetragene Einträge" value={dash.backdatedCount} hint="manuell nachgetragen" href="/nachtrag" />
          <StatTile
            label="Compliance"
            value={<ComplianceBadge status={complianceStatus} count={openWarnings} />}
            hint="Ampel grün/gelb/rot"
            href="/compliance"
          />
          <StatTile
            label="Sync-Status"
            value={connected ? "verbunden" : "offline"}
            hint={`${conflicts} Konflikte | letzter Sync ${formatRelative(lastSync, account.locale)}`}
            href="/sync"
          />
        </Grid>

        <div style={{ marginTop: 24, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <ButtonLink href="/nachtrag" variant="primary">Schnellnachtrag (vergessener Start/Stopp)</ButtonLink>
          <ButtonLink href="/today">Tagesübersicht öffnen</ButtonLink>
        </div>
      </>
    );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader
        title="Dashboard"
        subtitle={account.companyName ?? account.displayName}
        actions={<RealtimeRefresher types={["timer.", "time_entry.", "compliance.", "sync.", "invoice."]} showIndicator />}
      />
      {body}
    </section>
  );
}

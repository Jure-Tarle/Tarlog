/**
 * /sync — Geräteübersicht, letzter Sync, Live-Kanal, Konflikte (doc 11 §2 Nr.
 * 15, doc 04). Widerruf je Gerät.
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Grid, StatTile, Badge } from "@/lib/ui/ui";
import { RealtimeRefresher } from "@/lib/ui/RealtimeRefresher";
import { formatRelative } from "@/lib/ui/format";
import { requireAccount, listDevices, getConflictCount } from "@/lib/ui/queries";
import { DeviceRevoke } from "./DeviceRevoke";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PLATFORM: Record<string, string> = { macos: "macOS", windows: "Windows", web: "Web", ios: "iOS" };
const SYNC_STATE: Record<string, string> = { synced: "synchron", pending: "ausstehend", offline: "offline", error: "Fehler", conflict: "Konflikt" };

export default async function SyncPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  try {
    const [devices, conflicts] = await Promise.all([listDevices(account.id), getConflictCount(account.id)]);
    const lastSync = devices.reduce<number | null>((m, d) => (d.last_sync_at && (!m || d.last_sync_at > m) ? d.last_sync_at : m), null);
    const connected = devices.filter((d) => d.server_connected && !d.revoked).length;
    const pending = devices.filter((d) => d.sync_status === "pending").length;

    body = (
      <>
        <div className="sync-experimental-note" role="note">
          Native Gerätesynchronisierung ist derzeit eine technische Vorschau. Lokale Zeiten bleiben offline verfügbar; prüfe den Sync-Status, bevor du ein Gerät entfernst oder zurücksetzt.
        </div>
        <Grid min={190} style={{ marginBottom: 18 }}>
          <StatTile label="Verbundene Geräte" value={connected} accent />
          <StatTile label="Letzter Sync" value={formatRelative(lastSync, account.locale)} />
          <StatTile label="Ausstehend" value={pending} />
          <StatTile label="Konflikte" value={conflicts} hint={conflicts > 0 ? "Auflösung erforderlich" : "keine offenen"} />
        </Grid>

        {devices.length === 0 ? (
          <EmptyState title="Keine Geräte registriert" hint="Die experimentelle Desktop-App kann über einen einmaligen Verbindungscode gekoppelt werden. iOS-Sync ist noch nicht produktionsreif." />
        ) : (
          <Table
            head={
              <>
                <Th>Gerät</Th>
                <Th>Plattform</Th>
                <Th>Version</Th>
                <Th>Sync</Th>
                <Th>Live-Kanal</Th>
                <Th align="right">Letzter Sync</Th>
                <Th align="right">Aktion</Th>
              </>
            }
          >
            {devices.map((d) => (
              <tr key={d.id} style={d.revoked ? { opacity: 0.55 } : undefined}>
                <Td><span style={{ fontWeight: 500 }}>{d.device_name}</span></Td>
                <Td muted>{PLATFORM[d.platform] ?? d.platform}</Td>
                <Td mono muted>{d.app_version}</Td>
                <Td>
                  <Badge tone={d.sync_status === "synced" ? "accent" : d.sync_status === "error" || d.sync_status === "conflict" ? "muted" : "neutral"}>
                    {SYNC_STATE[d.sync_status ?? "offline"] ?? d.sync_status}
                  </Badge>
                </Td>
                <Td muted>{d.live_channel_status ?? "none"}</Td>
                <Td align="right" mono muted>{formatRelative(d.last_sync_at, account.locale)}</Td>
                <Td align="right"><DeviceRevoke id={d.id} revoked={Boolean(d.revoked)} /></Td>
              </tr>
            ))}
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
        title="Synchronisierung"
        subtitle="Geräte, letzter Sync, Live-Kanal und Konflikte – transparent und offline-first"
        actions={<RealtimeRefresher types={["sync.", "device."]} showIndicator />}
      />
      {body}
    </section>
  );
}

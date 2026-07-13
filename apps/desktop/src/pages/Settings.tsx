/**
 * Einstellungen — Bereich 14 (doc 09, doc 11). Rundungsregeln, lokales Backup
 * und Sicherheitsstatus. Nur data-Schicht (rounding, backup); keine eigenen
 * DB-Zugriffe.
 */
import { useState } from "react";
import { Page, Card, Button, AsyncBody, EmptyState, TableWrap, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { listRoundingRules } from "../data/rounding";
import { runManualBackup } from "../data/backup";

export default function Settings() {
  const rules = useAsync(() => listRoundingRules(), []);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function backup() {
    setBusy(true);
    setBackupMsg(null);
    try {
      const res = await runManualBackup(false);
      setBackupMsg(`Backup erstellt: ${res.path} (${Math.round((res.sizeBytes ?? 0) / 1024)} KB)`);
    } catch (e) {
      setBackupMsg(`Backup fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setBusy(false); }
  }

  return (
    <Page title="Einstellungen" hint="Profil, Rundung, Sicherheit, Backup">
      <Card title="Rundungsregeln" subtitle="Trennung von tatsächlicher Zeit und Abrechnungszeit (doc 07/14)">
        <AsyncBody
          state={{ data: rules.data, error: rules.error, loading: rules.loading }}
          empty={<EmptyState title="Keine Rundungsregeln" />}
        >
          {(rows) => (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr><th>Name</th><th>Modus</th><th className="right">Intervall</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td><Tag tone="muted">{r.mode}</Tag></td>
                      <td className="right num">{r.interval_minutes != null ? `${r.interval_minutes} min` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </AsyncBody>
      </Card>

      <div className="grid2">
        <Card title="Lokales Backup" subtitle="Verschlüsselung optional (doc 30)">
          <p className="muted">Erstellt eine geprüfte Kopie der lokalen SQLite-Datenbank (PRAGMA integrity_check).</p>
          <Button variant="primary" disabled={busy} onClick={() => void backup()}>Backup jetzt erstellen</Button>
          {backupMsg ? <p className="muted" style={{ marginTop: 8 }}>{backupMsg}</p> : null}
        </Card>

        <Card title="App-Sperre" subtitle="Noch nicht verfügbar">
          <p className="muted">
            Eine verlässliche Startsperre benötigt Passwort-Einrichtung, einen
            Sperrbildschirm vor dem Datenzugriff und eine sichere
            Wiederherstellung. Diese Strecke ist noch nicht freigegeben; die
            lokale Datenbank sollte deshalb über FileVault beziehungsweise
            BitLocker geschützt werden.
          </p>
          <Button disabled>In Vorbereitung</Button>
        </Card>
      </div>
    </Page>
  );
}

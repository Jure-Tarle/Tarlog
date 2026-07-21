/**
 * /attachments, Anhänge (doc 11 §2). Belege/Dateien, verknüpft mit Einträgen,
 * Projekten oder Rechnungen. Read-only Übersicht.
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Badge } from "@/lib/ui/ui";
import { formatDateTime } from "@/lib/ui/format";
import { requireAccount, listAttachments } from "@/lib/ui/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function AttachmentsPage(): Promise<React.JSX.Element> {
  const account = await requireAccount();

  let body: React.JSX.Element;
  try {
    const rows = await listAttachments(account.id);
    body =
      rows.length === 0 ? (
        <EmptyState title="Keine Anhänge" hint="Belege und Dateien erscheinen hier, sobald sie einem Eintrag, Projekt oder einer Rechnung angehängt werden." />
      ) : (
        <Table
          head={
            <>
              <Th>Datei</Th>
              <Th>Typ</Th>
              <Th>Verknüpft mit</Th>
              <Th align="right">Größe</Th>
              <Th align="right">Erstellt</Th>
            </>
          }
        >
          {rows.map((a) => (
            <tr key={a.id}>
              <Td><span style={{ fontWeight: 500 }}>{a.filename}</span></Td>
              <Td muted><Badge tone="muted">{a.mime_type}</Badge></Td>
              <Td mono muted>{a.entity_type} | {a.entity_id.slice(0, 8)}…</Td>
              <Td align="right" mono muted>{humanSize(a.size_bytes)}</Td>
              <Td align="right" mono muted>{formatDateTime(a.created_at, account.timezone, account.locale)}</Td>
            </tr>
          ))}
        </Table>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Anhänge" subtitle="Belege und Dateien zu Einträgen, Projekten und Rechnungen" />
      {body}
    </section>
  );
}

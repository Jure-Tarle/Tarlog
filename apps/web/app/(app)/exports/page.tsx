/**
 * /exports — Exporthistorie + Download (doc 11 §2 Nr. 11, doc 10). PDF/CSV/JSON.
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Badge } from "@/lib/ui/ui";
import { formatDateTime } from "@/lib/ui/format";
import { API } from "@/lib/ui/api";
import { requireAccount, listExports } from "@/lib/ui/queries";
import { ExportCreate } from "./ExportCreate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function humanSize(bytes: number | null): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function ExportsPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  try {
    const rows = await listExports(account.id);
    body =
      rows.length === 0 ? (
        <EmptyState title="Noch keine Exporte" hint="Erzeuge Zeitnachweise als PDF, CSV oder JSON." action={<ExportCreate />} />
      ) : (
        <Table
          head={
            <>
              <Th>Erstellt</Th>
              <Th>Nummer</Th>
              <Th>Format</Th>
              <Th>Variante</Th>
              <Th>Zeitraum</Th>
              <Th align="right">Größe</Th>
              <Th align="right">Download</Th>
            </>
          }
        >
          {rows.map((x) => (
            <tr key={x.id}>
              <Td mono muted>{formatDateTime(x.created_at, account.timezone, account.locale)}</Td>
              <Td mono>{x.export_number ?? "—"}</Td>
              <Td><Badge tone="accent">{x.format.toUpperCase()}</Badge></Td>
              <Td muted>{x.variant ?? "—"}</Td>
              <Td mono muted>{x.period_start ?? "?"} – {x.period_end ?? "?"}</Td>
              <Td align="right" mono muted>{humanSize(x.size_bytes)}</Td>
              <Td align="right">
                <a href={API.exportDownload(x.id)} style={{ color: "var(--color-accent)", fontSize: 13 }}>
                  {x.filename ?? "herunterladen"}
                </a>
              </Td>
            </tr>
          ))}
        </Table>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Exporte" subtitle="PDF / CSV / JSON — Zeitnachweise und Berichte" actions={<ExportCreate />} />
      {body}
    </section>
  );
}

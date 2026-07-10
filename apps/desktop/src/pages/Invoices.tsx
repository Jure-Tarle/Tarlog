/**
 * Rechnungen — Bereich 10 (doc 10 §Rechnungsmodul). Lokale Ansicht der
 * erstellten Rechnungen. Die vollständige Rechnungserstellung (Nummernkreis,
 * Finalisierung, Storno, PDF) läuft im Server-Modus (apps/web); der lokale
 * Desktop-Modus zeigt hier den revisionsfähigen Bestand.
 */
import { Page, Card, AsyncBody, EmptyState, TableWrap, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { invoicesRepo } from "../data/repositories";
import { fmtMoney } from "../data/format";

const STATUS_TONE: Record<string, "accent" | "muted"> = {
  finalized: "accent",
  sent: "accent",
  paid: "accent",
  draft: "muted",
  cancelled: "muted",
};

export default function Invoices() {
  const list = useAsync(() => invoicesRepo.recent(100), []);

  return (
    <Page title="Rechnungen" hint="Revisionsfähiger Rechnungsbestand">
      <Card
        title="Rechnungen"
        subtitle="Erstellung, Finalisierung und PDF-Export erfolgen im Server-Modus (apps/web)."
      >
        <AsyncBody
          state={{ data: list.data, error: list.error, loading: list.loading }}
          empty={<EmptyState title="Noch keine Rechnungen">Rechnungen aus erfassten Zeiten erstellst du im Server-Modus.</EmptyState>}
        >
          {(rows) => (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Nummer</th>
                    <th>Typ</th>
                    <th>Status</th>
                    <th className="right">Netto</th>
                    <th className="right">Brutto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((inv) => (
                    <tr key={inv.id}>
                      <td className="num">{inv.invoice_number ?? <span className="faint">Entwurf</span>}</td>
                      <td className="muted">{inv.type}</td>
                      <td><Tag tone={STATUS_TONE[inv.status] ?? "muted"}>{inv.status}</Tag></td>
                      <td className="right num">{fmtMoney(inv.net_amount_cents ?? 0, inv.currency ?? "EUR")}</td>
                      <td className="right num">{fmtMoney(inv.gross_amount_cents ?? 0, inv.currency ?? "EUR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </AsyncBody>
      </Card>
    </Page>
  );
}

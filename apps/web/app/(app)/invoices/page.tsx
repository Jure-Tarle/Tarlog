/**
 * /invoices — Rechnungsliste, Erstellen, Finalisieren, Storno, PDF (doc 11 §2
 * Nr. 10, doc 10). Beträge tabular in Integer-Cents.
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Badge } from "@/lib/ui/ui";
import { formatMoney, formatDate } from "@/lib/ui/format";
import { requireAccount, listInvoices, listCustomers } from "@/lib/ui/queries";
import { InvoiceCreate } from "./InvoiceCreate";
import { InvoiceRowActions } from "./InvoiceRowActions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "Entwurf",
  finalized: "finalisiert",
  sent: "versendet",
  paid: "bezahlt",
  cancelled: "storniert",
};
const TYPE_LABEL: Record<string, string> = {
  standard: "Standard",
  partial: "Teil",
  final: "Schluss",
  cancellation: "Storno",
  credit_note: "Gutschrift",
};

function issueEpoch(d: string | null): number | null {
  return d ? new Date(`${d}T00:00:00`).getTime() : null;
}

export default async function InvoicesPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  let create: React.ReactElement | null = null;
  try {
    const [invoices, customers] = await Promise.all([listInvoices(account.id), listCustomers(account.id)]);
    create = <InvoiceCreate customers={customers.map((c) => ({ id: c.id, name: c.name }))} />;
    body =
      invoices.length === 0 ? (
        <EmptyState title="Noch keine Rechnungen" hint="Erstelle aus offener abrechenbarer Zeit eine Rechnung." action={create} />
      ) : (
        <Table
          head={
            <>
              <Th>Nummer</Th>
              <Th>Kunde</Th>
              <Th>Datum</Th>
              <Th>Typ</Th>
              <Th align="right">Netto</Th>
              <Th align="right">Brutto</Th>
              <Th align="center">Status</Th>
              <Th align="right">Aktionen</Th>
            </>
          }
        >
          {invoices.map((inv) => (
            <tr key={inv.id}>
              <Td mono>{inv.invoice_number ?? "—"}</Td>
              <Td>{inv.customerName ?? "—"}</Td>
              <Td mono muted>{formatDate(issueEpoch(inv.issue_date), account.timezone, account.locale)}</Td>
              <Td muted>{TYPE_LABEL[inv.type] ?? inv.type}</Td>
              <Td align="right" mono>{formatMoney(inv.net_amount_cents, inv.currency)}</Td>
              <Td align="right" mono>{formatMoney(inv.gross_amount_cents, inv.currency)}</Td>
              <Td align="center">
                <Badge tone={inv.status === "paid" ? "accent" : inv.status === "cancelled" ? "muted" : "neutral"}>
                  {STATUS_LABEL[inv.status ?? "draft"] ?? inv.status}
                </Badge>
              </Td>
              <Td align="right"><InvoiceRowActions id={inv.id} status={inv.status ?? "draft"} /></Td>
            </tr>
          ))}
        </Table>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Rechnungen" subtitle="Erstellen, finalisieren, stornieren, PDF" actions={create} />
      {body}
    </section>
  );
}

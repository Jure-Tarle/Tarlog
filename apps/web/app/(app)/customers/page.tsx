/**
 * /customers, Kundenliste + Anlage (doc 11 §2 Nr. 6).
 */
import { PageHeader, LoadError, Table, Th, Td, EmptyState, Badge } from "@/lib/ui/ui";
import { requireAccount, listCustomers } from "@/lib/ui/queries";
import { CustomerForm } from "./CustomerForm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CustomersPage(): Promise<React.ReactElement> {
  const account = await requireAccount();

  let body: React.ReactElement;
  try {
    const customers = await listCustomers(account.id);
    body =
      customers.length === 0 ? (
        <EmptyState title="Noch keine Kunden" hint="Lege den ersten Kunden an, um Projekte zuzuordnen." action={<CustomerForm />} />
      ) : (
        <Table
          head={
            <>
              <Th>Kunde</Th>
              <Th>Nr.</Th>
              <Th>E-Mail</Th>
              <Th align="center">Status</Th>
            </>
          }
        >
          {customers.map((c) => (
            <tr key={c.id}>
              <Td>
                <div style={{ fontWeight: 500 }}>{c.name}</div>
                {c.company ? <div style={{ fontSize: 12.5, color: "var(--color-text-muted)" }}>{c.company}</div> : null}
              </Td>
              <Td mono muted>{c.customer_number ?? ","}</Td>
              <Td muted>{c.email ?? ","}</Td>
              <Td align="center"><Badge tone={c.status === "active" ? "accent" : "muted"}>{c.status ?? "active"}</Badge></Td>
            </tr>
          ))}
        </Table>
      );
  } catch {
    body = <LoadError />;
  }

  return (
    <section>
      <PageHeader title="Kunden" subtitle="Stammdaten, Kontakte und Rechnungsvorgaben" actions={<CustomerForm />} />
      {body}
    </section>
  );
}

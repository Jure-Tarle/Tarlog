import { useState } from "react";
import { Archive, ArchiveRestore, Mail, Pencil, Phone, Plus } from "lucide-react";
import { Page, Card, Button, Select, AsyncBody, EmptyState, TableWrap, Tag } from "../components/ui";
import { useAsync } from "../data/hooks";
import { listCustomers, archiveCustomer, restoreCustomer, type CustomerRow } from "../data/customers";
import { t } from "../i18n";
import CustomerDetail from "./CustomerDetail";
import { CustomerEditor } from "./EntityEditors";

// Labels bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const STATUS_LABEL: Record<string, string> = { active: "Aktiv", paused: "Pausiert", archived: "Archiviert" };

function initials(customer: CustomerRow) {
  const source = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || customer.name;
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "K";
}

export default function Customers() {
  const customerId = decodeURIComponent(window.location.hash.split("/")[2] ?? "");
  if (customerId) return <CustomerDetail customerId={customerId} />;

  return <CustomersList />;
}

function CustomersList() {
  const [status, setStatus] = useState("active");
  const list = useAsync(() => listCustomers(status === "all" ? null : status), [status]);
  const [open, setOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<CustomerRow | null>(null);

  function close() { setOpen(false); setEditingCustomer(null); }
  function createNew() { setEditingCustomer(null); setOpen(true); }
  function edit(customer: CustomerRow) {
    setEditingCustomer(customer);
    setOpen(true);
  }

  function customerActions(customer: CustomerRow) {
    return (
      <>
        <Button variant="ghost" className="btn--sm" onClick={() => edit(customer)}><Pencil size={14}/>{t("Bearbeiten")}</Button>
        {customer.status !== "archived"
          ? <Button variant="ghost" className="btn--sm" onClick={() => void archiveCustomer(customer.id).then(list.reload)}><Archive size={14}/>{t("Archivieren")}</Button>
          : <Button variant="ghost" className="btn--sm" onClick={() => void restoreCustomer(customer.id).then(list.reload)}><ArchiveRestore size={14}/>{t("Reaktivieren")}</Button>}
      </>
    );
  }

  return <Page title={t("Kunden")} hint={t("Kontaktdaten, Anschrift und Rechnungsdaten sauber verwalten")} actions={<><Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}><option value="active">{t("Aktiv")}</option><option value="paused">{t("Pausiert")}</option><option value="archived">{t("Archiviert")}</option><option value="all">{t("Alle")}</option></Select><Button variant="primary" onClick={open ? close : createNew}>{open ? t("Schließen") : <><Plus size={15}/>{t("Neuer Kunde")}</>}</Button></>}>
    {open ? <Card title={editingCustomer ? t("Kunde bearbeiten") : t("Kunde anlegen")} subtitle={t("Person, Unternehmen und Rechnungsanschrift getrennt erfassen")}>
      <CustomerEditor
        key={editingCustomer?.id ?? "new-customer"}
        customer={editingCustomer}
        onSaved={() => { close(); list.reload(); }}
        onCancel={close}
      />
    </Card> : null}
    <Card title={t("Kunden")} subtitle={t("{n} Einträge", { n: list.data?.length ?? 0 })}>
      <AsyncBody state={{data:list.data,error:list.error,loading:list.loading}} empty={<EmptyState title={t("Keine Kunden")}>{t("Lege den ersten Kunden an.")}</EmptyState>}>
        {(rows) => (
          <div className="responsive-entity-list responsive-entity-list--customers">
            <div className="responsive-entity-list__table">
              <TableWrap><table className="table customer-table">
                <thead><tr><th>{t("Kunde")}</th><th>{t("Kontakt")}</th><th>{t("Anschrift")}</th><th>{t("Status")}</th><th className="right">{t("Aktionen")}</th></tr></thead>
                <tbody>{rows.map((customer) => {
                  const address = [customer.street && `${customer.street} ${customer.house_number ?? ""}`.trim(), [customer.postal_code, customer.city].filter(Boolean).join(" "), customer.country].filter(Boolean).join(", ");
                  return <tr key={customer.id}>
                    <td><a className="customer-identity customer-identity--link" href={`#/customers/${encodeURIComponent(customer.id)}`}><span className="customer-identity__avatar" aria-hidden>{initials(customer)}</span><span><strong>{customer.name}</strong><span className="table-subline">{customer.company || customer.customer_number || t("Privatkunde")}</span></span></a></td>
                    <td><div className="customer-contact">{customer.email ? <span><Mail size={13}/>{customer.email}</span> : null}{customer.phone ? <span><Phone size={13}/>{customer.phone}</span> : null}{!customer.email && !customer.phone ? <span className="faint">{t("Nicht hinterlegt")}</span> : null}</div></td>
                    <td className="muted">{address || <span className="faint">{t("Nicht hinterlegt")}</span>}</td>
                    <td><Tag tone={customer.status === "active" ? "accent" : "muted"}>{t(STATUS_LABEL[customer.status] ?? customer.status)}</Tag></td>
                    <td className="right"><div className="table-actions">{customerActions(customer)}</div></td>
                  </tr>;
                })}</tbody>
              </table></TableWrap>
            </div>
            <div className="entity-card-list" role="list">
              {rows.map((customer) => {
                const address = [customer.street && `${customer.street} ${customer.house_number ?? ""}`.trim(), [customer.postal_code, customer.city].filter(Boolean).join(" "), customer.country].filter(Boolean).join(", ");
                return (
                  <article className="entity-record-card" role="listitem" key={customer.id}>
                    <header className="entity-record-card__head">
                      <a className="customer-identity customer-identity--link" href={`#/customers/${encodeURIComponent(customer.id)}`}><span className="customer-identity__avatar" aria-hidden>{initials(customer)}</span><span><strong>{customer.name}</strong><span className="table-subline">{customer.company || customer.customer_number || t("Privatkunde")}</span></span></a>
                      <Tag tone={customer.status === "active" ? "accent" : "muted"}>{t(STATUS_LABEL[customer.status] ?? customer.status)}</Tag>
                    </header>
                    <dl className="entity-record-card__facts">
                      <div><dt>{t("E-Mail")}</dt><dd>{customer.email || <span className="faint">{t("Nicht hinterlegt")}</span>}</dd></div>
                      <div><dt>{t("Telefon")}</dt><dd>{customer.phone || <span className="faint">{t("Nicht hinterlegt")}</span>}</dd></div>
                      <div className="entity-record-card__fact--wide"><dt>{t("Anschrift")}</dt><dd>{address || <span className="faint">{t("Nicht hinterlegt")}</span>}</dd></div>
                      <div><dt>{t("Zahlungsziel")}</dt><dd>{t("{n} Tage", { n: customer.payment_term_days ?? 14 })}</dd></div>
                    </dl>
                    <footer className="entity-record-card__actions">{customerActions(customer)}</footer>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </AsyncBody>
    </Card>
  </Page>;
}

import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  AtSign,
  Building2,
  CircleDollarSign,
  FolderKanban,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ReceiptText,
  UserRound,
} from "lucide-react";
import { AsyncBody, Button, Card, EmptyState, Page, StatGrid, StatTile, Tag } from "../components/ui";
import { getCustomer, type CustomerRow } from "../data/customers";
import { fmtMoney } from "../data/format";
import { useAsync } from "../data/hooks";
import { listProjects } from "../data/projects";
import { t } from "../i18n";
import { CustomerEditor } from "./EntityEditors";

const STATUS_LABELS: Record<string, string> = {
  active: "Aktiv",
  paused: "Pausiert",
  archived: "Archiviert",
  planned: "Geplant",
  completed: "Abgeschlossen",
};

const BILLING_LABELS: Record<string, string> = {
  hourly: "Stundensatz",
  day_rate: "Tagessatz",
  fixed_fee: "Festpreis",
  retainer: "Retainer",
  non_billable: "Nicht abrechenbar",
};

const EXPORT_LABELS: Record<string, string> = {
  summary: "Zusammenfassung",
  detailed: "Detailliert",
  full: "Vollständig",
};

function initials(customer: CustomerRow) {
  const source = [customer.first_name, customer.last_name].filter(Boolean).join(" ") || customer.company || customer.name;
  return source.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "K";
}

function display(value: ReactNode) {
  return value === null || value === undefined || value === "" ? <span className="faint">{t("Nicht hinterlegt")}</span> : value;
}

function DetailItem({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="entity-detail-item">
      <dt>{label}</dt>
      <dd>{display(children)}</dd>
    </div>
  );
}

export default function CustomerDetail({ customerId }: { customerId: string }) {
  const [editorOpen, setEditorOpen] = useState(false);
  const customer = useAsync(() => getCustomer(customerId), [customerId]);
  const relatedProjects = useAsync(() => listProjects({ customerId }), [customerId]);
  const projects = relatedProjects.data ?? [];
  const activeProjects = projects.filter((project) => project.status === "active").length;

  return (
    <Page
      className="customer-detail"
      title={customer.data?.name ?? t("Kundendetails")}
      hint={customer.data?.company || customer.data?.customer_number || t("Kundenübersicht")}
      actions={(
        <>
          <Button variant="ghost" onClick={() => { window.location.hash = "#/customers"; }}><ArrowLeft size={15} />{t("Alle Kunden")}</Button>
          <Button variant="primary" disabled={!customer.data} onClick={() => setEditorOpen((current) => !current)}><Pencil size={15} />{editorOpen ? t("Bearbeitung schließen") : t("Kunde bearbeiten")}</Button>
        </>
      )}
    >
      <AsyncBody
        state={{ data: customer.data, error: customer.error, loading: customer.loading }}
        empty={<EmptyState title={t("Kunde nicht gefunden")} />}
      >
        {(current) => {
          const person = [current.first_name, current.last_name].filter(Boolean).join(" ");
          const addressLine = [current.street, current.house_number].filter(Boolean).join(" ");
          const cityLine = [current.postal_code, current.city].filter(Boolean).join(" ");

          return (
            <>
              {editorOpen ? (
                <Card title={t("Kunde bearbeiten")} subtitle={t("Kontakt, Anschrift und Rechnungsdaten direkt beim Kunden aktualisieren")}>
                  <CustomerEditor
                    key={current.id}
                    customer={current}
                    onSaved={() => { setEditorOpen(false); customer.reload(); }}
                    onCancel={() => setEditorOpen(false)}
                  />
                </Card>
              ) : null}

              <section className="detail-hero customer-detail__hero">
                <div className="detail-hero__identity">
                  <span className="customer-detail__avatar" aria-hidden>{initials(current)}</span>
                  <div>
                    <span className="detail-eyebrow">{current.company || t("Privatkunde")}</span>
                    <p>{person || current.contact_person || t("Kontakt- und Rechnungsdaten dieses Kunden im Überblick.")}</p>
                  </div>
                </div>
                <div className="detail-hero__meta">
                  <Tag tone={current.status === "active" ? "accent" : "muted"}>{t(STATUS_LABELS[current.status] ?? current.status)}</Tag>
                  {current.customer_number ? <span className="num">{current.customer_number}</span> : null}
                </div>
              </section>

              <StatGrid>
                <StatTile label={t("Projekte")} value={String(projects.length)} sub={t("diesem Kunden zugeordnet")} accent />
                <StatTile label={t("Aktive Projekte")} value={String(activeProjects)} sub={activeProjects ? t("aktuell in Arbeit") : t("keines aktiv")} />
                <StatTile label={t("Zahlungsziel")} value={t("{n} Tage", { n: current.payment_term_days ?? 14 })} sub={t("für neue Rechnungen")} />
                <StatTile label={t("Währung")} value={current.default_currency ?? "EUR"} sub={t("Standard für Abrechnung")} />
              </StatGrid>

              <div className="detail-grid customer-detail__grid">
                <Card title={t("Identität & Kontakt")} subtitle={t("Person und Kommunikationswege")}>
                  <dl className="entity-detail-list">
                    <DetailItem label={t("Anzeigename")}>{current.name}</DetailItem>
                    <DetailItem label={t("Person")}>{person}</DetailItem>
                    <DetailItem label={t("Firma")}>{current.company}</DetailItem>
                    <DetailItem label={t("Ansprechpartner")}>{current.contact_person}</DetailItem>
                    <DetailItem label={t("E-Mail")}>{current.email ? <a className="entity-detail-link" href={`mailto:${current.email}`}><Mail size={14} />{current.email}</a> : null}</DetailItem>
                    <DetailItem label={t("Telefon")}>{current.phone ? <a className="entity-detail-link" href={`tel:${current.phone}`}><Phone size={14} />{current.phone}</a> : null}</DetailItem>
                  </dl>
                </Card>

                <Card title={t("Anschrift")} subtitle={t("Post- und Rechnungsadresse")}>
                  <dl className="entity-detail-list">
                    <DetailItem label={t("Straße & Hausnummer")}>{addressLine}</DetailItem>
                    <DetailItem label={t("PLZ & Ort")}>{cityLine}</DetailItem>
                    <DetailItem label={t("Land")}>{current.country}</DetailItem>
                  </dl>
                  <div className="entity-detail-summary"><MapPin size={17} /><span>{display([addressLine, cityLine, current.country].filter(Boolean).join(", "))}</span></div>
                </Card>

                <Card title={t("Abrechnung & Standards")} subtitle={t("Vorgaben für Projekte, Rechnungen und Exporte")}>
                  <dl className="entity-detail-list entity-detail-list--wide">
                    <DetailItem label={t("Kundennummer")}>{current.customer_number}</DetailItem>
                    <DetailItem label={t("USt-IdNr.")}>{current.vat_id}</DetailItem>
                    <DetailItem label={t("Zahlungsziel")}>{t("{n} Tage", { n: current.payment_term_days ?? 14 })}</DetailItem>
                    <DetailItem label={t("Steuersatz")}>{current.default_tax_rate != null ? `${current.default_tax_rate} %` : null}</DetailItem>
                    <DetailItem label={t("Standardwährung")}>{current.default_currency ?? "EUR"}</DetailItem>
                    <DetailItem label={t("Standard-Stundensatz")}>{fmtMoney(current.default_hourly_rate_cents ?? null)}</DetailItem>
                    <DetailItem label={t("Standard-Tagessatz")}>{fmtMoney(current.default_day_rate_cents ?? null)}</DetailItem>
                    <DetailItem label={t("Exportdetail")}>{t(EXPORT_LABELS[current.preferred_export_detail] ?? current.preferred_export_detail)}</DetailItem>
                  </dl>
                  <div className="detail-facts customer-detail__facts">
                    <span><CircleDollarSign size={15} />{current.reverse_charge_hint ? t("Reverse Charge") : t("Keine Reverse-Charge-Vorgabe")}</span>
                    <span><ReceiptText size={15} />{current.small_business_hint ? t("Kleinunternehmerregelung") : t("Regelbesteuerung")}</span>
                  </div>
                </Card>

                <Card title={t("Verknüpfte Projekte")} subtitle={t("Alle Projekte dieses Kunden")}>
                  <AsyncBody
                    state={{ data: relatedProjects.data, error: relatedProjects.error, loading: relatedProjects.loading }}
                    empty={<EmptyState title={t("Noch keine Projekte für diesen Kunden")}><span>{t("Ordne ein Projekt diesem Kunden zu, damit es hier erscheint.")}</span></EmptyState>}
                  >
                    {(rows) => (
                      <div className="customer-project-list">
                        {rows.map((project) => {
                          const rate = project.hourly_rate_cents ?? project.day_rate_cents ?? project.fixed_fee_cents;
                          return (
                            <a className="customer-project-row" href={`#/projects/${encodeURIComponent(project.id)}`} key={project.id}>
                              <span className="customer-project-row__icon"><FolderKanban size={16} /></span>
                              <span className="customer-project-row__main"><strong>{project.name}</strong><small>{project.project_code || t(BILLING_LABELS[project.billing_type] ?? project.billing_type)}</small></span>
                              <span className="customer-project-row__rate num">{fmtMoney(rate ?? null)}</span>
                              <Tag tone={project.status === "active" ? "accent" : "muted"}>{t(STATUS_LABELS[project.status] ?? project.status)}</Tag>
                            </a>
                          );
                        })}
                      </div>
                    )}
                  </AsyncBody>
                </Card>
              </div>

              <div className="detail-facts customer-detail__footer">
                <span><UserRound size={15} />{current.name}</span>
                {current.company ? <span><Building2 size={15} />{current.company}</span> : null}
                {current.email ? <span><AtSign size={15} />{current.email}</span> : null}
              </div>
            </>
          );
        }}
      </AsyncBody>
    </Page>
  );
}

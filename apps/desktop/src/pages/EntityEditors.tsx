import { useState } from "react";
import { UserRound } from "lucide-react";
import type { ProjectInput } from "@tarlog/core";
import {
  Button,
  Checkbox,
  ErrorNote,
  Field,
  FormRow,
  Select,
  TextArea,
  TextInput,
} from "../components/ui";
import { createCustomer, updateCustomer, type CustomerRow } from "../data/customers";
import { createProject, updateProject, type ProjectRow } from "../data/projects";
import { t } from "../i18n";

const BILLING: { value: ProjectInput["billing_type"]; label: string }[] = [
  { value: "hourly", label: "Stundensatz" },
  { value: "day_rate", label: "Tagessatz" },
  { value: "fixed_fee", label: "Festpreis" },
  { value: "retainer", label: "Retainer" },
  { value: "non_billable", label: "nicht abrechenbar" },
];

function toCents(euro: string): number | null {
  const value = Number.parseFloat(euro.replace(",", "."));
  return Number.isFinite(value) ? Math.round(value * 100) : null;
}

export function ProjectEditor({
  project,
  customers,
  onSaved,
  onCancel,
}: {
  project?: ProjectRow | null;
  customers: CustomerRow[];
  onSaved: (saved: ProjectRow) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [customerId, setCustomerId] = useState(project?.customer_id ?? "");
  const [code, setCode] = useState(project?.project_code ?? "");
  const [billing, setBilling] = useState<ProjectInput["billing_type"]>(project?.billing_type ?? "hourly");
  const initialCents = project?.hourly_rate_cents ?? project?.day_rate_cents ?? project?.fixed_fee_cents;
  const [rate, setRate] = useState(initialCents != null ? (initialCents / 100).toFixed(2).replace(".", ",") : "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [descriptionRequired, setDescriptionRequired] = useState(project?.description_required ?? false);
  const [reasonRequired, setReasonRequired] = useState(project?.backdating_reason_required ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) {
      setError(t("Name ist erforderlich."));
      return;
    }

    const cents = rate ? toCents(rate) : null;
    if (rate && (cents == null || cents < 0)) {
      setError(t("Bitte einen gültigen Satz angeben."));
      return;
    }

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        customer_id: customerId || null,
        project_code: code.trim() || null,
        billing_type: billing,
        hourly_rate_cents: billing === "hourly" ? cents : null,
        day_rate_cents: billing === "day_rate" ? cents : null,
        fixed_fee_cents: billing === "fixed_fee" ? cents : null,
        description: description.trim() || null,
        description_required: descriptionRequired,
        backdating_reason_required: reasonRequired,
      };
      const saved = project
        ? await updateProject(project.id, payload)
        : await createProject(payload);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      {error ? <ErrorNote error={error} /> : null}
      <FormRow>
        <Field label={t("Name")} required>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field label={t("Kunde")}>
          <Select value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
            <option value="">{t("Kein Kunde | intern")}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </Select>
        </Field>
        <Field label={t("Projektcode")}>
          <TextInput value={code} onChange={(event) => setCode(event.target.value)} />
        </Field>
      </FormRow>
      <FormRow>
        <Field label={t("Abrechnungsart")} required>
          <Select value={billing} onChange={(event) => setBilling(event.target.value as ProjectInput["billing_type"])}>
            {BILLING.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
          </Select>
        </Field>
        <Field label={t("Satz (€)")} hint={billing === "non_billable" ? t("entfällt") : t("Stunde/Tag/Festpreis")}>
          <TextInput inputMode="decimal" value={rate} disabled={billing === "non_billable"} onChange={(event) => setRate(event.target.value)} placeholder={t("0,00")} />
        </Field>
      </FormRow>
      <Field label={t("Beschreibung")}>
        <TextArea value={description} onChange={(event) => setDescription(event.target.value)} />
      </Field>
      <div className="cluster">
        <Checkbox label={t("Beschreibung beim Stoppen Pflicht")} checked={descriptionRequired} onChange={(event) => setDescriptionRequired(event.currentTarget.checked)} />
        <Checkbox label={t("Nachtrag-Begründung Pflicht")} checked={reasonRequired} onChange={(event) => setReasonRequired(event.currentTarget.checked)} />
      </div>
      <div className="cluster">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>{project ? t("Änderungen speichern") : t("Projekt anlegen")}</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>{t("Abbrechen")}</Button>
      </div>
    </div>
  );
}

const EMPTY_CUSTOMER_FORM = {
  first: "",
  last: "",
  company: "",
  email: "",
  phone: "",
  street: "",
  house: "",
  postal: "",
  city: "",
  country: "Deutschland",
  number: "",
  term: "14",
};

export function CustomerEditor({
  customer,
  onSaved,
  onCancel,
}: {
  customer?: CustomerRow | null;
  onSaved: (saved: CustomerRow) => void;
  onCancel: () => void;
}) {
  const legacy = customer && !customer.first_name && !customer.last_name ? customer.name.trim().split(/\s+/) : [];
  const [form, setForm] = useState({
    ...EMPTY_CUSTOMER_FORM,
    first: customer?.first_name ?? legacy[0] ?? "",
    last: customer?.last_name ?? legacy.slice(1).join(" "),
    company: customer?.company ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
    street: customer?.street ?? "",
    house: customer?.house_number ?? "",
    postal: customer?.postal_code ?? "",
    city: customer?.city ?? "",
    country: customer?.country ?? "Deutschland",
    number: customer?.customer_number ?? "",
    term: String(customer?.payment_term_days ?? 14),
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof EMPTY_CUSTOMER_FORM, value: string) => setForm((current) => ({ ...current, [key]: value }));

  async function save() {
    const person = [form.first.trim(), form.last.trim()].filter(Boolean).join(" ");
    const displayName = person || form.company.trim();
    if (!displayName) {
      setError(t("Bitte mindestens einen Namen oder eine Firma angeben."));
      return;
    }

    setBusy(true);
    setError(null);
    const payload = {
      name: displayName,
      first_name: form.first.trim() || null,
      last_name: form.last.trim() || null,
      company: form.company.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      street: form.street.trim() || null,
      house_number: form.house.trim() || null,
      postal_code: form.postal.trim() || null,
      city: form.city.trim() || null,
      country: form.country.trim() || null,
      customer_number: form.number.trim() || null,
      payment_term_days: Number.parseInt(form.term, 10) || 14,
    };

    try {
      const saved = customer
        ? await updateCustomer(customer.id, payload)
        : await createCustomer(payload);
      onSaved(saved);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {error ? <ErrorNote error={error} /> : null}
      <div className="entity-form">
        <section>
          <div className="entity-form__heading"><UserRound size={17} /><div><strong>{t("Identität")}</strong><span>{t("Person oder Unternehmen")}</span></div></div>
          <FormRow>
            <Field label={t("Vorname")}><TextInput value={form.first} onChange={(event) => set("first", event.target.value)} autoFocus /></Field>
            <Field label={t("Nachname")}><TextInput value={form.last} onChange={(event) => set("last", event.target.value)} /></Field>
          </FormRow>
          <Field label={t("Firma")}><TextInput value={form.company} onChange={(event) => set("company", event.target.value)} /></Field>
          <FormRow>
            <Field label={t("E-Mail")}><TextInput type="email" value={form.email} onChange={(event) => set("email", event.target.value)} /></Field>
            <Field label={t("Telefon")}><TextInput value={form.phone} onChange={(event) => set("phone", event.target.value)} /></Field>
          </FormRow>
        </section>
        <section>
          <div className="entity-form__heading"><div><strong>{t("Adresse & Abrechnung")}</strong><span>{t("Optionale Rechnungsdaten")}</span></div></div>
          <FormRow>
            <Field label={t("Straße")}><TextInput value={form.street} onChange={(event) => set("street", event.target.value)} /></Field>
            <Field label={t("Hausnummer")}><TextInput value={form.house} onChange={(event) => set("house", event.target.value)} /></Field>
          </FormRow>
          <FormRow>
            <Field label={t("PLZ")}><TextInput value={form.postal} onChange={(event) => set("postal", event.target.value)} /></Field>
            <Field label={t("Ort")}><TextInput value={form.city} onChange={(event) => set("city", event.target.value)} /></Field>
            <Field label={t("Land")}><TextInput value={form.country} onChange={(event) => set("country", event.target.value)} /></Field>
          </FormRow>
          <FormRow>
            <Field label={t("Kundennummer")}><TextInput value={form.number} onChange={(event) => set("number", event.target.value)} /></Field>
            <Field label={t("Zahlungsziel (Tage)")}><TextInput type="number" value={form.term} onChange={(event) => set("term", event.target.value)} /></Field>
          </FormRow>
        </section>
      </div>
      <div className="cluster entity-form__actions">
        <Button variant="primary" disabled={busy} onClick={() => void save()}>{customer ? t("Änderungen speichern") : t("Kunde anlegen")}</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>{t("Abbrechen")}</Button>
      </div>
    </>
  );
}

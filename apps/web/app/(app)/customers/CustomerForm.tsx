"use client";
/**
 * CustomerForm, Kunde anlegen (doc 10 Kundenverwaltung). Kernfelder; Beträge
 * werden als Integer-Cents gesendet (doc 05 §8). POST /api/customers.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, Checkbox, Field, FormRow, Select, StatusLine, TextInput } from "@/lib/ui/controls";
import { Modal } from "@/lib/ui/Modal";

export function CustomerForm(): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "",
    company: "",
    customer_number: "",
    email: "",
    phone: "",
    vat_id: "",
    payment_term_days: "14",
    default_currency: "EUR",
    default_tax_rate: "19",
    status: "active",
    reverse_charge_hint: false,
    small_business_hint: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(API.customers, {
        name: f.name,
        company: f.company || null,
        customer_number: f.customer_number || null,
        email: f.email || null,
        phone: f.phone || null,
        vat_id: f.vat_id || null,
        payment_term_days: Number(f.payment_term_days) || 14,
        default_currency: f.default_currency.toUpperCase(),
        default_tax_rate: Number(f.default_tax_rate) || 0,
        status: f.status,
        reverse_charge_hint: f.reverse_charge_hint,
        small_business_hint: f.small_business_hint,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Neuer Kunde</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Neuer Kunde"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Abbrechen</Button>
            <Button variant="primary" onClick={save} disabled={busy || !f.name.trim()}>Speichern</Button>
          </>
        }
      >
        {err ? <StatusLine kind="error">{err}</StatusLine> : null}
        <FormRow>
          <Field label="Name" required><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
          <Field label="Firma"><TextInput value={f.company} onChange={(e) => set("company", e.target.value)} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Kundennummer"><TextInput value={f.customer_number} onChange={(e) => set("customer_number", e.target.value)} /></Field>
          <Field label="USt-IdNr."><TextInput value={f.vat_id} onChange={(e) => set("vat_id", e.target.value)} /></Field>
        </FormRow>
        <FormRow>
          <Field label="E-Mail"><TextInput type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
          <Field label="Telefon"><TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Zahlungsziel (Tage)"><TextInput type="number" min={0} value={f.payment_term_days} onChange={(e) => set("payment_term_days", e.target.value)} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Währung"><TextInput value={f.default_currency} onChange={(e) => set("default_currency", e.target.value)} maxLength={3} /></Field>
          <Field label="Steuersatz (%)"><TextInput inputMode="decimal" value={f.default_tax_rate} onChange={(e) => set("default_tax_rate", e.target.value)} /></Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">aktiv</option>
              <option value="paused">pausiert</option>
              <option value="archived">archiviert</option>
            </Select>
          </Field>
        </FormRow>
        <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
          <Checkbox label="Reverse-Charge-Hinweis" checked={f.reverse_charge_hint} onChange={(e) => set("reverse_charge_hint", e.target.checked)} />
          <Checkbox label="Kleinunternehmer-Hinweis" checked={f.small_business_hint} onChange={(e) => set("small_business_hint", e.target.checked)} />
        </div>
      </Modal>
    </>
  );
}

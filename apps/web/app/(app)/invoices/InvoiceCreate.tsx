"use client";
/**
 * InvoiceCreate, Rechnung erstellen (doc 10 Rechnungswesen). Wählt Kunde,
 * Rechnungstyp und Leistungszeitraum; die Positionen/Beträge berechnet der
 * Abrechnungs-Dienst aus offener abrechenbarer Zeit. POST /api/invoices.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { toLocalDate } from "@/lib/ui/format";
import { Button, Field, FormRow, Select, StatusLine, TextArea, TextInput } from "@/lib/ui/controls";
import { Modal } from "@/lib/ui/Modal";

export function InvoiceCreate({ customers }: { customers: Array<{ id: string; name: string }> }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = toLocalDate(Date.now());
  const [f, setF] = useState({
    customer_id: customers[0]?.id ?? "",
    type: "standard",
    issue_date: today,
    service_period_start: "",
    service_period_end: today,
    notes: "",
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(API.invoices, {
        customer_id: f.customer_id,
        type: f.type,
        issue_date: f.issue_date,
        service_period_start: f.service_period_start || null,
        service_period_end: f.service_period_end || null,
        notes: f.notes || null,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Rechnung konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Rechnung erstellen</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Neue Rechnung"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Abbrechen</Button>
            <Button variant="primary" onClick={save} disabled={busy || !f.customer_id}>Entwurf erstellen</Button>
          </>
        }
      >
        {err ? <StatusLine kind="error">{err}</StatusLine> : null}
        <FormRow>
          <Field label="Kunde" required>
            <Select value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Typ">
            <Select value={f.type} onChange={(e) => set("type", e.target.value)}>
              <option value="standard">Standard</option>
              <option value="partial">Teilrechnung</option>
              <option value="final">Schlussrechnung</option>
            </Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Rechnungsdatum"><TextInput type="date" value={f.issue_date} onChange={(e) => set("issue_date", e.target.value)} /></Field>
          <Field label="Leistung von"><TextInput type="date" value={f.service_period_start} onChange={(e) => set("service_period_start", e.target.value)} /></Field>
          <Field label="Leistung bis"><TextInput type="date" value={f.service_period_end} onChange={(e) => set("service_period_end", e.target.value)} /></Field>
        </FormRow>
        <Field label="Notiz (optional)"><TextArea value={f.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
        <div style={{ fontSize: 12, color: "var(--color-text-faint)" }}>
          Positionen werden aus offener abrechenbarer Zeit des Kunden im Zeitraum erzeugt (Satz-/Rundungs-Snapshot).
        </div>
      </Modal>
    </>
  );
}

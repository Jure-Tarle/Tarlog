"use client";
/**
 * ProjectForm, Projekt anlegen (doc 10). Abrechnungsart steuert die
 * relevanten Satzfelder; Stopp-Konfiguration (Beschreibung/Nachtrag) doc 03 §5.
 * POST /api/projects.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, Checkbox, Field, FormRow, Select, StatusLine, TextArea, TextInput } from "@/lib/ui/controls";
import { Modal } from "@/lib/ui/Modal";

function eurToCents(v: string): number | null {
  const n = Number(v.replace(",", "."));
  return v.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 100);
}

export function ProjectForm({
  customers,
  rules,
}: {
  customers: Array<{ id: string; name: string }>;
  rules: Array<{ id: string; name: string }>;
}): React.JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    name: "",
    customer_id: "",
    project_code: "",
    description: "",
    billing_type: "hourly",
    rate: "",
    rounding_rule_id: "",
    status: "active",
    description_required: false,
    backdating_allowed: true,
    backdating_reason_required: false,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const cents = eurToCents(f.rate);
      await api.post(API.projects, {
        name: f.name,
        customer_id: f.customer_id || null,
        project_code: f.project_code || null,
        description: f.description || null,
        billing_type: f.billing_type,
        hourly_rate_cents: f.billing_type === "hourly" ? cents : null,
        day_rate_cents: f.billing_type === "day_rate" ? cents : null,
        fixed_fee_cents: f.billing_type === "fixed_fee" ? cents : null,
        rounding_rule_id: f.rounding_rule_id || null,
        status: f.status,
        description_required: f.description_required,
        backdating_allowed: f.backdating_allowed,
        backdating_reason_required: f.backdating_reason_required,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Speichern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const rateLabel =
    f.billing_type === "day_rate" ? "Tagessatz (€)" : f.billing_type === "fixed_fee" ? "Festpreis (€)" : "Stundensatz (€)";
  const rateDisabled = f.billing_type === "non_billable" || f.billing_type === "retainer";

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Neues Projekt</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Neues Projekt"
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
          <Field label="Projektnummer"><TextInput value={f.project_code} onChange={(e) => set("project_code", e.target.value)} /></Field>
        </FormRow>
        <FormRow>
          <Field label="Kunde">
            <Select value={f.customer_id} onChange={(e) => set("customer_id", e.target.value)}>
              <option value="">, (intern)</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="planned">geplant</option>
              <option value="active">aktiv</option>
              <option value="paused">pausiert</option>
              <option value="completed">abgeschlossen</option>
              <option value="archived">archiviert</option>
            </Select>
          </Field>
        </FormRow>
        <Field label="Beschreibung"><TextArea value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
        <FormRow>
          <Field label="Abrechnungsart">
            <Select value={f.billing_type} onChange={(e) => set("billing_type", e.target.value)}>
              <option value="hourly">stundenweise</option>
              <option value="day_rate">Tagessatz</option>
              <option value="fixed_fee">Festpreis</option>
              <option value="retainer">Retainer</option>
              <option value="non_billable">nicht abrechenbar</option>
            </Select>
          </Field>
          <Field label={rateLabel}>
            <TextInput inputMode="decimal" value={f.rate} onChange={(e) => set("rate", e.target.value)} disabled={rateDisabled} />
          </Field>
          <Field label="Rundungsregel">
            <Select value={f.rounding_rule_id} onChange={(e) => set("rounding_rule_id", e.target.value)}>
              <option value="">Standard</option>
              {rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
        </FormRow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Checkbox label="Beschreibung beim Stoppen Pflicht" checked={f.description_required} onChange={(e) => set("description_required", e.target.checked)} />
          <Checkbox label="Nachtragen erlaubt" checked={f.backdating_allowed} onChange={(e) => set("backdating_allowed", e.target.checked)} />
          <Checkbox label="Nachtragsgrund Pflicht" checked={f.backdating_reason_required} onChange={(e) => set("backdating_reason_required", e.target.checked)} />
        </div>
      </Modal>
    </>
  );
}

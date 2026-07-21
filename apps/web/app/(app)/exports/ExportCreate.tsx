"use client";
/**
 * ExportCreate, Export erzeugen (doc 11 §2 Nr. 11, doc 10). Format + Variante +
 * Zeitraum; die Datei erzeugt der Export-Dienst (PDF/CSV/JSON). POST /api/exports.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { toLocalDate } from "@/lib/ui/format";
import { Button, Field, FormRow, Select, StatusLine, TextInput } from "@/lib/ui/controls";
import { Modal } from "@/lib/ui/Modal";

export function ExportCreate(): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const today = toLocalDate(Date.now());
  const [f, setF] = useState({
    format: "pdf",
    variant: "internal_timesheet",
    period_start: "",
    period_end: today,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(API.exports, {
        format: f.format,
        variant: f.variant,
        period_start: f.period_start || null,
        period_end: f.period_end || null,
        filter_json: {},
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      setOpen(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Export konnte nicht erstellt werden.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Export erstellen</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Neuer Export"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Abbrechen</Button>
            <Button variant="primary" onClick={save} disabled={busy}>Erstellen</Button>
          </>
        }
      >
        {err ? <StatusLine kind="error">{err}</StatusLine> : null}
        <FormRow>
          <Field label="Format">
            <Select value={f.format} onChange={(e) => set("format", e.target.value)}>
              <option value="pdf">PDF</option>
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">XLSX</option>
            </Select>
          </Field>
          <Field label="Variante">
            <Select value={f.variant} onChange={(e) => set("variant", e.target.value)}>
              <option value="internal_timesheet">internes Timesheet</option>
              <option value="customer_report">Kundenreport</option>
              <option value="invoice_attachment">Rechnungsanlage</option>
              <option value="compliance_report">Compliance-Report</option>
              <option value="tax_advisor">Steuerberater</option>
              <option value="daily_detail">Tagesdetail</option>
              <option value="monthly_summary">Monatsübersicht</option>
            </Select>
          </Field>
        </FormRow>
        <FormRow>
          <Field label="Zeitraum von"><TextInput type="date" value={f.period_start} onChange={(e) => set("period_start", e.target.value)} /></Field>
          <Field label="Zeitraum bis"><TextInput type="date" value={f.period_end} onChange={(e) => set("period_end", e.target.value)} /></Field>
        </FormRow>
      </Modal>
    </>
  );
}

/**
 * Projects — Projektliste + Anlageformular (doc 06 A.2). Über data/projects
 * (Bridge create + lokale Patches) und data/customers für die Zuordnung.
 */
import { useState } from "react";
import {
  Page, Card, Button, Field, FormRow, TextInput, TextArea, Select, Checkbox, AsyncBody, EmptyState, TableWrap, Tag, ErrorNote,
} from "../components/ui";
import { useAsync } from "../data/hooks";
import { listProjects, createProject, archiveProject } from "../data/projects";
import { listCustomers } from "../data/customers";
import { fmtMoney } from "../data/format";
import type { ProjectInput } from "@tarlog/core";
import { nameMap } from "./shared";

const BILLING: { value: ProjectInput["billing_type"]; label: string }[] = [
  { value: "hourly", label: "Stundensatz" },
  { value: "day_rate", label: "Tagessatz" },
  { value: "fixed_fee", label: "Festpreis" },
  { value: "retainer", label: "Retainer" },
  { value: "non_billable", label: "nicht abrechenbar" },
];

function toCents(euro: string): number | null {
  const v = parseFloat(euro.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

export default function Projects() {
  const [status, setStatus] = useState("active");
  const list = useAsync(() => listProjects(status === "all" ? {} : { status }), [status]);
  const customers = useAsync(() => listCustomers(), []);
  const custNames = nameMap((customers.data ?? []) as { id: string; name: string }[]);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [code, setCode] = useState("");
  const [billing, setBilling] = useState<ProjectInput["billing_type"]>("hourly");
  const [rate, setRate] = useState("");
  const [descReq, setDescReq] = useState(false);
  const [reasonReq, setReasonReq] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim()) { setError("Name ist erforderlich."); return; }
    setBusy(true);
    try {
      const cents = rate ? toCents(rate) : null;
      await createProject({
        name: name.trim(),
        customer_id: customerId || null,
        project_code: code || null,
        billing_type: billing,
        hourly_rate_cents: billing === "hourly" ? cents : null,
        day_rate_cents: billing === "day_rate" ? cents : null,
        fixed_fee_cents: billing === "fixed_fee" ? cents : null,
        description: description || null,
        description_required: descReq,
        backdating_reason_required: reasonReq,
      });
      setName(""); setCustomerId(""); setCode(""); setRate(""); setDescription(""); setDescReq(false); setReasonReq(false);
      setOpen(false);
      list.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <Page
      title="Projekte"
      hint="Projektverwaltung"
      actions={
        <>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}>
            <option value="active">Aktiv</option>
            <option value="planned">Geplant</option>
            <option value="completed">Abgeschlossen</option>
            <option value="archived">Archiviert</option>
            <option value="all">Alle</option>
          </Select>
          <Button variant="primary" onClick={() => setOpen((o) => !o)}>{open ? "Schließen" : "Neues Projekt"}</Button>
        </>
      }
    >
      {open ? (
        <Card title="Neues Projekt">
          {error ? <ErrorNote error={error} /> : null}
          <div className="stack">
            <FormRow>
              <Field label="Name" required><TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus /></Field>
              <Field label="Kunde">
                <Select value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                  <option value="">— intern —</option>
                  {(customers.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Projektcode"><TextInput value={code} onChange={(e) => setCode(e.target.value)} /></Field>
            </FormRow>
            <FormRow>
              <Field label="Abrechnungsart" required>
                <Select value={billing} onChange={(e) => setBilling(e.target.value as ProjectInput["billing_type"])}>
                  {BILLING.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                </Select>
              </Field>
              <Field label="Satz (€)" hint={billing === "non_billable" ? "entfällt" : "Stunde/Tag/Festpreis"}>
                <TextInput inputMode="decimal" value={rate} disabled={billing === "non_billable"} onChange={(e) => setRate(e.target.value)} placeholder="0,00" />
              </Field>
            </FormRow>
            <Field label="Beschreibung"><TextArea value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
            <div className="cluster">
              <Checkbox label="Beschreibung beim Stoppen Pflicht" checked={descReq} onChange={(e) => setDescReq((e.target as HTMLInputElement).checked)} />
              <Checkbox label="Nachtrag-Begründung Pflicht" checked={reasonReq} onChange={(e) => setReasonReq((e.target as HTMLInputElement).checked)} />
            </div>
            <div className="cluster">
              <Button variant="primary" disabled={busy} onClick={() => void save()}>Speichern</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card title="Projekte" subtitle={`${list.data?.length ?? 0} Einträge`}>
        <AsyncBody state={{ data: list.data, error: list.error, loading: list.loading }} empty={<EmptyState title="Keine Projekte">Lege das erste Projekt an.</EmptyState>}>
          {(rows) => (
            <TableWrap>
              <table className="table">
                <thead><tr><th>Name</th><th>Kunde</th><th>Abrechnung</th><th className="right">Satz</th><th>Flags</th><th>Status</th><th className="right">Aktion</th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>{p.name}{p.project_code ? <span className="faint num"> · {p.project_code}</span> : null}</td>
                      <td className="muted">{p.customer_id ? custNames.get(p.customer_id) ?? "—" : <span className="faint">intern</span>}</td>
                      <td>{BILLING.find((b) => b.value === p.billing_type)?.label ?? p.billing_type}</td>
                      <td className="right num">{fmtMoney(p.hourly_rate_cents ?? p.day_rate_cents ?? p.fixed_fee_cents ?? null)}</td>
                      <td className="cluster">
                        {p.description_required ? <Tag tone="muted">Beschr.</Tag> : null}
                        {p.backdating_reason_required ? <Tag tone="muted">Grund</Tag> : null}
                      </td>
                      <td><Tag tone={p.status === "active" ? "accent" : "muted"}>{p.status}</Tag></td>
                      <td className="right">
                        {p.status !== "archived" ? (
                          <Button variant="ghost" className="btn--sm" onClick={() => void archiveProject(p.id).then(() => list.reload())}>Archivieren</Button>
                        ) : null}
                      </td>
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

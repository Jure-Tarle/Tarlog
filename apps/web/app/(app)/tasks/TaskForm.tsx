"use client";
/**
 * TaskForm — Aufgabe/Tätigkeitsart anlegen (doc 11 §2 Nr. 8). Ohne Projekt =
 * globale Aufgabe. POST /api/tasks.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, Checkbox, Field, FormRow, Select, StatusLine, TextInput } from "@/lib/ui/controls";
import { Modal } from "@/lib/ui/Modal";

export function TaskForm({ projects }: { projects: Array<{ id: string; name: string }> }): React.ReactElement {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ name: "", project_id: "", cost_center: "", default_billable: true, status: "active" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(API.tasks, {
        name: f.name,
        project_id: f.project_id || null,
        cost_center: f.cost_center || null,
        default_billable: f.default_billable,
        status: f.status,
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
      <Button variant="primary" onClick={() => setOpen(true)}>Neue Aufgabe</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Neue Aufgabe"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Abbrechen</Button>
            <Button variant="primary" onClick={save} disabled={busy || !f.name.trim()}>Speichern</Button>
          </>
        }
      >
        {err ? <StatusLine kind="error">{err}</StatusLine> : null}
        <Field label="Name" required><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <FormRow>
          <Field label="Projekt (leer = global)">
            <Select value={f.project_id} onChange={(e) => set("project_id", e.target.value)}>
              <option value="">global</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Select>
          </Field>
          <Field label="Kostenstelle"><TextInput value={f.cost_center} onChange={(e) => set("cost_center", e.target.value)} /></Field>
        </FormRow>
        <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
          <Checkbox label="Standardmäßig abrechenbar" checked={f.default_billable} onChange={(e) => set("default_billable", e.target.checked)} />
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
              <option value="active">aktiv</option>
              <option value="archived">archiviert</option>
            </Select>
          </Field>
        </div>
      </Modal>
    </>
  );
}

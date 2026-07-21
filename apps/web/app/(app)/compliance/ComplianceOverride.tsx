"use client";
/**
 * ComplianceOverride, bewusste Übersteuerung eines Compliance-Ergebnisses mit
 * Pflicht-Begründung (doc 08). POST /api/compliance/:id/override.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, StatusLine, TextInput } from "@/lib/ui/controls";

export function ComplianceOverride({ id, existing }: { id: string; existing: string | null }): React.ReactElement {
  const router = useRouter();
  const [openInput, setOpenInput] = useState(false);
  const [reason, setReason] = useState(existing ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (existing && !openInput) {
    return (
      <span className="compliance-override-summary">
        übersteuert: {existing}{" "}
        <Button size="sm" variant="ghost" onClick={() => setOpenInput(true)}>
          ändern
        </Button>
      </span>
    );
  }

  if (!openInput) {
    return <Button size="sm" onClick={() => setOpenInput(true)}>Übersteuern</Button>;
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await api.post(API.complianceOverride(id), { override_reason: reason });
      setOpenInput(false);
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Übersteuern fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="compliance-override-editor">
      <TextInput
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Begründung"
        aria-label="Begründung für Compliance-Übersteuerung"
        className="compliance-override-input"
      />
      <Button size="sm" variant="primary" onClick={save} disabled={busy || !reason.trim()}>Speichern</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpenInput(false)} disabled={busy}>Abbrechen</Button>
      {err ? <div className="compliance-override-error"><StatusLine kind="error">{err}</StatusLine></div> : null}
    </div>
  );
}

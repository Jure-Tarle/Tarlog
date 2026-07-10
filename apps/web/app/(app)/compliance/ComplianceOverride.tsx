"use client";
/**
 * ComplianceOverride — bewusste Übersteuerung eines Compliance-Ergebnisses mit
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
      <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
        übersteuert: {existing}{" "}
        <button onClick={() => setOpenInput(true)} style={{ background: "none", border: "none", color: "var(--color-accent)", cursor: "pointer", fontSize: 12 }}>
          ändern
        </button>
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
    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Begründung" style={{ width: 200 }} />
      <Button size="sm" variant="primary" onClick={save} disabled={busy || !reason.trim()}>OK</Button>
      <Button size="sm" variant="ghost" onClick={() => setOpenInput(false)} disabled={busy}>Abbrechen</Button>
      {err ? <div style={{ flexBasis: "100%" }}><StatusLine kind="error">{err}</StatusLine></div> : null}
    </div>
  );
}

"use client";
/**
 * DeviceRevoke, Gerätezugriff widerrufen (doc 04 §2 Nr. 10). Ein widerrufenes
 * Gerät kann keine Events mehr einspielen und verliert den Live-Kanal.
 * DELETE /api/devices/:id (setzt devices.revoked = true, widerruft Tokens).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, StatusLine } from "@/lib/ui/controls";

export function DeviceRevoke({ id, revoked }: { id: string; revoked: boolean }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (revoked) return <span style={{ fontSize: 12, color: "var(--color-text-faint)" }}>widerrufen</span>;

  async function revoke() {
    if (!confirm("Gerätezugriff widerrufen? Das Gerät kann danach nicht mehr synchronisieren.")) return;
    setBusy(true);
    setErr(null);
    try {
      await api.del(API.device(id));
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Widerruf fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="danger" disabled={busy} onClick={revoke}>Widerrufen</Button>
      {err ? <div style={{ marginTop: 4 }}><StatusLine kind="error">{err}</StatusLine></div> : null}
    </>
  );
}

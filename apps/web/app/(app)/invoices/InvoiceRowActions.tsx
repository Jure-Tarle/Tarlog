"use client";
/**
 * InvoiceRowActions, Finalisieren / Storno / PDF je Rechnung (doc 10). Nach
 * Finalisierung ist die Rechnung unveränderlich; Storno erzeugt eine
 * Stornorechnung. PDF ist ein direkter Download-Link.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, ButtonLink, StatusLine } from "@/lib/ui/controls";

export function InvoiceRowActions({ id, status }: { id: string; status: string }): React.ReactElement {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>) {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setErr(e instanceof ApiClientError ? e.message : "Aktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
      {status === "draft" ? (
        <Button size="sm" variant="primary" disabled={busy} onClick={() => act(() => api.post(API.invoiceFinalize(id)))}>
          Finalisieren
        </Button>
      ) : null}
      {status === "finalized" || status === "sent" || status === "paid" ? (
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (confirm("Rechnung stornieren? Es wird eine Stornorechnung erzeugt.")) {
              void act(() => api.post(API.invoiceCancel(id)));
            }
          }}
        >
          Storno
        </Button>
      ) : null}
      <ButtonLink href={API.invoicePdf(id)} target="_blank" rel="noopener noreferrer" size="sm">PDF</ButtonLink>
      {err ? <div style={{ flexBasis: "100%" }}><StatusLine kind="error">{err}</StatusLine></div> : null}
    </div>
  );
}

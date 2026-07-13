"use client";
/**
 * LoginForm — Passwort-Login (Client). POSTet an /api/auth/login; bei Erfolg
 * harte Navigation zum `next`-Ziel (nur seiteninterne Pfade zugelassen) bzw.
 * /dashboard. E-Mail nur nötig, falls mehrere Konten existieren (i. d. R. nicht).
 */
import { useState } from "react";
import { Field, FormError, SubmitButton, TextInput, readApiError } from "../setup/ui";

/** Nur seiteninterne Weiterleitungen erlauben (Open-Redirect-Schutz). */
function safeNext(): string {
  try {
    const raw = new URLSearchParams(window.location.search).get("next");
    if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  } catch {
    // ignore
  }
  return "/dashboard";
}

export function LoginForm(): React.ReactElement {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim() || undefined,
          password,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Anmeldung fehlgeschlagen."));
        setLoading(false);
        return;
      }
      window.location.assign(safeNext());
    } catch {
      setError("Netzwerkfehler. Server erreichbar?");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <FormError message={error} />

      <Field label="E-Mail" hint="Optional, falls nur ein Konto existiert.">
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          maxLength={320}
          placeholder="jane@example.com"
        />
      </Field>

      <Field label="Passwort" required>
        <TextInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      <SubmitButton loading={loading}>Anmelden</SubmitButton>
    </form>
  );
}

"use client";
/**
 * SetupForm, Erststart-Formular (Client). POSTet an /api/auth/setup; bei Erfolg
 * ist der Admin sofort angemeldet (Session-Cookie gesetzt) → harte Navigation
 * nach /onboarding, damit die Middleware die neuen Cookies liest und der
 * fachliche First-Run-Assistent den ersten Arbeitsbereich einrichtet.
 */
import { useState } from "react";
import { Field, FormError, SubmitButton, TextInput, readApiError } from "./ui";

export function SetupForm(): React.ReactElement {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setPasswordError(null);
    setConfirmError(null);

    if (password !== confirm) {
      setConfirmError("Passwörter stimmen nicht überein.");
      document.getElementById("setup-password-confirm")?.focus();
      return;
    }
    if (password.length < 10) {
      setPasswordError("Das Passwort muss mindestens 10 Zeichen haben.");
      document.getElementById("setup-password")?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          display_name: displayName.trim(),
          email: email.trim() || undefined,
          company_name: company.trim() || undefined,
          password,
          password_confirm: confirm,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Setup fehlgeschlagen."));
        setLoading(false);
        return;
      }
      window.location.assign("/onboarding");
    } catch {
      setError("Netzwerkfehler. Server erreichbar?");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <FormError message={error} />

      <Field label="Anzeigename" required>
        <TextInput
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          required
          maxLength={200}
          placeholder="z. B. Jane Doe"
        />
      </Field>

      <Field label="E-Mail" hint="Optional, für Login und Rechnungen.">
        <TextInput
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          maxLength={320}
          placeholder="jane@example.com"
        />
      </Field>

      <Field label="Firma" hint="Optional.">
        <TextInput
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          autoComplete="organization"
          maxLength={200}
        />
      </Field>

      <Field label="Passwort" hint="Mindestens 10 Zeichen. Argon2id-gehasht." error={passwordError} required>
        <TextInput
          id="setup-password"
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setPasswordError(null);
          }}
          autoComplete="new-password"
          required
          minLength={10}
        />
      </Field>

      <Field label="Passwort bestätigen" error={confirmError} required>
        <TextInput
          id="setup-password-confirm"
          type="password"
          value={confirm}
          onChange={(e) => {
            setConfirm(e.target.value);
            setConfirmError(null);
          }}
          autoComplete="new-password"
          required
          minLength={10}
        />
      </Field>

      <SubmitButton loading={loading}>Account anlegen</SubmitButton>
    </form>
  );
}

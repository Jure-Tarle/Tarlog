"use client";
/**
 * SetupForm — Erststart-Formular (Client). POSTet an /api/auth/setup; bei Erfolg
 * ist der Admin sofort angemeldet (Session-Cookie gesetzt) → harte Navigation
 * nach /dashboard, damit die Middleware die neuen Cookies liest.
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
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 10) {
      setError("Passwort muss mindestens 10 Zeichen haben.");
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
      window.location.assign("/dashboard");
    } catch {
      setError("Netzwerkfehler. Server erreichbar?");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <FormError message={error} />

      <Field label="Anzeigename">
        <TextInput
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="name"
          required
          maxLength={200}
          placeholder="z. B. Jane Doe"
        />
      </Field>

      <Field label="E-Mail" hint="Optional — für Login und Rechnungen.">
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

      <Field label="Passwort" hint="Mindestens 10 Zeichen. Argon2id-gehasht.">
        <TextInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={10}
        />
      </Field>

      <Field label="Passwort bestätigen">
        <TextInput
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
          minLength={10}
        />
      </Field>

      <SubmitButton loading={loading}>Account anlegen</SubmitButton>
    </form>
  );
}

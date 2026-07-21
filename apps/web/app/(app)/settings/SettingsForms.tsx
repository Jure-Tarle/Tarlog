"use client";
/**
 * SettingsForms, Profil, Rundungsregeln, Nummernkreis (doc 11 §2 Nr. 14).
 * Profil → PATCH /api/account; Rundungsregel → POST /api/rounding-rules;
 * Nummernkreis → POST /api/settings/number-range.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { API, ApiClientError, api } from "@/lib/ui/api";
import { Button, Field, FormRow, Select, StatusLine, TextInput } from "@/lib/ui/controls";
import { Card } from "@/lib/ui/ui";

function useSaver() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  async function save(fn: () => Promise<unknown>, okText: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg({ kind: "success", text: okText });
      router.refresh();
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof ApiClientError ? e.message : "Speichern fehlgeschlagen." });
    } finally {
      setBusy(false);
    }
  }
  return { busy, msg, save };
}

export function ProfileForm({
  initial,
}: {
  initial: { displayName: string; companyName: string | null; currency: string; timezone: string; locale: string };
}): React.JSX.Element {
  const { busy, msg, save } = useSaver();
  const [f, setF] = useState({
    display_name: initial.displayName,
    company_name: initial.companyName ?? "",
    default_currency: initial.currency,
    default_timezone: initial.timezone,
    default_locale: initial.locale,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Card>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Profil</h2>
      {msg ? <div style={{ marginBottom: 10 }}><StatusLine kind={msg.kind}>{msg.text}</StatusLine></div> : null}
      <FormRow>
        <Field label="Anzeigename"><TextInput value={f.display_name} onChange={(e) => set("display_name", e.target.value)} /></Field>
        <Field label="Firma"><TextInput value={f.company_name} onChange={(e) => set("company_name", e.target.value)} /></Field>
      </FormRow>
      <div style={{ height: 12 }} />
      <FormRow>
        <Field label="Währung"><TextInput maxLength={3} value={f.default_currency} onChange={(e) => set("default_currency", e.target.value.toUpperCase())} /></Field>
        <Field label="Zeitzone (IANA)"><TextInput value={f.default_timezone} onChange={(e) => set("default_timezone", e.target.value)} /></Field>
        <Field label="Locale"><TextInput value={f.default_locale} onChange={(e) => set("default_locale", e.target.value)} /></Field>
      </FormRow>
      <div style={{ marginTop: 14 }}>
        <Button variant="primary" disabled={busy} onClick={() => save(() => api.patch(API.account, f), "Profil gespeichert.")}>Profil speichern</Button>
      </div>
    </Card>
  );
}

export function RoundingRuleForm(): React.JSX.Element {
  const { busy, msg, save } = useSaver();
  const [f, setF] = useState({ name: "", mode: "nearest_interval", interval_minutes: "15", min_duration_seconds: "", scope: "global" });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const intervalModes = ["always_up", "always_down", "commercial", "nearest_interval", "ceil_started_interval", "min_per_entry"];
  const minModes = ["min_per_entry", "min_per_day", "min_per_project"];
  const usesInterval = intervalModes.includes(f.mode);
  const usesMin = minModes.includes(f.mode);

  return (
    <Card>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Rundungsregel anlegen</h2>
      {msg ? <div style={{ marginBottom: 10 }}><StatusLine kind={msg.kind}>{msg.text}</StatusLine></div> : null}
      <FormRow>
        <Field label="Name"><TextInput value={f.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Modus">
          <Select value={f.mode} onChange={(e) => set("mode", e.target.value)}>
            <option value="none">keine</option>
            <option value="always_up">immer auf</option>
            <option value="always_down">immer ab</option>
            <option value="commercial">kaufmännisch</option>
            <option value="nearest_interval">nächstes Intervall</option>
            <option value="ceil_started_interval">angefangene Intervalle aufrunden</option>
            <option value="min_per_entry">Minimum je Eintrag</option>
            <option value="min_per_day">Minimum je Tag</option>
            <option value="min_per_project">Minimum je Projekt</option>
          </Select>
        </Field>
      </FormRow>
      <div style={{ height: 12 }} />
      <FormRow>
        <Field label={f.mode === "min_per_entry" ? "Rundungsintervall nach Mindestdauer" : "Intervall (Minuten)"}>
          <Select value={f.interval_minutes} onChange={(e) => set("interval_minutes", e.target.value)} disabled={!usesInterval}>
            {[5, 6, 10, 15, 30, 60].map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Mindestdauer (Sekunden)">
          <TextInput type="number" min={0} value={f.min_duration_seconds} onChange={(e) => set("min_duration_seconds", e.target.value)} disabled={!usesMin} />
        </Field>
        <Field label="Geltung">
          <Select value={f.scope} onChange={(e) => set("scope", e.target.value)}>
            <option value="global">global</option>
            <option value="customer">Kunde</option>
            <option value="project">Projekt</option>
            <option value="task">Aufgabe</option>
          </Select>
        </Field>
      </FormRow>
      <div style={{ marginTop: 14 }}>
        <Button
          variant="primary"
          disabled={busy || !f.name.trim()}
          onClick={() =>
            save(
              () =>
                api.post(API.roundingRules, {
                  name: f.name,
                  mode: f.mode,
                  interval_minutes: usesInterval ? Number(f.interval_minutes) : null,
                  min_duration_seconds: usesMin && f.min_duration_seconds ? Number(f.min_duration_seconds) : null,
                  scope: f.scope,
                  valid_from: new Intl.DateTimeFormat("en-CA").format(new Date()),
                  calculation_version: 1,
                }),
              "Rundungsregel angelegt.",
            )
          }
        >
          Regel speichern
        </Button>
      </div>
    </Card>
  );
}

export function NumberRangeForm({
  initial,
}: {
  initial: { prefix: string; next_number: string; padding: string };
}): React.JSX.Element {
  const { busy, msg, save } = useSaver();
  const [f, setF] = useState(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));

  return (
    <Card>
      <h2 style={{ fontSize: 14, fontWeight: 600, margin: "0 0 12px" }}>Rechnungs-Nummernkreis</h2>
      {msg ? <div style={{ marginBottom: 10 }}><StatusLine kind={msg.kind}>{msg.text}</StatusLine></div> : null}
      <FormRow>
        <Field label="Präfix" hint="z. B. RE-2026-"><TextInput value={f.prefix} onChange={(e) => set("prefix", e.target.value)} /></Field>
        <Field label="Nächste Nummer"><TextInput type="number" min={1} value={f.next_number} onChange={(e) => set("next_number", e.target.value)} /></Field>
        <Field label="Stellen (Padding)"><TextInput type="number" min={1} value={f.padding} onChange={(e) => set("padding", e.target.value)} /></Field>
      </FormRow>
      <div style={{ marginTop: 14 }}>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            save(
              () =>
                api.post(API.numberRange, {
                  prefix: f.prefix,
                  next_number: Number(f.next_number) || 1,
                  padding: Number(f.padding) || 3,
                }),
              "Nummernkreis gespeichert.",
            )
          }
        >
          Nummernkreis speichern
        </Button>
      </div>
    </Card>
  );
}

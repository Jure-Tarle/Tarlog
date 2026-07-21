/**
 * Einstellungen, Bereich 14 (doc 09, doc 11). Rundungsregeln, lokales Backup
 * und Sicherheitsstatus. Nur data-Schicht (rounding, backup); keine eigenen
 * DB-Zugriffe.
 */
import { useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import { ArrowDown, ArrowUp, Check, GripVertical, Monitor, Moon, Pencil, Sun, Type } from "lucide-react";
import { Page, Card, Button, AsyncBody, EmptyState, Tag, Field, Select, SegmentedControl, TextInput } from "../components/ui";
import { useAsync } from "../data/hooks";
import { t, useI18n, type Language } from "../i18n";
import { assignRoundingRule, listRoundingHierarchy, reorderRoundingRules, upsertRoundingRule } from "../data/rounding";
import { runManualBackup } from "../data/backup";
import { listProjects } from "../data/projects";
import { listCustomers } from "../data/customers";
import {
  acceleratorFromKeyboardEvent,
  formatAccelerator,
  loadTrackingShortcuts,
  saveTrackingShortcuts,
  type TrackingShortcut,
} from "../data/trackingShortcuts";
import { loadTextSize, saveTextSize, TEXT_SIZE_OPTIONS, type TextSize } from "../data/textSize";
import {
  APPEARANCE_CHANGE_EVENT,
  normalizeAppearance,
  readAppearancePreference,
  requestAppearance,
  type AppearancePreference,
} from "../data/appearance";
import type { RoundingHierarchyRow, RoundingRuleRow } from "../data/rounding";
import type { RoundingMode } from "@tarlog/core";

const ROUNDING_MODES: ReadonlyArray<{ value: RoundingMode; label: string }> = [
  { value: "none", label: "Keine Rundung" },
  { value: "always_up", label: "Immer aufrunden" },
  { value: "always_down", label: "Immer abrunden" },
  { value: "commercial", label: "Kaufmännisch runden" },
  { value: "nearest_interval", label: "Auf das nächste Intervall runden" },
  { value: "ceil_started_interval", label: "Jede angefangene Einheit berechnen" },
  { value: "min_per_entry", label: "Mindestdauer je Eintrag" },
];

const INTERVAL_MODES = new Set<RoundingMode>([
  "always_up",
  "always_down",
  "commercial",
  "nearest_interval",
  "ceil_started_interval",
  "min_per_entry",
]);

function roundingBehavior(rule: RoundingRuleRow): string {
  const interval = rule.interval_minutes != null
    ? t("{n} Minuten", { n: rule.interval_minutes })
    : t("das festgelegte Intervall");
  const minimum = rule.min_duration_seconds != null
    ? t("{n} Minuten", { n: Math.round(rule.min_duration_seconds / 60) })
    : interval;
  const labels: Record<string, string> = {
    none: t("Keine Rundung, die Abrechnungszeit entspricht der tatsächlichen Zeit."),
    always_up: t("Die Abrechnungszeit wird immer auf {interval} aufgerundet.", { interval }),
    always_down: t("Die Abrechnungszeit wird immer auf {interval} abgerundet.", { interval }),
    commercial: t("Die Abrechnungszeit wird kaufmännisch auf {interval} gerundet.", { interval }),
    nearest_interval: t("Die Abrechnungszeit wird auf das nächste {interval}-Intervall gerundet.", { interval }),
    ceil_started_interval: t("Jede angefangene {interval}-Einheit wird vollständig berechnet.", { interval }),
    min_per_entry: rule.interval_minutes != null
      ? t("Pro Zeiteintrag werden mindestens {minimum} berechnet, anschließend wird auf {interval} aufgerundet.", { minimum, interval })
      : t("Pro Zeiteintrag werden mindestens {minimum} berechnet.", { minimum }),
    min_per_day: t("Pro Tag werden mindestens {minimum} berechnet.", { minimum }),
    min_per_project: t("Pro Projekt werden mindestens {minimum} berechnet.", { minimum }),
  };
  return labels[rule.mode] ?? t("Die hinterlegte Rundungsregel wird auf die Abrechnungszeit angewendet.");
}

export default function Settings() {
  const rules = useAsync(() => listRoundingHierarchy(), []);
  const [roundingName, setRoundingName] = useState("");
  const [roundingMode, setRoundingMode] = useState<RoundingMode>("nearest_interval");
  const [roundingInterval, setRoundingInterval] = useState("15");
  const [roundingMinimum, setRoundingMinimum] = useState("30");
  const [roundingScopeValue, setRoundingScopeValue] = useState<RoundingRuleRow["scope"]>("global");
  const [roundingTargetId, setRoundingTargetId] = useState("");
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [draggedRuleId, setDraggedRuleId] = useState<string | null>(null);
  const [roundingBusy, setRoundingBusy] = useState(false);
  const [roundingMessage, setRoundingMessage] = useState<string | null>(null);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const projects = useAsync(() => listProjects({ status: "active" }), []);
  const customers = useAsync(() => listCustomers("active"), []);
  const [shortcuts, setShortcuts] = useState<TrackingShortcut[]>([]);
  const [shortcutBusy, setShortcutBusy] = useState(true);
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [textSize, setTextSize] = useState<TextSize>(() => loadTextSize());
  const [appearance, setAppearance] = useState<AppearancePreference>(() => readAppearancePreference());
  const { language, setLanguage } = useI18n();

  useEffect(() => {
    const onAppearanceChange = (event: Event) => {
      setAppearance(normalizeAppearance((event as CustomEvent<unknown>).detail));
    };
    window.addEventListener(APPEARANCE_CHANGE_EVENT, onAppearanceChange);
    return () => window.removeEventListener(APPEARANCE_CHANGE_EVENT, onAppearanceChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadTrackingShortcuts()
      .then((items) => { if (!cancelled) setShortcuts(items); })
      .catch((error) => { if (!cancelled) setShortcutMessage(error instanceof Error ? error.message : String(error)); })
      .finally(() => { if (!cancelled) setShortcutBusy(false); });
    return () => { cancelled = true; };
  }, []);

  function updateShortcut(id: string, patch: Partial<TrackingShortcut>) {
    setShortcuts((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
    setShortcutMessage(null);
  }

  async function saveShortcuts() {
    setShortcutBusy(true);
    setShortcutMessage(null);
    try {
      await saveTrackingShortcuts(shortcuts);
      setShortcutMessage(t("Kurzbefehle sind auf diesem Gerät aktiv."));
    } catch (error) {
      setShortcutMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setShortcutBusy(false);
    }
  }

  async function backup() {
    setBusy(true);
    setBackupMsg(null);
    try {
      const res = await runManualBackup(false);
      const sizeKb = Math.round((res.sizeBytes ?? 0) / 1024);
      const note = res.attachmentFiles != null
        ? ` | ${t("{n} Dokumente im Begleitordner", { n: res.attachmentFiles })}`
        : "";
      setBackupMsg(`${t("Backup erstellt: {path} ({size} KB)", { path: res.path, size: sizeKb })}${note}`);
    } catch (e) {
      setBackupMsg(t("Backup fehlgeschlagen: {message}", { message: e instanceof Error ? e.message : String(e) }));
    } finally { setBusy(false); }
  }

  function resetRoundingForm() {
    setRoundingName("");
    setRoundingMode("nearest_interval");
    setRoundingInterval("15");
    setRoundingMinimum("30");
    setRoundingScopeValue("global");
    setRoundingTargetId("");
    setEditingRuleId(null);
    setRoundingMessage(null);
  }

  function editRoundingRule(rule: RoundingHierarchyRow) {
    setEditingRuleId(rule.id);
    setRoundingName(rule.name);
    setRoundingMode(rule.mode);
    setRoundingInterval(String(rule.interval_minutes ?? 15));
    setRoundingMinimum(String(Math.round((rule.min_duration_seconds ?? 1800) / 60)));
    setRoundingScopeValue(rule.assignment === "unassigned" ? "project" : rule.assignment);
    setRoundingTargetId(rule.target_id ?? "");
    setRoundingMessage(rule.assignment === "global" ? t("Um die Basis zu wechseln, bearbeite die gewünschte Regel und wähle „Alle Projekte“.") : null);
  }

  async function saveRoundingRule() {
    const name = roundingName.trim();
    if (!name) return;
    setRoundingBusy(true);
    setRoundingMessage(null);
    try {
      const usesInterval = INTERVAL_MODES.has(roundingMode);
      const usesMinimum = roundingMode === "min_per_entry";
      const existing = rules.data?.find((rule) => rule.id === editingRuleId);
      const saved = await upsertRoundingRule({
        id: editingRuleId ?? undefined,
        name,
        mode: roundingMode,
        interval_minutes: usesInterval ? Number(roundingInterval) as 5 | 6 | 10 | 15 | 30 | 60 : null,
        min_duration_seconds: usesMinimum ? Number(roundingMinimum) * 60 : null,
        scope: roundingScopeValue,
        priority: existing?.priority ?? (roundingScopeValue === "global" ? 0 : ((rules.data?.length ?? 0) + 1) * 100),
      });
      await assignRoundingRule(
        saved.id,
        roundingScopeValue === "global" ? "global" : roundingScopeValue === "customer" ? "customer" : "project",
        roundingTargetId || null,
      );
      resetRoundingForm();
      setRoundingMessage(editingRuleId ? t("Rundungsregel wurde aktualisiert.") : t("Rundungsregel wurde angelegt."));
      rules.reload();
    } catch (error) {
      setRoundingMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRoundingBusy(false);
    }
  }

  async function applyRuleOrder(ids: string[]) {
    setRoundingBusy(true);
    try {
      await reorderRoundingRules(ids);
      setRoundingMessage(t("Reihenfolge wurde gespeichert. Ausnahmen werden von oben nach unten geprüft; die globale Basis bleibt die Rückfallregel."));
      rules.reload();
    } catch (error) {
      setRoundingMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setRoundingBusy(false);
    }
  }

  function moveRule(id: string, direction: -1 | 1) {
    const ordered = (rules.data ?? []).map((rule) => rule.id);
    const index = ordered.indexOf(id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex]!, ordered[index]!];
    void applyRuleOrder(ordered);
  }

  function dropRule(targetId: string) {
    if (!draggedRuleId || draggedRuleId === targetId) return;
    const ordered = (rules.data ?? []).map((rule) => rule.id);
    const from = ordered.indexOf(draggedRuleId);
    const to = ordered.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    ordered.splice(to, 0, moved!);
    setDraggedRuleId(null);
    void applyRuleOrder(ordered);
  }

  return (
    <Page className="settings-page" title={t("Einstellungen")} hint={t("Darstellung, Rundung, Sicherheit, Backup")}>
      <Card title={t("Darstellung")} subtitle={t("Erscheinungsbild und Lesbarkeit auf diesem Gerät")}>
        <div className="settings-appearance-stack">
          <section className="appearance-setting" aria-labelledby="appearance-setting-title">
            <div className="appearance-setting__intro">
              <strong id="appearance-setting-title">{t("Erscheinungsmodus")}</strong>
              <span>{t("Wechsle sofort zwischen Hell und Dunkel oder lasse Tarlog automatisch dem Mac folgen.")}</span>
            </div>
            <div className="appearance-choice-grid" role="group" aria-label={t("Erscheinungsbild auswählen")}>
              {([
                { value: "system", label: "System", description: "Folgt dem Gerät", Icon: Monitor },
                { value: "light", label: "Hell", description: "Helle Systemflächen", Icon: Sun },
                { value: "dark", label: "Dunkel", description: "Dunkle Systemflächen", Icon: Moon },
              ] as const).map(({ value, label, description, Icon }) => (
                <button
                  type="button"
                  key={value}
                  className={`appearance-choice ${appearance === value ? "is-selected" : ""}`}
                  aria-pressed={appearance === value}
                  onClick={() => {
                    setAppearance(value);
                    requestAppearance(value);
                  }}
                >
                  <span className="appearance-choice__icon"><Icon size={18} strokeWidth={1.8} /></span>
                  <span className="appearance-choice__copy"><strong>{t(label)}</strong><small>{t(description)}</small></span>
                  <Check className="appearance-choice__check" size={16} aria-hidden />
                </button>
              ))}
            </div>
            <span className="appearance-setting__status" aria-live="polite">
              {t("Aktiv:")} {appearance === "system" ? t("Systemdarstellung") : appearance === "light" ? t("Hell") : t("Dunkel")}
            </span>
          </section>

          <section className="text-size-setting" aria-labelledby="text-size-setting-title">
            <div className="text-size-setting__intro">
              <span className="text-size-setting__icon" aria-hidden><Type size={18} /></span>
              <div>
                <strong id="text-size-setting-title">{t("Textgröße")}</strong>
                <span>{t("Skaliert die Oberfläche auf diesem Gerät.")}</span>
              </div>
            </div>
            <div className="text-size-setting__control">
              <SegmentedControl
                ariaLabel={t("Textgröße")}
                value={textSize}
                options={TEXT_SIZE_OPTIONS.map((option) => ({ value: option.value, label: t(option.label) }))}
                onChange={(value) => { setTextSize(value); saveTextSize(value); }}
              />
              <span className="text-size-setting__status" aria-live="polite">
                {t("Aktiv:")} {t(TEXT_SIZE_OPTIONS.find((option) => option.value === textSize)?.label ?? "")}
                <span aria-hidden> · </span>
                {t(TEXT_SIZE_OPTIONS.find((option) => option.value === textSize)?.description ?? "")}
              </span>
            </div>
          </section>
        </div>
      </Card>

      <Card title={t("Sprache")} subtitle={t("Sprache der Benutzeroberfläche")}>
        <Field label={t("Sprache")}>
          <Select value={language} onChange={(e) => void setLanguage(e.target.value as Language)}>
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </Select>
        </Field>
        <p className="muted" style={{ marginTop: 8 }}>{t("Das native macOS-Menü übernimmt die neue Sprache nach einem Neustart der App.")}</p>
      </Card>

      <Card
        title={t("Globale Kurzbefehle")}
        subtitle={t("Timer für ein Projekt starten oder stoppen, auch wenn Tarlog im Hintergrund ist")}
        actions={<Button variant="primary" disabled={shortcutBusy} onClick={() => void saveShortcuts()}>{t("Sichern")}</Button>}
      >
        <div className="shortcut-settings">
          {shortcuts.length ? shortcuts.map((shortcut) => (
            <div className="shortcut-row" key={shortcut.id}>
              <Field label={t("Projekt")}>
                <Select
                  value={shortcut.projectId}
                  onChange={(event) => updateShortcut(shortcut.id, { projectId: event.target.value })}
                  disabled={shortcutBusy}
                >
                  <option value="">{t("Projekt auswählen")}</option>
                  {(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </Select>
              </Field>
              <Field label={t("Aktion")}>
                <Select
                  value={shortcut.action}
                  onChange={(event) => updateShortcut(shortcut.id, { action: event.target.value as TrackingShortcut["action"] })}
                  disabled={shortcutBusy}
                >
                  <option value="toggle">{t("Starten / stoppen")}</option>
                  <option value="start">{t("Nur starten")}</option>
                  <option value="stop">{t("Nur stoppen")}</option>
                </Select>
              </Field>
              <Field label={t("Tastenkombination")} hint={t("Klicke und drücke z. B. ⌘ ⇧ 1")}>
                <button
                  type="button"
                  className="input shortcut-recorder"
                  disabled={shortcutBusy}
                  onKeyDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const accelerator = acceleratorFromKeyboardEvent(event);
                    if (accelerator) updateShortcut(shortcut.id, { accelerator });
                  }}
                >
                  {shortcut.accelerator ? formatAccelerator(shortcut.accelerator) : t("Aufnehmen …")}
                </button>
              </Field>
              <Button
                className="shortcut-row__remove"
                variant="ghost"
                disabled={shortcutBusy}
                aria-label={t("Kurzbefehl entfernen")}
                onClick={() => setShortcuts((current) => current.filter((item) => item.id !== shortcut.id))}
              >
                {t("Entfernen")}
              </Button>
            </div>
          )) : (
            <EmptyState title={t("Noch keine Kurzbefehle")}>{t("Lege für häufig verwendete Projekte eigene Tastenkombinationen an.")}</EmptyState>
          )}
          <div className="shortcut-settings__footer">
            {projects.data?.length ? (
              <Button
                disabled={shortcutBusy}
                onClick={() => {
                  const firstProject = projects.data?.[0];
                  if (!firstProject) return;
                  setShortcuts((current) => [...current, {
                    id: uuidv7(),
                    projectId: firstProject.id,
                    action: "toggle",
                    accelerator: "",
                  }]);
                  setShortcutMessage(null);
                }}
              >
                {t("Kurzbefehl hinzufügen")}
              </Button>
            ) : (
              <a className="btn" href="#/projects">{t("Zuerst Projekt erstellen")}</a>
            )}
            <span className="muted">{t("Diese Einstellung gilt nur für diesen Mac beziehungsweise PC.")}</span>
          </div>
          {shortcutMessage ? <p className="shortcut-settings__message" role="status">{shortcutMessage}</p> : null}
        </div>
      </Card>

      <Card title={t("Rundungsregeln")} subtitle={t("Nur die Abrechnungszeit wird gerundet. Die tatsächlich gearbeitete Zeit bleibt unverändert.")}>
        <div className="rounding-priority-note">
          <strong>{t("So funktioniert die Hierarchie")}</strong>
          <span>{t("Ausnahmen werden von oben nach unten geprüft. Die globale Basis darf zur Übersicht frei einsortiert werden, greift fachlich aber immer erst, wenn keine Projekt- oder Kundenregel passt.")}</span>
        </div>
        <AsyncBody
          state={{ data: rules.data, error: rules.error, loading: rules.loading }}
          empty={<EmptyState title={t("Keine Rundungsregeln")} />}
        >
          {(rows) => (
            <div className="rounding-rules-wrap">
              <div className="rounding-rule-list" role="table" aria-label={t("Rundungsregeln")}>
                <div className="rounding-rule-list__head" role="row">
                  <span role="columnheader">{t("Priorität und Regel")}</span>
                  <span role="columnheader">{t("So wird abgerechnet")}</span>
                  <span role="columnheader">{t("Gültigkeit")}</span>
                  <span role="columnheader">{t("Aktion")}</span>
                </div>
                {rows.map((r) => {
                  const rowIndex = rows.findIndex((row) => row.id === r.id);
                  return <article
                    className={`rounding-rule-list__row ${r.assignment === "global" ? "is-global" : ""} ${draggedRuleId === r.id ? "is-dragging" : ""}`}
                    role="row"
                    key={r.id}
                    draggable={!roundingBusy}
                    onDragStart={() => setDraggedRuleId(r.id)}
                    onDragEnd={() => setDraggedRuleId(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={() => dropRule(r.id)}
                  >
                    <div className="rounding-rule-list__cell rounding-rule-list__name" role="cell">
                      <span className="rounding-rule-list__label">{t("Priorität und Regel")}</span>
                      <div className="rounding-rule-priority">
                        <span className="rounding-rule-drag" aria-hidden="true"><GripVertical size={16} /></span>
                        <span><strong>{r.name}</strong><small>{r.assignment === "global" ? t("Globale Basis · Rückfallregel") : t("Priorität {n}", { n: r.priority })}</small></span>
                      </div>
                    </div>
                    <div className="rounding-rule-list__cell rounding-rule-list__behavior" role="cell">
                      <span className="rounding-rule-list__label">{t("So wird abgerechnet")}</span>
                      <span>{roundingBehavior(r)}</span>
                    </div>
                    <div className="rounding-rule-list__cell rounding-rule-list__scope" role="cell">
                      <span className="rounding-rule-list__label">{t("Gültigkeit")}</span>
                      <Tag tone={r.assignment === "global" ? "accent" : "muted"}>
                        {r.assignment === "global" ? t("Alle Projekte") : r.assignment === "project" ? t("Projekt: {name}", { name: r.target_name ?? "" }) : r.assignment === "customer" ? t("Kunde: {name}", { name: r.target_name ?? "" }) : t("Noch nicht zugeordnet")}
                      </Tag>
                    </div>
                    <div className="rounding-rule-list__cell rounding-rule-list__actions" role="cell">
                      <span className="rounding-rule-list__label">{t("Aktion")}</span>
                      <Button variant="ghost" className="btn--sm" onClick={() => editRoundingRule(r)}><Pencil size={14} /> {t("Bearbeiten")}</Button>
                      <span className="rounding-rule-order-controls">
                        <Button variant="ghost" className="btn--icon btn--sm" aria-label={t("{name} nach oben", { name: r.name })} disabled={rowIndex <= 0} onClick={() => moveRule(r.id, -1)}><ArrowUp size={14} /></Button>
                        <Button variant="ghost" className="btn--icon btn--sm" aria-label={t("{name} nach unten", { name: r.name })} disabled={rowIndex < 0 || rowIndex >= rows.length - 1} onClick={() => moveRule(r.id, 1)}><ArrowDown size={14} /></Button>
                      </span>
                    </div>
                  </article>;
                })}
              </div>
            </div>
          )}
        </AsyncBody>
        <form className="rounding-rule-form" onSubmit={(event) => { event.preventDefault(); void saveRoundingRule(); }}>
          <div className="rounding-rule-form__heading">
            <strong>{editingRuleId ? t("Regel bearbeiten") : t("Neue Regel")}</strong>
            <span>{editingRuleId ? t("Berechnung, Ziel und Rolle in der Hierarchie aktualisieren.") : t("Wähle eine Berechnung und ordne sie direkt einem Ziel zu.")}</span>
          </div>
          <div className="rounding-rule-form__fields">
            <Field label={t("Name")} required>
              <TextInput value={roundingName} onChange={(event) => setRoundingName(event.target.value)} placeholder={t("z. B. Auf 10 Minuten runden")} />
            </Field>
            <Field label={t("Rundungsmodus")}>
              <Select value={roundingMode} onChange={(event) => setRoundingMode(event.target.value as RoundingMode)}>
                {ROUNDING_MODES.map((mode) => <option key={mode.value} value={mode.value}>{t(mode.label)}</option>)}
              </Select>
            </Field>
            <Field label={t("Intervall")} hint={roundingMode === "min_per_entry" ? t("Nach der Mindestdauer auf dieses Intervall aufrunden") : INTERVAL_MODES.has(roundingMode) ? t("Schrittweite der Rundung") : t("Für diesen Modus nicht erforderlich")}>
              <Select value={roundingInterval} onChange={(event) => setRoundingInterval(event.target.value)} disabled={!INTERVAL_MODES.has(roundingMode)}>
                {[5, 6, 10, 15, 30, 60].map((minutes) => <option key={minutes} value={minutes}>{t("{n} Minuten", { n: minutes })}</option>)}
              </Select>
            </Field>
            <Field label={t("Mindestdauer")} hint={roundingMode === "min_per_entry" ? t("Mindestens berechnete Zeit je Eintrag") : t("Nur bei Mindestdauer je Eintrag")}>
              <Select value={roundingMinimum} onChange={(event) => setRoundingMinimum(event.target.value)} disabled={roundingMode !== "min_per_entry"}>
                {[5, 10, 15, 30, 45, 60].map((minutes) => <option key={minutes} value={minutes}>{t("{n} Minuten", { n: minutes })}</option>)}
              </Select>
            </Field>
            <Field label={t("Gültigkeit")}>
              <Select value={roundingScopeValue} onChange={(event) => setRoundingScopeValue(event.target.value as RoundingRuleRow["scope"])}>
                <option value="global">{t("Alle Projekte")}</option>
                <option value="customer">{t("Bestimmter Kunde")}</option>
                <option value="project">{t("Bestimmtes Projekt")}</option>
              </Select>
            </Field>
            {roundingScopeValue === "project" ? (
              <Field label={t("Projekt")} required>
                <Select value={roundingTargetId} onChange={(event) => setRoundingTargetId(event.target.value)}>
                  <option value="">{t("Projekt auswählen")}</option>
                  {(projects.data ?? []).map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </Select>
              </Field>
            ) : roundingScopeValue === "customer" ? (
              <Field label={t("Kunde")} required>
                <Select value={roundingTargetId} onChange={(event) => setRoundingTargetId(event.target.value)}>
                  <option value="">{t("Kunde auswählen")}</option>
                  {(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </Select>
              </Field>
            ) : null}
          </div>
          <div className="rounding-rule-form__footer">
            <span className="muted" role="status">{roundingMessage}</span>
            {editingRuleId ? <Button variant="ghost" type="button" onClick={resetRoundingForm}>{t("Abbrechen")}</Button> : null}
            <Button variant="primary" type="submit" disabled={roundingBusy || !roundingName.trim() || (roundingScopeValue !== "global" && !roundingTargetId)}>{roundingBusy ? t("Wird gespeichert …") : editingRuleId ? t("Änderungen speichern") : t("Regel anlegen")}</Button>
          </div>
        </form>
      </Card>

      <div className="grid2">
        <Card title={t("Lokales Backup")} subtitle={t("Datenbank und Projektunterlagen")}>
          <p className="muted">{t("Erstellt eine geprüfte SQLite-Kopie sowie einen gleichnamigen")} <span className="num">.attachments</span>{t("-Begleitordner mit allen Projektunterlagen. Für eine vollständige Wiederherstellung müssen Datenbank, Manifest und Begleitordner gemeinsam aufbewahrt und zurückgespielt werden.")}</p>
          <Button variant="primary" disabled={busy} onClick={() => void backup()}>{t("Backup jetzt erstellen")}</Button>
          {backupMsg ? <p className="muted" style={{ marginTop: 8 }}>{backupMsg}</p> : null}
        </Card>

        <Card title={t("App-Sperre")} subtitle={t("Noch nicht verfügbar")}>
          <p className="muted">
            {t("Eine verlässliche Startsperre benötigt Passwort-Einrichtung, einen Sperrbildschirm vor dem Datenzugriff und eine sichere Wiederherstellung. Diese Strecke ist noch nicht freigegeben; die lokale Datenbank sollte deshalb über FileVault beziehungsweise BitLocker geschützt werden.")}
          </p>
          <Button disabled>{t("In Vorbereitung")}</Button>
        </Card>
      </div>
    </Page>
  );
}

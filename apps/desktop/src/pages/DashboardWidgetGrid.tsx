import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, GripVertical, LayoutDashboard, Plus, RotateCcw, SlidersHorizontal, Undo2, X } from "lucide-react";
import { GridLayout, useContainerWidth, verticalCompactor, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { Button } from "../components/ui";
import {
  DASHBOARD_COLS,
  DASHBOARD_WIDGET_IDS,
  addDashboardWidget,
  cloneDashboardLayout,
  normalizeDashboardLayout,
  removeDashboardWidget,
  type DashboardLayoutState,
  type DashboardWidgetId,
} from "../data/dashboardLayout";
import {
  applyDashboardKeyboardAction,
  cancelDashboardSession,
  commitDashboardChange,
  rejectDashboardSave,
  resetDashboardChange,
  undoDashboardChange,
} from "../data/dashboardEditor";
import { t } from "../i18n";

// Labels bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const WIDGET_LABELS: Record<DashboardWidgetId, string> = {
  timer: "Timer",
  today: "Heute",
  week: "Woche",
  month: "Monat",
  entriesToday: "Einträge heute",
  billable: "Abrechenbar",
  nonBillable: "Nicht abrechenbar",
  activeProjects: "Aktive Projekte",
  activeDays: "Aktive Tage",
  focusToday: "Längster Fokusblock",
  compliance: "Compliance",
  quickStart: "Schnellstart",
};

interface Props {
  value: DashboardLayoutState;
  onSave: (state: DashboardLayoutState) => Promise<DashboardLayoutState>;
  renderWidget: (id: DashboardWidgetId) => ReactNode;
}

export function DashboardWidgetGrid({ value, onSave, renderWidget }: Props) {
  const { width, containerRef, mounted } = useContainerWidth();
  const [state, setState] = useState(() => cloneDashboardLayout(value));
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [undo, setUndo] = useState<DashboardLayoutState[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const baseline = useRef(cloneDashboardLayout(value));
  const gestureStart = useRef<DashboardLayoutState | null>(null);

  useEffect(() => {
    if (editing) return;
    const normalized = cloneDashboardLayout(value);
    setState(normalized);
    baseline.current = normalized;
  }, [editing, value]);

  const hidden = DASHBOARD_WIDGET_IDS.filter((id) => !state.visible.includes(id));

  function startEditing() {
    baseline.current = cloneDashboardLayout(state);
    setUndo([]);
    setAdding(false);
    setSaveError("");
    setEditing(true);
    setAnnouncement(t("Dashboard-Bearbeitung aktiviert."));
  }

  function commit(next: DashboardLayoutState, message: string) {
    const change = commitDashboardChange(state, undo, next, message);
    setState(change.current);
    setUndo(change.undo);
    setSaveError("");
    if (change.message) setAnnouncement(change.message);
  }

  function cancelEditing() {
    const change = cancelDashboardSession(baseline.current);
    setState(change.current);
    setUndo(change.undo);
    setAdding(false);
    setSaveError("");
    setEditing(false);
    setAnnouncement(change.message);
  }

  async function saveEditing() {
    setSaving(true);
    setSaveError("");
    try {
      const saved = await onSave(normalizeDashboardLayout(state));
      const normalized = cloneDashboardLayout(saved);
      baseline.current = normalized;
      setState(normalized);
      setUndo([]);
      setAdding(false);
      setEditing(false);
      setAnnouncement(t("Dashboard auf diesem Gerät gespeichert."));
    } catch {
      const failure = rejectDashboardSave();
      setEditing(failure.editing);
      setSaveError(failure.error);
      setAnnouncement(failure.message);
    } finally {
      setSaving(false);
    }
  }

  function undoLast() {
    const change = undoDashboardChange(state, undo);
    setState(change.current);
    setUndo(change.undo);
    setSaveError("");
    if (change.message) setAnnouncement(change.message);
  }

  function reset() {
    const change = resetDashboardChange(state, undo);
    setState(change.current);
    setUndo(change.undo);
    setSaveError("");
    if (change.message) setAnnouncement(change.message);
  }

  function remove(id: DashboardWidgetId) {
    const next = removeDashboardWidget(state, id);
    if (next === state) {
      setAnnouncement(t("Mindestens ein Widget muss sichtbar bleiben."));
      return;
    }
    commit(next, t("{name} entfernt.", { name: t(WIDGET_LABELS[id]) }));
  }

  function add(id: DashboardWidgetId) {
    commit(addDashboardWidget(state, id), t("{name} hinzugefügt.", { name: t(WIDGET_LABELS[id]) }));
    setAdding(false);
  }

  function handleKeyboard(id: DashboardWidgetId, event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!["Delete", "Backspace", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const change = applyDashboardKeyboardAction(state, undo, "lg", id, event.key, event.shiftKey, t(WIDGET_LABELS[id]));
    setState(change.current);
    setUndo(change.undo);
    setSaveError("");
    if (change.message) setAnnouncement(change.message);
  }

  function startGesture() {
    gestureStart.current = cloneDashboardLayout(state);
  }

  function finishGesture(kind: "verschoben" | "vergrößert", finalLayout: Layout) {
    const previous = gestureStart.current;
    gestureStart.current = null;
    if (!previous) return;
    const next = normalizeDashboardLayout({ ...state, layouts: { ...state.layouts, lg: finalLayout } });
    const change = commitDashboardChange(previous, undo, next, kind === "verschoben" ? t("Widget verschoben.") : t("Widget vergrößert."));
    if (!change.message) return;
    setUndo(change.undo);
    setState(change.current);
    setSaveError("");
    setAnnouncement(change.message);
  }

  return (
    <section className={`dashboard-canvas ${editing ? "is-editing" : ""}`} aria-label={t("Anpassbares Dashboard")}>
      <div className="dashboard-editorbar">
        <div className="dashboard-editorbar__copy">
          <LayoutDashboard aria-hidden="true" size={17} />
          <span>{editing ? t("Widgets bewegen, skalieren oder ausblenden") : t("Deine wichtigsten Zeiten auf einen Blick")}</span>
        </div>
        <div className="dashboard-editorbar__actions" role="toolbar" aria-label={t("Dashboard anpassen")}>
          {!editing ? (
            <Button onClick={startEditing}><SlidersHorizontal size={15} aria-hidden="true" /> {t("Anpassen")}</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={undoLast} disabled={!undo.length} title={t("Rückgängig")}><Undo2 size={15} aria-hidden="true" /> {t("Rückgängig")}</Button>
              <Button variant="ghost" onClick={reset}><RotateCcw size={15} aria-hidden="true" /> {t("Zurücksetzen")}</Button>
              <Button onClick={() => setAdding((open) => !open)} aria-expanded={adding}><Plus size={15} aria-hidden="true" /> {t("Widget")}</Button>
              <Button variant="ghost" onClick={cancelEditing}>{t("Abbrechen")}</Button>
              <Button variant="primary" onClick={() => void saveEditing()} disabled={saving}><Check size={15} aria-hidden="true" /> {saving ? t("Sichern…") : t("Fertig")}</Button>
            </>
          )}
        </div>
      </div>

      {editing && adding ? (
        <div className="dashboard-widget-picker" aria-label={t("Widget hinzufügen")}>
          <div>
            <strong>{t("Widget hinzufügen")}</strong>
            <span className="muted">{t("Nur ausgeblendete Widgets werden angeboten.")}</span>
          </div>
          <div className="dashboard-widget-picker__items">
            {hidden.length ? hidden.map((id) => (
              <Button key={id} onClick={() => add(id)}><Plus size={14} aria-hidden="true" /> {t(WIDGET_LABELS[id])}</Button>
            )) : <span className="muted">{t("Alle Widgets sind bereits auf dem Dashboard.")}</span>}
          </div>
        </div>
      ) : null}

      {saveError ? <div className="dashboard-editor-error" role="status" aria-live="polite">{saveError}</div> : null}

      <div ref={containerRef} className="dashboard-grid-viewport">
        {mounted ? (
          <GridLayout
            width={width}
            layout={state.layouts.lg}
            gridConfig={{
              cols: DASHBOARD_COLS.lg,
              rowHeight: 44,
              margin: width < 620 ? [10, 10] : width < 1080 ? [12, 12] : [14, 14],
              containerPadding: [0, 0],
            }}
            compactor={verticalCompactor}
            dragConfig={{ enabled: editing, bounded: true, handle: ".dashboard-widget__handle", cancel: "button:not(.dashboard-widget__handle)" }}
            resizeConfig={{ enabled: editing, handles: ["se"] }}
            onLayoutChange={(layout) => {
              if (editing) setState((current) => normalizeDashboardLayout({ ...current, layouts: { ...current.layouts, lg: layout } }));
            }}
            onDragStart={startGesture}
            onResizeStart={startGesture}
            onDragStop={(finalLayout) => finishGesture("verschoben", finalLayout)}
            onResizeStop={(finalLayout) => finishGesture("vergrößert", finalLayout)}
          >
            {state.visible.map((id) => (
              <div key={id} className="dashboard-widget">
                {editing ? (
                  <div className="dashboard-widget__chrome">
                    <button
                      type="button"
                      className="dashboard-widget__handle"
                      onKeyDown={(event) => handleKeyboard(id, event)}
                      aria-label={t("{name} verschieben. Pfeiltasten bewegen, Umschalt plus Pfeiltasten ändern die Größe, Entfernen blendet das Widget aus.", { name: t(WIDGET_LABELS[id]) })}
                    >
                      <GripVertical size={16} aria-hidden="true" />
                      <span>{t(WIDGET_LABELS[id])}</span>
                    </button>
                    <button type="button" className="dashboard-widget__remove" onClick={() => remove(id)} aria-label={t("{name} ausblenden", { name: t(WIDGET_LABELS[id]) })}>
                      <X size={15} aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
                <div className="dashboard-widget__content">{renderWidget(id)}</div>
              </div>
            ))}
          </GridLayout>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
}

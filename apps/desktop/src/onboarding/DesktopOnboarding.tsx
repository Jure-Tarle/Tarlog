import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  CloudOff,
  FolderKanban,
  History,
  Laptop,
  Pause,
  Play,
  RotateCcw,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  ONBOARDING_STEPS,
  createOnboardingProgress,
  nextOnboardingStep,
  onboardingStepIndex,
  previousOnboardingStep,
  type OnboardingProgress,
  type OnboardingStep,
} from "@tarlog/core";
import { AppleSystemSymbol } from "../components/AppleSystemSymbol";
import {
  Button,
  ErrorNote,
  Field,
  FormRow,
  Loading,
  Select,
  TextInput,
} from "../components/ui";
import { createCustomer, listCustomers } from "../data/customers";
import { useAsync } from "../data/hooks";
import { createProject, listProjects } from "../data/projects";
import { t } from "../i18n";
import type { NativeSystemSymbolKey } from "../lib/bridge";
import {
  completedWorkspaceProgress,
  onboardingProjectRates,
  resolveOnboardingCustomerSetup,
  resolveOnboardingProjectId,
  type OnboardingBillingType,
} from "./projectSelection";
import brandMarkUrl from "../../../../assets/brand/tarlog-flow-mark.svg?url";

const SPRING = { type: "spring", bounce: 0, duration: 0.38 } as const;

interface StepMeta {
  label: string;
  eyebrow: string;
  title: string;
  summary: string;
  symbol: NativeSystemSymbolKey;
  fallback: LucideIcon;
}

// Strings bleiben deutsch (Wörterbuch-Schlüssel); t() erst beim Rendern.
const STEP_META: Record<OnboardingStep, StepMeta> = {
  welcome: {
    label: "Willkommen",
    eyebrow: "Ersteinrichtung",
    title: "Willkommen bei Tarlog",
    summary: "Richte deinen Arbeitsbereich ein und lerne die zwei Wege der Zeiterfassung kennen. Deine Daten bleiben standardmäßig auf diesem Mac.",
    symbol: "onboarding",
    fallback: CircleHelp,
  },
  workspace: {
    label: "Arbeitsbereich",
    eyebrow: "Kunde & Projekt",
    title: "Ersten Arbeitsbereich einrichten",
    summary: "Lege dein erstes Projekt an. Wenn du für einen Kunden arbeitest, kannst du ihn direkt mit anlegen; für interne Arbeit bleibt das Kundenfeld leer.",
    symbol: "projects",
    fallback: FolderKanban,
  },
  live_tracking: {
    label: "Live-Timer",
    eyebrow: "Aktive Arbeit",
    title: "Arbeitszeit mit dem Timer erfassen",
    summary: "Der Timer bleibt in der Toolbar sichtbar. Du kannst ihn jederzeit pausieren, fortsetzen und mit einer Beschreibung sauber abschließen.",
    symbol: "timer",
    fallback: Play,
  },
  backdating: {
    label: "Nachträge",
    eyebrow: "Vergangene Arbeit",
    title: "Vergangene Arbeit nachtragen",
    summary: "Im Nachtragsassistenten erfasst du Datum, Zeitraum, Grund und Pausen. Tarlog trennt dabei tatsächliche Zeit und Abrechnungszeit.",
    symbol: "backdating",
    fallback: History,
  },
  sync: {
    label: "Sync",
    eyebrow: "Geräte & Server",
    title: "Sync nach Bedarf einrichten",
    summary: "Der lokale Desktop-Modus funktioniert ohne Konto und Internet. Einen selbst gehosteten Server kannst du ergänzen, wenn du mehrere Geräte abgleichen möchtest.",
    symbol: "sync",
    fallback: CloudOff,
  },
  ready: {
    label: "Bereit",
    eyebrow: "Einrichtung abgeschlossen",
    title: "Tarlog ist bereit",
    summary: "Es wurden keine Demo-Zeiten erzeugt. Starte jetzt eine echte Bearbeitung oder öffne das Dashboard für den Überblick.",
    symbol: "compliance",
    fallback: Check,
  },
};

export interface DesktopOnboardingProps {
  progress: OnboardingProgress;
  required: boolean;
  toolbar?: ReactNode;
  onCheckpoint: (progress: OnboardingProgress) => Promise<void>;
  onFinish: (progress: OnboardingProgress, destination: "timer" | "dashboard") => Promise<void>;
  onDismiss: () => void;
}

function progressWith(
  progress: OnboardingProgress,
  patch: Partial<OnboardingProgress>,
): OnboardingProgress {
  return createOnboardingProgress({ ...progress, ...patch, status: "in_progress", completedAt: null });
}

function toCents(value: string): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) return undefined;
  const parsed = Number(normalized.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed > Number.MAX_SAFE_INTEGER / 100) return undefined;
  return Math.round(parsed * 100);
}

function StepSymbol({ step, size = 22 }: { step: OnboardingStep; size?: number }) {
  const meta = STEP_META[step];
  const Fallback = meta.fallback;
  return (
    <AppleSystemSymbol
      name={meta.symbol}
      className="onboarding-symbol apple-system-symbol"
      size={size}
      fallback={<Fallback size={size} strokeWidth={1.8} aria-hidden />}
    />
  );
}

export function DesktopOnboarding({
  progress,
  required,
  toolbar,
  onCheckpoint,
  onFinish,
  onDismiss,
}: DesktopOnboardingProps) {
  const reduceMotion = useReducedMotion();
  const [direction, setDirection] = useState(1);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const pendingRef = useRef(false);
  const currentIndex = onboardingStepIndex(progress.step);
  const meta = STEP_META[progress.step];

  function updatePending(value: boolean) {
    pendingRef.current = value;
    setPending(value);
  }

  function requestDismiss() {
    if (!pendingRef.current) onDismiss();
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [progress.step]);

  useEffect(() => {
    if (required) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (pendingRef.current) return;
      event.preventDefault();
      onDismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onDismiss, required]);

  async function moveTo(step: OnboardingStep, patch: Partial<OnboardingProgress> = {}) {
    if (pendingRef.current || step === progress.step) return;
    setDirection(onboardingStepIndex(step) > currentIndex ? 1 : -1);
    updatePending(true);
    setError(null);
    try {
      await onCheckpoint(progressWith(progress, { ...patch, step }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      updatePending(false);
    }
  }

  const goNext = (patch: Partial<OnboardingProgress> = {}) =>
    moveTo(nextOnboardingStep(progress.step), patch);
  const goBack = () => moveTo(previousOnboardingStep(progress.step));

  async function completeCreatedWorkspace(
    patch: Pick<OnboardingProgress, "projectId" | "customerId">,
  ) {
    // WorkspaceStep already owns the pending transaction. Bypass moveTo's
    // user-interaction guard so create + advance remains one intentional flow.
    setDirection(1);
    setError(null);
    await onCheckpoint(completedWorkspaceProgress(progress, patch));
  }

  async function finish(destination: "timer" | "dashboard") {
    if (pendingRef.current) return;
    updatePending(true);
    setError(null);
    try {
      await onFinish(progress, destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      updatePending(false);
    }
  }

  return (
    <section
      className="onboarding"
      aria-busy={pending || undefined}
      aria-label={required ? t("Tarlog Ersteinrichtung") : t("Tarlog Einführung")}
    >
      <header className="onboarding__toolbar" data-tauri-drag-region>
        <div className="onboarding__brand" data-tauri-drag-region>
          <span className="onboarding__brandmark" aria-hidden>
            <img className="brand-mark__image" src={brandMarkUrl} alt="" />
          </span>
          <span data-tauri-drag-region>
            <strong>Tarlog</strong>
            <small>{required ? t("Ersteinrichtung") : t("Einführung")}</small>
          </span>
        </div>
        <div className="onboarding__toolbar-actions">
          {toolbar}
          {!required ? (
            <button
              type="button"
              className="toolbar-icon-button"
              disabled={pending}
              onClick={requestDismiss}
              aria-label={t("Einführung schließen")}
              title={t("Einführung schließen")}
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="onboarding__layout">
        <nav className="onboarding__rail" aria-label={t("Einführungsschritte")}>
          <div className="onboarding__rail-heading">
            <span>{t("Einführung")}</span>
            <strong>{t("{current} von {total}", { current: currentIndex + 1, total: ONBOARDING_STEPS.length })}</strong>
          </div>
          <ol className="onboarding__steps">
            {ONBOARDING_STEPS.map((step, index) => {
              const active = step === progress.step;
              const visited = index < currentIndex;
              const available = index <= currentIndex && !pending;
              return (
                <li key={step}>
                  <button
                    type="button"
                    className={`onboarding-step ${active ? "is-active" : ""} ${visited ? "is-complete" : ""}`}
                    disabled={!available}
                    aria-current={active ? "step" : undefined}
                    onClick={() => void moveTo(step)}
                  >
                    <span className="onboarding-step__icon" aria-hidden>
                      {visited ? <Check size={14} strokeWidth={2.25} /> : <StepSymbol step={step} size={15} />}
                    </span>
                    <span>{t(STEP_META[step].label)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="onboarding__rail-note">
            <Laptop size={16} aria-hidden />
            <span>{t("Deine Daten bleiben standardmäßig auf diesem Gerät.")}</span>
          </div>
        </nav>

        <main className="onboarding__content" aria-live="polite">
          <div className="onboarding__content-scroll">
            <AnimatePresence initial={false} mode="popLayout" custom={direction}>
              <motion.div
                key={progress.step}
                className="onboarding__stage"
                custom={direction}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: direction * -28 }}
                transition={reduceMotion ? { duration: 0.12 } : SPRING}
              >
                <div className={`onboarding__hero-icon ${progress.step === "welcome" ? "is-brand" : ""}`} aria-hidden>
                  {progress.step === "welcome" ? (
                    <img className="brand-mark__image" src={brandMarkUrl} alt="" />
                  ) : (
                    <StepSymbol step={progress.step} size={26} />
                  )}
                </div>
                <p className="onboarding__eyebrow">{t(meta.eyebrow)}</p>
                <h1 className="onboarding__title" ref={titleRef} tabIndex={-1}>{t(meta.title)}</h1>
                <p className="onboarding__summary">{t(meta.summary)}</p>

                <div className="onboarding__step-body">
                  {progress.step === "welcome" ? <WelcomeStep /> : null}
                  {progress.step === "workspace" ? (
                    <WorkspaceStep
                      progress={progress}
                      pending={pending}
                      onPendingChange={updatePending}
                      onError={setError}
                      onContinue={goNext}
                      onCreated={completeCreatedWorkspace}
                      onCheckpoint={onCheckpoint}
                    />
                  ) : null}
                  {progress.step === "live_tracking" ? <LiveTrackingStep /> : null}
                  {progress.step === "backdating" ? <BackdatingStep /> : null}
                  {progress.step === "sync" ? <SyncStep /> : null}
                  {progress.step === "ready" ? <ReadyStep progress={progress} /> : null}
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          <footer className="onboarding__footer">
            <div className="onboarding__footer-status" role="status">
              {error ? <ErrorNote error={error} /> : pending ? <Loading label={t("Wird gesichert …")} /> : null}
            </div>
            <div className="onboarding__footer-actions">
              {currentIndex > 0 ? (
                <Button variant="ghost" disabled={pending} onClick={() => void goBack()}>
                  <ChevronLeft size={15} aria-hidden /> {t("Zurück")}
                </Button>
              ) : !required ? (
                <Button variant="ghost" disabled={pending} onClick={requestDismiss}>{t("Schließen")}</Button>
              ) : <span />}

              {progress.step === "workspace" ? null : progress.step === "ready" ? (
                <>
                  <Button disabled={pending} onClick={() => void finish("dashboard")}>{t("Zum Dashboard")}</Button>
                  <Button variant="primary" disabled={pending} onClick={() => void finish("timer")}>
                    {t("Timer öffnen")} <ChevronRight size={15} aria-hidden />
                  </Button>
                </>
              ) : (
                <Button variant="primary" disabled={pending} onClick={() => void goNext()}>
                  {t("Weiter")} <ChevronRight size={15} aria-hidden />
                </Button>
              )}
            </div>
          </footer>
        </main>
      </div>
    </section>
  );
}

function WelcomeStep() {
  return (
    <div className="onboarding-feature-grid">
      <Feature title={t("Lokal auf deinem Mac")} copy={t("Ohne Anmeldung, Cloud-Zwang oder dauerhafte Internetverbindung.")} icon={Laptop} />
      <Feature title={t("Nachvollziehbare Zeiten")} copy={t("Ist-Zeit und gerundete Abrechnungszeit bleiben sauber getrennt.")} icon={RotateCcw} />
      <Feature title={t("Timer und Nachträge")} copy={t("Erfasse laufende Arbeit direkt und Vergangenes mit einer Begründung.")} icon={History} />
    </div>
  );
}

function WorkspaceStep({
  progress,
  pending,
  onPendingChange,
  onError,
  onContinue,
  onCreated,
  onCheckpoint,
}: {
  progress: OnboardingProgress;
  pending: boolean;
  onPendingChange: (pending: boolean) => void;
  onError: (error: string | null) => void;
  onContinue: (patch?: Partial<OnboardingProgress>) => Promise<void>;
  onCreated: (
    patch: Pick<OnboardingProgress, "projectId" | "customerId">,
  ) => Promise<void>;
  onCheckpoint: (progress: OnboardingProgress) => Promise<void>;
}) {
  const customers = useAsync(() => listCustomers("active"), []);
  const projects = useAsync(() => listProjects({ status: "active" }), []);
  const [mode, setMode] = useState<"existing" | "new">(progress.projectId ? "existing" : "new");
  const [selectedProjectId, setSelectedProjectId] = useState(progress.projectId ?? "");
  const [selectedCustomerId, setSelectedCustomerId] = useState(progress.customerId ?? "");
  const [customerName, setCustomerName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [billingType, setBillingType] = useState<OnboardingBillingType>("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const [fixedFee, setFixedFee] = useState("");
  const projectSelectionResolved = useRef(false);
  const submittingRef = useRef(false);
  const availableProjects = projects.data ?? [];
  const availableCustomers = customers.data ?? [];
  const customerSetup = resolveOnboardingCustomerSetup(
    availableCustomers.length,
    progress.customerId,
  );

  useEffect(() => {
    if (projectSelectionResolved.current || availableProjects.length === 0) return;
    projectSelectionResolved.current = true;
    const preferredProjectId = resolveOnboardingProjectId(availableProjects, progress.projectId);
    if (!preferredProjectId) return;
    setSelectedProjectId(preferredProjectId);
    setMode("existing");
  }, [availableProjects, progress.projectId]);

  const projectById = useMemo(
    () => new Map(availableProjects.map((project) => [project.id, project])),
    [availableProjects],
  );

  if ((projects.loading && projects.data == null) || (customers.loading && customers.data == null)) {
    return <div className="onboarding-form"><Loading label={t("Projekte werden geladen …")} /></div>;
  }

  async function continueExisting() {
    if (pending) return;
    const project = projectById.get(selectedProjectId);
    if (!project) {
      onError(t("Bitte wähle ein bestehendes Projekt aus."));
      return;
    }
    await onContinue({ projectId: project.id, customerId: project.customer_id ?? null });
  }

  async function createWorkspace() {
    if (pending || submittingRef.current) return;
    onError(null);
    if (!projectName.trim()) {
      onError(t("Projektname ist erforderlich."));
      return;
    }
    const amount = billingType === "hourly" ? hourlyRate : billingType === "fixed_fee" ? fixedFee : "";
    const amountCents = billingType === "non_billable" ? null : toCents(amount);
    if (amountCents === undefined) {
      const label = billingType === "fixed_fee" ? "Festpreis" : "Stundensatz";
      onError(t("Bitte gib den {label} als Zahl mit höchstens zwei Nachkommastellen ein.", { label: t(label) }));
      return;
    }
    submittingRef.current = true;
    onPendingChange(true);
    try {
      let customerId = progress.customerId ?? (selectedCustomerId || null);
      if (!customerId && customerName.trim()) {
        const customer = await createCustomer({ name: customerName.trim() });
        customerId = customer.id;
        setSelectedCustomerId(customer.id);
        setCustomerName("");
        customers.reload();
        // If project creation fails afterwards, resume with the customer instead
        // of creating a duplicate on the next launch.
        await onCheckpoint(progressWith(progress, { customerId, step: "workspace" }));
      }

      const project = await createProject({
        name: projectName.trim(),
        customer_id: customerId,
        billing_type: billingType,
        ...onboardingProjectRates(billingType, amountCents),
      });
      setSelectedProjectId(project.id);
      setMode("existing");
      projects.reload();
      // Persist the created id before advancing so a failed second checkpoint
      // cannot cause a duplicate project on retry.
      await onCheckpoint(progressWith(progress, { projectId: project.id, customerId, step: "workspace" }));
      await onCreated({ projectId: project.id, customerId });
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      submittingRef.current = false;
      onPendingChange(false);
    }
  }

  return (
    <div className="onboarding-workspace">
      {availableProjects.length > 0 ? (
        <div className="onboarding-choice" role="group" aria-label={t("Projektquelle")}>
          <button
            type="button"
            className={mode === "existing" ? "is-active" : ""}
            aria-pressed={mode === "existing"}
            disabled={pending}
            onClick={() => setMode("existing")}
          >
            {t("Bestehendes Projekt")}
          </button>
          <button
            type="button"
            className={mode === "new" ? "is-active" : ""}
            aria-pressed={mode === "new"}
            disabled={pending}
            onClick={() => setMode("new")}
          >
            {t("Neues Projekt")}
          </button>
        </div>
      ) : null}

      {customers.error ? <ErrorNote error={customers.error} /> : projects.error ? <ErrorNote error={projects.error} /> : null}

      {mode === "existing" && availableProjects.length > 0 ? (
        <form
          className="onboarding-form"
          onSubmit={(event) => {
            event.preventDefault();
            void continueExisting();
          }}
        >
          <Field label={t("Projekt")} required>
            <Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.currentTarget.value)} autoFocus>
              <option value="">{t("Projekt auswählen …")}</option>
              {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </Field>
          <p className="onboarding-form__hint">{t("Die Einführung verändert das ausgewählte Projekt nicht.")}</p>
          <Button type="submit" variant="primary" disabled={pending || !selectedProjectId}>
            {t("Projekt verwenden")} <ChevronRight size={15} aria-hidden />
          </Button>
        </form>
      ) : (
        <form
          className="onboarding-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createWorkspace();
          }}
        >
          {customerSetup === "created" ? (
            <div className="onboarding-success-line" role="status"><Check size={15} aria-hidden /> {t("Kunde wurde angelegt und wird weiterverwendet.")}</div>
          ) : customerSetup === "first" ? (
            <Field label={t("Kunde")} hint={t("Optional | Für interne Projekte leer lassen.")}>
              <TextInput
                value={customerName}
                onChange={(event) => setCustomerName(event.currentTarget.value)}
                placeholder={t("Name oder Unternehmen")}
              />
            </Field>
          ) : (
            <FormRow>
              <Field label={t("Kundenzuordnung")} hint={t("Optional")}>
                <Select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}>
                  <option value="">{t("Kein Kunde | internes Projekt")}</option>
                  {availableCustomers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </Select>
              </Field>
              <Field label={t("Neuen Kunden anlegen")} hint={t("Optional")}>
                <TextInput value={customerName} onChange={(event) => setCustomerName(event.currentTarget.value)} placeholder={t("z. B. Muster GmbH")} disabled={Boolean(selectedCustomerId)} />
              </Field>
            </FormRow>
          )}

          <Field label={t("Projektname")} required>
            <TextInput value={projectName} onChange={(event) => setProjectName(event.currentTarget.value)} placeholder={t("z. B. Website-Relaunch")} autoFocus />
          </Field>
          <FormRow>
            <Field label={t("Abrechnung")}>
              <Select value={billingType} onChange={(event) => setBillingType(event.currentTarget.value as OnboardingBillingType)}>
                <option value="hourly">{t("Stundensatz")}</option>
                <option value="fixed_fee">{t("Festpreis")}</option>
                <option value="non_billable">{t("Nicht abrechenbar")}</option>
              </Select>
            </Field>
            {billingType === "hourly" ? (
              <Field label={t("Stundensatz (€)")} hint={t("optional")}>
                <TextInput
                  inputMode="decimal"
                  value={hourlyRate}
                  onChange={(event) => setHourlyRate(event.currentTarget.value)}
                  placeholder={t("0,00")}
                />
              </Field>
            ) : billingType === "fixed_fee" ? (
              <Field label={t("Festpreis (€)")} hint={t("optional")}>
                <TextInput
                  inputMode="decimal"
                  value={fixedFee}
                  onChange={(event) => setFixedFee(event.currentTarget.value)}
                  placeholder={t("0,00")}
                />
              </Field>
            ) : (
              <div className="onboarding-billing-note" role="status">
                {t("Für dieses Projekt wird kein Preis erfasst.")}
              </div>
            )}
          </FormRow>
          <Button type="submit" variant="primary" disabled={pending || !projectName.trim()}>
            {t("Projekt anlegen")} <ChevronRight size={15} aria-hidden />
          </Button>
        </form>
      )}
    </div>
  );
}

function LiveTrackingStep() {
  return (
    <div className="onboarding-demo" aria-label={t("Ablauf eines Live-Timers")}>
      <ProcessItem number="1" title={t("Projekt wählen")} copy={t("Ordne die Bearbeitung deinem Projekt zu und ergänze, woran du arbeitest.")} symbol="timerPlay" fallback={Play} />
      <ProcessItem number="2" title={t("Pausieren & fortsetzen")} copy={t("Pausen werden getrennt erfasst und von der Nettozeit abgezogen.")} symbol="timerPause" fallback={Pause} />
      <ProcessItem number="3" title={t("Stoppen & speichern")} copy={t("Beim Abschluss prüfst du Beschreibung, Endzeit und die Rundungsvorschau.")} symbol="timerStop" fallback={Square} />
      <div className="onboarding-callout">
        <span className="onboarding-callout__pulse" aria-hidden />
        <div><strong>{t("Immer erreichbar")}</strong><p>{t("Der kompakte Timer oben in der App zeigt Status und Laufzeit in jedem Bereich.")}</p></div>
      </div>
    </div>
  );
}

function BackdatingStep() {
  return (
    <section className="onboarding-backdating-card" aria-label={t("Beispiel eines Nachtrags")}>
      <header className="onboarding-backdating-card__header">
        <div>
          <span>{t("Beispielnachtrag")}</span>
          <strong>{t("Konzeptarbeit")}</strong>
        </div>
        <time>09:00,11:30</time>
      </header>
      <div className="onboarding-backdating-card__track" aria-hidden><span /></div>
      <dl className="onboarding-backdating-card__details">
        <div><dt>{t("Zeitraum")}</dt><dd>{t("Heute | 09:00,11:30")}</dd></div>
        <div><dt>{t("Begründung")}</dt><dd>{t("Timer vergessen, Meeting oder Offline-Arbeit")}</dd></div>
        <div><dt>{t("Vorschau")}</dt><dd>{t("Nettozeit und Abrechnungsrundung vor dem Speichern")}</dd></div>
      </dl>
      <footer className="onboarding-backdating-card__footer">
        <History size={14} strokeWidth={1.8} aria-hidden />
        <span>{t("Als Nachtrag markiert und im Audit-Verlauf nachvollziehbar")}</span>
      </footer>
    </section>
  );
}

function SyncStep() {
  return (
    <div className="onboarding-sync-options">
      <article className="onboarding-sync-card is-supported">
        <span className="onboarding-sync-card__icon"><CloudOff size={20} aria-hidden /></span>
        <div><span className="tag tag--accent">{t("Standard")}</span><h2>{t("Nur auf diesem Gerät")}</h2></div>
        <p>{t("Voll unterstützt. Kunden, Projekte und Zeiten liegen in deiner lokalen SQLite-Datenbank; Backups kannst du in den Einstellungen erstellen.")}</p>
        <ul><li>{t("Kein Server erforderlich")}</li><li>{t("Keine Anmeldung")}</li><li>{t("Offline vollständig nutzbar")}</li></ul>
      </article>
      <article className="onboarding-sync-card">
        <span className="onboarding-sync-card__icon"><RotateCcw size={20} aria-hidden /></span>
        <div><span className="tag tag--muted">{t("Experimentell")}</span><h2>{t("Eigener Tarlog-Server")}</h2></div>
        <p>{t("Die Webanwendung kann selbst gehostet werden. Der native Desktop-Abgleich über Pairing, Event-Log und Live-Kanal befindet sich noch in Erprobung.")}</p>
        <ul><li>{t("Server bleibt unter deiner Kontrolle")}</li><li>{t("WebSocket mit Polling-Fallback vorgesehen")}</li><li>{t("Keine Verbindung wird jetzt automatisch hergestellt")}</li></ul>
      </article>
      <p className="onboarding-caption">{t("Du kannst den Betriebsmodus später jederzeit im Bereich „Sync“ prüfen. Lokal erfasste Daten bleiben dabei erhalten.")}</p>
    </div>
  );
}

function ReadyStep({ progress }: { progress: OnboardingProgress }) {
  return (
    <div className="onboarding-ready">
      <div className="onboarding-ready__check" aria-hidden><Check size={32} strokeWidth={2.2} /></div>
      <div>
        <h2>{t("Projekt vorbereitet")}</h2>
        <p>{progress.customerId ? t("Kunde und Projekt sind angelegt.") : t("Dein Projekt ist angelegt und kann sofort verwendet werden.")}</p>
      </div>
      <div className="onboarding-detail-list">
        <div><strong>{t("Live arbeiten")}</strong><span>{t("Timer öffnen, Projekt wählen und starten")}</span></div>
        <div><strong>{t("Vergangenes erfassen")}</strong><span>{t("„Nachträge“ in der Seitenleiste öffnen")}</span></div>
        <div><strong>{t("Einführung wiederholen")}</strong><span>{t("Über „Einführung“ unten in der Seitenleiste")}</span></div>
      </div>
    </div>
  );
}

function Feature({ title, copy, icon: Icon }: { title: string; copy: string; icon: LucideIcon }) {
  return <article className="onboarding-feature"><Icon size={20} strokeWidth={1.8} aria-hidden /><h2>{title}</h2><p>{copy}</p></article>;
}

function ProcessItem({
  number,
  title,
  copy,
  symbol,
  fallback: Fallback,
}: {
  number: string;
  title: string;
  copy: string;
  symbol: NativeSystemSymbolKey;
  fallback: LucideIcon;
}) {
  return (
    <article className="onboarding-process">
      <span className="onboarding-process__number">{number}</span>
      <span className="onboarding-process__icon" aria-hidden>
        <AppleSystemSymbol
          name={symbol}
          className="apple-system-symbol"
          size={18}
          fallback={<Fallback size={18} aria-hidden />}
        />
      </span>
      <div><h2>{title}</h2><p>{copy}</p></div>
    </article>
  );
}

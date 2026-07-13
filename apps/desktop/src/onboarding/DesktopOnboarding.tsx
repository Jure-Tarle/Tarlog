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
import type { NativeSystemSymbolKey } from "../lib/bridge";
import {
  completedWorkspaceProgress,
  resolveOnboardingProjectId,
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

const STEP_META: Record<OnboardingStep, StepMeta> = {
  welcome: {
    label: "Willkommen",
    eyebrow: "Tarlog kennenlernen",
    title: "Zeit erfassen, ohne den Überblick zu verlieren.",
    summary: "Tarlog verbindet laufende Timer, saubere Nachträge und nachvollziehbare Abrechnung in einem lokalen Arbeitsbereich.",
    symbol: "onboarding",
    fallback: CircleHelp,
  },
  workspace: {
    label: "Arbeitsbereich",
    eyebrow: "Kunde & Projekt",
    title: "Richte deinen ersten Arbeitsbereich ein.",
    summary: "Ein Projekt bündelt Zeiten, Beschreibungen und Abrechnungsregeln. Ein Kunde ist optional – interne Projekte funktionieren genauso.",
    symbol: "projects",
    fallback: FolderKanban,
  },
  live_tracking: {
    label: "Live-Timer",
    eyebrow: "Aktive Arbeit",
    title: "Starte dann, wenn die Arbeit beginnt.",
    summary: "Der Timer bleibt in der Toolbar sichtbar. Du kannst ihn jederzeit pausieren, fortsetzen und mit einer Beschreibung sauber abschließen.",
    symbol: "timer",
    fallback: Play,
  },
  backdating: {
    label: "Nachträge",
    eyebrow: "Vergangene Arbeit",
    title: "Vergessene Zeiten bleiben nachvollziehbar.",
    summary: "Im Nachtragsassistenten erfasst du Datum, Zeitraum, Grund und Pausen. Tarlog trennt dabei tatsächliche Zeit und Abrechnungszeit.",
    symbol: "backdating",
    fallback: History,
  },
  sync: {
    label: "Sync",
    eyebrow: "Geräte & Server",
    title: "Lokal ist vollständig. Sync bleibt optional.",
    summary: "Der lokale Desktop-Modus funktioniert ohne Konto und Internet. Einen selbst gehosteten Server kannst du ergänzen, wenn du mehrere Geräte abgleichen möchtest.",
    symbol: "sync",
    fallback: CloudOff,
  },
  ready: {
    label: "Bereit",
    eyebrow: "Einrichtung abgeschlossen",
    title: "Dein Arbeitsbereich ist startklar.",
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
      aria-label={required ? "Tarlog Ersteinrichtung" : "Tarlog Einführung"}
    >
      <header className="onboarding__toolbar" data-tauri-drag-region>
        <div className="onboarding__brand" data-tauri-drag-region>
          <span className="onboarding__brandmark" aria-hidden>
            <img className="brand-mark__image" src={brandMarkUrl} alt="" />
          </span>
          <span data-tauri-drag-region>
            <strong>Tarlog</strong>
            <small>{required ? "Ersteinrichtung" : "Einführung"}</small>
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
              aria-label="Einführung schließen"
              title="Einführung schließen"
            >
              <X size={16} aria-hidden />
            </button>
          ) : null}
        </div>
      </header>

      <div className="onboarding__layout">
        <nav className="onboarding__rail" aria-label="Einführungsschritte">
          <div className="onboarding__rail-heading">
            <span>Einführung</span>
            <strong>{currentIndex + 1} von {ONBOARDING_STEPS.length}</strong>
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
                    <span>{STEP_META[step].label}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <div className="onboarding__rail-note">
            <Laptop size={16} aria-hidden />
            <span>Deine Daten bleiben standardmäßig auf diesem Gerät.</span>
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
                <div className="onboarding__hero-icon" aria-hidden>
                  <StepSymbol step={progress.step} size={28} />
                </div>
                <p className="onboarding__eyebrow">{meta.eyebrow}</p>
                <h1 className="onboarding__title" ref={titleRef} tabIndex={-1}>{meta.title}</h1>
                <p className="onboarding__summary">{meta.summary}</p>

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
              {error ? <ErrorNote error={error} /> : pending ? <Loading label="Wird gesichert …" /> : null}
            </div>
            <div className="onboarding__footer-actions">
              {currentIndex > 0 ? (
                <Button variant="ghost" disabled={pending} onClick={() => void goBack()}>
                  <ChevronLeft size={15} aria-hidden /> Zurück
                </Button>
              ) : !required ? (
                <Button variant="ghost" disabled={pending} onClick={requestDismiss}>Schließen</Button>
              ) : <span />}

              {progress.step === "workspace" ? null : progress.step === "ready" ? (
                <>
                  <Button disabled={pending} onClick={() => void finish("dashboard")}>Zum Dashboard</Button>
                  <Button variant="primary" disabled={pending} onClick={() => void finish("timer")}>
                    Timer öffnen <ChevronRight size={15} aria-hidden />
                  </Button>
                </>
              ) : (
                <Button variant="primary" disabled={pending} onClick={() => void goNext()}>
                  Weiter <ChevronRight size={15} aria-hidden />
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
      <Feature title="Local first" copy="Ohne Anmeldung, Cloud-Zwang oder dauerhafte Internetverbindung." icon={Laptop} />
      <Feature title="Echte Zeit" copy="Ist-Zeit und gerundete Abrechnungszeit bleiben getrennt nachvollziehbar." icon={RotateCcw} />
      <Feature title="Zwei Wege" copy="Laufende Arbeit mit dem Timer, Vergangenes über einen begründeten Nachtrag." icon={History} />
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
  const [billingType, setBillingType] = useState<"hourly" | "non_billable">("hourly");
  const [hourlyRate, setHourlyRate] = useState("");
  const projectSelectionResolved = useRef(false);
  const submittingRef = useRef(false);
  const availableProjects = projects.data ?? [];

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
    return <div className="onboarding-form"><Loading label="Projekte werden geladen …" /></div>;
  }

  async function continueExisting() {
    if (pending) return;
    const project = projectById.get(selectedProjectId);
    if (!project) {
      onError("Bitte wähle ein bestehendes Projekt aus.");
      return;
    }
    await onContinue({ projectId: project.id, customerId: project.customer_id ?? null });
  }

  async function createWorkspace() {
    if (pending || submittingRef.current) return;
    onError(null);
    if (!projectName.trim()) {
      onError("Projektname ist erforderlich.");
      return;
    }
    const hourlyRateCents = billingType === "hourly" ? toCents(hourlyRate) : null;
    if (hourlyRateCents === undefined) {
      onError("Bitte gib den Stundensatz als Zahl mit höchstens zwei Nachkommastellen ein.");
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
        hourly_rate_cents: hourlyRateCents,
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
        <div className="onboarding-choice" role="group" aria-label="Projektquelle">
          <button
            type="button"
            className={mode === "existing" ? "is-active" : ""}
            aria-pressed={mode === "existing"}
            disabled={pending}
            onClick={() => setMode("existing")}
          >
            Bestehendes Projekt
          </button>
          <button
            type="button"
            className={mode === "new" ? "is-active" : ""}
            aria-pressed={mode === "new"}
            disabled={pending}
            onClick={() => setMode("new")}
          >
            Neues Projekt
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
          <Field label="Projekt" required>
            <Select value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.currentTarget.value)} autoFocus>
              <option value="">Projekt auswählen …</option>
              {availableProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </Select>
          </Field>
          <p className="onboarding-form__hint">Die Einführung verändert das ausgewählte Projekt nicht.</p>
          <Button type="submit" variant="primary" disabled={pending || !selectedProjectId}>
            Projekt verwenden <ChevronRight size={15} aria-hidden />
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
          {progress.customerId ? (
            <div className="onboarding-success-line" role="status"><Check size={15} aria-hidden /> Kunde wurde angelegt und wird weiterverwendet.</div>
          ) : (
            <FormRow>
              <Field label="Bestehender Kunde" hint="optional">
                <Select value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.currentTarget.value)}>
                  <option value="">Kein Kunde · internes Projekt</option>
                  {(customers.data ?? []).map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </Select>
              </Field>
              <Field label="Oder neuer Kunde" hint="optional">
                <TextInput value={customerName} onChange={(event) => setCustomerName(event.currentTarget.value)} placeholder="z. B. Muster GmbH" disabled={Boolean(selectedCustomerId)} />
              </Field>
            </FormRow>
          )}

          <Field label="Projektname" required>
            <TextInput value={projectName} onChange={(event) => setProjectName(event.currentTarget.value)} placeholder="z. B. Website-Relaunch" autoFocus />
          </Field>
          <FormRow>
            <Field label="Abrechnung">
              <Select value={billingType} onChange={(event) => setBillingType(event.currentTarget.value as "hourly" | "non_billable")}>
                <option value="hourly">Stundensatz</option>
                <option value="non_billable">Nicht abrechenbar</option>
              </Select>
            </Field>
            <Field label="Stundensatz (€)" hint="optional">
              <TextInput
                inputMode="decimal"
                value={hourlyRate}
                onChange={(event) => setHourlyRate(event.currentTarget.value)}
                placeholder="0,00"
                disabled={billingType !== "hourly"}
              />
            </Field>
          </FormRow>
          <Button type="submit" variant="primary" disabled={pending || !projectName.trim()}>
            Projekt anlegen <ChevronRight size={15} aria-hidden />
          </Button>
        </form>
      )}
    </div>
  );
}

function LiveTrackingStep() {
  return (
    <div className="onboarding-demo" aria-label="Ablauf eines Live-Timers">
      <ProcessItem number="1" title="Projekt wählen" copy="Ordne die Bearbeitung deinem Projekt zu und ergänze, woran du arbeitest." symbol="timerPlay" fallback={Play} />
      <ProcessItem number="2" title="Pausieren & fortsetzen" copy="Pausen werden getrennt erfasst und von der Nettozeit abgezogen." symbol="timerPause" fallback={Pause} />
      <ProcessItem number="3" title="Stoppen & speichern" copy="Beim Abschluss prüfst du Beschreibung, Endzeit und die Rundungsvorschau." symbol="timerStop" fallback={Square} />
      <div className="onboarding-callout">
        <span className="onboarding-callout__pulse" aria-hidden />
        <div><strong>Immer erreichbar</strong><p>Der kompakte Timer oben in der App zeigt Status und Laufzeit in jedem Bereich.</p></div>
      </div>
    </div>
  );
}

function BackdatingStep() {
  return (
    <div className="onboarding-demo">
      <div className="onboarding-timeline" aria-hidden>
        <span>09:00</span><i /><strong>Konzeptarbeit</strong><i /><span>11:30</span>
      </div>
      <div className="onboarding-detail-list">
        <div><strong>Zeitraum</strong><span>Datum, Start, Ende und Pausen</span></div>
        <div><strong>Begründung</strong><span>z. B. Timer vergessen, Meeting oder Offline-Arbeit</span></div>
        <div><strong>Vorschau</strong><span>Nettozeit und Abrechnungsrundung vor dem Speichern</span></div>
      </div>
      <p className="onboarding-caption">Nachträge werden als solche markiert und bleiben im Audit-Verlauf nachvollziehbar.</p>
    </div>
  );
}

function SyncStep() {
  return (
    <div className="onboarding-sync-options">
      <article className="onboarding-sync-card is-supported">
        <span className="onboarding-sync-card__icon"><CloudOff size={20} aria-hidden /></span>
        <div><span className="tag tag--accent">Standard</span><h2>Nur auf diesem Gerät</h2></div>
        <p>Voll unterstützt. Kunden, Projekte und Zeiten liegen in deiner lokalen SQLite-Datenbank; Backups kannst du in den Einstellungen erstellen.</p>
        <ul><li>Kein Server erforderlich</li><li>Keine Anmeldung</li><li>Offline vollständig nutzbar</li></ul>
      </article>
      <article className="onboarding-sync-card">
        <span className="onboarding-sync-card__icon"><RotateCcw size={20} aria-hidden /></span>
        <div><span className="tag tag--muted">Experimentell</span><h2>Eigener Tarlog-Server</h2></div>
        <p>Die Webanwendung kann selbst gehostet werden. Der native Desktop-Abgleich über Pairing, Event-Log und Live-Kanal befindet sich noch in Erprobung.</p>
        <ul><li>Server bleibt unter deiner Kontrolle</li><li>WebSocket mit Polling-Fallback vorgesehen</li><li>Keine Verbindung wird jetzt automatisch hergestellt</li></ul>
      </article>
      <p className="onboarding-caption">Du kannst den Betriebsmodus später jederzeit im Bereich „Sync“ prüfen. Lokal erfasste Daten bleiben dabei erhalten.</p>
    </div>
  );
}

function ReadyStep({ progress }: { progress: OnboardingProgress }) {
  return (
    <div className="onboarding-ready">
      <div className="onboarding-ready__check" aria-hidden><Check size={32} strokeWidth={2.2} /></div>
      <div>
        <h2>Projekt vorbereitet</h2>
        <p>{progress.customerId ? "Kunde und Projekt sind angelegt." : "Dein Projekt ist angelegt und kann sofort verwendet werden."}</p>
      </div>
      <div className="onboarding-detail-list">
        <div><strong>Live arbeiten</strong><span>Timer öffnen, Projekt wählen und starten</span></div>
        <div><strong>Vergangenes erfassen</strong><span>„Nachträge“ in der Seitenleiste öffnen</span></div>
        <div><strong>Einführung wiederholen</strong><span>Über „Einführung“ unten in der Seitenleiste</span></div>
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

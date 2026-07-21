"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FolderKanban,
  History,
  Laptop,
  Pause,
  Play,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Square,
  UserRoundPlus,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ONBOARDING_STEPS,
  nextOnboardingStep,
  onboardingStepIndex,
  previousOnboardingStep,
  type OnboardingLaunch,
  type OnboardingStep,
} from "@tarlog/core";
import { AppearanceControl } from "@/lib/ui/AppearanceControl";
import { BrandMark } from "@/lib/ui/BrandMark";
import {
  API,
  ApiClientError,
  api,
} from "@/lib/ui/api";
import {
  Button,
  Checkbox,
  Field,
  FormRow,
  Select,
  StatusLine,
  TextInput,
} from "@/lib/ui/controls";

interface CustomerOption {
  id: string;
  name: string;
  company: string | null;
}

interface ProjectOption {
  id: string;
  name: string;
  customerId: string | null;
  customerName: string | null;
  billingType: string;
}

interface RuleOption {
  id: string;
  name: string;
}

interface WorkspaceCreationResult {
  launch: OnboardingLaunch;
  customer: CustomerOption | null;
  project: ProjectOption;
}

interface WizardProps {
  accountName: string;
  currency: string;
  launch: OnboardingLaunch;
  replay: boolean;
  customers: CustomerOption[];
  projects: ProjectOption[];
  rules: RuleOption[];
}

const STEP_META: Record<OnboardingStep, { label: string; title: string; icon: LucideIcon }> = {
  welcome: { label: "Willkommen", title: "Zeit, die sich nachvollziehen lässt.", icon: Sparkles },
  workspace: { label: "Arbeitsbereich", title: "Womit möchtest du beginnen?", icon: FolderKanban },
  live_tracking: { label: "Live-Timer", title: "Aktive Arbeit bleibt im Blick.", icon: Clock3 },
  backdating: { label: "Nachtragen", title: "Vergangene Arbeit sauber erfassen.", icon: History },
  sync: { label: "Sync", title: "Deine Daten, auf deinen Geräten.", icon: RefreshCw },
  ready: { label: "Fertig", title: "Tarlog ist bereit.", icon: CheckCircle2 },
};

const BILLING_LABEL: Record<string, string> = {
  hourly: "Stundenweise",
  day_rate: "Tagessatz",
  fixed_fee: "Festpreis",
  retainer: "Retainer",
  non_billable: "Nicht abrechenbar",
};

function eurosToCents(value: string): number | null | undefined {
  const normalized = value.trim();
  if (!normalized) return null;
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(normalized)) return undefined;
  const amount = Number(normalized.replace(",", "."));
  if (!Number.isFinite(amount) || amount > Number.MAX_SAFE_INTEGER / 100) return undefined;
  return Math.round(amount * 100);
}

function errorMessage(error: unknown): string {
  return error instanceof ApiClientError ? error.message : "Die Änderung konnte nicht gespeichert werden.";
}

export function OnboardingWizard({
  accountName,
  currency,
  launch,
  replay,
  customers: initialCustomers,
  projects: initialProjects,
  rules,
}: WizardProps): React.JSX.Element {
  const replayingCompleted = replay && launch.progress.status === "completed";
  const [step, setStep] = useState<OnboardingStep>(
    replayingCompleted ? "welcome" : launch.progress.step,
  );
  const [projectId, setProjectId] = useState(launch.progress.projectId);
  const [customerId, setCustomerId] = useState(launch.progress.customerId);
  const [customers, setCustomers] = useState(initialCustomers);
  const [projects, setProjects] = useState(initialProjects);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.focus({ preventScroll: true });
    errorRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
    });
  }, [error, reduceMotion]);

  function closeReplay(): void {
    if (!busy) window.location.assign("/dashboard");
  }

  function acceptWorkspaceCreation(result: WorkspaceCreationResult): void {
    const createdCustomer = result.customer;
    if (createdCustomer) {
      setCustomers((current) => [
        ...current.filter((item) => item.id !== createdCustomer.id),
        createdCustomer,
      ]);
    }
    setProjects((current) => [
      ...current.filter((item) => item.id !== result.project.id),
      result.project,
    ]);
    setCustomerId(result.project.customerId);
    setProjectId(result.project.id);
    setStep(replayingCompleted ? "live_tracking" : result.launch.progress.step);
  }

  async function persistStep(
    nextStep: OnboardingStep,
    ids?: { customerId?: string | null; projectId?: string | null },
  ): Promise<boolean> {
    setError(null);
    if (replayingCompleted) {
      setStep(nextStep);
      if (ids?.customerId !== undefined) setCustomerId(ids.customerId);
      if (ids?.projectId !== undefined) setProjectId(ids.projectId);
      return true;
    }

    setBusy(true);
    try {
      const result = await api.patch<OnboardingLaunch>(API.onboarding, {
        action: "progress",
        step: nextStep,
        ...ids,
      });
      setStep(result.progress.step);
      setCustomerId(result.progress.customerId);
      setProjectId(result.progress.projectId);
      return true;
    } catch (caught) {
      setError(errorMessage(caught));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function goBack(): Promise<void> {
    if (step === "welcome") return;
    await persistStep(previousOnboardingStep(step));
  }

  async function goForward(): Promise<void> {
    await persistStep(nextOnboardingStep(step));
  }

  async function finish(): Promise<void> {
    if (replayingCompleted) {
      window.location.assign("/dashboard");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.patch(API.onboarding, { action: "complete" });
      window.location.assign("/dashboard");
    } catch (caught) {
      setError(errorMessage(caught));
      setBusy(false);
    }
  }

  const meta = STEP_META[step];
  const StepIcon = meta.icon;
  const project = projects.find((item) => item.id === projectId) ?? null;

  return (
    <main className="onboarding-shell">
      <aside className="onboarding-sidebar material-heavy" aria-label="Einrichtungsfortschritt">
        <div className="onboarding-brand">
          <BrandMark />
          <span><strong>Tarlog</strong><small>Einführung</small></span>
        </div>
        <ol className="onboarding-progress">
          {ONBOARDING_STEPS.map((item, index) => {
            const active = item === step;
            const passed = index < onboardingStepIndex(step);
            const ItemIcon = STEP_META[item].icon;
            return (
              <li key={item} className={`${active ? "is-active" : ""}${passed ? " is-passed" : ""}`}>
                <span className="onboarding-progress-icon" aria-hidden>
                  {passed ? <Check size={15} /> : <ItemIcon size={16} />}
                </span>
                <span>{STEP_META[item].label}</span>
                {active ? <span className="sr-only">Aktueller Schritt</span> : null}
              </li>
            );
          })}
        </ol>
        <div className="onboarding-sidebar-footer">
          <AppearanceControl />
          {replay ? (
            <button
              type="button"
              className="onboarding-close-link"
              onClick={closeReplay}
              disabled={busy}
            >
              Einführung schließen
            </button>
          ) : null}
        </div>
      </aside>

      <section className="onboarding-workspace" aria-live="polite" aria-busy={busy}>
        <header className="onboarding-mobile-toolbar material-heavy">
          <div className="onboarding-mobile-brand"><BrandMark /><strong>Tarlog</strong></div>
          <span className="onboarding-mobile-step">
            {onboardingStepIndex(step) + 1} von {ONBOARDING_STEPS.length}
          </span>
          <div className="onboarding-mobile-actions">
            <AppearanceControl variant="compact" />
            {replay ? (
              <button
                type="button"
                className="onboarding-mobile-close"
                onClick={closeReplay}
                disabled={busy}
                aria-label="Einführung schließen"
              >
                <X size={18} aria-hidden />
              </button>
            ) : null}
          </div>
        </header>

        <div className="onboarding-content-wrap">
          <div className="onboarding-step-heading">
            <span className="onboarding-step-symbol" aria-hidden><StepIcon size={23} /></span>
            <div>
              <div className="onboarding-eyebrow">{meta.label}</div>
              <h1 ref={headingRef} tabIndex={-1}>{meta.title}</h1>
            </div>
          </div>

          <span className="sr-only" role="status">
            {busy ? "Änderung wird gespeichert …" : ""}
          </span>
          {error ? (
            <div ref={errorRef} tabIndex={-1} className="onboarding-error-focus">
              <StatusLine kind="error">{error}</StatusLine>
            </div>
          ) : null}

          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={step}
              className="onboarding-stage"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, x: -8 }}
              transition={reduceMotion ? { duration: 0.14 } : { type: "spring", bounce: 0, duration: 0.34 }}
            >
              {step === "welcome" ? <WelcomeStep accountName={accountName} /> : null}
              {step === "workspace" ? (
                <WorkspaceStep
                  currency={currency}
                  customers={customers}
                  projects={projects}
                  rules={rules}
                  initialProjectId={projectId}
                  initialCustomerId={customerId}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onCreated={acceptWorkspaceCreation}
                  onPersist={persistStep}
                />
              ) : null}
              {step === "live_tracking" ? <LiveTrackingStep project={project} /> : null}
              {step === "backdating" ? <BackdatingStep project={project} /> : null}
              {step === "sync" ? <SyncStep /> : null}
              {step === "ready" ? <ReadyStep project={project} /> : null}
            </motion.div>
          </AnimatePresence>

          {step !== "workspace" ? (
            <footer className="onboarding-actions">
              <Button variant="ghost" onClick={() => void goBack()} disabled={busy || step === "welcome"}>
                <ArrowLeft size={16} aria-hidden /> Zurück
              </Button>
              {step === "ready" ? (
                <Button variant="primary" onClick={() => void finish()} disabled={busy}>
                  {busy ? "Wird gespeichert …" : replayingCompleted ? "Zurück zur App" : "Zum Dashboard"} <ArrowRight size={16} aria-hidden />
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void goForward()} disabled={busy}>
                  {busy ? "Wird gespeichert …" : "Weiter"} <ArrowRight size={16} aria-hidden />
                </Button>
              )}
            </footer>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function WelcomeStep({ accountName }: { accountName: string }): React.JSX.Element {
  return (
    <div className="onboarding-copy-stack">
      <p className="onboarding-lead">
        Willkommen, {accountName}. Tarlog verbindet laufende Zeiterfassung,
        nachvollziehbare Nachträge und Abrechnung in einem ruhigen Arbeitsbereich.
      </p>
      <div className="onboarding-feature-grid">
        <Feature icon={Clock3} title="Aktiv protokollieren">Timer starten, pausieren und mit einer klaren Beschreibung abschließen.</Feature>
        <Feature icon={History} title="Vergangenes nachtragen">Fehlende Zeit bleibt als manueller Nachtrag erkennbar und wird auditiert.</Feature>
        <Feature icon={ShieldCheck} title="Unter deiner Kontrolle">Keine Telemetrie und kein fremder Cloud-Zwang. Dieser Server gehört dir.</Feature>
      </div>
      <p className="onboarding-note">Die Einführung legt keine Beispielzeiten an. Du entscheidest selbst, was gespeichert wird.</p>
    </div>
  );
}

function Feature({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <div className="onboarding-feature">
      <Icon size={20} aria-hidden />
      <strong>{title}</strong>
      <p>{children}</p>
    </div>
  );
}

function WorkspaceStep({
  currency,
  customers,
  projects,
  rules,
  initialProjectId,
  initialCustomerId,
  busy,
  setBusy,
  setError,
  onCreated,
  onPersist,
}: {
  currency: string;
  customers: CustomerOption[];
  projects: ProjectOption[];
  rules: RuleOption[];
  initialProjectId: string | null;
  initialCustomerId: string | null;
  busy: boolean;
  setBusy: (value: boolean) => void;
  setError: (value: string | null) => void;
  onCreated: (result: WorkspaceCreationResult) => void;
  onPersist: (
    step: OnboardingStep,
    ids?: { customerId?: string | null; projectId?: string | null },
  ) => Promise<boolean>;
}): React.JSX.Element {
  const [mode, setMode] = useState<"existing" | "new">(projects.length > 0 ? "existing" : "new");
  const [existingProjectId, setExistingProjectId] = useState(initialProjectId ?? projects[0]?.id ?? "");
  const [customerChoice, setCustomerChoice] = useState(initialCustomerId ?? "");
  const [customerName, setCustomerName] = useState("");
  const [customerCompany, setCustomerCompany] = useState("");
  const [projectName, setProjectName] = useState("");
  const [billingType, setBillingType] = useState("hourly");
  const [projectRate, setProjectRate] = useState("");
  const [roundingRuleId, setRoundingRuleId] = useState("");
  const [descriptionRequired, setDescriptionRequired] = useState(false);
  const submittingRef = useRef(false);

  const createsCustomer = customerChoice === "new";
  const rateDisabled = billingType === "non_billable" || billingType === "retainer";
  const rateLabel = billingType === "day_rate"
    ? `Tagessatz (${currency})`
    : billingType === "fixed_fee"
      ? `Festpreis (${currency})`
      : `Stundensatz (${currency})`;

  async function useExistingProject(): Promise<void> {
    const selected = projects.find((project) => project.id === existingProjectId);
    if (!selected) {
      setError("Wähle ein bestehendes Projekt aus.");
      return;
    }
    await onPersist("live_tracking", {
      projectId: selected.id,
      customerId: selected.customerId,
    });
  }

  async function createWorkspace(): Promise<void> {
    if (submittingRef.current) return;
    if (!projectName.trim()) {
      setError("Gib deinem ersten Projekt einen Namen.");
      return;
    }
    if (createsCustomer && !customerName.trim()) {
      setError("Gib dem neuen Kunden einen Namen oder wähle „Intern / kein Kunde“.");
      return;
    }

    const projectCents = rateDisabled ? null : eurosToCents(projectRate);
    if (projectCents === undefined) {
      setError(`Gib ${rateLabel.toLowerCase()} als Zahl mit höchstens zwei Nachkommastellen ein.`);
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<WorkspaceCreationResult>(API.onboarding, {
        customerId: customerChoice && customerChoice !== "new" ? customerChoice : null,
        customer: createsCustomer
          ? {
              name: customerName.trim(),
              company: customerCompany.trim() || null,
              defaultCurrency: currency,
            }
          : null,
        project: {
          name: projectName.trim(),
          billingType,
          hourlyRateCents: billingType === "hourly" ? projectCents : null,
          dayRateCents: billingType === "day_rate" ? projectCents : null,
          fixedFeeCents: billingType === "fixed_fee" ? projectCents : null,
          roundingRuleId: roundingRuleId || null,
          descriptionRequired,
        },
      });
      if (result.customer) setCustomerChoice(result.customer.id);
      setExistingProjectId(result.project.id);
      setMode("existing");
      onCreated(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="onboarding-workspace-form">
      <p className="onboarding-lead compact">
        Ein Projekt bündelt Timer, Nachträge und Abrechnung. Ein Kunde ist optional, interne Arbeit funktioniert genauso.
      </p>

      {projects.length > 0 ? (
        <div className="onboarding-segmented" role="group" aria-label="Projektwahl">
          <button type="button" aria-pressed={mode === "existing"} className={mode === "existing" ? "is-selected" : ""} onClick={() => setMode("existing")}>Bestehendes Projekt</button>
          <button type="button" aria-pressed={mode === "new"} className={mode === "new" ? "is-selected" : ""} onClick={() => setMode("new")}>Neues Projekt</button>
        </div>
      ) : null}

      {mode === "existing" && projects.length > 0 ? (
        <form
          className="onboarding-solid-form"
          onSubmit={(event) => {
            event.preventDefault();
            void useExistingProject();
          }}
        >
          <Field label="Projekt" required>
            <Select value={existingProjectId} onChange={(event) => setExistingProjectId(event.target.value)}>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}{project.customerName ? ` | ${project.customerName}` : " | intern"}
                </option>
              ))}
            </Select>
          </Field>
          <div className="onboarding-form-actions">
            <Button type="button" variant="ghost" onClick={() => void onPersist("welcome")} disabled={busy}><ArrowLeft size={16} /> Zurück</Button>
            <Button type="submit" variant="primary" disabled={busy || !existingProjectId}>{busy ? "Wird gespeichert …" : "Projekt verwenden"} <ArrowRight size={16} /></Button>
          </div>
        </form>
      ) : (
        <form
          className="onboarding-solid-form"
          onSubmit={(event) => {
            event.preventDefault();
            void createWorkspace();
          }}
        >
          <Field label="Kunde (optional)" hint="Wähle „Intern“, wenn du keinen Kunden zuordnen möchtest.">
            <Select value={customerChoice} onChange={(event) => setCustomerChoice(event.target.value)}>
              <option value="">Intern / kein Kunde</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
              <option value="new">＋ Neuen Kunden anlegen</option>
            </Select>
          </Field>

          {createsCustomer ? (
            <div className="onboarding-subform">
              <div className="onboarding-subform-title"><UserRoundPlus size={17} aria-hidden /> Neuer Kunde</div>
              <FormRow>
                <Field label="Kundenname" required><TextInput value={customerName} onChange={(event) => setCustomerName(event.target.value)} autoFocus /></Field>
                <Field label="Firma"><TextInput value={customerCompany} onChange={(event) => setCustomerCompany(event.target.value)} /></Field>
              </FormRow>
            </div>
          ) : null}

          <div className="onboarding-subform">
            <div className="onboarding-subform-title"><FolderKanban size={17} aria-hidden /> Erstes Projekt</div>
            <Field label="Projektname" required>
              <TextInput value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="z. B. Website-Relaunch" />
            </Field>
            <FormRow>
              <Field label="Abrechnungsart">
                <Select value={billingType} onChange={(event) => setBillingType(event.target.value)}>
                  {Object.entries(BILLING_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </Select>
              </Field>
              <Field label={rateLabel} hint={rateDisabled ? "Für diese Abrechnungsart nicht nötig." : undefined}>
                <TextInput inputMode="decimal" value={projectRate} onChange={(event) => setProjectRate(event.target.value)} disabled={rateDisabled} placeholder="z. B. 95,00" />
              </Field>
            </FormRow>
            <Field label="Rundungsregel" hint="Der Server hat bereits eine 15-Minuten-Standardregel angelegt.">
              <Select value={roundingRuleId} onChange={(event) => setRoundingRuleId(event.target.value)}>
                <option value="">Globaler Standard</option>
                {rules.map((rule) => <option key={rule.id} value={rule.id}>{rule.name}</option>)}
              </Select>
            </Field>
            <Checkbox label="Beim Stoppen eine Tätigkeitsbeschreibung verlangen" checked={descriptionRequired} onChange={(event) => setDescriptionRequired(event.target.checked)} />
          </div>

          <div className="onboarding-form-actions">
            <Button type="button" variant="ghost" onClick={() => void onPersist("welcome")} disabled={busy}><ArrowLeft size={16} /> Zurück</Button>
            <Button type="submit" variant="primary" disabled={busy || !projectName.trim()}>
              {busy ? "Wird angelegt …" : "Arbeitsbereich anlegen"} <ArrowRight size={16} />
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function LiveTrackingStep({ project }: { project: ProjectOption | null }): React.JSX.Element {
  return (
    <div className="onboarding-copy-stack">
      <p className="onboarding-lead compact">
        Im Timer wählst du <strong>{project?.name ?? "dein Projekt"}</strong> und startest mit einem Klick. Der aktuelle Zustand bleibt in der Navigation sichtbar.
      </p>
      <div className="onboarding-demo timer-demo" aria-label="Vorschau des Timer-Ablaufs">
        <div className="onboarding-demo-header"><span>{project?.name ?? "Projekt"}</span><strong className="tabular">00:42:18</strong></div>
        <div className="onboarding-timeline">
          <DemoAction icon={Play} label="Starten" text="Projekt und optionale Aufgabe wählen." active />
          <DemoAction icon={Pause} label="Pausieren" text="Pausen zählen nicht zur Nettozeit." />
          <DemoAction icon={Square} label="Stoppen" text="Tätigkeit beschreiben und Abrechnung prüfen." />
        </div>
      </div>
      <div className="onboarding-callout">
        <ShieldCheck size={18} aria-hidden />
        <span>Ist-Zeit und gerundete Abrechnungszeit bleiben getrennt. Vor dem Speichern siehst du beides.</span>
      </div>
    </div>
  );
}

function DemoAction({ icon: Icon, label, text, active = false }: { icon: LucideIcon; label: string; text: string; active?: boolean }): React.JSX.Element {
  return (
    <div className={`onboarding-demo-action${active ? " is-active" : ""}`}>
      <span><Icon size={17} aria-hidden /></span>
      <div><strong>{label}</strong><small>{text}</small></div>
    </div>
  );
}

function BackdatingStep({ project }: { project: ProjectOption | null }): React.JSX.Element {
  return (
    <div className="onboarding-copy-stack">
      <p className="onboarding-lead compact">
        Timer vergessen? „Nachtragen“ erfasst Start, Ende und Pause für <strong>{project?.name ?? "ein Projekt"}</strong>, ohne die Herkunft zu verschleiern.
      </p>
      <div className="onboarding-demo backdate-demo">
        <div className="backdate-fields" aria-hidden>
          <span><small>Datum</small><strong>Heute</strong></span>
          <span><small>Start</small><strong>09:00</strong></span>
          <span><small>Ende</small><strong>10:30</strong></span>
        </div>
        <div className="backdate-result"><History size={19} /><span><strong>1:30 h Ist-Zeit</strong><small>Quelle: manuell nachgetragen</small></span></div>
      </div>
      <div className="onboarding-feature-grid compact-grid">
        <Feature icon={History} title="Erkennbar">Nachträge bleiben in Listen, PDF und Audit-Log gekennzeichnet.</Feature>
        <Feature icon={ShieldCheck} title="Nachvollziehbar">Grund, Beschreibung und Korrekturen werden bewusst bestätigt.</Feature>
      </div>
    </div>
  );
}

function SyncStep(): React.JSX.Element {
  return (
    <div className="onboarding-copy-stack">
      <p className="onboarding-lead compact">
        Diese Browser-App arbeitet bereits direkt auf deinem selbst gehosteten Tarlog-Server. Änderungen sind nach dem Speichern auf demselben Server verfügbar.
      </p>
      <div className="onboarding-sync-map" aria-label="Synchronisierungsablauf">
        <div><Laptop size={22} /><strong>Browser</strong><small>dieser Server</small></div>
        <span className="sync-map-line" aria-hidden><ArrowRight size={19} /></span>
        <div className="is-server"><RefreshCw size={22} /><strong>Tarlog Server</strong><small>PostgreSQL + Live-Kanal</small></div>
        <span className="sync-map-line is-muted" aria-hidden><ArrowRight size={19} /></span>
        <div className="is-experimental"><Laptop size={22} /><strong>Desktop</strong><small>experimentell</small></div>
      </div>
      <StatusLine kind="info">
        Die native Desktop-Verbindung ist derzeit experimentell. Lokale Desktop-Daten bleiben offline verfügbar; richte Sync erst ein, wenn du den Server bewusst verbinden möchtest.
      </StatusLine>
      <p className="onboarding-note">Nach der Einführung findest du Gerätestatus, Konflikte und Widerruf unter „Synchronisierung“.</p>
    </div>
  );
}

function ReadyStep({ project }: { project: ProjectOption | null }): React.JSX.Element {
  const summary = useMemo(() => [
    { label: "Projekt", value: project?.name ?? "ausgewählt" },
    { label: "Timer", value: "bereit" },
    { label: "Nachträge", value: "erklärt" },
    { label: "Sync", value: "Server aktiv" },
  ], [project]);
  return (
    <div className="onboarding-copy-stack">
      <p className="onboarding-lead">Dein Arbeitsbereich ist eingerichtet. Auf dem Dashboard startest du den Timer oder öffnest einen Nachtrag.</p>
      <div className="onboarding-ready-list">
        {summary.map((item) => (
          <div key={item.label}><CheckCircle2 size={18} aria-hidden /><span><small>{item.label}</small><strong>{item.value}</strong></span></div>
        ))}
      </div>
      <p className="onboarding-note">Du kannst diese Einführung später jederzeit über „Einführung“ in der Navigation erneut öffnen.</p>
    </div>
  );
}

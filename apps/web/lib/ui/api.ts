/**
 * lib/ui/api.ts — Client-Fetch-Helfer + kanonische API-Pfade.
 *
 * Mutationen (Formulare, Timer-Steuerung) laufen über REST gegen die
 * `/api/**`-Routen der anderen Module. Diese Datei kennt NUR die Pfad-Namen
 * (Vertrag) und ein einheitliches Fehler-Handling passend zu lib/api.ts
 * (`{ error: { code, message, details } }`). Lesen passiert wo möglich direkt
 * serverseitig (lib/ui/queries.ts) — hier steht die Schreib-/Live-Seite.
 *
 * Isomorph nutzbar (global `fetch`); in Server-Components wird i. d. R. nicht
 * gefetcht, sondern die DB gelesen.
 */

/** Fehler aus einer API-Antwort im einheitlichen Format (lib/api.ts §5). */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

/**
 * `fetch`-Wrapper: JSON rein/raus, wirft `ApiClientError` bei !ok. `credentials:
 * "same-origin"` trägt das Session-Cookie (Browser-Auth, lib/session.ts).
 */
export async function apiFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const text = await res.text();
  const body: unknown = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const err = (body as ApiErrorBody | undefined)?.error;
    throw new ApiClientError(
      err?.code ?? "http_error",
      err?.message ?? `Anfrage fehlgeschlagen (${res.status}).`,
      res.status,
      err?.details,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Bequeme Verben. `body` wird zu JSON serialisiert. */
export const api = {
  get: <T = unknown>(path: string) => apiFetch<T>(path, { method: "GET" }),
  post: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: body == null ? undefined : JSON.stringify(body) }),
  patch: <T = unknown>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: "PATCH", body: body == null ? undefined : JSON.stringify(body) }),
  del: <T = unknown>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};

/**
 * Kanonische API-Pfade (Vertrag mit den übrigen Modulen). Namen spiegeln die
 * Entitäten/Events aus dem Scaffold (timer.*, time_entry.*, invoice.*,
 * export.*, sync.*, device.*). Die konkreten Route-Handler liefern die
 * jeweiligen Modul-Autoren unter app/api/**.
 */
export const API = {
  // Timer (doc 03 §2)
  timerState: "/api/timer",
  timerStart: "/api/timer/start",
  timerPause: "/api/timer/pause",
  timerResume: "/api/timer/resume",
  timerStop: "/api/timer/stop",

  // Zeiteinträge / Nachtrag (doc 03 §7)
  timeEntries: "/api/time-entries",
  timeEntry: (id: string) => `/api/time-entries/${id}`,
  timeEntryBreaks: (id: string) => `/api/time-entries/${id}/breaks`,

  // Stammdaten
  customers: "/api/customers",
  customer: (id: string) => `/api/customers/${id}`,
  projects: "/api/projects",
  project: (id: string) => `/api/projects/${id}`,
  tasks: "/api/tasks",
  task: (id: string) => `/api/tasks/${id}`,

  // Abrechnung (doc 10)
  invoices: "/api/invoices",
  invoice: (id: string) => `/api/invoices/${id}`,
  invoiceFinalize: (id: string) => `/api/invoices/${id}/finalize`,
  invoiceCancel: (id: string) => `/api/invoices/${id}/cancel`,
  invoicePdf: (id: string) => `/api/invoices/${id}/pdf`,

  // Reports & Exporte (doc 10)
  reports: "/api/reports",
  exports: "/api/exports",
  exportDownload: (id: string) => `/api/exports/${id}/download`,

  // Compliance (doc 08)
  compliance: "/api/compliance",
  complianceOverride: (id: string) => `/api/compliance/${id}/override`,

  // Einstellungen (doc 09)
  account: "/api/account",
  settings: "/api/settings",
  roundingRules: "/api/rounding-rules",
  roundingRule: (id: string) => `/api/rounding-rules/${id}`,
  numberRange: "/api/settings/number-range",

  // Sync / Geräte (doc 04)
  syncPoll: "/api/sync/poll",
  syncStatus: "/api/sync/status",
  realtimeToken: "/api/realtime/token",
  devices: "/api/devices",
  device: (id: string) => `/api/devices/${id}`,
} as const;

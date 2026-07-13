/**
 * bridge.ts — THE FRONTEND↔RUST CONTRACT.
 *
 * Typed wrappers around Tauri `invoke()` for every backend command. This file
 * and the matching Rust `#[tauri::command]` stubs in `src-tauri/src/commands.rs`
 * are the single, stable interface between the two halves:
 *   - Frontend authors call ONLY these functions (never `invoke` directly).
 *   - The Rust author fills the command bodies without changing signatures.
 *
 * Conventions (doc 05 §8, mirrored from @tarlog/core):
 *   - Instants: UTC epoch-ms (number). Durations: integer seconds. Money: cents.
 *   - IDs: UUIDv7 strings. Field names match doc 06 EXACTLY.
 *   - Tauri maps JS camelCase invoke args → Rust snake_case params automatically.
 *
 * Return shapes reuse @tarlog/core types so the wire format cannot drift from the
 * shared data model.
 */
import { invoke } from "@tauri-apps/api/core";
import type {
  CustomerInput,
  ProjectInput,
  TimeEntryInput,
  TimerStateInput,
  Uuid,
  EpochMs,
  IanaTimezone,
} from "@tarlog/core";

// ---------------------------------------------------------------------------
// Wire types (rows returned by the backend). They mirror the @tarlog/core input
// types field-for-field — same names, same units — so there is one data model.
// ---------------------------------------------------------------------------

/** A persisted timer singleton (doc 06 A.1 `timer_states`). */
export type TimerState = TimerStateInput;
/** A persisted time entry (doc 06 A.3 `time_entries`). */
export type TimeEntryRow = TimeEntryInput;
/** A persisted customer (doc 06 A.2 `customers`). */
export type CustomerRow = CustomerInput;
/** A persisted project (doc 06 A.2 `projects`). */
export type ProjectRow = ProjectInput;

/** One break block for a backdated entry (doc 06 `time_entry_breaks`). */
export interface BreakSpan {
  started_at: EpochMs;
  ended_at: EpochMs;
}

/** Input for the backdate assistant (doc 03 §7, doc 11 §4.2 nr. 6). */
export interface BackdateEntryInput {
  project_id?: Uuid | null;
  task_id?: Uuid | null;
  customer_id?: Uuid | null;
  /** Actual start, UTC epoch-ms. */
  started_at: EpochMs;
  /** Actual end, UTC epoch-ms. */
  ended_at: EpochMs;
  /** IANA timezone stored on the entry. */
  timezone: IanaTimezone;
  description?: string | null;
  /** `backdateReasonEnum` key (doc 03 §7.2). */
  reason: string;
  breaks?: BreakSpan[];
}

/** Filter for {@link listTimeEntries}. All fields optional. */
export interface TimeEntryFilter {
  /** Range start, UTC epoch-ms (inclusive). */
  from?: EpochMs | null;
  /** Range end, UTC epoch-ms (exclusive). */
  to?: EpochMs | null;
  projectId?: Uuid | null;
  customerId?: Uuid | null;
  limit?: number | null;
  offset?: number | null;
}

/** Result of stopping the timer: updated state + the finalized entry. */
export interface TimerStopResult {
  timer: TimerState;
  entry: TimeEntryRow;
}

/** Result of {@link dbInit}. */
export interface DbInitResult {
  ok: boolean;
  /** Absolute path of the opened SQLite file. */
  path: string;
  /** Current schema/user_version after open. */
  version: number;
}

/** Result of {@link dbMigrate}. */
export interface DbMigrateResult {
  ok: boolean;
  /** Number of migrations applied in this run. */
  applied: number;
  /** Schema version after migrating. */
  version: number;
}

/** Result of {@link runBackup} (doc 09 §, doc 11 §5 nr. 14). */
export interface BackupResult {
  ok: boolean;
  path: string;
  sizeBytes: number;
  createdAt: EpochMs;
  encrypted: boolean;
}

/** App-lock method (doc 09 §6.1). */
export type AppLockMethod = "password" | "biometric";

/** Result of {@link appLockCheck} (doc 09 §6.1: password or macOS Touch ID). */
export interface AppLockResult {
  /** Whether an app lock is configured at all. */
  locked: boolean;
  /** Whether this check unlocked the app. */
  unlocked: boolean;
  method: AppLockMethod;
  /** macOS LocalAuthentication availability; false on unsupported platforms. */
  biometricAvailable: boolean;
}

/** Operating mode (doc 02 §3.1 local vs. §... server/hybrid). */
export type ConnectionMode = "local" | "server";

/** Result of {@link setServerConnection}. */
export interface ServerConnectionResult {
  ok: boolean;
  mode: ConnectionMode;
  baseUrl: string | null;
  connected: boolean;
}

/** Result of a sync push/pull (doc 04). `serverRevision` = new high-water mark. */
export interface SyncResult {
  ok: boolean;
  /** Events pushed (push) or pulled (pull). */
  count: number;
  serverRevision: number;
  /** Conflicts detected in this round (doc 04 §6). */
  conflicts: number;
}

/** Semantic, whitelisted SF Symbols exposed by the macOS native shell. */
export type NativeSystemSymbolKey =
  | "dashboard"
  | "timer"
  | "today"
  | "week"
  | "customers"
  | "projects"
  | "tasks"
  | "reports"
  | "invoices"
  | "backdating"
  | "compliance"
  | "settings"
  | "sync"
  | "onboarding"
  | "sidebarToggle"
  | "timerPlay"
  | "timerPause"
  | "timerStop"
  | "themeSystem"
  | "themeLight"
  | "themeDark";

/** In-memory, macOS-only symbol masks. Missing keys use React fallbacks. */
export interface NativeSystemSymbolSet {
  supported: boolean;
  symbols: Partial<Record<NativeSystemSymbolKey, string>>;
  missing: NativeSystemSymbolKey[];
}

/** Snapshot used to gate native application-menu and tray timer mutations. */
export interface NativeTimerCommandState {
  status: TimerState["status"] | null;
  pending: boolean;
  ready: boolean;
}

// ---------------------------------------------------------------------------
// Command wrappers — one per registered Rust command. Function names are
// camelCase; the invoked command string is the snake_case contract name.
// ---------------------------------------------------------------------------

/** `db_init` — open/create the local SQLite DB at the app-data path. */
export function dbInit(): Promise<DbInitResult> {
  return invoke<DbInitResult>("db_init");
}

/** `db_migrate` — apply pending Drizzle migrations to the local DB. */
export function dbMigrate(): Promise<DbMigrateResult> {
  return invoke<DbMigrateResult>("db_migrate");
}

/** `timer_start` — start the singleton timer (doc 03, doc 06 `timer_states`). */
export function timerStart(args: {
  projectId?: Uuid | null;
  taskId?: Uuid | null;
  description?: string | null;
  /** Override start instant; defaults to now on the backend. */
  startedAt?: EpochMs | null;
}): Promise<TimerState> {
  return invoke<TimerState>("timer_start", args);
}

/** `timer_pause` — pause the running timer. */
export function timerPause(args: { at?: EpochMs | null } = {}): Promise<TimerState> {
  return invoke<TimerState>("timer_pause", args);
}

/** `timer_resume` — resume a paused timer. */
export function timerResume(args: { at?: EpochMs | null } = {}): Promise<TimerState> {
  return invoke<TimerState>("timer_resume", args);
}

/** `timer_stop` — stop the timer and finalize the entry (Stop-Dialog, doc 03). */
export function timerStop(args: {
  description?: string | null;
  at?: EpochMs | null;
} = {}): Promise<TimerStopResult> {
  return invoke<TimerStopResult>("timer_stop", args);
}

/** `timer_get_state` — read the current timer singleton (crash-safe recovery). */
export function timerGetState(): Promise<TimerState> {
  return invoke<TimerState>("timer_get_state");
}

/** `entry_backdate` — create a manually backdated entry (doc 03 §7). */
export function entryBackdate(input: BackdateEntryInput): Promise<TimeEntryRow> {
  return invoke<TimeEntryRow>("entry_backdate", { input });
}

/** `list_time_entries` — query entries by range/project/customer. */
export function listTimeEntries(
  filter: TimeEntryFilter = {},
): Promise<TimeEntryRow[]> {
  // Spread into a fresh object literal so the arg satisfies Tauri's InvokeArgs
  // (a named interface lacks the required index signature).
  return invoke<TimeEntryRow[]>("list_time_entries", { ...filter });
}

/** `create_customer` — insert a customer (doc 06 A.2). */
export function createCustomer(input: CustomerInput): Promise<CustomerRow> {
  return invoke<CustomerRow>("create_customer", { input });
}

/** `list_customers` — list customers, optionally filtered by status. */
export function listCustomers(
  args: { status?: string | null } = {},
): Promise<CustomerRow[]> {
  return invoke<CustomerRow[]>("list_customers", args);
}

/** `create_project` — insert a project (doc 06 A.2). */
export function createProject(input: ProjectInput): Promise<ProjectRow> {
  return invoke<ProjectRow>("create_project", { input });
}

/** `list_projects` — list projects, optionally filtered by customer/status. */
export function listProjects(
  args: { customerId?: Uuid | null; status?: string | null } = {},
): Promise<ProjectRow[]> {
  return invoke<ProjectRow[]>("list_projects", args);
}

/** `run_backup` — create a local SQLite backup (doc 11 §5 nr. 14). */
export function runBackup(
  args: { manual?: boolean; encrypt?: boolean } = {},
): Promise<BackupResult> {
  return invoke<BackupResult>("run_backup", args);
}

/** `app_lock_check` — verify the app lock (password or macOS Touch ID, doc 09 §6.1). */
export function appLockCheck(
  args: { method?: AppLockMethod | null; password?: string | null } = {},
): Promise<AppLockResult> {
  return invoke<AppLockResult>("app_lock_check", args);
}

/** `set_server_connection` — switch local vs. server mode (doc 02 §3.1). */
export function setServerConnection(args: {
  mode: ConnectionMode;
  baseUrl?: string | null;
  token?: string | null;
}): Promise<ServerConnectionResult> {
  return invoke<ServerConnectionResult>("set_server_connection", args);
}

/** `sync_push` — push local outbox events to the server (doc 04). */
export function syncPush(
  args: { sinceRevision?: number | null } = {},
): Promise<SyncResult> {
  return invoke<SyncResult>("sync_push", args);
}

/** `sync_pull` — pull the server delta since the last revision (doc 04). */
export function syncPull(
  args: { sinceRevision?: number | null } = {},
): Promise<SyncResult> {
  return invoke<SyncResult>("sync_pull", args);
}

/**
 * Render Tarlog's fixed SF Symbols whitelist through AppKit. No symbol name is
 * accepted from the webview and no generated image is persisted to disk.
 */
export function nativeSystemSymbols(): Promise<NativeSystemSymbolSet> {
  return invoke<NativeSystemSymbolSet>("native_system_symbols");
}

/** Keep native timer commands aligned with the durable frontend state. */
export function nativeTimerCommandsUpdate(
  state: NativeTimerCommandState,
): Promise<void> {
  return invoke<void>("native_timer_commands_update", { ...state });
}

/** Every command wrapper, grouped — convenient for tests/mocks. */
export const bridge = {
  dbInit,
  dbMigrate,
  timerStart,
  timerPause,
  timerResume,
  timerStop,
  timerGetState,
  entryBackdate,
  listTimeEntries,
  createCustomer,
  listCustomers,
  createProject,
  listProjects,
  runBackup,
  appLockCheck,
  setServerConnection,
  syncPush,
  syncPull,
  nativeSystemSymbols,
  nativeTimerCommandsUpdate,
} as const;

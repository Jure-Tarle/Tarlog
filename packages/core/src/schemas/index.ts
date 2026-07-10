/**
 * Zod schemas — single source of truth for input validation + TS types + OpenAPI
 * (doc 05 §4, doc 06 TEIL A core tables). CORE entities only, not all 40 tables:
 * customer, project, task, time_entry, rounding_rule, billing_rate, timer_state.
 * Field names match docs/project-time-ledger/06-datenmodell.md EXACTLY —
 * any divergence is a data-model bug. These are real (non-stub) schemas so edge
 * validation works from day one. Pure: no I/O, no side effects.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Shared field primitives (doc 05 §8 conventions)
// ---------------------------------------------------------------------------

/** ISO-4217 currency code (3 letters). */
const currency = z.string().length(3).toUpperCase();
/**
 * UUID string. `z.string().uuid()` accepts UUIDv7 (it validates the RFC-4122
 * shape, not a version pin) — correct for our UUIDv7 primary keys.
 */
const uuid = z.string().uuid();
/** IANA timezone (non-empty; resolution deferred to luxon at runtime). */
const timezone = z.string().min(1);
/** UTC instant as epoch milliseconds. */
const epochMs = z.number().int();
/** Integer duration in seconds, ≥ 0. */
const seconds = z.number().int().nonnegative();
/** Integer money amount in cents (may be negative, e.g. discounts). */
const cents = z.number().int();
/** Positive engine calculation version. */
const calculationVersion = z.number().int().positive();

// ---------------------------------------------------------------------------
// Shared enums (kept as zod enums so z.infer yields exact string-literal unions)
// ---------------------------------------------------------------------------

/** 9 rounding modes (doc 06 `rounding_rules.mode`, doc 07 §3.2). */
export const roundingModeEnum = z.enum([
  "none",
  "always_up",
  "always_down",
  "commercial",
  "nearest_interval",
  "min_per_entry",
  "min_per_day",
  "min_per_project",
  "ceil_started_interval",
]);

/** 6 allowed rounding intervals in minutes (doc 06 CHECK IN (5,6,10,15,30,60)). */
export const roundingIntervalMinutes = z.union([
  z.literal(5),
  z.literal(6),
  z.literal(10),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

/** How a time entry was created (doc 06 `time_entries.source`). */
export const timeEntrySourceEnum = z.enum([
  "live_timer",
  "manual_backdated",
  "imported",
  "api",
]);

/**
 * 11 predefined backdate reasons (doc 03 §7.2). Stable machine keys — labels are
 * localised in the UI. Required when a project enforces backdating_reason_required.
 */
export const backdateReasonEnum = z.enum([
  "forgot_to_start",       // 1. Timer vergessen zu starten
  "forgot_to_stop",        // 2. Timer vergessen zu stoppen
  "worked_offline",        // 3. Arbeit offline durchgeführt
  "meeting",               // 4. Meeting nachgetragen
  "phone_call",            // 5. Telefonat nachgetragen
  "travel_time",           // 6. Reisezeit nachgetragen
  "client_work",           // 7. Kundenarbeit nachgetragen
  "internal_work",         // 8. interne Arbeit nachgetragen
  "calendar_import",       // 9. Kalendertermin übernommen
  "correction",            // 10. Korrektur eines falschen Eintrags
  "other",                 // 11. sonstiger Grund
]);

/** 7 timer states (doc 06 `timer_states.status`; contract types.ts TimerStatus). */
export const timerStatusEnum = z.enum([
  "idle",
  "running",
  "paused",
  "stopped",
  "needs_description",
  "sync_pending",
  "conflict",
]);

// ---------------------------------------------------------------------------
// customers (doc 06 A.2 `customers`) — core fields
// ---------------------------------------------------------------------------

export const customerSchema = z.object({
  id: uuid,
  main_account_id: uuid,
  name: z.string().min(1, "Name ist erforderlich"),
  company: z.string().nullish(),
  contact_person: z.string().nullish(),
  email: z.string().email().nullish(),
  phone: z.string().nullish(),
  vat_id: z.string().nullish(),
  customer_number: z.string().nullish(),
  payment_term_days: z.number().int().nonnegative().default(14),
  default_currency: currency.default("EUR"),
  default_hourly_rate_cents: cents.nullish(),
  default_day_rate_cents: cents.nullish(),
  default_rounding_rule_id: uuid.nullish(),
  default_tax_rate: z.number().default(19),
  reverse_charge_hint: z.boolean().default(false),
  small_business_hint: z.boolean().default(false),
  preferred_export_detail: z
    .enum(["summary", "detailed", "full"])
    .default("detailed"),
  status: z.enum(["active", "paused", "archived"]).default("active"),
});
export type CustomerInput = z.infer<typeof customerSchema>;

// ---------------------------------------------------------------------------
// projects (doc 06 A.2 `projects`) — core fields
// ---------------------------------------------------------------------------

export const projectSchema = z.object({
  id: uuid,
  main_account_id: uuid,
  name: z.string().min(1, "Name ist erforderlich"),
  customer_id: uuid.nullish(),
  description: z.string().nullish(),
  status: z
    .enum(["planned", "active", "paused", "completed", "archived"])
    .default("active"),
  project_code: z.string().nullish(),
  color: z.string().nullish(),
  start_date: z.string().date().nullish(),
  end_date: z.string().date().nullish(),
  billing_type: z.enum([
    "hourly",
    "day_rate",
    "fixed_fee",
    "retainer",
    "non_billable",
  ]),
  hourly_rate_cents: cents.nullish(),
  day_rate_cents: cents.nullish(),
  fixed_fee_cents: cents.nullish(),
  rounding_rule_id: uuid.nullish(),
  description_required: z.boolean().default(false),
  backdating_allowed: z.boolean().default(true),
  backdating_reason_required: z.boolean().default(false),
  max_retroactive_edit_days: z.number().int().nonnegative().nullish(),
});
export type ProjectInput = z.infer<typeof projectSchema>;

// ---------------------------------------------------------------------------
// tasks (doc 06 A.2 `tasks`) — 10 fields
// ---------------------------------------------------------------------------

export const taskSchema = z.object({
  id: uuid,
  main_account_id: uuid,
  project_id: uuid.nullish(), // NULL = global task
  name: z.string().min(1, "Name ist erforderlich"),
  description: z.string().nullish(),
  default_billable: z.boolean().default(true),
  default_hourly_rate_cents: cents.nullish(),
  default_day_rate_cents: cents.nullish(),
  cost_center: z.string().nullish(),
  color: z.string().nullish(),
  status: z.enum(["active", "archived"]).default("active"),
  sort_order: z.number().int().default(0),
});
export type TaskInput = z.infer<typeof taskSchema>;

// ---------------------------------------------------------------------------
// rounding_rules (doc 06 A.4 `rounding_rules`) — 9 modes / 6 intervals
// ---------------------------------------------------------------------------

export const roundingRuleSchema = z.object({
  id: uuid,
  main_account_id: uuid,
  name: z.string().min(1, "Name ist erforderlich"),
  mode: roundingModeEnum,
  interval_minutes: roundingIntervalMinutes.nullish(),
  min_duration_seconds: seconds.nullish(),
  scope: z.enum(["global", "customer", "project", "task"]).default("global"),
  valid_from: z.string().date(),
  valid_until: z.string().date().nullish(),
  calculation_version: calculationVersion,
});
export type RoundingRuleInput = z.infer<typeof roundingRuleSchema>;

// ---------------------------------------------------------------------------
// billing_rates (doc 06 A.4 `billing_rates`) — historised hourly rates
// ---------------------------------------------------------------------------

export const billingRateSchema = z.object({
  id: uuid,
  main_account_id: uuid,
  scope: z.enum(["default", "customer", "project", "task"]),
  customer_id: uuid.nullish(),
  project_id: uuid.nullish(),
  task_id: uuid.nullish(),
  hourly_rate_cents: cents,
  currency,
  valid_from: z.string().date(),
  valid_until: z.string().date().nullish(),
});
export type BillingRateInput = z.infer<typeof billingRateSchema>;

/** Alias — the entity is `billing_rates`; `rate*` kept for existing callers. */
export const rateSchema = billingRateSchema;
export type RateInput = BillingRateInput;

// ---------------------------------------------------------------------------
// time_entries (doc 06 A.3 `time_entries`) — core + all 12 rounding/snapshot
// fields + source enum + optional backdate_reason
// ---------------------------------------------------------------------------

export const timeEntrySchema = z.object({
  id: uuid,
  main_account_id: uuid,
  project_id: uuid.nullish(),
  task_id: uuid.nullish(),
  customer_id: uuid.nullish(),
  status: z.enum([
    "draft",
    "running",
    "paused",
    "stopped",
    "completed",
    "invoiced",
  ]),
  timezone,
  // --- 12 rounding/snapshot fields (doc 06 §A.3, doc 07 §3.1) ---
  actual_started_at: epochMs, // 1
  actual_ended_at: epochMs.nullable(), // 2 — NULL while running
  actual_duration_seconds: seconds, // 3 — gross, never altered by rounding
  break_duration_seconds: seconds.default(0), // 4
  net_work_duration_seconds: seconds, // 5 — actual − break
  billing_duration_seconds: seconds, // 6 — rounded
  rounding_rule_id: uuid.nullish(), // 7
  rounding_delta_seconds: z.number().int().default(0), // 8 — signed (billing − net)
  rounding_reason: z.string().nullish(), // 9
  calculation_version: calculationVersion, // 10
  rate_snapshot: z.record(z.unknown()).nullish(), // 11
  billing_amount_snapshot: cents.nullish(), // 12
  // --- descriptive + billing flags ---
  description: z.string().nullish(),
  is_billable: z.boolean().default(true),
  client_visible: z.boolean().default(true),
  source: timeEntrySourceEnum,
  backdate_reason: backdateReasonEnum.nullish(),
  is_backdated: z.boolean().default(false),
  crosses_midnight: z.boolean().default(false),
  clock_trust: z.enum(["trusted", "suspicious", "corrected"]).default("trusted"),
});
export type TimeEntryInput = z.infer<typeof timeEntrySchema>;

// ---------------------------------------------------------------------------
// timer_states (doc 06 A.1 `timer_states`, SPEC §6.3) — 7-status machine, 18
// fields. Compare-and-Set singleton per main_account via server_revision.
// ---------------------------------------------------------------------------

export const timerStateSchema = z.object({
  timer_id: uuid, // 1 — PK
  main_account_id: uuid, // 2
  current_time_entry_id: uuid.nullish(), // 3
  status: timerStatusEnum.default("idle"), // 4
  project_id: uuid.nullish(), // 5
  task_id: uuid.nullish(), // 6
  started_at: epochMs.nullish(), // 7 — set from `running`
  paused_at: epochMs.nullish(), // 8
  accumulated_pause_seconds: seconds.default(0), // 9
  active_pause_started_at: epochMs.nullish(), // 10
  device_started_on: uuid, // 11
  last_modified_by_device: uuid, // 12
  sync_version: z.number().int().nonnegative().default(0), // 13
  server_revision: z.number().int().nullish(), // 14 — Compare-and-Set anchor
  local_revision: z.number().int().nonnegative().default(0), // 15
  description_required: z.boolean().default(false), // 16
  billing_status: z
    .enum(["billable", "non_billable", "undecided"])
    .default("undecided"), // 17
  compliance_warnings: z.array(z.unknown()).nullish(), // 18
});
export type TimerStateInput = z.infer<typeof timerStateSchema>;

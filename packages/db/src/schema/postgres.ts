/**
 * PostgreSQL dialect schema (server DB), Drizzle ORM.
 *
 * Setzt dasselbe Datenmodell wie schema/sqlite.ts um (docs/project-time-ledger/
 * 06-datenmodell.md): alle 40 Tabellen (31 SPEC-V1 + abgeleitete `timer_states`
 * + 8 Team). Ein logisches Schema, Dialekt-Switch SQLite↔PostgreSQL (doc 05 §2.1).
 *
 * Postgres-Typenwahl (doc 06 §0):
 *  - `id`/FKs: UUIDv7/UUIDv4 als TEXT (uuidv7 wird app-seitig erzeugt).
 *  - Enums: TEXT mit `{ enum: [...] }`.
 *  - `*_at` Zeitpunkte: BIGINT epoch-ms (UTC), Konsistenz mit SQLite/core `EpochMs`.
 *  - `*_seconds` Dauern: INTEGER.
 *  - Geld `*_cents`: BIGINT.
 *  - Prozente/Stunden NUMERIC(p,s): NUMERIC.
 *  - Booleans: BOOLEAN.
 *  - DATE ("YYYY-MM-DD"): DATE.
 *  - CHAR(3) Währung: CHAR(3). CHAR(2) Ländercode: CHAR(2).
 *  - IANA-Zeitzone: TEXT.
 *  - JSON-Felder: JSONB.
 *  - `deleted_at` nur wo Soft-Delete = ja.
 *  - Partieller UNIQUE-Index auf timer_states(main_account_id) WHERE status IN (running,paused).
 */
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Gemeinsame Spalten-Helper (Standard-Sockel + Sync-Meta, doc 06 §0)
// ---------------------------------------------------------------------------

/** UUID-Primärschlüssel als TEXT (UUIDv7). */
const uuidPk = () => text("id").primaryKey();

/** Epoch-ms-Zeitpunkt (UTC), BIGINT im Number-Modus. */
const epochMs = (name: string) => bigint(name, { mode: "number" });

/** Geld/Bytes als BIGINT im Number-Modus (`*_cents`, `size_bytes`). */
const bigNum = (name: string) => bigint(name, { mode: "number" });

/** Standard-Zeitstempel: created_at + updated_at (epoch-ms UTC). */
const timestamps = () => ({
  created_at: epochMs("created_at").notNull(),
  updated_at: epochMs("updated_at").notNull(),
});

/** Soft-Delete-Marker (nur wo Soft-Delete = ja). */
const softDelete = () => ({
  deleted_at: epochMs("deleted_at"),
});

/** Sync-Meta-Spalten (nur wo Sync-Pflicht = ja, doc 06 §0). */
const syncMeta = () => ({
  sync_version: integer("sync_version").notNull().default(0),
  server_revision: bigint("server_revision", { mode: "number" }),
  local_revision: integer("local_revision").notNull().default(0),
  hlc: text("hlc"),
  last_modified_by_device: text("last_modified_by_device"),
});

// ===========================================================================
// A.1 Identität, Geräte und Synchronisierung
// ===========================================================================

export const mainAccounts = pgTable(
  "main_accounts",
  {
    id: uuidPk(),
    display_name: text("display_name").notNull(),
    mode: text("mode", { enum: ["local", "server", "hybrid"] })
      .notNull()
      .default("local"),
    email: text("email"),
    company_name: text("company_name"),
    default_currency: char("default_currency", { length: 3 }).notNull().default("EUR"),
    default_locale: text("default_locale").notNull().default("de-DE"),
    default_timezone: text("default_timezone").notNull().default("Europe/Berlin"),
    default_compliance_profile_id: text("default_compliance_profile_id"),
    password_hash: text("password_hash"),
    ...timestamps(),
    ...syncMeta(),
  },
  (t) => [
    uniqueIndex("ux_main_accounts_email")
      .on(t.email)
      .where(sql`${t.email} IS NOT NULL`),
  ],
);

export const localProfiles = pgTable("local_profiles", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  device_id: text("device_id")
    .notNull()
    .references(() => devices.id),
  app_lock_enabled: boolean("app_lock_enabled").default(false),
  app_lock_method: text("app_lock_method", {
    enum: ["none", "password", "biometric"],
  }).default("none"),
  biometric_kind: text("biometric_kind", {
    enum: ["none", "touch_id", "face_id"],
  }).default("none"),
  db_encryption_enabled: boolean("db_encryption_enabled").default(false),
  telemetry_opt_in: boolean("telemetry_opt_in").default(false),
  ...timestamps(),
});

export const devices = pgTable(
  "devices",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    device_name: text("device_name").notNull(),
    platform: text("platform", {
      enum: ["macos", "windows", "web", "ios"],
    }).notNull(),
    app_version: text("app_version").notNull(),
    last_sync_at: epochMs("last_sync_at"),
    sync_status: text("sync_status", {
      enum: ["synced", "pending", "offline", "error", "conflict"],
    }).default("offline"),
    local_db_version: integer("local_db_version").notNull(),
    server_connected: boolean("server_connected").default(false),
    permission_status: text("permission_status", {
      enum: ["active", "limited", "revoked"],
    }).default("active"),
    revoked: boolean("revoked").default(false),
    connected_at: epochMs("connected_at").notNull(),
    last_active_timer_id: text("last_active_timer_id"),
    live_channel_status: text("live_channel_status", {
      enum: ["websocket", "sse", "polling", "none"],
    }).default("none"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_devices_main_account").on(t.main_account_id),
    index("ix_devices_last_sync_at").on(t.last_sync_at),
  ],
);

export const syncStates = pgTable(
  "sync_states",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    device_id: text("device_id")
      .notNull()
      .references(() => devices.id),
    last_pushed_server_revision: bigint("last_pushed_server_revision", {
      mode: "number",
    }).default(0),
    last_pulled_server_revision: bigint("last_pulled_server_revision", {
      mode: "number",
    }).default(0),
    last_hlc: text("last_hlc"),
    pending_event_count: integer("pending_event_count").default(0),
    last_error: text("last_error"),
    updated_at: epochMs("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ux_sync_states_device").on(t.device_id),
    index("ix_sync_states_last_pulled").on(t.last_pulled_server_revision),
  ],
);

export const syncEvents = pgTable(
  "sync_events",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    device_id: text("device_id")
      .notNull()
      .references(() => devices.id),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    operation: text("operation", { enum: ["create", "update", "delete"] }).notNull(),
    payload_json: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
    hlc: text("hlc").notNull(),
    local_revision: integer("local_revision").notNull(),
    server_revision: bigint("server_revision", { mode: "number" }),
    correlation_id: text("correlation_id"),
    applied: boolean("applied").default(false),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [
    index("ix_sync_events_main_account").on(t.main_account_id),
    index("ix_sync_events_entity").on(t.entity_type, t.entity_id),
    index("ix_sync_events_hlc").on(t.hlc),
    index("ix_sync_events_server_revision").on(t.server_revision),
    index("ix_sync_events_created_at").on(t.created_at),
  ],
);

/**
 * timer_states (abgeleitet aus SPEC §6.3). PK ist `timer_id`.
 * Partieller UNIQUE-Index erzwingt den Single-Timer je main_account.
 */
export const timerStates = pgTable(
  "timer_states",
  {
    timer_id: text("timer_id").primaryKey(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    current_time_entry_id: text("current_time_entry_id").references(
      () => timeEntries.id,
    ),
    status: text("status", {
      enum: [
        "idle",
        "running",
        "paused",
        "stopped",
        "needs_description",
        "sync_pending",
        "conflict",
      ],
    })
      .notNull()
      .default("idle"),
    project_id: text("project_id").references(() => projects.id),
    task_id: text("task_id").references(() => tasks.id),
    started_at: epochMs("started_at"),
    paused_at: epochMs("paused_at"),
    accumulated_pause_seconds: integer("accumulated_pause_seconds")
      .notNull()
      .default(0),
    active_pause_started_at: epochMs("active_pause_started_at"),
    device_started_on: text("device_started_on")
      .notNull()
      .references(() => devices.id),
    last_modified_by_device: text("last_modified_by_device")
      .notNull()
      .references(() => devices.id),
    sync_version: integer("sync_version").notNull().default(0),
    server_revision: bigint("server_revision", { mode: "number" }),
    local_revision: integer("local_revision").notNull().default(0),
    description_required: boolean("description_required").default(false),
    billing_status: text("billing_status", {
      enum: ["billable", "non_billable", "undecided"],
    }).default("undecided"),
    compliance_warnings: jsonb("compliance_warnings").$type<unknown[]>(),
  },
  (t) => [
    uniqueIndex("ux_timer_states_single_active")
      .on(t.main_account_id)
      .where(sql`${t.status} IN ('running','paused')`),
  ],
);

// ===========================================================================
// A.2 Stammdaten, Kunden, Projekte, Aufgaben, Tags
// ===========================================================================

export const customers = pgTable(
  "customers",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    first_name: text("first_name"),
    last_name: text("last_name"),
    company: text("company"),
    contact_person: text("contact_person"),
    email: text("email"),
    phone: text("phone"),
    street: text("street"),
    house_number: text("house_number"),
    postal_code: text("postal_code"),
    city: text("city"),
    country: text("country"),
    billing_address: text("billing_address"),
    shipping_address: text("shipping_address"),
    vat_id: text("vat_id"),
    customer_number: text("customer_number"),
    payment_term_days: integer("payment_term_days").default(14),
    default_currency: char("default_currency", { length: 3 }),
    default_hourly_rate_cents: bigNum("default_hourly_rate_cents"),
    default_day_rate_cents: bigNum("default_day_rate_cents"),
    default_rounding_rule_id: text("default_rounding_rule_id").references(
      () => roundingRules.id,
    ),
    default_invoice_note: text("default_invoice_note"),
    default_language: text("default_language").default("de-DE"),
    pdf_template_id: text("pdf_template_id"),
    invoice_template_id: text("invoice_template_id"),
    internal_notes: text("internal_notes"),
    external_notes: text("external_notes"),
    status: text("status", { enum: ["active", "paused", "archived"] }).default(
      "active",
    ),
    default_tax_rate: numeric("default_tax_rate", { precision: 5, scale: 2 }).default(
      "19.00",
    ),
    reverse_charge_hint: boolean("reverse_charge_hint").default(false),
    small_business_hint: boolean("small_business_hint").default(false),
    preferred_export_detail: text("preferred_export_detail", {
      enum: ["summary", "detailed", "full"],
    }).default("detailed"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_customers_main_account").on(t.main_account_id),
    index("ix_customers_status").on(t.status),
    uniqueIndex("ux_customers_number").on(t.main_account_id, t.customer_number),
  ],
);

export const projects = pgTable(
  "projects",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    customer_id: text("customer_id").references(() => customers.id),
    description: text("description"),
    status: text("status", {
      enum: ["planned", "active", "paused", "completed", "archived"],
    }).default("active"),
    project_code: text("project_code"),
    color: text("color"),
    start_date: date("start_date"),
    end_date: date("end_date"),
    billing_type: text("billing_type", {
      enum: ["hourly", "day_rate", "fixed_fee", "retainer", "non_billable"],
    }).notNull(),
    hourly_rate_cents: bigNum("hourly_rate_cents"),
    day_rate_cents: bigNum("day_rate_cents"),
    fixed_fee_cents: bigNum("fixed_fee_cents"),
    retainer_id: text("retainer_id").references(
      (): AnyPgColumn => fixedFeeContracts.id,
    ),
    budget_hours: numeric("budget_hours", { precision: 10, scale: 2 }),
    budget_money_cents: bigNum("budget_money_cents"),
    budget_warn_thresholds: jsonb("budget_warn_thresholds").$type<number[]>(),
    planned_hours: numeric("planned_hours", { precision: 10, scale: 2 }),
    actual_hours: numeric("actual_hours", { precision: 10, scale: 2 }),
    billable_hours: numeric("billable_hours", { precision: 10, scale: 2 }),
    non_billable_hours: numeric("non_billable_hours", { precision: 10, scale: 2 }),
    rounding_rule_id: text("rounding_rule_id").references(() => roundingRules.id),
    default_task_id: text("default_task_id").references(
      (): AnyPgColumn => tasks.id,
    ),
    allowed_task_ids: jsonb("allowed_task_ids").$type<string[]>(),
    mandatory_tags: jsonb("mandatory_tags").$type<string[]>(),
    description_required: boolean("description_required").default(false),
    backdating_allowed: boolean("backdating_allowed").default(true),
    backdating_reason_required: boolean("backdating_reason_required").default(false),
    max_retroactive_edit_days: integer("max_retroactive_edit_days"),
    internal_notes: text("internal_notes"),
    external_description: text("external_description"),
    invoice_template_id: text("invoice_template_id"),
    export_template_id: text("export_template_id"),
    archived_at: epochMs("archived_at"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_projects_main_account").on(t.main_account_id),
    index("ix_projects_customer").on(t.customer_id),
    index("ix_projects_status").on(t.status),
    uniqueIndex("ux_projects_code").on(t.main_account_id, t.project_code),
  ],
);

export const tasks = pgTable(
  "tasks",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    project_id: text("project_id").references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    default_billable: boolean("default_billable").default(true),
    default_hourly_rate_cents: bigNum("default_hourly_rate_cents"),
    default_day_rate_cents: bigNum("default_day_rate_cents"),
    default_description_template: text("default_description_template"),
    cost_center: text("cost_center"),
    color: text("color"),
    status: text("status", { enum: ["active", "archived"] }).default("active"),
    sort_order: integer("sort_order").default(0),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [index("ix_tasks_main_account").on(t.main_account_id)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    color: text("color"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_tags_main_account").on(t.main_account_id),
    uniqueIndex("ux_tags_name").on(t.main_account_id, t.name),
  ],
);

// ===========================================================================
// A.3 Zeiterfassung, Kernentität
// ===========================================================================

export const timeEntries = pgTable(
  "time_entries",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    project_id: text("project_id").references(() => projects.id),
    task_id: text("task_id").references(() => tasks.id),
    customer_id: text("customer_id").references(() => customers.id),
    status: text("status", {
      enum: ["draft", "running", "paused", "stopped", "completed", "invoiced"],
    }).notNull(),
    timezone: text("timezone").notNull(),
    actual_started_at: epochMs("actual_started_at").notNull(),
    actual_ended_at: epochMs("actual_ended_at"),
    actual_duration_seconds: integer("actual_duration_seconds").notNull(),
    break_duration_seconds: integer("break_duration_seconds").default(0),
    net_work_duration_seconds: integer("net_work_duration_seconds").notNull(),
    billing_duration_seconds: integer("billing_duration_seconds").notNull(),
    rounding_rule_id: text("rounding_rule_id").references(() => roundingRules.id),
    rounding_delta_seconds: integer("rounding_delta_seconds").default(0),
    rounding_reason: text("rounding_reason"),
    calculation_version: integer("calculation_version").notNull(),
    rate_snapshot: jsonb("rate_snapshot").$type<Record<string, unknown>>(),
    billing_amount_snapshot: bigNum("billing_amount_snapshot"),
    description: text("description"),
    summary: text("summary"),
    deliverable: text("deliverable"),
    blocker: text("blocker"),
    next_step: text("next_step"),
    internal_note: text("internal_note"),
    is_billable: boolean("is_billable").default(true),
    client_visible: boolean("client_visible").default(true),
    source: text("source", {
      enum: ["live_timer", "manual_backdated", "imported", "api"],
    }).notNull(),
    backdate_reason: text("backdate_reason"),
    correction_reason: text("correction_reason"),
    is_backdated: boolean("is_backdated").default(false),
    crosses_midnight: boolean("crosses_midnight").default(false),
    device_started_on: text("device_started_on").references(() => devices.id),
    server_received_at: epochMs("server_received_at"),
    clock_trust: text("clock_trust", {
      enum: ["trusted", "suspicious", "corrected"],
    }).default("trusted"),
    invoice_id: text("invoice_id").references(() => invoices.id),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_time_entries_account_started").on(
      t.main_account_id,
      t.actual_started_at,
    ),
    index("ix_time_entries_project_started").on(t.project_id, t.actual_started_at),
    index("ix_time_entries_status").on(t.status),
    index("ix_time_entries_billable_invoice").on(t.is_billable, t.invoice_id),
    index("ix_time_entries_backdated").on(t.is_backdated),
  ],
);

export const timeEntryBreaks = pgTable(
  "time_entry_breaks",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    time_entry_id: text("time_entry_id")
      .notNull()
      .references(() => timeEntries.id),
    started_at: epochMs("started_at").notNull(),
    ended_at: epochMs("ended_at"),
    duration_seconds: integer("duration_seconds").notNull(),
    kind: text("kind", { enum: ["manual", "auto"] }).default("manual"),
    counts_as_rest: boolean("counts_as_rest").default(true),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [index("ix_time_entry_breaks_entry").on(t.time_entry_id)],
);

export const timeEntryTags = pgTable(
  "time_entry_tags",
  {
    time_entry_id: text("time_entry_id")
      .notNull()
      .references(() => timeEntries.id),
    tag_id: text("tag_id")
      .notNull()
      .references(() => tags.id),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.time_entry_id, t.tag_id] }),
    index("ix_time_entry_tags_entry").on(t.time_entry_id),
  ],
);

// ===========================================================================
// A.4 Abrechnungs-Regelwerk
// ===========================================================================

export const roundingRules = pgTable("rounding_rules", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  name: text("name").notNull(),
  mode: text("mode", {
    enum: [
      "none",
      "always_up",
      "always_down",
      "commercial",
      "nearest_interval",
      "min_per_entry",
      "min_per_day",
      "min_per_project",
      "ceil_started_interval",
    ],
  }).notNull(),
  interval_minutes: integer("interval_minutes"),
  min_duration_seconds: integer("min_duration_seconds"),
  scope: text("scope", {
    enum: ["global", "customer", "project", "task"],
  }).default("global"),
  priority: integer("priority").notNull().default(0),
  valid_from: date("valid_from").notNull(),
  valid_until: date("valid_until"),
  calculation_version: integer("calculation_version").notNull(),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const billingRates = pgTable(
  "billing_rates",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    scope: text("scope", {
      enum: ["default", "customer", "project", "task"],
    }).notNull(),
    customer_id: text("customer_id").references(() => customers.id),
    project_id: text("project_id").references(() => projects.id),
    task_id: text("task_id").references(() => tasks.id),
    hourly_rate_cents: bigNum("hourly_rate_cents").notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    valid_from: date("valid_from").notNull(),
    valid_until: date("valid_until"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_billing_rates_valid_from").on(t.valid_from),
    index("ix_billing_rates_resolution").on(
      t.scope,
      t.project_id,
      t.task_id,
      t.valid_from,
    ),
  ],
);

export const dayRateRules = pgTable("day_rate_rules", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  scope: text("scope", { enum: ["customer", "project", "task"] }).notNull(),
  customer_id: text("customer_id").references(() => customers.id),
  project_id: text("project_id").references(() => projects.id),
  task_id: text("task_id").references(() => tasks.id),
  full_day_rate_cents: bigNum("full_day_rate_cents").notNull(),
  half_day_rate_cents: bigNum("half_day_rate_cents"),
  full_day_min_hours: numeric("full_day_min_hours", { precision: 5, scale: 2 }).notNull(),
  half_day_min_hours: numeric("half_day_min_hours", { precision: 5, scale: 2 }),
  min_billing: text("min_billing", {
    enum: ["none", "half_day", "full_day"],
  }).default("none"),
  extra_hours_billing: text("extra_hours_billing", {
    enum: ["none", "hourly"],
  }).default("none"),
  valid_from: date("valid_from").notNull(),
  valid_until: date("valid_until"),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const fixedFeeContracts = pgTable("fixed_fee_contracts", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  project_id: text("project_id").references(() => projects.id),
  customer_id: text("customer_id").references(() => customers.id),
  type: text("type", { enum: ["fixed_fee", "retainer"] }).notNull(),
  total_fee_cents: bigNum("total_fee_cents"),
  monthly_fee_cents: bigNum("monthly_fee_cents"),
  budget_hours: numeric("budget_hours", { precision: 10, scale: 2 }),
  internal_cost_rate_cents: bigNum("internal_cost_rate_cents"),
  included_hours: numeric("included_hours", { precision: 10, scale: 2 }),
  rollover_unused: boolean("rollover_unused").default(false),
  expire_unused: boolean("expire_unused").default(false),
  extra_hours_rate_cents: bigNum("extra_hours_rate_cents"),
  milestones_json: jsonb("milestones_json").$type<unknown[]>(),
  valid_from: date("valid_from").notNull(),
  valid_until: date("valid_until"),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const budgets = pgTable(
  "budgets",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    budget_hours: numeric("budget_hours", { precision: 10, scale: 2 }),
    budget_money_cents: bigNum("budget_money_cents"),
    consumed_hours: numeric("consumed_hours", { precision: 10, scale: 2 }).default(
      "0",
    ),
    consumed_money_cents: bigNum("consumed_money_cents").default(0),
    warn_thresholds: jsonb("warn_thresholds").$type<number[]>(),
    period: text("period", { enum: ["total", "monthly"] }).default("total"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [index("ix_budgets_project").on(t.project_id)],
);

// ===========================================================================
// A.5 Rechnungswesen
// ===========================================================================

export const invoices = pgTable(
  "invoices",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id),
    invoice_number: text("invoice_number"),
    number_range_id: text("number_range_id"),
    type: text("type", {
      enum: ["standard", "partial", "final", "cancellation", "credit_note"],
    }).notNull(),
    status: text("status", {
      enum: ["draft", "finalized", "sent", "paid", "cancelled"],
    }).default("draft"),
    dunning_status: text("dunning_status", {
      enum: ["none", "reminded", "overdue"],
    }).default("none"),
    issue_date: date("issue_date").notNull(),
    service_period_start: date("service_period_start"),
    service_period_end: date("service_period_end"),
    service_date: date("service_date"),
    payment_due_date: date("payment_due_date"),
    currency: char("currency", { length: 3 }).notNull(),
    net_amount_cents: bigNum("net_amount_cents").notNull(),
    tax_amount_cents: bigNum("tax_amount_cents").notNull(),
    gross_amount_cents: bigNum("gross_amount_cents").notNull(),
    tax_rate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull(),
    small_business_note: text("small_business_note"),
    reverse_charge_note: text("reverse_charge_note"),
    customer_snapshot: jsonb("customer_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    project_snapshot: jsonb("project_snapshot").$type<Record<string, unknown>>(),
    rate_snapshot: jsonb("rate_snapshot").$type<Record<string, unknown>>().notNull(),
    rounding_snapshot: jsonb("rounding_snapshot")
      .$type<Record<string, unknown>>()
      .notNull(),
    finalized_at: epochMs("finalized_at"),
    cancels_invoice_id: text("cancels_invoice_id"),
    notes: text("notes"),
    ...timestamps(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_invoices_main_account").on(t.main_account_id),
    index("ix_invoices_status").on(t.status),
    uniqueIndex("ux_invoices_number").on(t.main_account_id, t.invoice_number),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    invoice_id: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    kind: text("kind", {
      enum: ["hourly", "day_rate", "fixed_fee", "flat", "discount", "expense", "travel"],
    }).notNull(),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 10, scale: 2 }).notNull(),
    unit: text("unit", { enum: ["hours", "days", "piece", "percent"] }).notNull(),
    unit_price_cents: bigNum("unit_price_cents").notNull(),
    net_amount_cents: bigNum("net_amount_cents").notNull(),
    tax_rate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull(),
    ...timestamps(),
  },
  (t) => [index("ix_invoice_items_invoice").on(t.invoice_id)],
);

export const invoiceTimeEntries = pgTable(
  "invoice_time_entries",
  {
    invoice_id: text("invoice_id")
      .notNull()
      .references(() => invoices.id),
    time_entry_id: text("time_entry_id")
      .notNull()
      .references(() => timeEntries.id),
    invoice_item_id: text("invoice_item_id").references(() => invoiceItems.id),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    billed_duration_seconds: integer("billed_duration_seconds").notNull(),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invoice_id, t.time_entry_id] }),
    index("ix_invoice_time_entries_invoice").on(t.invoice_id),
  ],
);

// ===========================================================================
// A.6 Export, Compliance, Audit, Anhänge
// ===========================================================================

export const exports = pgTable(
  "exports",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    export_number: text("export_number"),
    format: text("format", {
      enum: ["pdf", "csv", "xlsx", "json", "zip"],
    }).notNull(),
    variant: text("variant", {
      enum: [
        "internal_timesheet",
        "customer_report",
        "invoice_attachment",
        "compliance_report",
        "tax_advisor",
        "daily_detail",
        "monthly_summary",
      ],
    }),
    filter_json: jsonb("filter_json").$type<Record<string, unknown>>().notNull(),
    period_start: date("period_start"),
    period_end: date("period_end"),
    timezone: text("timezone").notNull(),
    checksum: text("checksum"),
    created_by_device: text("created_by_device").references(() => devices.id),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [
    index("ix_exports_main_account").on(t.main_account_id),
    index("ix_exports_created_at").on(t.created_at),
    uniqueIndex("ux_exports_number").on(t.main_account_id, t.export_number),
  ],
);

export const exportFiles = pgTable(
  "export_files",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    export_id: text("export_id")
      .notNull()
      .references(() => exports.id),
    filename: text("filename").notNull(),
    mime_type: text("mime_type").notNull(),
    storage_path: text("storage_path").notNull(),
    size_bytes: bigNum("size_bytes").notNull(),
    checksum_sha256: text("checksum_sha256"),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [index("ix_export_files_export").on(t.export_id)],
);

export const complianceProfiles = pgTable("compliance_profiles", {
  id: uuidPk(),
  main_account_id: text("main_account_id").references(() => mainAccounts.id),
  country_code: char("country_code", { length: 2 }).notNull(),
  jurisdiction_name: text("jurisdiction_name").notNull(),
  valid_from: date("valid_from").notNull(),
  valid_until: date("valid_until"),
  rules_json: jsonb("rules_json").$type<Record<string, unknown>>().notNull(),
  source_note: text("source_note").notNull(),
  severity: text("severity", {
    enum: ["info", "warning", "violation"],
  }).notNull(),
  user_visible_explanation: text("user_visible_explanation").notNull(),
  calculation_version: integer("calculation_version").notNull(),
  ...timestamps(),
});

export const complianceResults = pgTable(
  "compliance_results",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    compliance_profile_id: text("compliance_profile_id")
      .notNull()
      .references(() => complianceProfiles.id),
    scope: text("scope", { enum: ["day", "week", "time_entry"] }).notNull(),
    scope_date: date("scope_date"),
    time_entry_id: text("time_entry_id").references(() => timeEntries.id),
    rule_code: text("rule_code").notNull(),
    severity: text("severity", { enum: ["green", "yellow", "red"] }).notNull(),
    message: text("message").notNull(),
    override_reason: text("override_reason"),
    overridden_by_device: text("overridden_by_device").references(() => devices.id),
    calculation_version: integer("calculation_version").notNull(),
    ...timestamps(),
  },
  (t) => [
    index("ix_compliance_results_scope_date").on(t.scope_date),
    index("ix_compliance_results_severity").on(t.severity),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuidPk(),
    actor_id: text("actor_id").notNull(),
    organization_id: text("organization_id"),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    device_id: text("device_id").references(() => devices.id),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    action: text("action", {
      enum: [
        "timer_started",
        "timer_paused",
        "timer_resumed",
        "timer_stopped",
        "entry_backdated",
        "entry_updated",
        "entry_deleted",
        "start_time_corrected",
        "end_time_corrected",
        "break_changed",
        "description_changed",
        "billability_changed",
        "project_changed",
        "task_changed",
        "rate_changed",
        "rounding_rule_changed",
        "invoice_created",
        "invoice_finalized",
        "invoice_cancelled",
        "export_created",
        "pdf_generated",
        "compliance_override",
        "sync_conflict_resolved",
        "device_connected",
        "device_disconnected",
      ],
    }).notNull(),
    before_json: jsonb("before_json").$type<Record<string, unknown>>(),
    after_json: jsonb("after_json").$type<Record<string, unknown>>(),
    reason: text("reason"),
    timestamp: epochMs("timestamp").notNull(),
    source: text("source", { enum: ["ui", "api", "sync", "system"] }).notNull(),
    server_revision: bigint("server_revision", { mode: "number" }),
    local_revision: integer("local_revision").notNull(),
    correlation_id: text("correlation_id"),
  },
  (t) => [
    index("ix_audit_logs_main_account").on(t.main_account_id),
    index("ix_audit_logs_entity").on(t.entity_type, t.entity_id),
    index("ix_audit_logs_timestamp").on(t.timestamp),
  ],
);

export const attachments = pgTable(
  "attachments",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    filename: text("filename").notNull(),
    mime_type: text("mime_type").notNull(),
    storage_path: text("storage_path").notNull(),
    size_bytes: bigNum("size_bytes").notNull(),
    checksum_sha256: text("checksum_sha256"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [index("ix_attachments_entity").on(t.entity_type, t.entity_id)],
);

// ===========================================================================
// A.7 Betrieb, Sicherheit, Konflikte
// ===========================================================================

export const settings = pgTable(
  "settings",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    scope: text("scope", { enum: ["account", "device"] }).notNull(),
    device_id: text("device_id").references(() => devices.id),
    key: text("key").notNull(),
    value_json: jsonb("value_json").$type<Record<string, unknown>>().notNull(),
    ...timestamps(),
    ...syncMeta(),
  },
  (t) => [
    uniqueIndex("ux_settings_key").on(
      t.main_account_id,
      t.scope,
      t.device_id,
      t.key,
    ),
  ],
);

export const backups = pgTable("backups", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  kind: text("kind", { enum: ["manual", "auto"] }).notNull(),
  target: text("target", { enum: ["local_sqlite", "server_pg"] }).notNull(),
  storage_path: text("storage_path").notNull(),
  size_bytes: bigNum("size_bytes").notNull(),
  encrypted: boolean("encrypted").default(false),
  checksum_sha256: text("checksum_sha256"),
  integrity_status: text("integrity_status", {
    enum: ["unknown", "ok", "corrupt"],
  }).default("unknown"),
  created_at: epochMs("created_at").notNull(),
});

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    token_hash: text("token_hash").notNull(),
    token_prefix: text("token_prefix").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull(),
    device_id: text("device_id").references(() => devices.id),
    last_used_at: epochMs("last_used_at"),
    expires_at: epochMs("expires_at"),
    revoked_at: epochMs("revoked_at"),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [index("ix_api_tokens_main_account").on(t.main_account_id)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    user_id: text("user_id").references(() => users.id),
    session_hash: text("session_hash").notNull(),
    device_id: text("device_id").references(() => devices.id),
    ip_hash: text("ip_hash"),
    user_agent: text("user_agent"),
    expires_at: epochMs("expires_at").notNull(),
    revoked_at: epochMs("revoked_at"),
    created_at: epochMs("created_at").notNull(),
    last_seen_at: epochMs("last_seen_at").notNull(),
  },
  (t) => [index("ix_sessions_main_account").on(t.main_account_id)],
);

export const conflictRecords = pgTable(
  "conflict_records",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    conflict_case: integer("conflict_case").notNull(),
    local_version_json: jsonb("local_version_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    server_version_json: jsonb("server_version_json")
      .$type<Record<string, unknown>>()
      .notNull(),
    suggested_merge_json: jsonb("suggested_merge_json").$type<
      Record<string, unknown>
    >(),
    resolution: text("resolution", {
      enum: ["unresolved", "keep_local", "keep_server", "merged", "manual"],
    }).default("unresolved"),
    reason: text("reason"),
    resolved_by_device: text("resolved_by_device").references(() => devices.id),
    server_revision: bigint("server_revision", { mode: "number" }),
    correlation_id: text("correlation_id"),
    created_at: epochMs("created_at").notNull(),
    resolved_at: epochMs("resolved_at"),
  },
  (t) => [
    index("ix_conflict_records_main_account").on(t.main_account_id),
    index("ix_conflict_records_entity").on(t.entity_id),
    index("ix_conflict_records_resolution").on(t.resolution),
  ],
);

// ===========================================================================
// TEIL B, 8 vorbereitete Team-Tabellen (Phase 6, angelegt aber inaktiv)
// ===========================================================================

export const organizations = pgTable(
  "organizations",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    slug: text("slug"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [uniqueIndex("ux_organizations_slug").on(t.slug)],
);

export const users = pgTable(
  "users",
  {
    id: uuidPk(),
    organization_id: text("organization_id").references(() => organizations.id),
    email: text("email"),
    display_name: text("display_name").notNull(),
    password_hash: text("password_hash"),
    status: text("status", {
      enum: ["active", "invited", "suspended"],
    }).default("active"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [uniqueIndex("ux_users_email").on(t.email)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuidPk(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    role_id: text("role_id")
      .notNull()
      .references(() => roles.id),
    status: text("status", {
      enum: ["active", "invited", "removed"],
    }).default("active"),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [uniqueIndex("ux_memberships_org_user").on(t.organization_id, t.user_id)],
);

export const roles = pgTable("roles", {
  id: uuidPk(),
  organization_id: text("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  is_system: boolean("is_system").default(false),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const permissions = pgTable(
  "permissions",
  {
    id: uuidPk(),
    role_id: text("role_id")
      .notNull()
      .references(() => roles.id),
    resource: text("resource").notNull(),
    action: text("action", {
      enum: ["read", "create", "update", "delete", "approve", "export"],
    }).notNull(),
    created_at: epochMs("created_at").notNull(),
  },
  (t) => [
    index("ix_permissions_role").on(t.role_id),
    uniqueIndex("ux_permissions_role_resource_action").on(
      t.role_id,
      t.resource,
      t.action,
    ),
  ],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: uuidPk(),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    user_id: text("user_id")
      .notNull()
      .references(() => users.id),
    role_id: text("role_id").references(() => roles.id),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [
    index("ix_project_members_project").on(t.project_id),
    uniqueIndex("ux_project_members_project_user").on(t.project_id, t.user_id),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuidPk(),
    organization_id: text("organization_id")
      .notNull()
      .references(() => organizations.id),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    requested_by: text("requested_by")
      .notNull()
      .references(() => users.id),
    approver_id: text("approver_id").references(() => users.id),
    status: text("status", {
      enum: ["pending", "approved", "rejected"],
    }).default("pending"),
    reason: text("reason"),
    created_at: epochMs("created_at").notNull(),
    decided_at: epochMs("decided_at"),
  },
  (t) => [
    index("ix_approvals_entity").on(t.entity_id),
    index("ix_approvals_status").on(t.status),
  ],
);

export const customerPortalAccess = pgTable(
  "customer_portal_access",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    customer_id: text("customer_id")
      .notNull()
      .references(() => customers.id),
    email: text("email").notNull(),
    access_token_hash: text("access_token_hash").notNull(),
    scopes: jsonb("scopes").$type<Record<string, unknown>>().notNull(),
    revoked_at: epochMs("revoked_at"),
    ...timestamps(),
  },
  (t) => [index("ix_customer_portal_access_customer").on(t.customer_id)],
);

// ---------------------------------------------------------------------------
// Aggregiertes Schema-Objekt (für drizzle(client, { schema }))
// ---------------------------------------------------------------------------

export const pgSchema = {
  mainAccounts,
  localProfiles,
  devices,
  syncStates,
  syncEvents,
  timerStates,
  customers,
  projects,
  tasks,
  tags,
  timeEntries,
  timeEntryBreaks,
  timeEntryTags,
  roundingRules,
  billingRates,
  dayRateRules,
  fixedFeeContracts,
  budgets,
  invoices,
  invoiceItems,
  invoiceTimeEntries,
  exports,
  exportFiles,
  complianceProfiles,
  complianceResults,
  auditLogs,
  attachments,
  settings,
  backups,
  apiTokens,
  sessions,
  conflictRecords,
  organizations,
  users,
  memberships,
  roles,
  permissions,
  projectMembers,
  approvals,
  customerPortalAccess,
} as const;

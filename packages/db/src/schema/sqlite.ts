/**
 * SQLite dialect schema (client DB) — Drizzle ORM.
 *
 * Setzt das vollständige Datenmodell aus docs/project-time-ledger/06-datenmodell.md
 * um: alle 40 Tabellen (31 SPEC-V1 + abgeleitete `timer_states` + 8 Team).
 *
 * Konventionen (doc 06 §0, doc 05 §8):
 *  - `id`/FKs: UUIDv7/UUIDv4 als TEXT.
 *  - Enums: TEXT mit `{ enum: [...] }`.
 *  - `*_at` Zeitpunkte: INTEGER epoch-ms (UTC) — deckt sich mit core `EpochMs = number`.
 *  - `*_seconds` Dauern: INTEGER.
 *  - Geld `*_cents`: INTEGER (SQLite speichert 64-Bit-Ints nativ).
 *  - Prozente/Stunden NUMERIC(p,s): REAL.
 *  - Booleans: INTEGER mit `{ mode: "boolean" }`.
 *  - DATE ("YYYY-MM-DD"), CHAR(3), IANA-Zeitzone: TEXT.
 *  - JSON-Felder: TEXT mit `{ mode: "json" }`.
 *  - `deleted_at` nur wo Soft-Delete = ja.
 *  - Partieller UNIQUE-Index auf timer_states(main_account_id) WHERE status IN (running,paused).
 *
 * Die 31 SPEC-Signaturen (Tabellen-/Feldnamen, snake_case) bleiben exakt wie in
 * der Doku; Divergenz wäre ein Datenmodell-Fehler.
 */
import { sql } from "drizzle-orm";
import {
  type AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Gemeinsame Spalten-Helper (Standard-Sockel + Sync-Meta, doc 06 §0)
// ---------------------------------------------------------------------------

/** UUID-Primärschlüssel als TEXT (UUIDv7). */
const uuidPk = () => text("id").primaryKey();

/** Standard-Zeitstempel: created_at + updated_at (epoch-ms UTC). */
const timestamps = () => ({
  created_at: integer("created_at").notNull(),
  updated_at: integer("updated_at").notNull(),
});

/** Soft-Delete-Marker (nur wo Soft-Delete = ja). */
const softDelete = () => ({
  deleted_at: integer("deleted_at"),
});

/** Sync-Meta-Spalten (nur wo Sync-Pflicht = ja, doc 06 §0). */
const syncMeta = () => ({
  sync_version: integer("sync_version").notNull().default(0),
  server_revision: integer("server_revision"),
  local_revision: integer("local_revision").notNull().default(0),
  hlc: text("hlc"),
  last_modified_by_device: text("last_modified_by_device"),
});

// ===========================================================================
// A.1 Identität, Geräte und Synchronisierung
// ===========================================================================

export const mainAccounts = sqliteTable(
  "main_accounts",
  {
    id: uuidPk(),
    display_name: text("display_name").notNull(),
    mode: text("mode", { enum: ["local", "server", "hybrid"] })
      .notNull()
      .default("local"),
    email: text("email"),
    company_name: text("company_name"),
    default_currency: text("default_currency").notNull().default("EUR"),
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

export const localProfiles = sqliteTable("local_profiles", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  device_id: text("device_id")
    .notNull()
    .references(() => devices.id),
  app_lock_enabled: integer("app_lock_enabled", { mode: "boolean" }).default(false),
  app_lock_method: text("app_lock_method", {
    enum: ["none", "password", "biometric"],
  }).default("none"),
  biometric_kind: text("biometric_kind", {
    enum: ["none", "touch_id", "face_id"],
  }).default("none"),
  db_encryption_enabled: integer("db_encryption_enabled", {
    mode: "boolean",
  }).default(false),
  telemetry_opt_in: integer("telemetry_opt_in", { mode: "boolean" }).default(false),
  ...timestamps(),
});

export const devices = sqliteTable(
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
    last_sync_at: integer("last_sync_at"),
    sync_status: text("sync_status", {
      enum: ["synced", "pending", "offline", "error", "conflict"],
    }).default("offline"),
    local_db_version: integer("local_db_version").notNull(),
    server_connected: integer("server_connected", { mode: "boolean" }).default(false),
    permission_status: text("permission_status", {
      enum: ["active", "limited", "revoked"],
    }).default("active"),
    revoked: integer("revoked", { mode: "boolean" }).default(false),
    connected_at: integer("connected_at").notNull(),
    // FK → timer_states.timer_id (spät aufgelöst)
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

export const syncStates = sqliteTable(
  "sync_states",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    device_id: text("device_id")
      .notNull()
      .references(() => devices.id),
    last_pushed_server_revision: integer("last_pushed_server_revision").default(0),
    last_pulled_server_revision: integer("last_pulled_server_revision").default(0),
    last_hlc: text("last_hlc"),
    pending_event_count: integer("pending_event_count").default(0),
    last_error: text("last_error"),
    updated_at: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("ux_sync_states_device").on(t.device_id),
    index("ix_sync_states_last_pulled").on(t.last_pulled_server_revision),
  ],
);

export const syncEvents = sqliteTable(
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
    payload_json: text("payload_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    hlc: text("hlc").notNull(),
    local_revision: integer("local_revision").notNull(),
    server_revision: integer("server_revision"),
    correlation_id: text("correlation_id"),
    applied: integer("applied", { mode: "boolean" }).default(false),
    created_at: integer("created_at").notNull(),
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
 * timer_states (abgeleitet aus SPEC §6.3). PK ist `timer_id` (nicht `id`).
 * Partieller UNIQUE-Index erzwingt den Single-Timer je main_account:
 * nur ein `running`/`paused` Timer pro Konto.
 */
export const timerStates = sqliteTable(
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
    started_at: integer("started_at"),
    paused_at: integer("paused_at"),
    accumulated_pause_seconds: integer("accumulated_pause_seconds")
      .notNull()
      .default(0),
    active_pause_started_at: integer("active_pause_started_at"),
    device_started_on: text("device_started_on")
      .notNull()
      .references(() => devices.id),
    last_modified_by_device: text("last_modified_by_device")
      .notNull()
      .references(() => devices.id),
    sync_version: integer("sync_version").notNull().default(0),
    server_revision: integer("server_revision"),
    local_revision: integer("local_revision").notNull().default(0),
    description_required: integer("description_required", {
      mode: "boolean",
    }).default(false),
    billing_status: text("billing_status", {
      enum: ["billable", "non_billable", "undecided"],
    }).default("undecided"),
    compliance_warnings: text("compliance_warnings", { mode: "json" }).$type<
      unknown[]
    >(),
  },
  (t) => [
    // Single-Timer-Durchsetzung: max. 1 running/paused Timer je main_account.
    uniqueIndex("ux_timer_states_single_active")
      .on(t.main_account_id)
      .where(sql`${t.status} IN ('running','paused')`),
  ],
);

// ===========================================================================
// A.2 Stammdaten — Kunden, Projekte, Aufgaben, Tags
// ===========================================================================

export const customers = sqliteTable(
  "customers",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    company: text("company"),
    contact_person: text("contact_person"),
    email: text("email"),
    phone: text("phone"),
    billing_address: text("billing_address"),
    shipping_address: text("shipping_address"),
    vat_id: text("vat_id"),
    customer_number: text("customer_number"),
    payment_term_days: integer("payment_term_days").default(14),
    default_currency: text("default_currency"),
    default_hourly_rate_cents: integer("default_hourly_rate_cents"),
    default_day_rate_cents: integer("default_day_rate_cents"),
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
    default_tax_rate: real("default_tax_rate").default(19.0),
    reverse_charge_hint: integer("reverse_charge_hint", { mode: "boolean" }).default(
      false,
    ),
    small_business_hint: integer("small_business_hint", { mode: "boolean" }).default(
      false,
    ),
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

export const projects = sqliteTable(
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
    start_date: text("start_date"),
    end_date: text("end_date"),
    billing_type: text("billing_type", {
      enum: ["hourly", "day_rate", "fixed_fee", "retainer", "non_billable"],
    }).notNull(),
    hourly_rate_cents: integer("hourly_rate_cents"),
    day_rate_cents: integer("day_rate_cents"),
    fixed_fee_cents: integer("fixed_fee_cents"),
    retainer_id: text("retainer_id").references(
      (): AnySQLiteColumn => fixedFeeContracts.id,
    ),
    budget_hours: real("budget_hours"),
    budget_money_cents: integer("budget_money_cents"),
    budget_warn_thresholds: text("budget_warn_thresholds", {
      mode: "json",
    }).$type<number[]>(),
    planned_hours: real("planned_hours"),
    actual_hours: real("actual_hours"),
    billable_hours: real("billable_hours"),
    non_billable_hours: real("non_billable_hours"),
    rounding_rule_id: text("rounding_rule_id").references(() => roundingRules.id),
    default_task_id: text("default_task_id").references(
      (): AnySQLiteColumn => tasks.id,
    ),
    allowed_task_ids: text("allowed_task_ids", { mode: "json" }).$type<string[]>(),
    mandatory_tags: text("mandatory_tags", { mode: "json" }).$type<string[]>(),
    description_required: integer("description_required", {
      mode: "boolean",
    }).default(false),
    backdating_allowed: integer("backdating_allowed", { mode: "boolean" }).default(
      true,
    ),
    backdating_reason_required: integer("backdating_reason_required", {
      mode: "boolean",
    }).default(false),
    max_retroactive_edit_days: integer("max_retroactive_edit_days"),
    internal_notes: text("internal_notes"),
    external_description: text("external_description"),
    invoice_template_id: text("invoice_template_id"),
    export_template_id: text("export_template_id"),
    archived_at: integer("archived_at"),
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

export const tasks = sqliteTable(
  "tasks",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    project_id: text("project_id").references(() => projects.id),
    name: text("name").notNull(),
    description: text("description"),
    default_billable: integer("default_billable", { mode: "boolean" }).default(true),
    default_hourly_rate_cents: integer("default_hourly_rate_cents"),
    default_day_rate_cents: integer("default_day_rate_cents"),
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

export const tags = sqliteTable(
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
// A.3 Zeiterfassung — Kernentität
// ===========================================================================

export const timeEntries = sqliteTable(
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
      enum: [
        "draft",
        "running",
        "paused",
        "stopped",
        "completed",
        "invoiced",
      ],
    }).notNull(),
    timezone: text("timezone").notNull(),
    actual_started_at: integer("actual_started_at").notNull(),
    actual_ended_at: integer("actual_ended_at"),
    actual_duration_seconds: integer("actual_duration_seconds").notNull(),
    break_duration_seconds: integer("break_duration_seconds").default(0),
    net_work_duration_seconds: integer("net_work_duration_seconds").notNull(),
    billing_duration_seconds: integer("billing_duration_seconds").notNull(),
    rounding_rule_id: text("rounding_rule_id").references(() => roundingRules.id),
    rounding_delta_seconds: integer("rounding_delta_seconds").default(0),
    rounding_reason: text("rounding_reason"),
    calculation_version: integer("calculation_version").notNull(),
    rate_snapshot: text("rate_snapshot", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    billing_amount_snapshot: integer("billing_amount_snapshot"),
    description: text("description"),
    summary: text("summary"),
    deliverable: text("deliverable"),
    blocker: text("blocker"),
    next_step: text("next_step"),
    internal_note: text("internal_note"),
    is_billable: integer("is_billable", { mode: "boolean" }).default(true),
    client_visible: integer("client_visible", { mode: "boolean" }).default(true),
    source: text("source", {
      enum: ["live_timer", "manual_backdated", "imported", "api"],
    }).notNull(),
    backdate_reason: text("backdate_reason"),
    correction_reason: text("correction_reason"),
    is_backdated: integer("is_backdated", { mode: "boolean" }).default(false),
    crosses_midnight: integer("crosses_midnight", { mode: "boolean" }).default(
      false,
    ),
    device_started_on: text("device_started_on").references(() => devices.id),
    server_received_at: integer("server_received_at"),
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

export const timeEntryBreaks = sqliteTable(
  "time_entry_breaks",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    time_entry_id: text("time_entry_id")
      .notNull()
      .references(() => timeEntries.id),
    started_at: integer("started_at").notNull(),
    ended_at: integer("ended_at"),
    duration_seconds: integer("duration_seconds").notNull(),
    kind: text("kind", { enum: ["manual", "auto"] }).default("manual"),
    counts_as_rest: integer("counts_as_rest", { mode: "boolean" }).default(true),
    ...timestamps(),
    ...softDelete(),
    ...syncMeta(),
  },
  (t) => [index("ix_time_entry_breaks_entry").on(t.time_entry_id)],
);

export const timeEntryTags = sqliteTable(
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
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.time_entry_id, t.tag_id] }),
    index("ix_time_entry_tags_entry").on(t.time_entry_id),
  ],
);

// ===========================================================================
// A.4 Abrechnungs-Regelwerk
// ===========================================================================

export const roundingRules = sqliteTable("rounding_rules", {
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
  valid_from: text("valid_from").notNull(),
  valid_until: text("valid_until"),
  calculation_version: integer("calculation_version").notNull(),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const billingRates = sqliteTable(
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
    hourly_rate_cents: integer("hourly_rate_cents").notNull(),
    currency: text("currency").notNull(),
    valid_from: text("valid_from").notNull(),
    valid_until: text("valid_until"),
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

export const dayRateRules = sqliteTable("day_rate_rules", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  scope: text("scope", { enum: ["customer", "project", "task"] }).notNull(),
  customer_id: text("customer_id").references(() => customers.id),
  project_id: text("project_id").references(() => projects.id),
  task_id: text("task_id").references(() => tasks.id),
  full_day_rate_cents: integer("full_day_rate_cents").notNull(),
  half_day_rate_cents: integer("half_day_rate_cents"),
  full_day_min_hours: real("full_day_min_hours").notNull(),
  half_day_min_hours: real("half_day_min_hours"),
  min_billing: text("min_billing", {
    enum: ["none", "half_day", "full_day"],
  }).default("none"),
  extra_hours_billing: text("extra_hours_billing", {
    enum: ["none", "hourly"],
  }).default("none"),
  valid_from: text("valid_from").notNull(),
  valid_until: text("valid_until"),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const fixedFeeContracts = sqliteTable("fixed_fee_contracts", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  project_id: text("project_id").references(() => projects.id),
  customer_id: text("customer_id").references(() => customers.id),
  type: text("type", { enum: ["fixed_fee", "retainer"] }).notNull(),
  total_fee_cents: integer("total_fee_cents"),
  monthly_fee_cents: integer("monthly_fee_cents"),
  budget_hours: real("budget_hours"),
  internal_cost_rate_cents: integer("internal_cost_rate_cents"),
  included_hours: real("included_hours"),
  rollover_unused: integer("rollover_unused", { mode: "boolean" }).default(false),
  expire_unused: integer("expire_unused", { mode: "boolean" }).default(false),
  extra_hours_rate_cents: integer("extra_hours_rate_cents"),
  milestones_json: text("milestones_json", { mode: "json" }).$type<unknown[]>(),
  valid_from: text("valid_from").notNull(),
  valid_until: text("valid_until"),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const budgets = sqliteTable(
  "budgets",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    project_id: text("project_id")
      .notNull()
      .references(() => projects.id),
    budget_hours: real("budget_hours"),
    budget_money_cents: integer("budget_money_cents"),
    consumed_hours: real("consumed_hours").default(0),
    consumed_money_cents: integer("consumed_money_cents").default(0),
    warn_thresholds: text("warn_thresholds", { mode: "json" }).$type<number[]>(),
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

export const invoices = sqliteTable(
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
    issue_date: text("issue_date").notNull(),
    service_period_start: text("service_period_start"),
    service_period_end: text("service_period_end"),
    service_date: text("service_date"),
    payment_due_date: text("payment_due_date"),
    currency: text("currency").notNull(),
    net_amount_cents: integer("net_amount_cents").notNull(),
    tax_amount_cents: integer("tax_amount_cents").notNull(),
    gross_amount_cents: integer("gross_amount_cents").notNull(),
    tax_rate: real("tax_rate").notNull(),
    small_business_note: text("small_business_note"),
    reverse_charge_note: text("reverse_charge_note"),
    customer_snapshot: text("customer_snapshot", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    project_snapshot: text("project_snapshot", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    rate_snapshot: text("rate_snapshot", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    rounding_snapshot: text("rounding_snapshot", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    finalized_at: integer("finalized_at"),
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

export const invoiceItems = sqliteTable(
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
    quantity: real("quantity").notNull(),
    unit: text("unit", { enum: ["hours", "days", "piece", "percent"] }).notNull(),
    unit_price_cents: integer("unit_price_cents").notNull(),
    net_amount_cents: integer("net_amount_cents").notNull(),
    tax_rate: real("tax_rate").notNull(),
    ...timestamps(),
  },
  (t) => [index("ix_invoice_items_invoice").on(t.invoice_id)],
);

export const invoiceTimeEntries = sqliteTable(
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
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.invoice_id, t.time_entry_id] }),
    index("ix_invoice_time_entries_invoice").on(t.invoice_id),
  ],
);

// ===========================================================================
// A.6 Export, Compliance, Audit, Anhänge
// ===========================================================================

export const exports = sqliteTable(
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
    filter_json: text("filter_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    period_start: text("period_start"),
    period_end: text("period_end"),
    timezone: text("timezone").notNull(),
    checksum: text("checksum"),
    created_by_device: text("created_by_device").references(() => devices.id),
    created_at: integer("created_at").notNull(),
  },
  (t) => [
    index("ix_exports_main_account").on(t.main_account_id),
    index("ix_exports_created_at").on(t.created_at),
    uniqueIndex("ux_exports_number").on(t.main_account_id, t.export_number),
  ],
);

export const exportFiles = sqliteTable(
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
    size_bytes: integer("size_bytes").notNull(),
    checksum_sha256: text("checksum_sha256"),
    created_at: integer("created_at").notNull(),
  },
  (t) => [index("ix_export_files_export").on(t.export_id)],
);

export const complianceProfiles = sqliteTable("compliance_profiles", {
  id: uuidPk(),
  main_account_id: text("main_account_id").references(() => mainAccounts.id),
  country_code: text("country_code").notNull(),
  jurisdiction_name: text("jurisdiction_name").notNull(),
  valid_from: text("valid_from").notNull(),
  valid_until: text("valid_until"),
  rules_json: text("rules_json", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull(),
  source_note: text("source_note").notNull(),
  severity: text("severity", {
    enum: ["info", "warning", "violation"],
  }).notNull(),
  user_visible_explanation: text("user_visible_explanation").notNull(),
  calculation_version: integer("calculation_version").notNull(),
  ...timestamps(),
});

export const complianceResults = sqliteTable(
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
    scope_date: text("scope_date"),
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

export const auditLogs = sqliteTable(
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
    before_json: text("before_json", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    after_json: text("after_json", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    reason: text("reason"),
    timestamp: integer("timestamp").notNull(),
    source: text("source", { enum: ["ui", "api", "sync", "system"] }).notNull(),
    server_revision: integer("server_revision"),
    local_revision: integer("local_revision").notNull(),
    correlation_id: text("correlation_id"),
  },
  (t) => [
    index("ix_audit_logs_main_account").on(t.main_account_id),
    index("ix_audit_logs_entity").on(t.entity_type, t.entity_id),
    index("ix_audit_logs_timestamp").on(t.timestamp),
  ],
);

export const attachments = sqliteTable(
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
    size_bytes: integer("size_bytes").notNull(),
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

export const settings = sqliteTable(
  "settings",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    scope: text("scope", { enum: ["account", "device"] }).notNull(),
    device_id: text("device_id").references(() => devices.id),
    key: text("key").notNull(),
    value_json: text("value_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
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

export const backups = sqliteTable("backups", {
  id: uuidPk(),
  main_account_id: text("main_account_id")
    .notNull()
    .references(() => mainAccounts.id),
  kind: text("kind", { enum: ["manual", "auto"] }).notNull(),
  target: text("target", { enum: ["local_sqlite", "server_pg"] }).notNull(),
  storage_path: text("storage_path").notNull(),
  size_bytes: integer("size_bytes").notNull(),
  encrypted: integer("encrypted", { mode: "boolean" }).default(false),
  checksum_sha256: text("checksum_sha256"),
  integrity_status: text("integrity_status", {
    enum: ["unknown", "ok", "corrupt"],
  }).default("unknown"),
  created_at: integer("created_at").notNull(),
});

export const apiTokens = sqliteTable(
  "api_tokens",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    name: text("name").notNull(),
    token_hash: text("token_hash").notNull(),
    token_prefix: text("token_prefix").notNull(),
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull(),
    device_id: text("device_id").references(() => devices.id),
    last_used_at: integer("last_used_at"),
    expires_at: integer("expires_at"),
    revoked_at: integer("revoked_at"),
    created_at: integer("created_at").notNull(),
  },
  (t) => [index("ix_api_tokens_main_account").on(t.main_account_id)],
);

export const sessions = sqliteTable(
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
    expires_at: integer("expires_at").notNull(),
    revoked_at: integer("revoked_at"),
    created_at: integer("created_at").notNull(),
    last_seen_at: integer("last_seen_at").notNull(),
  },
  (t) => [index("ix_sessions_main_account").on(t.main_account_id)],
);

export const conflictRecords = sqliteTable(
  "conflict_records",
  {
    id: uuidPk(),
    main_account_id: text("main_account_id")
      .notNull()
      .references(() => mainAccounts.id),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id").notNull(),
    conflict_case: integer("conflict_case").notNull(),
    local_version_json: text("local_version_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    server_version_json: text("server_version_json", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull(),
    suggested_merge_json: text("suggested_merge_json", { mode: "json" }).$type<
      Record<string, unknown>
    >(),
    resolution: text("resolution", {
      enum: ["unresolved", "keep_local", "keep_server", "merged", "manual"],
    }).default("unresolved"),
    reason: text("reason"),
    resolved_by_device: text("resolved_by_device").references(() => devices.id),
    server_revision: integer("server_revision"),
    correlation_id: text("correlation_id"),
    created_at: integer("created_at").notNull(),
    resolved_at: integer("resolved_at"),
  },
  (t) => [
    index("ix_conflict_records_main_account").on(t.main_account_id),
    index("ix_conflict_records_entity").on(t.entity_id),
    index("ix_conflict_records_resolution").on(t.resolution),
  ],
);

// ===========================================================================
// TEIL B — 8 vorbereitete Team-Tabellen (Phase 6, angelegt aber inaktiv)
// ===========================================================================

export const organizations = sqliteTable(
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

export const users = sqliteTable(
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

export const memberships = sqliteTable(
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

export const roles = sqliteTable("roles", {
  id: uuidPk(),
  organization_id: text("organization_id").references(() => organizations.id),
  name: text("name").notNull(),
  is_system: integer("is_system", { mode: "boolean" }).default(false),
  ...timestamps(),
  ...softDelete(),
  ...syncMeta(),
});

export const permissions = sqliteTable(
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
    created_at: integer("created_at").notNull(),
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

export const projectMembers = sqliteTable(
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

export const approvals = sqliteTable(
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
    created_at: integer("created_at").notNull(),
    decided_at: integer("decided_at"),
  },
  (t) => [
    index("ix_approvals_entity").on(t.entity_id),
    index("ix_approvals_status").on(t.status),
  ],
);

export const customerPortalAccess = sqliteTable(
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
    scopes: text("scopes", { mode: "json" }).$type<Record<string, unknown>>()
      .notNull(),
    revoked_at: integer("revoked_at"),
    ...timestamps(),
  },
  (t) => [index("ix_customer_portal_access_customer").on(t.customer_id)],
);

// ---------------------------------------------------------------------------
// Aggregiertes Schema-Objekt (für drizzle(client, { schema }))
// ---------------------------------------------------------------------------

export const sqliteSchema = {
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

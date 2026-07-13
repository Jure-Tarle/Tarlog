/**
 * repositories.ts — the data layer the pages consume.
 *
 * READS go through `src/lib/db` (typed SELECTs against the local SQLite DB,
 * doc 05 §2.1). MUTATIONS with business rules go through `src/lib/bridge` Rust
 * commands so invariants (timer state machine, rounding, snapshots, audit,
 * sync events) are never bypassed by raw SQL. Pages import from here only —
 * never `invoke`, never SQL directly.
 */
import { select } from "../lib/db";
import {
  createCustomer as cmdCreateCustomer,
  createProject as cmdCreateProject,
  entryBackdate as cmdEntryBackdate,
  type BackdateEntryInput,
} from "../lib/bridge";
import { session, newId } from "./session";
import type {
  CustomerInput,
  ProjectInput,
  TaskInput,
  TimeEntryInput,
  RoundingRuleInput,
  EpochMs,
  Uuid,
} from "@tarlog/core";

export type Customer = CustomerInput;
export type Project = ProjectInput;
export type Task = TaskInput;
export type TimeEntry = TimeEntryInput;
export type RoundingRule = RoundingRuleInput;

/** One persisted break block (doc 06 `time_entry_breaks`). */
export interface Break {
  id: string;
  time_entry_id: string;
  started_at: EpochMs;
  ended_at: EpochMs | null;
  duration_seconds: number;
  kind: "manual" | "auto";
  counts_as_rest: boolean;
}

/** A stored compliance result row (doc 06 `compliance_results`). */
export interface ComplianceResultRow {
  id: string;
  scope: "day" | "week" | "time_entry";
  scope_date: string | null;
  rule_code: string;
  severity: "green" | "yellow" | "red";
  message: string;
  override_reason: string | null;
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export const customers = {
  async list(status?: string): Promise<Customer[]> {
    const where = status ? "WHERE status = $1 AND deleted_at IS NULL" : "WHERE deleted_at IS NULL";
    return select<Customer>(
      `SELECT * FROM customers ${where} ORDER BY name COLLATE NOCASE ASC`,
      status ? [status] : [],
    );
  },
  async create(input: {
    name: string;
    company?: string | null;
    contact_person?: string | null;
    email?: string | null;
    vat_id?: string | null;
    customer_number?: string | null;
    default_hourly_rate_cents?: number | null;
    default_currency?: string;
    payment_term_days?: number;
    status?: "active" | "paused" | "archived";
  }): Promise<Customer> {
    const { mainAccountId } = await session();
    const payload: CustomerInput = {
      id: newId(),
      main_account_id: mainAccountId,
      name: input.name,
      company: input.company ?? null,
      contact_person: input.contact_person ?? null,
      email: input.email ?? null,
      vat_id: input.vat_id ?? null,
      customer_number: input.customer_number ?? null,
      payment_term_days: input.payment_term_days ?? 14,
      default_currency: input.default_currency ?? "EUR",
      default_hourly_rate_cents: input.default_hourly_rate_cents ?? null,
      default_tax_rate: 19,
      reverse_charge_hint: false,
      small_business_hint: false,
      preferred_export_detail: "detailed",
      status: input.status ?? "active",
    };
    return cmdCreateCustomer(payload);
  },
};

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = {
  async list(args: { customerId?: Uuid | null; status?: string } = {}): Promise<Project[]> {
    const clauses = ["deleted_at IS NULL"];
    const params: unknown[] = [];
    if (args.customerId) {
      params.push(args.customerId);
      clauses.push(`customer_id = $${params.length}`);
    }
    if (args.status) {
      params.push(args.status);
      clauses.push(`status = $${params.length}`);
    }
    return select<Project>(
      `SELECT * FROM projects WHERE ${clauses.join(" AND ")} ORDER BY name COLLATE NOCASE ASC`,
      params,
    );
  },
  async byId(id: Uuid): Promise<Project | null> {
    const rows = await select<Project>("SELECT * FROM projects WHERE id = $1 LIMIT 1", [id]);
    return rows[0] ?? null;
  },
  async create(input: {
    name: string;
    customer_id?: Uuid | null;
    description?: string | null;
    project_code?: string | null;
    billing_type: ProjectInput["billing_type"];
    hourly_rate_cents?: number | null;
    day_rate_cents?: number | null;
    fixed_fee_cents?: number | null;
    description_required?: boolean;
    backdating_reason_required?: boolean;
    status?: ProjectInput["status"];
  }): Promise<Project> {
    const { mainAccountId } = await session();
    const payload: ProjectInput = {
      id: newId(),
      main_account_id: mainAccountId,
      name: input.name,
      customer_id: input.customer_id ?? null,
      description: input.description ?? null,
      status: input.status ?? "active",
      project_code: input.project_code ?? null,
      color: null,
      start_date: null,
      end_date: null,
      billing_type: input.billing_type,
      hourly_rate_cents: input.hourly_rate_cents ?? null,
      day_rate_cents: input.day_rate_cents ?? null,
      fixed_fee_cents: input.fixed_fee_cents ?? null,
      rounding_rule_id: null,
      description_required: input.description_required ?? false,
      backdating_allowed: true,
      backdating_reason_required: input.backdating_reason_required ?? false,
      max_retroactive_edit_days: null,
    };
    return cmdCreateProject(payload);
  },
};

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = {
  async list(projectId?: Uuid | null): Promise<Task[]> {
    if (projectId) {
      return select<Task>(
        "SELECT * FROM tasks WHERE (project_id = $1 OR project_id IS NULL) AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
        [projectId],
      );
    }
    return select<Task>(
      "SELECT * FROM tasks WHERE deleted_at IS NULL ORDER BY sort_order ASC, name ASC",
    );
  },
};

// ---------------------------------------------------------------------------
// Time entries
// ---------------------------------------------------------------------------

export const entries = {
  /** Entries whose start falls in [from, to). */
  async inRange(from: EpochMs, to: EpochMs): Promise<TimeEntry[]> {
    return select<TimeEntry>(
      `SELECT * FROM time_entries
       WHERE actual_started_at >= $1 AND actual_started_at < $2 AND deleted_at IS NULL
       ORDER BY actual_started_at ASC`,
      [from, to],
    );
  },
  /** Most recent completed entries, newest first (Schnellstart / recents). */
  async recent(limit = 20): Promise<TimeEntry[]> {
    return select<TimeEntry>(
      `SELECT * FROM time_entries
       WHERE deleted_at IS NULL AND actual_ended_at IS NOT NULL
       ORDER BY actual_started_at DESC LIMIT $1`,
      [limit],
    );
  },
  /** Drafts / incomplete entries (doc 11 §3 element 9). */
  async incomplete(limit = 100): Promise<TimeEntry[]> {
    return select<TimeEntry>(
      `SELECT * FROM time_entries
       WHERE deleted_at IS NULL AND (status = 'draft' OR description IS NULL OR description = '')
       ORDER BY actual_started_at DESC LIMIT $1`,
      [limit],
    );
  },
  /** Manually backdated entries (doc 11 §4.1 view 9). */
  async backdated(limit = 100): Promise<TimeEntry[]> {
    return select<TimeEntry>(
      `SELECT * FROM time_entries
       WHERE deleted_at IS NULL AND is_backdated = 1
       ORDER BY actual_started_at DESC LIMIT $1`,
      [limit],
    );
  },
  /** Billable, not yet invoiced (doc 11 §3 element 8). */
  async openBillable(): Promise<TimeEntry[]> {
    return select<TimeEntry>(
      `SELECT * FROM time_entries
       WHERE deleted_at IS NULL AND is_billable = 1 AND invoice_id IS NULL AND actual_ended_at IS NOT NULL
       ORDER BY actual_started_at DESC`,
    );
  },
  /** Persisted break blocks for an entry. */
  async breaks(entryId: Uuid): Promise<Break[]> {
    return select<Break>(
      "SELECT * FROM time_entry_breaks WHERE time_entry_id = $1 AND deleted_at IS NULL ORDER BY started_at ASC",
      [entryId],
    );
  },
  /** Create a backdated entry via the Rust assistant command (doc 03 §7). */
  create(input: BackdateEntryInput): Promise<TimeEntry> {
    return cmdEntryBackdate(input);
  },
};

// ---------------------------------------------------------------------------
// Rounding rules + compliance results
// ---------------------------------------------------------------------------

export const roundingRules = {
  async list(): Promise<RoundingRule[]> {
    return select<RoundingRule>(
      "SELECT * FROM rounding_rules WHERE deleted_at IS NULL ORDER BY name ASC",
    );
  },
};

export const compliance = {
  async resultsInRange(fromDate: string, toDate: string): Promise<ComplianceResultRow[]> {
    return select<ComplianceResultRow>(
      `SELECT * FROM compliance_results
       WHERE scope = 'day' AND scope_date >= $1 AND scope_date < $2
       ORDER BY scope_date DESC`,
      [fromDate, toDate],
    );
  },
};

export const invoicesRepo = {
  async recent(limit = 100): Promise<InvoiceRow[]> {
    return select<InvoiceRow>(
      "SELECT * FROM invoices ORDER BY issue_date DESC LIMIT $1",
      [limit],
    );
  },
};

/** A stored invoice row (subset used by the list view, doc 06 A.5). */
export interface InvoiceRow {
  id: string;
  invoice_number: string | null;
  customer_id: string;
  type: string;
  status: "draft" | "finalized" | "sent" | "paid" | "cancelled";
  dunning_status: string;
  issue_date: string;
  payment_due_date: string | null;
  currency: string;
  net_amount_cents: number;
  tax_amount_cents: number;
  gross_amount_cents: number;
}

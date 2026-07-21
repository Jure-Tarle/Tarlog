import { uuidv7 } from "uuidv7";
import type { PoolClient } from "pg";
import {
  onboardingStepIndex,
  type OnboardingLaunch,
  type OnboardingProgress,
} from "@tarlog/core";
import { ApiError } from "@/lib/api";
import { pool } from "@/lib/db";
import {
  reduceOnboardingProgress,
  resolveWebOnboardingLaunch,
  type OnboardingMutation,
} from "./model";

export const ONBOARDING_SETTING_KEY = "onboarding_v1";

export type OnboardingBillingType =
  | "hourly"
  | "day_rate"
  | "fixed_fee"
  | "retainer"
  | "non_billable";

export interface OnboardingWorkspaceInput {
  customerId: string | null;
  customer: {
    name: string;
    company: string | null;
    defaultCurrency: string;
  } | null;
  project: {
    name: string;
    billingType: OnboardingBillingType;
    hourlyRateCents: number | null;
    dayRateCents: number | null;
    fixedFeeCents: number | null;
    roundingRuleId: string | null;
    descriptionRequired: boolean;
  };
}

export interface OnboardingWorkspaceResult {
  launch: OnboardingLaunch;
  customer: { id: string; name: string; company: string | null } | null;
  project: {
    id: string;
    name: string;
    customerId: string | null;
    customerName: string | null;
    billingType: OnboardingBillingType;
  };
}

interface StoredSetting {
  id: string;
  value_json: unknown;
}

interface WorkspaceSnapshot {
  settingRows: StoredSetting[];
  firstProjectId: string | null;
}

async function workspaceSnapshot(
  client: Pick<PoolClient, "query">,
  accountId: string,
  lockRows = false,
): Promise<WorkspaceSnapshot> {
  const settingResult = await client.query<StoredSetting>(
    `SELECT id, value_json
       FROM settings
      WHERE main_account_id = $1
        AND scope = 'account'
        AND device_id IS NULL
        AND key = $2
      ORDER BY created_at ASC, id ASC
      ${lockRows ? "FOR UPDATE" : ""}`,
    [accountId, ONBOARDING_SETTING_KEY],
  );
  const projectResult = await client.query<{ id: string }>(
    `SELECT id
       FROM projects
      WHERE main_account_id = $1 AND deleted_at IS NULL
      ORDER BY created_at ASC, id ASC
      LIMIT 1`,
    [accountId],
  );
  return {
    settingRows: settingResult.rows,
    firstProjectId: projectResult.rows[0]?.id ?? null,
  };
}

export async function getOnboardingLaunch(accountId: string): Promise<OnboardingLaunch> {
  const client = await pool.connect();
  try {
    const snapshot = await workspaceSnapshot(client, accountId);
    return resolveWebOnboardingLaunch(
      snapshot.settingRows[0]?.value_json,
      snapshot.firstProjectId,
    );
  } finally {
    client.release();
  }
}

async function entityBelongsToAccount(
  client: Pick<PoolClient, "query">,
  table: "customers" | "projects",
  id: string,
  accountId: string,
): Promise<boolean> {
  const result = await client.query(
    `SELECT 1 FROM ${table}
      WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL
      LIMIT 1`,
    [id, accountId],
  );
  return result.rowCount === 1;
}

async function persistTargeted(
  client: PoolClient,
  accountId: string,
  rows: StoredSetting[],
  progress: OnboardingProgress,
): Promise<void> {
  const now = Date.now();
  const primary = rows[0];
  if (primary) {
    await client.query(
      `UPDATE settings
          SET value_json = $1::jsonb,
              updated_at = $2,
              sync_version = sync_version + 1,
              local_revision = local_revision + 1
        WHERE id = $3 AND main_account_id = $4`,
      [JSON.stringify(progress), now, primary.id, accountId],
    );

    // The historical unique index includes nullable device_id and therefore
    // cannot prevent duplicate account-scoped rows. The advisory lock prevents
    // new races; update only the oldest exact row and preserve existing data.
    return;
  }

  await client.query(
    `INSERT INTO settings
       (id, main_account_id, scope, device_id, key, value_json,
        created_at, updated_at, sync_version, local_revision)
     VALUES ($1,$2,'account',NULL,$3,$4::jsonb,$5,$5,0,0)`,
    [uuidv7(), accountId, ONBOARDING_SETTING_KEY, JSON.stringify(progress), now],
  );
}

export async function mutateOnboarding(
  accountId: string,
  mutation: OnboardingMutation,
): Promise<OnboardingLaunch> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `tarlog:onboarding:${accountId}`,
    ]);

    const snapshot = await workspaceSnapshot(client, accountId, true);
    const launch = resolveWebOnboardingLaunch(
      snapshot.settingRows[0]?.value_json,
      snapshot.firstProjectId,
    );

    if (mutation.action === "progress") {
      if (
        mutation.customerId &&
        !(await entityBelongsToAccount(client, "customers", mutation.customerId, accountId))
      ) {
        throw new ApiError("not_found", "Der ausgewählte Kunde wurde nicht gefunden.");
      }
      if (
        mutation.projectId &&
        !(await entityBelongsToAccount(client, "projects", mutation.projectId, accountId))
      ) {
        throw new ApiError("not_found", "Das ausgewählte Projekt wurde nicht gefunden.");
      }
    }

    let progress: OnboardingProgress;
    try {
      progress = reduceOnboardingProgress(launch.progress, mutation);
    } catch (error) {
      if (error instanceof Error && error.message === "project_required") {
        throw new ApiError(
          "validation_error",
          "Lege zuerst ein Projekt an oder wähle ein bestehendes Projekt.",
        );
      }
      throw error;
    }

    if (
      progress.projectId &&
      !(await entityBelongsToAccount(client, "projects", progress.projectId, accountId))
    ) {
      throw new ApiError("not_found", "Das Onboarding-Projekt wurde nicht gefunden.");
    }

    await persistTargeted(client, accountId, snapshot.settingRows, progress);
    await client.query("COMMIT");
    return {
      show: progress.status === "in_progress",
      required: progress.status === "in_progress",
      progress,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create the optional customer, first project, and resumable onboarding
 * checkpoint in one database transaction. A failed request therefore cannot
 * leave half-created master data that the next first-run attempt duplicates.
 */
export async function createOnboardingWorkspace(
  accountId: string,
  input: OnboardingWorkspaceInput,
): Promise<OnboardingWorkspaceResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `tarlog:onboarding:${accountId}`,
    ]);

    const snapshot = await workspaceSnapshot(client, accountId, true);
    const launch = resolveWebOnboardingLaunch(
      snapshot.settingRows[0]?.value_json,
      snapshot.firstProjectId,
    );
    const now = Date.now();

    // A response can be lost after COMMIT and a double click can enqueue two
    // requests before React paints the busy state. Once first-run already
    // reached a capability step, return its durable project instead of
    // creating duplicate master data. The advisory lock serializes both calls.
    if (
      launch.progress.status === "in_progress" &&
      launch.progress.projectId &&
      onboardingStepIndex(launch.progress.step) >= onboardingStepIndex("live_tracking")
    ) {
      const existing = await client.query<{
        id: string;
        name: string;
        customer_id: string | null;
        billing_type: OnboardingBillingType;
        customer_name: string | null;
        customer_company: string | null;
      }>(
        `SELECT p.id, p.name, p.customer_id, p.billing_type,
                c.name AS customer_name, c.company AS customer_company
           FROM projects p
           LEFT JOIN customers c
             ON c.id = p.customer_id
            AND c.main_account_id = p.main_account_id
            AND c.deleted_at IS NULL
          WHERE p.id = $1
            AND p.main_account_id = $2
            AND p.deleted_at IS NULL
          LIMIT 1`,
        [launch.progress.projectId, accountId],
      );
      const row = existing.rows[0];
      if (row) {
        await client.query("COMMIT");
        return {
          launch,
          customer: row.customer_id && row.customer_name
            ? {
                id: row.customer_id,
                name: row.customer_name,
                company: row.customer_company,
              }
            : null,
          project: {
            id: row.id,
            name: row.name,
            customerId: row.customer_id,
            customerName: row.customer_name,
            billingType: row.billing_type,
          },
        };
      }
    }

    if (input.customer && input.customerId) {
      throw new ApiError(
        "validation_error",
        "Wähle einen bestehenden Kunden oder lege einen neuen an.",
      );
    }

    let customer: OnboardingWorkspaceResult["customer"] = null;
    let customerId = input.customerId;
    if (input.customer) {
      customerId = uuidv7();
      const inserted = await client.query<{
        id: string;
        name: string;
        company: string | null;
      }>(
        `INSERT INTO customers
           (id, main_account_id, name, company, payment_term_days,
            default_currency, default_tax_rate,
            status, reverse_charge_hint, small_business_hint,
            preferred_export_detail, created_at, updated_at)
         VALUES ($1,$2,$3,$4,14,$5,19,'active',FALSE,FALSE,'detailed',$6,$6)
         RETURNING id, name, company`,
        [
          customerId,
          accountId,
          input.customer.name,
          input.customer.company,
          input.customer.defaultCurrency,
          now,
        ],
      );
      customer = inserted.rows[0] ?? null;
    } else if (customerId) {
      const selected = await client.query<{
        id: string;
        name: string;
        company: string | null;
      }>(
        `SELECT id, name, company
           FROM customers
          WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL
          LIMIT 1`,
        [customerId, accountId],
      );
      customer = selected.rows[0] ?? null;
      if (!customer) {
        throw new ApiError("not_found", "Der ausgewählte Kunde wurde nicht gefunden.");
      }
    }

    if (input.project.roundingRuleId) {
      const rule = await client.query(
        `SELECT 1 FROM rounding_rules
          WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL
          LIMIT 1`,
        [input.project.roundingRuleId, accountId],
      );
      if (rule.rowCount !== 1) {
        throw new ApiError("not_found", "Die ausgewählte Rundungsregel wurde nicht gefunden.");
      }
    }

    const projectId = uuidv7();
    const insertedProject = await client.query<{ id: string; name: string }>(
      `INSERT INTO projects
         (id, main_account_id, name, customer_id, status, billing_type,
          hourly_rate_cents, day_rate_cents, fixed_fee_cents,
          rounding_rule_id, description_required, backdating_allowed,
          backdating_reason_required, created_at, updated_at)
       VALUES ($1,$2,$3,$4,'active',$5,$6,$7,$8,$9,$10,TRUE,FALSE,$11,$11)
       RETURNING id, name`,
      [
        projectId,
        accountId,
        input.project.name,
        customerId,
        input.project.billingType,
        input.project.hourlyRateCents,
        input.project.dayRateCents,
        input.project.fixedFeeCents,
        input.project.roundingRuleId,
        input.project.descriptionRequired,
        now,
      ],
    );
    const projectRow = insertedProject.rows[0];
    if (!projectRow) throw new Error("project_insert_failed");

    let progress = launch.progress;
    if (progress.status === "in_progress") {
      progress = reduceOnboardingProgress(progress, {
        action: "progress",
        step: "live_tracking",
        customerId,
        projectId,
      });
      await persistTargeted(client, accountId, snapshot.settingRows, progress);
    }

    await client.query("COMMIT");
    return {
      launch: {
        show: progress.status === "in_progress",
        required: progress.status === "in_progress",
        progress,
      },
      customer,
      project: {
        id: projectRow.id,
        name: projectRow.name,
        customerId,
        customerName: customer?.name ?? null,
        billingType: input.project.billingType,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * rounding.ts — rounding-rule CRUD + precedence resolution Projekt > Kunde >
 * Default (doc 07 §3, doc 10 §4). Persists to `rounding_rules` (interval in
 * MINUTES, doc 06) but maps to the @tarlog/core {@link RoundingRule} shape (interval
 * in SECONDS) that `applyRounding`/`calculateEntry` consume.
 */
import { execute, select } from "../lib/db";
import { getContext, now } from "./context";
import { uuidv7 } from "uuidv7";
import {
  CALCULATION_VERSION,
  roundingRuleSchema,
  type IntervalSeconds,
  type RoundingMode,
  type RoundingRule,
  type RoundingRuleInput,
  type Uuid,
} from "@tarlog/core";

/** Persisted rounding-rule row (doc 06 `rounding_rules`). */
export interface RoundingRuleRow {
  id: Uuid;
  main_account_id: Uuid;
  name: string;
  mode: RoundingMode;
  interval_minutes: number | null;
  min_duration_seconds: number | null;
  scope: "global" | "customer" | "project" | "task";
  valid_from: string;
  valid_until: string | null;
  calculation_version: number;
}

/** Fallback rule when nothing is configured: pass-through (no rounding). */
const NONE_RULE: RoundingRule = { id: "none", mode: "none" };

/** Map a DB row → the core engine rule shape (minutes → seconds). */
export function toCoreRule(row: RoundingRuleRow): RoundingRule {
  const rule: RoundingRule = { id: row.id, mode: row.mode };
  if (row.interval_minutes != null) {
    rule.interval_seconds = (row.interval_minutes * 60) as IntervalSeconds;
  }
  if (row.min_duration_seconds != null) {
    rule.minimum_seconds = row.min_duration_seconds;
  }
  return rule;
}

/** All rounding rules for the account (newest first). */
export async function listRoundingRules(): Promise<RoundingRuleRow[]> {
  const ctx = await getContext();
  return select<RoundingRuleRow>(
    `SELECT id, main_account_id, name, mode, interval_minutes, min_duration_seconds,
            scope, valid_from, valid_until, calculation_version
       FROM rounding_rules
      WHERE main_account_id = $1 AND deleted_at IS NULL
      ORDER BY id DESC`,
    [ctx.mainAccountId],
  );
}

/** One rounding rule by id, or null. */
export async function getRoundingRule(id: Uuid): Promise<RoundingRuleRow | null> {
  const ctx = await getContext();
  const rows = await select<RoundingRuleRow>(
    `SELECT id, main_account_id, name, mode, interval_minutes, min_duration_seconds,
            scope, valid_from, valid_until, calculation_version
       FROM rounding_rules
      WHERE main_account_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1`,
    [ctx.mainAccountId, id],
  );
  return rows[0] ?? null;
}

/** Draft for {@link upsertRoundingRule} — id/main_account_id are filled here. */
export type RoundingRuleDraft = Omit<
  Partial<RoundingRuleInput>,
  "main_account_id"
> & { name: string; mode: RoundingMode };

/**
 * Insert or update a rounding rule. Validates through the @tarlog/core
 * `roundingRuleSchema` so defaults + shape are enforced at the edge.
 */
export async function upsertRoundingRule(
  draft: RoundingRuleDraft,
): Promise<RoundingRuleRow> {
  const ctx = await getContext();
  const id = draft.id ?? uuidv7();
  const today = new Date(now()).toISOString().slice(0, 10);
  const parsed: RoundingRuleInput = roundingRuleSchema.parse({
    valid_from: today,
    calculation_version: CALCULATION_VERSION,
    ...draft,
    id,
    main_account_id: ctx.mainAccountId,
  });

  const ts = now();
  const existing = await getRoundingRule(id);
  if (existing) {
    await execute(
      `UPDATE rounding_rules
          SET name = $1, mode = $2, interval_minutes = $3, min_duration_seconds = $4,
              scope = $5, valid_from = $6, valid_until = $7, calculation_version = $8,
              updated_at = $9
        WHERE id = $10 AND main_account_id = $11`,
      [
        parsed.name,
        parsed.mode,
        parsed.interval_minutes ?? null,
        parsed.min_duration_seconds ?? null,
        parsed.scope,
        parsed.valid_from,
        parsed.valid_until ?? null,
        parsed.calculation_version,
        id,
        ctx.mainAccountId,
      ],
    );
  } else {
    await execute(
      `INSERT INTO rounding_rules
         (id, main_account_id, name, mode, interval_minutes, min_duration_seconds,
          scope, valid_from, valid_until, calculation_version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        id,
        ctx.mainAccountId,
        parsed.name,
        parsed.mode,
        parsed.interval_minutes ?? null,
        parsed.min_duration_seconds ?? null,
        parsed.scope,
        parsed.valid_from,
        parsed.valid_until ?? null,
        parsed.calculation_version,
        ts,
        ts,
      ],
    );
  }
  const saved = await getRoundingRule(id);
  if (!saved) throw new Error(`upsertRoundingRule: Regel ${id} nach Schreiben nicht auffindbar`);
  return saved;
}

/**
 * Resolve the effective rounding rule for an entry by precedence
 * Projekt > Kunde > globaler Default (doc 07 §3, doc 10 §4). Returns the core
 * engine rule; falls back to the no-rounding rule when nothing is configured.
 */
export async function resolveRoundingRuleForEntry(args: {
  projectId?: Uuid | null;
  customerId?: Uuid | null;
}): Promise<RoundingRule> {
  const ctx = await getContext();

  if (args.projectId) {
    const rows = await select<{ rounding_rule_id: Uuid | null }>(
      `SELECT rounding_rule_id FROM projects WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
      [args.projectId, ctx.mainAccountId],
    );
    const ruleId = rows[0]?.rounding_rule_id;
    if (ruleId) {
      const rule = await getRoundingRule(ruleId);
      if (rule) return toCoreRule(rule);
    }
  }

  if (args.customerId) {
    const rows = await select<{ default_rounding_rule_id: Uuid | null }>(
      `SELECT default_rounding_rule_id FROM customers WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
      [args.customerId, ctx.mainAccountId],
    );
    const ruleId = rows[0]?.default_rounding_rule_id;
    if (ruleId) {
      const rule = await getRoundingRule(ruleId);
      if (rule) return toCoreRule(rule);
    }
  }

  const globals = await select<RoundingRuleRow>(
    `SELECT id, main_account_id, name, mode, interval_minutes, min_duration_seconds,
            scope, valid_from, valid_until, calculation_version
       FROM rounding_rules
      WHERE main_account_id = $1 AND scope = 'global' AND deleted_at IS NULL
      ORDER BY valid_from DESC, id DESC LIMIT 1`,
    [ctx.mainAccountId],
  );
  const globalRule = globals[0];
  return globalRule ? toCoreRule(globalRule) : NONE_RULE;
}

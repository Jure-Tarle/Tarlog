/**
 * rounding.ts, rounding-rule CRUD + precedence resolution Projekt > Kunde >
 * Default (doc 07 §3, doc 10 §4). Persists to `rounding_rules` (interval in
 * MINUTES, doc 06) but maps to the @tarlog/core {@link RoundingRule} shape (interval
 * in SECONDS) that `applyRounding`/`calculateEntry` consume.
 */
import { execute, select } from "../lib/db";
import { getContext, now } from "./context";
import { t } from "../i18n";
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
  priority: number;
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
            scope, priority, valid_from, valid_until, calculation_version
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
            scope, priority, valid_from, valid_until, calculation_version
       FROM rounding_rules
      WHERE main_account_id = $1 AND id = $2 AND deleted_at IS NULL LIMIT 1`,
    [ctx.mainAccountId, id],
  );
  return rows[0] ?? null;
}

/** Draft for {@link upsertRoundingRule}, id/main_account_id are filled here. */
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
              scope = $5, priority = $6, valid_from = $7, valid_until = $8, calculation_version = $9,
              updated_at = $10
        WHERE id = $11 AND main_account_id = $12`,
      [
        parsed.name,
        parsed.mode,
        parsed.interval_minutes ?? null,
        parsed.min_duration_seconds ?? null,
        parsed.scope,
        parsed.priority,
        parsed.valid_from,
        parsed.valid_until ?? null,
        parsed.calculation_version,
        ts,
        id,
        ctx.mainAccountId,
      ],
    );
  } else {
    await execute(
      `INSERT INTO rounding_rules
       (id, main_account_id, name, mode, interval_minutes, min_duration_seconds,
          scope, priority, valid_from, valid_until, calculation_version, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        ctx.mainAccountId,
        parsed.name,
        parsed.mode,
        parsed.interval_minutes ?? null,
        parsed.min_duration_seconds ?? null,
        parsed.scope,
        parsed.priority,
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

export interface RoundingHierarchyRow extends RoundingRuleRow {
  target_id: Uuid | null;
  target_name: string | null;
  assignment: "global" | "customer" | "project" | "unassigned";
}

export async function listRoundingHierarchy(): Promise<RoundingHierarchyRow[]> {
  const ctx = await getContext();
  return select<RoundingHierarchyRow>(
    `SELECT r.id, r.main_account_id, r.name, r.mode, r.interval_minutes,
            r.min_duration_seconds, r.scope, r.priority, r.valid_from,
            r.valid_until, r.calculation_version,
            CASE
              WHEN r.scope = 'global' THEN NULL
              WHEN p.id IS NOT NULL THEN p.id
              WHEN c.id IS NOT NULL THEN c.id
              ELSE NULL
            END AS target_id,
            COALESCE(p.name, c.name) AS target_name,
            CASE
              WHEN r.scope = 'global' THEN 'global'
              WHEN p.id IS NOT NULL THEN 'project'
              WHEN c.id IS NOT NULL THEN 'customer'
              ELSE 'unassigned'
            END AS assignment
       FROM rounding_rules r
       LEFT JOIN projects p ON p.id = (
         SELECT p2.id FROM projects p2
          WHERE p2.main_account_id = r.main_account_id AND p2.rounding_rule_id = r.id AND p2.deleted_at IS NULL
          ORDER BY p2.name LIMIT 1
       )
       LEFT JOIN customers c ON c.id = (
         SELECT c2.id FROM customers c2
          WHERE c2.main_account_id = r.main_account_id AND c2.default_rounding_rule_id = r.id AND c2.deleted_at IS NULL
          ORDER BY c2.name LIMIT 1
       )
      WHERE r.main_account_id = $1 AND r.deleted_at IS NULL
      ORDER BY r.priority DESC, r.name`,
    [ctx.mainAccountId],
  );
}

export async function assignRoundingRule(
  id: Uuid,
  assignment: "global" | "customer" | "project" | "unassigned",
  targetId?: Uuid | null,
): Promise<void> {
  const ctx = await getContext();
  const current = await getRoundingRule(id);
  if (!current) throw new Error(t("Rundungsregel wurde nicht gefunden."));
  if (current.scope === "global" && assignment !== "global") {
    throw new Error(t("Lege zuerst eine andere Regel als globale Basis fest."));
  }
  if ((assignment === "customer" || assignment === "project") && !targetId) {
    throw new Error(t("Wähle ein konkretes Ziel für diese Ausnahme."));
  }

  await execute("UPDATE projects SET rounding_rule_id = NULL, updated_at = $1 WHERE main_account_id = $2 AND rounding_rule_id = $3", [now(), ctx.mainAccountId, id]);
  await execute("UPDATE customers SET default_rounding_rule_id = NULL, updated_at = $1 WHERE main_account_id = $2 AND default_rounding_rule_id = $3", [now(), ctx.mainAccountId, id]);

  if (assignment === "global") {
    await execute("UPDATE rounding_rules SET scope = 'project', priority = 100, updated_at = $1 WHERE main_account_id = $2 AND scope = 'global' AND id <> $3", [now(), ctx.mainAccountId, id]);
    await execute("UPDATE rounding_rules SET scope = 'global', priority = $1, updated_at = $2 WHERE main_account_id = $3 AND id = $4", [current.priority, now(), ctx.mainAccountId, id]);
    return;
  }

  const priority = Math.max(current.priority, assignment === "project" ? 300 : assignment === "customer" ? 200 : 100);
  await execute("UPDATE rounding_rules SET scope = $1, priority = $2, updated_at = $3 WHERE main_account_id = $4 AND id = $5", [assignment === "unassigned" ? "project" : assignment, priority, now(), ctx.mainAccountId, id]);
  if (assignment === "project") {
    await execute("UPDATE projects SET rounding_rule_id = $1, updated_at = $2 WHERE main_account_id = $3 AND id = $4", [id, now(), ctx.mainAccountId, targetId]);
  } else if (assignment === "customer") {
    await execute("UPDATE customers SET default_rounding_rule_id = $1, updated_at = $2 WHERE main_account_id = $3 AND id = $4", [id, now(), ctx.mainAccountId, targetId]);
  }
}

export async function reorderRoundingRules(ids: readonly Uuid[]): Promise<void> {
  const ctx = await getContext();
  for (const [index, id] of ids.entries()) {
    await execute(
      "UPDATE rounding_rules SET priority = $1, updated_at = $2 WHERE main_account_id = $3 AND id = $4",
      [(ids.length - index) * 100, now(), ctx.mainAccountId, id],
    );
  }
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

  const candidates: RoundingRuleRow[] = [];
  if (args.projectId) {
    const rows = await select<{ rounding_rule_id: Uuid | null }>(
      `SELECT rounding_rule_id FROM projects WHERE id = $1 AND main_account_id = $2 LIMIT 1`,
      [args.projectId, ctx.mainAccountId],
    );
    const ruleId = rows[0]?.rounding_rule_id;
    if (ruleId) {
      const rule = await getRoundingRule(ruleId);
      if (rule) candidates.push(rule);
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
      if (rule) candidates.push(rule);
    }
  }

  const globals = await select<RoundingRuleRow>(
    `SELECT id, main_account_id, name, mode, interval_minutes, min_duration_seconds,
            scope, priority, valid_from, valid_until, calculation_version
       FROM rounding_rules
      WHERE main_account_id = $1 AND scope = 'global' AND deleted_at IS NULL
      ORDER BY priority DESC, valid_from DESC, id DESC LIMIT 1`,
    [ctx.mainAccountId],
  );
  if (globals[0]) candidates.push(globals[0]);
  const selected = candidates.sort((a, b) => b.priority - a.priority)[0];
  return selected ? toCoreRule(selected) : NONE_RULE;
}

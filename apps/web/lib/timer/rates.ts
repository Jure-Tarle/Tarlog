/**
 * lib/timer/rates.ts — Rundungsregel- + Rate-Auflösung für den Stop-/Nachtrag-
 * Pfad (doc 07 §5, doc 10 §4.0). Reihenfolge Rundung: Projekt > Kunde > Default
 * (global). Reihenfolge Rate: Task > Projekt > Kunde > Default. Baut die
 * `RoundingRule`/`RateSnapshot`-Eingaben für @tarlog/core (`applyRounding`,
 * `resolveRate`, `calculateEntry`). Keine Mutation — reine Leseauflösung.
 */
import type { PoolClient } from "pg";
import type {
  IntervalSeconds,
  RateSnapshot,
  RoundingRule,
} from "@tarlog/core";
import { resolveRate } from "@tarlog/core";
import { toNum, toNumOrNull } from "@/lib/sync/mutation";

interface RoundingRuleRow {
  id: string;
  mode: RoundingRule["mode"];
  interval_minutes: number | null;
  min_duration_seconds: number | null;
}

/** Ergebnis der Rundungsauflösung inkl. FK (NULL wenn keine Regel existiert). */
export interface ResolvedRounding {
  rule: RoundingRule;
  /** FK für time_entries.rounding_rule_id (NULL bei synthetischer none-Regel). */
  rule_id: string | null;
}

function mapRoundingRule(row: RoundingRuleRow): RoundingRule {
  const interval =
    row.interval_minutes != null
      ? ((row.interval_minutes * 60) as IntervalSeconds)
      : undefined;
  return {
    id: row.id,
    mode: row.mode,
    interval_seconds: interval,
    minimum_seconds: row.min_duration_seconds ?? undefined,
  };
}

async function roundingRuleById(
  client: PoolClient,
  mainAccountId: string,
  id: string,
  onDate: string,
): Promise<RoundingRule | null> {
  const res = await client.query<RoundingRuleRow>(
    `SELECT id, mode, interval_minutes, min_duration_seconds
       FROM rounding_rules
      WHERE id = $1 AND main_account_id = $2 AND deleted_at IS NULL
        AND valid_from <= $3 AND (valid_until IS NULL OR valid_until >= $3)
      LIMIT 1`,
    [id, mainAccountId, onDate],
  );
  const row = res.rows[0];
  return row ? mapRoundingRule(row) : null;
}

async function defaultRoundingRule(
  client: PoolClient,
  mainAccountId: string,
  onDate: string,
): Promise<RoundingRule | null> {
  const res = await client.query<RoundingRuleRow>(
    `SELECT id, mode, interval_minutes, min_duration_seconds
       FROM rounding_rules
      WHERE main_account_id = $1 AND deleted_at IS NULL AND scope = 'global'
        AND valid_from <= $2 AND (valid_until IS NULL OR valid_until >= $2)
      ORDER BY valid_from DESC
      LIMIT 1`,
    [mainAccountId, onDate],
  );
  const row = res.rows[0];
  return row ? mapRoundingRule(row) : null;
}

/**
 * Löst die Rundungsregel Projekt > Kunde > Default(global) für ein Leistungs-
 * datum ("YYYY-MM-DD") auf. Ohne Treffer: synthetische `none`-Regel, FK = NULL
 * (rounding ist dann Pass-Through, doc 07 §3.2 "none").
 */
export async function resolveRoundingRule(
  client: PoolClient,
  params: {
    mainAccountId: string;
    projectRoundingRuleId?: string | null;
    customerRoundingRuleId?: string | null;
    onDate: string;
  },
): Promise<ResolvedRounding> {
  if (params.projectRoundingRuleId) {
    const r = await roundingRuleById(
      client,
      params.mainAccountId,
      params.projectRoundingRuleId,
      params.onDate,
    );
    if (r) return { rule: r, rule_id: r.id };
  }
  if (params.customerRoundingRuleId) {
    const r = await roundingRuleById(
      client,
      params.mainAccountId,
      params.customerRoundingRuleId,
      params.onDate,
    );
    if (r) return { rule: r, rule_id: r.id };
  }
  const def = await defaultRoundingRule(client, params.mainAccountId, params.onDate);
  if (def) return { rule: def, rule_id: def.id };
  // Kein Regelwerk → Pass-Through ohne FK.
  return { rule: { id: "", mode: "none" }, rule_id: null };
}

interface RateRow {
  hourly_rate_cents: string | number;
  currency: string;
}

async function billingRate(
  client: PoolClient,
  params: {
    mainAccountId: string;
    scope: "task" | "project" | "customer" | "default";
    scopeId?: string | null;
    onDate: string;
  },
): Promise<{ amount_cents: number; currency: string } | null> {
  const scopeCol =
    params.scope === "task"
      ? "task_id"
      : params.scope === "project"
        ? "project_id"
        : params.scope === "customer"
          ? "customer_id"
          : null;
  const where =
    scopeCol && params.scopeId
      ? `scope = $2 AND ${scopeCol} = $3 AND valid_from <= $4 AND (valid_until IS NULL OR valid_until >= $4)`
      : `scope = 'default' AND valid_from <= $2 AND (valid_until IS NULL OR valid_until >= $2)`;
  const values =
    scopeCol && params.scopeId
      ? [params.mainAccountId, params.scope, params.scopeId, params.onDate]
      : [params.mainAccountId, params.onDate];
  const res = await client.query<RateRow>(
    `SELECT hourly_rate_cents, currency
       FROM billing_rates
      WHERE main_account_id = $1 AND deleted_at IS NULL AND ${where}
      ORDER BY valid_from DESC
      LIMIT 1`,
    values,
  );
  const row = res.rows[0];
  return row ? { amount_cents: toNum(row.hourly_rate_cents), currency: row.currency } : null;
}

/**
 * Löst den effektiven Stundensatz Task > Projekt > Kunde > Default auf und
 * liefert einen eingefrorenen `RateSnapshot` (doc 07 §5). Quelle je Ebene:
 * `billing_rates` (historisiert) mit Fallback auf die `*_hourly_rate_cents`-
 * Stammdaten. Existiert kein Satz, wird 0 in der Account-Default-Währung
 * genutzt (nicht-abrechenbare Einträge → Betrag 0, kein Fehler).
 */
export async function resolveEntryRate(
  client: PoolClient,
  params: {
    mainAccountId: string;
    taskId?: string | null;
    projectId?: string | null;
    customerId?: string | null;
    taskRateCents?: number | null;
    projectRateCents?: number | null;
    customerRateCents?: number | null;
    customerCurrency?: string | null;
    defaultCurrency: string;
    onDate: string;
  },
): Promise<RateSnapshot> {
  const currency =
    params.customerCurrency ?? params.defaultCurrency;

  const taskRate =
    (await billingRate(client, {
      mainAccountId: params.mainAccountId,
      scope: "task",
      scopeId: params.taskId,
      onDate: params.onDate,
    })) ??
    (params.taskRateCents != null
      ? { amount_cents: params.taskRateCents, currency }
      : null);

  const projectRate =
    (await billingRate(client, {
      mainAccountId: params.mainAccountId,
      scope: "project",
      scopeId: params.projectId,
      onDate: params.onDate,
    })) ??
    (params.projectRateCents != null
      ? { amount_cents: params.projectRateCents, currency }
      : null);

  const customerRate =
    (await billingRate(client, {
      mainAccountId: params.mainAccountId,
      scope: "customer",
      scopeId: params.customerId,
      onDate: params.onDate,
    })) ??
    (params.customerRateCents != null
      ? { amount_cents: params.customerRateCents, currency: params.customerCurrency ?? currency }
      : null);

  const defaultRate =
    (await billingRate(client, {
      mainAccountId: params.mainAccountId,
      scope: "default",
      onDate: params.onDate,
    })) ?? { amount_cents: 0, currency: params.defaultCurrency };

  return resolveRate({
    task: taskRate
      ? { amount_cents: taskRate.amount_cents, currency: taskRate.currency, source: "task" }
      : undefined,
    project: projectRate
      ? { amount_cents: projectRate.amount_cents, currency: projectRate.currency, source: "project" }
      : undefined,
    customer: customerRate
      ? { amount_cents: customerRate.amount_cents, currency: customerRate.currency, source: "customer" }
      : undefined,
    default: {
      amount_cents: defaultRate.amount_cents,
      currency: defaultRate.currency,
      source: "default",
    },
  });
}

/** Hilfs-Re-Export, damit Aufrufer BIGINT-Stammdaten-Cents sicher parsen. */
export { toNumOrNull };

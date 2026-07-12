/**
 * lib/crud/http.ts — gemeinsame CRUD-Bausteine: Pagination, Filter, Scoping,
 * Fehler-Mapping (doc 05 §5 "Design-Regeln", Pagination + einfache Filter).
 *
 * Alle Stammdaten sind streng `main_account`-gescoped: jede Query bekommt
 * `eq(table.main_account_id, auth.main_account_id)` — Body-`main_account_id`
 * wird NIE vertraut (immer aus dem AuthContext). Soft-Delete-Tabellen filtern
 * standardmäßig `deleted_at IS NULL`.
 */
import { z, type ZodTypeAny } from "zod";
import type { NextRequest } from "next/server";
import { and, asc, desc, eq, isNull, sql, type SQL, type Column } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { ApiError } from "@/lib/api";
import type { AuthContext } from "@/lib/session";
import { db } from "@/lib/db";

/** Obergrenze / Default für `limit` (doc 05 §5 Pagination). */
export const MAX_PAGE_LIMIT = 200;
export const DEFAULT_PAGE_LIMIT = 50;

/**
 * Basis-Query-Schema: Pagination + Soft-Delete-Sichtbarkeit + Sortierrichtung.
 * Werte kommen aus der URL (Strings) → `z.coerce` für Zahlen.
 */
export const paginationSchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
  /** `?include_deleted=true` zeigt auch soft-gelöschte Zeilen. */
  include_deleted: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
  /** Sortierrichtung nach `created_at`. */
  order: z.enum(["asc", "desc"]).default("desc"),
});
export type Pagination = z.infer<typeof paginationSchema>;

/** Pagination-Metablock der Listen-Antwort. */
export interface PageMeta {
  limit: number;
  offset: number;
  total: number;
}

export function pageMeta(p: Pagination, total: number): PageMeta {
  return { limit: p.limit, offset: p.offset, total };
}

/**
 * Validiert die URL-Query gegen ein konkretes Zod-Schema. Anders als
 * `lib/api.parseQuery` (das `ZodType<T>` mit Input = Output erwartet) erlaubt
 * diese Variante Schemas mit `z.coerce`/`.default()` (Input ≠ Output), wie sie
 * für Pagination-Filter nötig sind. Wirft ApiError("validation_error").
 */
export function parseListQuery<S extends ZodTypeAny>(
  req: NextRequest,
  schema: S,
): z.infer<S> {
  const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
  const result = schema.safeParse(obj);
  if (!result.success) {
    throw new ApiError(
      "validation_error",
      "Query-Validierung fehlgeschlagen.",
      result.error.issues,
    );
  }
  return result.data;
}

/** Urheber-Auflösung: Team → `user_id`, Solo → `main_account_id`. */
export function resolveActor(auth: AuthContext): {
  actor_id: string;
  device_id: string | null;
} {
  return {
    actor_id: auth.user_id ?? auth.main_account_id,
    device_id: auth.device_id ?? null,
  };
}

/** 404-Fehler (wird von requireAuth einheitlich formatiert). */
export function notFound(entity: string): ApiError {
  return new ApiError("not_found", `${entity} nicht gefunden.`);
}

/**
 * Mappt PostgreSQL-Unique-Violations (SQLSTATE 23505) auf einen 409-Conflict,
 * z. B. doppelte `customer_number`/`project_code`/Tag-`name`. Andere Fehler
 * werden unverändert weitergeworfen (→ 500 via toErrorResponse).
 */
export function mapDbError(err: unknown): never {
  if (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "23505"
  ) {
    throw new ApiError(
      "conflict",
      "Eindeutigkeits-Constraint verletzt (Duplikat).",
    );
  }
  throw err;
}

/** NUMERIC-Spalten erwarten Strings — Zahl → String (oder null). */
export function numericToString(v: number | null | undefined): string | null {
  return v == null ? null : String(v);
}

/** Gleichheit bei nullbaren FK-Spalten: NULL → `IS NULL`, sonst `= value`. */
export function matchNullable(col: Column, value: string | null | undefined): SQL {
  return value == null ? isNull(col) : eq(col, value);
}

/**
 * Zählt Zeilen für eine gegebene Bedingung (für den Pagination-`total`).
 * `count(*)::int` → node-pg liefert einen JS-Number.
 */
export async function countRows(
  table: PgTable,
  conds: SQL[],
): Promise<number> {
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(table)
    .where(and(...conds));
  return rows[0]?.value ?? 0;
}

/** created_at-Sortierung passend zur Richtung. */
export function orderByCreatedAt(col: Column, order: "asc" | "desc"): SQL {
  return order === "asc" ? asc(col) : desc(col);
}

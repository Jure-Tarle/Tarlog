/**
 * lib/crud/schemas.ts — Zod-Eingabeschemas für die Stammdaten-CRUD-Routen.
 *
 * Basis sind die @ptl/core-Schemas (single source of truth, doc 05 §4). Für die
 * API werden `id` und `main_account_id` entfernt (Server vergibt `id` = uuidv7,
 * `main_account_id` kommt aus dem AuthContext) und um die restlichen
 * schreibbaren DB-Spalten aus doc 06 ergänzt. `*Update` = partielles Schema.
 */
import { z } from "zod";
import {
  customerSchema,
  projectSchema,
  taskSchema,
  billingRateSchema,
  roundingRuleSchema,
  roundingModeEnum,
  CALCULATION_VERSION,
} from "@ptl/core";
import { paginationSchema } from "./http.js";

const OMIT_IDS = { id: true, main_account_id: true } as const;
const uuid = z.string().uuid();

// ---------------------------------------------------------------------------
// customers (doc 06 §A.2, doc 10 §1)
// ---------------------------------------------------------------------------

export const customerCreateSchema = customerSchema.omit(OMIT_IDS).extend({
  billing_address: z.string().nullish(),
  shipping_address: z.string().nullish(),
  default_invoice_note: z.string().nullish(),
  default_language: z.string().nullish(),
  internal_notes: z.string().nullish(),
  external_notes: z.string().nullish(),
});
export const customerUpdateSchema = customerCreateSchema.partial();
export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;

export const customerQuerySchema = paginationSchema.extend({
  status: z.enum(["active", "paused", "archived"]).optional(),
  q: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// projects (doc 06 §A.2, doc 10 §2)
// ---------------------------------------------------------------------------

export const projectCreateSchema = projectSchema.omit(OMIT_IDS).extend({
  retainer_id: uuid.nullish(),
  default_task_id: uuid.nullish(),
  allowed_task_ids: z.array(uuid).nullish(),
  mandatory_tags: z.array(uuid).nullish(),
  budget_hours: z.number().nonnegative().nullish(),
  budget_money_cents: z.number().int().nullish(),
  budget_warn_thresholds: z.array(z.number()).nullish(),
  planned_hours: z.number().nonnegative().nullish(),
  internal_notes: z.string().nullish(),
  external_description: z.string().nullish(),
});
export const projectUpdateSchema = projectCreateSchema.partial();
export type ProjectCreate = z.infer<typeof projectCreateSchema>;
export type ProjectUpdate = z.infer<typeof projectUpdateSchema>;

const billingTypeEnum = z.enum([
  "hourly",
  "day_rate",
  "fixed_fee",
  "retainer",
  "non_billable",
]);

export const projectQuerySchema = paginationSchema.extend({
  customer_id: uuid.optional(),
  status: z
    .enum(["planned", "active", "paused", "completed", "archived"])
    .optional(),
  billing_type: billingTypeEnum.optional(),
  q: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// tasks (doc 06 §A.2, doc 10 §3)
// ---------------------------------------------------------------------------

export const taskCreateSchema = taskSchema.omit(OMIT_IDS).extend({
  default_description_template: z.string().nullish(),
});
export const taskUpdateSchema = taskCreateSchema.partial();
export type TaskCreate = z.infer<typeof taskCreateSchema>;
export type TaskUpdate = z.infer<typeof taskUpdateSchema>;

export const taskQuerySchema = paginationSchema.extend({
  project_id: uuid.optional(),
  status: z.enum(["active", "archived"]).optional(),
  q: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// tags (doc 06 §A.2) — kein Core-Schema, inline
// ---------------------------------------------------------------------------

export const tagCreateSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  color: z.string().nullish(),
});
export const tagUpdateSchema = tagCreateSchema.partial();
export type TagCreate = z.infer<typeof tagCreateSchema>;
export type TagUpdate = z.infer<typeof tagUpdateSchema>;

export const tagQuerySchema = paginationSchema.extend({
  q: z.string().min(1).optional(),
});

// ---------------------------------------------------------------------------
// billing_rates (doc 06 §A.4, doc 10 §4.0/§4.1) — historisiert über valid_from
// ---------------------------------------------------------------------------

export const rateCreateSchema = billingRateSchema.omit(OMIT_IDS).extend({
  /** Vorherigen offenen Satz desselben Scopes automatisch schließen (valid_until). */
  supersede: z.boolean().optional().default(true),
});
export const rateUpdateSchema = billingRateSchema.omit(OMIT_IDS).partial();
export type RateCreate = z.infer<typeof rateCreateSchema>;
export type RateUpdate = z.infer<typeof rateUpdateSchema>;

export const rateQuerySchema = paginationSchema.extend({
  scope: z.enum(["default", "customer", "project", "task"]).optional(),
  customer_id: uuid.optional(),
  project_id: uuid.optional(),
  task_id: uuid.optional(),
});

// ---------------------------------------------------------------------------
// rounding_rules (doc 06 §A.4, doc 07 §3) — historisiert über valid_from
// ---------------------------------------------------------------------------

export const roundingRuleCreateSchema = roundingRuleSchema
  .omit(OMIT_IDS)
  .extend({
    calculation_version: z
      .number()
      .int()
      .positive()
      .default(CALCULATION_VERSION),
  });
export const roundingRuleUpdateSchema = roundingRuleCreateSchema.partial();
export type RoundingRuleCreate = z.infer<typeof roundingRuleCreateSchema>;
export type RoundingRuleUpdate = z.infer<typeof roundingRuleUpdateSchema>;

export const roundingRuleQuerySchema = paginationSchema.extend({
  scope: z.enum(["global", "customer", "project", "task"]).optional(),
  mode: roundingModeEnum.optional(),
  q: z.string().min(1).optional(),
});

/**
 * lib/timer/schemas.ts, Request-Validierung (zod) für Timer- und Zeiteintrag-
 * Routen. NUR die client-gesendeten Felder; abgeleitete Werte (Netto, Rundung,
 * Rate-Snapshot, Beträge) berechnet der Server via @tarlog/core. Enum-Wiederver-
 * wendung aus @tarlog/core (`backdateReasonEnum`, `timeEntrySourceEnum`), damit die
 * Wahrheit im Core bleibt.
 */
import { z } from "zod";
import { backdateReasonEnum, timeEntrySourceEnum } from "@tarlog/core";

const epochMs = z.number().int();
const uuid = z.string().uuid();

/** Gemeinsame Sync-Steuerfelder jeder Mutation (Compare-and-Set + HLC). */
const syncControl = {
  expected_server_revision: z.number().int().nullish(),
  correlation_id: z.string().nullish(),
  hlc: z.string().nullish(),
  local_revision: z.number().int().nonnegative().nullish(),
};

// --- Timer ----------------------------------------------------------------

export const timerStartSchema = z.object({
  project_id: uuid.nullish(),
  task_id: uuid.nullish(),
  started_at: epochMs.nullish(),
  timezone: z.string().min(1).nullish(),
  description: z.string().nullish(),
  ...syncControl,
});
export type TimerStartBody = z.infer<typeof timerStartSchema>;

export const timerPauseSchema = z.object({
  timer_id: uuid.nullish(),
  ...syncControl,
});
export type TimerPauseBody = z.infer<typeof timerPauseSchema>;

export const timerResumeSchema = timerPauseSchema;
export type TimerResumeBody = z.infer<typeof timerResumeSchema>;

export const timerStopSchema = z.object({
  timer_id: uuid.nullish(),
  ended_at: epochMs.nullish(),
  description: z.string().nullish(),
  is_billable: z.boolean().nullish(),
  ...syncControl,
});
export type TimerStopBody = z.infer<typeof timerStopSchema>;

export const timerSwitchSchema = z.object({
  timer_id: uuid.nullish(),
  project_id: uuid.nullish(),
  task_id: uuid.nullish(),
  ...syncControl,
});
export type TimerSwitchBody = z.infer<typeof timerSwitchSchema>;

// --- Zeiteinträge ---------------------------------------------------------

const breakInput = z.object({
  started_at: epochMs,
  ended_at: epochMs,
});

export const timeEntryCreateSchema = z.object({
  project_id: uuid.nullish(),
  task_id: uuid.nullish(),
  customer_id: uuid.nullish(),
  timezone: z.string().min(1).nullish(),
  actual_started_at: epochMs,
  actual_ended_at: epochMs,
  breaks: z.array(breakInput).optional(),
  description: z.string().nullish(),
  summary: z.string().nullish(),
  is_billable: z.boolean().nullish(),
  client_visible: z.boolean().nullish(),
  source: timeEntrySourceEnum.optional(),
  backdate_reason: backdateReasonEnum.nullish(),
  correction_reason: z.string().nullish(),
  ...syncControl,
});
export type TimeEntryCreateBody = z.infer<typeof timeEntryCreateSchema>;

export const timeEntryUpdateSchema = z.object({
  project_id: uuid.nullish(),
  task_id: uuid.nullish(),
  customer_id: uuid.nullish(),
  timezone: z.string().min(1).nullish(),
  actual_started_at: epochMs.nullish(),
  actual_ended_at: epochMs.nullish(),
  breaks: z.array(breakInput).nullish(),
  description: z.string().nullish(),
  summary: z.string().nullish(),
  is_billable: z.boolean().nullish(),
  client_visible: z.boolean().nullish(),
  correction_reason: z.string().nullish(),
  /** Optimistische Sperre (Feld-Level-LWW-Basis, doc 04 §6 Fall 6). */
  expected_sync_version: z.number().int().nullish(),
  ...syncControl,
});
export type TimeEntryUpdateBody = z.infer<typeof timeEntryUpdateSchema>;

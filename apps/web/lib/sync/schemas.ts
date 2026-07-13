/**
 * lib/sync/schemas.ts — Request-Validierung für das Sync-Protokoll (doc 04 §1,
 * §5). Client-Events tragen event_id (UUIDv7, Idempotenz), HLC, local_revision
 * und ein optionales base_version (sync_version/server_revision zum Zeitpunkt
 * der lokalen Änderung → Konflikterkennung).
 */
import { z } from "zod";

const uuid = z.string().uuid();

export const syncEventSchema = z.object({
  /** UUIDv7 des Client-Events — Idempotenzschlüssel (doc 04 §1.4). */
  event_id: uuid,
  /** @tarlog/db-Tabellenname der Entität. */
  entity_type: z.string().min(1),
  /** UUID der betroffenen Entität. */
  entity_id: z.string().min(1),
  operation: z.enum(["create", "update", "delete"]),
  hlc: z.string().nullish(),
  local_revision: z.number().int().nullish(),
  /** sync_version/server_revision-Basis der lokalen Änderung (LWW/Konflikt). */
  base_version: z.number().int().nullish(),
  data: z.record(z.unknown()),
});
export type SyncEventInput = z.infer<typeof syncEventSchema>;

export const syncPushSchema = z.object({
  events: z.array(syncEventSchema).min(1).max(500),
});
export type SyncPushBody = z.infer<typeof syncPushSchema>;

/** Query-Schema für /api/sync/changes und /api/sync/poll. */
export const syncPullQuerySchema = z.object({
  since: z.coerce.number().int().nonnegative().default(0),
  limit: z.coerce.number().int().positive().max(1000).default(200),
  timeout: z.coerce.number().int().positive().max(25000).default(25000),
});
export type SyncPullQuery = z.infer<typeof syncPullQuerySchema>;

/**
 * lib/events.ts, Live-Kanal-Publish (doc 05 §5 Live-Event-Spalte, §7; doc 04 §5.2).
 *
 * Entkopplung Next-Routen ↔ WebSocket-Server: Eine API-Route ruft
 * `publishEvent(...)` auf. Das schreibt (a) einen append-only Eintrag in
 * `sync_events` (Outbox/Audit, doc 04 §1) und feuert (b) `pg_notify` auf dem
 * PostgreSQL-Kanal 'ptl_events'. Der Custom-Server (server.mjs) lauscht via
 * LISTEN auf denselben Kanal und broadcastet an die WS-Clients des jeweiligen
 * main_account. So funktioniert der Live-Kanal auch prozess-/instanzübergreifend.
 *
 * VERTRAG für Modul-Autoren:
 *   import { publishEvent, PTL_EVENTS_CHANNEL } from "@/lib/events";
 *   await publishEvent({
 *     type: "timer.started",
 *     main_account_id, device_id,
 *     entity_type: "timer_states", entity_id: timerId,
 *     operation: "update",
 *     data: { timer_id: timerId, project_id, started_at },
 *   });
 */
import { uuidv7 } from "uuidv7";
import { pool } from "./db.js";

/** PostgreSQL LISTEN/NOTIFY-Kanal für den Live-Kanal (server.mjs LISTEN'ed). */
export const PTL_EVENTS_CHANNEL = "ptl_events" as const;

/**
 * Die 12 Live-/Webhook-Event-Typen (doc 05 §5 Live-Event-Spalte + §6).
 * `sync.completed` ist der Live-Sync-Abschluss (doc 04 §5.2 Nr. 14).
 */
export type PtlEventType =
  | "timer.started"
  | "timer.paused"
  | "timer.resumed"
  | "timer.stopped"
  | "time_entry.created"
  | "manual_entry.created"
  | "time_entry.updated"
  | "time_entry.deleted"
  | "invoice.created"
  | "export.created"
  | "sync.conflict"
  | "compliance.warning"
  | "device.connected"
  | "device.revoked"
  | "sync.completed";

/** DB-Operation eines Events (doc 04 §1 `operation`). */
export type PtlOperation = "create" | "update" | "delete";

/** Eingabe für `publishEvent`. `data` ist der fachliche Payload (frei je Typ). */
export interface PublishEventInput {
  type: PtlEventType;
  /** Scope: nur Geräte dieses main_account empfangen das Event. */
  main_account_id: string;
  /** Urheber-Gerät (für Echo-Vermeidung/Audit). */
  device_id: string;
  /** @tarlog/db-Tabellenname der betroffenen Entität (exakt). */
  entity_type: string;
  /** UUIDv7 der betroffenen Entität. */
  entity_id: string;
  /** DB-Operation. */
  operation: PtlOperation;
  /** Fachlicher Payload (Live-Update-Daten, doc 05 §6 Payload-Skizze `data`). */
  data: Record<string, unknown>;
  /** Optionale Korrelation (Idempotenz/Retry, doc 05 §5). */
  correlation_id?: string;
  /** HLC-Zeitstempel; wenn leer, wird ein monotoner Fallback erzeugt. */
  hlc?: string;
  /** Lokaler Änderungszähler des Urheber-Geräts (doc 04 §1.3). */
  local_revision?: number;
}

/**
 * Einheitlicher NOTIFY-Umschlag (doc 05 §6). Genau dieses JSON liest server.mjs
 * aus `msg.payload` und broadcastet es an die WS-Clients. `event_id` = UUIDv7,
 * identisch mit der `sync_events.id`.
 */
export interface PtlEventEnvelope {
  event_id: string;
  type: PtlEventType;
  created_at: number;
  main_account_id: string;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation: PtlOperation;
  data: Record<string, unknown>;
  correlation_id?: string;
}

/** Notify an envelope that was already inserted transactionally in an outbox. */
export async function notifyEvent(envelope: PtlEventEnvelope): Promise<void> {
  await pool.query("SELECT pg_notify($1, $2)", [
    PTL_EVENTS_CHANNEL,
    JSON.stringify(envelope),
  ]);
}

let hlcCounter = 0;
/** Minimaler monotoner HLC-Fallback (echte HLC liefert der Sync-Autor). */
function fallbackHlc(now: number): string {
  hlcCounter = (hlcCounter + 1) % 0xffff;
  return `${now.toString(16)}:${hlcCounter.toString(16)}`;
}

/**
 * Schreibt das Event in `sync_events` (append-only) und feuert `pg_notify`
 * auf 'ptl_events'. Beide über eine Transaktion, damit NOTIFY erst bei
 * erfolgreichem Insert zugestellt wird. Gibt den zugestellten Umschlag zurück.
 */
export async function publishEvent(
  input: PublishEventInput,
): Promise<PtlEventEnvelope> {
  const now = Date.now();
  const eventId = uuidv7();
  const hlc = input.hlc ?? fallbackHlc(now);

  const envelope: PtlEventEnvelope = {
    event_id: eventId,
    type: input.type,
    created_at: now,
    main_account_id: input.main_account_id,
    device_id: input.device_id,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    operation: input.operation,
    data: input.data,
    correlation_id: input.correlation_id,
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO sync_events
         (id, main_account_id, device_id, entity_type, entity_id, operation,
          payload_json, hlc, local_revision, correlation_id, applied, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        eventId,
        input.main_account_id,
        input.device_id,
        input.entity_type,
        input.entity_id,
        input.operation,
        JSON.stringify(input.data),
        hlc,
        input.local_revision ?? 0,
        input.correlation_id ?? null,
        false,
        now,
      ],
    );
    // pg_notify-Payload-Limit ~8000 Bytes; große Payloads tragen nur die IDs,
    // der Client zieht Details per Sync-Pull nach (doc 04 §5).
    await client.query("SELECT pg_notify($1, $2)", [
      PTL_EVENTS_CHANNEL,
      JSON.stringify(envelope),
    ]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return envelope;
}

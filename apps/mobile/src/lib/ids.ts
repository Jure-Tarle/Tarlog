/**
 * ids.ts, UUIDv7 generation (doc 05 §8, doc 06 §0).
 *
 * All primary keys and sync `event_id`s are UUIDv7: time-sortable, collision-
 * safe across offline devices, and identical to the id scheme used by the
 * server and desktop clients. Never use Math.random or uuidv4 for entity ids.
 */
import { uuidv7 } from "uuidv7";
import type { Uuid } from "@tarlog/core";

/** Generate a fresh UUIDv7 as a string. */
export function newId(): Uuid {
  return uuidv7();
}

/**
 * Timer-Konfliktlogik: Single-Timer-Regel (doc 04 §3/§4b).
 *
 * Ohne laufenden Server, mit better-sqlite3 in-memory. Das Schema ist
 * strukturgleich zur @ptl/db-SQLite-Definition `sqlite.timerStates`: der
 * partielle UNIQUE-Index `ux_timer_states_single_active` auf
 * (main_account_id) WHERE status IN ('running','paused') erzwingt den
 * Konflikt „Es läuft bereits ein aktiver Timer" (conflict_case 1) bereits auf
 * DB-Ebene. Der Test bindet sich über getTableName/getTableColumns an das
 * echte @ptl/db-Schema und verifiziert die Invariante gegen die echte
 * SQLite-Engine.
 */
import Database from "better-sqlite3";
import { getTableColumns, getTableName } from "drizzle-orm";
import { sqlite } from "@ptl/db";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Aus der @ptl/db-Definition abgeleitete, strukturgleiche DDL (Kernspalten +
// der single-active-Index). SQLite erzwingt Enums nicht — status als TEXT.
const DDL = `
CREATE TABLE timer_states (
  timer_id TEXT PRIMARY KEY,
  main_account_id TEXT NOT NULL,
  current_time_entry_id TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  project_id TEXT,
  task_id TEXT,
  started_at INTEGER,
  paused_at INTEGER,
  accumulated_pause_seconds INTEGER NOT NULL DEFAULT 0,
  sync_version INTEGER NOT NULL DEFAULT 0,
  server_revision INTEGER,
  local_revision INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_timer_states_single_active
  ON timer_states (main_account_id)
  WHERE status IN ('running','paused');
`;

let db: Database.Database;

function insertTimer(timerId: string, account: string, status: string): void {
  db.prepare(
    `INSERT INTO timer_states (timer_id, main_account_id, status) VALUES (?, ?, ?)`,
  ).run(timerId, account, status);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(DDL);
});

afterEach(() => {
  db.close();
});

describe("@ptl/db sqlite.timerStates — Schema-Bindung", () => {
  it("heißt timer_states und trägt die konfliktrelevanten Spalten", () => {
    expect(getTableName(sqlite.timerStates)).toBe("timer_states");
    const cols = getTableColumns(sqlite.timerStates);
    for (const c of ["timer_id", "main_account_id", "status"]) {
      expect(cols).toHaveProperty(c);
    }
  });
});

describe("Single-Timer-Regel (partieller UNIQUE-Index)", () => {
  it("erlaubt genau EINEN running Timer je Konto", () => {
    expect(() => insertTimer("t1", "acc-A", "running")).not.toThrow();
  });

  it("blockt einen ZWEITEN aktiven Timer desselben Kontos (running → conflict)", () => {
    insertTimer("t1", "acc-A", "running");
    expect(() => insertTimer("t2", "acc-A", "running")).toThrow(/UNIQUE|constraint/i);
  });

  it("zählt auch 'paused' als aktiv (running + paused kollidieren)", () => {
    insertTimer("t1", "acc-A", "running");
    expect(() => insertTimer("t2", "acc-A", "paused")).toThrow(/UNIQUE|constraint/i);
  });

  it("lässt inaktive Zustände (stopped/idle) unbegrenzt zu", () => {
    insertTimer("t1", "acc-A", "running");
    expect(() => {
      insertTimer("t2", "acc-A", "stopped");
      insertTimer("t3", "acc-A", "idle");
      insertTimer("t4", "acc-A", "needs_description");
    }).not.toThrow();
  });

  it("isoliert je main_account (anderes Konto darf parallel laufen)", () => {
    insertTimer("t1", "acc-A", "running");
    expect(() => insertTimer("t2", "acc-B", "running")).not.toThrow();
  });

  it("erlaubt einen neuen aktiven Timer, nachdem der alte gestoppt wurde", () => {
    insertTimer("t1", "acc-A", "running");
    db.prepare(`UPDATE timer_states SET status='stopped' WHERE timer_id=?`).run("t1");
    expect(() => insertTimer("t2", "acc-A", "running")).not.toThrow();
  });
});

# @ptl/desktop

Tauri 2.x desktop app for **Project Time Ledger** (macOS priority + Windows).
Local-first SQLite, optional server sync. Shares `@ptl/core` (time/rounding/
compliance/billing + zod) and `@ptl/db` (Drizzle schema) with web + iOS.

## Run

```sh
pnpm install                       # from the monorepo root
pnpm --filter @ptl/desktop tauri dev   # Rust host + Vite frontend
```

Frontend-only (no Rust host): `pnpm --filter @ptl/desktop dev` (Vite on :1420).

## Checks

```sh
pnpm --filter @ptl/desktop typecheck          # tsc --noEmit
pnpm --filter @ptl/desktop exec vitest run    # frontend tests
cd src-tauri && cargo check                    # Rust host
```

## Parallel work — 4 module authors, no collisions

`package.json` is **FINAL** — do not add deps. The skeleton is split so each
author owns disjoint files:

| Author | Owns (edit freely) | Do NOT touch |
|---|---|---|
| **Rust host** | `src-tauri/src/commands.rs` (fill stubs), `src-tauri/src/tray.rs` | command names/args/returns; `lib.rs` invoke list |
| **Frontend UI** | `src/pages/*.tsx` (fill page stubs), `src/components/*` | `src/App.tsx`, `src/pages/routes.tsx` |
| **Data layer** | `src/lib/bridge.ts`, `src/lib/db.ts`, `src/lib/repositories/*` (new) | contract signatures in `bridge.ts` |
| **Build/config** | (owns nothing runtime) `tauri.conf.json`, `capabilities/*`, `vite.config.ts` | `package.json` |

### The two contracts (change in lockstep or not at all)

1. **Frontend ↔ Rust** — `src/lib/bridge.ts` ⇔ `src-tauri/src/commands.rs`.
   18 commands: `db_init`, `db_migrate`, `timer_start`, `timer_pause`,
   `timer_resume`, `timer_stop`, `timer_get_state`, `entry_backdate`,
   `list_time_entries`, `create_customer`, `list_customers`, `create_project`,
   `list_projects`, `run_backup`, `app_lock_check`, `set_server_connection`,
   `sync_push`, `sync_pull`. JS passes **camelCase** args; Tauri maps them to the
   **snake_case** Rust params.
2. **Data model** — `@ptl/core` types + zod schemas (doc 06). Wire rows reuse
   `CustomerInput` / `ProjectInput` / `TimeEntryInput` / `TimerStateInput`, so
   the shape cannot drift.

Read queries → `src/lib/db.ts` (`tauri-plugin-sql`). Business mutations (timer
state machine, rounding, snapshots, sync events) → `bridge.ts` commands only.

## Design direction (BINDING — doc 11 §1)

Calm, dense **ledger** aesthetic: neutral grays + exactly **one** accent
(steel blue); compliance traffic light (green/amber/red) is the only extra,
semantic color; **tabular/monospaced** figures for all times + money; **no**
default shadows; **no** uniform radii; first-class Dark **and** Light; restrained
motion (`prefers-reduced-motion` honored). Tokens live in `src/styles.css` —
pages consume tokens, never hard-code colors/sizes.

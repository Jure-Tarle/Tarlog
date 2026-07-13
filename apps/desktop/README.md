# @tarlog/desktop

Tauri 2.x desktop app for **Tarlog** (macOS priority + Windows).
Local-first SQLite, optional server sync. Shares `@tarlog/core` (time/rounding/
compliance/billing + zod) and `@tarlog/db` (Drizzle schema) with web + iOS.

## Run

```sh
pnpm install                       # from the monorepo root
pnpm --filter @tarlog/desktop tauri dev   # Rust host + Vite frontend
```

Frontend-only (no Rust host): `pnpm --filter @tarlog/desktop dev` (Vite on :1420).

## Checks

```sh
pnpm --filter @tarlog/desktop typecheck          # tsc --noEmit
pnpm --filter @tarlog/desktop exec vitest run    # frontend tests
cd src-tauri && cargo check                    # Rust host
```

## Parallel work — 4 module authors, no collisions

The application contracts are stable. UI dependencies may be added deliberately
for the shared design system; data and Rust contracts must continue to change
only in lockstep. The original implementation was split as follows:

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
2. **Data model** — `@tarlog/core` types + zod schemas (doc 06). Wire rows reuse
   `CustomerInput` / `ProjectInput` / `TimeEntryInput` / `TimerStateInput`, so
   the shape cannot drift.

Read queries → `src/lib/db.ts` (`tauri-plugin-sql`). Business mutations (timer
state machine, rounding, snapshots, sync events) → `bridge.ts` commands only.

## Design direction (BINDING — doc 11 §1)

**Tarlog Flow** is an Apple-inspired, spatial workspace: bright white canvas in
Light Mode, deep graphite in Dark Mode, system blue for focus and primary
actions, platform system type, tabular figures for time and money, and layered
materials for navigation, cards, and dialogs. Motion is immediate,
spring-driven, interruptible, and always honors reduced-motion, reduced-
transparency, and increased-contrast preferences. Tokens live in
`src/styles.css`; pages consume semantic roles rather than hard-coded theme
colors.

On macOS the same system becomes platform-native where Tauri exposes public
APIs: an overlay titlebar keeps the real Traffic Lights, the application uses a
native AppKit menu hierarchy and template menu-bar icon, WebKit renders native
select/checkbox/date controls, and the chosen theme is forwarded to the native
window. Private transparency/vibrancy APIs are intentionally excluded so the
bundle remains compatible with signing, notarization, and Mac App Store rules.
Brand masters live in `../../assets/brand/`; generated bundle and tray assets
live in `src-tauri/icons/`.

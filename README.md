# Tarlog

Professional, audit-proof, privacy-friendly time tracking for a single person
(freelancer, consultant, developer, designer, creative). Usable locally
**without any cloud requirement**, and optionally as a self-hosted web
application with a shared PostgreSQL database for multiple browsers. Native
desktop↔server sync is currently experimental.

> Legal statements in the product are product notices, not legal advice.

Full product and architecture writeup: [`docs/project-time-ledger/`](docs/project-time-ledger/README.md).
The current Apple HIG redesign audit with platform boundaries, target system
and test matrix is in [`docs/apple-redesign-2026.md`](docs/apple-redesign-2026.md).

## Monorepo

pnpm workspace, TypeScript everywhere, shared core package for time, rounding,
compliance and billing.

| Package | Purpose | Stack | Status |
|---|---|---|---|
| [`packages/core`](packages/core) | Business logic: time calculation, rounding, DE/EU compliance, billing, onboarding, Zod schemas | TypeScript, luxon, zod | Build, types and tests in CI |
| [`packages/db`](packages/db) | Dual-dialect data model | Drizzle ORM (SQLite + PostgreSQL) | Build and types in CI |
| [`apps/web`](apps/web) | Self-hosted server + browser app: auth, REST, long-poll/WebSocket, PDF/CSV, invoices, Docker | Next.js 15, pg, pdfmake, ws | Server smoke test in CI |
| [`apps/desktop`](apps/desktop) | macOS/Windows: local SQLite offline mode, timer, backdating, tray, backup, experimental sync client | Tauri 2, rusqlite, React/Vite | local mode integration-tested |
| [`apps/mobile`](apps/mobile) | iOS prepared: expo-sqlite local, timer/today/backdating, sync architecture | Expo 52, React Native | type checking in CI |

### Core decisions (from research)

Drizzle instead of Prisma (Tauri SQLite compatibility, dialect switch) ·
WebSocket with long-poll fallback · server-side event log with optimistic
versions and hybrid logical clock (no CRDT) · single timer via partial
`UNIQUE` index on `timer_states` ·
pdfmake portable · UUIDv7 PKs · money = integer cents · time = UTC epoch-ms +
IANA timezone per entry · **`actual_duration_seconds` (gross) strictly
separate from `billing_duration_seconds` (rounded); rounding never overwrites
the real time.**

## Build, test, verify

```bash
pnpm install --frozen-lockfile
pnpm version:check v0.0.4
pnpm -r build
pnpm -r test
pnpm -r typecheck

# Desktop Rust unit and integration tests, headless with disposable SQLite DBs:
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets

# iOS app (architecture prepared):
pnpm --filter @tarlog/mobile exec tsc --noEmit

# Server end-to-end against a disposable database:
./scripts/smoke.sh

# Native desktop binary (without signing):
pnpm --filter @tarlog/desktop exec tauri build --no-bundle

# Self-host (replace secrets in .env first):
cp .env.example .env
docker compose config --quiet
docker compose up -d --build
```

All three layers also run in CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)):
version consistency, builds, unit and type checks, `cargo test --all-targets`
and the smoke run against a real PostgreSQL service.

### What the smoke run proves

The 15-minute round-up (70 minutes actual time → 75 minutes billing time,
`actual_duration_seconds` stays 4200) · single-timer invariant (second start →
409) · backdating with a reason · ArbZG §4 violation over 6 hours without a
break · PDF timesheet and CSV with separate columns · invoice: number assigned
only on finalization, PDF, cancellation as a counter-invoice · sync conflict
(stale `base_version` → 409 + `conflict_records`, nothing silently discarded) ·
live sync over WebSocket to a second client · audit log.

## Onboarding

An empty workspace automatically opens a versioned setup assistant on first
launch. It cannot be accidentally skipped, resumes at the saved step after a
restart, and does not retroactively block already-used installations with an
existing project.

The flow explains and links the central workflows:

1. Get to know the operating mode and workspace.
2. Optionally create a customer, and mandatorily create the first project as
   real master data.
3. Start, pause, resume and stop active tracking.
4. Backdate past working time with a description and reason.
5. Understand browser sync and the limits of experimental native
   synchronization.
6. Complete setup and switch to the regular workspace.

On the web, `/setup` runs once beforehand: the main account, password and
optional profile details are created there. This account setup is
deliberately separate from the subsequent product onboarding.

## Self-hosting and sync

| Operating mode | Status |
|---|---|
| macOS/Windows fully local with SQLite | supported |
| Self-hosted web application with PostgreSQL | supported |
| Multiple browsers on the same Tarlog URL | supported; all work directly on the same PostgreSQL database |
| Server REST, conflict detection and WebSocket path | verified server-side by smoke test |
| Native desktop app ↔ server | **experimental, not end-to-end production-ready** |
| iOS ↔ server | prepared, not production-ready |

The desktop pull first durably stores incoming raw events with `applied=0`.
Only a successfully awaited, idempotent merge into the local domain tables may
set them to `applied=1` and advance the pull cursor. Since this domain merge
is not yet wired up in the current desktop state, a repeatable error is
deliberately shown for incoming changes instead of a false sync success; the
raw data and the old cursor are preserved.

The reverse direction is also not yet complete: not every local domain
mutation already produces an outbox event. The device token currently lives
in the desktop's WebView `localStorage` instead of the OS keychain, and the
Tauri WebView does not yet have an enabled Content Security Policy (`csp:
null`). The experimental desktop sync is therefore neither a complete offline
queue nor a backup or security boundary.

The currently verified deployment path is building from the repository; no
available container registry image is assumed:

```bash
umask 077
cp .env.example .env
chmod 600 .env

# Generate secure values and enter them in .env:
openssl rand -hex 32  # SESSION_SECRET
openssl rand -hex 24  # POSTGRES_PASSWORD

docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:3000/api/health
```

HTTPS is mandatory for external access. Set
`NEXT_PUBLIC_APP_URL=https://tarlog.example.com`, bind the internal port only
to loopback or protect it with a firewall, and forward it with, for example,
Caddy:

```caddy
tarlog.example.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:3000 {
        header_up X-Forwarded-For {remote_host}
    }
}
```

Caddy passes through WebSocket upgrades automatically. Other reverse proxies
must preserve the original `Host`, upgrade `/api/ws`, and allow a read timeout
of more than 25 seconds for `/api/sync/poll`. Currently run exactly one `web`
instance, because pairing codes and rate limits are process-local.

`TARLOG_TRUST_PROXY=0` is the safe default for direct access: Tarlog then
ignores `X-Forwarded-For` and uses the direct TCP peer as the client IP for
auth/pairing protection limits. Only set the variable to `1` if a local,
trusted Caddy or reverse proxy is the sole direct peer and it sanitizes or
overwrites incoming `X-Forwarded-For` as described above. In all other cases
it stays `0`.

The complete guide to secure `.env`, browser sync, TLS, backup/restore,
updates and known limits is in
[`apps/web/README.md`](apps/web/README.md).

## Version 1 acceptance criteria (spec §35) → implementation

| # | Criterion | Implementation |
|---|---|---|
| 1 | App usable locally without a server | `apps/desktop` local SQLite mode (rusqlite), fully offline |
| 2 | Local main profile | `db.rs` bootstrap: `main_accounts`/`local_profiles` singleton |
| 3 | Create customers | `commands::create_customer`, `data/customers`, web `POST /api/customers` |
| 4 | Create projects | `commands::create_project`, `data/projects`, web `POST /api/projects` |
| 5 | Create tasks | `tasks` table, `data/tasks`, web `POST /api/tasks` |
| 6 | Hourly rates | `billing_rates` (historized), `resolveRate` (task > project > customer > default) |
| 7 | Daily rates | `day_rate_rules`, `computeDayRate` in `@tarlog/core` |
| 8 | Fixed prices | `fixed_fee_contracts`, `computeFixedFeeMargin` |
| 9,12 | Timer start/pause/resume/stop | `commands::timer_*` (desktop), `POST /api/timer/*` (web), `data/timer` (iOS) |
| 13 | Description on stop | Stop dialog `Timer.tsx` (mandatory per project), `needs_description` status |
| 14 | Backdate working time | `entry_backdate` / `entries.backdate` (`source='manual_backdated'`) |
| 15 | Fix a forgotten start | Timer start with start-time correction; backdating assistant |
| 16 | Fix a forgotten stop | Stop dialog end-time correction with reason |
| 17 | Actual time vs. billing time separated | `actual_duration_seconds` ≠ `billing_duration_seconds` (schema + engine) |
| 18 | Round up to 15 minutes | `applyRounding` mode `ceil_started_interval:900`, test: 4200s→4500s |
| 19 | German break rules | `evaluateDay` GERMAN_PROFILE: >6h→30min, >9h→45min, 15-min blocks |
| 20 | Compliance warnings | traffic light green/yellow/red on compliance pages (desktop/web) |
| 21 | PDF timesheet | `lib/pdf` (pdfmake), web `GET /api/exports/timesheet` |
| 22 | PDF invoice | `lib/invoice` + pdfmake, web invoicing module |
| 23 | CSV export | web `GET /api/exports` CSV |
| 24 | Desktop local | `apps/desktop` with headless integration test of local mode |
| 25 | Self-hosted server | `apps/web` + `docker-compose.yml` + Postgres + health |
| 26 | Connect desktop ↔ server | experimental client present; pairing and replication still without production-ready end-to-end proof |
| 27 | Cross-device timer | server state + `publishEvent`→`pg_notify`→WebSocket verified; native desktop round trip still open |
| 28 | iOS architecture prepared | `apps/mobile` with local store/sync architecture; not production-ready |
| 29 | Sync conflicts detected | server-side `conflict_records` + 409 compare-and-set; complete native resolution UI still open |
| 30 | Audit log | `audit_logs` on every mutation (`db::audit`, `lib/crud/audit`) |
| 31 | Backups | `run_backup` (SQLite copy + `PRAGMA integrity_check` + versioned document companion directory), web JSON export, pg_dump |
| 32 | Tests run | version check, `pnpm -r test`, type checking, `cargo test --all-targets` and server smoke in CI |

### Local backup with project documents

From format version 1 onward, a desktop backup always consists of three
identically named parts in the `backups` folder: the file
`ptl-<timestamp>.db`, the manifest `ptl-<timestamp>.manifest.json`, and the
directory `ptl-<timestamp>.attachments`. These three parts must be kept
together. For a manual restore while the app is closed, the database is
copied back as `ptl.db` into Tarlog's app data folder, and the companion
directory's contents are copied into its `attachments` folder. The document
paths stored in the backup are relative and therefore remain valid even after
a device change. The previous plain SQLite backup remains readable, but
naturally does not contain project documents added later.

## Privacy

No telemetry by default, no external services, no GPS/screenshot monitoring.
Local mode fully offline. GDPR concept (export Art. 20, deletion concept
Art. 17 with retention holds, Argon2id passwords and hashed session tokens),
see
[`docs/project-time-ledger/09-datenschutz-sicherheit.md`](docs/project-time-ledger/09-datenschutz-sicherheit.md).

## What GPT 5.6 has done

Tarlog has been built in AI-paired sessions with GPT 5.6, from the initial
data model through the current native macOS redesign. Full entry-by-entry
history: [`CHANGELOG.md`](CHANGELOG.md).

- **v0.0.1** — Initial release: core time/rounding/DE-EU-compliance/billing
  engine, 40-table dual-dialect schema, Next.js server (auth, REST,
  WebSocket sync, invoicing, PDF/CSV/JSON exports), Tauri desktop local
  mode, Expo iOS scaffold, CI with 98+ unit tests and a 22-invariant
  end-to-end smoke test.
- **v0.0.2** — Full Apple-oriented redesign across desktop, macOS chrome
  (native overlay title bar, traffic lights, German AppKit menu, SF
  Symbols) and the browser app; new Tarlog Flow brand and icon family; 167
  passing tests.
- **v0.0.3** — Guided six-step first-run onboarding (workspace → first
  customer/project → live timer → backdating → sync limits → done) for
  desktop and web; reworked self-hosting guide; SQLite schema migrated to
  v2 with fresh/upgrade/no-op integration tests; hardened browser
  pairing/session/token handling.
- **v0.0.4** — Fixed native desktop launch to go through the real
  `Tarlog.app` bundle instead of a bare executable, and removed a stray
  keyboard-focus ring on a non-interactive onboarding heading.
- **v0.0.5** — Replaced the fragile overlay title bar with the native
  AppKit title bar, unified onboarding and the main app around a compact
  source-list sidebar, moved appearance switching to the native macOS
  menu, and cleaned up the dashboard grid.
- **v0.0.6** — Made the whole top bar draggable instead
  of text-selecting; fixed a bug where archiving a customer silently
  soft-deleted it and made it unrecoverable (the same class of bug already
  fixed for projects in schema v7 — now fixed for customers in schema v8,
  with a matching data-repair migration and a "Reaktivieren"/restore
  action); added a customer-change control on the project detail page;
  cleaned up broken placeholder labels (a stray `, intern ,` artifact) left
  over from an incomplete translation pass.

## Roadmap status

Foundation, export/billing, DE compliance and the self-hosted browser server
are implemented. Desktop macOS/Windows is functional in local mode; its
server replication and iOS sync remain to be finished end-to-end before a
production release. Import, webhooks and team/customer portal are
architecturally prepared.

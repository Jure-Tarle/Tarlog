# Project Time Ledger — Web (Server-Modus, Selbst-Hosting)

Next.js 15 App (App Router, TypeScript strict) mit Custom-Node-Server
(`server.mjs`: Next-Handler + WebSocket-Live-Kanal). Local-first Zeiterfassung,
Abrechnung und Compliance. Dieses Dokument beschreibt den selbst gehosteten
Server-Modus per Docker Compose (doc 05 §9, doc 12 §1).

- Zeiten: epoch-ms UTC + IANA-Zeitzone · Geld: Integer-Cents · IDs: UUIDv7
- Datenzugriff: Drizzle ORM auf PostgreSQL (Server) / SQLite (Desktop-Client)
- Live-Kanal: `pg_notify('ptl_events')` → WS unter `/api/ws`

---

## 1. Schnellstart (Docker Compose)

Voraussetzung: Docker mit Compose-Plugin. Alle Kommandos im **Monorepo-Root**
(dort liegt `docker-compose.yml`).

```bash
cp .env.example .env
# .env bearbeiten — mindestens SESSION_SECRET setzen:
#   openssl rand -hex 32
docker compose up -d --build
```

Der Stack startet:

| Dienst      | Image              | Aufgabe                                             |
|-------------|--------------------|-----------------------------------------------------|
| `postgres`  | `postgres:17-alpine` | Server-Datenbank, persistentes Volume `pgdata`     |
| `web`       | Build `apps/web/Dockerfile` | Next.js standalone + WS, non-root, Port `PORT` |
| `redis`     | `redis:7-alpine` (optional, auskommentiert) | Queue für Hintergrundjobs |

Beim ersten `up` wartet `web` via `depends_on: postgres (healthy)`, wendet dann
die Migrationen an (`scripts/entrypoint.sh` → `node scripts/migrate.mjs`) und
startet den Server (`node server.mjs`).

App danach unter `http://localhost:3000` (bzw. `NEXT_PUBLIC_APP_URL`).

Logs / Status:

```bash
docker compose logs -f web
docker compose ps          # zeigt u. a. den web-Healthstatus
```

---

## 2. Konfiguration (.env)

Alle Variablen und Defaults siehe `.env.example`. Wichtig:

| Variable                  | Zweck                                                        |
|---------------------------|-------------------------------------------------------------|
| `POSTGRES_USER/PASSWORD/DB` | Anmeldedaten des `postgres`-Dienstes                       |
| `DATABASE_URL`            | PostgreSQL-Verbindung; default aus `POSTGRES_*`, Host `postgres` |
| `SESSION_SECRET`          | **Pflicht.** Langer Zufallswert (Sessions). Ohne Wert bricht `up` ab |
| `PORT`                    | HTTP-Port (Host == Container)                               |
| `NEXT_PUBLIC_APP_URL`     | Öffentliche Basis-URL für Links/Redirects                  |
| `NEXT_PUBLIC_APP_VERSION` | Im Health-Endpoint ausgewiesene Version                    |
| `REDIS_URL`               | Optional; nur mit aktiviertem `redis`-Dienst               |

Secrets stehen nur in `.env` (per Root-`.gitignore` ausgenommen) — nie committen.

---

## 3. Erststart — Setup-Wizard (doc 05 §9.3)

Vor abgeschlossenem Setup leitet die Middleware jeden geschützten Pfad nach
`/setup` um. Der Admin-Setup-Wizard führt durch:

1. **Main Account anlegen** (Hauptperson am eigenen Server)
2. **Passwort** setzen (Argon2id), optional 2FA/Passkeys
3. **Geräte verbinden** — Device-Token ausgeben (Desktop/iOS/Integrationen)
4. **API-Tokens** verwalten
5. **Backup-Ziel** konfigurieren

Danach ist der Server einsatzbereit; weitere Geräte verbinden sich über
Device-Tokens (WS `/api/ws?token=<device_token>`).

---

## 4. Health-Check (doc 05 §9.4)

`GET /api/health` prüft Liveness + DB-Erreichbarkeit (leichter `SELECT 1`):

- `200 {"status":"ok","db":"up",...}` — DB erreichbar
- `503 {"status":"degraded","db":"down",...}` — DB nicht erreichbar

Der Container-Healthcheck (im Dockerfile) pollt genau diesen Endpoint. Für
Reverse-Proxy-/Orchestrator-Monitoring denselben Pfad verwenden:

```bash
curl -fsS http://localhost:3000/api/health
```

---

## 5. Backup & Restore (doc 12 §1)

**Grundsatz:** Backup vor jeder Migration/Update. Restore nie destruktiv ohne
Sicherheitsnetz — vorher einen Pre-Restore-Snapshot ziehen. `pg_dump`/`pg_restore`
laufen im `postgres`-Dienst (dessen Image bringt die passenden Client-Tools mit).

### 5.1 Backup — `pg_dump --format=custom`

Konsistenter Snapshot ohne DB-Stopp (doc 12 §1 Nr. 5):

```bash
mkdir -p backups
docker compose exec -T postgres \
  pg_dump --format=custom --username="${POSTGRES_USER:-ptl}" "${POSTGRES_DB:-ptl}" \
  > "backups/ptl-$(date +%Y%m%d-%H%M%S).dump"
```

Off-Site-Kopie empfohlen (3-2-1). Cron-Beispiel (täglich 02:30, 14 Tage
Aufbewahrung):

```cron
30 2 * * * cd /opt/project-time-ledger && \
  docker compose exec -T postgres pg_dump --format=custom -U ptl ptl \
  > "backups/ptl-$(date +\%Y\%m\%d).dump" && \
  find backups -name 'ptl-*.dump' -mtime +14 -delete
```

### 5.2 Integritätsprüfung (doc 12 §1 Nr. 8)

Restore-Probe in ein Wegwerf-Schema/-DB, bevor ein Backup als gültig gilt:

```bash
docker compose exec -T postgres psql -U ptl -c 'CREATE DATABASE ptl_verify;'
docker compose exec -T postgres \
  sh -c 'pg_restore --username=ptl --dbname=ptl_verify --no-owner' < backups/ptl-XXXX.dump
# Konsistenzabfragen ausführen … danach:
docker compose exec -T postgres psql -U ptl -c 'DROP DATABASE ptl_verify;'
```

### 5.3 Restore (doc 12 §1 Nr. 7)

Zuerst die aktuelle DB als Pre-Restore-Snapshot sichern (5.1), dann
zurückspielen. In eine frische DB (empfohlen) oder mit `--clean` in die
bestehende:

```bash
# web anhalten, damit keine Schreiblast läuft:
docker compose stop web

docker compose exec -T postgres \
  sh -c 'pg_restore --username=ptl --dbname=ptl --clean --if-exists --no-owner' \
  < backups/ptl-XXXX.dump

docker compose start web
```

Jeder Restore erzeugt fachlich einen `audit_logs`-Eintrag (`action = 'restore'`);
die App-seitige Restore-Assistenz übernimmt das (doc 12 §1.2).

---

## 6. Updates & Migrationen (doc 05 §9.5, doc 12 Risiko 5)

Migrationen liegen versioniert in `packages/db/drizzle/postgres` (per
`drizzle-kit` generiert) und werden beim Container-Start automatisch angewendet
(`entrypoint.sh`). Update-Ablauf:

```bash
git pull
docker compose exec -T postgres pg_dump --format=custom -U ptl ptl > backups/pre-update.dump  # Pre-Migration-Backup!
docker compose up -d --build           # neues Image bauen, Migrationen laufen beim Start
docker compose logs -f web             # Migrations-/Boot-Log prüfen
```

`calculation_version` und Rechnungs-Snapshots halten alte Rechnungen stabil,
auch wenn sich das Schema ändert (doc 12 Risiko 5).

---

## 7. Build-Details (Referenz)

- **Dockerfile** (`apps/web/Dockerfile`) — Multi-Stage: `pnpm fetch`
  (Lockfile-Cache) → offline install → `@ptl/core`/`@ptl/db` bauen →
  Migrationen generieren → Next `output: 'standalone'` → schlankes Runtime-Bundle
  auf `node:22-alpine`, **non-root** (`node`), mit HEALTHCHECK auf `/api/health`.
- **entrypoint.sh** — Migrationen anwenden, dann `exec node server.mjs` (Signale
  erreichen den Server direkt → Graceful Shutdown).
- Empfehlung: ein Root-`.dockerignore` (`node_modules`, `.next`, `.git`, `.env*`)
  beschleunigt den Build und hält den Kontext klein.

Lokale Entwicklung ohne Docker (separater PostgreSQL nötig):

```bash
pnpm --filter @ptl/web db:generate   # Migrationen erzeugen (einmalig / bei Schemaänderung)
pnpm --filter @ptl/web db:migrate    # anwenden (DATABASE_URL gesetzt)
pnpm --filter @ptl/web dev           # Next Dev-Server
```

---

## 8. Troubleshooting

- **`web` startet nicht, Migrationsfehler** — DB noch nicht bereit? `depends_on`
  wartet auf `postgres (healthy)`; bei externem DB `DATABASE_URL` prüfen.
- **`up` bricht mit „SESSION_SECRET erforderlich" ab** — Wert in `.env` setzen.
- **Healthcheck `unhealthy`** — `curl /api/health` liefert 503 → DB-Verbindung
  (`DATABASE_URL`, `postgres`-Dienst) prüfen.
- **WS verbindet nicht** — `/api/ws?token=<device_token>`; Token gültig und Gerät
  nicht widerrufen? (doc 04 §2 Nr. 10)

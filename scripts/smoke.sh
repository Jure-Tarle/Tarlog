#!/usr/bin/env bash
# scripts/smoke.sh — End-to-End-Nachweis des Server-Modus.
#
# Fährt die Kette hoch, die in der Doku beschrieben ist (docs/project-time-ledger/):
# Postgres → Migrationen → `server.mjs` (REST + WebSocket) → fachlicher Flow.
# Jede Prüfung ist eine harte Assertion; das Skript endet mit Exit 0 nur, wenn
# alle Kern-Invarianten der Version 1 real halten.
#
#   ./scripts/smoke.sh                 # startet Postgres via Docker, räumt auf
#   DATABASE_URL=… SKIP_DB=1 ./scripts/smoke.sh   # gegen vorhandene DB
#
# Geprüfte Akzeptanzkriterien: AC17/18 (Ist- vs. Abrechnungszeit, 15-Minuten-
# Aufrundung), AC13 (Beschreibung beim Stoppen), AC14 (Nachtrag), AC19/20
# (ArbZG-Pausenregel), AC21–23 (PDF/CSV), AC22 (Rechnungs-PDF), AC27 (Live-Sync),
# AC29 (Konflikterkennung), AC30 (Audit-Log).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PORT:-3099}"
PG_PORT="${PG_PORT:-5442}"
PG_CONTAINER="${PG_CONTAINER:-ptl-smoke-pg}"
BASE="http://localhost:${PORT}"
JAR="$(mktemp)"
SRV_LOG="$(mktemp)"
FAILURES=0

log()  { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
pass() { printf '  \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$*"; FAILURES=$((FAILURES + 1)); }

assert_eq() { # assert_eq <actual> <expected> <label>
  if [ "$1" = "$2" ]; then pass "$3 ($2)"; else fail "$3: erwartet '$2', erhalten '$1'"; fi
}
assert_contains() { # assert_contains <haystack> <needle> <label>
  case "$1" in *"$2"*) pass "$3" ;; *) fail "$3: '$2' fehlt in '${1:0:120}'" ;; esac
}

# Abfrage gegen die DB: lokal über den Docker-Container, in CI (SKIP_DB=1) über
# den mitgelieferten psql-Client und DATABASE_URL.
psql_q() {
  if [ "${SKIP_DB:-0}" = "1" ]; then
    psql "$DATABASE_URL" -tAc "$1"
  else
    docker exec "$PG_CONTAINER" psql -U ptl -d ptl -tAc "$1"
  fi
}

free_port() { # Reste eines früheren Laufs beenden, sonst EADDRINUSE
  local pids
  pids="$(lsof -ti ":$1" 2>/dev/null || true)"
  [ -n "$pids" ] && kill -9 $pids 2>/dev/null || true
  return 0
}

cleanup() {
  [ -n "${SRV_PID:-}" ] && kill "$SRV_PID" 2>/dev/null || true
  free_port "$PORT"
  if [ "${SKIP_DB:-0}" != "1" ]; then docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true; fi
  rm -f "$JAR"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
log "Postgres starten und migrieren"
# ---------------------------------------------------------------------------
if [ "${SKIP_DB:-0}" != "1" ]; then
  docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker run -d --name "$PG_CONTAINER" \
    -e POSTGRES_USER=ptl -e POSTGRES_PASSWORD=ptl -e POSTGRES_DB=ptl \
    -p "${PG_PORT}:5432" postgres:17-alpine >/dev/null
  for _ in $(seq 1 30); do
    docker exec "$PG_CONTAINER" pg_isready -U ptl -d ptl >/dev/null 2>&1 && break
    sleep 1
  done
  export DATABASE_URL="postgres://ptl:ptl@localhost:${PG_PORT}/ptl"
fi
node "$ROOT/apps/web/scripts/migrate.mjs" >/dev/null
# 40 fachliche Tabellen (doc 06) + `_ptl_migrations` als Migrations-Journal.
TABLES="$(psql_q "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name <> '_ptl_migrations';")"
assert_eq "$TABLES" "40" "40 Tabellen migriert"

# ---------------------------------------------------------------------------
log "Server starten (REST + WebSocket)"
# ---------------------------------------------------------------------------
export SESSION_SECRET="${SESSION_SECRET:-smoke-secret-0123456789abcdef0123456789abcdef}"
export PORT NEXT_PUBLIC_APP_URL="$BASE" NODE_ENV=production
free_port "$PORT"
# `exec` ersetzt die Subshell durch node — sonst überlebt der Node-Prozess das Cleanup.
( cd "$ROOT/apps/web" && exec node server.mjs > "$SRV_LOG" 2>&1 ) &
SRV_PID=$!
for _ in $(seq 1 40); do curl -sf "$BASE/api/health" >/dev/null 2>&1 && break; sleep 1; done
HEALTH="$(curl -s "$BASE/api/health")"
assert_contains "$HEALTH" '"db":"up"' "Health-Check meldet DB verbunden"

# ---------------------------------------------------------------------------
log "Setup, Stammdaten"
# ---------------------------------------------------------------------------
curl -s -c "$JAR" -X POST "$BASE/api/auth/setup" -H 'content-type: application/json' \
  -d '{"display_name":"Smoke","password":"Sicher123!pass"}' >/dev/null
RULE="$(psql_q "SELECT mode||':'||interval_minutes FROM rounding_rules;")"
assert_eq "$RULE" "ceil_started_interval:15" "Standard-Rundungsregel geseedet (AC18)"

CID="$(curl -s -b "$JAR" -X POST "$BASE/api/customers" -H 'content-type: application/json' \
  -d '{"name":"ACME","default_currency":"EUR","default_hourly_rate_cents":9000,"status":"active"}' \
  | sed -nE 's/.*"id":"([^"]+)".*/\1/p' | head -1)"
PID_="$(curl -s -b "$JAR" -X POST "$BASE/api/projects" -H 'content-type: application/json' \
  -d "{\"name\":\"Web\",\"customer_id\":\"$CID\",\"billing_type\":\"hourly\",\"hourly_rate_cents\":9000,\"status\":\"active\"}" \
  | sed -nE 's/.*"id":"([^"]+)".*/\1/p' | head -1)"
[ -n "$PID_" ] && pass "Kunde + Projekt angelegt" || fail "Kunde/Projekt anlegen"

# ---------------------------------------------------------------------------
log "Timer: 70 Minuten → 75 Minuten Abrechnungszeit (AC17/AC18)"
# ---------------------------------------------------------------------------
NOW="$(node -e 'console.log(Date.now())')"
START=$((NOW - 4200000))
curl -s -b "$JAR" -X POST "$BASE/api/timer/start" -H 'content-type: application/json' \
  -d "{\"project_id\":\"$PID_\",\"started_at\":$START}" >/dev/null

SECOND="$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/api/timer/start" \
  -H 'content-type: application/json' -d "{\"project_id\":\"$PID_\"}")"
assert_eq "$SECOND" "409" "Zweiter Timer-Start wird abgelehnt (Single-Timer)"

curl -s -b "$JAR" -X POST "$BASE/api/timer/stop" -H 'content-type: application/json' \
  -d '{"description":"Konzeptarbeit"}' >/dev/null

ROW="$(psql_q "SELECT actual_duration_seconds||'|'||billing_duration_seconds||'|'||rounding_delta_seconds||'|'||billing_amount_snapshot FROM time_entries WHERE status='completed' ORDER BY created_at DESC LIMIT 1;")"
assert_eq "$ROW" "4200|4500|300|11250" "actual=4200s bleibt, billing=4500s, delta=+300s, 112,50 €"

# ---------------------------------------------------------------------------
log "Nachtrag + Compliance (AC14, AC19/20)"
# ---------------------------------------------------------------------------
BD_START=$((NOW - 86400000)); BD_END=$((BD_START + 25200000)) # 7 h ohne Pause
curl -s -b "$JAR" -X POST "$BASE/api/time-entries" -H 'content-type: application/json' \
  -d "{\"project_id\":\"$PID_\",\"actual_started_at\":$BD_START,\"actual_ended_at\":$BD_END,\"timezone\":\"Europe/Berlin\",\"description\":\"Langer Tag\",\"source\":\"manual_backdated\",\"backdate_reason\":\"forgot_to_start\"}" >/dev/null
BD="$(psql_q "SELECT source||'|'||is_backdated::text||'|'||backdate_reason FROM time_entries WHERE is_backdated;")"
assert_eq "$BD" "manual_backdated|true|forgot_to_start" "Nachtrag markiert und begründet"

COMPLIANCE="$(curl -s -b "$JAR" "$BASE/api/reports?type=day&from=$BD_START&to=$((BD_START + 86400000))")"
assert_contains "$COMPLIANCE" "ArbZG §4" "ArbZG-§4-Verstoß erkannt (>6 h ohne 30 Minuten Pause)"

# ---------------------------------------------------------------------------
log "Exporte (AC21, AC23)"
# ---------------------------------------------------------------------------
MFROM=$((NOW - 2592000000))
PDF_CT="$(curl -s -b "$JAR" -o /tmp/smoke-ts.pdf -w '%{content_type}' "$BASE/api/exports/timesheet?from=$MFROM&to=$NOW")"
assert_contains "$PDF_CT" "application/pdf" "PDF-Arbeitszeitnachweis ausgeliefert"
assert_eq "$(head -c 4 /tmp/smoke-ts.pdf)" "%PDF" "PDF-Datei ist valide"

curl -s -b "$JAR" -o /tmp/smoke.csv "$BASE/api/exports/csv?from=$MFROM&to=$NOW"
assert_contains "$(head -1 /tmp/smoke.csv)" "billing_seconds" "CSV trennt actual_seconds und billing_seconds"

# ---------------------------------------------------------------------------
log "Sync-Konflikt (AC29)"
# ---------------------------------------------------------------------------
# Muss VOR der Rechnung laufen: fakturierte Einträge sind gesperrt und werden
# nicht mehr per Sync verändert (Konfliktfall 8).
EID="$(psql_q "SELECT id FROM time_entries WHERE source='live_timer' AND status='completed' ORDER BY created_at DESC LIMIT 1;")"
SV="$(psql_q "SELECT sync_version FROM time_entries WHERE id='$EID';")"
U1="$(node -e 'console.log(require("crypto").randomUUID())')"
U2="$(node -e 'console.log(require("crypto").randomUUID())')"
curl -s -b "$JAR" -o /dev/null -X POST "$BASE/api/sync/events" -H 'content-type: application/json' \
  -d "{\"events\":[{\"event_id\":\"$U1\",\"entity_type\":\"time_entries\",\"entity_id\":\"$EID\",\"operation\":\"update\",\"base_version\":$SV,\"local_revision\":1,\"data\":{\"description\":\"Gerät A\"}}]}"
assert_eq "$(psql_q "SELECT description FROM time_entries WHERE id='$EID';")" "Gerät A" \
  "Gültiges Sync-Event wird angewendet"

CONFLICT_CODE="$(curl -s -b "$JAR" -o /tmp/smoke-conf.json -w '%{http_code}' -X POST "$BASE/api/sync/events" \
  -H 'content-type: application/json' \
  -d "{\"events\":[{\"event_id\":\"$U2\",\"entity_type\":\"time_entries\",\"entity_id\":\"$EID\",\"operation\":\"update\",\"base_version\":$SV,\"local_revision\":2,\"data\":{\"description\":\"Gerät B offline\"}}]}")"
assert_eq "$CONFLICT_CODE" "409" "Veraltete base_version wird als Konflikt abgewiesen"
# Der abgelehnte Zweit-Timer weiter oben protokolliert ebenfalls einen Konflikt,
# daher gezielt auf die Beschreibungs-Divergenz (Konfliktfall 7) prüfen.
assert_eq "$(psql_q "SELECT count(*) FROM conflict_records WHERE reason='description_divergence';")" "1" \
  "Konflikt wird protokolliert (nie still verworfen)"
assert_eq "$(psql_q "SELECT description FROM time_entries WHERE id='$EID';")" "Gerät A" "Serverstand bleibt unangetastet"

# ---------------------------------------------------------------------------
log "Rechnung: erstellen → finalisieren → PDF → Storno (AC22)"
# ---------------------------------------------------------------------------
IID="$(curl -s -b "$JAR" -X POST "$BASE/api/invoices" -H 'content-type: application/json' \
  -d "{\"customer_id\":\"$CID\",\"period\":{\"from\":$MFROM,\"to\":$NOW}}" \
  | sed -nE 's/.*"id":"([^"]+)".*/\1/p' | head -1)"
assert_eq "$(psql_q "SELECT coalesce(invoice_number,'-') FROM invoices WHERE id='$IID';")" "-" \
  "Entwurf trägt noch keine Rechnungsnummer"

curl -s -b "$JAR" -o /dev/null -X POST "$BASE/api/invoices/$IID/finalize" -H 'content-type: application/json' -d '{}'
assert_eq "$(psql_q "SELECT invoice_number FROM invoices WHERE id='$IID';")" "RE-$(date +%Y)-0001" \
  "Fortlaufende Nummer erst bei Finalisierung"
NET="$(psql_q "SELECT net_amount_cents FROM invoices WHERE id='$IID';")"

INV_CT="$(curl -s -b "$JAR" -o /tmp/smoke-inv.pdf -w '%{content_type}' "$BASE/api/invoices/$IID/pdf")"
assert_contains "$INV_CT" "application/pdf" "Rechnungs-PDF ausgeliefert"

curl -s -b "$JAR" -o /dev/null -X POST "$BASE/api/invoices/$IID/cancel" -H 'content-type: application/json' -d '{"reason":"Smoke"}'
CANCEL="$(psql_q "SELECT status||'|'||net_amount_cents FROM invoices WHERE type='cancellation';")"
assert_eq "$CANCEL" "finalized|-${NET}" "Storno erzeugt Gegenrechnung mit negiertem Betrag"
assert_eq "$(psql_q "SELECT status FROM invoices WHERE id='$IID';")" "cancelled" "Original bleibt erhalten (storniert)"

# ---------------------------------------------------------------------------
log "Live-Sync über WebSocket (AC27)"
# ---------------------------------------------------------------------------
TOKEN="$(curl -s -b "$JAR" -X POST "$BASE/api/tokens" -H 'content-type: application/json' \
  -d '{"name":"smoke-ws"}' | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).token))')"
COOKIE="ptl_session=$(awk '/ptl_session/{print $7}' "$JAR" | head -1)"
if ( cd "$ROOT/apps/web" && node scripts/ws-smoke.mjs "$BASE" "$TOKEN" "$COOKIE" "$PID_" >/dev/null ); then
  pass "Zweiter Client empfängt timer.started über /api/ws"
else
  fail "WebSocket-Broadcast erreicht den zweiten Client nicht"
fi

# ---------------------------------------------------------------------------
log "Audit-Log (AC30)"
# ---------------------------------------------------------------------------
AUDITS="$(psql_q "SELECT count(*) FROM audit_logs;")"
[ "$AUDITS" -gt 0 ] && pass "Audit-Log geschrieben ($AUDITS Einträge)" || fail "Audit-Log leer"

# ---------------------------------------------------------------------------
if [ "$FAILURES" -eq 0 ]; then
  printf '\n\033[32mSMOKE OK — alle Kern-Invarianten halten.\033[0m\n'
  exit 0
fi
printf '\n\033[31mSMOKE FEHLGESCHLAGEN: %s Prüfung(en).\033[0m\n' "$FAILURES"
printf 'Server-Log:\n'; tail -20 "$SRV_LOG"
exit 1

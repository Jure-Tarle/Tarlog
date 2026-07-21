#!/bin/sh
# entrypoint.sh, Container-Start des Web-Dienstes (doc 05 §9.5).
#
# Ablauf beim Start:
#   1) Ausstehende PostgreSQL-Migrationen anwenden (node scripts/migrate.mjs).
#   2) Custom-Node-Server starten (node server.mjs), Next-Handler + WS-Live-Kanal.
#
# CWD ist /app/apps/web (Dockerfile WORKDIR). `exec` ersetzt die Shell durch
# node, damit SIGTERM/SIGINT direkt beim Server ankommen (Graceful Shutdown in
# server.mjs). Bei fehlgeschlagener Migration bricht der Start ab (set -e) und
# der Container wird von der restart-Policy neu gestartet.
set -eu

echo "[entrypoint] DATABASE_URL gesetzt: ${DATABASE_URL:+ja}"
echo "[entrypoint] Migrationen anwenden…"
node scripts/migrate.mjs

echo "[entrypoint] Server starten (PORT=${PORT:-3000})…"
exec node server.mjs

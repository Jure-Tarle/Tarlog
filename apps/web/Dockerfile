# syntax=docker/dockerfile:1.7
#
# Dockerfile — Tarlog Web (doc 05 §9.1 Server-Betrieb).
#
# Multi-Stage:
#   base    — Node 22 (musl/alpine) + pnpm via corepack.
#   build   — pnpm fetch (Lockfile-Cache) → offline install → Workspace-Packages
#             bauen → Migrationen generieren → Next-App als `output: 'standalone'`
#             bauen → schlankes Laufzeit-Verzeichnis /out zusammenstellen.
#   runtime — node:22-alpine, non-root (`node`), nur das Runtime-Bundle.
#
# Build-Kontext ist das Monorepo-Root (siehe docker-compose.yml `context: .`).
# Empfehlung: ein `.dockerignore` im Root anlegen (node_modules, .next, .git,
# .env*) — der Build funktioniert auch ohne, kopierte host-node_modules/.next
# werden vor dem Install entfernt.

########################  base  ########################
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# Lockfile ist v9.0 → pnpm 10 (deckt Format 9.0 ab, entspricht der Dev-Umgebung).
RUN corepack enable && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

########################  build  ########################
FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1

# 1) pnpm fetch: braucht NUR das Lockfile → dieser Layer cached, solange sich
#    pnpm-lock.yaml nicht ändert. Lädt alle (auch plattformspezifischen)
#    Pakete in den Store — inkl. der linux-musl-Variante von @node-rs/argon2.
COPY pnpm-lock.yaml ./
RUN pnpm fetch

# 2) Workspace-Manifeste + Quellen. Anschließend evtl. mitkopierte
#    host-node_modules/.next entfernen (falls kein .dockerignore vorhanden).
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN rm -rf apps/*/node_modules packages/*/node_modules apps/web/.next node_modules

# 3) Offline-Install aus dem gefetchten Store (inkl. devDeps: next, typescript,
#    drizzle-kit) — kein Netzwerk nötig, reproduzierbar via --frozen-lockfile.
RUN pnpm install --frozen-lockfile --offline

# 4) Shared-Packages bauen (core/db dist). Die Migrationen werden NICHT im Image
#    erzeugt: drizzle-kit 0.30 lädt das Schema über einen CJS-Loader und scheitert
#    an `"type": "module"` ("require is not defined in ES module scope"). Die
#    generierten SQL-Dateien liegen versioniert unter packages/db/drizzle/postgres
#    und werden hier nur auf Existenz geprüft; erzeugt werden sie außerhalb des
#    Images über `drizzle.config.postgres.gen.ts`.
RUN pnpm --filter @tarlog/core build \
 && pnpm --filter @tarlog/db build \
 && ls packages/db/drizzle/postgres/*.sql >/dev/null 2>&1 \
    || (echo "FEHLER: keine Migrationen unter packages/db/drizzle/postgres" && exit 1)

# 5) Next-App als standalone bauen.
RUN pnpm --filter @tarlog/web build

# 6) Laufzeit-Bundle /out zusammenstellen. `cp -rL` dereferenziert die
#    pnpm-Symlinks. Standalone spiegelt das Monorepo-Root (/app) →
#    /out/node_modules (traced), /out/apps/web/.next (Server-Chunks),
#    /out/packages/* (traced Workspace-Dist).
#    Ergänzt werden manuell: static-Assets, server.mjs + scripts (nicht Teil des
#    Next-Trace), die generierten Migrations-SQL (Datendateien, nicht getraced)
#    und `ws` (nur von server.mjs benutzt → von Next NICHT getraced).
RUN set -eux; \
    mkdir -p /out; \
    cp -r apps/web/.next/standalone/. /out/; \
    mkdir -p /out/apps/web/.next; \
    cp -r apps/web/.next/static /out/apps/web/.next/static; \
    if [ -d apps/web/public ]; then cp -r apps/web/public /out/apps/web/public; fi; \
    cp apps/web/server.mjs /out/apps/web/server.mjs; \
    cp -r apps/web/scripts /out/apps/web/scripts; \
    chmod +x /out/apps/web/scripts/entrypoint.sh; \
    mkdir -p /out/packages/db/drizzle; \
    cp -rL packages/db/drizzle/postgres /out/packages/db/drizzle/postgres; \
    mkdir -p /out/node_modules; \
    cp -rL apps/web/node_modules/ws /out/node_modules/ws; \
    # Kein @tarlog/db ins Bundle kopieren: `scripts/migrate.mjs` nutzt bewusst nur
    # `drizzle-orm` + `pg`, die Next samt vollständigem pnpm-Store ablegt. Eine
    # dereferenzierte @tarlog/db-Kopie brächte ein kaputtes verschachteltes `pg`
    # mit ("Cannot find module 'pg-types'").
    # Frühwarnung: bricht den Build ab, statt den Container in eine
    # Restart-Schleife laufen zu lassen.
    test -n "$(ls /out/packages/db/drizzle/postgres/*.sql 2>/dev/null)"

########################  runtime  ########################
FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Non-root: node:22-alpine bringt den User `node` (uid 1000) mit.
COPY --from=build --chown=node:node /out ./
USER node

# server.mjs + migrate.mjs laufen aus dem Web-Verzeichnis; Modul-Auflösung
# steigt nach /app/node_modules (standalone) auf, Migrations-Pfad ist relativ.
WORKDIR /app/apps/web
EXPOSE 3000

# Liveness/Readiness über /api/health (200 = DB erreichbar, 503 = degraded).
# start-period deckt Migration + Next-Boot ab.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrationen anwenden, dann Server starten (exec → node erhält Signale direkt).
ENTRYPOINT ["/app/apps/web/scripts/entrypoint.sh"]

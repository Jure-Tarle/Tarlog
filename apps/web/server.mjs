// @ts-nocheck
/**
 * server.mjs — Custom-Node-Server für Tarlog Web (doc 05 §7, §9.1).
 *
 * Startet den Next.js-Handler UND den WebSocket-Live-Kanal in EINEM Prozess.
 * Plain JavaScript ohne Build-Schritt (start = `node server.mjs`), damit der
 * Self-Host-Betrieb (Docker, output:'standalone') robust bleibt.
 *
 * Architektur des Live-Kanals (bewusst entkoppelt von den Next-Routen):
 *  1) WS-Endpoint unter Pfad `/api/ws`. Client verbindet mit `?token=<device
 *     token>`. Der Server validiert den Token DIREKT gegen die DB (pg-Pool):
 *     SELECT auf api_tokens JOIN devices — gültig nur wenn Token nicht
 *     abgelaufen/widerrufen UND das Gerät nicht `revoked` ist (doc 04 §2 Nr.10).
 *     Dieselbe Regel wie lib/session.ts::verifyDeviceToken (dort in TS, hier
 *     als reines SQL gespiegelt, da server.mjs kein TS importieren kann).
 *  2) Registry: Map<mainAccountId, Set<socket>>. Nach erfolgreicher Auth wird
 *     der Socket unter seiner main_account_id registriert.
 *  3) LISTEN/NOTIFY: Der Server hält eine dedizierte pg-Verbindung und LISTEN'ed
 *     auf dem Kanal 'ptl_events'. Next-API-Routen feuern Events via
 *     `pg_notify('ptl_events', <envelope>)` (lib/events.ts::publishEvent). Bei
 *     jeder NOTIFY-Nachricht broadcastet der Server den Umschlag an alle Sockets
 *     des betroffenen main_account (außer optional dem Urheber-Gerät).
 *  So sind Next-Routen und WS-Server sauber entkoppelt und funktionieren auch
 *  mit mehreren Prozessen/Instanzen (jede LISTEN'ed denselben Kanal).
 */
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import pg from "pg";

const { Pool } = pg;

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const WS_PATH = "/api/ws";
const PTL_EVENTS_CHANNEL = "ptl_events";
const NEXT_STATIC_PREFIX = "/_next/static/";
const trustProxy = process.env.TARLOG_TRUST_PROXY === "1";

// Route-Handler und Custom Server teilen denselben Prozess. Nur hier ist der
// Upgrade-Handler für /api/ws tatsächlich aktiv; `next dev` lässt den Browser
// deshalb bewusst auf Long-Polling zurückfallen.
process.env.TARLOG_REALTIME_WS_ENABLED = "1";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error(
    "[server] DATABASE_URL nicht gesetzt — Server-Modus benötigt PostgreSQL (doc 05 §9.2).",
  );
  process.exit(1);
}

// SHA-256-Hex (identisch zu lib/session.ts::hashToken).
function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Next-Handler beschaffen.
 *
 * Im Dev-Modus die übliche `next()`-Factory. In der Produktion läuft die App als
 * `output: 'standalone'`-Bundle — dort ist die Factory nicht benutzbar, weil sie
 * den (getrimmten) Build-Pfad `next/dist/compiled/webpack/webpack` lädt. Wie
 * Nexts eigenes `server.js` instanziieren wir deshalb direkt `NextServer` mit der
 * gebauten Konfiguration aus `.next/required-server-files.json`.
 */
const appDir = dirname(fileURLToPath(import.meta.url));
const nextStaticDir = resolve(appDir, ".next", "static");

const STATIC_CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

/**
 * `NextServer#getRequestHandler()` renders the standalone application but does
 * not pass `/_next/static/*` through Next's outer router server. The runtime
 * image already ships that directory, so serve only this immutable, generated
 * asset namespace here. Path resolution stays rooted below `.next/static`.
 */
async function serveNextStatic(req, res, pathname) {
  if (!pathname.startsWith(NEXT_STATIC_PREFIX)) return false;

  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" });
    res.end();
    return true;
  }

  let relativePath;
  try {
    relativePath = decodeURIComponent(pathname.slice(NEXT_STATIC_PREFIX.length));
  } catch {
    res.writeHead(400);
    res.end();
    return true;
  }

  const filePath = resolve(nextStaticDir, relativePath);
  if (!relativePath || !filePath.startsWith(`${nextStaticDir}${sep}`)) {
    res.writeHead(404);
    res.end();
    return true;
  }

  try {
    const file = await stat(filePath);
    if (!file.isFile()) throw new Error("not a file");

    res.writeHead(200, {
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Length": file.size,
      "Content-Type": STATIC_CONTENT_TYPES.get(extname(filePath)) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      res.end();
    } else {
      createReadStream(filePath)
        .on("error", () => res.destroy())
        .pipe(res);
    }
  } catch {
    res.writeHead(404);
    res.end();
  }
  return true;
}

async function createNextHandler() {
  if (dev) {
    const { default: next } = await import("next");
    const app = next({ dev, hostname, port });
    await app.prepare();
    return app.getRequestHandler();
  }

  const requiredServerFiles = join(appDir, ".next", "required-server-files.json");
  if (!existsSync(requiredServerFiles)) {
    throw new Error(
      `[server] ${requiredServerFiles} fehlt — die App wurde nicht mit output: 'standalone' gebaut.`,
    );
  }
  const { config } = JSON.parse(readFileSync(requiredServerFiles, "utf8"));
  process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(config);

  // `next-server` ist CommonJS. Über einen dynamischen `import()` wäre `default`
  // das gesamte `module.exports`; deshalb wie Nexts eigenes standalone-server.js
  // per `require(...).default` auflösen.
  const require = createRequire(import.meta.url);
  const NextServer = require("next/dist/server/next-server").default;
  const app = new NextServer({
    dev: false,
    dir: appDir,
    hostname,
    port,
    conf: config,
  });
  return app.getRequestHandler();
}

/** Registry: main_account_id → Set<WebSocket>. */
const registry = new Map();

function registerSocket(mainAccountId, ws) {
  let set = registry.get(mainAccountId);
  if (!set) {
    set = new Set();
    registry.set(mainAccountId, set);
  }
  set.add(ws);
}

function unregisterSocket(mainAccountId, ws) {
  const set = registry.get(mainAccountId);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) registry.delete(mainAccountId);
}

/** Broadcast an alle Sockets eines main_account; optional Urheber-Gerät auslassen. */
function broadcast(envelope) {
  const set = registry.get(envelope.main_account_id);
  if (!set || set.size === 0) return;
  const payload = JSON.stringify({ kind: "event", ...envelope });
  const revokedDeviceId = envelope.type === "device.revoked"
    ? envelope.data?.device_id ?? envelope.entity_id
    : null;
  for (const ws of set) {
    if (revokedDeviceId && ws.__ptlDeviceId === revokedDeviceId) {
      unregisterSocket(envelope.main_account_id, ws);
      ws.close(4003, "Device revoked");
      continue;
    }
    // meta.deviceId am Socket → Echo-Vermeidung beim Urheber-Gerät.
    if (ws.__ptlDeviceId && ws.__ptlDeviceId === envelope.device_id) continue;
    if (ws.readyState === ws.OPEN) ws.send(payload);
  }
}

/**
 * Validiert einen Device-Token direkt gegen die DB. Gespiegelte Regel aus
 * lib/session.ts::verifyDeviceToken. Liefert { main_account_id, device_id }
 * oder null.
 */
async function verifyDeviceTokenSql(pool, token) {
  if (!token) return null;
  const now = Date.now();
  const res = await pool.query(
    `SELECT t.id, t.main_account_id, t.device_id, t.scopes, t.expires_at,
            d.revoked AS device_revoked
       FROM api_tokens t
       LEFT JOIN devices d ON d.id = t.device_id
      WHERE t.token_hash = $1
        AND t.revoked_at IS NULL
        AND (t.expires_at IS NULL OR t.expires_at > $2)
      LIMIT 1`,
    [hashToken(token), now],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.device_revoked === true) return null;
  const scopes = Array.isArray(row.scopes) ? row.scopes : [];
  if (!scopes.some((scope) => scope === "*" || scope === "realtime" || scope === "sync")) {
    return null;
  }
  const ephemeral = scopes.includes("realtime") && !scopes.includes("*") && !scopes.includes("sync");
  if (ephemeral) {
    const consumed = await pool.query(
      `DELETE FROM api_tokens
        WHERE id = $1 AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > $2)
      RETURNING id`,
      [row.id, now],
    );
    if (consumed.rows.length === 0) return null;
  } else {
    await pool.query("UPDATE api_tokens SET last_used_at = $1 WHERE id = $2", [now, row.id]);
  }
  return {
    token_id: row.id,
    main_account_id: row.main_account_id,
    device_id: row.device_id ?? null,
    expires_at: row.expires_at == null ? null : Number(row.expires_at),
    ephemeral,
  };
}

async function main() {
  const handle = await createNextHandler();

  const pool = new Pool({ connectionString: DATABASE_URL, max: 5 });

  let listenerReconnectTimer = null;
  let listenerReady = false;

  function disconnectLiveClients() {
    for (const [mainAccountId, set] of registry) {
      for (const ws of set) {
        unregisterSocket(mainAccountId, ws);
        ws.close(1012, "Live listener reconnecting");
      }
    }
  }

  function scheduleListenerReconnect(error) {
    console.error("[server] LISTEN client error, reconnecting:", error);
    listenerReady = false;
    disconnectLiveClients();
    if (listenerReconnectTimer) return;
    listenerReconnectTimer = setTimeout(() => {
      listenerReconnectTimer = null;
      void startListener().catch(scheduleListenerReconnect);
    }, 1000);
  }

  // Dedizierte LISTEN-Verbindung. Bei einer Lücke werden offene Sockets
  // absichtlich geschlossen, damit Clients per Poll/Catch-up nichts verpassen.
  async function startListener() {
    const client = await pool.connect();
    let failed = false;
    client.on("notification", (msg) => {
      if (msg.channel !== PTL_EVENTS_CHANNEL || !msg.payload) return;
      try {
        broadcast(JSON.parse(msg.payload));
      } catch (err) {
        console.error("[server] ptl_events payload parse error:", err);
      }
    });
    client.on("error", (err) => {
      if (failed) return;
      failed = true;
      try {
        client.release(true);
      } catch {}
      scheduleListenerReconnect(err);
    });
    try {
      await client.query(`LISTEN ${PTL_EVENTS_CHANNEL}`);
      listenerReady = true;
      console.log(`[server] LISTEN ${PTL_EVENTS_CHANNEL} aktiv`);
    } catch (error) {
      client.release(true);
      throw error;
    }
  }
  await startListener().catch(scheduleListenerReconnect);

  const httpServer = createServer(async (req, res) => {
    const forwarded = trustProxy ? req.headers["x-forwarded-for"] : null;
    const forwardedIp = typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : null;
    // Overwrite any client-supplied value. XFF is honored only behind an
    // explicitly trusted proxy; otherwise the TCP peer is authoritative.
    req.headers["x-tarlog-client-ip"] = forwardedIp || req.socket.remoteAddress || "local";
    let pathname;
    try {
      pathname = new URL(req.url ?? "/", "http://localhost").pathname;
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!dev && await serveNextStatic(req, res, pathname)) return;
    handle(req, res);
  });

  // WS-Server ohne eigenen HTTP-Server; Upgrade wird manuell geroutet.
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", async (req, socket, head) => {
    let requestUrl;
    try {
      requestUrl = new URL(req.url ?? "/", "http://localhost");
    } catch {
      socket.destroy();
      return;
    }
    if (requestUrl.pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    if (!listenerReady) {
      socket.write("HTTP/1.1 503 Service Unavailable\r\nRetry-After: 1\r\n\r\n");
      socket.destroy();
      return;
    }
    const token = requestUrl.searchParams.get("token") ?? "";
    let auth = null;
    try {
      auth = await verifyDeviceTokenSql(pool, token);
    } catch (err) {
      console.error("[server] WS auth error:", err);
    }
    if (!auth) {
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.__ptlMainAccountId = auth.main_account_id;
      ws.__ptlDeviceId = auth.device_id;
      registerSocket(auth.main_account_id, ws);
      let expiryTimer = null;
      if (auth.expires_at != null) {
        const armExpiry = () => {
          const remaining = auth.expires_at - Date.now();
          if (remaining <= 0) {
            ws.close(4001, "Token expired");
            return;
          }
          expiryTimer = setTimeout(armExpiry, Math.min(remaining, 2_147_000_000));
        };
        armExpiry();
      }
      ws.send(
        JSON.stringify({ kind: "ready", main_account_id: auth.main_account_id }),
      );
      ws.on("close", () => {
        if (expiryTimer) clearTimeout(expiryTimer);
        unregisterSocket(auth.main_account_id, ws);
      });
      ws.on("error", () => unregisterSocket(auth.main_account_id, ws));
      // Client→Server-Nachrichten (Ping/Heartbeat). Mutationen laufen über REST.
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg && msg.kind === "ping") {
            ws.send(JSON.stringify({ kind: "pong", t: Date.now() }));
          }
        } catch {
          // Nicht-JSON ignorieren.
        }
      });
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(
      `[server] bereit auf http://${hostname}:${port} (WS ${WS_PATH}, dev=${dev})`,
    );
  });

  const shutdown = () => {
    console.log("[server] shutdown…");
    listenerReady = false;
    if (listenerReconnectTimer) clearTimeout(listenerReconnectTimer);
    for (const set of registry.values()) for (const ws of set) ws.close();
    httpServer.close();
    pool.end().finally(() => process.exit(0));
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[server] fatal:", err);
  process.exit(1);
});

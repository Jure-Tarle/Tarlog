/**
 * scripts/ws-smoke.mjs — Live-Sync-Nachweis (doc 04 §5, AC27).
 *
 * Zwei Clients gegen den laufenden `server.mjs`:
 *   Client B hängt am WebSocket `/api/ws` (Auth per device/API-Token).
 *   Client A startet den Timer per REST (Session-Cookie).
 * Erwartet: B empfängt den `timer.started`-Umschlag über LISTEN/NOTIFY.
 *
 *   node scripts/ws-smoke.mjs <baseUrl> <apiToken> <cookieHeader> <projectId>
 *
 * Exit 0 = Broadcast angekommen, sonst 1.
 */
import WebSocket from "ws";

const [, , base, token, cookie, projectId] = process.argv;
if (!base || !token || !cookie) {
  console.error("usage: node scripts/ws-smoke.mjs <baseUrl> <apiToken> <cookieHeader> [projectId]");
  process.exit(2);
}

const wsUrl = base.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(token)}`;
const received = [];
let opened = false;

const ws = new WebSocket(wsUrl);

function done(code, msg) {
  console.log(msg);
  try {
    ws.close();
  } catch {
    /* ignore */
  }
  process.exit(code);
}

const timeout = setTimeout(
  () => done(1, `FAIL: kein timer.started in 12s. Empfangen: ${JSON.stringify(received)}`),
  12_000,
);

ws.on("error", (e) => done(1, `FAIL: WS-Fehler ${e.message}`));

ws.on("open", async () => {
  opened = true;
  console.log("Client B: WS verbunden und per Token authentifiziert");
  await new Promise((r) => setTimeout(r, 300)); // Registry füllen lassen
  const res = await fetch(`${base}/api/timer/start`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify(projectId ? { project_id: projectId } : {}),
  });
  console.log(`Client A: POST /api/timer/start -> HTTP ${res.status}`);
  if (!res.ok) done(1, `FAIL: timer/start HTTP ${res.status} ${await res.text()}`);
});

ws.on("message", (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  received.push(msg.type ?? "(kein type)");
  if (msg.type !== "timer.started") return;
  clearTimeout(timeout);
  const complete = Boolean(msg.entity_type && msg.main_account_id && msg.data && msg.event_id);
  done(
    complete ? 0 : 1,
    complete
      ? `PASS: Client B empfing timer.started (entity_type=${msg.entity_type}, entity_id=${String(msg.entity_id).slice(0, 8)}…)`
      : `FAIL: unvollständiger Umschlag: ${JSON.stringify(msg).slice(0, 200)}`,
  );
});

ws.on("close", () => {
  if (!opened) done(1, "FAIL: WS vor `open` geschlossen — Token-Auth abgelehnt?");
});

/**
 * scripts/ws-smoke.mjs, Live-Sync-Nachweis (doc 04 §5, AC27).
 *
 * Zwei Clients gegen den laufenden `server.mjs`:
 *   Client B hängt am WebSocket `/api/ws` (Auth per device/API-Token).
 *   Client A startet den Timer per REST (Session-Cookie).
 * Erwartet: B empfängt den `timer.started`-Umschlag über LISTEN/NOTIFY.
 *
 * Danach widerruft Client A das gebundene Gerät. Der bereits offene Socket
 * muss sofort mit Code 4003 schließen und darf keine weiteren Events sehen.
 *
 *   node scripts/ws-smoke.mjs <baseUrl> <apiToken> <cookieHeader> <projectId> <deviceId>
 *
 * Exit 0 = Broadcast angekommen, sonst 1.
 */
import WebSocket from "ws";

const [,, base, token, cookie, projectId, deviceId] = process.argv;
if (!base || !token || !cookie || !deviceId) {
  console.error("usage: node scripts/ws-smoke.mjs <baseUrl> <apiToken> <cookieHeader> <projectId> <deviceId>");
  process.exit(2);
}

const wsUrl = base.replace(/^http/, "ws") + `/api/ws?token=${encodeURIComponent(token)}`;
const received = [];
let opened = false;
let awaitingRevocation = false;

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
  () => done(1, `FAIL: Live-Test nicht in 12s abgeschlossen. Empfangen: ${JSON.stringify(received)}`),
  12_000,
);

ws.on("error", (e) => done(1, `FAIL: WS-Fehler ${e.message}`));

ws.on("open", async () => {
  opened = true;
  console.log("Client B: WS verbunden und per Token authentifiziert");
  await new Promise((r) => setTimeout(r, 300)); // Registry füllen lassen
  const res = await fetch(`${base}/api/timer/start`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, origin: base },
    body: JSON.stringify(projectId ? { project_id: projectId } : {}),
  });
  console.log(`Client A: POST /api/timer/start -> HTTP ${res.status}`);
  if (!res.ok) done(1, `FAIL: timer/start HTTP ${res.status} ${await res.text()}`);
});

ws.on("message", async (raw) => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }
  received.push(msg.type ?? "(kein type)");
  if (msg.type !== "timer.started") return;
  const complete = Boolean(msg.entity_type && msg.main_account_id && msg.data && msg.event_id);
  if (!complete) {
    done(1, `FAIL: unvollständiger Umschlag: ${JSON.stringify(msg).slice(0, 200)}`);
    return;
  }
  awaitingRevocation = true;
  const revoked = await fetch(`${base}/api/devices/${encodeURIComponent(deviceId)}`, {
    method: "DELETE",
    headers: { cookie, origin: base },
  });
  if (!revoked.ok) {
    done(1, `FAIL: Gerätewiderruf HTTP ${revoked.status} ${await revoked.text()}`);
  }
});

ws.on("close", (code) => {
  if (awaitingRevocation) {
    clearTimeout(timeout);
    done(
      code === 4003 ? 0 : 1,
      code === 4003
        ? "PASS: timer.started empfangen; widerrufenes Gerät sofort getrennt"
        : `FAIL: Gerätewiderruf schloss mit unerwartetem Code ${code}`,
    );
    return;
  }
  if (!opened) done(1, "FAIL: WS vor `open` geschlossen, Token-Auth abgelehnt?");
});

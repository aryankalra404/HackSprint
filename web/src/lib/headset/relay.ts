import http from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { STREAM_PORT } from "./config";

// Passes the headset's view to the browsers watching it (contract: Headset view). The headset encodes
// its own view as H.264 on the Quest's hardware encoder (HeadsetView.cs) and sends each frame here; this
// sends it on to every viewer of the same session as it came, and the browser decodes it (stream.ts).
// Adapted from the headset-stream kit's relay; its wire format is kept as is.
//
// Connect with /view?role=headset|viewer&session=<id>. Text messages are JSON control, binary are frames:
//   byte 0     1 (the format)
//   byte 1     flags, bit 0 set on a keyframe
//   bytes 2-5  capture time in ms, uint32 big-endian
//   the rest   one H.264 access unit, Annex B; a keyframe carries its SPS and PPS
//
// To the headset: `start` when someone starts watching, `stop` when the last one leaves (so it only
// encodes while watched), `keyframe` when a viewer needs one to begin from. To viewers: `state` with
// `headset` whenever that changes, and the headset's `stats` (numbers and flags only). Either end can
// send `join` with `session` to move. A viewer that falls behind skips to the next keyframe.

const PATH = "/view";
const FORMAT = 1;
const KEYFRAME = 1;
const HEADER_BYTES = 6;
// Bytes queued to a viewer before it skips ahead: about a second of video
const MAX_VIEWER_BACKLOG = 1024 * 1024;
// A keyframe is large, so ask for one at most this often
const KEYFRAME_REQUEST_MS = 500;
// A headset that sleeps never closes its connection; this finds it gone
const PING_MS = 8000;

interface Peer {
  role: "headset" | "viewer";
  sessionId: string | null;
  alive: boolean;
  waitingForKey: boolean;
}

interface Session {
  headset: WebSocket | null;
  viewers: Set<WebSocket>;
  lastKeyRequest: number;
}

function cleanSession(value: unknown): string | null {
  const id = String(value ?? "").trim();
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(id) ? id : null;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  return Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data);
}

export function attachHeadsetRelay(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 * 1024 });
  const sessions = new Map<string, Session>();
  const peers = new WeakMap<WebSocket, Peer>();

  const sessionFor = (id: string) => {
    let s = sessions.get(id);
    if (!s) sessions.set(id, (s = { headset: null, viewers: new Set(), lastKeyRequest: 0 }));
    return s;
  };

  const send = (ws: WebSocket | null, message: object) => {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
  };

  function askForKeyframe(s: Session) {
    const now = Date.now();
    if (!s.headset || now - s.lastKeyRequest < KEYFRAME_REQUEST_MS) return;
    s.lastKeyRequest = now;
    send(s.headset, { type: "keyframe" });
  }

  const tellHeadset = (s: Session) => send(s.headset, { type: s.viewers.size > 0 ? "start" : "stop" });
  const tellViewers = (s: Session) => {
    for (const viewer of s.viewers) send(viewer, { type: "state", headset: Boolean(s.headset) });
  };

  function leave(ws: WebSocket, peer: Peer) {
    const id = peer.sessionId;
    if (!id) return;
    peer.sessionId = null;
    const s = sessions.get(id);
    if (!s) return;
    if (peer.role === "headset") {
      if (s.headset === ws) {
        s.headset = null;
        tellViewers(s);
        console.log(`[headset view] ${id}: headset left`);
      }
    } else if (s.viewers.delete(ws) && s.viewers.size === 0) {
      tellHeadset(s);
    }
    if (!s.headset && s.viewers.size === 0) sessions.delete(id);
  }

  function join(ws: WebSocket, peer: Peer, id: string) {
    if (peer.sessionId === id) return;
    leave(ws, peer);
    peer.sessionId = id;
    const s = sessionFor(id);
    if (peer.role === "headset") {
      // One headset per session. A reconnect arrives before the old socket is noticed gone, so the newest wins.
      if (s.headset && s.headset !== ws) {
        const previous = s.headset;
        const old = peers.get(previous);
        if (old) old.sessionId = null;
        previous.close(4000, "replaced");
      }
      s.headset = ws;
      tellHeadset(s);
      tellViewers(s);
      console.log(`[headset view] ${id}: headset here, ${s.viewers.size} watching`);
    } else {
      // Nothing is shown until a keyframe arrives: every other frame only says what changed
      peer.waitingForKey = true;
      s.viewers.add(ws);
      send(ws, { type: "state", headset: Boolean(s.headset) });
      if (s.viewers.size === 1) tellHeadset(s);
      s.lastKeyRequest = 0;
      askForKeyframe(s);
    }
  }

  function relay(s: Session, data: Buffer) {
    const key = (data[1] & KEYFRAME) !== 0;
    let behind = false;
    for (const viewer of s.viewers) {
      const peer = peers.get(viewer);
      if (!peer || viewer.readyState !== viewer.OPEN) continue;
      if (viewer.bufferedAmount > MAX_VIEWER_BACKLOG) {
        peer.waitingForKey = true;
        behind = true;
        continue;
      }
      if (peer.waitingForKey && !key) {
        behind = true;
        continue;
      }
      if (key) peer.waitingForKey = false;
      viewer.send(data, { binary: true });
    }
    if (behind) askForKeyframe(s);
  }

  wss.on("connection", (ws: WebSocket, request: http.IncomingMessage) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const peer: Peer = { role: url.searchParams.get("role") === "headset" ? "headset" : "viewer", sessionId: null, alive: true, waitingForKey: true };
    peers.set(ws, peer);
    ws.on("pong", () => (peer.alive = true));

    const id = cleanSession(url.searchParams.get("session"));
    if (id) join(ws, peer, id);

    ws.on("message", (raw, isBinary) => {
      if (isBinary) {
        const data = toBuffer(raw);
        if (peer.role !== "headset" || !peer.sessionId || data.length <= HEADER_BYTES || data[0] !== FORMAT) return;
        const s = sessions.get(peer.sessionId);
        if (s && s.headset === ws) relay(s, data);
        return;
      }
      let message: Record<string, unknown>;
      try {
        message = JSON.parse(toBuffer(raw).toString());
      } catch {
        return;
      }
      if (message?.type === "join") {
        const next = cleanSession(message.session);
        if (next) join(ws, peer, next);
      } else if (message?.type === "stats" && peer.role === "headset" && peer.sessionId) {
        const s = sessions.get(peer.sessionId);
        if (!s || s.headset !== ws) return;
        const stats: Record<string, unknown> = { type: "stats" };
        for (const [k, v] of Object.entries(message)) {
          if (k !== "type" && ((typeof v === "number" && Number.isFinite(v)) || typeof v === "boolean")) stats[k] = v;
        }
        for (const viewer of s.viewers) send(viewer, stats);
      } else if (message?.type === "keyframe" && peer.role === "viewer" && peer.sessionId) {
        const s = sessions.get(peer.sessionId);
        if (!s) return;
        peer.waitingForKey = true;
        askForKeyframe(s);
      }
    });
    ws.on("close", () => leave(ws, peer));
    ws.on("error", () => {});
  });

  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      const peer = peers.get(ws);
      if (!peer?.alive) {
        ws.terminate();
        continue;
      }
      peer.alive = false;
      ws.ping();
    }
  }, PING_MS);
  pinger.unref();

  server.on("upgrade", (request, socket, head) => {
    let pathname: string;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });

  return {
    // Who is streaming and who is watching
    summary: () => [...sessions.entries()].map(([sessionId, s]) => ({ session: sessionId, headset: Boolean(s.headset), viewers: s.viewers.size })),
  };
}

// Runs the relay on its own port next to the web app, once per server process
export function startHeadsetRelay() {
  const g = globalThis as { __dryrunHeadsetRelay?: boolean };
  if (g.__dryrunHeadsetRelay) return;
  g.__dryrunHeadsetRelay = true;

  let summary: () => unknown = () => [];
  const server = http.createServer((req, res) => {
    // GET /status: is a headset streaming, and how many are watching
    res.writeHead(req.url === "/status" ? 200 : 404, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(req.url === "/status" ? JSON.stringify(summary()) : "{}");
  });
  summary = attachHeadsetRelay(server).summary;
  server.on("error", (err) => console.warn(`[headset view] the relay is off: ${err.message}`));
  server.listen(STREAM_PORT, () => console.log(`[headset view] relay listening on port ${STREAM_PORT} (ws /view)`));
}

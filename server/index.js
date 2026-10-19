// HTTP + WebSocket server. Serves the built phone app and runs every game in memory.
// Message format (JSON over WebSocket):
//   client -> server: { t: 'create'|'join'|'resume'|'action'|'leave', rid, ...data }
//   server -> client: { t: 'res', rid, ...result } | { t: 'state', view } | { t: 'kicked' }

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './game.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const DIST = path.join(__dirname, '..', 'dist');
const IDLE_MS = 12 * 3600 * 1000; // games with no activity for 12 hours are cleared
const MAX_MESSAGE = 6 * 1024 * 1024;

const games = new Map(); // code -> Game
const photos = new Map(); // photoId -> Buffer
const clients = new Set(); // live sockets: { ws, code, pid }

const hooks = {
  savePhoto(buf) {
    const id = crypto.randomBytes(12).toString('hex');
    photos.set(id, buf);
    return id;
  },
  deletePhoto(id) {
    photos.delete(id);
  },
};

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do code = Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  while (games.has(code));
  return code;
}

// ---------- HTTP ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function sendFile(res, file, cache) {
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('Not found. If you are running locally, build the app first with: npm run build');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, games: games.size }));
  }
  const m = url.pathname.match(/^\/p\/([a-f0-9]{24})$/);
  if (m) {
    const buf = photos.get(m[1]);
    if (!buf) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' });
    return res.end(buf);
  }
  const safe = path.normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
  const file = path.join(DIST, safe);
  if (file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    return sendFile(res, file, file.endsWith('index.html') ? 'no-cache' : 'public, max-age=3600');
  }
  sendFile(res, path.join(DIST, 'index.html'), 'no-cache');
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MESSAGE });

function send(c, msg) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(msg));
}

function broadcast(game) {
  game.dirty = false;
  for (const c of clients) {
    if (c.code !== game.code || !c.pid) continue;
    const view = game.viewFor(c.pid);
    if (view) send(c, { t: 'state', view });
    else {
      send(c, { t: 'kicked' });
      c.code = null;
      c.pid = null;
    }
  }
}

function attach(c, game, player) {
  c.code = game.code;
  c.pid = player.id;
  player.connected = true;
  game.touch();
}

function markDisconnected(code, pid) {
  const game = games.get(code);
  const p = game?.players.get(pid);
  if (!p) return;
  const stillHere = [...clients].some((c) => c.code === code && c.pid === pid);
  if (!stillHere) {
    p.connected = false;
    game.touch();
  }
}

wss.on('connection', (ws) => {
  const c = { ws, code: null, pid: null, alive: true };
  clients.add(c);
  ws.on('pong', () => (c.alive = true));

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const reply = (out) => send(c, { t: 'res', rid: msg.rid, ...out });
    const { t } = msg;

    if (t === 'create') {
      const code = newCode();
      const game = new Game(code, hooks);
      const r = game.addPlayer(msg.name, msg.avatar);
      if (r.error) return reply({ error: r.error });
      games.set(code, game);
      attach(c, game, r.player);
      reply({ ok: true, code, token: r.player.token });
      return broadcast(game);
    }
    if (t === 'join') {
      const game = games.get(String(msg.code || '').toUpperCase().trim());
      if (!game) return reply({ error: 'No game with that code. Check it and try again.' });
      const r = game.addPlayer(msg.name, msg.avatar);
      if (r.error) return reply({ error: r.error });
      attach(c, game, r.player);
      reply({ ok: true, code: game.code, token: r.player.token });
      return broadcast(game);
    }
    if (t === 'resume') {
      const game = games.get(String(msg.code || '').toUpperCase());
      const player = game?.byToken(msg.token);
      if (!game || !player) return reply({ error: 'That game has ended or you were removed.' });
      attach(c, game, player);
      reply({ ok: true, code: game.code });
      return broadcast(game);
    }
    if (t === 'leave') {
      const { code, pid } = c;
      c.code = null;
      c.pid = null;
      markDisconnected(code, pid);
      return reply({ ok: true });
    }
    if (t === 'action') {
      const game = games.get(c.code);
      if (!game || !c.pid) return reply({ error: 'You are not in a game.' });
      const out = game.handle(c.pid, msg.action || {});
      reply(out);
      if (game.dirty) broadcast(game);
    }
  });

  ws.on('close', () => {
    clients.delete(c);
    if (c.code) markDisconnected(c.code, c.pid);
  });
});

// Keep connections alive through proxies and drop dead ones.
setInterval(() => {
  for (const c of clients) {
    if (!c.alive) {
      c.ws.terminate();
      continue;
    }
    c.alive = false;
    try {
      c.ws.ping();
    } catch {}
  }
}, 25000);

// Game clock: advance timers and push updates.
setInterval(() => {
  const now = Date.now();
  for (const [code, game] of games) {
    game.tick(now);
    if (game.dirty) broadcast(game);
    if (now - game.lastActivity > IDLE_MS) {
      for (const id of game.photoIds) photos.delete(id);
      games.delete(code);
    }
  }
}, 250);

// In slow-burn games, refresh once a minute so time-based buttons appear without anyone acting.
setInterval(() => {
  for (const game of games.values()) if (game.settings.pacing === 'slow' && game.phase !== 'lobby') broadcast(game);
}, 60000);

server.listen(PORT, () => console.log(`Game server listening on http://localhost:${PORT}`));

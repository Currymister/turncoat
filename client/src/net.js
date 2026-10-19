// WebSocket connection with request/response, auto-reconnect and session resume.

const SESSION_KEY = 'turncoat.session';
let ws = null;
let rid = 0;
const pending = new Map();
const listeners = new Set();
let status = 'connecting';
let retry = 0;

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}
export function setSession(s) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {}
}

function emit(evt) {
  for (const fn of listeners) fn(evt);
}
export function subscribe(fn) {
  listeners.add(fn);
  fn({ type: 'status', status });
  return () => listeners.delete(fn);
}

function setStatus(s) {
  status = s;
  emit({ type: 'status', status });
}

export function connect() {
  if (ws && ws.readyState <= 1) return;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}/ws`);
  setStatus('connecting');
  ws.onopen = async () => {
    retry = 0;
    setStatus('open');
    const s = getSession();
    if (s) {
      const r = await request('resume', s);
      if (r.error) {
        setSession(null);
        emit({ type: 'ended', message: r.error });
      }
    }
  };
  ws.onmessage = (e) => {
    let msg;
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    if (msg.t === 'res') {
      const p = pending.get(msg.rid);
      if (p) {
        pending.delete(msg.rid);
        clearTimeout(p.timer);
        p.resolve(msg);
      }
    } else if (msg.t === 'state') emit({ type: 'state', view: msg.view });
    else if (msg.t === 'kicked') {
      setSession(null);
      emit({ type: 'ended', message: 'You were removed from the game.' });
    }
  };
  ws.onclose = () => {
    setStatus('closed');
    for (const [, p] of pending) p.resolve({ error: 'Connection lost. Reconnecting…' });
    pending.clear();
    retry = Math.min(retry + 1, 6);
    setTimeout(connect, 500 * retry);
  };
}

export function request(t, data = {}) {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== 1) return resolve({ error: 'Not connected yet. Try again in a moment.' });
    const id = ++rid;
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve({ error: 'The server took too long to answer. Try again.' });
    }, 15000);
    pending.set(id, { resolve, timer });
    ws.send(JSON.stringify({ t, rid: id, ...data }));
  });
}

export const act = (action) => request('action', { action });

// A small heartbeat while the app is open, so free hosting never thinks a long round table is idle.
setInterval(() => {
  if (ws && ws.readyState === 1 && document.visibilityState === 'visible') ws.send(JSON.stringify({ t: 'ping' }));
}, 4 * 60 * 1000);

// Reconnect straight away when a phone wakes up or comes back online.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ws && ws.readyState > 1) {
    retry = 0;
    connect();
  }
});

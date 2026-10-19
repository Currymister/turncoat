// Shared pieces used across screens.
import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { act } from './net.js';

export const GameCtx = createContext(null);
export const useGame = () => useContext(GameCtx);

export const AVATARS = ['🦊', '🐺', '🦉', '🐍', '🦡', '🐗', '🦌', '🐈‍⬛', '🐀', '🦅', '🐻', '🦢', '🐸', '🐇', '🦇', '🐴', '🦔', '🐌'];

// Server clock offset keeps every phone's countdown in step.
let offset = 0;
export function syncClock(serverNow) {
  offset = serverNow - Date.now();
}
export const now = () => Date.now() + offset;

export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

export function fmtTime(msLeft) {
  const s = Math.max(0, Math.ceil(msLeft / 1000));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

export function Countdown({ big }) {
  const { view } = useGame();
  useTick(500);
  if (view.paused) return <span className={big ? 'countdown big' : 'countdown'}>Paused</span>;
  if (!view.phaseEndsAt) return null;
  const left = view.phaseEndsAt - now();
  return <span className={`${big ? 'countdown big' : 'countdown'}${left < 60000 ? ' low' : ''}`}>{fmtTime(left)}</span>;
}

export function usePlayers() {
  const { view } = useGame();
  const byId = Object.fromEntries(view.players.map((p) => [p.id, p]));
  return { byId, name: (id) => byId[id]?.name ?? 'Someone' };
}

// Roles are only drawn once they are public, so a glance at someone's screen gives nothing away.
export function rolePublic(p, view) {
  return !!p?.role && (view.omniscient || p.status !== 'alive' || ['finalReveal', 'gameOver'].includes(view.phase));
}

export function Avatar({ p, size = 'md' }) {
  const { view } = useGame();
  if (!p) return null;
  const out = p.status && p.status !== 'alive';
  const show = view && rolePublic(p, view);
  return (
    <span className={`avatar ${size}${out ? ' out' : ''}${show ? ' role-' + p.role : ''}`} aria-hidden="true">
      {p.avatar}
    </span>
  );
}

export function PlayerRow({ p, children, onClick, selected, disabled }) {
  const { view } = useGame();
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`player-row${selected ? ' selected' : ''}${p.status !== 'alive' ? ' is-out' : ''}`} onClick={onClick} disabled={disabled} type={onClick ? 'button' : undefined}>
      <Avatar p={p} />
      <span className="player-name">
        {p.name}
        {view && rolePublic(p, view) && <RoleTag role={p.role} />}
      </span>
      <span className="player-extra">{children}</span>
    </Tag>
  );
}

export function RoleTag({ role }) {
  return <span className={`role-tag ${role}`}>{role === 'traitor' ? 'Traitor' : 'Faithful'}</span>;
}

export function useAct() {
  const { toast } = useGame();
  const [busy, setBusy] = useState(false);
  const run = async (action) => {
    setBusy(true);
    const r = await act(action);
    setBusy(false);
    if (r.error) toast(r.error);
    return r;
  };
  return [run, busy];
}

export function ReadyButton({ label = "I'm ready", waiting = 'Waiting for the others' }) {
  const { view } = useGame();
  const [run, busy] = useAct();
  if (!view.ready.can) return null;
  const mine = view.you.ready;
  return (
    <div className="ready-bar">
      {mine ? (
        <button className="btn ghost" onClick={() => run({ type: 'ready', value: false })} disabled={busy}>
          {waiting} ({view.ready.count} of {view.ready.needed})
        </button>
      ) : (
        <button className="btn primary" onClick={() => run({ type: 'ready' })} disabled={busy}>
          {label}
        </button>
      )}
    </div>
  );
}

// Press and hold to read. Keeps secrets private when phones are on show around a table.
export function HoldCard({ title, hint = 'Press and hold to read', children, tone = 'seal', className = '' }) {
  const [open, setOpen] = useState(false);
  const start = (e) => {
    e.preventDefault();
    setOpen(true);
  };
  const stop = () => setOpen(false);
  return (
    <div
      className={`hold-card tone-${tone}${open ? ' open' : ''} ${className}`}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setOpen(true)}
      onKeyUp={stop}
      onBlur={stop}
      tabIndex={0}
      role="button"
      aria-pressed={open}
    >
      {open ? (
        <div className="hold-inner">{children}</div>
      ) : (
        <div className="hold-closed">
          <span className="seal" aria-hidden="true" />
          <span className="hold-title">{title}</span>
          <span className="hold-hint">{hint}</span>
        </div>
      )}
    </div>
  );
}

export function RoleCardContent() {
  const { view } = useGame();
  const me = view.you;
  const allies = view.players.filter((p) => p.role === 'traitor' && p.id !== me.id && !p.isHost);
  if (me.isHost) return <p>You are the Host. You can see everything.</p>;
  return (
    <>
      <p className="role-line">You are</p>
      <p className={`role-name ${me.role}`}>{me.role === 'traitor' ? 'a Traitor' : 'Faithful'}</p>
      {me.role === 'traitor' ? (
        <>
          <p>{me.recruited ? 'You were recruited. ' : ''}Murder the Faithful by night. Survive to the end unseen.</p>
          {allies.length > 0 ? (
            <p className="allies">Your fellow Traitors: {allies.map((a) => `${a.avatar} ${a.name}`).join(', ')}</p>
          ) : (
            <p className="allies">You are the only Traitor.</p>
          )}
        </>
      ) : (
        <p>Find the Traitors and banish them before the end.</p>
      )}
      {me.shieldTonight && <p className="shield-note">You hold a shield tonight.</p>}
      {me.shieldNext && <p className="shield-note">You hold a shield for tomorrow night.</p>}
    </>
  );
}

export function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="btn small ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function Chat({ messages, canChat, placeholder = 'Say something…' }) {
  const { name, byId } = usePlayers();
  const { view } = useGame();
  const [text, setText] = useState('');
  const [run, busy] = useAct();
  const end = useRef(null);
  useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [messages.length]);
  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const r = await run({ type: 'chat', text });
    if (!r.error) setText('');
  };
  return (
    <div className="chat">
      <div className="chat-log">
        {messages.length === 0 && <p className="muted">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg${m.from === view.you.id ? ' mine' : ''}${!m.from ? ' system' : ''}`}>
            {m.from && (
              <span className="chat-from">
                {byId[m.from]?.avatar} {name(m.from)}
              </span>
            )}
            <span className="chat-text">{m.text}</span>
          </div>
        ))}
        <div ref={end} />
      </div>
      {canChat && (
        <form className="chat-form" onSubmit={send}>
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} maxLength={300} aria-label="Message" />
          <button className="btn primary small" disabled={busy || !text.trim()}>
            Send
          </button>
        </form>
      )}
    </div>
  );
}

export function Gallery({ items, onHeart, host }) {
  const { byId } = usePlayers();
  const { view } = useGame();
  const [run] = useAct();
  const [zoom, setZoom] = useState(null);
  if (!items?.length) return <p className="muted">No photos yet.</p>;
  return (
    <>
      <div className="gallery">
        {items.map((g) => (
          <figure key={g.id} className="photo">
            <button className="photo-btn" onClick={() => setZoom(g)} aria-label={`Open ${byId[g.id]?.name}'s photo`}>
              <img src={g.url} alt="" loading="lazy" />
            </button>
            <figcaption>
              <span>
                {byId[g.id]?.avatar} {byId[g.id]?.name}
                {g.item && <span className="muted"> · {g.item}</span>}
              </span>
              {onHeart && g.id !== view.you.id && (
                <button className={`heart${g.myHeart ? ' on' : ''}`} onClick={() => run({ type: 'heart', id: g.id })} aria-label="Heart this photo">
                  ♥ {g.hearts}
                </button>
              )}
            </figcaption>
            {host && (
              <div className="approve">
                <label>
                  <input type="checkbox" checked={g.ok !== false} onChange={(e) => run({ type: 'approve', id: g.id, ok: e.target.checked })} /> Task done
                </label>
                {(byId[g.id]?.role === 'traitor' || g.hid) && (
                  <label>
                    <input type="checkbox" checked={g.objectOk ?? g.hid} onChange={(e) => run({ type: 'approve', id: g.id, objectOk: e.target.checked })} /> Object hidden
                  </label>
                )}
              </div>
            )}
          </figure>
        ))}
      </div>
      {zoom && (
        <div className="zoom" onClick={() => setZoom(null)}>
          <img src={zoom.url} alt={`${byId[zoom.id]?.name}'s photo`} />
          <p>Tap anywhere to close</p>
        </div>
      )}
    </>
  );
}

// Finger-written name on a slate, like the chalkboards at the round table.
export function Slate({ onChange }) {
  const ref = useRef(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  useEffect(() => {
    const c = ref.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = c.clientWidth * dpr;
    c.height = c.clientHeight * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#F2EEE6';
  }, []);
  const pos = (e) => {
    const r = ref.current.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const down = (e) => {
    e.preventDefault();
    ref.current.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = ref.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const ctx = ref.current.getContext('2d');
    const [x, y] = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) {
      const out = document.createElement('canvas');
      out.width = 360;
      out.height = 150;
      out.getContext('2d').drawImage(ref.current, 0, 0, 360, 150);
      onChange(out.toDataURL('image/png'));
    }
  };
  const clear = () => {
    const c = ref.current;
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };
  return (
    <div className="slate-wrap">
      <canvas ref={ref} className="slate" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} aria-label="Write a name with your finger" />
      <button type="button" className="btn small ghost" onClick={clear}>
        Wipe slate
      </button>
    </div>
  );
}

// Shrinks a camera photo before upload so it sends quickly on pub wifi.
export function resizeImage(file, max = 1100, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => reject(new Error('That file could not be read as a photo.'));
    img.src = url;
  });
}

// Everyone gets the same sealed card, so a Traitor's secret news looks no different from "nothing to report".
export function SecretReport({ lines }) {
  const { view } = useGame();
  if (view.you.isHost || view.you.status !== 'alive') return null;
  const real = lines.filter(Boolean);
  return (
    <HoldCard title="Secret report" className="orders">
      {real.length ? real.map((l, i) => <p key={i}>{l}</p>) : <p>Nothing to report.</p>}
    </HoldCard>
  );
}

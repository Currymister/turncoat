import { useState } from 'react';
import { request } from '../net.js';
import { AVATARS, useGame } from '../ui.jsx';
import { APP_NAME, TAGLINE } from '../config.js';

export default function Home({ onJoined, notice }) {
  const { toast } = useGame();
  const joinParam = new URLSearchParams(location.search).get('join') || '';
  const [mode, setMode] = useState(joinParam ? 'join' : null);
  const [name, setName] = useState(() => localStorage.getItem('turncoat.name') || '');
  const [avatar, setAvatar] = useState(() => localStorage.getItem('turncoat.avatar') || AVATARS[Math.floor(Math.random() * AVATARS.length)]);
  const [code, setCode] = useState(joinParam.toUpperCase());
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!age) return toast('Please confirm you are 16 or over.');
    setBusy(true);
    localStorage.setItem('turncoat.name', name.trim());
    localStorage.setItem('turncoat.avatar', avatar);
    const r = mode === 'create' ? await request('create', { name, avatar }) : await request('join', { code, name, avatar });
    setBusy(false);
    if (r.error) return toast(r.error);
    onJoined(r.code, r.token);
  };

  return (
    <main className="home">
      <header className="home-head">
        <div className="candle" aria-hidden="true" />
        <h1>{APP_NAME}</h1>
        <p className="tagline">{TAGLINE}</p>
      </header>
      {notice && <p className="notice">{notice}</p>}

      {!mode && (
        <div className="home-actions">
          <button className="btn primary big" onClick={() => setMode('create')}>
            Start a game
          </button>
          <button className="btn big" onClick={() => setMode('join')}>
            Join with a code
          </button>
          <section className="how">
            <h2>How it works</h2>
            <p>Everyone plays on their own phone. A few of you are secretly Traitors. By day you complete missions and argue at the round table, then vote someone out. By night the Traitors murder. Survive to the end, and don't trust anyone.</p>
          </section>
        </div>
      )}

      {mode && (
        <form className="panel join-form" onSubmit={submit}>
          <h2>{mode === 'create' ? 'Start a game' : 'Join a game'}</h2>
          {mode === 'join' && (
            <label className="field">
              <span>Game code</span>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={6} autoCapitalize="characters" autoComplete="off" placeholder="ABC123" required className="code-input" />
            </label>
          )}
          <label className="field">
            <span>Your name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} required placeholder="What your friends call you" />
          </label>
          <fieldset className="field">
            <legend>Pick your face</legend>
            <div className="avatar-grid">
              {AVATARS.map((a) => (
                <button type="button" key={a} className={`avatar-pick${a === avatar ? ' on' : ''}`} onClick={() => setAvatar(a)} aria-pressed={a === avatar}>
                  {a}
                </button>
              ))}
            </div>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={age} onChange={(e) => setAge(e.target.checked)} /> I am 16 or over
          </label>
          <div className="row">
            <button type="button" className="btn ghost" onClick={() => setMode(null)}>
              Back
            </button>
            <button className="btn primary" disabled={busy}>
              {mode === 'create' ? 'Create game' : 'Join game'}
            </button>
          </div>
        </form>
      )}
    </main>
  );
}

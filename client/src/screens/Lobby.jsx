import { useState } from 'react';
import { useGame, useAct, PlayerRow } from '../ui.jsx';

const OPTIONS = {
  mode: [
    ['inperson', 'In person'],
    ['remote', 'Remote (text chat)'],
  ],
  runBy: [
    ['auto', 'The app runs it'],
    ['host', 'I’ll host (not playing)'],
  ],
  pacing: [
    ['quick', 'Quick (about 20 min a day)'],
    ['standard', 'Standard (about 30 min a day)'],
    ['slow', 'Slow-burn (moves on when everyone is ready)'],
  ],
  traitors: [
    ['auto', 'Auto, by player count'],
    [1, '1'],
    [2, '2'],
    [3, '3'],
    [4, '4'],
  ],
  pack: [
    ['pub', 'Pub'],
    ['home', 'Home'],
    ['outdoors', 'Outdoors'],
  ],
  endgameSize: [
    ['auto', 'Auto (3 for 4–6 players, otherwise 4)'],
    [3, '3 left'],
    [4, '4 left'],
    [5, '5 left'],
  ],
};
const LABELS = { mode: 'Where you’re playing', runBy: 'Who runs the game', pacing: 'Pacing', traitors: 'Traitors', pack: 'Mission pack', endgameSize: 'Endgame starts at' };
const TOGGLES = [
  ['shields', 'Shields', 'Best photo and top puzzle solver win secret protection from murder.'],
  ['recruitment', 'Recruitment', 'When a Traitor is banished, the others can recruit a Faithful.'],
  ['decoys', 'Decoy objects', 'Some Faithful get a decoy object too, so a stray spoon proves nothing.'],
  ['ghostsFollow', 'Ghosts follow along (remote)', 'Players who are out can see every role in remote games.'],
];

export default function Lobby() {
  const { view, leave, toast } = useGame();
  const [run, busy] = useAct();
  const [showSettings, setShowSettings] = useState(true);
  const me = view.you;
  const s = view.settings;
  const players = view.players.filter((p) => !p.isHost);
  const host = view.players.find((p) => p.isHost);
  const link = `${location.origin}/?join=${view.code}`;
  const enough = players.length >= view.minPlayers;

  const set = (k, v) => run({ type: 'settings', settings: { [k]: v } });
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Join my game', text: `Join my game with code ${view.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        toast('Invite link copied.');
      }
    } catch {}
  };
  const toggleTraitor = (id) => {
    const picks = view.players.filter((p) => p.traitorPick).map((p) => p.id);
    const next = picks.includes(id) ? picks.filter((x) => x !== id) : [...picks, id];
    run({ type: 'setTraitors', ids: next });
  };

  return (
    <main className="screen lobby">
      <section className="code-panel">
        <p className="muted">Game code</p>
        <p className="game-code">{view.code}</p>
        <button className="btn" onClick={share}>
          Share invite link
        </button>
      </section>

      <section className="panel">
        <h2>
          Players <span className="count">{players.length}</span>
        </h2>
        {host && <p className="muted">Hosted by {host.avatar} {host.name}</p>}
        <div className="player-list">
          {players.map((p) => (
            <PlayerRow key={p.id} p={p}>
              {!p.connected && <span className="muted">offline</span>}
              {me.isHost && s.runBy === 'host' && (
                <button className={`btn small${p.traitorPick ? ' danger' : ' ghost'}`} onClick={() => toggleTraitor(p.id)}>
                  {p.traitorPick ? 'Traitor' : 'Make Traitor'}
                </button>
              )}
              {me.isCreator && p.id !== me.id && (
                <button className="btn small ghost" onClick={() => run({ type: 'kick', id: p.id })} aria-label={`Remove ${p.name}`}>
                  Remove
                </button>
              )}
            </PlayerRow>
          ))}
        </div>
        {me.isHost && s.runBy === 'host' && <p className="muted small">Pick Traitors yourself, or leave them all unpicked for a random draw.</p>}
      </section>

      <section className="panel">
        <button className="section-toggle" onClick={() => setShowSettings((x) => !x)} aria-expanded={showSettings}>
          <h2>Game settings</h2>
          <span>{showSettings ? 'Hide' : 'Show'}</span>
        </button>
        {showSettings &&
          (me.isCreator ? (
            <div className="settings">
              {Object.keys(OPTIONS).map((k) => (
                <label className="field" key={k}>
                  <span>{LABELS[k]}</span>
                  <select value={String(s[k])} onChange={(e) => set(k, OPTIONS[k].find(([v]) => String(v) === e.target.value)[0])} disabled={busy}>
                    {OPTIONS[k].map(([v, l]) => (
                      <option key={v} value={String(v)}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {TOGGLES.map(([k, l, d]) => (
                <label className="toggle" key={k}>
                  <input type="checkbox" checked={!!s[k]} onChange={(e) => set(k, e.target.checked)} disabled={busy} />
                  <span>
                    <strong>{l}</strong>
                    <small>{d}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <dl className="settings-summary">
              {Object.keys(OPTIONS).map((k) => (
                <div key={k}>
                  <dt>{LABELS[k]}</dt>
                  <dd>{OPTIONS[k].find(([v]) => v === s[k])?.[1]}</dd>
                </div>
              ))}
              <div>
                <dt>Twists</dt>
                <dd>{TOGGLES.filter(([k]) => s[k]).map(([, l]) => l).join(', ') || 'None'}</dd>
              </div>
            </dl>
          ))}
      </section>

      <div className="action-bar">
        {me.isCreator ? (
          <>
            {!enough && <p className="muted">You need at least {view.minPlayers} players to start.</p>}
            <button className="btn primary big" disabled={!enough || busy} onClick={() => run({ type: 'start' })}>
              Start the game
            </button>
          </>
        ) : (
          <p className="muted">Waiting for the organiser to start the game.</p>
        )}
        <button className="btn ghost small" onClick={leave}>
          Leave game
        </button>
      </div>
    </main>
  );
}

import { useState } from 'react';
import { useGame, useAct, usePlayers, Avatar, Slate, Chat, ReadyButton, RoleTag } from '../ui.jsx';

export function VotePhase() {
  const { view } = useGame();
  const { byId } = usePlayers();
  const [run, busy] = useAct();
  const [target, setTarget] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const v = view.vote;
  const me = view.you;
  const endgame = v.kind === 'endgame';

  const header = v.revote ? (
    <p className="lead">
      It's a tie. Vote again between {v.candidates.map((id) => byId[id]?.name).join(' and ')}.
    </p>
  ) : (
    <p className="lead">{endgame ? 'Vote to banish one more player. Their role stays secret.' : 'Who do you think is a Traitor? Write their name on your slate, then pick them below.'}</p>
  );

  if (!v.canVote) {
    return (
      <>
        {header}
        <p className="waiting">
          {me.isHost ? 'Votes are coming in.' : v.revote && v.candidates.includes(me.id) ? "You're one of the tied players, so you don't vote this time." : me.status !== 'alive' ? 'Watching the vote.' : ''} {v.votedCount} of {v.voters.length} have voted.
        </p>
        {me.isHost && v.live && (
          <ul className="live-votes">
            {Object.entries(v.live).map(([voter, t]) => (
              <li key={voter}>
                {byId[voter]?.name} → {byId[t]?.name}
              </li>
            ))}
          </ul>
        )}
      </>
    );
  }

  if (v.myVote) {
    return (
      <>
        {header}
        <div className="locked">
          <p>Your vote is locked in for</p>
          <p className="locked-name">
            <Avatar p={byId[v.myVote]} /> {byId[v.myVote]?.name}
          </p>
          <p className="muted">
            {v.votedCount} of {v.voters.length} have voted.
          </p>
        </div>
        {view.settings.mode === 'remote' && view.chat && <Chat messages={view.chat} canChat={view.canChat} />}
      </>
    );
  }

  const cands = v.candidates.filter((id) => id !== me.id && byId[id]?.status === 'alive');
  return (
    <>
      {header}
      <Slate onChange={setDrawing} />
      <div className="vote-grid">
        {cands.map((id) => {
          const p = byId[id];
          return (
            <button key={id} className={`vote-pick${target === id ? ' on' : ''}`} onClick={() => setTarget(id)} aria-pressed={target === id}>
              <Avatar p={p} size="lg" />
              <span>{p.name}</span>
            </button>
          );
        })}
      </div>
      <div className="action-bar">
        <button className="btn primary big" disabled={!target || busy} onClick={() => run({ type: 'vote', target, drawing })}>
          {target ? `Vote for ${byId[target].name}` : 'Pick someone'}
        </button>
        <p className="muted small">
          {v.votedCount} of {v.voters.length} have voted.
        </p>
      </div>
    </>
  );
}

export function RevealPhase() {
  const { view } = useGame();
  const { byId, name } = usePlayers();
  const r = view.reveal;
  const o = r.outcome;
  return (
    <>
      <div className="slates">
        {r.shown.map((s, i) => (
          <div key={s.voter} className={`slate-card${i === r.shown.length - 1 && !o ? ' latest' : ''}`}>
            <p className="slate-voter">
              {byId[s.voter]?.avatar} {name(s.voter)} voted for
            </p>
            {s.drawing ? <img src={s.drawing} alt={name(s.target)} className="slate-img" /> : null}
            <p className="slate-name">{name(s.target)}</p>
          </div>
        ))}
        {!o && r.shown.length < r.total && <div className="slate-card pending">Next vote…</div>}
      </div>
      {o && (
        <section className="outcome">
          {o.type === 'banished' && (
            <p className="big-result">
              <Avatar p={byId[o.id]} size="lg" /> {name(o.id)} is banished.
            </p>
          )}
          {o.type === 'tie' && <p className="big-result">A tie between {o.tied.map(name).join(' and ')}. Time for a revote.</p>}
          {o.type === 'tiebreak' && <p className="big-result">Still tied. The Host will decide.</p>}
          {o.type === 'random' && <p className="big-result">Still tied. Fate chooses {name(o.id)}.</p>}
          {r.tally && (
            <ul className="tally">
              {Object.entries(r.tally)
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => (
                  <li key={id}>
                    {name(id)}: {n} {n === 1 ? 'vote' : 'votes'}
                  </li>
                ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

export function TiebreakPhase() {
  const { view } = useGame();
  const { byId } = usePlayers();
  const [run, busy] = useAct();
  const t = view.tiebreak;
  if (!view.you.isHost) return <p className="lead">The vote is still tied between {t.tied.map((id) => byId[id]?.name).join(' and ')}. The Host is deciding who leaves.</p>;
  return (
    <>
      <p className="lead">The revote tied again. You decide who is banished.</p>
      <div className="vote-grid">
        {t.tied.map((id) => (
          <button key={id} className="vote-pick" onClick={() => run({ type: 'tiePick', id })} disabled={busy}>
            <Avatar p={byId[id]} size="lg" />
            <span>Banish {byId[id]?.name}</span>
          </button>
        ))}
      </div>
    </>
  );
}

export function BanishPhase() {
  const { view } = useGame();
  const { byId } = usePlayers();
  const [run, busy] = useAct();
  const b = view.banish;
  const p = byId[b.id];
  const isMe = b.id === view.you.id;
  const wr = view.mission?.wordReveal;

  if (b.stage === 'gone') {
    return (
      <div className="banish-card">
        <Avatar p={p} size="xl" />
        <p className="big-result">{isMe ? 'You have been banished.' : `${p.name} has been banished.`}</p>
        <p>In the endgame, roles stay secret until the very end.</p>
      </div>
    );
  }

  if (b.stage === 'speech') {
    return (
      <div className="banish-card">
        <Avatar p={p} size="xl" />
        {isMe ? (
          <>
            <p className="big-result">You've been banished.</p>
            <p>Say your last words to the table, then reveal who you really are.</p>
            <button className="btn primary big" onClick={() => run({ type: 'revealRole' })} disabled={busy}>
              Reveal my role
            </button>
          </>
        ) : (
          <>
            <p className="big-result">{p.name} has been banished.</p>
            <p>Let them say their piece before they reveal their role.</p>
          </>
        )}
        <ReadyButton label="Reveal their role" waiting="Waiting to reveal" />
      </div>
    );
  }

  return (
    <>
      <div className={`banish-card revealed ${b.role}`}>
        <Avatar p={p} size="xl" />
        <p className="reveal-line">{p.name} was</p>
        <p className={`role-name ${b.role}`}>{b.role === 'traitor' ? 'a Traitor' : 'Faithful'}</p>
      </div>
      {wr && (
        <section className="panel">
          <h3>The secret words</h3>
          <p>
            Every Traitor's word was from the theme: <strong>{wr.theme}</strong>.
          </p>
          {wr.spotted.length ? (
            <ul>
              {wr.spotted.map((s) => (
                <li key={s.owner}>
                  {byId[s.by]?.name} spotted {byId[s.owner]?.name}'s word: {s.word}
                </li>
              ))}
            </ul>
          ) : (
            <p>Nobody spotted a word.</p>
          )}
          {wr.vanished > 0 && <p className="vanished">{wr.vanished} points vanished from the pot.</p>}
        </section>
      )}
      <ReadyButton label="Continue" />
    </>
  );
}

export { RoleTag };

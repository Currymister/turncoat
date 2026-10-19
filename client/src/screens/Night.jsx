import { useState } from 'react';
import { useGame, useAct, usePlayers, Avatar, ReadyButton, SecretReport } from '../ui.jsx';

function Puzzle() {
  const { view } = useGame();
  const [run] = useAct();
  const { toast } = useGame();
  const [answers, setAnswers] = useState({});
  const pz = view.night.puzzle;
  if (!pz) return <p className="muted">Watching the night unfold.</p>;
  const solved = pz.items.filter((i) => i.solved).length;
  const send = async (item, answer) => {
    const r = await run({ type: 'puzzle', id: item.id, answer });
    if (r.correct === false) toast('Not quite. Try again.');
  };
  return (
    <section className="puzzles">
      <p className="muted">
        Solve what you can before dawn. Every answer adds to the pot. {solved} solved so far.
      </p>
      {pz.items.map((item) => (
        <div key={item.id} className={`puzzle${item.solved ? ' solved' : ''}`}>
          <p className="puzzle-prompt">{item.prompt}</p>
          {item.solved ? (
            <p className="solved-mark">Solved</p>
          ) : item.options ? (
            <div className="options">
              {item.options.map((o) => (
                <button key={o} className="btn small" onClick={() => send(item, o)}>
                  {o}
                </button>
              ))}
            </div>
          ) : (
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                send(item, answers[item.id] || '');
              }}
            >
              <input
                value={answers[item.id] || ''}
                onChange={(e) => setAnswers({ ...answers, [item.id]: e.target.value })}
                inputMode={item.type === 'sequence' ? 'numeric' : 'text'}
                autoCapitalize="none"
                autoComplete="off"
                aria-label="Your answer"
              />
              <button className="btn small primary">Check</button>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}

function LocalNotes() {
  const { view } = useGame();
  const key = `turncoat.notes.${view.code}`;
  const [text, setText] = useState(() => localStorage.getItem(key) || '');
  return (
    <section className="notes">
      <p className="muted">Only you can see these. They stay on this phone.</p>
      <textarea
        value={text}
        rows={8}
        onChange={(e) => {
          setText(e.target.value);
          localStorage.setItem(key, e.target.value);
        }}
        placeholder="Who voted for whom? Who went quiet?"
      />
    </section>
  );
}

function Conclave() {
  const { view } = useGame();
  const { byId, name } = usePlayers();
  const [run, busy] = useAct();
  const [text, setText] = useState('');
  const c = view.night.conclave;
  const me = view.you;
  const tally = {};
  for (const t of Object.values(c.votes)) tally[t] = (tally[t] || 0) + 1;
  const myPick = c.votes[me.id];
  const agreed = Object.keys(tally).find((k) => tally[k] >= c.need);
  const title = { murder: 'Choose tonight’s victim', recruit: 'Choose a Faithful to recruit', ultimatum: 'Ultimatum: recruit or murder' }[c.kind];
  const explain = {
    murder: 'Most votes wins. A shield can save them. If you don’t pick anyone, nobody dies and you lose 50 points from your stash.',
    recruit: 'One of you was banished, so tonight you recruit instead of murder. Agree on someone, then send the offer. They can say no.',
    ultimatum: 'You are the last Traitor. Send an offer: if they refuse, they are murdered.',
  }[c.kind];
  const sendChat = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    const r = await run({ type: 'conclaveChat', text });
    if (!r.error) setText('');
  };
  return (
    <section className="conclave">
      <h2>{title}</h2>
      <p className="muted">{explain}</p>
      {view.stash !== null && <p className="stash">Traitors' stash: {view.stash} pts</p>}
      <div className="vote-grid">
        {c.candidates.map((id) => (
          <button
            key={id}
            className={`vote-pick${myPick === id ? ' on' : ''}${c.hostPick === id ? ' host-pick' : ''}`}
            disabled={!c.member || busy || !!c.offer}
            onClick={() => run({ type: 'conclaveVote', target: id })}
            aria-pressed={myPick === id}
          >
            <Avatar p={byId[id]} size="lg" />
            <span>{name(id)}</span>
            {tally[id] > 0 && <span className="votes-badge">{tally[id]}</span>}
          </button>
        ))}
      </div>
      {me.isHost && c.kind === 'murder' && <p className="muted small">If the Traitors tie, tap a name to break the tie. Your pick: {c.hostPick ? name(c.hostPick) : 'none (random)'}</p>}
      {me.isHost &&
        c.kind === 'murder' &&
        c.candidates.map((id) => (
          <button key={id} className="btn small ghost" onClick={() => run({ type: 'nightPick', id })}>
            Break tie: {name(id)}
          </button>
        ))}
      {c.kind !== 'murder' && c.member && !c.offer && (
        <button className="btn primary" disabled={!agreed || busy} onClick={() => run({ type: 'sendOffer' })}>
          {agreed ? `Send the offer to ${name(agreed)}` : 'Agree on one player first'}
        </button>
      )}
      {c.offer && (
        <p className="offer-status">
          Offer to {name(c.offer.target)}: {c.offer.status === 'pending' ? 'waiting for an answer' : c.offer.status}
        </p>
      )}
      <div className="chat conclave-chat">
        <div className="chat-log">
          {c.chat.length === 0 && <p className="muted">Whisper to your fellow Traitors here.</p>}
          {c.chat.map((m) => (
            <div key={m.id} className={`chat-msg${!m.from ? ' system' : ''}${m.from === me.id ? ' mine' : ''}`}>
              {m.from && <span className="chat-from">{name(m.from)}</span>}
              <span className="chat-text">{m.text}</span>
            </div>
          ))}
        </div>
        {c.member && (
          <form className="chat-form" onSubmit={sendChat}>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Whisper…" maxLength={300} aria-label="Whisper to the Traitors" />
            <button className="btn primary small">Send</button>
          </form>
        )}
      </div>
    </section>
  );
}

function OfferModal() {
  const { view } = useGame();
  const [run, busy] = useAct();
  const o = view.night.offer;
  if (!o || o.status !== 'pending') return null;
  return (
    <div className="sheet-backdrop">
      <div className="sheet offer" role="alertdialog" aria-label="An offer from the Traitors">
        <h2>The Traitors want you</h2>
        {o.kind === 'ultimatum' ? <p>Join them and become a Traitor, or refuse and be murdered tonight.</p> : <p>Join them and become a Traitor. If you refuse, you stay Faithful and nobody dies tonight.</p>}
        <div className="row">
          <button className="btn danger" disabled={busy} onClick={() => run({ type: 'offerReply', accept: true })}>
            Join the Traitors
          </button>
          <button className="btn" disabled={busy} onClick={() => run({ type: 'offerReply', accept: false })}>
            Refuse
          </button>
        </div>
      </div>
    </div>
  );
}

export function NightPhase() {
  const { view } = useGame();
  const [tab, setTab] = useState('puzzle');
  const me = view.you;
  const c = view.night.conclave;
  // Everyone sees the same two tabs. For Traitors, "Notes" opens the conclave.
  if (me.isHost) {
    return (
      <>
        <p className="lead">The Traitors are choosing. Everyone else is solving puzzles.</p>
        {c && <Conclave />}
      </>
    );
  }
  return (
    <>
      <p className="lead">Night has fallen. Heads down and solve the puzzles until dawn.</p>
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'puzzle'} className={tab === 'puzzle' ? 'on' : ''} onClick={() => setTab('puzzle')}>
          Puzzles
        </button>
        <button role="tab" aria-selected={tab === 'notes'} className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>
          Notes
        </button>
      </div>
      {tab === 'puzzle' && <Puzzle />}
      {tab === 'notes' && (c ? <Conclave /> : <LocalNotes />)}
      <OfferModal />
      <ReadyButton label="I'm done for the night" waiting="Waiting for dawn" />
    </>
  );
}

export function BreakfastPhase() {
  const { view } = useGame();
  const { byId, name } = usePlayers();
  const [run] = useAct();
  const b = view.breakfast;
  const me = view.you;

  if (b.youWereMurdered) {
    return (
      <div className="murdered">
        <p className="big-result">You were murdered in the night.</p>
        <p>Don't stand up or say a word. Let the others work out who's missing.</p>
        <p className="muted">You'll stay in the game as a Ghost and see how it ends.</p>
      </div>
    );
  }

  const called = b.batches.flat();
  const iAmCalled = called.includes(me.id);
  return (
    <>
      {b.stage === 'arriving' && <p className="lead">Breakfast is served. Players are arriving in small groups.</p>}
      <div className="arrivals">
        {b.batches.map((group, i) => (
          <div key={i} className="arrival-group">
            {group.map((id) => (
              <span key={id} className={`arrival${b.here.includes(id) ? ' here' : ''}`}>
                <Avatar p={byId[id]} /> {name(id)}
              </span>
            ))}
          </div>
        ))}
      </div>
      {b.stage === 'arriving' && iAmCalled && !b.here.includes(me.id) && me.status === 'alive' && (
        <button className="btn primary" onClick={() => run({ type: 'here' })}>
          I'm here
        </button>
      )}
      {b.stage === 'reveal' && (
        <section className="outcome">
          {b.victimId ? (
            <p className="big-result">
              <Avatar p={byId[b.victimId]} size="lg" /> {name(b.victimId)} never arrived. They were murdered in the night.
            </p>
          ) : (
            <p className="big-result">Everyone made it to breakfast. Nobody was murdered.</p>
          )}
          <p>
            Last night the group solved {b.solved} puzzles, adding {b.solved * 20} points to the pot.
            {b.topSolver && b.topSolver !== me.id ? ` Top solver: ${name(b.topSolver)}.` : ''}
          </p>
        </section>
      )}
      {b.stage === 'reveal' && (
        <SecretReport
          lines={[
            b.recruitedYou && 'You are now a Traitor. Act normal.',
            b.topSolver === me.id && view.settings.shields && 'You were the top solver. You hold a secret shield tonight.',
          ]}
        />
      )}
      {b.stage === 'reveal' && <ReadyButton label="Continue" />}
      {view.omniscient && b.stage === 'arriving' && b.victimId && <p className="muted">Victim: {name(b.victimId)}</p>}
    </>
  );
}

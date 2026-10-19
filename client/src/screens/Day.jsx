import { useRef, useState } from 'react';
import { useGame, useAct, HoldCard, RoleCardContent, ReadyButton, Gallery, Chat, usePlayers, resizeImage, Countdown, PlayerRow, SecretReport } from '../ui.jsx';

export function RolesPhase() {
  const { view } = useGame();
  const me = view.you;
  if (me.isHost) {
    return (
      <>
        <p className="lead">Everyone is reading their role. The Traitors are:</p>
        <div className="player-list">
          {view.players.filter((p) => p.role === 'traitor').map((p) => (
            <PlayerRow key={p.id} p={p} />
          ))}
        </div>
      </>
    );
  }
  return (
    <>
      <p className="lead">{view.traitorTotal === 1 ? 'One Traitor is' : `${view.traitorTotal} Traitors are`} hiding among you. Keep your screen to yourself.</p>
      <HoldCard title="Your role" className="role-card">
        <RoleCardContent />
      </HoldCard>
      {view.warmup && <p className="muted">It's a small group, so today is a warm-up: one mission and a chat, with no banishment or murder.</p>}
      <ReadyButton label="I've seen my role" />
    </>
  );
}

function SecretOrders({ children }) {
  return (
    <HoldCard title="Secret orders" className="orders">
      {children}
    </HoldCard>
  );
}

function PhotoSubmit({ canHide, hideLabel }) {
  const { view } = useGame();
  const { toast } = useGame();
  const [run, busy] = useAct();
  const [preview, setPreview] = useState(null);
  const [hid, setHid] = useState(false);
  const input = useRef(null);
  const m = view.mission;
  const pickFile = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    try {
      setPreview(await resizeImage(f));
    } catch (err) {
      toast(err.message);
    }
  };
  const submit = async () => {
    const r = await run({ type: 'submitPhoto', data: preview, hid });
    if (!r.error) setPreview(null);
  };
  return (
    <section className="panel">
      {m.mySubmission && !preview && (
        <div className="submitted">
          <img src={m.mySubmission.url} alt="Your submitted photo" />
          <p>Photo sent. You can replace it until time runs out.</p>
        </div>
      )}
      {preview && <img className="preview" src={preview} alt="Your photo, not yet sent" />}
      <input ref={input} type="file" accept="image/*" capture="environment" onChange={pickFile} hidden />
      {preview && canHide && (
        <label className="check">
          <input type="checkbox" checked={hid} onChange={(e) => setHid(e.target.checked)} /> {hideLabel}
        </label>
      )}
      <div className="row">
        <button className={`btn${preview ? ' ghost' : ' primary'}`} onClick={() => input.current.click()}>
          {preview || m.mySubmission ? 'Take another' : 'Take photo'}
        </button>
        {preview && (
          <button className="btn primary" onClick={submit} disabled={busy}>
            {busy ? 'Sending…' : 'Send photo'}
          </button>
        )}
      </div>
      <p className="muted small">
        {m.submittedCount} of {m.aliveCount} photos in
      </p>
    </section>
  );
}

function VaultMission() {
  const { view } = useGame();
  const { name } = usePlayers();
  const [run, busy] = useAct();
  const [guess, setGuess] = useState('');
  const m = view.mission;
  const left = m.max - m.attempts.length;
  const alive = view.you.status === 'alive' && !view.you.isHost;
  const submit = async (e) => {
    e.preventDefault();
    const r = await run({ type: 'vaultGuess', guess });
    if (!r.error) setGuess('');
  };
  return (
    <section className="panel vault">
      {m.opened ? (
        <p className="big-result good">The vault is open.</p>
      ) : left <= 0 ? (
        <p className="big-result bad">The vault stays locked.</p>
      ) : (
        alive && (
          <form onSubmit={submit} className="vault-form">
            <label className="field">
              <span>Enter the code ({left} {left === 1 ? 'attempt' : 'attempts'} left)</span>
              <input value={guess} onChange={(e) => setGuess(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" pattern="[0-9]{4}" placeholder="0000" className="code-input" required />
            </label>
            <button className="btn primary" disabled={busy || guess.length !== 4}>
              Try the code
            </button>
          </form>
        )
      )}
      {m.attempts.length > 0 && (
        <ul className="attempts">
          {m.attempts.map((a, i) => (
            <li key={i}>
              <span className="mono-digits">{a.guess}</span> by {name(a.by)} {a.correct ? 'opened it' : 'was wrong'}
            </li>
          ))}
        </ul>
      )}
      {view.you.isHost && <p className="muted">The code is {m.code}.</p>}
    </section>
  );
}

export function MissionPhase() {
  const { view } = useGame();
  const m = view.mission;
  const me = view.you;
  const traitor = me.role === 'traitor';
  const alive = me.status === 'alive' && !me.isHost;

  let orders = <p>No secret orders today. Just do the task.</p>;
  if (m.type === 'photo') {
    if (traitor) orders = <p>Sneak <strong>{m.secretObject}</strong> into the background of your photo without anyone noticing.</p>;
    else if (m.decoyObject) orders = <p>You're a decoy. Sneak <strong>{m.decoyObject}</strong> into your photo to muddy the waters.</p>;
  } else if (m.type === 'vault' && m.myClue) {
    orders = traitor ? (
      <p>
        Digit {m.myClue.pos} is really <strong>{m.myClue.digit}</strong>. Tell the group it's <strong>{m.myClue.fake}</strong> and keep the vault shut.
      </p>
    ) : (
      <p>
        Digit {m.myClue.pos} of the code is <strong>{m.myClue.digit}</strong>. Share it with the group.
      </p>
    );
  } else if (m.type === 'scavenger') {
    if (traitor && m.sabotageTarget) {
      orders =
        m.sabotageTarget.id === me.id ? (
          <p>Fail to find your item, and make your excuse convincing.</p>
        ) : (
          <p>
            Make sure <strong>{m.sabotageTarget.item}</strong> goes missing before it's photographed.
          </p>
        );
    }
  } else if (m.type === 'secretword') {
    orders = (
      <>
        <p>
          Your secret word is <strong className="secret-word">{m.myWord}</strong>
        </p>
        <p>Slip it into the round table naturally. If someone spots it and names it, they score points.</p>
        {traitor && m.theme && <p>Every Traitor's word is from the theme: {m.theme}. Don't let the Faithful work it out.</p>}
      </>
    );
  }

  return (
    <>
      <section className="mission-head">
        <h2>{m.info.name}</h2>
        <p>{m.info.blurb}</p>
      </section>

      {m.type === 'photo' && <p className="task">{m.prompt}</p>}
      {m.type === 'scavenger' && m.myItem && (
        <p className="task">
          Your item: <strong>{m.myItem}</strong>
          {view.settings.mode === 'inperson' ? '. Put it on the table and photograph it there.' : '. Find it at home and photograph it.'}
        </p>
      )}
      {m.type === 'vault' && <p className="task">Each of you holds one clue to a 4-digit code. Talk it through, then anyone can enter the code.</p>}

      {!me.isHost && (alive || m.type === 'secretword') && <SecretOrders>{orders}</SecretOrders>}
      {me.isHost && <HostMissionInfo />}

      {alive && m.type === 'photo' && <PhotoSubmit canHide={traitor || !!m.decoyObject} hideLabel={`I got ${traitor ? m.secretObject : m.decoyObject} into the photo`} />}
      {alive && m.type === 'scavenger' && <PhotoSubmit canHide={false} />}
      {m.type === 'vault' && <VaultMission />}
      {m.type === 'secretword' && <ReadyButton label="I've memorised my word" />}
      {me.isHost && m.gallery && <Gallery items={m.gallery} host />}
    </>
  );
}

function HostMissionInfo() {
  const { view } = useGame();
  const { name } = usePlayers();
  const m = view.mission;
  return (
    <section className="panel host-info">
      <h3>Host view</h3>
      {m.type === 'photo' && <p>Secret object: {m.secretObject}</p>}
      {m.type === 'scavenger' && m.items && (
        <ul>
          {Object.entries(m.items).map(([id, item]) => (
            <li key={id}>
              {name(id)}: {item}
            </li>
          ))}
        </ul>
      )}
      {m.type === 'vault' && m.clues && (
        <ul>
          {Object.entries(m.clues).map(([id, c]) => (
            <li key={id}>
              {name(id)}: digit {c.pos} is {c.digit}
              {c.fake !== null ? ` (told to say ${c.fake})` : ''}
            </li>
          ))}
        </ul>
      )}
      {m.type === 'secretword' && m.words && (
        <ul>
          {Object.entries(m.words).map(([id, w]) => (
            <li key={id}>
              {name(id)}: {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultSummary() {
  const { view } = useGame();
  const { name } = usePlayers();
  const m = view.mission;
  const r = m.result;
  if (!r) return null;
  return (
    <section className="panel result">
      {r.type === 'photo' && (
        <p>
          {r.done} of {r.total} completed the task. The pot gains {r.gained} points.
        </p>
      )}
      {r.type === 'vault' && (
        <>
          <p className={`big-result ${r.opened ? 'good' : 'bad'}`}>{r.opened ? 'The vault opened.' : 'The vault stayed locked.'}</p>
          <p>
            The code was <span className="mono-digits">{r.code}</span>. {r.gained ? `The pot gains ${r.gained} points.` : ''}
          </p>
          {r.falseDigits?.length > 0 && <p>A false clue was handed out for digit {r.falseDigits.join(' and ')}.</p>}
        </>
      )}
      {r.type === 'scavenger' && (
        <>
          <p>
            {r.found} of {r.total} items found. The pot gains {r.gained} points.
          </p>
          {r.missing?.length > 0 && <p>Missing: {r.missing.map((x) => `${x.item} (${name(x.id)})`).join(', ')}.</p>}
        </>
      )}
      {r.vanished > 0 && <p className="vanished">{r.vanished} points vanished from the pot.</p>}
      {view.you.isHost && 'sabotage' in r && <p className="secret-note">{r.sabotage ? 'The Traitors’ sabotage worked.' : 'The Traitors’ sabotage failed.'}</p>}
    </section>
  );
}

export function ResultsPhase() {
  const { view } = useGame();
  const m = view.mission;
  const r = m.result || {};
  return (
    <>
      <ResultSummary />
      <SecretReport
        lines={[
          'sabotage' in r && (r.sabotage ? 'Your sabotage worked. Points moved to the Traitors\u2019 stash.' : 'Your sabotage failed this time.'),
          r.shieldWinner === view.you.id && 'Your photo won. You hold a secret shield tonight.',
        ]}
      />
      {m.gallery && (
        <section>
          <h2>Gallery</h2>
          {m.type === 'photo' && <p className="muted">Heart your favourite. The best photo wins a secret shield.</p>}
          <Gallery items={m.gallery} onHeart host={view.you.isHost} />
        </section>
      )}
      <ReadyButton label="On to the round table" />
    </>
  );
}

function SpotWord() {
  const { view } = useGame();
  const [run, busy] = useAct();
  const { toast } = useGame();
  const m = view.mission;
  const [owner, setOwner] = useState('');
  const [word, setWord] = useState('');
  if (view.you.status !== 'alive' || view.you.isHost) return null;
  const others = view.players.filter((p) => p.status === 'alive' && !p.isHost && p.id !== view.you.id && !m.mySpots.some((s) => s.owner === p.id));
  const submit = async (e) => {
    e.preventDefault();
    const r = await run({ type: 'spot', owner, word });
    if (r.error) return;
    if (r.correct) {
      toast('Spotted. Points added to the pot.');
      setWord('');
      setOwner('');
    } else toast(`Not their word. ${r.triesLeft} ${r.triesLeft === 1 ? 'guess' : 'guesses'} left.`);
  };
  return (
    <section className="panel">
      <h3>Spot a secret word</h3>
      <form className="spot-form" onSubmit={submit}>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} required aria-label="Who said it">
          <option value="">Who said it?</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              {p.avatar} {p.name}
            </option>
          ))}
        </select>
        <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="The word" required aria-label="The word" />
        <button className="btn primary small" disabled={busy || m.triesLeft <= 0}>
          Name it
        </button>
      </form>
      <p className="muted small">
        {m.triesLeft} wrong {m.triesLeft === 1 ? 'guess' : 'guesses'} left. {m.mySpots.length > 0 && `You've spotted: ${m.mySpots.map((s) => s.word).join(', ')}.`}
      </p>
    </section>
  );
}

export function RoundTablePhase() {
  const { view } = useGame();
  const [showGallery, setShowGallery] = useState(false);
  const m = view.mission;
  const remote = view.settings.mode === 'remote';
  return (
    <>
      <div className="table-timer">
        <Countdown big />
      </div>
      {view.day === 0 && <p className="lead">Warm-up round table. Get to know each other's tells. Nobody is banished today.</p>}
      {view.day > 0 && <p className="lead">{remote ? 'Make your case in the chat. When time is up, everyone votes.' : 'Phones down. Talk it out. When time is up, everyone votes.'}</p>}
      {m?.category && (
        <p className="hint">
          The Traitors' secret object was <strong>{m.category}</strong>. Check the photos.
        </p>
      )}
      {m?.type === 'secretword' && (
        <>
          <SecretOrders>
            <p>
              Your word: <strong className="secret-word">{m.myWord}</strong>
            </p>
          </SecretOrders>
          <SpotWord />
        </>
      )}
      {m?.gallery && (
        <button className="btn" onClick={() => setShowGallery((x) => !x)}>
          {showGallery ? 'Hide photos' : 'Look at the photos again'}
        </button>
      )}
      {showGallery && <Gallery items={m.gallery} onHeart />}
      {remote && view.chat && <Chat messages={view.chat} canChat={view.canChat} />}
      <ReadyButton label={view.day === 0 ? 'Done talking' : 'Ready to vote'} />
    </>
  );
}

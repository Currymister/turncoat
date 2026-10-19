import { useGame, useAct, usePlayers, Avatar, ReadyButton, Chat, Countdown, RoleTag } from '../ui.jsx';

export function EndgameTalkPhase() {
  const { view } = useGame();
  const alive = view.players.filter((p) => p.status === 'alive' && !p.isHost);
  return (
    <>
      <div className="table-timer">
        <Countdown big />
      </div>
      <p className="lead">
        {alive.length} players remain. Next, you each choose to end the game or banish again. The game only ends if everyone chooses to end it.
      </p>
      <div className="finalists">
        {alive.map((p) => (
          <span key={p.id} className="finalist">
            <Avatar p={p} size="lg" />
            {p.name}
          </span>
        ))}
      </div>
      <p className="muted">If a Traitor is still here when the game ends, the Traitors take everything.</p>
      {view.settings.mode === 'remote' && view.chat && <Chat messages={view.chat} canChat={view.canChat} />}
      <ReadyButton label="Ready to decide" />
    </>
  );
}

export function EndgameVotePhase() {
  const { view } = useGame();
  const [run, busy] = useAct();
  const ev = view.endVote;
  const me = view.you;
  const canChoose = me.status === 'alive' && !me.isHost && view.stage === 'choosing';
  if (ev.results) {
    const allEnd = ev.results.banish === 0;
    return (
      <section className="outcome">
        <p className="big-result">{allEnd ? 'Everyone chose to end the game.' : `${ev.results.banish} ${ev.results.banish === 1 ? 'player wants' : 'players want'} to banish again.`}</p>
        <p>{allEnd ? 'Time for the final reveal.' : 'One more banishment vote. Their role stays secret.'}</p>
      </section>
    );
  }
  return (
    <>
      <p className="lead">Do you trust everyone left at this table?</p>
      {canChoose ? (
        <div className="end-choice">
          <button className={`btn big${ev.myChoice === 'end' ? ' primary' : ''}`} disabled={busy} onClick={() => run({ type: 'endChoice', choice: 'end' })} aria-pressed={ev.myChoice === 'end'}>
            End the game
          </button>
          <button className={`btn big${ev.myChoice === 'banish' ? ' danger' : ''}`} disabled={busy} onClick={() => run({ type: 'endChoice', choice: 'banish' })} aria-pressed={ev.myChoice === 'banish'}>
            Banish again
          </button>
        </div>
      ) : null}
      <p className="muted">
        {ev.count} of {ev.needed} have chosen. {ev.myChoice ? 'You can change your mind until everyone has chosen.' : ''}
      </p>
    </>
  );
}

export function FinalRevealPhase() {
  const { view } = useGame();
  const { byId } = usePlayers();
  const f = view.finalReveal;
  return (
    <>
      <p className="lead">One by one, the finalists reveal who they really are.</p>
      <div className="final-cards">
        {f.order.map((id, i) => {
          const p = byId[id];
          const shown = i < f.index;
          return (
            <div key={id} className={`final-card${shown ? ' shown ' + p.role : ''}`}>
              <Avatar p={p} size="xl" />
              <p className="final-name">{p.name}</p>
              <p className={`role-name ${shown ? p.role : ''}`}>{shown ? (p.role === 'traitor' ? 'Traitor' : 'Faithful') : '?'}</p>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function GameOverPhase() {
  const { view, leave } = useGame();
  const { byId } = usePlayers();
  const r = view.result;
  const traitors = r.side === 'traitors';
  const iWon = r.winners.includes(view.you.id);
  return (
    <>
      <section className={`victory ${r.side}`}>
        <p className="victory-title">{traitors ? 'The Traitors win' : 'The Faithful win'}</p>
        <p>
          {r.winners.length ? `${r.winners.map((id) => byId[id]?.name).join(', ')} ${r.winners.length === 1 ? 'takes' : 'share'} ${r.total} points` : 'Nobody survived to collect the pot'}
          {traitors && r.stash > 0 ? `, including the Traitors' stash of ${r.stash}` : ''}.
        </p>
        {iWon && <p className="you-won">You won {r.each} points.</p>}
      </section>
      <section className="panel">
        <h2>Final placings</h2>
        <ol className="placings">
          {r.placings.map((x) => {
            const p = byId[x.id];
            return (
              <li key={x.id}>
                <span className="place">{x.place}</span>
                <Avatar p={p} /> <span className="player-name">{p?.name}</span> {p?.role && <RoleTag role={p.role} />}
                {p?.recruited && <span className="muted"> recruited</span>}
                {x.points > 0 && <span className="pts">{x.points} pts</span>}
              </li>
            );
          })}
        </ol>
      </section>
      <div className="action-bar">
        <button className="btn primary big" onClick={leave}>
          Back to the start
        </button>
      </div>
    </>
  );
}

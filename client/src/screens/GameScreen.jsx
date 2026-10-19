import { useState } from 'react';
import { useGame, Countdown, Sheet, HoldCard, RoleCardContent, usePlayers, PlayerRow, useAct } from '../ui.jsx';
import { RolesPhase, MissionPhase, ResultsPhase, RoundTablePhase } from './Day.jsx';
import { VotePhase, RevealPhase, TiebreakPhase, BanishPhase } from './Vote.jsx';
import { NightPhase, BreakfastPhase } from './Night.jsx';
import { EndgameTalkPhase, EndgameVotePhase, FinalRevealPhase, GameOverPhase } from './End.jsx';
import HostPanel from './HostPanel.jsx';

const TITLES = {
  roles: 'Your role',
  mission: 'Mission',
  results: 'Mission results',
  roundtable: 'Round table',
  vote: 'The vote',
  voteReveal: 'The votes',
  tiebreak: 'A tie',
  banish: 'Banishment',
  night: 'Night falls',
  breakfast: 'Breakfast',
  endgameTalk: 'The endgame',
  endgameVote: 'End or banish?',
  finalReveal: 'The final reveal',
  gameOver: 'Game over',
};

function dayLabel(v) {
  if (v.phase === 'gameOver') return 'Final';
  if (v.endgame) return 'Endgame';
  if (v.day === 0) return 'Warm-up day';
  if (v.phase === 'night') return `Night ${v.day}`;
  return `Day ${v.day}`;
}

export default function GameScreen() {
  const { view } = useGame();
  const [sheet, setSheet] = useState(null);
  const me = view.you;
  const Phase = {
    roles: RolesPhase,
    mission: MissionPhase,
    results: ResultsPhase,
    roundtable: RoundTablePhase,
    vote: VotePhase,
    voteReveal: RevealPhase,
    tiebreak: TiebreakPhase,
    banish: BanishPhase,
    night: NightPhase,
    breakfast: BreakfastPhase,
    endgameTalk: EndgameTalkPhase,
    endgameVote: EndgameVotePhase,
    finalReveal: FinalRevealPhase,
    gameOver: GameOverPhase,
  }[view.phase];

  return (
    <div className={`game${me.isHost ? ' is-host' : ''}`}>
      <header className="topbar">
        <div className="topbar-main">
          <span className="day">{dayLabel(view)}</span>
          <h1>{TITLES[view.phase]}</h1>
        </div>
        <div className="topbar-side">
          <Countdown />
          <span className="pot" title="Prize pot">
            {view.pot} pts
          </span>
        </div>
        <nav className="topbar-nav">
          {!me.isHost && (
            <button className="chip" onClick={() => setSheet('role')}>
              My role
            </button>
          )}
          <button className="chip" onClick={() => setSheet('players')}>
            Players
          </button>
          <button className="chip" onClick={() => setSheet('history')}>
            History
          </button>
          {!me.isHost && (
            <button className="chip" onClick={() => setSheet('notes')}>
              My notes
            </button>
          )}
        </nav>
      </header>

      {view.ghost && view.phase !== 'gameOver' && (
        <p className="ghost-banner">
          You're out of the game. {view.omniscient ? 'You can now see every role. Keep it to yourself.' : 'Stay quiet and enjoy the show. Everything is revealed at the end.'}
        </p>
      )}

      <main className="screen">
        <Phase />
      </main>

      {me.isHost && <HostPanel />}

      {sheet === 'role' && (
        <Sheet title="My role" onClose={() => setSheet(null)}>
          <HoldCard title="Your role">
            <RoleCardContent />
          </HoldCard>
        </Sheet>
      )}
      {sheet === 'players' && (
        <Sheet title="Players" onClose={() => setSheet(null)}>
          <PlayersList />
        </Sheet>
      )}
      {sheet === 'history' && (
        <Sheet title="History" onClose={() => setSheet(null)}>
          <History />
        </Sheet>
      )}
      {sheet === 'notes' && (
        <Sheet title="My notes" onClose={() => setSheet(null)}>
          <Notes />
        </Sheet>
      )}
    </div>
  );
}

function PlayersList() {
  const { view } = useGame();
  const [run] = useAct();
  const me = view.you;
  const canKick = me.isHost || (me.isCreator && view.settings.runBy === 'auto');
  const statusText = (p) => (p.left ? 'left' : p.status === 'murdered' ? 'murdered' : p.status === 'banished' ? 'banished' : null);
  return (
    <div className="player-list">
      {view.players
        .filter((p) => !p.isHost)
        .map((p) => (
          <PlayerRow key={p.id} p={p}>
            {statusText(p) && <span className="muted">{statusText(p)}</span>}
            {!p.connected && p.status === 'alive' && <span className="muted">offline</span>}
            {canKick && p.status === 'alive' && p.id !== me.id && !p.connected && view.phase !== 'gameOver' && (
              <button className="btn small ghost" onClick={() => confirm(`Remove ${p.name} from the game? Their role will be revealed.`) && run({ type: 'kick', id: p.id })}>
                Remove
              </button>
            )}
          </PlayerRow>
        ))}
    </div>
  );
}

function History() {
  const { view } = useGame();
  const { byId, name } = usePlayers();
  return (
    <div className="history">
      <h3>What happened</h3>
      <ol className="log">
        {[...view.log].reverse().map((l, i) => (
          <li key={i}>
            <span className="muted">{l.day === 0 ? 'Warm-up' : `Day ${l.day}`}</span> {l.text}
          </li>
        ))}
      </ol>
      <h3>Every vote</h3>
      {view.voteHistory.length === 0 && <p className="muted">No votes yet.</p>}
      {[...view.voteHistory].reverse().map((v, i) => (
        <div key={i} className="vote-record">
          <p className="muted">
            Day {v.day} {v.kind === 'endgame' ? 'endgame vote' : 'round table'}
            {v.revote ? ' (revote)' : ''}
          </p>
          <ul>
            {v.votes.map((x) => (
              <li key={x.voter}>
                {byId[x.voter]?.avatar} {name(x.voter)} voted for {x.target ? `${byId[x.target]?.avatar} ${name(x.target)}` : 'no one'}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Notes() {
  const { view } = useGame();
  const key = `turncoat.notes.${view.code}`;
  const [text, setText] = useState(() => localStorage.getItem(key) || '');
  return (
    <div className="notes">
      <p className="muted">Only you can see these. They stay on this phone.</p>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          localStorage.setItem(key, e.target.value);
        }}
        rows={10}
        placeholder="Who's acting strangely? Who voted for whom?"
      />
    </div>
  );
}

export { TITLES };

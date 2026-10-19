import { useGame, useAct } from '../ui.jsx';

const NEXT_LABEL = {
  roles: 'Start the mission',
  mission: 'End the mission',
  results: 'Open the round table',
  roundtable: 'Start the vote',
  vote: 'Close the vote',
  voteReveal: 'Skip the reveal',
  banish: 'Continue',
  night: 'End the night',
  breakfast: 'Continue',
  endgameTalk: 'Start the end-or-banish vote',
  endgameVote: 'Close the vote',
  finalReveal: 'Reveal everyone',
};

export default function HostPanel() {
  const { view } = useGame();
  const [run, busy] = useAct();
  if (view.phase === 'gameOver') return null;
  let label = NEXT_LABEL[view.phase];
  if (view.phase === 'banish' && view.stage === 'speech') label = 'Reveal their role';
  if (view.phase === 'breakfast' && view.stage === 'arriving') label = 'Reveal the victim';
  if (view.phase === 'roundtable' && view.day === 0) label = 'End the warm-up day';
  return (
    <aside className="host-panel" aria-label="Host controls">
      <div className="host-row">
        {label && view.phase !== 'tiebreak' && (
          <button className="btn primary" disabled={busy} onClick={() => run({ type: 'next' })}>
            {label}
          </button>
        )}
        <button className="btn small" onClick={() => run({ type: 'pause', value: !view.paused })}>
          {view.paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn small" onClick={() => run({ type: 'extend' })}>
          +1 min
        </button>
      </div>
      <label className="host-row field inline">
        <span>Next mission</span>
        <select value={view.nextMission || ''} onChange={(e) => run({ type: 'nextMission', missionType: e.target.value || null })}>
          <option value="">Random</option>
          {Object.entries(view.missionTypes).map(([k, m]) => (
            <option key={k} value={k}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {view.stash !== null && <p className="muted small">Traitors' stash: {view.stash} pts</p>}
    </aside>
  );
}

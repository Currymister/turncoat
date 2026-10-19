// The game engine. The server is the only place that knows every role;
// viewFor() decides what each phone is allowed to see.

import crypto from 'node:crypto';
import * as C from './content.js';

const { pick, shuffle } = C;
const SCALE = Number(process.env.TIMER_SCALE || 1);
const sec = (s) => Math.max(50, Math.round(s * 1000 * SCALE));
const ms = (m) => Math.max(20, Math.round(m * SCALE));

// Phase lengths in seconds. Slow-burn has no clock: phases move on when everyone is ready.
export const PACING = {
  quick: { roles: 45, mission: 480, missionShort: 75, vault: 360, results: 120, roundtable: 300, vote: 75, banish: 30, night: 180, breakfast: 25, endgameTalk: 360, endgameVote: 60 },
  standard: { roles: 60, mission: 720, missionShort: 90, vault: 480, results: 150, roundtable: 480, vote: 90, banish: 30, night: 300, breakfast: 30, endgameTalk: 600, endgameVote: 75 },
  slow: null,
};

// Internal step timings (milliseconds) for reveals and breakfast arrivals.
const STEP = { revealStart: 1500, reveal: 2600, outcome: 4500, banishAfter: 9000, banishGone: 6000, breakfastBatch: 3200, endgameResults: 5000, finalStep: 4000 };

export const STALL_MS = 48 * 3600 * 1000;
const MAX_PLAYERS = 22;

export function traitorCount(n) {
  if (n <= 6) return 1;
  if (n <= 10) return 2;
  if (n <= 15) return 3;
  return 4;
}

const newId = (n = 6) => crypto.randomBytes(n).toString('hex');
const roleName = (r) => (r === 'traitor' ? 'Traitor' : 'Faithful');

export class Game {
  constructor(code, hooks = {}) {
    this.code = code;
    this.hooks = hooks; // { savePhoto(buf) -> id, deletePhoto(id) }
    this.players = new Map();
    this.order = [];
    this.creatorId = null;
    this.settings = {
      mode: 'inperson', // inperson | remote
      runBy: 'auto', // auto | host
      pacing: 'standard', // quick | standard | slow
      traitors: 'auto', // auto | 1..4
      pack: 'pub', // pub | home | outdoors
      shields: true,
      recruitment: true,
      decoys: false,
      ghostsFollow: true,
      endgameSize: 'auto', // auto | 3 | 4 | 5
    };
    this.phase = 'lobby';
    this.stage = null;
    this.day = 0;
    this.warmup = false;
    this.endgame = false;
    this.phaseStartedAt = Date.now();
    this.phaseEndsAt = null;
    this.paused = false;
    this.pausedRemaining = null;
    this.stepAt = null;
    this.pot = 0;
    this.stash = 0;
    this.log = [];
    this.voteHistory = [];
    this.elimOrder = [];
    this.manualTraitors = [];
    this.nextMissionType = null;
    this.usedTypes = [];
    this.mission = null;
    this.chat = [];
    this.vote = null;
    this.reveal = null;
    this.tiebreak = null;
    this.banish = null;
    this.night = null;
    this.breakfast = null;
    this.endVote = null;
    this.finalRev = null;
    this.result = null;
    this.pendingRecruit = false;
    this.wordReveal = null;
    this.moveOn = new Set();
    this.photoIds = new Set();
    this.dirty = true;
    this.lastActivity = Date.now();
    this.initialCount = 0;
    this.endgameSize = 4;
  }

  // ---------- helpers ----------
  touch() {
    this.dirty = true;
    this.lastActivity = Date.now();
  }
  isHostMode() {
    return this.settings.runBy === 'host';
  }
  playing() {
    return this.order.map((id) => this.players.get(id)).filter((p) => p && !p.isHost);
  }
  alive() {
    return this.playing().filter((p) => p.status === 'alive');
  }
  aliveTraitors() {
    return this.alive().filter((p) => p.role === 'traitor');
  }
  name(id) {
    return this.players.get(id)?.name ?? 'Someone';
  }
  addLog(text) {
    this.log.push({ day: this.day, text });
  }
  minPlayers() {
    return this.settings.mode === 'inperson' ? 4 : 5;
  }
  siphon(x) {
    this.stash += x;
    const taken = Math.min(this.pot, x);
    this.pot -= taken;
    return taken;
  }
  eliminate(p, how) {
    p.status = how;
    p.eliminatedDay = this.day;
    p.ready = false;
    this.elimOrder.push(p.id);
  }

  // ---------- players ----------
  addPlayer(name, avatar) {
    name = String(name || '').trim().slice(0, 20);
    if (!name) return { error: 'Please enter a name.' };
    if (this.phase !== 'lobby') return { error: 'This game has already started.' };
    if (this.playing().length >= MAX_PLAYERS + (this.isHostMode() ? 1 : 0)) return { error: 'This game is full.' };
    for (const p of this.players.values()) if (p.name.toLowerCase() === name.toLowerCase()) return { error: 'Someone already has that name.' };
    const p = {
      id: newId(4),
      token: newId(16),
      name,
      avatar: String(avatar || '🎭').slice(0, 8),
      isHost: false,
      role: null,
      status: 'alive',
      connected: true,
      ready: false,
      roleRevealed: false,
      shieldFor: null,
      eliminatedDay: null,
      lastChatAt: 0,
      lastSeen: Date.now(),
    };
    this.players.set(p.id, p);
    this.order.push(p.id);
    if (!this.creatorId) this.creatorId = p.id;
    this.touch();
    return { player: p };
  }

  byToken(token) {
    for (const p of this.players.values()) if (p.token === token) return p;
    return null;
  }

  // ---------- phases ----------
  setPhase(phase, dur = null, stage = null) {
    this.phase = phase;
    this.stage = stage;
    this.phaseStartedAt = Date.now();
    const pace = PACING[this.settings.pacing];
    const seconds = typeof dur === 'number' ? dur : pace && dur ? pace[dur] : null;
    this.phaseEndsAt = seconds ? Date.now() + sec(seconds) : null;
    this.paused = false;
    this.pausedRemaining = null;
    this.stepAt = null;
    for (const p of this.players.values()) p.ready = false;
    this.moveOn = new Set();
    this.touch();
  }

  start() {
    const players = this.playing();
    const n = players.length;
    if (n < this.minPlayers()) return { error: `You need at least ${this.minPlayers()} players for a ${this.settings.mode === 'inperson' ? 'in-person' : 'remote'} game.` };
    if (n > MAX_PLAYERS) return { error: `The most players in one game is ${MAX_PLAYERS}.` };
    let tc = this.settings.traitors === 'auto' ? traitorCount(n) : Number(this.settings.traitors);
    tc = Math.max(1, Math.min(tc, Math.floor((n - 1) / 2)));
    const manual = this.isHostMode() ? this.manualTraitors.filter((id) => players.some((p) => p.id === id)) : [];
    const traitorIds = new Set(manual.length ? manual : shuffle(players.map((p) => p.id)).slice(0, tc));
    for (const p of players) {
      p.role = traitorIds.has(p.id) ? 'traitor' : 'faithful';
      p.status = 'alive';
      p.roleRevealed = false;
      p.shieldFor = null;
    }
    this.initialCount = n;
    this.traitorTotal = traitorIds.size;
    this.endgameSize = this.settings.endgameSize === 'auto' ? (n <= 6 ? 3 : 4) : Number(this.settings.endgameSize);
    this.endgameSize = Math.max(2, Math.min(this.endgameSize, n - 1));
    this.warmup = n <= 6;
    this.day = this.warmup ? 0 : 1;
    this.addLog(`The game begins with ${n} players. ${traitorIds.size === 1 ? 'One Traitor is' : `${traitorIds.size} Traitors are`} hiding among you.`);
    this.setPhase('roles', 'roles');
    return { ok: true };
  }

  chooseMissionType() {
    const last = this.usedTypes[this.usedTypes.length - 1];
    let pool = C.MISSION_TYPES.filter((t) => !this.usedTypes.includes(t));
    if (!pool.length) {
      this.usedTypes = [];
      pool = C.MISSION_TYPES.filter((t) => t !== last);
    }
    return pick(pool);
  }

  startMission() {
    let type = this.day === 0 ? 'photo' : this.nextMissionType || this.chooseMissionType();
    this.nextMissionType = null;
    this.usedTypes.push(type);
    this.wordReveal = null;
    this.chat = [];
    const alive = this.alive();
    const traitors = alive.filter((p) => p.role === 'traitor');
    const faithful = alive.filter((p) => p.role !== 'traitor');
    const pack = this.settings.pack;
    let m;
    if (type === 'photo') {
      const secret = pick(C.SECRET_OBJECTS[pack]);
      const decoys = {};
      if (this.settings.decoys && faithful.length >= 3) {
        const others = C.SECRET_OBJECTS[pack].filter((o) => o.object !== secret.object);
        for (const f of shuffle(faithful).slice(0, faithful.length >= 6 ? 2 : 1)) decoys[f.id] = pick(others).object;
      }
      m = { type, prompt: pick(C.PHOTO_PROMPTS[pack]), secret, decoys, subs: {} };
    } else if (type === 'vault') {
      const code = Array.from({ length: 4 }, () => crypto.randomInt(10)).join('');
      const clues = {};
      shuffle(alive).forEach((p, i) => {
        const pos = i % 4;
        const digit = Number(code[pos]);
        let fake = null;
        if (p.role === 'traitor') {
          do fake = crypto.randomInt(10);
          while (fake === digit);
        }
        clues[p.id] = { pos, digit, fake };
      });
      m = { type, code, clues, attempts: [], opened: false, max: 3 };
    } else if (type === 'scavenger') {
      const items = shuffle(C.SCAVENGER_ITEMS[pack]);
      const assign = {};
      alive.forEach((p, i) => (assign[p.id] = items[i % items.length]));
      const targets = {};
      if (this.settings.mode === 'inperson' && faithful.length) {
        const victim = pick(faithful);
        for (const t of traitors) targets[t.id] = victim.id;
      } else {
        for (const t of traitors) targets[t.id] = t.id;
      }
      m = { type, items: assign, targets, subs: {} };
    } else {
      const theme = pick(Object.keys(C.THEMES));
      const tw = shuffle(C.THEMES[theme]);
      const fw = shuffle(C.NEUTRAL_WORDS);
      const words = {};
      let ti = 0;
      let fi = 0;
      for (const p of alive) words[p.id] = p.role === 'traitor' ? tw[ti++ % tw.length] : fw[fi++ % fw.length];
      m = { type, theme, words, spotted: [], tries: {} };
    }
    m.day = this.day;
    this.mission = m;
    this.setPhase('mission', type === 'secretword' ? 'missionShort' : type === 'vault' ? 'vault' : 'mission');
  }

  missionComplete() {
    const m = this.mission;
    if (!m) return false;
    if (m.type === 'photo' || m.type === 'scavenger') return this.alive().every((p) => m.subs[p.id]);
    if (m.type === 'vault') return m.opened || m.attempts.length >= m.max;
    return this.allReady();
  }

  endMission() {
    const m = this.mission;
    const alive = this.alive();
    const traitors = alive.filter((p) => p.role === 'traitor');
    const host = this.isHostMode();
    const res = { type: m.type, potBefore: this.pot };
    if (m.type === 'photo') {
      const done = alive.filter((p) => m.subs[p.id] && m.subs[p.id].ok !== false).length;
      this.pot += 100 * done;
      const hid = (s) => (host && s.objectOk !== null ? s.objectOk : s.hid);
      const sab = traitors.length > 0 && traitors.every((t) => m.subs[t.id] && hid(m.subs[t.id]));
      res.done = done;
      res.total = alive.length;
      res.sabotage = sab;
      res.gained = 100 * done;
      if (sab) res.vanished = this.siphon(150);
    } else if (m.type === 'vault') {
      res.opened = m.opened;
      res.code = m.code;
      res.attempts = m.attempts.length;
      res.falseDigits = [...new Set(traitors.map((t) => m.clues[t.id]?.pos).filter((x) => x !== undefined))].sort().map((x) => x + 1);
      if (m.opened) {
        res.gained = 100 * alive.length;
        this.pot += res.gained;
        res.sabotage = false;
      } else {
        res.gained = 0;
        res.sabotage = traitors.length > 0;
        if (res.sabotage) res.vanished = this.siphon(200);
      }
    } else if (m.type === 'scavenger') {
      const found = alive.filter((p) => m.subs[p.id] && m.subs[p.id].ok !== false);
      res.found = found.length;
      res.total = alive.length;
      res.missing = alive.filter((p) => !found.includes(p)).map((p) => ({ id: p.id, item: m.items[p.id] }));
      res.gained = 100 * found.length;
      this.pot += res.gained;
      const targetIds = new Set(Object.values(m.targets));
      res.sabotage = traitors.length > 0 && [...targetIds].some((id) => res.missing.some((x) => x.id === id));
      if (res.sabotage) res.vanished = this.siphon(150);
    }
    m.result = res;
    if (m.type === 'secretword') return this.setPhase('roundtable', 'roundtable');
    this.setPhase('results', 'results');
  }

  endResults() {
    const m = this.mission;
    if (m && (m.type === 'photo') && this.settings.shields) {
      let best = [];
      let max = 0;
      for (const p of this.alive()) {
        const s = m.subs[p.id];
        if (!s) continue;
        const h = s.hearts.size;
        if (h > max) {
          max = h;
          best = [p.id];
        } else if (h === max && h > 0) best.push(p.id);
      }
      if (best.length) {
        const winner = pick(best);
        this.players.get(winner).shieldFor = this.day;
        m.result.shieldWinner = winner;
      }
    }
    this.setPhase('roundtable', 'roundtable');
  }

  endRoundtable() {
    if (this.day === 0) {
      this.addLog('The warm-up day ends. No one is banished today.');
      this.day = 1;
      return this.startMission();
    }
    this.startVote('banish');
  }

  // ---------- voting ----------
  startVote(kind, candidates = null, revote = 0) {
    const alive = this.alive().map((p) => p.id);
    const cands = candidates || alive;
    let voters = candidates ? alive.filter((id) => !candidates.includes(id)) : alive;
    if (!voters.length) voters = alive;
    this.vote = { kind, candidates: cands, voters, votes: {}, revote };
    this.setPhase('vote', 'vote');
  }

  activeVoters() {
    return this.vote.voters.filter((id) => this.players.get(id)?.status === 'alive');
  }

  closeVote() {
    const v = this.vote;
    const order = shuffle(this.activeVoters().filter((id) => v.votes[id]));
    this.reveal = { order, index: 0, outcome: null, tally: {} };
    this.setPhase('voteReveal', null, 'revealing');
    if (!order.length) return this.finishReveal();
    this.stepAt = Date.now() + ms(STEP.revealStart);
  }

  finishReveal() {
    const v = this.vote;
    const tally = {};
    for (const id of this.activeVoters()) {
      const t = v.votes[id]?.target;
      if (t && this.players.get(t)?.status === 'alive') tally[t] = (tally[t] || 0) + 1;
    }
    const counts = Object.values(tally);
    const max = counts.length ? Math.max(...counts) : 0;
    let top = Object.keys(tally).filter((k) => tally[k] === max);
    if (!top.length) top = v.candidates.filter((id) => this.players.get(id)?.status === 'alive');
    this.voteHistory.push({
      day: this.day,
      kind: v.kind,
      revote: v.revote,
      votes: this.activeVoters().map((id) => ({ voter: id, target: v.votes[id]?.target || null })),
    });
    let outcome;
    if (top.length === 1) outcome = { type: 'banished', id: top[0] };
    else if (v.revote === 0) outcome = { type: 'tie', tied: top };
    else if (this.isHostMode()) outcome = { type: 'tiebreak', tied: top };
    else outcome = { type: 'random', tied: top, id: pick(top) };
    this.reveal.index = this.reveal.order.length;
    this.reveal.outcome = outcome;
    this.reveal.tally = tally;
    this.stage = 'outcome';
    this.stepAt = Date.now() + ms(STEP.outcome);
    this.touch();
  }

  afterOutcome() {
    const o = this.reveal.outcome;
    if (o.type === 'tie') return this.startVote(this.vote.kind, o.tied, 1);
    if (o.type === 'tiebreak') {
      this.tiebreak = { tied: o.tied, kind: this.vote.kind };
      return this.setPhase('tiebreak', null);
    }
    return this.startBanish(o.id);
  }

  startBanish(id) {
    const p = this.players.get(id);
    const noReveal = this.endgame;
    this.eliminate(p, 'banished');
    this.banish = { id, noReveal };
    if (this.mission?.type === 'secretword' && this.mission.day === this.day && !this.wordReveal && !this.endgame) this.computeWordReveal();
    if (noReveal) {
      this.addLog(`${p.name} was banished in the endgame. Their role stays secret until the end.`);
      this.setPhase('banish', null, 'gone');
      this.stepAt = Date.now() + ms(STEP.banishGone);
    } else {
      this.setPhase('banish', 'banish', 'speech');
    }
  }

  revealBanished() {
    const p = this.players.get(this.banish.id);
    p.roleRevealed = true;
    this.addLog(`${p.name} was banished. They were ${p.role === 'traitor' ? 'a Traitor' : 'Faithful'}.`);
    this.setPhase('banish', null, 'revealed');
    this.stepAt = Date.now() + ms(STEP.banishAfter);
  }

  computeWordReveal() {
    const m = this.mission;
    let vanished = 0;
    for (const [pid, word] of Object.entries(m.words)) {
      const p = this.players.get(pid);
      if (p?.role === 'traitor' && !m.spotted.some((s) => s.owner === pid)) vanished += this.siphon(100);
    }
    this.wordReveal = { theme: m.theme, spotted: m.spotted.map((s) => ({ owner: s.owner, word: s.word, by: s.by })), vanished };
  }

  afterBanish() {
    if (this.endgame) return this.afterEndgameBanish();
    const b = this.players.get(this.banish.id);
    if (this.aliveTraitors().length === 0) return this.finish('faithful');
    if (b.role === 'traitor' && this.settings.recruitment) this.pendingRecruit = true;
    if (this.alive().length <= this.endgameSize) return this.startEndgame();
    return this.startNight();
  }

  // ---------- night ----------
  startNight() {
    const traitors = this.aliveTraitors();
    let kind = 'murder';
    if (this.pendingRecruit) kind = traitors.length === 1 ? 'ultimatum' : 'recruit';
    this.pendingRecruit = false;
    const puzzles = {};
    // Everyone gets the same-looking set; Traitors are scored out of 3 because they spend time plotting.
    for (const p of this.playing()) puzzles[p.id] = C.makePuzzleSet(6);
    this.night = { kind, votes: {}, chat: [], offer: null, puzzles, hostPick: null };
    this.setPhase('night', 'night');
  }

  isAliveFaithful(id) {
    const p = this.players.get(id);
    return p && p.status === 'alive' && p.role !== 'traitor';
  }

  nightTally() {
    const tally = {};
    for (const t of this.aliveTraitors()) {
      const v = this.night.votes[t.id];
      if (v && this.isAliveFaithful(v)) tally[v] = (tally[v] || 0) + 1;
    }
    return tally;
  }

  endNight() {
    const n = this.night;
    let victimId = null;
    let saved = false;
    let noVote = false;
    if (n.kind === 'murder') {
      const tally = this.nightTally();
      const keys = Object.keys(tally);
      if (!keys.length) {
        noVote = true;
        this.stash = Math.max(0, this.stash - 50);
      } else {
        const max = Math.max(...keys.map((k) => tally[k]));
        const top = keys.filter((k) => tally[k] === max);
        victimId = top.length === 1 ? top[0] : n.hostPick && top.includes(n.hostPick) ? n.hostPick : pick(top);
      }
    } else if (n.offer && n.offer.status !== 'accepted' && n.kind === 'ultimatum') {
      victimId = n.offer.target;
    }
    if (victimId && this.settings.shields && this.players.get(victimId).shieldFor === this.day) {
      saved = true;
      victimId = null;
    }
    // Puzzles: everyone's solves fill the pot; the best living solver earns a secret shield for tomorrow night.
    let solved = 0;
    let best = null;
    for (const p of this.playing()) {
      const set = n.puzzles[p.id];
      if (!set) continue;
      const done = set.filter((i) => i.solvedAt);
      solved += done.length;
      if (p.status === 'alive' && done.length) {
        const ratio = Math.min(1, done.length / (p.role === 'traitor' ? 3 : set.length));
        const last = Math.max(...done.map((i) => i.solvedAt));
        if (!best || ratio > best.ratio || (ratio === best.ratio && last < best.last)) best = { id: p.id, ratio, last };
      }
    }
    this.pot += solved * 20;
    if (best && this.settings.shields && best.id !== victimId) this.players.get(best.id).shieldFor = this.day + 1;
    if (victimId) this.eliminate(this.players.get(victimId), 'murdered');
    const survivors = shuffle(this.alive().map((p) => p.id));
    const batches = [];
    for (let i = 0; i < survivors.length; i += 3) batches.push(survivors.slice(i, i + 3));
    this.breakfast = { victimId, saved, noVote, batches, called: 0, here: new Set(), solved, topSolver: best?.id || null, recruited: n.offer?.status === 'accepted' ? n.offer.target : null };
    this.lastNight = n;
    this.night = null;
    this.setPhase('breakfast', null, 'arriving');
    this.stepAt = Date.now() + ms(STEP.breakfastBatch);
  }

  breakfastReveal() {
    const b = this.breakfast;
    b.called = b.batches.length;
    if (b.victimId) this.addLog(`${this.name(b.victimId)} was murdered in the night.`);
    else this.addLog('Nobody was murdered in the night.');
    this.setPhase('breakfast', this.settings.pacing === 'slow' ? null : 'breakfast', 'reveal');
  }

  afterBreakfast() {
    this.day++;
    if (this.alive().length <= this.endgameSize) return this.startEndgame();
    this.startMission();
  }

  // ---------- endgame ----------
  startEndgame() {
    this.endgame = true;
    this.addLog(`The endgame begins with ${this.alive().length} players left.`);
    this.setPhase('endgameTalk', 'endgameTalk');
  }

  startEndgameVote() {
    if (this.alive().length <= 2) return this.startFinalReveal();
    this.endVote = { choices: {}, results: null };
    this.setPhase('endgameVote', 'endgameVote', 'choosing');
  }

  closeEndgameVote() {
    const alive = this.alive();
    let end = 0;
    let banish = 0;
    for (const p of alive) {
      if (this.endVote.choices[p.id] === 'end') end++;
      else banish++;
    }
    this.endVote.results = { end, banish };
    this.stage = 'results';
    this.phaseEndsAt = null;
    this.stepAt = Date.now() + ms(STEP.endgameResults);
    this.touch();
  }

  afterEndgameVote() {
    if (this.endVote.results.banish === 0) return this.startFinalReveal();
    this.startVote('endgame');
  }

  afterEndgameBanish() {
    if (this.alive().length <= 2) return this.startFinalReveal();
    this.setPhase('endgameTalk', 'endgameTalk');
  }

  startFinalReveal() {
    this.finalRev = { order: shuffle(this.alive().map((p) => p.id)), index: 0 };
    this.setPhase('finalReveal', null, 'revealing');
    this.stepAt = Date.now() + ms(STEP.finalStep / 2);
  }

  finish(side) {
    if (!side) side = this.aliveTraitors().length ? 'traitors' : 'faithful';
    const alive = this.alive();
    const winners = alive.filter((p) => (side === 'traitors' ? p.role === 'traitor' : p.role !== 'traitor'));
    const total = this.pot + (side === 'traitors' ? this.stash : 0);
    const each = winners.length ? Math.floor(total / winners.length) : 0;
    const losersAlive = alive.filter((p) => !winners.includes(p));
    const placings = [];
    for (const p of winners) placings.push({ id: p.id, place: 1, points: each });
    let place = 2;
    for (const p of losersAlive) placings.push({ id: p.id, place: place++, points: 0 });
    for (const id of [...this.elimOrder].reverse()) placings.push({ id, place: place++, points: 0 });
    for (const p of this.playing()) p.roleRevealed = true;
    this.result = { side, winners: winners.map((p) => p.id), total, each, pot: this.pot, stash: this.stash, placings };
    this.addLog(side === 'traitors' ? 'The Traitors win.' : 'The Faithful win.');
    this.setPhase('gameOver', null);
  }

  // ---------- generic flow ----------
  readyPhase() {
    const ph = this.phase;
    if (['roles', 'results', 'roundtable', 'endgameTalk'].includes(ph)) return true;
    // In slow-burn there is no clock, so the room can move on even if the banished player never taps reveal.
    if (ph === 'banish') return this.stage === 'revealed' || (this.stage === 'speech' && this.settings.pacing === 'slow');
    if (ph === 'breakfast') return this.stage === 'reveal';
    if (ph === 'mission') return this.mission?.type === 'secretword';
    if (ph === 'night') return this.settings.pacing === 'slow';
    return false;
  }

  allReady() {
    const a = this.alive();
    return a.length > 0 && a.every((p) => p.ready);
  }

  advance() {
    switch (this.phase) {
      case 'roles':
        return this.startMission();
      case 'mission':
        return this.endMission();
      case 'results':
        return this.endResults();
      case 'roundtable':
        return this.endRoundtable();
      case 'vote':
        return this.closeVote();
      case 'voteReveal':
        return this.stage === 'revealing' ? this.finishReveal() : this.afterOutcome();
      case 'tiebreak':
        if (!this.isHostMode()) return this.startBanish(pick(this.tiebreak.tied));
        return;
      case 'banish':
        if (this.stage === 'speech') return this.revealBanished();
        return this.afterBanish();
      case 'night':
        return this.endNight();
      case 'breakfast':
        return this.stage === 'arriving' ? this.breakfastReveal() : this.afterBreakfast();
      case 'endgameTalk':
        return this.startEndgameVote();
      case 'endgameVote':
        return this.stage === 'choosing' ? this.closeEndgameVote() : this.afterEndgameVote();
      case 'finalReveal':
        for (const id of this.finalRev.order) this.players.get(id).roleRevealed = true;
        return this.finish();
    }
  }

  step() {
    switch (this.phase) {
      case 'voteReveal':
        if (this.stage === 'revealing') {
          this.reveal.index++;
          if (this.reveal.index >= this.reveal.order.length) this.finishReveal();
          else this.stepAt = Date.now() + ms(STEP.reveal);
          this.touch();
        } else this.afterOutcome();
        break;
      case 'banish':
        this.afterBanish();
        break;
      case 'breakfast':
        if (this.stage === 'arriving') {
          this.breakfast.called++;
          if (this.breakfast.called >= this.breakfast.batches.length) this.breakfastReveal();
          else this.stepAt = Date.now() + ms(STEP.breakfastBatch);
          this.touch();
        }
        break;
      case 'endgameVote':
        if (this.stage === 'results') this.afterEndgameVote();
        break;
      case 'finalReveal': {
        const f = this.finalRev;
        if (this.stage === 'revealing') {
          const id = f.order[f.index];
          if (id) this.players.get(id).roleRevealed = true;
          f.index++;
          if (f.index >= f.order.length) this.stage = 'done';
          this.stepAt = Date.now() + ms(STEP.finalStep);
          this.touch();
        } else this.finish();
        break;
      }
    }
  }

  tick(now = Date.now()) {
    if (this.phase === 'lobby' || this.phase === 'gameOver' || this.paused) return;
    if (this.stepAt && now >= this.stepAt) {
      this.stepAt = null;
      this.step();
      return;
    }
    if (this.phaseEndsAt && now >= this.phaseEndsAt) {
      const auto = !this.isHostMode();
      if (auto || ['vote', 'endgameVote'].includes(this.phase)) {
        this.phaseEndsAt = null;
        this.advance();
      }
    }
  }

  checkAuto() {
    const auto = !this.isHostMode();
    switch (this.phase) {
      case 'mission':
        if (auto && this.missionComplete()) this.endMission();
        break;
      case 'vote':
        if (this.activeVoters().every((id) => this.vote.votes[id])) this.closeVote();
        break;
      case 'endgameVote':
        if (this.stage === 'choosing' && this.alive().every((p) => this.endVote.choices[p.id])) this.closeEndgameVote();
        break;
      case 'night':
        if (auto && this.settings.pacing === 'slow' && this.allReady()) this.endNight();
        break;
      default:
        if (auto && this.readyPhase() && this.allReady()) this.advance();
    }
  }

  // ---------- actions ----------
  handle(pid, a) {
    const p = this.players.get(pid);
    if (!p) return { error: 'Unknown player.' };
    p.lastSeen = Date.now();
    const fn = this['act_' + a?.type];
    if (typeof fn !== 'function') return { error: 'Unknown action.' };
    let out;
    try {
      out = fn.call(this, p, a) || { ok: true };
    } catch (e) {
      console.error(e);
      return { error: 'Something went wrong.' };
    }
    if (!out.error) {
      this.checkAuto();
      this.touch();
    }
    return out;
  }

  requireHost(p) {
    if (this.isHostMode() ? !p.isHost : p.id !== this.creatorId) return 'Only the host can do that.';
    return null;
  }
  requireAlive(p) {
    if (p.isHost || p.status !== 'alive') return 'Only living players can do that.';
    return null;
  }

  act_settings(p, a) {
    if (this.phase !== 'lobby') return { error: 'The game has started.' };
    if (p.id !== this.creatorId) return { error: 'Only the organiser can change settings.' };
    const allowed = {
      mode: ['inperson', 'remote'],
      runBy: ['auto', 'host'],
      pacing: ['quick', 'standard', 'slow'],
      traitors: ['auto', 1, 2, 3, 4],
      pack: ['pub', 'home', 'outdoors'],
      shields: [true, false],
      recruitment: [true, false],
      decoys: [true, false],
      ghostsFollow: [true, false],
      endgameSize: ['auto', 3, 4, 5],
    };
    for (const [k, v] of Object.entries(a.settings || {})) {
      if (allowed[k] && allowed[k].includes(v)) this.settings[k] = v;
    }
    const creator = this.players.get(this.creatorId);
    creator.isHost = this.settings.runBy === 'host';
    if (!creator.isHost) this.manualTraitors = [];
  }

  act_start(p) {
    if (this.phase !== 'lobby') return { error: 'Already started.' };
    if (p.id !== this.creatorId) return { error: 'Only the organiser can start the game.' };
    return this.start();
  }

  act_setTraitors(p, a) {
    if (this.phase !== 'lobby' || !p.isHost) return { error: 'Only the host can pick Traitors.' };
    this.manualTraitors = (a.ids || []).filter((id) => this.players.get(id) && !this.players.get(id).isHost).slice(0, 6);
  }

  act_kick(p, a) {
    const err = this.requireHost(p);
    if (err) return { error: err };
    const t = this.players.get(a.id);
    if (!t || t.id === p.id) return { error: 'Cannot remove that player.' };
    if (this.phase === 'lobby') {
      this.players.delete(t.id);
      this.order = this.order.filter((id) => id !== t.id);
      t.kicked = true;
      return { ok: true };
    }
    if (t.status !== 'alive') return { error: 'They are already out.' };
    this.eliminate(t, 'banished');
    t.left = true;
    t.roleRevealed = true;
    this.addLog(`${t.name} left the game. They were ${t.role === 'traitor' ? 'a Traitor' : 'Faithful'}.`);
    if (!['finalReveal', 'gameOver'].includes(this.phase) && this.aliveTraitors().length === 0) this.finish('faithful');
  }

  act_ready(p, a) {
    if (!this.readyPhase()) return { error: 'Nothing to be ready for.' };
    if (p.status !== 'alive' || p.isHost) return { error: 'Only living players can do that.' };
    if (this.phase === 'night' && p.role === 'traitor' && this.night.kind === 'murder' && !this.night.votes[p.id]) return { error: 'Lock in your choice first.' };
    p.ready = a.value !== false;
  }

  act_moveOn(p) {
    if (this.settings.pacing !== 'slow' || this.isHostMode()) return { error: 'Not available.' };
    if (p.status !== 'alive' || Date.now() - this.phaseStartedAt < STALL_MS) return { error: 'Not yet.' };
    this.moveOn.add(p.id);
    if (this.moveOn.size > this.alive().length / 2) this.advance();
  }

  // host controls
  act_next(p) {
    const err = this.requireHost(p);
    if (err) return { error: err };
    if (!this.isHostMode()) return { error: 'The game runs itself in auto mode.' };
    if (this.phase === 'tiebreak') return { error: 'Pick who is banished first.' };
    this.advance();
  }
  act_pause(p, a) {
    if (!p.isHost) return { error: 'Only the host can pause.' };
    if (a.value && !this.paused) {
      this.paused = true;
      this.pausedRemaining = this.phaseEndsAt ? this.phaseEndsAt - Date.now() : null;
      this.pausedStep = this.stepAt ? this.stepAt - Date.now() : null;
    } else if (!a.value && this.paused) {
      this.paused = false;
      if (this.pausedRemaining != null) this.phaseEndsAt = Date.now() + this.pausedRemaining;
      if (this.pausedStep != null) this.stepAt = Date.now() + this.pausedStep;
      this.pausedRemaining = null;
    }
  }
  act_extend(p) {
    if (!p.isHost) return { error: 'Only the host can do that.' };
    if (this.phaseEndsAt) this.phaseEndsAt += 60000;
    else this.phaseEndsAt = Date.now() + 60000;
  }
  act_tiePick(p, a) {
    if (!p.isHost || this.phase !== 'tiebreak') return { error: 'Not now.' };
    if (!this.tiebreak.tied.includes(a.id)) return { error: 'Pick one of the tied players.' };
    this.startBanish(a.id);
  }
  act_nightPick(p, a) {
    if (!p.isHost || this.phase !== 'night') return { error: 'Not now.' };
    this.night.hostPick = a.id;
  }
  act_nextMission(p, a) {
    if (!p.isHost) return { error: 'Only the host can do that.' };
    if (a.missionType && !C.MISSION_TYPES.includes(a.missionType)) return { error: 'Unknown mission.' };
    this.nextMissionType = a.missionType || null;
  }
  act_approve(p, a) {
    if (!p.isHost) return { error: 'Only the host can do that.' };
    const s = this.mission?.subs?.[a.id];
    if (!s) return { error: 'No photo from them yet.' };
    if ('ok' in a) s.ok = !!a.ok;
    if ('objectOk' in a) s.objectOk = !!a.objectOk;
  }

  // missions
  act_submitPhoto(p, a) {
    const err = this.requireAlive(p);
    if (err) return { error: err };
    const m = this.mission;
    if (this.phase !== 'mission' || !m || !['photo', 'scavenger'].includes(m.type)) return { error: 'No photo needed right now.' };
    const raw = String(a.data || '');
    const b64 = raw.includes(',') ? raw.split(',')[1] : raw;
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 100 || buf.length > 4 * 1024 * 1024) return { error: 'That photo could not be used. Try again.' };
    const old = m.subs[p.id];
    if (old?.photoId) {
      this.hooks.deletePhoto?.(old.photoId);
      this.photoIds.delete(old.photoId);
    }
    const photoId = this.hooks.savePhoto ? this.hooks.savePhoto(buf) : newId(8);
    this.photoIds.add(photoId);
    const canHide = p.role === 'traitor' || (m.decoys && m.decoys[p.id]);
    m.subs[p.id] = { photoId, hid: !!a.hid && !!canHide, ok: this.isHostMode() ? null : true, objectOk: null, hearts: new Set(), at: Date.now() };
  }

  act_vaultGuess(p, a) {
    const err = this.requireAlive(p);
    if (err) return { error: err };
    const m = this.mission;
    if (this.phase !== 'mission' || m?.type !== 'vault') return { error: 'No vault right now.' };
    if (m.opened || m.attempts.length >= m.max) return { error: 'The vault is closed.' };
    const guess = String(a.guess || '').replace(/\D/g, '');
    if (guess.length !== 4) return { error: 'Enter 4 digits.' };
    const correct = guess === m.code;
    m.attempts.push({ by: p.id, guess, correct });
    if (correct) m.opened = true;
    return { ok: true, correct };
  }

  act_spot(p, a) {
    const err = this.requireAlive(p);
    if (err) return { error: err };
    const m = this.mission;
    if (!m || m.type !== 'secretword' || m.day !== this.day || this.phase !== 'roundtable') return { error: 'You can only spot words during the round table.' };
    const owner = this.players.get(a.owner);
    if (!owner || owner.id === p.id || owner.status !== 'alive' || !m.words[owner.id]) return { error: 'Pick another player.' };
    if (m.spotted.some((s) => s.owner === owner.id)) return { error: 'Someone already spotted their word.' };
    const tries = m.tries[p.id] || 0;
    if (tries >= 5) return { error: 'You have used all 5 guesses.' };
    const guess = String(a.word || '').trim().toLowerCase();
    if (!guess) return { error: 'Type the word you heard.' };
    if (guess === m.words[owner.id]) {
      m.spotted.push({ owner: owner.id, word: m.words[owner.id], by: p.id });
      this.pot += owner.role === 'traitor' ? 100 : 50;
      return { ok: true, correct: true };
    }
    m.tries[p.id] = tries + 1;
    return { ok: true, correct: false, triesLeft: 5 - m.tries[p.id] };
  }

  act_heart(p, a) {
    const m = this.mission;
    if (!m?.subs || !['results', 'roundtable'].includes(this.phase)) return { error: 'Not now.' };
    const s = m.subs[a.id];
    if (!s || a.id === p.id) return { error: 'You cannot heart that.' };
    if (s.hearts.has(p.id)) s.hearts.delete(p.id);
    else s.hearts.add(p.id);
  }

  act_chat(p, a) {
    const err = this.requireAlive(p);
    if (err) return { error: err };
    if (!['roundtable', 'endgameTalk', 'vote'].includes(this.phase)) return { error: 'The round table is closed.' };
    const text = String(a.text || '').trim().slice(0, 300);
    if (!text) return { error: 'Empty message.' };
    if (Date.now() - p.lastChatAt < 3000) return { error: 'Slow down a little.' };
    p.lastChatAt = Date.now();
    this.chat.push({ id: newId(4), from: p.id, text, at: Date.now() });
    if (this.chat.length > 300) this.chat.shift();
  }

  act_vote(p, a) {
    if (this.phase !== 'vote') return { error: 'Voting is closed.' };
    if (!this.activeVoters().includes(p.id)) return { error: 'You are not voting this time.' };
    if (!this.vote.candidates.includes(a.target) || a.target === p.id) return { error: 'Pick someone else.' };
    if (this.players.get(a.target)?.status !== 'alive') return { error: 'Pick someone still in the game.' };
    const drawing = typeof a.drawing === 'string' && a.drawing.startsWith('data:image/') && a.drawing.length < 200000 ? a.drawing : null;
    this.vote.votes[p.id] = { target: a.target, drawing };
  }

  act_revealRole(p) {
    if (this.phase !== 'banish' || this.stage !== 'speech' || this.banish.id !== p.id) return { error: 'Not now.' };
    this.revealBanished();
  }

  act_here(p) {
    if (this.phase !== 'breakfast') return { error: 'Not now.' };
    this.breakfast.here.add(p.id);
  }

  act_endChoice(p, a) {
    const err = this.requireAlive(p);
    if (err) return { error: err };
    if (this.phase !== 'endgameVote' || this.stage !== 'choosing') return { error: 'Not now.' };
    if (!['end', 'banish'].includes(a.choice)) return { error: 'Choose End or Banish.' };
    this.endVote.choices[p.id] = a.choice;
  }

  // night
  act_puzzle(p, a) {
    if (this.phase !== 'night' || p.isHost) return { error: 'No puzzle right now.' };
    const item = this.night.puzzles[p.id]?.find((i) => i.id === a.id);
    if (!item) return { error: 'Unknown puzzle.' };
    if (item.solvedAt) return { ok: true, correct: true };
    const correct = C.checkAnswer(item, a.answer);
    if (correct) item.solvedAt = Date.now();
    return { ok: true, correct };
  }

  isConclaveMember(p) {
    return this.phase === 'night' && p.role === 'traitor' && p.status === 'alive';
  }

  act_conclaveVote(p, a) {
    if (!this.isConclaveMember(p)) return { error: 'Not now.' };
    if (!this.isAliveFaithful(a.target)) return { error: 'Pick a Faithful player.' };
    if (this.night.offer) return { error: 'The offer has already been made.' };
    this.night.votes[p.id] = a.target;
  }

  act_conclaveChat(p, a) {
    if (!this.isConclaveMember(p)) return { error: 'Not now.' };
    const text = String(a.text || '').trim().slice(0, 300);
    if (!text) return { error: 'Empty message.' };
    this.night.chat.push({ id: newId(4), from: p.id, text, at: Date.now() });
  }

  act_sendOffer(p) {
    if (!this.isConclaveMember(p) || this.night.kind === 'murder') return { error: 'Not now.' };
    if (this.night.offer) return { error: 'The offer has already been made.' };
    const tally = this.nightTally();
    const need = Math.floor(this.aliveTraitors().length / 2) + 1;
    const target = Object.keys(tally).find((k) => tally[k] >= need);
    if (!target) return { error: 'Agree on one player first.' };
    this.night.offer = { target, status: 'pending', by: p.id };
    this.night.chat.push({ id: newId(4), from: null, text: `An offer has been sent to ${this.name(target)}.`, at: Date.now() });
  }

  act_offerReply(p, a) {
    const o = this.night?.offer;
    if (this.phase !== 'night' || !o || o.target !== p.id || o.status !== 'pending') return { error: 'No offer to answer.' };
    o.status = a.accept ? 'accepted' : 'declined';
    if (a.accept) {
      p.role = 'traitor';
      p.recruited = true;
      this.night.chat.push({ id: newId(4), from: null, text: `${p.name} has joined the Traitors.`, at: Date.now() });
    } else {
      this.night.chat.push({ id: newId(4), from: null, text: `${p.name} turned the offer down.`, at: Date.now() });
    }
  }

  // ---------- what each phone sees ----------
  roleVisible(viewer, target, omniscient) {
    if (omniscient || viewer.id === target.id || target.roleRevealed) return true;
    if (viewer.role === 'traitor' && target.role === 'traitor' && !viewer.isHost) return true;
    return false;
  }

  viewFor(pid) {
    const me = this.players.get(pid);
    if (!me) return null;
    const started = this.phase !== 'lobby';
    const ghost = started && !me.isHost && me.status !== 'alive';
    const ghostFollow = ghost && this.settings.mode === 'remote' && this.settings.ghostsFollow;
    const omniscient = me.isHost || ghostFollow || this.phase === 'gameOver';
    const meTraitor = me.role === 'traitor' && !me.isHost;
    const seesSecrets = omniscient || (meTraitor && me.status === 'alive');
    const alive = this.alive();
    const v = {
      code: this.code,
      phase: this.phase,
      stage: this.stage,
      day: this.day,
      warmup: this.day === 0,
      endgame: this.endgame,
      settings: this.settings,
      serverNow: Date.now(),
      phaseEndsAt: this.paused ? null : this.phaseEndsAt,
      phaseStartedAt: this.phaseStartedAt,
      paused: this.paused,
      pausedRemaining: this.pausedRemaining,
      pot: this.pot,
      stash: seesSecrets ? this.stash : null,
      omniscient,
      ghost,
      minPlayers: this.minPlayers(),
      traitorTotal: started ? this.traitorTotal : null,
      endgameSize: started ? this.endgameSize : null,
      you: {
        id: me.id,
        name: me.name,
        avatar: me.avatar,
        role: me.role,
        status: me.status,
        isHost: me.isHost,
        isCreator: me.id === this.creatorId,
        shieldTonight: me.shieldFor != null && me.shieldFor === this.day,
        shieldNext: me.shieldFor != null && me.shieldFor === this.day + 1,
        recruited: !!me.recruited,
        ready: me.ready,
      },
      players: this.order
        .map((id) => this.players.get(id))
        .filter(Boolean)
        .map((p) => ({
          id: p.id,
          name: p.name,
          avatar: p.avatar,
          status: p.status,
          isHost: p.isHost,
          left: !!p.left,
          connected: p.connected,
          role: started && this.roleVisible(me, p, omniscient) ? p.role : null,
          recruited: omniscient || meTraitor ? !!p.recruited : undefined,
          eliminatedDay: p.eliminatedDay,
          traitorPick: this.isHostMode() && me.isHost && this.phase === 'lobby' ? this.manualTraitors.includes(p.id) : undefined,
        })),
      ready: { count: alive.filter((p) => p.ready).length, needed: alive.length, can: this.readyPhase() && me.status === 'alive' && !me.isHost },
      moveOn:
        this.settings.pacing === 'slow' && !this.isHostMode() && started
          ? { available: Date.now() - this.phaseStartedAt >= STALL_MS, count: this.moveOn.size, mine: this.moveOn.has(me.id) }
          : null,
      log: this.log,
      voteHistory: this.voteHistory,
      nextMission: me.isHost ? this.nextMissionType : undefined,
      missionTypes: C.MISSION_INFO,
    };

    // mission
    const m = this.mission;
    if (m && ['mission', 'results', 'roundtable', 'vote', 'voteReveal', 'banish'].includes(this.phase) && m.day === this.day) {
      const mv = { type: m.type, info: C.MISSION_INFO[m.type], result: null };
      if (m.type === 'photo') {
        mv.prompt = m.prompt;
        if (meTraitor || omniscient) mv.secretObject = m.secret.object;
        if (m.decoys[me.id]) mv.decoyObject = m.decoys[me.id];
        if (this.phase !== 'mission') mv.category = m.secret.category;
      }
      if (m.type === 'scavenger') {
        mv.myItem = m.items[me.id] || null;
        if (meTraitor || omniscient) {
          const tid = m.targets[me.id] || Object.values(m.targets)[0];
          if (tid) mv.sabotageTarget = { id: tid, item: m.items[tid] };
        }
        if (me.isHost) mv.items = m.items;
      }
      if (m.type === 'photo' || m.type === 'scavenger') {
        mv.mySubmission = m.subs[me.id] ? { url: `/p/${m.subs[me.id].photoId}`, hid: m.subs[me.id].hid } : null;
        mv.submittedCount = alive.filter((p) => m.subs[p.id]).length;
        mv.aliveCount = alive.length;
        const showAll = this.phase !== 'mission' || me.isHost;
        if (showAll) {
          mv.gallery = this.order
            .filter((id) => m.subs[id])
            .map((id) => {
              const s = m.subs[id];
              const g = { id, url: `/p/${s.photoId}`, hearts: s.hearts.size, myHeart: s.hearts.has(me.id), item: m.type === 'scavenger' ? m.items[id] : undefined };
              if (me.isHost) Object.assign(g, { ok: s.ok, objectOk: s.objectOk, hid: s.hid });
              return g;
            });
        }
      }
      if (m.type === 'vault') {
        const c = m.clues[me.id];
        if (c) mv.myClue = { pos: c.pos + 1, digit: c.digit, fake: meTraitor ? c.fake : null };
        mv.attempts = m.attempts.map((x) => ({ by: x.by, guess: x.guess, correct: x.correct }));
        mv.max = m.max;
        mv.opened = m.opened;
        if (me.isHost) mv.code = m.code;
        if (me.isHost) mv.clues = Object.fromEntries(Object.entries(m.clues).map(([k, c2]) => [k, { pos: c2.pos + 1, digit: c2.digit, fake: c2.fake }]));
      }
      if (m.type === 'secretword') {
        mv.myWord = m.words[me.id] || null;
        if (meTraitor || omniscient) mv.theme = m.theme;
        if (omniscient) mv.words = m.words;
        mv.mySpots = m.spotted.filter((s) => s.by === me.id).map((s) => ({ owner: s.owner, word: s.word }));
        mv.triesLeft = 5 - (m.tries[me.id] || 0);
        mv.spotCount = m.spotted.length;
        if (this.wordReveal) mv.wordReveal = this.wordReveal;
      }
      if (m.result && this.phase !== 'mission') {
        const r = { ...m.result };
        if (!seesSecrets) delete r.sabotage;
        if (r.shieldWinner && r.shieldWinner !== me.id && !omniscient) delete r.shieldWinner;
        mv.result = r;
      }
      v.mission = mv;
    }

    // round table chat
    if (['roundtable', 'endgameTalk', 'vote'].includes(this.phase)) {
      v.chat = this.chat;
      v.canChat = this.settings.mode === 'remote' && me.status === 'alive' && !me.isHost;
    }

    // voting
    if (this.vote && ['vote', 'voteReveal', 'tiebreak'].includes(this.phase)) {
      const vt = this.vote;
      v.vote = {
        kind: vt.kind,
        revote: vt.revote,
        candidates: vt.candidates,
        voters: this.activeVoters(),
        votedCount: this.activeVoters().filter((id) => vt.votes[id]).length,
        myVote: vt.votes[me.id]?.target || null,
        canVote: this.phase === 'vote' && this.activeVoters().includes(me.id),
      };
      if (me.isHost && this.phase === 'vote') v.vote.live = Object.fromEntries(Object.entries(vt.votes).map(([k, x]) => [k, x.target]));
    }
    if (this.phase === 'voteReveal') {
      const r = this.reveal;
      v.reveal = {
        shown: r.order.slice(0, r.index).map((id) => ({ voter: id, target: this.vote.votes[id].target, drawing: this.vote.votes[id].drawing })),
        total: r.order.length,
        outcome: this.stage === 'outcome' ? r.outcome : null,
        tally: this.stage === 'outcome' ? r.tally : null,
      };
    }
    if (this.phase === 'tiebreak') v.tiebreak = this.tiebreak;
    if (this.phase === 'banish') {
      const b = this.players.get(this.banish.id);
      v.banish = { id: b.id, stage: this.stage, noReveal: this.banish.noReveal, role: this.stage === 'revealed' ? b.role : null };
    }

    // night
    if (this.phase === 'night') {
      const n = this.night;
      const set = n.puzzles[me.id];
      v.night = {
        puzzle: set ? { items: set.map((i) => ({ id: i.id, type: i.type, prompt: i.prompt, options: i.options, solved: !!i.solvedAt })), total: set.length } : null,
      };
      const member = meTraitor && me.status === 'alive';
      if (member || omniscient) {
        v.night.conclave = {
          kind: n.kind,
          candidates: alive.filter((p) => p.role !== 'traitor').map((p) => p.id),
          votes: n.votes,
          chat: n.chat,
          offer: n.offer,
          member,
          need: Math.floor(this.aliveTraitors().length / 2) + 1,
          hostPick: me.isHost ? n.hostPick : undefined,
        };
      }
      if (n.offer && n.offer.target === me.id) v.night.offer = { kind: n.kind, status: n.offer.status };
    }

    // breakfast
    if (this.phase === 'breakfast') {
      const b = this.breakfast;
      const revealed = this.stage === 'reveal';
      v.breakfast = {
        stage: this.stage,
        batches: b.batches.slice(0, b.called),
        here: [...b.here],
        victimId: revealed || omniscient || b.victimId === me.id ? b.victimId : null,
        youWereMurdered: b.victimId === me.id,
        nobody: revealed ? !b.victimId : null,
        solved: revealed ? b.solved : null,
        // The top solver's shield is secret, so only they (and the host) learn who it was.
        topSolver: revealed && (b.topSolver === me.id || omniscient) ? b.topSolver : null,
        recruitedYou: b.recruited === me.id,
      };
    }

    if (this.phase === 'endgameVote') {
      v.endVote = { myChoice: this.endVote.choices[me.id] || null, count: Object.keys(this.endVote.choices).length, needed: alive.length, results: this.endVote.results };
    }
    if (this.phase === 'finalReveal') {
      const f = this.finalRev;
      v.finalReveal = { order: f.order, index: f.index, done: this.stage === 'done' };
    }
    if (this.phase === 'gameOver') v.result = this.result;
    return v;
  }
}

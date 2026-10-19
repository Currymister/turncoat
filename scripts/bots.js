// Plays complete games with simulated players against a real server, checking the rules
// and that no phone is ever sent a role it shouldn't see.
// Usage: npm test            (runs the full suite)

import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.BOT_PORT || 3999);
const URL = `ws://localhost:${PORT}/ws`;
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const JPEG = 'data:image/jpeg;base64,' + Buffer.alloc(400, 7).toString('base64');

export class Bot {
  constructor(name, opts) {
    this.name = name;
    this.opts = opts;
    this.rid = 0;
    this.pending = new Map();
    this.view = null;
    this.done = new Set();
    this.errors = [];
    this.leaks = [];
  }
  connect() {
    return new Promise((res) => {
      this.ws = new WebSocket(URL);
      this.ws.on('open', res);
      this.ws.on('message', (raw) => {
        const msg = JSON.parse(raw);
        if (msg.t === 'res') {
          this.pending.get(msg.rid)?.(msg);
          this.pending.delete(msg.rid);
        } else if (msg.t === 'state') {
          this.view = msg.view;
          this.check(msg.view);
          this.react(msg.view).catch((e) => this.errors.push(String(e)));
        }
      });
    });
  }
  req(t, data = {}) {
    const rid = ++this.rid;
    return new Promise((res) => {
      this.pending.set(rid, res);
      this.ws.send(JSON.stringify({ t, rid, ...data }));
    });
  }
  act(action) {
    return this.req('action', { action });
  }
  once(key, fn) {
    if (this.done.has(key)) return;
    this.done.add(key);
    return fn();
  }

  // Leak checks: what may this phone know?
  check(v) {
    if (v.phase === 'lobby' || v.phase === 'gameOver') return;
    const me = v.you;
    if (me.isHost || v.omniscient) return;
    for (const p of v.players) {
      if (!p.role || p.id === me.id || p.isHost) continue;
      const allowed = (me.role === 'traitor' && p.role === 'traitor') || (p.status !== 'alive' && p.left) || v.log.some((l) => l.text.startsWith(p.name + ' was banished. They were')) || v.phase === 'finalReveal';
      if (!allowed) this.leaks.push(`${me.name} (${me.role}) saw ${p.name}'s role in ${v.phase}`);
    }
    if (me.role !== 'traitor' && v.stash !== null) this.leaks.push(`${me.name} saw the stash`);
    if (me.role !== 'traitor' && v.night?.conclave) this.leaks.push(`${me.name} saw the conclave`);
    if (me.role !== 'traitor' && v.mission?.secretObject) this.leaks.push(`${me.name} saw the secret object`);
    if (me.role !== 'traitor' && v.mission?.result && 'sabotage' in v.mission.result) this.leaks.push(`${me.name} saw sabotage result`);
  }

  async react(v) {
    const me = v.you;
    const key = `${v.phase}|${v.day}|${v.stage}|${v.vote?.revote ?? ''}|${v.endgame}|${v.log.length}|${v.voteHistory.length}`;
    const alive = me.status === 'alive' && !me.isHost;
    const others = v.players.filter((p) => p.status === 'alive' && !p.isHost && p.id !== me.id);

    if (me.isHost) return this.hostReact(v, key);
    if (v.phase === 'banish' && v.banish.stage === 'speech' && v.banish.id === me.id && Math.random() < 0.8) return this.once(key, () => this.act({ type: 'revealRole' }));
    if (!alive) {
      if (v.phase === 'night' && v.night?.puzzle) this.once(key + 'pz', () => this.solve(v));
      return;
    }
    const readyLater = (k) => this.once(k + 'ready', async () => {
      await sleep(5 + Math.random() * 30);
      await this.act({ type: 'ready' });
    });

    switch (v.phase) {
      case 'roles':
      case 'results':
      case 'endgameTalk':
        if (v.phase === 'results' && v.mission?.gallery) this.once(key + 'h', () => { const g = v.mission.gallery.filter((x) => x.id !== me.id); if (g.length) return this.act({ type: 'heart', id: rand(g).id }); });
        return readyLater(key);
      case 'roundtable':
        if (v.canChat) this.once(key + 'c', () => this.act({ type: 'chat', text: `I think it's ${rand(others).name}` }));
        if (v.mission?.type === 'secretword' && others.length) this.once(key + 'sp', async () => {
          const target = rand(others);
          const r = await this.act({ type: 'spot', owner: target.id, word: Math.random() < 0.5 ? 'pigeon' : 'umbrella' });
          if (r.error) this.errors.push('spot: ' + r.error);
        });
        return readyLater(key);
      case 'mission': {
        const m = v.mission;
        if (m.type === 'photo' || m.type === 'scavenger') return this.once(key, () => this.act({ type: 'submitPhoto', data: JPEG, hid: Math.random() < 0.7 }));
        if (m.type === 'vault') return this.once(key + me.id, async () => {
          await sleep(Math.random() * 40);
          if (this.view.mission?.opened || this.view.mission?.attempts?.length >= 3) return;
          await this.act({ type: 'vaultGuess', guess: String(Math.floor(Math.random() * 10000)).padStart(4, '0') });
        });
        return readyLater(key);
      }
      case 'vote':
        if (v.vote.canVote && !v.vote.myVote) return this.once(key, () => {
          const cands = v.vote.candidates.filter((id) => id !== me.id && v.players.find((p) => p.id === id)?.status === 'alive');
          return this.act({ type: 'vote', target: rand(cands), drawing: null }).then((r) => r.error && this.errors.push('vote: ' + r.error));
        });
        return;
      case 'banish':
        if (v.banish.stage === 'speech' && v.banish.id === me.id) return this.once(key, () => this.act({ type: 'revealRole' }));
        if (v.ready.can) return readyLater(key);
        return;
      case 'night': {
        this.once(key + 'pz', () => this.solve(v));
        const c = v.night.conclave;
        if (c?.member) {
          this.once(key + 'cv', async () => {
            const target = c.candidates[0];
            if (!target || this.view.night?.conclave?.offer) return;
            const r = await this.act({ type: 'conclaveVote', target });
            if (r.error && !/already been made/.test(r.error)) this.errors.push('conclave: ' + r.error);
            await this.act({ type: 'conclaveChat', text: 'Agreed.' });
            if (c.kind !== 'murder') { await sleep(20); await this.act({ type: 'sendOffer' }); }
          });
        }
        if (v.night.offer?.status === 'pending') this.once(key + 'offer', () => this.act({ type: 'offerReply', accept: Math.random() < 0.6 }));
        if (v.ready.can) this.once(key + 'rd', async () => { await sleep(60); await this.act({ type: 'ready' }); });
        return;
      }
      case 'breakfast':
        this.once(key + 'here', () => this.act({ type: 'here' }));
        if (v.ready.can) return readyLater(key);
        return;
      case 'endgameVote':
        if (v.stage === 'choosing' && !v.endVote.myChoice) return this.once(key, () => this.act({ type: 'endChoice', choice: Math.random() < 0.65 ? 'end' : 'banish' }));
        return;
    }
  }

  async solve(v) {
    for (const item of v.night.puzzle?.items || []) {
      const answer = item.options ? rand(item.options) : 'nope';
      await this.act({ type: 'puzzle', id: item.id, answer });
    }
  }

  async hostReact(v, key) {
    if (v.phase === 'tiebreak') return this.once(key, () => this.act({ type: 'tiePick', id: v.tiebreak.tied[0] }));
    if (v.phase === 'mission' && v.mission?.gallery) {
      for (const g of v.mission.gallery) if (g.ok === null) this.once(key + g.id, () => this.act({ type: 'approve', id: g.id, ok: true, objectOk: g.hid }));
    }
    // The host moves things on after a short pause, like a real host would.
    const nextable = ['roles', 'mission', 'results', 'roundtable', 'night', 'endgameTalk'].includes(v.phase) || (v.phase === 'banish' && v.stage !== 'gone') || (v.phase === 'breakfast' && v.stage === 'reveal');
    if (nextable) this.once(key + 'next', async () => { await sleep(v.phase === 'night' ? 900 : 150); const r = await this.act({ type: 'next' }); if (r.error && !/Nothing/.test(r.error)) this.errors.push('next: ' + r.error); });
  }
}

async function playGame({ n, settings, label }) {
  const bots = Array.from({ length: n + (settings.runBy === 'host' ? 1 : 0) }, (_, i) => new Bot(`P${i}`));
  for (const b of bots) await b.connect();
  const created = await bots[0].req('create', { name: bots[0].name, avatar: '🦊' });
  if (!created.ok) throw new Error('create failed ' + created.error);
  for (const b of bots.slice(1)) {
    const r = await b.req('join', { code: created.code, name: b.name, avatar: '🐺' });
    if (!r.ok) throw new Error('join failed ' + r.error);
  }
  const s = await bots[0].act({ type: 'settings', settings });
  if (s.error) throw new Error(s.error);
  const st = await bots[0].act({ type: 'start' });
  if (st.error) throw new Error('start: ' + st.error);
  const t0 = Date.now();
  while (bots[0].view?.phase !== 'gameOver') {
    await sleep(100);
    if (Date.now() - t0 > 120000) throw new Error(`${label}: timed out in phase ${bots[0].view?.phase}/${bots[0].view?.stage}`);
  }
  await sleep(200);
  const v = bots[0].view;
  const r = v.result;
  const byId = Object.fromEntries(v.players.map((p) => [p.id, p]));
  // Rule checks
  const problems = [];
  for (const w of r.winners) {
    const p = byId[w];
    if (p.status !== 'alive') problems.push('winner not alive');
    if ((r.side === 'traitors') !== (p.role === 'traitor')) problems.push('winner on wrong side');
  }
  if (r.side === 'faithful' && v.players.some((p) => p.status === 'alive' && p.role === 'traitor')) problems.push('faithful won with a traitor alive');
  if (v.players.some((p) => !p.isHost && !p.role)) problems.push('roles not revealed at end');
  const placings = r.placings.map((x) => x.id);
  if (new Set(placings).size !== n) problems.push(`placings has ${new Set(placings).size} of ${n}`);
  const leaks = bots.flatMap((b) => b.leaks);
  // Late actions (host already moved on, word already spotted) are expected answers, not bugs.
  const errors = bots.flatMap((b) => b.errors).filter((e) => !/Not now|Voting is closed|already spotted/.test(e));
  for (const b of bots) b.ws.close();
  const days = v.day;
  return { label, side: r.side, winners: r.winners.length, days, pot: r.pot, stash: r.stash, problems, leaks: [...new Set(leaks)].slice(0, 5), errors: [...new Set(errors)].slice(0, 5), ms: Date.now() - t0, log: v.log };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) await runSuite();

async function runSuite() {
const server = spawn(process.execPath, ['server/index.js'], { cwd: root, env: { ...process.env, PORT, TIMER_SCALE: process.env.TIMER_SCALE || '0.004' }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', (d) => process.stderr.write('[server] ' + d));
await sleep(600);

const suite = [
  { label: '4 in person, quick, auto', n: 4, settings: { mode: 'inperson', pacing: 'quick' } },
  { label: '5 remote, standard, auto', n: 5, settings: { mode: 'remote', pacing: 'standard', pack: 'home' } },
  { label: '7 in person, standard, decoys', n: 7, settings: { mode: 'inperson', pacing: 'standard', decoys: true } },
  { label: '10 remote, quick, outdoors', n: 10, settings: { mode: 'remote', pacing: 'quick', pack: 'outdoors' } },
  { label: '14 in person, standard', n: 14, settings: { mode: 'inperson', pacing: 'standard' } },
  { label: '8 in person, host mode', n: 8, settings: { mode: 'inperson', pacing: 'standard', runBy: 'host' } },
  { label: '6 remote, slow-burn', n: 6, settings: { mode: 'remote', pacing: 'slow' } },
  { label: '9 remote, no shields/recruit', n: 9, settings: { mode: 'remote', pacing: 'quick', shields: false, recruitment: false } },
];
const rounds = Number(process.env.ROUNDS || 3);
let failed = 0;
for (let i = 0; i < rounds; i++) {
  for (const g of suite) {
    try {
      const r = await playGame(g);
      const bad = r.problems.length || r.leaks.length || r.errors.length;
      if (bad) failed++;
      console.log(`${bad ? 'FAIL' : 'ok  '} ${r.label.padEnd(34)} ${r.side.padEnd(8)} winners=${r.winners} days=${r.days} pot=${r.pot} stash=${r.stash} ${(r.ms / 1000).toFixed(1)}s`);
      if (bad) console.log('   ', JSON.stringify({ problems: r.problems, leaks: r.leaks, errors: r.errors }));
      if (process.env.SHOWLOG) console.log(r.log.map((l) => `   [day ${l.day}] ${l.text}`).join('\n'));
    } catch (e) {
      failed++;
      console.log('FAIL', g.label, e.message);
    }
  }
}
server.kill();
console.log(failed ? `\n${failed} game(s) had problems` : '\nAll games played cleanly.');
process.exit(failed ? 1 : 0);
}

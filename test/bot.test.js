// Five-Card Draw bot stress test: bot-only hands must always terminate,
// never hang, never throw, never act out of turn. Run: node test/bot.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const engineSrc = blocks.find(s => s.includes('module.exports'));
if (!engineSrc) { console.error('FAIL: engine script block not found'); process.exit(1); }

const sandbox = { module: { exports: {} }, console };
vm.createContext(sandbox);
vm.runInContext(engineSrc, sandbox);
const E = sandbox.module.exports;

let failures = 0;
let hands = 0, games = 0, botActions = 0;
let maxStepMs = 0;
const fail = (msg) => { failures++; console.log('FAIL: ' + msg); };
const C = (rank, suit) => ({ id: rank + suit, rank, suit });

// Drive one bot-only hand to completion.
function playBotHand(nPlayers, seed) {
  const names = [];
  for (let i = 0; i < nPlayers; i++) names.push('Bot' + i);
  const st = E.newGame(names.map(n => ({ name: n, isBot: true })), seed, { ante: 10 });
  const r0 = E.applyAction(st, 'p0', { type: 'startHand' });
  if (!r0.ok) { fail(`startHand failed (${r0.error}) players=${nPlayers} seed=${seed}`); return null; }
  let guard = 0;
  while (st.phase !== 'handOver' && st.phase !== 'over' && guard++ < 4000) {
    let acted = false;
    // Poll every player in seat order: whoever must act (draw turn /
    // bet turn) acts; everyone else returns null.
    for (const p of st.players) {
      if (st.phase === 'handOver' || st.phase === 'over') break;
      const t0 = Date.now();
      let a;
      try { a = E.botChooseAction(st, p.id); }
      catch (e) { fail(`botChooseAction threw (${e.message}) players=${nPlayers} seed=${seed}`); return null; }
      const dt = Date.now() - t0; if (dt > maxStepMs) maxStepMs = dt;
      if (dt > 2000) { fail(`botChooseAction slow: ${dt}ms players=${nPlayers} seed=${seed}`); return null; }
      if (!a) continue;
      let r;
      try { r = E.applyAction(st, p.id, a); }
      catch (e) { fail(`applyAction threw (${e.message}) action=${JSON.stringify(a)} players=${nPlayers} seed=${seed}`); return null; }
      if (!r.ok) {
        fail(`bot proposed illegal action ${JSON.stringify(a)} -> ${r.error} players=${nPlayers} seed=${seed} phase=${st.phase} turn=${st.turnIdx}`);
        return null;
      }
      botActions++; acted = true;
      if (st.phase === 'handOver' || st.phase === 'over') break;
    }
    if (!acted) {
      fail(`deadlock: no bot acted players=${nPlayers} seed=${seed} phase=${st.phase} turn=${st.turnIdx} drawTurn=${st.drawTurnIdx} pending=${JSON.stringify(st.pending)}`);
      return null;
    }
  }
  hands++;
  if (st.phase !== 'handOver' && st.phase !== 'over') { fail(`hand did not terminate players=${nPlayers} seed=${seed} phase=${st.phase} guard=${guard}`); return null; }
  if (st.phase === 'handOver' && (!st.winners || !st.winners.length)) { fail(`hand over with no winner players=${nPlayers} seed=${seed}`); return null; }
  // Chip conservation: stacks + pot-in-play must equal the starting total
  // (antes/bets move chips around but never create or destroy them).
  const total = st.players.reduce((s, p) => s + p.stack, 0);
  const expected = nPlayers * 5000;
  if (st.phase === 'handOver' && total !== expected) { fail(`chips not conserved: ${total} vs ${expected} players=${nPlayers} seed=${seed} payouts=${JSON.stringify(st.payouts)}`); return null; }
  return st;
}

// 100 bot-only hands across 2-6 players.
for (const n of [2, 3, 4, 5, 6]) {
  for (let seed = 1; seed <= 20; seed++) playBotHand(n, seed * 7919 + n);
}

// Full sessions: play hands until one player holds all the chips or 25
// hands pass (a session must always end cleanly, never stall).
function playBotSession(nPlayers, seed) {
  const names = [];
  for (let i = 0; i < nPlayers; i++) names.push('Bot' + i);
  const st = E.newGame(names.map(n => ({ name: n, isBot: true })), seed, { ante: 10 });
  let handCount = 0;
  while (st.phase !== 'over' && handCount < 25) {
    const r = handCount === 0
      ? E.applyAction(st, 'p0', { type: 'startHand' })
      : E.applyAction(st, 'p0', { type: 'nextHand' });
    if (!r.ok) { fail(`session hand ${handCount} could not start (${r.error}) players=${nPlayers} seed=${seed}`); return; }
    handCount++;
    let guard = 0;
    while (st.phase !== 'handOver' && st.phase !== 'over' && guard++ < 4000) {
      let acted = false;
      for (const p of st.players) {
        if (st.phase === 'handOver' || st.phase === 'over') break;
        const a = E.botChooseAction(st, p.id);
        if (!a) continue;
        const r2 = E.applyAction(st, p.id, a);
        if (!r2.ok) { fail(`session bot illegal action ${JSON.stringify(a)} -> ${r2.error} players=${nPlayers} seed=${seed}`); return; }
        botActions++; acted = true;
        if (st.phase === 'handOver' || st.phase === 'over') break;
      }
      if (!acted) { fail(`session deadlock players=${nPlayers} seed=${seed} phase=${st.phase}`); return; }
    }
    // Busted bots rebuy between hands (free chips) so sessions keep going.
    for (const p of st.players) if (p.stack === 0) E.applyAction(st, p.id, { type: 'rebuy' });
  }
  games++;
}

for (const n of [2, 3, 4, 6]) {
  for (let seed = 1; seed <= 5; seed++) playBotSession(n, seed * 104729 + n);
}

console.log(`\nbot hands: ${hands}, bot sessions: ${games}, bot actions: ${botActions}`);
console.log(`max botChooseAction: ${maxStepMs}ms`);
console.log(failures === 0 ? 'BOT TEST: ALL OK' : `BOT TEST: ${failures} FAILURE(S)`);

// Scripted bot decisions.
console.log('\nScripted bot decisions:');
let sPass = 0, sFail = 0;
function scheck(name, cond, extra) {
  if (cond) { sPass++; console.log('  ok  ' + name); }
  else { sFail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}
function drawAll(st) {
  let g = 0;
  while (st.phase === 'draw' && g++ < 10) {
    const pid = st.players[st.drawTurnIdx].id;
    E.applyAction(st, pid, { type: 'draw', slots: [] });
  }
}
function mkBotGame(seed) {
  const st = E.newGame([{ name: 'B0', isBot: true }, { name: 'B1', isBot: true }], seed);
  E.applyAction(st, 'p0', { type: 'startHand' });
  E.applyAction(st, 'p0', { type: 'proposeAnte', amount: 10 });
  E.applyAction(st, 'p1', { type: 'enterHand', enter: true });
  if (st.phase !== 'draw') throw new Error('mkBotGame: expected draw phase, got ' + st.phase);
  return st;
}
{
  // Bot keeps a pair, discards the other three.
  const st = mkBotGame(31);
  // p1 draws first: give p1 a pair of Kings + three junk cards.
  st.players[1].hand = [C('K', '♠'), C('K', '♥'), C('2', '♦'), C('7', '♣'), C('9', '♠')];
  const slots = E.botDrawSlots(st, 'p1');
  scheck('bot keeps a pair and discards the other 3', slots.length === 3 && slots.sort().join(',') === '2,3,4', 'got ' + JSON.stringify(slots));
  // Bot keeps trips, discards two.
  st.players[1].hand = [C('Q', '♠'), C('Q', '♥'), C('Q', '♦'), C('7', '♣'), C('9', '♠')];
  const slots2 = E.botDrawSlots(st, 'p1');
  scheck('bot keeps trips and discards 2', slots2.length === 2 && slots2.sort().join(',') === '3,4', 'got ' + JSON.stringify(slots2));
  // Bot keeps a 4-flush draw.
  st.players[1].hand = [C('A', '♥'), C('9', '♥'), C('7', '♥'), C('4', '♥'), C('2', '♠')];
  const slots3 = E.botDrawSlots(st, 'p1');
  scheck('bot keeps a 4-flush and discards 1', slots3.length === 1 && slots3[0] === 4, 'got ' + JSON.stringify(slots3));
  // Bot with nothing keeps the two highest cards.
  st.players[1].hand = [C('A', '♠'), C('K', '♥'), C('2', '♦'), C('7', '♣'), C('9', '♠')];
  const slots4 = E.botDrawSlots(st, 'p1');
  scheck('bot with no pair keeps the two highest, discards 3', slots4.length === 3 && slots4.sort().join(',') === '2,3,4', 'got ' + JSON.stringify(slots4));
  // Bot never discards more than 3.
  for (let s = 0; s < 20; s++) {
    const g = mkBotGame(100 + s);
    for (const p of g.players) {
      const d = E.botDrawSlots(g, p.id);
      if (d.length > 3) { scheck('bot never discards more than 3', false, 'got ' + d.length); break; }
    }
  }
  scheck('bot never discards more than 3 (20 random hands)', true);

  // Betting: bot with four of a kind raises or goes all-in (deterministic rnd).
  const st2 = mkBotGame(41);
  drawAll(st2);
  // After both draws we are in the bet phase; p1 acts first (left of dealer p0).
  st2.players[1].hand = [C('A', '♠'), C('A', '♥'), C('A', '♦'), C('A', '♣'), C('K', '♠')];
  const a2 = E.botChooseAction(st2, 'p1', () => 0.1);
  scheck('bot raises (or all-ins) with four of a kind', a2 && a2.type === 'bet' && a2.amount > st2.currentBet, 'got ' + JSON.stringify(a2));
  // Bot with high card folds to a big bet (deterministic rnd high).
  const st3 = mkBotGame(42);
  drawAll(st3);
  st3.players[1].hand = [C('2', '♠'), C('5', '♥'), C('7', '♦'), C('9', '♣'), C('J', '♠')];
  st3.currentBet = 500; // big bet to call
  const a3 = E.botChooseAction(st3, 'p1', () => 0.9);
  scheck('bot folds a high-card hand to a big bet', a3 && a3.type === 'fold', 'got ' + JSON.stringify(a3));
  // Bot checks when there is nothing to call.
  const st4 = mkBotGame(43);
  drawAll(st4);
  st4.players[1].hand = [C('2', '♠'), C('5', '♥'), C('7', '♦'), C('9', '♣'), C('J', '♠')];
  const a4 = E.botChooseAction(st4, 'p1', () => 0.99);
  scheck('bot checks with nothing to call', a4 && a4.type === 'bet' && a4.amount === 0, 'got ' + JSON.stringify(a4));
  // Bot who just raised never raises again over its own raise.
  const st5 = mkBotGame(44);
  drawAll(st5);
  st5.players[1].hand = [C('A', '♠'), C('A', '♥'), C('A', '♦'), C('A', '♣'), C('K', '♠')];
  st5.lastRaiserId = 'p1';
  st5.currentBet = 100;
  st5.players[1].bet = 100;
  const a5 = E.botChooseAction(st5, 'p1', () => 0.0); // rnd 0 would raise if allowed
  scheck('bot never raises over its own raise', !a5 || a5.type !== 'bet' || a5.amount <= st5.currentBet, 'got ' + JSON.stringify(a5));
}

console.log('\nAnte behaviour:');
{
  scheck('bot proposes the 10 ante when nobody has', E.botProposeAnte() === 10);
  scheck('bot enters a 10 ante', E.botEnterHand(10, 5000) === true);
  scheck('bot enters a 100 ante', E.botEnterHand(100, 5000) === true);
  scheck('bot declines a 500 ante', E.botEnterHand(500, 5000) === false);
  scheck('bot declines a 1000 ante', E.botEnterHand(1000, 5000) === false);
  // Via botChooseAction in a real ante round.
  const st = E.newGame([{ name: 'B0', isBot: true }, { name: 'B1', isBot: true }], 51);
  E.applyAction(st, 'p0', { type: 'startHand' });
  const a0 = E.botChooseAction(st, 'p0');
  scheck('bot proposes 10 through botChooseAction', a0 && a0.type === 'proposeAnte' && a0.amount === 10, 'got ' + JSON.stringify(a0));
  E.applyAction(st, 'p0', a0);
  const a1 = E.botChooseAction(st, 'p1');
  scheck('bot enters a 10 ante through botChooseAction', a1 && a1.type === 'enterHand' && a1.enter === true, 'got ' + JSON.stringify(a1));
  const st2 = E.newGame([{ name: 'B0', isBot: true }, { name: 'B1', isBot: true }], 52);
  E.applyAction(st2, 'p0', { type: 'startHand' });
  E.applyAction(st2, 'p0', { type: 'proposeAnte', amount: 500 });
  const a2 = E.botChooseAction(st2, 'p1');
  scheck('bot declines a 500 ante through botChooseAction', a2 && a2.type === 'enterHand' && a2.enter === false, 'got ' + JSON.stringify(a2));
}

console.log('\nConservative betting:');
{
  // Bot raise sizes are capped: min raise, or twice it (max 100) with quads+.
  const st = mkBotGame(61);
  drawAll(st);
  st.players[1].hand = [C('A', '♠'), C('A', '♥'), C('A', '♦'), C('A', '♣'), C('K', '♠')];
  const a = E.botChooseAction(st, 'p1', () => 0.1);
  scheck('bot raise with quads is a small raise (min raise x2 at most)',
    a && a.type === 'bet' && a.amount > st.currentBet && a.amount - st.currentBet <= 100, 'got ' + JSON.stringify(a));
  // Bot never all-ins with less than trips, except short-stacked.
  const st2 = mkBotGame(62);
  drawAll(st2);
  st2.players[1].hand = [C('K', '♠'), C('K', '♥'), C('Q', '♦'), C('Q', '♣'), C('9', '♠')]; // two pair
  st2.currentBet = 5000; // calling costs the whole stack
  const a2 = E.botChooseAction(st2, 'p1', () => 0.0);
  scheck('bot folds two pair rather than all-in for its stack', a2 && a2.type === 'fold', 'got ' + JSON.stringify(a2));
  const st3 = mkBotGame(63);
  drawAll(st3);
  st3.players[1].hand = [C('K', '♠'), C('K', '♥'), C('K', '♦'), C('7', '♣'), C('9', '♠')]; // trips
  st3.players[1].stack = 400; // short-stacked
  st3.currentBet = 400;
  const a3 = E.botChooseAction(st3, 'p1', () => 0.0);
  scheck('short-stacked bot may all-in with trips', a3 && a3.type === 'bet' && a3.amount === 400, 'got ' + JSON.stringify(a3));
  const st4 = mkBotGame(64);
  drawAll(st4);
  st4.players[1].hand = [C('A', '♠'), C('A', '♥'), C('A', '♦'), C('A', '♣'), C('K', '♠')]; // quads
  st4.currentBet = 5000;
  const a4 = E.botChooseAction(st4, 'p1', () => 0.0);
  scheck('bot may all-in with four of a kind', a4 && a4.type === 'bet' && a4.amount === E.playerById(st4, 'p1').bet + E.playerById(st4, 'p1').stack, 'got ' + JSON.stringify(a4));
  // Weak one pair folds to a large raise.
  const st5 = mkBotGame(65);
  drawAll(st5);
  st5.players[1].hand = [C('8', '♠'), C('8', '♥'), C('A', '♦'), C('K', '♣'), C('3', '♠')]; // one pair
  st5.currentBet = 1000; // > 15% of the ~4990 stack
  const a5 = E.botChooseAction(st5, 'p1', () => 0.0);
  scheck('bot folds one pair to a large raise', a5 && a5.type === 'fold', 'got ' + JSON.stringify(a5));
  // Medium hand (trips) calls more than it raises.
  const st6 = mkBotGame(66);
  drawAll(st6);
  st6.players[1].hand = [C('Q', '♠'), C('Q', '♥'), C('Q', '♦'), C('7', '♣'), C('9', '♠')]; // trips
  st6.currentBet = 100;
  const a6 = E.botChooseAction(st6, 'p1', () => 0.5);
  scheck('bot calls with trips instead of raising', a6 && a6.type === 'bet' && a6.amount === 100, 'got ' + JSON.stringify(a6));
}

console.log(`\nscripted: ${sPass} passed, ${sFail} failed`);
if (sFail) failures += sFail;
process.exit(failures === 0 ? 0 : 1);

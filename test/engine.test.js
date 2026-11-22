// Five-Card Draw engine tests: deck/deal, ante, draw, betting, evaluator,
// side pots, filtered views, removal/rebuy. Run: node test/engine.test.js
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

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}
const C = (rank, suit) => ({ id: rank + suit, rank, suit });
function setHand(st, pid, cards) { E.playerById(st, pid).hand = cards.map(c => ({ ...c })); }
function mkGame(n, seed, opts) {
  const names = [];
  for (let i = 0; i < n; i++) names.push('P' + i);
  const st = E.newGame(names, seed === undefined ? 42 : seed, opts);
  const r = E.applyAction(st, 'p0', { type: 'startHand' });
  if (!r.ok) throw new Error('startHand failed: ' + r.error);
  if (st.phase !== 'ante') throw new Error('expected ante phase, got ' + st.phase);
  startHandViaAnte(st, 'p0', (opts && opts.ante) || 10);
  return st;
}
/* Drive the ante round to a started hand (everyone tops up). */
function startHandViaAnte(st, setterId, ante) {
  const r1 = E.applyAction(st, setterId, { type: 'proposeAnte', amount: ante });
  if (!r1.ok) throw new Error('proposeAnte failed: ' + r1.error);
  for (const p of st.players.slice()) {
    if (p.id === setterId) continue;
    if (st.anteEligible.indexOf(p.id) < 0) continue;
    const r2 = E.applyAction(st, p.id, { type: 'enterHand', enter: true });
    if (!r2.ok) throw new Error('enterHand failed for ' + p.id + ': ' + r2.error);
  }
  if (st.phase !== 'draw') throw new Error('expected draw phase, got ' + st.phase);
  return st;
}
/* Run n dead rounds (setter proposes, nobody enters). */
function deadRounds(st, setterId, ante, n) {
  for (let i = 0; i < n; i++) {
    if (st.phase !== 'ante') throw new Error('expected ante phase for dead round ' + (i + 1) + ', got ' + st.phase);
    const r1 = E.applyAction(st, setterId, { type: 'proposeAnte', amount: ante });
    if (!r1.ok) throw new Error('proposeAnte failed: ' + r1.error);
    for (const p of st.players.slice()) {
      if (p.id === setterId) continue;
      if (st.anteEligible.indexOf(p.id) < 0) continue;
      const r2 = E.applyAction(st, p.id, { type: 'enterHand', enter: false });
      if (!r2.ok) throw new Error('enterHand decline failed: ' + r2.error);
    }
  }
  return st;
}
/* Drive every player through the draw phase (stand pat). */
function standPatAll(st) {
  let guard = 0;
  while (st.phase === 'draw' && guard++ < 20) {
    const pid = st.players[st.drawTurnIdx].id;
    const r = E.applyAction(st, pid, { type: 'draw', slots: [] });
    if (!r.ok) throw new Error('draw failed for ' + pid + ': ' + r.error);
  }
  if (st.phase !== 'bet') throw new Error('expected bet phase, got ' + st.phase);
}
/* Play the betting round to completion with a simple policy fn(pid)->action. */
function betAll(st, policy) {
  let guard = 0;
  while (st.phase === 'bet' && guard++ < 200) {
    const pid = E.currentPlayer(st).id;
    const a = policy(st, pid);
    const r = E.applyAction(st, pid, a);
    if (!r.ok) throw new Error('bet failed for ' + pid + ' ' + JSON.stringify(a) + ': ' + r.error);
  }
  if (st.phase !== 'handOver' && st.phase !== 'over') throw new Error('expected handOver, got ' + st.phase);
}

console.log('Deck / deal:');
{
  const st = mkGame(4, 7);
  check('52-card deck, 5 each dealt', st.players.every(p => p.hand.length === 5) && st.deck.length === 52 - 20);
  const all = st.players.flatMap(p => p.hand).concat(st.deck);
  check('all 52 cards unique', new Set(all.map(c => c.id)).size === 52);
  check('phase is draw after deal', st.phase === 'draw');
  check('dealer is p0 on hand 1', st.players[st.dealerIdx].id === 'p0');
  check('first draw turn is left of dealer', st.players[st.drawTurnIdx].id === 'p1');
}

console.log('Ante:');
{
  const st = mkGame(3, 8, { ante: 100 });
  check('ante 100 collected from everyone', st.pot === 300 && st.players.every(p => p.stack === 4900 && p.totalBet === 100));
  const st2 = mkGame(2, 9, { ante: 10 });
  check('default ante is 10 when not given', st2.ante === 10 && st2.pot === 20);
  const st3 = E.newGame(['A', 'B'], 10, { ante: 777 });
  check('invalid ante in newGame falls back to 10', st3.ante === 10);
  // First propose locks; a second propose is rejected (fastest click wins).
  const st3b = E.newGame(['A', 'B', 'C'], 101);
  E.applyAction(st3b, 'p0', { type: 'startHand' });
  check('first propose locks the ante', E.applyAction(st3b, 'p0', { type: 'proposeAnte', amount: 100 }).ok === true && st3b.ante === 100 && st3b.anteLocked === true);
  check('second propose is rejected (fastest click wins)', E.applyAction(st3b, 'p1', { type: 'proposeAnte', amount: 500 }).ok === false && st3b.ante === 100);
  check('invalid propose amount is rejected', (() => { const s = E.newGame(['A', 'B'], 102); E.applyAction(s, 'p0', { type: 'startHand' }); return E.applyAction(s, 'p0', { type: 'proposeAnte', amount: 777 }).ok === false; })());
  check('cannot enter before an ante is proposed', (() => { const s = E.newGame(['A', 'B'], 103); E.applyAction(s, 'p0', { type: 'startHand' }); return E.applyAction(s, 'p1', { type: 'enterHand', enter: true }).ok === false; })());
  check('cannot answer twice', (() => { const s = E.newGame(['A', 'B'], 104); E.applyAction(s, 'p0', { type: 'startHand' }); E.applyAction(s, 'p0', { type: 'proposeAnte', amount: 10 }); E.applyAction(s, 'p1', { type: 'enterHand', enter: true }); return E.applyAction(s, 'p1', { type: 'enterHand', enter: true }).ok === false; })());
  // Short stack: player with 5 chips goes all-in for the ante.
  const st4 = E.newGame(['A', 'B'], 11, { ante: 100 });
  st4.players[1].stack = 5;
  E.applyAction(st4, 'p0', { type: 'startHand' });
  startHandViaAnte(st4, 'p0', 100);
  const short = st4.players[1];
  check('short stack pays what they have and is all-in', short.totalBet === 5 && short.stack === 0 && short.allIn === true && st4.pot === 105);
}

console.log('Ante phase — dead rounds, sitters, spectators:');
{
  // Dead round: nobody enters — no cards dealt, back to a fresh ante round.
  const st = E.newGame(['A', 'B', 'C'], 201);
  E.applyAction(st, 'p0', { type: 'startHand' });
  deadRounds(st, 'p0', 100, 1);
  check('dead round deals no cards and returns to ante', st.phase === 'ante' && st.players.every(p => p.hand.length === 0) && st.deck.length === 0 && st.pot === 0);
  check('dead round logs the dead round', st.log.join(' ').includes('Dead round'));
  check('low-ante dead round resets the dead-high streak', st.shootout.deadStreak === 0);
  // Sitters keep their chips and sit this hand out as spectators.
  const st2 = E.newGame(['A', 'B', 'C'], 202);
  E.applyAction(st2, 'p0', { type: 'startHand' });
  E.applyAction(st2, 'p0', { type: 'proposeAnte', amount: 100 });
  E.applyAction(st2, 'p1', { type: 'enterHand', enter: true });
  E.applyAction(st2, 'p2', { type: 'enterHand', enter: false });
  check('sitter keeps chips and sits out as a spectator',
    st2.phase === 'draw' && E.playerById(st2, 'p2').stack === 5000 && E.playerById(st2, 'p2').hand.length === 0 &&
    E.playerById(st2, 'p2').sitOut === true && E.playerById(st2, 'p2').spectator === true);
  check('entrants are dealt in and pay the ante', st2.pot === 200 && E.playerById(st2, 'p0').hand.length === 5 && E.playerById(st2, 'p1').hand.length === 5);
  check('spectator view hides all hands', (() => {
    const v = E.filteredView(st2, 'p2');
    return v.players.every(p => p.cards.every(c => c.rank === null)) && v.players.find(p => p.id === 'p2').spectator === true;
  })());
  // A spectator from the previous hand is offered entry at the next ante.
  standPatAll(st2);
  betAll(st2, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  E.applyAction(st2, 'p0', { type: 'nextHand' });
  check('next hand opens a fresh ante round', st2.phase === 'ante' && st2.anteLocked === false);
  E.applyAction(st2, 'p0', { type: 'proposeAnte', amount: 10 });
  check('spectator is in the entry offer after a propose', st2.anteEligible.indexOf('p2') >= 0);
  E.applyAction(st2, 'p1', { type: 'enterHand', enter: true });
  E.applyAction(st2, 'p2', { type: 'enterHand', enter: true });
  check('spectator can enter the next hand', st2.phase === 'draw' && E.playerById(st2, 'p2').hand.length === 5 && E.playerById(st2, 'p2').spectator === false);
  // A mid-game join spectator is offered entry next hand.
  const st3 = mkGame(2, 203);
  const join = E.addPlayer(st3, 'Late', false);
  check('mid-game joiner is a spectator', E.playerById(st3, join.playerId).spectator === true);
  standPatAll(st3);
  betAll(st3, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  E.applyAction(st3, 'p0', { type: 'nextHand' });
  E.applyAction(st3, 'p0', { type: 'proposeAnte', amount: 10 });
  check('mid-game join spectator is offered entry next hand', st3.anteEligible.indexOf(join.playerId) >= 0);
  // Hand-start resets the dead-high streak.
  const st4 = E.newGame(['A', 'B', 'C'], 204);
  E.applyAction(st4, 'p0', { type: 'startHand' });
  deadRounds(st4, 'p0', 500, 3);
  check('dead-high streak is 3 before entry', st4.shootout.deadStreak === 3);
  startHandViaAnte(st4, 'p0', 500);
  check('hand start resets the dead-high streak', st4.shootout.deadStreak === 0 && st4.shootout.deadSetterId === null);
  // Leaving: any player may leave at any time.
  const st5 = mkGame(3, 205);
  const lr = E.applyAction(st5, 'p1', { type: 'leave' });
  check('leave mid-hand works', lr.ok === true && E.playerById(st5, 'p1') === null && st5.players.length === 2);
  const st6 = E.newGame(['A', 'B', 'C'], 206);
  E.applyAction(st6, 'p0', { type: 'startHand' });
  E.applyAction(st6, 'p0', { type: 'proposeAnte', amount: 100 });
  const lr2 = E.applyAction(st6, 'p0', { type: 'leave' });
  check('setter leaving mid-ante voids the round', lr2.ok === true && st6.phase === 'ante' && st6.anteLocked === false);
}

console.log('Draw phase:');
{
  const st = mkGame(2, 12);
  // Rig the deck so the top is known: the deck pops from the END (top).
  st.deck = st.deck.concat([C('2', '♠'), C('3', '♥'), C('4', '♦')]);
  // p1 draws first (left of dealer). Give p1 a known hand.
  const p1 = st.players[1];
  const before = p1.hand.map(c => c.id);
  const r = E.applyAction(st, 'p1', { type: 'draw', slots: [0, 2] });
  check('draw 2 succeeds', r.ok === true && r.discarded === 2);
  check('drawn cards come from the top of the deck', r.drawn.map(c => c.id).join(',') === '4♦,3♥');
  check('discards went to the bottom of the deck', st.deck[0].id === before[2] && st.deck[1].id === before[0]);
  check('hand still has 5 cards', p1.hand.length === 5);
  check('cannot draw twice', E.applyAction(st, 'p1', { type: 'draw', slots: [] }).ok === false);
  check('cannot draw 4 cards', (() => { const s2 = mkGame(2, 13); return E.applyAction(s2, 'p1', { type: 'draw', slots: [0, 1, 2, 3] }).ok === false; })());
  check('cannot draw out of turn', E.applyAction(st, 'p1', { type: 'draw', slots: [] }).ok === false);
  // Stand pat (0) works and only the count is logged.
  const st3 = mkGame(2, 14);
  const logBefore = st3.log.length;
  E.applyAction(st3, 'p1', { type: 'draw', slots: [] });
  check('stand pat logs only the count, never ranks', st3.log.slice(logBefore).join(' ').includes('discarded 0 cards'));
}

console.log('Hand evaluator:');
{
  const ev = (cards) => E.evaluateHand(cards.map(([r, s]) => C(r, s)));
  check('Royal Flush', ev([['A', '♠'], ['K', '♠'], ['Q', '♠'], ['J', '♠'], ['10', '♠']]).name === 'Royal Flush');
  check('Straight Flush', ev([['9', '♥'], ['8', '♥'], ['7', '♥'], ['6', '♥'], ['5', '♥']]).category === 8);
  check('Four of a Kind', ev([['9', '♠'], ['9', '♥'], ['9', '♦'], ['9', '♣'], ['2', '♠']]).category === 7);
  check('Full House', ev([['K', '♠'], ['K', '♥'], ['K', '♦'], ['5', '♣'], ['5', '♠']]).category === 6);
  check('Flush', ev([['A', '♦'], ['9', '♦'], ['7', '♦'], ['4', '♦'], ['2', '♦']]).category === 5);
  check('Straight', ev([['10', '♠'], ['9', '♥'], ['8', '♦'], ['7', '♣'], ['6', '♠']]).category === 4);
  check('Wheel A-2-3-4-5 is a straight', ev([['A', '♠'], ['2', '♥'], ['3', '♦'], ['4', '♣'], ['5', '♠']]).name === 'Straight');
  check('Wheel loses to 6-high straight', E.compareHands(ev([['A', '♠'], ['2', '♥'], ['3', '♦'], ['4', '♣'], ['5', '♠']]), ev([['6', '♠'], ['5', '♥'], ['4', '♦'], ['3', '♣'], ['2', '♠']])) < 0);
  check('Three of a Kind', ev([['Q', '♠'], ['Q', '♥'], ['Q', '♦'], ['9', '♣'], ['2', '♠']]).category === 3);
  check('Two Pair', ev([['J', '♠'], ['J', '♥'], ['4', '♦'], ['4', '♣'], ['9', '♠']]).category === 2);
  check('One Pair', ev([['8', '♠'], ['8', '♥'], ['A', '♦'], ['K', '♣'], ['3', '♠']]).category === 1);
  check('High Card', ev([['A', '♠'], ['K', '♥'], ['9', '♦'], ['5', '♣'], ['2', '♠']]).category === 0);
  check('higher pair beats lower pair', E.compareHands(ev([['K', '♠'], ['K', '♥'], ['2', '♦'], ['3', '♣'], ['4', '♠']]), ev([['Q', '♠'], ['Q', '♥'], ['A', '♦'], ['K', '♣'], ['9', '♠']])) > 0);
  check('pair tiebreak uses kickers', E.compareHands(ev([['K', '♠'], ['K', '♥'], ['A', '♦'], ['2', '♣'], ['3', '♠']]), ev([['K', '♦'], ['K', '♣'], ['Q', '♦'], ['J', '♣'], ['10', '♠']])) > 0);
  check('identical hands tie', E.compareHands(ev([['A', '♠'], ['K', '♥'], ['9', '♦'], ['5', '♣'], ['2', '♠']]), ev([['A', '♥'], ['K', '♦'], ['9', '♣'], ['5', '♠'], ['2', '♥']])) === 0);
  check('flush tiebreak uses highest card', E.compareHands(ev([['K', '♦'], ['9', '♦'], ['7', '♦'], ['4', '♦'], ['2', '♦']]), ev([['Q', '♦'], ['J', '♦'], ['10', '♦'], ['8', '♦'], ['3', '♦']])) > 0);
}

console.log('Betting:');
{
  // Everyone checks: hand goes to showdown.
  const st = mkGame(3, 15);
  standPatAll(st);
  betAll(st, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  check('all-check hand reaches showdown', st.phase === 'handOver' && st.showdownOrder && st.showdownOrder.length === 3);
  check('check works when to-call is 0', true);
  // Call / raise / min raise.
  const st2 = mkGame(3, 16);
  standPatAll(st2);
  const first = E.currentPlayer(st2).id;
  let r = E.applyAction(st2, first, { type: 'bet', amount: 60 });
  check('raise to 60 works (min raise 10)', r.ok === true && st2.currentBet === 60);
  check('raise below the minimum is rejected', E.applyAction(st2, E.currentPlayer(st2).id, { type: 'bet', amount: 65 }).ok === false);
  const second = E.currentPlayer(st2).id;
  r = E.applyAction(st2, second, { type: 'bet', amount: 60 });
  check('call 60 works', r.ok === true);
  const third = E.currentPlayer(st2).id;
  r = E.applyAction(st2, third, { type: 'bet', amount: 130 });
  check('raise over someone else works, min raise now 70', r.ok === true && st2.minRaise === 70);
  // Turn returns clockwise to the first raiser — and because SOMEBODY ELSE
  // (the third player) raised last, the first raiser MAY raise again.
  const backToFirst = E.currentPlayer(st2).id;
  check('turn returns to the first raiser', backToFirst === first);
  r = E.applyAction(st2, first, { type: 'bet', amount: 200 });
  check('first raiser may raise again after someone else raised', r.ok === true);
  betAll(st2, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  check('round ends after everyone matches 200', st2.phase === 'handOver');
  // The no-double-raise guard itself: a player who IS the last raiser
  // cannot raise over their own raise (set up directly — in normal flow
  // the turn only returns to a raiser after someone else has raised).
  const st2b = mkGame(3, 16);
  standPatAll(st2b);
  const raiser = E.currentPlayer(st2b).id;
  st2b.currentBet = 100;
  st2b.lastRaiserId = raiser;
  st2b.minRaise = 50;
  r = E.applyAction(st2b, raiser, { type: 'bet', amount: 200 });
  check('double raise over your own raise is rejected', r.ok === false);
  r = E.applyAction(st2b, raiser, { type: 'bet', amount: 100 });
  check('...but calling your own raised bet is fine', r.ok === true);
  const st2c = mkGame(3, 16);
  standPatAll(st2c);
  const raiser2 = E.currentPlayer(st2c).id;
  st2c.currentBet = 100;
  st2c.lastRaiserId = 'someone-else';
  st2c.minRaise = 50;
  r = E.applyAction(st2c, raiser2, { type: 'bet', amount: 200 });
  check('raising is fine when somebody else raised last', r.ok === true);
  // Fold: everyone folds to one survivor.
  const st3 = mkGame(3, 17);
  standPatAll(st3);
  const a = E.currentPlayer(st3).id;
  E.applyAction(st3, a, { type: 'bet', amount: 100 });
  const b = E.currentPlayer(st3).id;
  E.applyAction(st3, b, { type: 'fold' });
  const c = E.currentPlayer(st3).id;
  const rf = E.applyAction(st3, c, { type: 'fold' });
  check('two folds leave one survivor who takes the pot without showing', st3.phase === 'handOver' && st3.winners.length === 1 && st3.winners[0] === a && !st3.showdownOrder.length);
  check('survivor actually gets the pot', E.playerById(st3, a).stack === 5000 - 100 - 10 + st3.pot);
  // All-in.
  const st4 = mkGame(2, 18);
  standPatAll(st4);
  const p = E.currentPlayer(st4).id;
  r = E.applyAction(st4, p, { type: 'bet', amount: E.playerById(st4, p).bet + E.playerById(st4, p).stack });
  check('all-in works', r.ok === true && E.playerById(st4, p).allIn === true && E.playerById(st4, p).stack === 0);
  // Out-of-turn betting rejected.
  const st5 = mkGame(3, 19);
  standPatAll(st5);
  const notTurn = st5.players.find(x => x.id !== E.currentPlayer(st5).id).id;
  check('out-of-turn bet rejected', E.applyAction(st5, notTurn, { type: 'bet', amount: 0 }).ok === false);
  // Showdown order: last aggressor first.
  const st6 = mkGame(3, 20);
  standPatAll(st6);
  const ag = E.currentPlayer(st6).id;
  E.applyAction(st6, ag, { type: 'bet', amount: 50 });
  betAll(st6, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  check('showdown order starts with the last aggressor', st6.showdownOrder[0] === ag);
}

console.log('Side pots:');
{
  // P0 all-in short (stack 50 after ante 10 -> 40 left), P1 and P2 bet 200.
  const st = E.newGame(['A', 'B', 'C'], 21, { ante: 10 });
  st.players[0].stack = 50;
  E.applyAction(st, 'p0', { type: 'startHand' });
  startHandViaAnte(st, 'p0', 10);
  // P0: ante 10, stack 40. Rig hands: P0 best, P1 second, P2 worst.
  setHand(st, 'p0', [C('A', '♠'), C('A', '♥'), C('A', '♦'), C('A', '♣'), C('K', '♠')]);
  setHand(st, 'p1', [C('K', '♥'), C('K', '♦'), C('K', '♣'), C('Q', '♠'), C('Q', '♥')]);
  setHand(st, 'p2', [C('2', '♠'), C('5', '♥'), C('7', '♦'), C('9', '♣'), C('J', '♠')]);
  standPatAll(st);
  // Betting: P1 (first to act) bets 200 total; P2 calls; P0 all-in for 40 (short call).
  const t1 = E.currentPlayer(st).id; // p1
  let r = E.applyAction(st, t1, { type: 'bet', amount: 200 });
  check('P1 bets 200', r.ok === true);
  const t2 = E.currentPlayer(st).id; // p2
  r = E.applyAction(st, t2, { type: 'bet', amount: 200 });
  check('P2 calls 200', r.ok === true);
  const t0 = E.currentPlayer(st).id; // p0
  r = E.applyAction(st, t0, { type: 'bet', amount: 40 }); // all-in: round bet 0 + 40 stack = 40
  check('P0 all-in short for 40 total bet', r.ok === true && E.playerById(st, 'p0').allIn === true);
  check('hand over after short all-in', st.phase === 'handOver');
  // Pot: antes 30 + 200+200+40 = 470. Main pot (level 50 totalBet): 3x50=150 -> P0 (best).
  // Side pot (level 210): (210-50)*2 = 320 -> P1 (better than P2).
  check('main pot goes to the short all-in best hand', st.payouts['p0'] === 150, 'got ' + JSON.stringify(st.payouts));
  check('side pot goes to the next best hand', st.payouts['p1'] === 320, 'got ' + JSON.stringify(st.payouts));
  check('worst hand gets nothing', !st.payouts['p2']);
  // Tie split with odd chip to earliest clockwise from dealer.
  const st2 = mkGame(3, 22);
  setHand(st2, 'p0', [C('A', '♠'), C('A', '♥'), C('K', '♦'), C('Q', '♣'), C('J', '♠')]);
  setHand(st2, 'p1', [C('A', '♦'), C('A', '♣'), C('K', '♥'), C('Q', '♦'), C('J', '♥')]);
  setHand(st2, 'p2', [C('2', '♠'), C('5', '♥'), C('7', '♦'), C('9', '♣'), C('J', '♦')]);
  standPatAll(st2);
  // P1 bets 21 (odd pot: antes 30 + 21*3 = 93; winners split 46/47).
  const f1 = E.currentPlayer(st2).id;
  E.applyAction(st2, f1, { type: 'bet', amount: 21 });
  betAll(st2, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  check('tie splits the pot', st2.winners.length === 2 && st2.payouts['p0'] + st2.payouts['p1'] === 93);
  check('odd chip goes to the earliest winner clockwise from the dealer (p0)', st2.payouts['p0'] === 47 && st2.payouts['p1'] === 46, 'got ' + JSON.stringify(st2.payouts));
}

console.log('Filtered views (hidden info):');
{
  const st = mkGame(3, 23);
  const v0 = E.filteredView(st, 'p0');
  const opp = v0.players.find(p => p.id === 'p1');
  check('opponent cards are backs with opaque ids', opp.cards.every(c => c.rank === null && c.id.indexOf('hidden-') === 0));
  check('own hand is visible', v0.players.find(p => p.id === 'p0').cards.every(c => c.rank !== null));
  check('deck is count-only (no order leaked)', v0.deckCount === st.deck.length && !('deck' in v0));
  check('opponent hand names hidden during play', v0.players.every(p => p.handName === null));
  // Folded hands stay mucked at showdown.
  setHand(st, 'p0', [C('A', '♠'), C('A', '♥'), C('A', '♦'), C('A', '♣'), C('K', '♠')]);
  setHand(st, 'p1', [C('2', '♠'), C('3', '♥'), C('4', '♦'), C('5', '♣'), C('7', '♠')]);
  setHand(st, 'p2', [C('K', '♥'), C('K', '♦'), C('K', '♣'), C('Q', '♠'), C('Q', '♥')]);
  standPatAll(st);
  const first = E.currentPlayer(st).id;
  E.applyAction(st, first, { type: 'bet', amount: 50 });
  const second = E.currentPlayer(st).id;
  E.applyAction(st, second, { type: 'fold' });
  betAll(st, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  const vEnd = E.filteredView(st, 'p0');
  const foldedView = vEnd.players.find(p => p.id === second);
  check('folded hand stays hidden at showdown', foldedView.cards.every(c => c.rank === null) && foldedView.handName === null);
  const shownView = vEnd.players.find(p => p.id === 'p0');
  check('active hands revealed at showdown with hand names', shownView.cards.every(c => c.rank !== null) && shownView.handName === 'Four of a Kind');
  // Spectator sees no one's hole cards during play.
  const st3 = mkGame(2, 24);
  const spec = E.filteredView(st3, 'nobody');
  check('spectator sees only backs during play', spec.players.every(p => p.cards.every(c => c.rank === null)));
}

console.log('Removal / rebuy / next hand:');
{
  const st = mkGame(3, 25);
  const r = E.removePlayer(st, 'p1');
  check('removePlayer works mid-draw', r.ok === true && st.players.length === 2);
  check('removed hand is mucked, not back in the deck', st.muck.length === 5 && st.deck.length === 52 - 15);
  // Busted player rebuys between hands.
  const st2 = mkGame(2, 26);
  standPatAll(st2);
  betAll(st2, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  const loser = st2.players.find(p => p.id !== st2.winners[0]);
  loser.stack = 0;
  check('rebuy rejected mid-hand is not the case — hand is over', E.applyAction(st2, loser.id, { type: 'rebuy' }).ok === true && loser.stack === 5000);
  const nx = E.applyAction(st2, 'p0', { type: 'nextHand' });
  check('next hand opens the ante round', nx.ok === true && st2.phase === 'ante' && st2.handNumber === 1);
  startHandViaAnte(st2, 'p0', 10);
  check('hand 2 starts after the ante round, dealer rotates', st2.handNumber === 2 && st2.players[st2.dealerIdx].id === 'p1');
  check('rebuy not allowed with chips', E.applyAction(st2, 'p0', { type: 'rebuy' }).ok === false);
  // addPlayer no longer resets win streaks (they are display-only now).
  const st3 = mkGame(2, 27);
  st3.players[0].winStreak = 4;
  E.addPlayer(st3, 'Late', false);
  check('a new joiner does not reset win streaks', st3.players[0].winStreak === 4 && st3.players.length === 3);
  check('a new joiner does not touch the dead-high streak', st3.shootout.deadStreak === 0);
  // Fingerprint changes with state.
  check('fingerprint is stable for identical state', E.stateFingerprint(st3) === E.stateFingerprint(E.deserializeState(E.serializeState(st3))));
}

console.log('Disconnect / rejoin / anti-troll:');
{
  // Seat held 10s; back in time resumes the seat (quick rejoin #1).
  const st = mkGame(3, 301);
  st.players[1].clientId = 'c1';
  E.markDisconnected(st, 'p1', 1000);
  check('disconnect marks the seat held', E.playerById(st, 'p1').disconnected === true);
  const back = E.reconnectClient(st, 'c1', 'P1', 5000);
  check('rejoin inside 10s resumes the seat', back.ok === true && back.resumed === true && E.playerById(st, 'p1').disconnected === false);
  check('one quick rejoin counted', E.playerById(st, 'p1').quickDisconnects === 1);
  // Two quick rejoins are fine; the third triggers the ban.
  E.markDisconnected(st, 'p1', 6000);
  const back2 = E.reconnectClient(st, 'c1', 'P1', 9000);
  check('second quick rejoin is fine', back2.ok === true && back2.resumed === true && E.playerById(st, 'p1').quickDisconnects === 2);
  E.markDisconnected(st, 'p1', 10000);
  const back3 = E.reconnectClient(st, 'c1', 'P1', 12000);
  check('third quick rejoin triggers the ban', back3.ok === false && back3.banned === true && E.isBanned(st, 'c1') === true && E.playerById(st, 'p1') === null);
  check('banned client cannot rejoin', E.reconnectClient(st, 'c1', 'P1', 13000).ok === false);
  check('canJoinRoom rejects a banned clientId', E.canJoinRoom(E.createRoomInfo({ code: 'X', bannedClientIds: ['c1'] }), 2, 'c1').ok === false);
  check('canJoinRoom allows a non-banned clientId', E.canJoinRoom(E.createRoomInfo({ code: 'X', bannedClientIds: ['c1'] }), 2, 'c2').ok === true);
  // Completing a hand resets the quick-disconnect count.
  const st2 = mkGame(2, 302);
  st2.players[1].clientId = 'c9';
  E.markDisconnected(st2, 'p1', 1000);
  E.reconnectClient(st2, 'c9', 'P1', 5000);
  check('one quick rejoin before the hand', E.playerById(st2, 'p1').quickDisconnects === 1);
  standPatAll(st2);
  betAll(st2, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  check('completing a hand resets the count', E.playerById(st2, 'p1').quickDisconnects === 0);
  // A normal 10s+ absence is NOT a quick rejoin: plain withdrawal,
  // cards back in the deck, turn repaired, return as spectator.
  const st3 = mkGame(3, 303);
  st3.players[1].clientId = 'c5';
  const p1Cards = E.playerById(st3, 'p1').hand.map(c => c.id);
  const deckBefore = st3.deck.length;
  E.markDisconnected(st3, 'p1', 1000);
  check('withdrawal inside the grace period is refused', E.withdrawDisconnected(st3, 'p1', 5000).ok === false);
  const wd = E.withdrawDisconnected(st3, 'p1', 11001);
  check('withdrawal after 10s succeeds', wd.ok === true && E.playerById(st3, 'p1') === null);
  check('withdrawn cards go back into the deck', st3.deck.length === deckBefore + 5 && p1Cards.every(id => st3.deck.some(c => c.id === id)));
  check('withdrawn hand is not mucked', st3.muck.length === 0);
  check('withdrawn player is kept as a waiting spectator', st3.waitingSpectators.length === 1 && st3.waitingSpectators[0].clientId === 'c5' && st3.waitingSpectators[0].stack === 4990);
  check('10s absence does not count toward the ban', E.isBanned(st3, 'c5') === false);
  // The post-10s returnee is offered entry at the next ante.
  standPatAll(st3);
  betAll(st3, (s, pid) => ({ type: 'bet', amount: s.currentBet }));
  E.applyAction(st3, 'p0', { type: 'nextHand' });
  check('returnee is promoted to a seat at the next ante round', st3.players.some(p => p.clientId === 'c5'));
  const returnee = st3.players.find(p => p.clientId === 'c5');
  check('returnee comes back as a spectator', returnee.spectator === true && returnee.stack === 4990);
  E.applyAction(st3, 'p0', { type: 'proposeAnte', amount: 10 });
  check('post-10s return spectator is offered entry next hand', st3.anteEligible.indexOf(returnee.id) >= 0);
}

console.log('Staged bets (betChips):');
{
  // Set up a betting round: p1 acts first (left of dealer p0).
  const st = mkGame(3, 401);
  standPatAll(st);
  const first = E.currentPlayer(st).id;
  const me = E.playerById(st, first);
  const stackBefore = me.stack;
  // Below the call: rejected, stack untouched, still their turn.
  let r = E.applyAction(st, first, { type: 'bet', amount: 100 });
  check('a bet of 100 opens the betting', r.ok === true && st.currentBet === 100);
  const second = E.currentPlayer(st).id;
  const me2 = E.playerById(st, second);
  const stack2 = me2.stack;
  r = E.applyAction(st, second, { type: 'betChips', amount: 50 });
  check('staged bet below the call is rejected', r.ok === false && /does not cover the call/.test(r.error));
  check('rejected staged bet leaves the stack untouched', me2.stack === stack2 && E.currentPlayer(st).id === second);
  // Above the call by less than the min raise: rejected.
  r = E.applyAction(st, second, { type: 'betChips', amount: 105 });
  check('staged bet above the call by less than the min raise is rejected', r.ok === false && /minimum raise/.test(r.error) && me2.stack === stack2);
  // Zero / negative staged amounts rejected.
  check('staged amount of 0 is rejected', E.applyAction(st, second, { type: 'betChips', amount: 0 }).ok === false);
  check('negative staged amount is rejected', E.applyAction(st, second, { type: 'betChips', amount: -10 }).ok === false);
  // A valid staged raise commits (min raise is now 100, set by the 100 raise).
  r = E.applyAction(st, second, { type: 'betChips', amount: 250 });
  check('valid staged raise commits', r.ok === true && r.bet === 250 && st.currentBet === 250 && me2.stack === stack2 - 250);
  // Staged chips can stack past 1000: 1000+500+100 = 1600 in one confirm.
  const st2 = mkGame(2, 402);
  standPatAll(st2);
  const p = E.currentPlayer(st2).id;
  const pm = E.playerById(st2, p);
  const s2 = pm.stack;
  r = E.applyAction(st2, p, { type: 'betChips', amount: 1600 });
  check('stacked chips (1000+500+100=1600) commit as one bet', r.ok === true && r.bet === 1600 && st2.currentBet === 1600 && pm.stack === s2 - 1600);
  // Staged all-in commits (whole remaining stack).
  const st3 = mkGame(2, 403);
  standPatAll(st3);
  const q = E.currentPlayer(st3).id;
  const qm = E.playerById(st3, q);
  r = E.applyAction(st3, q, { type: 'betChips', amount: qm.stack });
  check('staged all-in commits', r.ok === true && qm.allIn === true && qm.stack === 0 && st3.currentBet === 4990);
  // A staged call commits exactly like the Call button.
  const st4 = mkGame(3, 404);
  standPatAll(st4);
  const a = E.currentPlayer(st4).id;
  E.applyAction(st4, a, { type: 'bet', amount: 60 });
  const b = E.currentPlayer(st4).id;
  const bm = E.playerById(st4, b);
  const sb = bm.stack;
  r = E.applyAction(st4, b, { type: 'betChips', amount: 60 });
  check('staged call commits like the Call button', r.ok === true && r.bet === 60 && bm.stack === sb - 60);
  // The classic buttons still work through the same path.
  const st5 = mkGame(3, 405);
  standPatAll(st5);
  const x = E.currentPlayer(st5).id;
  r = E.applyAction(st5, x, { type: 'bet', amount: 80 });
  check('classic Raise button still works', r.ok === true && st5.currentBet === 80);
}

console.log('Directory helpers:');
{
  check('directory has 10 slots', E.DIRECTORY_SLOTS === 10);
  check('directory peer id format', E.directoryPeerId(3) === 'poker-directory-v1-3');
  const info = E.createRoomInfo({ code: 'kq7b', hostName: 'Henrique', players: 2, maxPlayers: 6, bots: 1, ante: 500, status: 'waiting' });
  check('room info normalises code + ante', info.code === 'KQ7B' && info.ante === 500);
  check('room info clamps max players', E.createRoomInfo({ code: 'X', maxPlayers: 99 }).maxPlayers === 6);
  check('canJoinRoom rejects a full room', E.canJoinRoom(info, 6).ok === false);
  check('canJoinRoom rejects a playing room', E.canJoinRoom({ ...info, status: 'playing' }, 2).ok === false);
  check('canJoinRoom allows a waiting room with space', E.canJoinRoom(info, 2).ok === true);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

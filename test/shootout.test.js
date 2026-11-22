// Shoot'em Dead (secret rule) — headless engine tests.
// THE ONLY trigger: the same player sets a very large entry ante (500 or
// 1000) five times in a row and NOBODY enters in any of those rounds
// (dead rounds). Win streaks NEVER arm it. The rule is hidden from the
// in-game UI; only the engine + code comments describe it.
// Run: node test/shootout.test.js
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
/* Fresh game in the ante phase (startHand now opens the ante round). */
function newAnteGame(n, seed) {
  const names = [];
  for (let i = 0; i < n; i++) names.push('P' + i);
  const st = E.newGame(names, seed === undefined ? 42 : seed);
  const r = E.applyAction(st, 'p0', { type: 'startHand' });
  if (!r.ok) throw new Error('startHand failed: ' + r.error);
  if (st.phase !== 'ante') throw new Error('expected ante phase, got ' + st.phase);
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
/* Run n dead rounds in a row (setter proposes, nobody enters). */
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
/* A started hand (draw + bet) with everyone standing pat. */
function mkGame(n, seed) {
  const st = newAnteGame(n, seed);
  startHandViaAnte(st, 'p0', 10);
  return st;
}
/* Play one 2-player hand where p1 folds and p0 wins it. */
function playHandP0Wins(st) {
  let guard = 0;
  while (st.phase === 'draw' && guard++ < 10) {
    E.applyAction(st, st.players[st.drawTurnIdx].id, { type: 'draw', slots: [] });
  }
  guard = 0;
  while (st.phase === 'bet' && guard++ < 10) {
    const pid = E.currentPlayer(st).id;
    if (pid === 'p1') E.applyAction(st, pid, { type: 'fold' });
    else E.applyAction(st, pid, { type: 'bet', amount: st.currentBet });
  }
  if (st.phase !== 'handOver') throw new Error('hand did not end, phase=' + st.phase);
  if (st.winners[0] !== 'p0') throw new Error('hand was not won by p0: ' + JSON.stringify(st.winners));
}

console.log('Trigger — dead high-ante rounds only:');
{
  const st = newAnteGame(3, 1);
  deadRounds(st, 'p0', 500, 4);
  check('4 dead high rounds do NOT arm', st.shootout.armed === false && st.shootout.deadStreak === 4);
  deadRounds(st, 'p0', 500, 1);
  check('5th dead high round arms', st.shootout.armed === true && st.shootout.deadStreak === 5);
  check('victim is the dead-round setter', st.shootout.victimId === 'p0');
  check('no shots yet, no window yet', Object.keys(st.shootout.shots).length === 0 && st.shootout.windowEndsAt === null);
  // Low-ante dead rounds do not count, and reset a running streak.
  const st2 = newAnteGame(3, 2);
  deadRounds(st2, 'p0', 500, 3);
  check('3 dead high rounds count', st2.shootout.deadStreak === 3);
  deadRounds(st2, 'p0', 10, 1);
  check('a low-ante dead round resets the streak', st2.shootout.deadStreak === 0 && st2.shootout.armed === false);
  const st2b = newAnteGame(3, 21);
  deadRounds(st2b, 'p0', 10, 5);
  check('five low-ante dead rounds never arm', st2b.shootout.armed === false && st2b.shootout.deadStreak === 0);
  // A different setter resets the count (their own first dead-high round).
  const st3 = newAnteGame(3, 3);
  deadRounds(st3, 'p0', 500, 3);
  deadRounds(st3, 'p1', 500, 1);
  check('a different setter resets the count to 1', st3.shootout.deadStreak === 1 && st3.shootout.deadSetterId === 'p1' && st3.shootout.armed === false);
  // A 1000 ante counts as "very large" too.
  const st3b = newAnteGame(3, 31);
  deadRounds(st3b, 'p0', 1000, 5);
  check('five dead 1000-ante rounds arm', st3b.shootout.armed === true && st3b.shootout.victimId === 'p0');
  // Someone entering resets the streak and disarms.
  const st4 = newAnteGame(3, 4);
  deadRounds(st4, 'p0', 500, 5);
  check('armed before entry', st4.shootout.armed === true);
  startHandViaAnte(st4, 'p0', 500);
  check('someone entering starts a hand and disarms', st4.phase === 'draw' && st4.shootout.armed === false && st4.shootout.deadStreak === 0);
  // Win streaks NEVER arm — p0 wins 5 hands in a row through real play.
  const st5 = mkGame(2, 5);
  for (let h = 0; h < 5; h++) {
    if (h > 0) {
      E.applyAction(st5, 'p0', { type: 'nextHand' });
      startHandViaAnte(st5, 'p0', 10);
    }
    playHandP0Wins(st5);
  }
  check('5 consecutive hand wins do NOT arm', st5.shootout.armed === false && st5.shootout.deadStreak === 0);
  check('win streak really is 5 (counter kept, disconnected from the rule)', E.playerById(st5, 'p0').winStreak === 5);
  // The setter leaving kills the streak.
  const st6 = newAnteGame(3, 6);
  deadRounds(st6, 'p0', 500, 3);
  E.removePlayer(st6, 'p0');
  check('setter leaving resets the streak', st6.shootout.deadStreak === 0 && st6.shootout.deadSetterId === null);
}

console.log('Firing:');
{
  const st = newAnteGame(3, 7);
  check('cannot shoot when nothing is armed', E.fireShot(st, 'p1', 1000).ok === false);
  deadRounds(st, 'p0', 500, 5);
  check('armed after 5 dead high rounds', st.shootout.armed === true);
  check('victim cannot shoot themselves', E.fireShot(st, 'p0', 1000).ok === false);
  const r1 = E.fireShot(st, 'p1', 1000);
  check('first shot opens the 2s window', r1.ok === true && r1.windowEndsAt === 3000 && r1.shotsFired === 1);
  const r2 = E.fireShot(st, 'p2', 2500);
  check('second shooter fires inside the window', r2.ok === true && r2.shotsFired === 1);
  check('shot inside the window after the first still counts', E.fireShot(st, 'p1', 2900).ok === true);
  check('shot after the window closes pays nothing', E.fireShot(st, 'p2', 3001).ok === false);
  // 6-bullet cap.
  const st2 = newAnteGame(3, 8);
  deadRounds(st2, 'p0', 500, 5);
  let okCount = 0;
  for (let i = 0; i < 7; i++) { if (E.fireShot(st2, 'p1', 1000 + i * 100).ok) okCount++; }
  check('revolver holds exactly 6 bullets per player per episode', okCount === 6 && st2.shootout.shots['p1'] === 6);
  // Bots never shoot.
  const st3 = newAnteGame(3, 9);
  st3.players[1].isBot = true;
  deadRounds(st3, 'p0', 500, 5);
  check('bots never shoot', E.fireShot(st3, 'p1', 1000).ok === false);
  // Unknown / spectator shooters cannot fire.
  check('unknown player cannot shoot', E.fireShot(st, 'nobody', 1200).ok === false);
}

console.log('Resolution + split:');
{
  // Single shooter gets it all (dead rounds pay no ante: victim stack 5000).
  const st = newAnteGame(3, 10);
  deadRounds(st, 'p0', 500, 5);
  E.fireShot(st, 'p1', 1000);
  const res = E.resolveShootout(st, 3000);
  check('single shooter resolves', res.ok === true && res.resolved === true);
  check('single shooter gets the whole stack', res.split['p1'] === 5000 && E.playerById(st, 'p1').stack === 5000 + 5000);
  check('victim is removed from the table', E.playerById(st, 'p0') === null && st.players.length === 2);
  check('streak reset + button clears after resolution', st.shootout.armed === false && st.shootout.victimId === null && st.shootout.deadStreak === 0);
  // Multiple shooters split equally.
  const st2 = newAnteGame(3, 11);
  deadRounds(st2, 'p0', 500, 5);
  E.fireShot(st2, 'p1', 1000);
  E.fireShot(st2, 'p2', 1100);
  const res2 = E.resolveShootout(st2, 3000);
  check('two shooters split equally', res2.split['p1'] === 2500 && res2.split['p2'] === 2500, 'got ' + JSON.stringify(res2.split));
  // Remainder: 3 shooters, 5000 stack -> 1666 each + 2 odd chips to the
  // earliest shooters clockwise from the dealer (p1, p2).
  const st3 = newAnteGame(4, 12);
  deadRounds(st3, 'p0', 500, 5);
  E.fireShot(st3, 'p1', 1000);
  E.fireShot(st3, 'p2', 1100);
  E.fireShot(st3, 'p3', 1200);
  const res3 = E.resolveShootout(st3, 3000);
  check('odd chips go to the earliest shooters clockwise from the dealer',
    res3.split['p1'] === 1667 && res3.split['p2'] === 1667 && res3.split['p3'] === 1666, 'got ' + JSON.stringify(res3.split));
  check('split totals the victim stack', res3.split['p1'] + res3.split['p2'] + res3.split['p3'] === 5000);
  // Bets already in the pot STAY in the pot (only the stack is split):
  // play a hand first so a pot exists, then arm in the next ante round.
  const st4 = mkGame(3, 13);
  let gd = 0;
  while (st4.phase === 'draw' && gd++ < 10) {
    E.applyAction(st4, st4.players[st4.drawTurnIdx].id, { type: 'draw', slots: [] });
  }
  E.applyAction(st4, E.currentPlayer(st4).id, { type: 'bet', amount: 0 }); // p1 checks
  E.applyAction(st4, E.currentPlayer(st4).id, { type: 'bet', amount: 0 }); // p2 checks
  E.applyAction(st4, E.currentPlayer(st4).id, { type: 'bet', amount: 100 }); // p0 bets 100
  E.applyAction(st4, E.currentPlayer(st4).id, { type: 'bet', amount: 100 }); // p1 calls
  E.applyAction(st4, E.currentPlayer(st4).id, { type: 'bet', amount: 100 }); // p2 calls
  if (st4.phase !== 'handOver') throw new Error('st4 hand did not end, phase=' + st4.phase);
  const potBefore = st4.pot;
  E.applyAction(st4, 'p0', { type: 'nextHand' });
  deadRounds(st4, 'p0', 500, 5);
  const victimStackBefore = E.playerById(st4, 'p0').stack;
  E.fireShot(st4, 'p1', 1000);
  const res4 = E.resolveShootout(st4, 3000);
  check('pot is untouched by the shootout', st4.pot === potBefore);
  check('only the remaining stack is split', res4.stack === victimStackBefore && res4.split['p1'] === victimStackBefore);
  // No shots: episode fizzles, streak spent, nobody paid, victim stays.
  const st5 = newAnteGame(3, 14);
  deadRounds(st5, 'p0', 500, 5);
  const res5 = E.resolveShootout(st5, 5000);
  check('no shots = no payout, streak spent, victim stays',
    res5.ok === true && res5.resolved === false && E.playerById(st5, 'p0') !== null && st5.shootout.armed === false && st5.shootout.deadStreak === 0);
  // Victim leaves on their own before the window ends: cancel, no payout.
  const st6 = newAnteGame(3, 15);
  deadRounds(st6, 'p0', 500, 5);
  E.fireShot(st6, 'p1', 1000);
  const p1StackBefore = E.playerById(st6, 'p1').stack;
  const p2StackBefore = E.playerById(st6, 'p2').stack;
  E.removePlayer(st6, 'p0');
  check('victim leaving cancels the shootout with no payout',
    st6.shootout.armed === false && E.playerById(st6, 'p1').stack === p1StackBefore && E.playerById(st6, 'p2').stack === p2StackBefore && st6.players.length === 2);
  // Victim is a bot: same removal + split.
  const st7 = newAnteGame(3, 16);
  st7.players[0].isBot = true;
  deadRounds(st7, 'p0', 500, 5);
  E.fireShot(st7, 'p1', 1000);
  const res7 = E.resolveShootout(st7, 3000);
  check('bot victim is removed and split the same way', res7.resolved === true && E.playerById(st7, 'p0') === null && res7.split['p1'] === 5000);
}

console.log('Removal + views:');
{
  // Armed in the ante phase; after resolution the table can start a hand
  // with the remaining players.
  const st = newAnteGame(3, 17);
  deadRounds(st, 'p0', 500, 5);
  E.fireShot(st, 'p1', 1000);
  E.fireShot(st, 'p2', 1100);
  const res = E.resolveShootout(st, 3000);
  check('resolution succeeds in the ante phase', res.ok === true);
  check('phase is still ante after resolution', st.phase === 'ante');
  check('victim is gone', E.playerById(st, 'p0') === null && st.players.length === 2);
  startHandViaAnte(st, 'p1', 10);
  check('remaining players can start a hand', st.phase === 'draw' && st.players.every(p => p.hand.length === 5));
  // Filtered views: only other HUMAN players see the button state.
  const st2 = newAnteGame(3, 18);
  st2.players[2].isBot = true;
  deadRounds(st2, 'p0', 500, 5);
  E.fireShot(st2, 'p1', 1000);
  const vShooter = E.filteredView(st2, 'p1');
  const vVictim = E.filteredView(st2, 'p0');
  const vBot = E.filteredView(st2, 'p2');
  check('other human players can shoot', vShooter.shootout.armed === true && vShooter.shootout.canShoot === true && vShooter.shootout.shotsFired === 1);
  check('victim cannot shoot', vVictim.shootout.canShoot === false);
  check('bots never see the button', vBot.shootout.canShoot === false);
  check('victim identity is visible to the table', vShooter.shootout.victimId === 'p0');
}

console.log('Hidden from the UI:');
{
  // The secret rule must never appear in the visible in-game text. The
  // only place "Shoot'em Dead" may appear in the rendered page is the
  // button itself (which starts hidden); the CSS comment and the engine
  // comments don't count — strip <style> and <script> first.
  const stripped = html.replace(/<style>[\s\S]*?<\/style>/g, '').replace(/<script>[\s\S]*?<\/script>/g, '');
  const mentions = (stripped.match(/Shoot'em Dead/g) || []).length;
  check('the phrase appears exactly once in the visible page (the hidden button)', mentions === 1, 'found ' + mentions);
  check('the shoot button starts hidden', /id="shootBtn"[^>]*class="hidden"/.test(html));
  const uiSrc = blocks.find(s => s.includes('WHISKEY'));
  const rulesJs = (uiSrc.match(/function rulesHtml\(\)\{[\s\S]*?\n\}/) || [''])[0];
  check('no shootout mention in the rules text', !/shoot/i.test(rulesJs));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

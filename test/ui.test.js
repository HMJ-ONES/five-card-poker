// Five-Card Draw UI smoke test (jsdom, no browser needed).
// Drives a real local game through the DOM: ante modal propose/enter, draw,
// staged chip betting (stage 1000+500+100, take one back, Bet Ready),
// dead-round note, leave + banned screens exist.
// Run: node test/ui.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

(async () => {
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const $ = id => window.document.getElementById(id);
  const ev = src => window.eval(src);
  await new Promise(r => { if (window.document.readyState === 'complete') r(); else window.addEventListener('load', r); });

  /* ---- static checks: every new panel/button exists ---- */
  check('ante panel exists', !!$('anteBox'));
  check('ante is a modal pop-up in front of the table', $('anteBox').classList.contains('modal'));
  check('modal Leave button exists inside the ante modal', !!$('btnLeaveMatchAnte') && $('anteBox').contains($('btnLeaveMatchAnte')));
  check('shoot button sits above the ante modal (z 80 > 50)', /#shootBtn\{[^}]*z-index:\s*80/.test(html) && /\.modal\{[^}]*z-index:\s*50/.test(html));
  check('ante modal has no dismiss X', !$('anteBox').querySelector('.modal-x'));
  check('ante propose container exists', !!$('antePropose'));
  check('ante enter container exists', !!$('anteEnter'));
  check('staging tray exists', !!$('stageBox'));
  check('staged total label exists', !!$('stageTotal'));
  check('staged chips container exists', !!$('stageChips'));
  check('Bet Ready button exists', !!$('btnBetReady'));
  check('stage clear button exists', !!$('btnStageClear'));
  check('Leave match button exists', !!$('btnLeaveMatch'));
  check('banned modal exists', !!$('bannedModal'));
  check('pot drop target exists', !!$('potDrop'));
  check('chip rack has 4 chips', window.document.querySelectorAll('.chip[data-chip]').length === 4);

  /* ---- visible page mentions the secret rule exactly once (the hidden button) ---- */
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  check('shootout phrase appears once in visible page', (visible.match(/Shoot'em Dead/g) || []).length === 1,
    'found ' + ((visible.match(/Shoot'em Dead/g) || []).length));
  const rulesText = ($('rulesBody') ? $('rulesBody').textContent : '') + ' ' +
    (window.document.querySelector('#menuScreen .rules') ? window.document.querySelector('#menuScreen .rules').textContent : '');
  check('no shootout mention in the rules text', !/shoot/i.test(rulesText));

  /* ---- scenario 1: a full hand through the DOM ---- */
  window.eval(`startLocalGame([{name:'Test',isBot:false},{name:'Bot',isBot:true}], 42, {ante:10})`);
  check('game screen shows', !$('gameScreen').classList.contains('hidden'));
  check('ante panel shows in ante phase', !$('anteBox').classList.contains('hidden'));
  check('phase is ante', ev(`view.phase`) === 'ante');
  const proposeBtns = window.document.querySelectorAll('#antePropose button');
  check('4 propose buttons offered', proposeBtns.length === 4);
  // Fastest click wins: propose 100.
  [...proposeBtns].find(b => b.textContent.trim() === '100 chips').click();
  check('ante locks at 100', ev(`view.anteLocked`) === true && ev(`view.ante`) === 100);
  check('setter is me', ev(`view.anteSetterId`) === ev(`myId`));
  // Bot answers entry on its own (driven directly here, not via its timer).
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`);
  ev(`refreshView(); render();`);
  check('hand starts after bot tops up', ev(`view.phase`) === 'draw');
  check('I was dealt 5 cards', ev(`view.players.find(p=>p.id===myId).cards.length`) === 5);
  // Deal animation ran (jsdom has no layout, so flights are no-ops — but the
  // trigger must not throw and the hand must still be intact).
  check('deal animation trigger is safe', ev(`lastDealtHand`) === 1);

  // Bot draws first (dealer is me, so left of dealer draws first).
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`);
  ev(`refreshView(); render();`);
  check('bot drew, now my draw turn', ev(`view.drawPlayerId`) === ev(`myId`));
  // Stand pat via the real button.
  $('btnStandPat').click();
  check('draw done, betting opens', ev(`view.phase`) === 'bet');
  // Bot acts first in betting: drive it directly.
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`);
  ev(`refreshView(); render();`);
  check('my bet turn', ev(`view.turnPlayerId`) === ev(`myId`));
  check('bet box shows', !$('betBox').classList.contains('hidden'));
  check('staging tray shows on my bet turn', !$('stageBox').classList.contains('hidden'));

  // Stage 1000 + 500 + 100 = 1600 (more than 1000 — the old one-chip cap is gone).
  ev(`stageChip(1000); stageChip(500); stageChip(100);`);
  check('staged total is 1600', ev(`stageTotal()`) === 1600);
  check('staged total label reads 1600', $('stageTotal').textContent === '1600');
  check('three staged chips shown', window.document.querySelectorAll('#stageChips .chip').length === 3);
  check('effect says raise', /Raise to/.test($('stageEffect').textContent), $('stageEffect').textContent);
  // Click a staged chip to take it back (the 1000).
  window.document.querySelector('#stageChips .chip').click();
  check('taking a staged chip back leaves 600', ev(`stageTotal()`) === 600);
  check('staged chips drop to 2', window.document.querySelectorAll('#stageChips .chip').length === 2);
  // Bet Ready commits the staged 600.
  const betBefore = ev(`view.players.find(p=>p.id===myId).bet`);
  $('btnBetReady').click();
  const betAfter = ev(`view.players.find(p=>p.id===myId).bet`);
  check('Bet Ready commits staged chips', betAfter === betBefore + 600, 'bet ' + betBefore + ' -> ' + betAfter);
  check('staging tray clears after commit', ev(`staged.length`) === 0);
  check('staging tray hides once my turn passes', $('stageBox').classList.contains('hidden'));

  /* ---- scenario 2: dead round panel (high ante, nobody enters) ---- */
  window.eval(`startLocalGame([{name:'Test',isBot:false},{name:'Bot',isBot:true}], 43, {ante:10})`);
  [...window.document.querySelectorAll('#antePropose button')].find(b => b.textContent.trim() === '500 chips').click();
  check('high ante locks at 500', ev(`view.ante`) === 500);
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`); // bot declines 500+
  ev(`refreshView(); render();`);
  check('dead round reopens the ante round', ev(`view.phase`) === 'ante' && ev(`view.anteLocked`) === false);
  check('dead-round note shows', !$('anteDeadNote').classList.contains('hidden') && /Dead round/.test($('anteDeadNote').textContent));
  check('dead-high streak is 1', ev(`fullState.shootout.deadStreak`) === 1);

  /* ---- scenario 3: Shoot'em Dead — one player mashes the button 6 times ----
     The engine always allowed 6 bullets, but in practice rapid taps never
     landed: render() rebuilt the button's innerHTML on every shot (the tap
     target vanished mid-mash) and the full-page shake dragged the fixed
     button around under the finger. Both are fixed: static button children
     updated in place, touch-action:manipulation, shake scoped to the table. */
  window.eval(`startLocalGame([{name:'Test',isBot:false},{name:'Bot1',isBot:true},{name:'Bot2',isBot:true}], 44, {ante:10})`);
  check('shoot button has touch-action manipulation for rapid taps', /#shootBtn\{[^}]*touch-action:\s*manipulation/.test(html));
  check('render never rebuilds the shoot button innerHTML', !/\$\('shootBtn'\)\.innerHTML/.test(html));
  check('gunshot shakes the table, not the body', /\.table-wrap\.shake\{/.test(html) && !/body\.shake/.test(html));
  check('shoot button has static children (count + 6 chambers)', !!$('shootCount') && window.document.querySelectorAll('#shootChambers span').length === 6);
  // Arm it: bot p1 sets a 500 ante three dead rounds in a row; I decline each time.
  for (let r = 0; r < 3; r++) {
    ev(`applyAction(fullState, 'p1', {type:'proposeAnte', amount:500})`);
    ev(`applyAction(fullState, myId, {type:'enterHand', enter:false})`);
    ev(`applyAction(fullState, 'p2', botChooseAction(fullState, 'p2'))`); // bot declines 500+
    ev(`refreshView(); render();`);
  }
  check('shootout armed after 3 dead high rounds (not 5)', ev(`fullState.shootout.armed`) === true && ev(`fullState.shootout.victimId`) === 'p1');
  check('shoot button shows for me (not the victim)', !$('shootBtn').classList.contains('hidden') && ev(`view.shootout.canShoot`) === true);
  // The button and its children are stable nodes across re-renders.
  const btnBefore = $('shootBtn');
  const dotBefore = window.document.querySelector('#shootChambers span');
  ev(`refreshView(); render();`);
  check('shoot button node is stable across re-renders', $('shootBtn') === btnBefore);
  check('chamber dots are the same nodes after a re-render', window.document.querySelector('#shootChambers span') === dotBefore);
  // Mash it: 6 rapid real clicks through the DOM handler.
  for (let i = 0; i < 6; i++) $('shootBtn').click();
  check('all 6 rapid clicks land', ev(`fullState.shootout.shots[myId]`) === 6 && ev(`view.shootout.shotsFired`) === 6, 'shots=' + ev(`fullState.shootout.shots[myId]`));
  check('button shows 0 bullets left and disables at 6', $('shootBtn').disabled === true && /0 bullets left/.test($('shootCount').textContent));
  check('all 6 chamber dots are spent', window.document.querySelectorAll('#shootChambers span.spent').length === 6);
  $('shootBtn').click();
  check('a 7th click fires nothing (button disabled at 6)', ev(`fullState.shootout.shots[myId]`) === 6);
  // The real 2s host timer resolves the episode: victim kicked, I take it all.
  const stackBefore = ev(`view.players.find(p=>p.id===myId).stack`);
  await new Promise(r => setTimeout(r, 2200));
  check('victim is kicked after the window closes', ev(`fullState.shootout.armed`) === false && ev(`playerById(fullState, 'p1')`) === null);
  check('lone shooter takes the whole victim stack', ev(`view.players.find(p=>p.id===myId).stack`) === stackBefore + 5000, 'stack=' + ev(`view.players.find(p=>p.id===myId).stack`));
  check('shoot button hides after resolution', $('shootBtn').classList.contains('hidden'));

  /* ---- scenario 4: guest path — presses are fire-and-forget, none dropped ----
     A guest sends each press straight to the host and never waits for an ack;
     the host applies each action the moment it arrives (verified by reading
     the host's msg.t==='action' handler: no queue, no dedupe, no throttle). */
  window.eval(`startLocalGame([{name:'Test',isBot:false},{name:'Bot1',isBot:true},{name:'Bot2',isBot:true}], 45, {ante:10})`);
  for (let r = 0; r < 3; r++) {
    ev(`applyAction(fullState, 'p1', {type:'proposeAnte', amount:500})`);
    ev(`applyAction(fullState, myId, {type:'enterHand', enter:false})`);
    ev(`applyAction(fullState, 'p2', botChooseAction(fullState, 'p2'))`);
    ev(`refreshView(); render();`);
  }
  check('guest scenario: shootout armed', ev(`fullState.shootout.armed`) === true);
  // Flip this client to guest: capture every outbound message instead of PeerJS.
  window.__sent = [];
  ev(`playMode='online'; isHost=false; conn={open:true, send:(o)=>{ window.__sent.push(o); }};`);
  for (let i = 0; i < 6; i++) $('shootBtn').click();
  const shotSends = window.__sent.filter(m => m.t === 'action' && m.action && m.action.type === 'shoot');
  check('guest sends all 6 presses immediately (no ack-waiting)', shotSends.length === 6, 'sent ' + shotSends.length);
  // Simulate the host applying them in order, exactly as its handler does.
  ev(`for (const m of window.__sent.filter(m=>m.t==='action')) { applyAction(fullState, myId, m.action); }`);
  ev(`refreshView(); render();`);
  check('host lands all 6 guest shots', ev(`fullState.shootout.shots[myId]`) === 6);
  const res4 = ev(`resolveShootout(fullState, Date.now())`);
  ev(`refreshView(); render();`);
  check('guest shots resolve: victim kicked, lone shooter takes all',
    res4.resolved === true && ev(`playerById(fullState, 'p1')`) === null && ev(`view.players.find(p=>p.id===myId).stack`) === 10000);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('UI TEST CRASHED:', e); process.exit(1); });

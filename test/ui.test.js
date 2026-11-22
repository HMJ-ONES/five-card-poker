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

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('UI TEST CRASHED:', e); process.exit(1); });

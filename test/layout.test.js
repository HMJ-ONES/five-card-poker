// Five-Card Draw layout tests: landscape-phone (compact) mode.
// The Nov 22 phone screenshot showed the desktop round table overflowing
// a sideways phone: fixed 560px wrap, chips + staging tray overlapping
// the hand, the 5th card cut off, a horizontal scrollbar. These checks
// prove the compact mode exists and is sized to fit — jsdom has no real
// layout, so the fit checks assert on the stylesheet rules + the pure
// layout functions, and the class switch is driven for real in jsdom.
// Run: node test/layout.test.js
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [null, ''])[1];
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

/* ---- pure layout functions ---- */
check('layoutModeFor is exported', typeof E.layoutModeFor === 'function');
check('seatPositionsFor is exported', typeof E.seatPositionsFor === 'function');
const M = E.layoutModeFor;
check('844x390 phone landscape is compact', M(844, 390) === 'compact');
check('932x430 phone landscape is compact', M(932, 430) === 'compact');
check('667x375 small phone landscape is compact', M(667, 375) === 'compact');
check('700x500 short landscape is compact', M(700, 500) === 'compact');
check('1280x800 desktop landscape stays round', M(1280, 800) === 'round');
check('1024x768 landscape stays round', M(1024, 768) === 'round');
check('800x600 landscape stays round', M(800, 600) === 'round');
check('390x844 portrait is stacked', M(390, 844) === 'stacked');
check('500x500 square is stacked', M(500, 500) === 'stacked');
check('844x390 is compact, not round (short beats wide)', M(844, 390) === 'compact' && M(844, 390) !== 'round');
for (const n of [2, 3, 4, 5, 6]) {
  const spots = E.seatPositionsFor(n, 50, 50, 36, 38);
  const onEllipse = spots.every(p => Math.abs(((p.x - 50) / 36) ** 2 + ((p.y - 50) / 38) ** 2 - 1) < 1e-9);
  const distinct = new Set(spots.map(p => p.x.toFixed(3) + ',' + p.y.toFixed(3))).size === n;
  const inBounds = spots.every(p => p.x >= 14 && p.x <= 86 && p.y >= 12 && p.y <= 88);
  check('seatPositionsFor(' + n + ') on ellipse', onEllipse);
  check('seatPositionsFor(' + n + ') distinct', distinct);
  check('seatPositionsFor(' + n + ') in bounds', inBounds);
}
check('first seat (rel 0) sits at the bottom of the ellipse',
  E.seatPositionsFor(4, 50, 50, 36, 38)[0].y === 88);

/* ---- the compact media query + rules exist ---- */
const mqIdx = style.indexOf('@media (orientation: landscape) and (max-height: 560px)');
check('landscape short-height media query present', mqIdx >= 0);
// Extract the whole media block by brace counting.
function extractBlock(from) {
  let depth = 0, started = false;
  for (let i = from; i < style.length; i++) {
    if (style[i] === '{') { depth++; started = true; }
    else if (style[i] === '}') { depth--; if (started && depth === 0) return style.slice(from, i + 1); }
  }
  return '';
}
const compactCss = mqIdx >= 0 ? extractBlock(mqIdx) : '';
check('compact block extracted', compactCss.length > 500, 'len ' + compactCss.length);
check('compact mode is keyed on body.landscape-compact', /body\.landscape-compact/.test(compactCss));
check('compact table-wrap fills the viewport height (100dvh)', /100dvh/.test(compactCss));
check('compact table-wrap hides horizontal overflow', /overflow-x:\s*hidden/.test(compactCss));
check('compact rules contain no absolute positioning (the overlap cause)',
  !/position:\s*absolute/.test(compactCss));
check('compact rules contain no fixed 560px height (the cutoff cause)',
  !/(?<!max-)height:\s*560px/.test(compactCss));
check('compact chip rack is in flow, not at top:68%',
  /#chipRack\{[^}]*\}/.test(compactCss) && !/#chipRack\{[^}]*top:\s*68%/.test(compactCss));
check('compact staging tray is in flow (display:flex, no top/left)',
  /#stageBox\{[^}]*display:\s*flex/.test(compactCss) && !/#stageBox\{[^}]*top:/.test(compactCss));
check('compact modal still fits sideways (max-height 92vh)', /max-height:\s*92vh/.test(compactCss));
check('portrait card size untouched (64px)', /\.card-big\{[^}]*width:\s*64px/.test(style));
check('desktop round table 560px rule untouched', /body\.round-table \.table-wrap\{[^}]*height:\s*560px/.test(style));

/* ---- fit arithmetic from the compact clamp values ---- */
function clampAt(str, vw) { // str like "clamp(44px,6vw,52px)" -> px at viewport width vw
  const m = str.match(/clamp\(\s*([\d.]+)px\s*,\s*([\d.]+)vw\s*,\s*([\d.]+)px\s*\)/);
  if (!m) return null;
  return Math.min(+m[3], Math.max(+m[1], vw * (+m[2]) / 100));
}
const myCardW = (compactCss.match(/#mySeat \.card-big\{[^}]*width:\s*(clamp\([^)]*\))/) || [])[1];
const miniW = (compactCss.match(/\.mini-card\{[^}]*width:\s*(clamp\([^)]*\))/) || [])[1];
check('compact my-card width is a clamp', !!myCardW, myCardW);
check('compact opponent mini width is a clamp', !!miniW, miniW);
if (myCardW && miniW) {
  for (const vw of [667, 844, 932]) {
    const cw = clampAt(myCardW, vw);
    const handW = 5 * cw + 4 * 3; // 5 cards, 3px gaps
    check('my hand fits at ' + vw + 'px wide (' + handW.toFixed(0) + 'px)', handW < vw,
      'card ' + cw.toFixed(1) + 'px');
    const mw = clampAt(miniW, vw);
    const seatW = 5 * mw + 4 * 3 + 12; // 5 minis, 3px gaps, 6px seat padding each side
    const rowW = 5 * seatW + 4 * 6; // 5 opponent seats, 6px gaps
    check('5 opponent seats fit at ' + vw + 'px wide (' + rowW.toFixed(0) + 'px)', rowW < vw,
      'mini ' + mw.toFixed(1) + 'px');
  }
  check('compact my cards are smaller than portrait (64px)',
    clampAt(myCardW, 844) < 64);
  check('compact minis are smaller than portrait (34px)',
    clampAt(miniW, 844) < 34);
}
const chipW = (compactCss.match(/#chipRack \.chip\{[^}]*width:\s*([\d.]+)px/) || [])[1];
check('compact chips are smaller than portrait (56px)', chipW && +chipW < 56, chipW);

/* ---- class switch + staging shrink, driven for real in jsdom ---- */
(async () => {
  const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true });
  const { window } = dom;
  const $ = id => window.document.getElementById(id);
  const ev = src => window.eval(src);
  await new Promise(r => { if (window.document.readyState === 'complete') r(); else window.addEventListener('load', r); });
  function setViewport(w, h) {
    Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
    ev('applyLayoutMode()');
  }
  setViewport(844, 390);
  check('844x390 adds landscape-compact, not round-table',
    window.document.body.classList.contains('landscape-compact') &&
    !window.document.body.classList.contains('round-table'));
  setViewport(1280, 800);
  check('1280x800 adds round-table, not landscape-compact',
    window.document.body.classList.contains('round-table') &&
    !window.document.body.classList.contains('landscape-compact'));
  setViewport(390, 844);
  check('390x844 portrait adds neither class',
    !window.document.body.classList.contains('landscape-compact') &&
    !window.document.body.classList.contains('round-table'));
  // Bet turn in compact mode: staging tray visible AND body.staging shrinks the table.
  setViewport(844, 390);
  window.eval(`startLocalGame([{name:'Test',isBot:false},{name:'Bot',isBot:true}], 42, {ante:10})`);
  [...window.document.querySelectorAll('#antePropose button')].find(b => b.textContent.trim() === '100 chips').click();
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`);
  ev(`refreshView(); render();`);
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`); // bot draws
  ev(`refreshView(); render();`);
  $('btnStandPat').click(); // my draw done -> betting
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`); // bot bets first
  ev(`refreshView(); render();`);
  check('staging tray shows on my bet turn', !$('stageBox').classList.contains('hidden'));
  check('body.staging is set while staging', window.document.body.classList.contains('staging'));
  check('compact mode still on during the bet turn',
    window.document.body.classList.contains('landscape-compact'));
  check('ante modal still fits sideways (92vh rule)', /max-height:\s*92vh/.test(compactCss));

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('LAYOUT TEST CRASHED:', e); process.exit(1); });

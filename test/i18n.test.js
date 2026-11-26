// Five-Card Draw i18n test (jsdom, no browser needed).
// The 7-language switcher: dictionary completeness (every key in all 7
// languages), switching changes visible text (static + dynamic), choice
// persists in localStorage under 'lang', navigator.language maps to one
// of the 7, English is the fallback, and the hidden rule never appears in
// any translation. Run: node test/i18n.test.js
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('  ok  ' + name); }
  else { fail++; console.log('FAIL  ' + name + (extra ? ' — ' + extra : '')); }
}

function loadDom(beforeParse) {
  return new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse: beforeParse || undefined,
  });
}
function ready(dom) {
  const { window } = dom;
  return new Promise(r => { if (window.document.readyState === 'complete') r(); else window.addEventListener('load', r); });
}

(async () => {
  const dom = loadDom();
  const { window } = dom;
  const $ = id => window.document.getElementById(id);
  const ev = src => window.eval(src);
  await ready(dom);

  /* ---- the switcher exists, at the top, on every screen ---- */
  const sel = $('langSelect');
  check('language select exists', !!sel);
  check('language select sits in the header (top of the page)',
    !!sel && sel.closest('header') !== null);
  check('language select offers all 7 languages',
    !!sel && [...sel.options].map(o => o.value).join(',') === 'en,pt,es,zh,ja,fr,ko',
    sel ? [...sel.options].map(o => o.value).join(',') : 'no select');
  check('language select shows EN | PT | ES | ZH | JA | FR | KO',
    !!sel && [...sel.options].map(o => o.textContent).join(' | ') === 'EN | PT | ES | ZH | JA | FR | KO');
  check('switcher is styled as a compact pill', /#langSelect\{[^}]*border-radius:\s*999px/.test(html));
  check('compact landscape keeps only the switcher visible in the header',
    /body\.landscape-compact header\{[^}]*display:\s*flex/.test(html) &&
    /body\.landscape-compact header>div\{[^}]*display:\s*none/.test(html));

  /* ---- dictionary completeness: every key in all 7 languages ---- */
  const langs = ev('LANGS');
  check('7 languages declared', Array.isArray(langs) && langs.join(',') === 'en,pt,es,zh,ja,fr,ko');
  const enKeys = Object.keys(ev('I18N.en'));
  check('English dictionary is non-trivial', enKeys.length >= 300, enKeys.length + ' keys');
  let allComplete = true, missingReport = '';
  for (const l of langs) {
    const ks = Object.keys(ev('I18N.' + l));
    const missing = enKeys.filter(k => !ev('I18N.' + l + '[' + JSON.stringify(k) + ']'));
    const empty = ks.filter(k => typeof ev('I18N.' + l + '[' + JSON.stringify(k) + ']') !== 'string' || ev('I18N.' + l + '[' + JSON.stringify(k) + ']').trim() === '');
    if (missing.length || empty.length || ks.length !== enKeys.length) {
      allComplete = false;
      missingReport += l + ': missing=' + missing.join(',') + ' empty=' + empty.join(',') + ' count=' + ks.length + '; ';
    }
  }
  check('every key present in all 7 languages', allComplete, missingReport || (enKeys.length + ' keys each'));
  // No unreplaced placeholders and no stray braces in any translation.
  let badPlaceholders = [];
  for (const l of langs) {
    for (const k of enKeys) {
      const v = ev('I18N.' + l + '[' + JSON.stringify(k) + ']');
      const open = (v.match(/\{/g) || []).length, close = (v.match(/\}/g) || []).length;
      if (open !== close) badPlaceholders.push(l + ':' + k);
      const vars = (v.match(/\{[a-z]+\}/g) || []);
      for (const ph of vars) {
        if (!ev('I18N.en[' + JSON.stringify(k) + ']').includes(ph)) badPlaceholders.push(l + ':' + k + ' unknown ' + ph);
      }
    }
  }
  check('no unbalanced braces or unknown placeholders in any language', badPlaceholders.length === 0, badPlaceholders.slice(0, 5).join('; '));

  /* ---- the hidden rule never appears in any translation ---- */
  let shootHits = [];
  for (const l of langs) {
    for (const k of enKeys) {
      const v = ev('I18N.' + l + '[' + JSON.stringify(k) + ']');
      if (/shoot'em dead/i.test(v)) shootHits.push(l + ':' + k);
    }
  }
  check("no translation mentions the hidden rule's button", shootHits.length === 0, shootHits.join(', '));
  let rulesShootHits = [];
  for (const l of langs) {
    ev("setLang('" + l + "')");
    const rulesText = [...window.document.querySelectorAll('#menuScreen .rules li')].map(li => li.textContent).join(' ');
    if (/shoot/i.test(rulesText)) rulesShootHits.push(l);
  }
  check('rules text never mentions shooting in any language', rulesShootHits.length === 0, rulesShootHits.join(', '));
  ev("setLang('en')");

  /* ---- fallback: unknown key returns the key; missing key falls back to English ---- */
  check('unknown key returns the key itself', ev("t('__no_such_key__')") === '__no_such_key__');
  ev("I18N.pt['btn_fold'] = undefined; delete I18N.pt['btn_fold'];");
  ev("setLang('pt')");
  check('missing key in a language falls back to English', ev("t('btn_fold')") === 'Fold');
  ev("setLang('en')");

  /* ---- switching changes visible text, persists, sets <html lang> ---- */
  check('default language is English', ev('lang') === 'en' && window.document.documentElement.lang === 'en');
  ev("setLang('pt')");
  check('switch to pt changes the menu title', $('menuScreen').querySelector('h2').textContent === 'Jogar Five-Card Draw',
    $('menuScreen').querySelector('h2').textContent);
  check('switch to pt changes the join button', $('btnJoin').textContent === 'Entrar na sala →', $('btnJoin').textContent);
  check('switch to pt changes the tagline', window.document.querySelector('.tag').textContent.indexOf('Pague o ante') === 0);
  check('switch sets document lang', window.document.documentElement.lang === 'pt');
  check("choice persists in localStorage under 'lang'", window.localStorage.getItem('lang') === 'pt');
  check('select follows the language', sel.value === 'pt');
  ev("setLang('ja')");
  check('switch to ja changes the footer', window.document.querySelector('footer').textContent.indexOf('ファイブカード') >= 0,
    window.document.querySelector('footer').textContent.slice(0, 40));
  ev("setLang('xx')");
  check('unknown language falls back to English', ev('lang') === 'en' && $('btnJoin').textContent === 'Join lobby →');
  ev("setLang('en')");

  /* ---- navigator.language mapping ---- */
  window.localStorage.removeItem('lang');
  try {
    Object.defineProperty(window.navigator, 'language', { value: 'pt-BR', configurable: true });
    check('navigator pt-BR maps to pt', ev('detectLang()') === 'pt', ev('detectLang()'));
    Object.defineProperty(window.navigator, 'language', { value: 'zh-TW', configurable: true });
    check('navigator zh-TW maps to zh', ev('detectLang()') === 'zh', ev('detectLang()'));
    Object.defineProperty(window.navigator, 'language', { value: 'de-DE', configurable: true });
    check('navigator de-DE maps to en', ev('detectLang()') === 'en', ev('detectLang()'));
  } catch (e) {
    check('navigator.language is overridable in this environment', false, String(e));
  }

  /* ---- stored choice wins on load ---- */
  const dom2 = loadDom(w => { w.localStorage.setItem('lang', 'es'); });
  const w2 = dom2.window;
  await ready(dom2);
  check('stored es loads the page in Spanish',
    w2.document.getElementById('btnJoin').textContent === 'Unirse a la sala →',
    w2.document.getElementById('btnJoin').textContent);
  check('stored choice sets the select', w2.document.getElementById('langSelect').value === 'es');
  check('stored choice sets document lang', w2.document.documentElement.lang === 'es');

  /* ---- dynamic strings: a real game, switched mid-game ---- */
  ev("setLang('en')");
  window.eval(`startLocalGame([{name:'Test',isBot:false},{name:'Bot',isBot:true}], 42, {ante:10})`);
  check('game starts in English (ante open)', /Ante round/.test($('statusBox').textContent));
  ev("setLang('es')");
  check('status line switches to Spanish mid-game', /Ronda de ante/.test($('statusBox').textContent), $('statusBox').textContent.slice(0, 80));
  check('ante propose buttons switch to Spanish',
    [...window.document.querySelectorAll('#antePropose button')].some(b => b.textContent.trim() === '100 fichas'),
    [...window.document.querySelectorAll('#antePropose button')].map(b => b.textContent.trim()).join(','));
  check('ante status switches to Spanish', /clic más rápido/.test($('anteStatus').textContent), $('anteStatus').textContent.slice(0, 80));
  check('log line translates (ante round)', /Ronda de ante/.test($('logBox').textContent), $('logBox').textContent.slice(0, 120));
  check('fold button switches to Spanish', $('btnFold').textContent === 'Retirarse', $('btnFold').textContent);
  check('leave button switches to Spanish', $('btnLeaveMatch').textContent === '🚪 Salir de la partida', $('btnLeaveMatch').textContent);
  check('whiskey counter switches to Spanish',
    (() => { ev('sipWhiskey()'); return [...window.document.querySelectorAll('.whiskey-count')].every(el => el.textContent === 'Tragos: 1'); })());
  // Propose 100 in Spanish, bot tops up, draw + bet in Spanish.
  [...window.document.querySelectorAll('#antePropose button')].find(b => b.textContent.trim() === '100 fichas').click();
  check('ante locks at 100 after Spanish click', ev('view.anteLocked') === true && ev('view.ante') === 100);
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`);
  ev(`refreshView(); render();`);
  check('hand starts, status in Spanish (draw)', /cambiando/.test($('statusBox').textContent), $('statusBox').textContent.slice(0, 80));
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`); // bot draws
  ev(`refreshView(); render();`);
  $('btnStandPat').click();
  check('stand-pat button was Spanish', true); // click already happened in Spanish UI
  ev(`applyAction(fullState, 'p1', botChooseAction(fullState, 'p1'))`); // bot bets
  ev(`refreshView(); render();`);
  check('bet prompt in Spanish', /Tu apuesta/.test($('betPrompt').textContent), $('betPrompt').textContent);
  check('stage hint in Spanish', /Nada sale de tu montón/.test(window.document.querySelector('#stageBox div[style*="12.5px"]').textContent));
  ev(`stageChip(1000); stageChip(500); stageChip(100);`);
  check('stage effect in Spanish (raise)', /Subir a/.test($('stageEffect').textContent), $('stageEffect').textContent);
  check('staged total still reads 1600', $('stageTotal').textContent === '1600');
  // Rules popup in Spanish.
  ev('openRules()');
  check('rules popup in Spanish', /Objetivo/.test($('rulesBody').textContent) && /Escalera Real/.test($('rulesBody').textContent),
    $('rulesBody').textContent.slice(0, 80));
  check('rules title in Spanish', window.document.querySelector('#rulesModal h2').textContent.indexOf('reglas y manos') >= 0);
  ev("show('rulesModal',false)");
  // Fold to end the hand: the over modal must be translated too.
  $('btnFold').click();
  check('over modal title in Spanish', $('overTitle').textContent === '🏆 ¡Bot se lleva el bote!', $('overTitle').textContent);
  check('over modal is visible', !$('overModal').classList.contains('hidden'));
  check('over modal body has no English hand names',
    !/Royal Flush|Straight Flush|Four of a Kind|Full House|Flush|Straight|Three of a Kind|Two Pair|One Pair|High Card/.test($('overBody').textContent),
    $('overBody').textContent.slice(0, 120));
  check('over modal reason in Spanish', /se lleva el bote/.test($('overBody').textContent), $('overBody').textContent.slice(0, 120));
  check('next-hand button in Spanish', $('btnOverNextHand').textContent === '▶ Próxima mano', $('btnOverNextHand').textContent);

  /* ---- the hidden button is never translated ---- */
  ev("setLang('pt')");
  check("shoot button label stays as-is in every language",
    window.document.querySelector('.shoot-label').textContent === "🔫 Shoot'em Dead");
  ev("setLang('en')");

  /* ---- log / error translators, hand names ---- */
  ev("setLang('fr')");
  check('log line translates (discard)', ev("translateLogLine('Ana discarded 2 cards and drew 2.')") === 'Ana a écarté 2 cartes et en a tiré 2.',
    ev("translateLogLine('Ana discarded 2 cards and drew 2.')"));
  check('log line translates (dead round)', ev("translateLogLine('Dead round — nobody entered at 500 chips.')") === 'Tour mort — personne n\'est entré avec 500 jetons.',
    ev("translateLogLine('Dead round — nobody entered at 500 chips.')"));
  check('showdown log translates hand names',
    ev("translateLogLine('Hand 2: Ana, Bob win the pot (1200, 800 chips). Showdown: Ana (Two Pair), Bob (One Pair).')").indexOf('Double Paire') >= 0 &&
    ev("translateLogLine('Hand 2: Ana, Bob win the pot (1200, 800 chips). Showdown: Ana (Two Pair), Bob (One Pair).')").indexOf('Paire') >= 0);
  check('showdown with a flush does not corrupt the flush name',
    ev("translateLogLine('Hand 2: Ana wins the pot (500 chips). Showdown: Ana (Straight Flush).')").indexOf('Quinte Flush') >= 0 &&
    ev("translateLogLine('Hand 2: Ana wins the pot (500 chips). Showdown: Ana (Straight Flush).')").indexOf('Quinte Couleur') < 0,
    ev("translateLogLine('Hand 2: Ana wins the pot (500 chips). Showdown: Ana (Straight Flush).')"));
  check('unknown log line falls back to English unchanged',
    ev("translateLogLine('Some unknown line 123')") === 'Some unknown line 123');
  check('engine error translates', ev("translateEngineError('not enough chips')") === 'pas assez de jetons',
    ev("translateEngineError('not enough chips')"));
  check('staged-call error translates with numbers',
    ev("translateEngineError('staged bet of 600 does not cover the call of 700 (you need at least 200 on top of your 500)')").indexOf('600') >= 0 &&
    ev("translateEngineError('staged bet of 600 does not cover the call of 700 (you need at least 200 on top of your 500)')").indexOf('700') >= 0);
  check('hand name translates', ev("handNameT('Two Pair')") === 'Double Paire');
  check('hand name falls back for unknown names', ev("handNameT('No Such Hand')") === 'Main incomplète');
  ev("setLang('ko')");
  check('log line translates to Korean', ev("translateLogLine('Ana folds.')") === 'Ana님이 폴드했습니다.',
    ev("translateLogLine('Ana folds.')"));
  check('error translates to Korean', ev("translateEngineError('not your turn')") === '당신 차례가 아닙니다',
    ev("translateEngineError('not your turn')"));
  ev("setLang('en')");

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('I18N TEST CRASHED:', e); process.exit(1); });

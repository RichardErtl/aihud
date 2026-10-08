// AX.3/AX.4 — what every shipped tile really draws for a provider that records less, in a real headless
// browser (`node/launch.js findBrowser`, DevTools protocol, an OS-assigned port, no dependencies;
// skipped when no browser is installed). The sheets are the reader's own, built from the checked-in
// fixtures. Antigravity: no tile draws a number for a field that is not recorded and no tile carries hint
// text; a not-recorded value is a dash in --aihud-absent on an element whose data-field is a catalog path
// with a gap (the tip says "not provided by Antigravity", checked through tipEntries), the tools tiles
// show "<1s" for a call under one second. Claude and Codex: no hint, no absent mark anywhere, and the
// tools tiles still print their sub-second calls as "0.0s" (the Claude rendering is unchanged).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findBrowser } from '../node/launch.js';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';
import { tipEntries } from '../hud/hud.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const TILES = join(HERE, '..', 'tiles');
const R = join(HERE, '..', 'reader', 'fixtures');
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const inv = inventory({
  root: join(R, 'projects'), codexRoot: join(R, 'codex', 'sessions'), codexIndex: join(R, 'codex', 'session_index.jsonl'),
  antigravityRoot: join(R, 'antigravity'), nowMs: NOW,
});
const sheetOf = (id) => contractSheet(buildSheet(loadSession(findSession(inv, id)), { nowMs: NOW }), { device: 'laptop', state: 'awake' });
const claudeSheets = inv.projects.filter((p) => p.slug !== 'codex' && p.slug !== 'antigravity').flatMap((p) => p.sessions).map((s) => sheetOf(s.session_id));
const SHEETS = {
  claude: claudeSheets.find((s) => s.turn.turns.some((t) => Array.isArray(t.skills) && t.skills.length)),
  codex: sheetOf('c0dec0de-5a17-4c0d-9e5e-1000000000a1'),
  antigravity: sheetOf('a9a9a9a9-7e57-4a9b-9a9a-2000000000b2'),
};
const CATALOG = JSON.parse(readFileSync(join(TILES, 'contract.json'), 'utf8'));
const GAP_PATHS = new Set(CATALOG.fields.filter((f) => typeof f.gap === 'string' || Array.isArray(f.gap)).map((f) => f.path));
const NAMES = readdirSync(TILES).filter((f) => /^[a-z0-9-]+-(portrait|landscape)\.js$/.test(f) && !f.startsWith('example-')).map((f) => f.slice(0, -3)).sort();
const blockOf = (n) => (n.startsWith('top-three-subagents') ? 'top-three-subagents' : n.split('-')[0]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const PAGE = `<!doctype html><meta charset=utf-8><link rel=stylesheet href="/hud.css"><body style="margin:0"><div id=host></div><script type=module>
window.measure = async (name, sheet, unit) => {
  const mod = await import('./tiles/' + name + '.js');
  const host = document.getElementById('host'); host.replaceChildren();
  const [{ cols, rows }] = mod.meta.sizes;
  const el = document.createElement('div'); el.style.cssText = 'position:relative;overflow:hidden;width:' + cols * unit + 'px;height:' + rows * unit + 'px;background:var(--aihud-bg)';
  host.append(el);
  try { mod.render(el, sheet, { cols, rows, unit }); } catch (e) { return { err: String(e && e.message) }; }
  await new Promise((r) => setTimeout(r, 20));
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT), pieces = [];
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const p = n.parentElement; if (!p || /^(STYLE|SCRIPT)$/i.test(p.tagName)) continue;
    const t = n.nodeValue.replace(/\\s+/g, ' ').trim(); if (t) pieces.push(t);
  }
  const over = [...el.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow === 'hidden').length;
  const probe = document.createElement('div'); probe.style.color = 'var(--aihud-absent)'; el.append(probe);
  const absent = getComputedStyle(probe).color; probe.remove();
  // an element with text of its own, drawn in the absent colour; its mark = the nearest data-field (the HUD tip uses closest(), too)
  const marks = [...el.querySelectorAll('*')].filter((e) => [...e.childNodes].some((c) => c.nodeType === 3 && c.nodeValue.trim())).map((e) => { const c = getComputedStyle(e), f = e.closest('[data-field]'); return { field: f ? f.getAttribute('data-field') : null, absent: c.color === absent || c.fill === absent, text: e.textContent }; });
  return { pieces, over, marks, absentColor: absent };
};
window.READY = true;
</script>`;

/** All tiles × all three sheets in one browser session: { sheet: { tile: { pieces } | { err } } } */
async function drawEverything(browser) {
  const server = createServer((req, res) => {
    const u = req.url.split('?')[0];
    const send = (body, type) => { res.writeHead(200, { 'content-type': type }); res.end(body); };
    try {
      if (u === '/') return send(PAGE, 'text/html');
      if (u === '/hud.css') return send(readFileSync(join(HERE, '..', 'hud', 'hud.css')), 'text/css');
      if (u.startsWith('/tiles/') && /^[a-z0-9-]+\.js$/.test(u.slice(7))) return send(readFileSync(join(TILES, u.slice(7))), 'text/javascript');
    } catch { /* not found */ }
    res.writeHead(404); res.end();
  });
  await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
  const profile = mkdtempSync(join(tmpdir(), 'aihud-ax3t-'));
  const chrome = spawn(browser.path, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--window-size=900,900', 'about:blank'], { stdio: 'ignore' });
  const out = {};
  try {
    let port = null;
    for (const end = Date.now() + 15_000; Date.now() < end && !port; await sleep(100)) {
      try { const t = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8'); if (t.includes('\n')) port = t.split('\n')[0].trim(); } catch { /* still locked or not there */ }
    }
    assert.ok(port, 'the browser opened its debugging port');
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('devtools socket failed')); });
    let id = 0;
    const waiting = new Map();
    ws.onmessage = (m) => { const msg = JSON.parse(m.data); const w = waiting.get(msg.id); if (!w) return; waiting.delete(msg.id); if (msg.error) w.no(new Error(msg.error.message)); else w.ok(msg.result); };
    const send = (method, params = {}) => new Promise((ok, no) => { id++; waiting.set(id, { ok, no }); ws.send(JSON.stringify({ id, method, params })); });
    const evaluate = async (expression) => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.text}`);
      return r.result.value;
    };
    await send('Page.enable');
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    for (let i = 0; i < 100 && !(await evaluate('!!window.READY')); i++) await sleep(100);
    assert.equal(await evaluate('!!window.READY'), true, 'the page became ready');
    for (const [sheetName, sheet] of Object.entries(SHEETS)) {
      out[sheetName] = {};
      for (const n of NAMES) out[sheetName][n] = await evaluate(`window.measure(${JSON.stringify(n)}, ${JSON.stringify(sheet)}, 20)`);
    }
    ws.close();
  } finally {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    server.close();
    for (let i = 0; i < 20; i++) { try { rmSync(profile, { recursive: true, force: true }); break; } catch { await sleep(150); } }
  }
  return out;
}

const text = (r) => r.pieces.join(' ').replace(/\s+/g, ' ');
const HINT = /not provided by Antigravity/i;
const ofBlock = (b) => NAMES.filter((n) => blockOf(n) === b);

let memo = null;
/** One browser session for the whole file; null when there is no browser (the tests skip). */
const everything = () => {
  const browser = findBrowser();
  if (!browser || browser.noApp) return Promise.resolve(null);
  return (memo ||= drawEverything(browser));
};
const need = async (t) => {
  const drawn = await everything();
  if (!drawn) t.skip('no Chrome, Edge or Chromium found');
  return drawn;
};
const OPTS = { timeout: 240_000 };

test('the 146 shipped tiles render on the Claude, Codex and Antigravity sheets in a real browser', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  assert.equal(NAMES.length, 146, 'trip-wire: the 146 shipped tiles');
  for (const [sheet, tiles] of Object.entries(drawn)) for (const n of NAMES) assert.equal(tiles[n].err, undefined, `${sheet} · ${n} renders (${tiles[n].err})`);
});

test('Antigravity: the tokens of the last turn are no "0" (not recorded is not zero)', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  const seismographs = NAMES.filter((x) => x.startsWith('trace-seismograph-'));
  assert.equal(seismographs.length, 2, 'trip-wire: both orientations');
  for (const n of seismographs) assert.equal(drawn.antigravity[n].pieces.includes('0'), false, `${n}: no "0" for the tokens of the turn`);
});

test('Antigravity tools: a call under one second is "<1s", never "0.0s" (whole-second resolution)', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  assert.equal(ofBlock('tools').length, 8, 'trip-wire: the four tools styles in two orientations');
  for (const n of ofBlock('tools')) {
    const flat = drawn.antigravity[n].pieces.join('');   // the cellwork tiles draw one piece per character
    assert.doesNotMatch(flat, /0\.0s/, `${n}: no 0.0s`);
    assert.ok(flat.includes('<1s'), `${n}: shows <1s`);
    assert.doesNotMatch(flat, /\d\.\ds/, `${n}: no tenth of a second that was never recorded`);
  }
});

test('Claude and Codex tools: sub-second calls stay as they were, no <1s', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  for (const sheet of ['claude', 'codex']) for (const n of ofBlock('tools')) assert.equal(drawn[sheet][n].pieces.join('').includes('<1s'), false, `${sheet} · ${n}: no <1s`);
  assert.ok(ofBlock('tools').some((n) => drawn.claude[n].pieces.join('').includes('0.0s')), 'trip-wire: Claude still prints 0.0s somewhere');
  for (const sheet of ['claude', 'codex']) assert.ok(ofBlock('tools').some((n) => /\d\.\ds/.test(drawn[sheet][n].pieces.join(''))), `trip-wire: ${sheet} keeps its tenths`);
});

const absentMarks = (r) => r.marks.filter((m) => m.absent && m.field);
const unmarkedAbsent = (r) => r.marks.filter((m) => m.absent && !m.field);
/** The tiles that carried the hint text before AX.4: tokens, context, glance, trace, blueprint, subagents-fancy-a. */
const FORMER_HINT = (n) => ['tokens', 'context', 'glance', 'trace'].includes(blockOf(n)) || n.startsWith('top-three-subagents-blueprint-') || n.startsWith('subagents-fancy-a-');

test('Antigravity: no tile carries hint text; the not-recorded value is a dash in --aihud-absent on a catalog gap path', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  const needMark = NAMES.filter((n) => FORMER_HINT(n) || ['subagents', 'skills', 'tools'].includes(blockOf(n)));
  assert.equal(needMark.length, 92, "trip-wire: 58 former hint tiles + 18 subagents + 8 skills + 8 tools");
  for (const n of NAMES) assert.doesNotMatch(text(drawn.antigravity[n]), /not provided/i, `${n}: no hint text in a tile`);
  for (const n of needMark) {
    const r = drawn.antigravity[n];
    assert.match(r.absentColor, /^rgb/, `${n}: --aihud-absent resolves to a colour`);
    const marks = absentMarks(r);
    assert.ok(marks.length >= 1, `${n}: shows at least one element in --aihud-absent with a data-field`);
    for (const m of marks) for (const f of m.field.split(/\s+/).filter(Boolean)) assert.ok(GAP_PATHS.has(f), `${n}: mark ${f} is a catalog path with a gap`);
    for (const m of marks) assert.doesNotMatch(m.text, /\d/, `${n}: the absent mark ${m.field} holds no digit (${m.text})`);
    assert.deepEqual(unmarkedAbsent(r), [], `${n}: nothing is drawn in --aihud-absent without a data-field mark`);
    if (FORMER_HINT(n)) assert.equal(r.over, 0, `${n}: nothing clipped (overflow:hidden elements wider than their box)`);
  }
  for (const n of NAMES.filter((x) => blockOf(x) === 'subagents')) assert.doesNotMatch(text(drawn.antigravity[n]), /\d+ tokens/, `${n}: no token sum for tokens that were not recorded`);
  // whatever is marked absent anywhere on the sheet: a dash, no digit, a gap path
  for (const n of NAMES) for (const m of absentMarks(drawn.antigravity[n])) {
    assert.doesNotMatch(m.text, /\d/, `${n}: absent mark ${m.field} holds a digit`);
    for (const f of m.field.split(/\s+/).filter(Boolean)) assert.ok(GAP_PATHS.has(f), `${n}: absent mark ${f} has no catalog gap`);
  }
});

test('Antigravity: the tip of every absent mark says "not provided by Antigravity", and only there', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  const paths = new Set();
  for (const n of NAMES) for (const m of absentMarks(drawn.antigravity[n])) for (const f of m.field.split(/\s+/).filter(Boolean)) paths.add(f);
  assert.ok(paths.size >= 5, `trip-wire: ${paths.size} distinct absent paths on the sheet`);
  for (const f of paths) {
    const [e] = tipEntries(CATALOG, f, SHEETS.antigravity.not_delivered);
    assert.equal(e.text, 'not provided by Antigravity', f);
    assert.equal(e.absent, true, f);
    const [ok] = tipEntries(CATALOG, f, SHEETS.claude.not_delivered);
    assert.notEqual(ok.text, 'not provided by Antigravity', `${f}: Claude gets the catalog hint`);
    assert.equal(ok.absent === true, false, f);
  }
});

test('Antigravity: no digit stands in for a not-recorded value on the token and context tiles', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  // what is left on these tiles is the caption and the dash; a digit could only be an invented one
  for (const n of NAMES.filter((x) => blockOf(x) === 'tokens' || blockOf(x) === 'context')) {
    assert.deepEqual(drawn.antigravity[n].pieces.filter((p) => /\d/.test(p)), [], `${n}: no digit`);
  }
});

test('Claude and Codex: no hint text and no absent mark anywhere', OPTS, async (t) => {
  const drawn = await need(t);
  if (!drawn) return;
  for (const sheet of ['claude', 'codex']) for (const n of NAMES) {
    assert.doesNotMatch(text(drawn[sheet][n]), /not provided by/i, `${sheet} · ${n}: no hint`);
    assert.deepEqual(absentMarks(drawn[sheet][n]), [], `${sheet} · ${n}: no element in --aihud-absent`);
  }
});

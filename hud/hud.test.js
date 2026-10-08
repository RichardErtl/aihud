// The HUD: the pure grid functions, and `boot()` as the page calls it — against a real node on test
// ports 4386/4387/4388 (one per test: a pooled socket of a closed node is never reused) (temp copy of the reader fixtures, temp aihud home), with a minimal DOM stand-in and
// a small EventSource over node:http. Never the real transcript folder, never the real ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WINDOW_ONLY_SETTINGS, folderOf } from './hud.js';
import { WINDOW_ONLY_SETTINGS as STORE_WINDOW_ONLY } from '../node/store.js';
import { GRID, pickOrientation, unitFor, tileSize, isTile, extent, boot, layoutOverride, themeOverrides, tipEntries, placeTip } from './hud.js';
import { layoutBody, saveLayout } from '../composer/composer.js';
import { createNode } from '../node/server.js';
import { createServer as netServer } from 'node:net';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed 43xx/44xx port, so parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const SLUG = 'c--dev-sample-app';
const PORT = await freePort();
const PORT_2 = await freePort();
const PORT_3 = await freePort();
const PORT_4 = await freePort();
const PORT_5 = await freePort();
const PORT_6 = await freePort();
const PORT_7 = await freePort();
const PORT_8 = await freePort();

test('grid numbers are the contract numbers', () => {
  assert.equal(GRID.portraitColumns, CONTRACT.grid.portraitColumns);
  assert.equal(GRID.landscapeRows, CONTRACT.grid.landscapeRows);
  assert.equal(GRID.minPx, CONTRACT.grid.minPx);
  assert.equal(GRID.unitStepPx, CONTRACT.grid.unitStepPx);
  assert.equal(CONTRACT.layoutFile.portraitMaxCols, CONTRACT.grid.portraitColumns);
  assert.equal(CONTRACT.layoutFile.landscapeMaxRows, Math.max(CONTRACT.grid.landscapeRows, CONTRACT.grid.landscapeRowsStandard));
});

test('portrait unit = inner width / 8, square: floor 20 px at 162-163 px, base 22.5 px at 180 px, never below 15 px', () => {
  assert.equal(unitFor('portrait', 160, 900), 20);
  assert.equal(unitFor('portrait', 162, 900), CONTRACT.grid.floorPx);
  assert.equal(unitFor('portrait', 163, 900), CONTRACT.grid.floorPx);
  assert.equal(unitFor('portrait', 180, 900), CONTRACT.grid.basePx);
  assert.equal(unitFor('portrait', 184, 900), 22.5, 'the 200 px app window (184 px inner) is capped at the base unit');
  assert.equal(unitFor('portrait', 120, 900), 15);
  assert.equal(unitFor('portrait', 80, 900), CONTRACT.grid.minPx, 'below 120 px the unit stays 15 px and the strip clips');
  for (const w of [162, 163, 180]) assert.ok(8 * unitFor('portrait', w, 900) <= w, `8 units fit ${w} px`);
});

test('landscape unit = inner height / band rows (6, or the layout\'s own taller band)', () => {
  assert.equal(unitFor('landscape', 1200, 120), 20);
  assert.equal(unitFor('landscape', 1200, 135), 22.5);
  assert.equal(unitFor('landscape', 1200, 140, 7), 20, 'the standard band of 7 rows');
  assert.equal(unitFor('landscape', 1200, 120, 4), 20, 'a lower layout still sits in a 6-row band');
});

test('unit_max caps the unit in both orientations (default 22.5 = the base unit), overridable', () => {
  assert.equal(GRID.basePx, CONTRACT.grid.basePx);
  assert.equal(unitFor('landscape', 1000, 1000), 22.5, 'a 1000 x 1000 window no longer blows the unit up to 166 px');
  assert.equal(unitFor('portrait', 1000, 1000), 22.5);
  assert.equal(unitFor('portrait', 184, 900, 0, 30), 23, 'a higher unit_max lets the 184 px strip reach 23 px');
  assert.equal(unitFor('landscape', 1000, 1000, 6, 40), 40);
  assert.equal(unitFor('portrait', 1000, 900, 0, 'x'), 22.5, 'a broken unit_max falls back to 22.5');
  assert.equal(unitFor('portrait', 1000, 900, 0, 10), 15, 'the 15 px floor wins over a smaller unit_max');
});

test('orientation by window shape, threshold from settings', () => {
  assert.equal(pickOrientation(180, 860), 'portrait');
  assert.equal(pickOrientation(1000, 120), 'landscape');
  assert.equal(pickOrientation(500, 500), 'landscape', 'default ratio 1: a square is landscape');
  assert.equal(pickOrientation(500, 500, 1.2), 'portrait');
  assert.equal(pickOrientation(1000, 120, 10), 'portrait', 'overridable');
  assert.equal(pickOrientation(1000, 120, 'x'), 'landscape', 'a broken threshold falls back to 1');
});

test('tile size, tile detection by exports, extent', () => {
  assert.deepEqual(tileSize({ sizes: [{ cols: 8, rows: 6 }] }), { cols: 8, rows: 6 });
  assert.equal(tileSize({ sizes: [[2, 1]] }), null);
  assert.equal(tileSize({}), null);
  assert.equal(isTile({ meta: {}, render() {} }), true);
  assert.equal(isTile({ meta: [], render() {} }), false);
  assert.equal(isTile({ OPTIONS: {}, main() {} }), false);
  assert.deepEqual(extent([{ col: 0, row: 0, size: { cols: 8, rows: 6 } }, { col: 8, row: 1, size: { cols: 8, rows: 6 } }]), { cols: 16, rows: 7 });
});

// ── the tip: text from the catalog, placement inside the window ──

test('tip text: the row\'s hint, else its meaning; ≈ for estimated; one entry per path; an unknown path gives none', () => {
  const row = (p) => CONTRACT.fields.find((f) => f.path === p);
  const pct = row('live.instances[].context_percent');
  const [one] = tipEntries(CONTRACT, 'live.instances[].context_percent');
  assert.deepEqual(one, { path: pct.path, text: pct.hint, unit: pct.unit, source: '≈ estimated', estimated: true });
  const [exact] = tipEntries(CONTRACT, 'turn.turns[].duration_s');
  assert.deepEqual([exact.text, exact.unit, exact.source], [row('turn.turns[].duration_s').hint, 'seconds', 'exact']);
  // a row without hint falls back to the long meaning (every shipped row has one since AP-E7, so on own rows)
  assert.equal(tipEntries({ fields: [{ path: 'x.y', meaning: 'long text', unit: 'u', source: 'exact' }] }, 'x.y')[0].text, 'long text');
  assert.equal(tipEntries({ fields: [{ path: 'x.y', meaning: 'long text', hint: '', unit: 'u', source: 'exact' }] }, 'x.y')[0].text, 'long text');
  // two paths, one value: one entry each, in the order written, extra spaces ignored
  const two = tipEntries(CONTRACT, 'session.started_at   live.instances[].last_activity');
  assert.deepEqual(two.map((e) => e.path), ['session.started_at', 'live.instances[].last_activity']);
  assert.deepEqual(two.map((e) => e.text), [row('session.started_at').hint, row('live.instances[].last_activity').hint]);
  // unknown / empty / no catalog: no entry (a known path next to an unknown one still shows)
  assert.deepEqual(tipEntries(CONTRACT, 'no.such.field'), []);
  assert.deepEqual(tipEntries(CONTRACT, ''), []);
  assert.deepEqual(tipEntries(null, 'session.id'), []);
  assert.deepEqual(tipEntries(CONTRACT, 'no.such.field session.id').map((e) => e.path), ['session.id']);
});

test('tip text for a not-recorded field: the provider sentence replaces the hint; a recorded field keeps the catalog hint', () => {
  const pct = CONTRACT.fields.find((f) => f.path === 'live.instances[].context_percent');
  assert.deepEqual(pct.gap, ['live:tokens', 'live:window']);
  const ag = ['live:tokens_not_recorded_by_antigravity'];
  assert.deepEqual(tipEntries(CONTRACT, pct.path, ag), [{ path: pct.path, text: 'not provided by Antigravity', unit: '', source: '', estimated: false, absent: true }]);
  // tokens recorded, window not (Antigravity 1.2.17 without a settings window): the same label through the second gap
  assert.equal(tipEntries(CONTRACT, pct.path, ['live:window_not_recorded_by_antigravity'])[0].text, 'not provided by Antigravity');
  assert.ok(tipEntries(CONTRACT, pct.path, ['live:window_assumed_by_settings'])[0].text.startsWith(pct.hint), 'an assumed window is no gap');
  // the assumed window says where the number comes from; still the estimated mark, never the absent label
  const byDefault = tipEntries(CONTRACT, pct.path, ['live:window_assumed_by_default'])[0];
  assert.ok(byDefault.text.startsWith(pct.hint) && /Google's model documentation/.test(byDefault.text) && /Settings/.test(byDefault.text));
  assert.equal(byDefault.estimated, true); assert.equal(byDefault.absent, undefined);
  assert.match(tipEntries(CONTRACT, pct.path, ['live:window_assumed_by_settings'])[0].text, /assumed by you in Settings/);
  // recorded: the gap names another pair, or nothing is delivered-missing -> catalog hint as before
  for (const nd of [undefined, null, [], ['turn:tokens_not_recorded_by_antigravity'], 'x', [1, null]]) assert.equal(tipEntries(CONTRACT, pct.path, nd)[0].text, pct.hint, JSON.stringify(nd));
  // a row without gap never turns into the sentence
  assert.equal(tipEntries(CONTRACT, 'session.id', ag)[0].text, CONTRACT.fields.find((f) => f.path === 'session.id').hint);
  // display names, plain unknown id, hostile ids
  const say = (p) => tipEntries(CONTRACT, pct.path, ['live:tokens_not_recorded_by_' + p])[0].text;
  assert.equal(say('codex'), 'not provided by Codex');
  assert.equal(say('claude-code'), 'not provided by Claude Code');
  assert.equal(say('acme'), 'not provided by acme');
  for (const hostile of ['<img src=x onerror=alert(1)>', 'a&b', 'x"y', 'constructor', '__proto__', 'A'.repeat(41), 'Acme', '']) {
    const t = say(hostile);
    assert.equal(/^not provided by [a-z0-9 -]+$/.test(t), true, `${hostile.slice(0, 12)} -> ${t}`);
    assert.equal(t.includes('function') || t.includes('<'), false);
  }
  assert.equal(say('Acme'), 'not provided by this provider');
  assert.equal(say('constructor'), 'not provided by constructor');
  // a two-path mark: the gap field gets the sentence, the other keeps its hint
  const mixed = tipEntries(CONTRACT, 'session.started_at ' + pct.path, ag);
  assert.deepEqual(mixed.map((e) => e.absent === true), [false, true]);
});

test('tip placement: portrait above/below and never wider than the strip, landscape beside and never higher than the band', () => {
  const inside = (p, tip, view, m = 4) => p.x >= m && p.y >= m && p.x + tip.w <= view.w - m && p.y + tip.h <= view.h - m;
  const portrait = { w: 160, h: 600 };
  const tip = { w: 152, h: 60 };
  const belowRect = { left: 120, right: 150, top: 100, bottom: 114 };
  let p = placeTip({ rect: belowRect, tip, view: portrait, orientation: 'portrait' });
  assert.equal(p.caret.side, 'top', 'room below: the bubble hangs under the value');
  assert.ok(p.y > belowRect.bottom && inside(p, tip, portrait), JSON.stringify(p));
  p = placeTip({ rect: { left: 4, right: 30, top: 560, bottom: 574 }, tip, view: portrait, orientation: 'portrait' });
  assert.equal(p.caret.side, 'bottom', 'no room below: above the value');
  assert.ok(p.y + tip.h < 560 && inside(p, tip, portrait), JSON.stringify(p));
  const band = { w: 900, h: 120 };
  const wide = { w: 230, h: 90 };
  p = placeTip({ rect: { left: 100, right: 140, top: 50, bottom: 64 }, tip: wide, view: band, orientation: 'landscape' });
  assert.equal(p.caret.side, 'left', 'room on the right: beside the value, to its right');
  assert.ok(p.x > 140 && inside(p, wide, band), JSON.stringify(p));
  p = placeTip({ rect: { left: 800, right: 880, top: 10, bottom: 24 }, tip: wide, view: band, orientation: 'landscape' });
  assert.equal(p.caret.side, 'right', 'no room on the right: to its left');
  assert.ok(p.x + wide.w < 800 && inside(p, wide, band), JSON.stringify(p));
  assert.ok(p.y >= 4, 'a value at the very top does not push the bubble out of the band');
});

// ── boot() against a real node ─────────────────────────────────────────────

/** Just enough DOM for hud.js and the example tile. */
function fakeDocument() {
  const doc = { byId: new Map() };
  doc.createElement = (tag) => {
    const el = {
      tagName: tag.toUpperCase(), ownerDocument: doc, className: '', dataset: {}, style: {}, children: [], _text: '',
      get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
      set textContent(v) { this._text = String(v); this.children = []; },
      setAttribute(k, v) { (this.attrs ||= {})[k] = v; },
      append(...c) { this.children.push(...c); for (const k of c) k.parentNode = this; },
      replaceChildren(...c) { this._text = ''; this.children = c; for (const k of c) k.parentNode = this; },
      addEventListener(type, fn) { (this.listeners ||= {})[type] = [...((this.listeners || {})[type] || []), fn]; },
      dispatchEvent(ev) {   // bubbles up the parent chain like the DOM
        for (let n = this; n; n = ev.bubbles ? n.parentNode : null) for (const fn of (n.listeners || {})[ev.type] || []) fn(ev);
        return true;
      },
    };
    return el;
  };
  doc.documentElement = Object.assign(doc.createElement('html'), { clientWidth: 0 });
  const main = doc.createElement('main');
  doc.byId.set('hud', main);
  doc.getElementById = (id) => doc.byId.get(id) || null;
  return doc;
}

/** EventSource over node:http, enough for `addEventListener(type, fn)` with `e.data`. */
class NodeEventSource {
  constructor(url) {
    this.handlers = {};
    this.req = http.get(url, { agent: false }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let type = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }
          for (const fn of this.handlers[type] || []) fn({ type, data });
        }
      });
    });
    this.req.on('error', () => {});
  }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  close() { this.req.destroy(); }
}

function fakeWindow(width, height) {
  const listeners = {};
  const doc = fakeDocument();
  doc.documentElement.clientWidth = width;
  return {
    document: doc, innerWidth: width, innerHeight: height, fetched: [], fetch(u, o) { this.fetched.push(String(u)); return fetch(u, o); }, EventSource: NodeEventSource,
    matchMedia: () => ({ matches: false }),
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    requestAnimationFrame: (fn) => setTimeout(fn, 0),
    ticks: [], setInterval(fn, ms) { this.ticks.push({ fn, ms, cleared: false }); return this.ticks.length - 1; }, clearInterval(i) { if (this.ticks[i]) this.ticks[i].cleared = true; },
    listeners,
    resize(w, h) {
      this.innerWidth = w; this.innerHeight = h; doc.documentElement.clientWidth = w;
      for (const fn of listeners.resize || []) fn();
    },
  };
}

/** The browser's `import(url)`, for node: the module source comes over HTTP from the node's route. */
async function importOverHttp(url) {
  const res = await fetch(url);
  assert.equal(res.status, 200, url);
  assert.match(res.headers.get('content-type'), /^text\/javascript/);
  return import(`data:text/javascript;base64,${Buffer.from(await res.text()).toString('base64')}`);
}

const settle = async (hud) => { await new Promise((r) => setTimeout(r, 20)); await hud.ready(); };
const boxWidths = (win) => win.document.getElementById('hud').children[0].children.map((c) => c.children[0] && c.children[0].style.cssText.match(/width:([\d.]+)px/)[1]);

test('boot: picks the layout by window shape, draws at the contract size, re-picks on resize, redraws on session-updated', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ layout_portrait: 'probe-portrait', layout_landscape: 'probe-landscape' }));
  const node = await createNode({ port: PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const win = fakeWindow(162, 900);
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${PORT}`, importModule: importOverHttp });
    await settle(hud);
    const root = win.document.getElementById('hud');
    assert.equal(root.children[1].textContent, '', `status line: ${root.children[1].textContent}`);
    assert.equal(root.dataset.orientation, 'portrait');
    assert.equal(root.dataset.layout, 'probe-portrait');
    assert.equal(root.dataset.unit, '20');
    assert.equal(root.dataset.tiles, '2');
    assert.ok(hud.state.current, 'the fixture folder has a current session');
    assert.equal(hud.state.data.session.id, hud.state.current);
    const grid = root.children[0];
    assert.equal(grid.style.gridTemplateColumns, 'repeat(8, 20px)');
    assert.deepEqual(grid.children.map((c) => `${c.dataset.tile}@${c.style.gridColumn}|${c.style.gridRow}`),
      ['example-number@1 / span 8|1 / span 6', 'example-number@1 / span 8|7 / span 6']);
    assert.deepEqual(boxWidths(win), ['160', '160'], 'the tile draws 8 x 20 px');
    t.diagnostic(`portrait 162x900: unit ${root.dataset.unit}, tile text "${grid.children[0].textContent}"`);

    win.resize(1000, 140);   // the probe band uses the 8 x 7 landscape twin: 7 rows x 20 px
    await settle(hud);
    assert.equal(root.dataset.orientation, 'landscape');
    assert.equal(root.dataset.layout, 'probe-landscape');
    assert.equal(root.dataset.unit, '20');
    assert.equal(root.dataset.tiles, '3');
    assert.equal(root.children[0].style.gridTemplateRows, 'repeat(7, 20px)');
    assert.equal(root.dataset.mismatch, 'false');
    assert.deepEqual(boxWidths(win), ['160', '160', '160'], 'the landscape twin draws 8 x 20 px');

    win.resize(180, 860);
    await settle(hud);
    assert.equal(root.dataset.orientation, 'portrait');
    assert.equal(root.dataset.unit, '22.5');
    assert.deepEqual(boxWidths(win), ['180', '180']);
    assert.ok(hud.state.counts.resizes >= 2 && hud.state.counts.layoutLoads === 3, JSON.stringify(hud.state.counts));

    // live: a line appended to the current session → session-updated → fresh data, one more draw
    const before = { ...hud.state.counts };
    const file = join(projects, SLUG, `${hud.state.current}.jsonl`);
    const last = readFileSync(file, 'utf8').trimEnd().split('\n').pop();
    appendFileSync(file, `${last}\n`);
    const until = Date.now() + 5000;
    while (hud.state.counts.dataLoads === before.dataLoads && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    await settle(hud);
    assert.ok(hud.state.counts.dataLoads > before.dataLoads, 'session-updated did not reload the data');
    assert.ok(hud.state.counts.draws > before.draws, 'session-updated did not redraw');
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('boot: the threshold and the layout names come from settings; a missing tile leaves a marked cell', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(join(home, 'layouts'), { recursive: true });
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ landscape_ratio: 10, layout_portrait: 'mine', layout_landscape: 'mine' }));
  // written straight to the folder (not via POST): a layout that names a tile which is gone
  writeFileSync(join(home, 'layouts', 'mine.json'), JSON.stringify({
    name: 'mine', orientation: 'portrait', tiles: [{ tile: 'example-number', col: 0, row: 0 }, { tile: 'gone', col: 0, row: 6 }],
  }));
  const node = await createNode({ port: PORT_2, projects, home, startDir: 'C:\\dev\\sample-app' });
  const win = fakeWindow(1000, 120);   // ratio 8.3 < 10 → still portrait
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${PORT_2}`, importModule: importOverHttp });
    await settle(hud);
    const root = win.document.getElementById('hud');
    assert.equal(root.dataset.orientation, 'portrait');
    assert.equal(root.dataset.layout, 'mine');
    const cells = root.children[0].children;
    assert.equal(cells.length, 2);
    assert.equal(cells[1].className, 'tile missing');
    assert.equal(cells[1].textContent, 'gone');
    assert.ok(readdirSync(join(home, 'layouts')).length === 1);
    assert.equal(root.dataset.mismatch, 'false');

    // settings name a portrait layout for landscape: shown, but with a notice, never silently
    win.resize(2000, 140);
    await settle(hud);
    assert.equal(root.dataset.orientation, 'landscape');
    assert.equal(root.dataset.layout, 'mine');
    assert.equal(root.dataset.mismatch, 'true');
    assert.equal(root.children[1].textContent, 'layout "mine" is portrait, the window is landscape');
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('boot: catalog-changed forgets the loaded modules — a failed import and a new own tile show without a page reload', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ layout_portrait: 'probe-portrait', layout_landscape: 'probe-landscape' }));
  const node = await createNode({ port: PORT_3, projects, home, startDir: 'C:\\dev\\sample-app' });
  const win = fakeWindow(162, 900);
  const urls = [];
  let fail = true;   // the first import fails, as a broken network or a module error would
  const flaky = (url) => { urls.push(url); if (fail) { fail = false; return Promise.reject(new Error('import failed')); } return importOverHttp(url); };
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${PORT_3}`, importModule: flaky });
    await settle(hud);
    const root = win.document.getElementById('hud');
    const cells = () => root.children[0].children;
    assert.deepEqual(cells().map((c) => c.className), ['tile missing', 'tile missing'], 'the failed import is cached for this layout load');
    assert.equal(urls.length, 1);

    // an own tile that shadows the shipped one, then a layout save → catalog-changed
    mkdirSync(join(home, 'tiles'));
    writeFileSync(join(home, 'tiles', 'example-number.js'), [
      "export const meta = { name: 'example-number', contentBlock: 'context', style: 'standard', orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }], contractVersion: '1.0' };",
      "export function render(el) { el.textContent = 'own tile'; }",
    ].join('\n'));
    const saved = await fetch(`http://127.0.0.1:${PORT_3}/layouts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'other', orientation: 'portrait', tiles: [{ tile: 'example-number', col: 0, row: 0 }] }),
    });
    assert.equal(saved.status, 201);
    const until = Date.now() + 5000;
    while (urls.length < 2 && Date.now() < until) await new Promise((r) => setTimeout(r, 50));
    await settle(hud);
    assert.equal(urls.length, 2, 'catalog-changed did not import the tile again');
    assert.match(urls[1], /\/tiles\/example-number\.js\?v=\d+$/);
    assert.deepEqual(cells().map((c) => `${c.className}:${c.textContent}`), ['tile:own tile', 'tile:own tile']);
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

// ── the session switch (tiles/CONTRACT.md "Session switch (header tile)") ──

const SID_A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const SID_B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
const select = (cell, detail) => cell.dispatchEvent(new CustomEvent('aihud:select-session', { bubbles: true, detail }));
const waitFor = async (fn, ms = 5000) => { const until = Date.now() + ms; while (!fn() && Date.now() < until) await new Promise((r) => setTimeout(r, 50)); };

test('session switch: tiles get data.hud, a select event pins and refetches, null / follow unpins', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(join(home, 'sessions'), { recursive: true });
  writeFileSync(join(home, 'sessions', `${SID_A}.json`), JSON.stringify({ title: 'Polish title' }));
  const node = await createNode({ port: PORT_4, projects, home, startDir: 'C:\\dev\\sample-app' });
  const win = fakeWindow(162, 900);
  const seen = [];   // what a tile's render() got
  const stub = { meta: { name: 'example-number', sizes: [{ cols: 8, rows: 6 }] }, render(el, data) { seen.push(data); } };
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${PORT_4}`, importModule: () => Promise.resolve(stub) });
    await settle(hud);
    const cur = hud.state.current;
    const other = cur === SID_A ? SID_B : SID_A;
    const h = seen[seen.length - 1].hud;
    assert.deepEqual(Object.keys(h).sort(), ['current', 'pinned', 'sessions']);
    assert.equal(h.current, cur);
    assert.equal(h.pinned, false);
    assert.deepEqual(h.sessions.map((x) => x.session_id).sort(), [SID_A, SID_B]);
    assert.deepEqual(Object.keys(h.sessions[0]).sort(), ['age_seconds', 'project_slug', 'session_id', 'title']);
    assert.equal(h.sessions[0].project_slug, SLUG);
    assert.equal(h.sessions.find((x) => x.session_id === SID_A).title, 'Polish title', 'the sidecar title travels into data.hud.sessions');
    assert.equal(h.sessions.find((x) => x.session_id === SID_B).title, null);

    const cell = () => win.document.getElementById('hud').children[0].children[0];
    const calls = win.fetched.filter((u) => u.endsWith(`/sessions/${other}`)).length;
    select(cell(), { session_id: other });
    await settle(hud);
    assert.equal(hud.state.current, other);
    assert.equal(hud.state.pinned, true);
    assert.equal(hud.state.data.session.id, other);
    const newCalls = win.fetched.filter((u) => u.endsWith(`/sessions/${other}`)).length - calls;
    assert.ok(newCalls >= 1, `fetch saw /sessions/${other} ${newCalls} times`);
    assert.equal(seen[seen.length - 1].hud.current, other);
    assert.equal(seen[seen.length - 1].hud.pinned, true);

    select(cell(), { session_id: null });
    await settle(hud);
    assert.equal(hud.state.pinned, false);
    assert.equal(hud.state.current, cur, 'null detail: back to following the youngest');
    assert.equal(seen[seen.length - 1].hud.pinned, false);

    select(cell(), { session_id: other });
    await settle(hud);
    assert.equal(hud.state.current, other);
    select(cell(), { follow: true });
    await settle(hud);
    assert.deepEqual([hud.state.pinned, hud.state.current], [false, cur], 'follow detail unpins too');

    select(cell(), { session_id: 'not-in-the-list' });
    await settle(hud);
    assert.equal(hud.state.pinned, false, 'an id that is not listed does not pin');
    assert.equal(hud.state.current, cur, 'and falls back to the list current');
    assert.equal(hud.state.data.hud.current, cur);
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('session switch: a pinned session survives sessions-changed; a vanished one unpins', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const node = await createNode({ port: PORT_5, projects, home, startDir: 'C:\\dev\\sample-app' });
  const win = fakeWindow(162, 900);
  const stub = { meta: { name: 'example-number', sizes: [{ cols: 8, rows: 6 }] }, render() {} };
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${PORT_5}`, importModule: () => Promise.resolve(stub) });
    await settle(hud);
    const cur = hud.state.current;
    const other = cur === SID_A ? SID_B : SID_A;
    select(win.document.getElementById('hud').children[0].children[0], { session_id: other });
    await settle(hud);
    assert.equal(hud.state.current, other);

    // a new session begins in the folder: sessions-changed, the list grows, the pin stays
    const fresh = '0f1e2d3c-4b5a-4968-8777-665544332211';
    const before = hud.state.counts.dataLoads;
    cpSync(join(projects, SLUG, `${cur}.jsonl`), join(projects, SLUG, `${fresh}.jsonl`));
    await waitFor(() => hud.state.sessions.length === 3);
    await settle(hud);
    assert.ok(hud.state.counts.dataLoads > before, 'sessions-changed did not refresh');
    assert.equal(hud.state.sessions.length, 3);
    assert.equal(hud.state.current, other, 'pinned: sessions-changed does not move the current session');
    assert.equal(hud.state.pinned, true);
    assert.equal(hud.state.data.hud.sessions.length, 3);

    // the pinned session vanishes: unpinned, following the youngest again
    rmSync(join(projects, SLUG, `${other}.jsonl`));
    rmSync(join(projects, SLUG, other), { recursive: true, force: true });
    await waitFor(() => !hud.state.pinned);
    await settle(hud);
    assert.equal(hud.state.pinned, false);
    const youngest = (await (await fetch(`http://127.0.0.1:${PORT_5}/sessions`)).json()).current;
    assert.ok(youngest && youngest !== other, `youngest now ${youngest}`);
    assert.equal(hud.state.current, youngest);
    assert.equal(hud.state.data.hud.current, youngest);
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('draw: session-updated redraws keep the cell elements; the minute tick re-renders with the held data', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const node = await createNode({ port: PORT_6, projects, home, startDir: 'C:\\dev\\sample-app' });
  const win = fakeWindow(162, 900);
  let renders = 0;
  const stub = { meta: { name: 'example-number', sizes: [{ cols: 8, rows: 6 }] }, render() { renders++; } };
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${PORT_6}`, importModule: () => Promise.resolve(stub) });
    await settle(hud);
    const cells = () => [...win.document.getElementById('hud').children[0].children];
    const first = cells();
    assert.ok(first.length >= 1);
    const file = join(projects, SLUG, `${hud.state.current}.jsonl`);
    const last = readFileSync(file, 'utf8').trimEnd().split('\n').pop();
    for (let i = 0; i < 2; i++) {
      const loads = hud.state.counts.dataLoads;
      appendFileSync(file, `${last}\n`);
      await waitFor(() => hud.state.counts.dataLoads > loads);
      await settle(hud);
      assert.ok(hud.state.counts.dataLoads > loads, `redraw ${i + 1} did not happen`);
      assert.deepEqual(cells().map((c, j) => c === first[j]), first.map(() => true), `redraw ${i + 1}: same element identity`);
    }
    assert.equal(win.ticks.length, 1);
    assert.equal(win.ticks[0].ms, 60000);
    const [drawsBefore, loadsBefore, rendersBefore] = [hud.state.counts.draws, hud.state.counts.dataLoads, renders];
    win.ticks[0].fn();
    assert.equal(hud.state.counts.draws, drawsBefore + 1, 'the tick draws');
    assert.equal(hud.state.counts.dataLoads, loadsBefore, 'the tick does not fetch');
    assert.equal(renders, rendersBefore + first.length, 'the tick calls render on every cell');
    assert.deepEqual(cells().map((c, j) => c === first[j]), first.map(() => true));
    hud.close();
    assert.equal(win.ticks[0].cleared, true, 'close stops the tick');
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('layout by name in the page address: ?layout=<name> picks one layout for both shapes, anything else follows the settings', () => {
  assert.equal(layoutOverride('?layout=night-strip'), 'night-strip');
  assert.equal(layoutOverride('?x=1&layout=my%20strip'), 'my strip');
  assert.equal(layoutOverride(''), null);
  assert.equal(layoutOverride('?layout='), null);
  assert.equal(layoutOverride(undefined), null);
});

test('boot: a layout saved through the composer save path shows in the HUD by name (?layout=), the settings stay untouched', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const node = await createNode({ port: PORT_7, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT_7}`;
  let hud = { close() {} };
  try {
    const placed = [
      // the example tile: the one the DOM stand-in can draw (the shipped tiles draw SVG)
      { tile: 'example-number', col: 0, row: 0, size: { cols: 8, rows: 6 } },
      { tile: 'example-number', col: 0, row: 7, size: { cols: 8, rows: 6 } },
    ];
    const saved = await saveLayout((u, o) => fetch(u, o), url, layoutBody('Night Strip', 'portrait', placed));
    assert.equal(saved.status, 201, JSON.stringify(saved.json));
    const win = Object.assign(fakeWindow(162, 900), { location: { search: `?layout=${saved.json.slug}` } });
    hud = boot(win, { base: url, importModule: importOverHttp });
    await settle(hud);
    const root = win.document.getElementById('hud');
    assert.equal(root.dataset.layout, 'night-strip');
    assert.equal(root.dataset.orientation, 'portrait');
    assert.equal(root.children[1].textContent, '', `status line: ${root.children[1].textContent}`);
    assert.deepEqual(root.children[0].children.map((c) => `${c.className}:${c.dataset.tile}@${c.style.gridRow}`),
      ['tile:example-number@1 / span 6', 'tile:example-number@8 / span 6'], root.children[0].children.map((c) => c.textContent).join(' | '));
    assert.equal(existsSync(join(home, 'settings.json')), false, 'the HUD never writes the settings');
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('themeOverrides: the settings\' design_variables of one theme, only --aihud-… names with string values', () => {
  const settings = { design_variables: { dark: { '--aihud-bg': '#000000', '--other': '#111111', '--aihud-glow': 3 }, light: {} } };
  assert.deepEqual(themeOverrides(settings, 'dark'), [['--aihud-bg', '#000000']]);
  assert.deepEqual(themeOverrides(settings, 'light'), []);
  assert.deepEqual(themeOverrides({}, 'dark'), []);
  assert.deepEqual(themeOverrides(null, 'dark'), []);
});

test('settings-changed: a Save through POST /settings re-picks the layout and lays the colour overrides on <html>, taken back when removed', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const node = await createNode({ port: PORT_8, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT_8}`;
  const post = async (body) => fetch(`${url}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let hud = { close() {} };
  try {
    const win = fakeWindow(1400, 160);
    const props = {};
    win.document.documentElement.style = { setProperty: (n, v) => { props[n] = v; }, removeProperty: (n) => { delete props[n]; } };
    hud = boot(win, { base: url, importModule: importOverHttp });
    await settle(hud);
    const root = win.document.getElementById('hud');
    assert.equal(root.dataset.layout, 'essentials-landscape');
    assert.deepEqual(props, {}, 'no override before the save');
    const loadsBefore = hud.state.counts.layoutLoads;
    assert.equal((await post({ layout_landscape: 'minimal-landscape', design_variables: { dark: { '--aihud-heat-100': '#123456' }, light: {} } })).status, 200);
    await waitFor(() => root.dataset.layout === 'minimal-landscape');
    await settle(hud);
    assert.equal(root.dataset.layout, 'minimal-landscape', 'the saved landscape layout shows without a reload');
    assert.ok(hud.state.counts.layoutLoads > loadsBefore, 'the layout was loaded anew');
    assert.equal(win.document.documentElement.dataset.theme, 'dark');
    assert.deepEqual(props, { '--aihud-heat-100': '#123456' });
    assert.equal((await post({ design_variables: null })).status, 200);
    await waitFor(() => !('--aihud-heat-100' in props));
    assert.deepEqual(props, {}, 'a removed override is taken back');
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('settings-changed naming only window-only keys (last_tab, the window tab memory) makes the HUD neither reload its layout nor redraw; a real change still does', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const port = await freePort();
  const node = await createNode({ port, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${port}`;
  const post = async (body) => fetch(`${url}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  let hud = { close() {} };
  try {
    assert.deepEqual([...WINDOW_ONLY_SETTINGS], [...STORE_WINDOW_ONLY], 'the HUD and the node name the same window-only keys');
    const win = fakeWindow(1400, 160);
    hud = boot(win, { base: url, importModule: importOverHttp });
    await settle(hud);
    const before = { ...hud.state.counts };
    assert.equal((await post({ last_tab: 'layouts' })).status, 200);
    await new Promise((r) => setTimeout(r, 400));   // the settings-changed round trip
    await settle(hud);
    assert.equal(hud.state.counts.layoutLoads, before.layoutLoads, 'no layout reload for a tab memory write');
    assert.equal(hud.state.counts.draws, before.draws, 'no redraw for a tab memory write');
    // counter-check: a real change still redraws
    assert.equal((await post({ theme: 'light' })).status, 200);
    await waitFor(() => hud.state.counts.layoutLoads > before.layoutLoads && hud.state.counts.draws > before.draws);
    await settle(hud);
    assert.ok(hud.state.counts.draws > before.draws, 'and redrawing');
    // the events arrive in order, so exactly one reload proves the earlier last_tab event was seen and ignored
    assert.equal(hud.state.counts.layoutLoads, before.layoutLoads + 1, 'exactly one reload — the theme one, never one for last_tab');
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('boot: no session in the start folder -> hint "showing newest" (flag separate from mismatch); coexists with the mismatch notice', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ layout_portrait: 'probe-portrait', layout_landscape: 'probe-portrait' }));
  const port = await freePort();
  const node = await createNode({ port, projects, home, startDir: 'C:/dev/elsewhere'.replace(/\//g, '\\') });
  const win = fakeWindow(162, 900);
  let hud = { close() {} };
  try {
    hud = boot(win, { base: `http://127.0.0.1:${port}`, importModule: importOverHttp });
    await settle(hud);
    const root = win.document.getElementById('hud');
    assert.ok(hud.state.current, 'falls back to the newest session');
    assert.equal(root.dataset.fallback, 'true');
    assert.equal(root.dataset.mismatch, 'false', 'mismatch keeps its own meaning');
    assert.equal(root.children[1].textContent, 'no session in elsewhere \u2014 showing newest');
    win.resize(2000, 140);   // portrait layout in a landscape window: the notice joins the hint
    await settle(hud);
    assert.equal(root.dataset.mismatch, 'true');
    assert.equal(root.dataset.fallback, 'true');
    const text = root.children[1].textContent;
    assert.ok(text.includes('is portrait, the window is landscape') && text.includes('showing newest'), text);
  } finally { hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('fallback hint: pinned session suppresses it; switch-back when the start folder gets a session; POSIX start dir named by basename', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-hud-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const port = await freePort();
  const node = await createNode({ port, projects, home, startDir: 'C:\\dev\\elsewhere' });
  const url = `http://127.0.0.1:${port}`;
  const stub = { meta: { name: 'example-number', sizes: [{ cols: 8, rows: 6 }] }, render() {} };
  const win = fakeWindow(162, 900);
  let hud = { close() {} };
  let pinnedHud = { close() {} };
  try {
    // (a) booted with ?session=<id>: pinned, no hint
    const sessions = await (await fetch(`${url}/sessions`)).json();
    assert.equal(sessions.current_from, 'newest');
    assert.equal(sessions.start_dir_name, 'elsewhere');
    const pinId = sessions.sessions[sessions.sessions.length - 1].session_id;
    const pwin = fakeWindow(162, 900);
    pwin.location = { search: `?session=${encodeURIComponent(pinId)}` };
    pinnedHud = boot(pwin, { base: url, importModule: () => Promise.resolve(stub) });
    await settle(pinnedHud);
    const proot = pwin.document.getElementById('hud');
    assert.equal(pinnedHud.state.pinned, true);
    assert.equal(pinnedHud.state.current, pinId);
    assert.equal(proot.dataset.fallback, 'false');
    assert.ok(!/no session in/.test(proot.children[1].textContent), proot.children[1].textContent);
    // a select pick pins too
    hud = boot(win, { base: url, importModule: () => Promise.resolve(stub) });
    await settle(hud);
    const root = win.document.getElementById('hud');
    assert.equal(root.dataset.fallback, 'true');
    assert.equal(root.children[1].textContent, 'no session in elsewhere — showing newest');
    select(root.children[0].children[0], { session_id: pinId });
    await settle(hud);
    assert.equal(root.dataset.fallback, 'false', 'a select pick suppresses the hint');
    select(root.children[0].children[0], { session_id: null });   // back to following
    await settle(hud);
    // (b) the start folder gets a session: switch back, hint gone
    const dir = join(projects, 'C--dev-elsewhere');
    mkdirSync(dir, { recursive: true });
    const fresh = '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
    cpSync(join(projects, SLUG, `${SID_A}.jsonl`), join(dir, `${fresh}.jsonl`));
    await waitFor(() => hud.state.current === fresh);
    await settle(hud);
    assert.equal(hud.state.current, fresh);
    assert.equal(root.dataset.fallback, 'false');
    assert.ok(!/no session in/.test(root.children[1].textContent), root.children[1].textContent);
  } finally { pinnedHud.close(); hud.close(); await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('folderOf: start_dir_name wins; slug fallback strips a drive prefix and a leading dash (POSIX)', () => {
  assert.equal(folderOf({ start_dir_name: 'proj', start_slug: '-home-u-proj' }), 'proj');
  assert.equal(folderOf({ start_slug: '-home-u-proj' }), 'home-u-proj');
  assert.equal(folderOf({ start_slug: 'C--dev-app' }), 'dev-app');
  assert.equal(folderOf({}), 'the start folder');
});

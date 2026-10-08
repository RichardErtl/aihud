// Probes for the 12 tiles of style fancy-a and its two shipped layouts. Run: `npm test`
// Data comes from the reader over its fixtures (never typed in by hand); the DOM is a minimal fake
// that knows what the tiles use (elements, SVG elements, attributes, listeners, events).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';
import { layoutViolation } from '../node/layout-schema.js';
import { catalog } from '../node/store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(HERE, 'contract.json'), 'utf8'));
// The blocks of the four first styles (the release styles add blocks of their own; layouts and the per-style
// tile sets below are about these only: a block with no standard size is not part of the four first styles).
const CLASSIC = C.contentBlocks.filter((b) => C.sizes[b].standard);
const STYLE = 'fancy-a';
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

function sheetOf(id) {
  const inv = inventory({ root: FIXTURES, nowMs: NOW });
  return contractSheet(buildSheet(loadSession(findSession(inv, id)), { nowMs: NOW }), { device: 'laptop', state: 'awake' });
}
const SHEETS = { A: sheetOf(A), B: sheetOf(B) };
/** Every type missing, each named the way the reader names it. */
const BARE = { version: C.readerVersion, not_delivered: ['session:id_or_started_at', 'live:device_comes_from_host', 'turn:session_id', 'context:session_id', 'agents:session_id'] };

// fancy-a ships everything but skills (contract.json: null = the layouts use the fancy-b twin)
const BLOCKS = CLASSIC.filter((b) => C.sizes[b][STYLE] !== null);
const twinOf = (b, o) => `${b}-${C.sizes[b][STYLE] === null ? 'fancy-b' : STYLE}-${o}`;   // the tile a fancy-a layout places
const NAMES = BLOCKS.flatMap((b) => C.orientations.map((o) => `${b}-${STYLE}-${o}`));
const TILES = new Map();
for (const name of NAMES) TILES.set(name, await import(pathToFileURL(join(HERE, `${name}.js`)).href));

/** The metadata check a shipped tile has to pass (the rules of contract.test.js `checkMeta`). */
function checkMeta(m) {
  const errors = [];
  for (const k of C.meta.keys) if (!(k in m)) errors.push(`missing ${k}`);
  for (const k of Object.keys(m)) if (!C.meta.keys.includes(k)) errors.push(`extra ${k}`);
  if (!C.contentBlocks.includes(m.contentBlock)) errors.push(`contentBlock ${m.contentBlock}`);
  if (!C.styles.includes(m.style)) errors.push(`style ${m.style}`);
  if (!C.orientations.includes(m.orientation)) errors.push(`orientation ${m.orientation}`);
  if (!Array.isArray(m.sizes) || m.sizes.length !== 1) errors.push('shipped tiles have exactly one size');
  else {
    const want = C.sizes[m.contentBlock]?.[m.style]?.[m.orientation];
    if (!want || m.sizes[0].cols !== want.cols || m.sizes[0].rows !== want.rows) errors.push('size is not the table size');
  }
  if (m.contractVersion !== C.contractVersion) errors.push(`contractVersion ${m.contractVersion}`);
  return errors;
}

// ── a minimal DOM ───────────────────────────────────────────────────────────
function fakeDoc() {
  const doc = {
    defaultView: null, listeners: {},
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    removeEventListener(t, fn) { this.listeners[t] = (this.listeners[t] || []).filter((f) => f !== fn); },
  };
  const node = (tag, ns = null) => ({
    tag, ns, attrs: {}, style: { cssText: '' }, textContent: '', children: [], parent: null, listeners: {}, events: [], ownerDocument: doc,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    append(...c) { for (const x of c) { x.parent = this; this.children.push(x); } },
    replaceChildren(...c) { this.children = []; this.append(...c); },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; },
    contains(x) { for (let p = x; p; p = p.parent) if (p === this) return true; return false; },
    addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); },
    dispatchEvent(e) { this.events.push(e); return true; },
  });
  doc.createElement = (tag) => node(tag);
  doc.createElementNS = (ns, tag) => node(tag, ns);
  return doc;
}
const all = (n) => [n, ...n.children.flatMap(all)];
const texts = (n) => all(n).map((x) => x.textContent).filter(Boolean);
const byRole = (n, role) => all(n).filter((x) => x.attrs['data-role'] === role);
/** A click: the element's own listeners, then the document's (bubbling, as far as the tiles need it). */
function click(doc, target) {
  const ev = { type: 'click', target };
  for (const fn of target.listeners.click || []) fn(ev);
  for (const fn of [...(doc.listeners.click || [])]) fn(ev);
}
function draw(name, data, unit = 20) {
  const doc = fakeDoc();
  const el = doc.createElement('div');
  const [s] = TILES.get(name).meta.sizes;
  TILES.get(name).render(el, data, { ...s, unit });
  return { doc, el };
}
const tok = (n) => (n < 1e6 ? `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`);
const inst = (s) => s.live.instances[0];

// ── the tiles ───────────────────────────────────────────────────────────────
test('fancy-a: 12 tiles, each meta per contract, name = file name, size = the table size', () => {
  let checked = 0;
  for (const [name, mod] of TILES) {
    const [block, orientation] = [name.slice(0, name.indexOf(`-${STYLE}-`)), name.slice(name.lastIndexOf('-') + 1)];
    assert.equal(typeof mod.render, 'function', `${name} exports render`);
    assert.deepEqual(checkMeta(mod.meta), [], `${name} meta`);
    assert.equal(mod.meta.name, name, `${name}: meta.name is the file name`);
    assert.deepEqual([mod.meta.contentBlock, mod.meta.style, mod.meta.orientation], [block, STYLE, orientation], name);
    assert.deepEqual(mod.meta.sizes, [C.sizes[block][STYLE][orientation]], `${name} size`);
    checked++;
  }
  assert.equal(checked, 12, `trip-wire: ${checked} tiles checked`);
  const onDisk = readdirSync(HERE).filter((f) => f.includes(`-${STYLE}-`) && f.endsWith('.js') && !f.endsWith('.test.js')).sort();
  assert.deepEqual(onDisk, NAMES.map((n) => `${n}.js`).sort(), 'no other fancy-a module in the folder');
});

test('fancy-a: every tile draws reader data, {} and a bare sheet at its size, redrawn completely', () => {
  let draws = 0;
  for (const [name, mod] of TILES) {
    const [s] = mod.meta.sizes;
    for (const unit of [20, 22.5]) {
      const doc = fakeDoc();
      const el = doc.createElement('div');
      for (const data of [SHEETS.A, SHEETS.B, {}, BARE, undefined]) {
        mod.render(el, data, { ...s, unit });
        assert.equal(el.children.length, 1, `${name}: one box, not appended`);
        assert.ok(el.children[0].style.cssText.startsWith(`width:${s.cols * unit}px;height:${s.rows * unit}px;`), `${name} at ${unit}: ${el.children[0].style.cssText.slice(0, 40)}`);
        draws++;
      }
    }
  }
  assert.equal(draws, 12 * 2 * 5, `trip-wire: ${draws} draws`);
});

test('fancy-a: honest empty state — a dash, never a number; not_delivered is named', () => {
  let checked = 0;
  for (const name of NAMES) {
    for (const data of [{}, BARE]) {
      const { el } = draw(name, data);
      const shown = all(el).filter((n) => n.attrs['data-role'] !== 'clock').map((n) => n.textContent).join(' ');
      assert.doesNotMatch(shown, /\d/, `${name}: no number without data (${shown})`);
      assert.match(shown, /–/, `${name}: a dash marks the empty value`);
      checked++;
    }
    const title = draw(name, BARE).el.children[0].getAttribute('title') || '';
    assert.match(title, /not delivered: \w+:\w+/, `${name}: the tile names what the reader did not deliver (${title})`);
  }
  assert.equal(checked, 24, `trip-wire: ${checked}`);
});

test('fancy-a: the numbers are the reader\'s numbers', () => {
  const a = SHEETS.A;
  const b = SHEETS.B;
  for (const o of C.orientations) {
    // context: fill and total tokens
    const ctx = draw(`context-${STYLE}-${o}`, a).el;
    assert.equal(texts(byRole(ctx, 'percent')[0]).join(''), `${inst(a).context_percent.toFixed(1)}%`, `context ${o}`);
    assert.equal(byRole(ctx, 'total')[0].textContent, tok(inst(a).tokens_total));
    // top three: the three heaviest subagents by tokens_self, heaviest first
    const heavy = a.agents.nodes.filter((n) => n.parent_id && typeof n.tokens_self === 'number')
      .sort((x, y) => y.tokens_self - x.tokens_self).slice(0, 3);
    assert.equal(heavy.length, 3, 'trip-wire: fixture A has three measured subagents');
    const top = draw(`top-three-subagents-${STYLE}-${o}`, a).el;
    const shownTypes = byRole(top, 'subagent').map((n) => n.textContent || texts(n).at(-1));
    assert.deepEqual(shownTypes, heavy.map((n) => n.agent_type), `top three ${o}`);
    const share = (100 * heavy[0].tokens_self / inst(a).tokens_total).toFixed(1);
    assert.ok(texts(top).join('').includes(`${share}%`), `top three ${o}: share ${share}`);
    // time: the last turn's number
    const time = draw(`time-${STYLE}-${o}`, b).el;
    assert.equal(byRole(time, 'turn')[0].textContent, String(b.turn.turns.at(-1).number));
    // tokens: models, total
    const tokens = draw(`tokens-${STYLE}-${o}`, b).el;
    assert.deepEqual(byRole(tokens, 'part').map((n) => n.textContent).sort(),
      Object.keys(inst(b).tokens_by_model).map((k) => k.replace(/^claude-/, '')).sort());
    assert.equal(byRole(tokens, 'centre')[0].textContent, tok(inst(b).tokens_total));
    assert.ok(texts(tokens).some((t) => t.includes(`${tok(inst(b).tokens_main)} / `)), `tokens ${o}: main / sub split`);
    // subagents: count and roles
    const subs = draw(`subagents-${STYLE}-${o}`, a).el;
    assert.equal(byRole(subs, 'centre')[0].textContent, String(a.agents.nodes.filter((n) => n.parent_id).length));
    assert.deepEqual(byRole(subs, 'part').map((n) => n.textContent).sort(),
      Object.keys(inst(a).tokens_by_agent_type).filter((k) => k !== 'main').sort());
    // skills: fancy-a ships none (the skills-fancy-b tile is probed in fancy-b.test.js)
    // header: session id and the last skill
    const head = draw(`header-${STYLE}-${o}`, b).el;
    assert.equal(byRole(head, 'sid')[0].textContent, b.session.id.slice(0, 8));
    const last = b.turn.turns.flatMap((t) => t.skills || []).sort((x, y) => x.time.localeCompare(y.time)).at(-1).name;
    assert.ok(texts(head).includes(`/${last}`), `header ${o}: last skill /${last}`);
  }
});

test('fancy-a: the header carries the session switch — click the id, pick, the event bubbles', () => {
  let picks = 0;
  for (const o of C.orientations) {
    const name = `header-${STYLE}-${o}`;
    const hud = {
      current: A, pinned: null,
      sessions: [{ session_id: A, project_slug: 'c--dev-sample-app', age_seconds: 42, title: 't1' },
        { session_id: B, project_slug: 'c--dev-sample-app', age_seconds: 7200, title: 't2' }],
    };
    const { doc, el } = draw(name, { ...SHEETS.A, hud });
    const sid = byRole(el, 'sid')[0];
    assert.equal(sid.tag, 'button', `${name}: the id is a button when data.hud is there`);
    click(doc, sid);
    let list = byRole(el, 'session-list')[0];
    assert.ok(list, `${name}: a click opens the list`);
    const rows = all(list).filter((n) => n.attrs.role === 'option');
    assert.equal(rows.length, 3, 'follow newest + two sessions');
    assert.deepEqual(rows.map((r) => r.attrs['aria-selected']), ['true', 'true', 'false'], 'not pinned = following; current marked');
    click(doc, rows[2]);
    assert.equal(el.events.length, 1);
    const [ev] = el.events;
    assert.equal(ev.type, 'aihud:select-session');
    assert.equal(ev.bubbles, true);
    assert.deepEqual(ev.detail, { session_id: B });
    assert.equal(byRole(el, 'session-list').length, 0, 'a pick closes the list');
    click(doc, sid);
    list = byRole(el, 'session-list')[0];
    click(doc, all(list).filter((n) => n.attrs.role === 'option')[0]);
    assert.deepEqual(el.events[1].detail, { session_id: null }, 'follow newest');
    click(doc, sid);
    click(doc, byRole(el, 'session-backdrop')[0]);   // a click elsewhere (the backdrop) closes it
    assert.equal(doc.listeners.click, undefined, 'no document listener is left behind');
    assert.equal(byRole(el, 'session-list').length, 0, 'an outside click closes the list');
    assert.equal(el.events.length, 2, 'no event without a pick');
    picks += 2;
    // an older HUD without data.hud: the id as plain text, no list, no error
    const plain = draw(name, SHEETS.A);
    const span = byRole(plain.el, 'sid')[0];
    assert.equal(span.tag, 'span');
    assert.deepEqual(span.listeners, {}, 'nothing to click');
    assert.equal(span.textContent, A.slice(0, 8));
  }
  assert.equal(picks, 4, `trip-wire: ${picks} picks`);
});

test('fancy-a: colours only through the contract\'s design variables', () => {
  const known = new Set(C.designVariables.map((d) => d.name));
  let used = 0;
  for (const name of NAMES) {
    const src = readFileSync(join(HERE, `${name}.js`), 'utf8');
    assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, `${name}: no fixed colour`);
    for (const [, v] of src.matchAll(/var\((--aihud-[a-z0-9-]+)\)/g)) { assert.ok(known.has(v), `${name}: ${v} is a design variable`); used++; }
  }
  assert.ok(used >= 12 * 3, `trip-wire: ${used} variable uses`);
});

// ── the layouts ─────────────────────────────────────────────────────────────
test('fancy-a: the two shipped layouts — exact keys, the transcription arrangement, valid against the real catalog', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aihud-fancy-a-'));
  try {
    const entries = await catalog(home);
    for (const name of NAMES) {
      const e = entries.find((x) => x.kind === 'tile' && x.name === name);
      assert.ok(e && e.loadable && e.meta.orientation, `${name} is a loadable catalog tile`);
    }
    const size = (tile) => entries.find((e) => e.kind === 'tile' && e.name === tile).meta.sizes[0];
    for (const o of C.orientations) {
      const file = `${STYLE}-${o}`;
      const layout = JSON.parse(readFileSync(join(HERE, '..', 'layouts', `${file}.json`), 'utf8'));
      assert.deepEqual(Object.keys(layout), C.layoutFile.keys, file);
      for (const p of layout.tiles) assert.deepEqual(Object.keys(p), C.layoutFile.placementKeys, file);
      assert.equal(layout.orientation, o);
      assert.ok(entries.some((e) => e.kind === 'layout' && e.name === file), `${file} is in the catalog`);
      assert.equal(layoutViolation(layout, entries), null, `${file} passes the node's layout check`);
      // the arrangement fixed by contract.test.js "the sizes add up to the shipped layouts"
      const at = Object.fromEntries(CLASSIC.map((b) => [b, layout.tiles.find((p) => p.tile === twinOf(b, o))]));
      assert.ok(Object.values(at).every(Boolean), `${file}: every block placed with its tile (the fancy-b twin for skills)`);
      assert.deepEqual(layout.tiles.map((p) => p.tile).sort(), CLASSIC.map((b) => twinOf(b, o)).sort(), `${file}: exactly these tiles`);
      assert.equal(layout.tiles.length, CLASSIC.length, `${file}: one tile per block`);
      const want = {};
      if (o === 'portrait') {
        let row = 0;
        for (const b of CLASSIC) { want[b] = { col: 0, row }; row += size(twinOf(b, o)).rows; }
      } else {
        want.header = { col: 0, row: 0 };
        want.time = { col: 0, row: size(twinOf('header', o)).rows };
        let col = Math.max(size(twinOf('header', o)).cols, size(twinOf('time', o)).cols);
        for (const b of CLASSIC.filter((x) => x !== 'header' && x !== 'time')) { want[b] = { col, row: 0 }; col += size(twinOf(b, o)).cols; }
      }
      for (const b of CLASSIC) assert.deepEqual({ col: at[b].col, row: at[b].row }, want[b], `${file}: ${b}`);
      if (o === 'portrait') {
        assert.deepEqual(CLASSIC.map((b) => at[b].tile), layout.tiles.map((p) => p.tile), `${file}: contentBlocks order`);
      }
      const ext = layout.tiles.reduce((m, p) => ({ cols: Math.max(m.cols, p.col + size(p.tile).cols), rows: Math.max(m.rows, p.row + size(p.tile).rows) }), { cols: 0, rows: 0 });
      assert.deepEqual(ext, C.layouts[STYLE][o], `${file}: extent = contract.json layouts`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('fancy-a heat: a high context fill draws other colours than a low one', () => {
  const drawn = (v) => all(draw(`context-${STYLE}-portrait`, { live: { instances: [{ context_percent: v, tokens_total: 1000 }] } }).el)
    .map((n) => [n.style.cssText, n.getAttribute('style')].filter(Boolean).join(';')).filter((s) => s.includes('--aihud-heat')).join('|');
  const [low, high] = [drawn(10), drawn(90)];
  assert.ok(low && high, 'both draw with the heat variables');
  assert.notEqual(high, low);
});

test('fancy-a context: the whole-number part of the percent is the big figure (~1.4-1.5x of the old 36)', () => {
  let checked = 0;
  for (const o of C.orientations) {
    const ctx = draw(`context-${STYLE}-${o}`, SHEETS.A).el;
    const pct = byRole(ctx, 'percent')[0];
    const [whole, tenths] = pct.children;
    const w = Number(whole.attrs['font-size']);
    assert.ok(w >= 36 * 1.4 && w <= 36 * 1.5, `${o}: whole size ${w} (want 50.4..54)`);
    assert.equal(Number(tenths.attrs['font-size']), 20, `${o}: tenths size (+2 px)`);
    assert.ok(Number(tenths.attrs['font-size']) <= w / 2.5, `${o}: tenths stay small`);
    const y = Number(pct.attrs.y);
    assert.ok(y >= 104 && y <= 110, `${o}: percent baseline y ${y} keeps the figure centred in the ring`);
    // the figure must clear the total line: cap height ~0.72 em above the baseline, total line at its own y
    const tot = byRole(ctx, 'total')[0];
    assert.ok(Number(tot.attrs.y) - Number(tot.attrs['font-size']) * 0.72 - y >= 8, `${o}: gap between percent and total line`);
    assert.ok(y - w * 0.72 >= 100 - 82, `${o}: top of the figure inside the ring hole`);
    checked++;
  }
  assert.equal(checked, 2, 'trip-wire: both orientations checked');
});

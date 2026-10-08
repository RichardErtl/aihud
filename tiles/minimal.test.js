// Probes for the 14 Minimal tiles and the two shipped Minimal layouts (plan A4a-2).
// Run: `npm test`. Data comes from the reader over its own fixtures, never typed by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';
import { catalog } from '../node/store.js';
import { layoutViolation, layoutChecks } from '../node/layout-schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(HERE, 'contract.json'), 'utf8'));
// The blocks of the four first styles (the release styles add blocks of their own; layouts and the per-style
// tile sets below are about these only: a block with no standard size is not part of the four first styles).
const CLASSIC = C.contentBlocks.filter((b) => C.sizes[b].standard);
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const STYLE = 'minimal';
const NAMES = CLASSIC.flatMap((b) => C.orientations.map((o) => ({ block: b, orientation: o, name: `${b}-${STYLE}-${o}` })));

// ── data: the reader over its fixtures ──────────────────────────────────────
const INV = inventory({ root: FIXTURES, nowMs: NOW });
const SESSIONS = INV.projects.flatMap((p) => p.sessions.map((s) => ({ ...s, slug: p.slug })));
const sheetOf = (id, host = { device: 'laptop', state: 'awake' }) =>
  contractSheet(buildSheet(loadSession(findSession(INV, id)), { nowMs: NOW }), host);
const SHEETS = SESSIONS.map((s) => sheetOf(s.session_id));
const WITH_SKILLS = SHEETS.find((d) => d.turn && d.turn.turns.some((t) => Array.isArray(t.skills) && t.skills.length));
/** The HUD's session list as the HUD will hand it in (`data.hud`), built from the reader's inventory. */
const hudOf = (current, pinned = null) => ({
  current, pinned,
  sessions: SESSIONS.map((s) => ({ session_id: s.session_id, project_slug: s.slug, age_seconds: Math.round((NOW - s.mtime_ms) / 1000), title: null })),
});

// ── a small DOM: elements, svg elements, attributes, events that bubble ─────
class FakeNode {
  constructor(doc, tag) {
    this.ownerDocument = doc; this.tag = tag; this.children = []; this.parentNode = null;
    this.attrs = {}; this.listeners = {}; this.style = { cssText: '' }; this.own = '';
  }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { for (const c of this.children) c.parentNode = null; this.children = []; this.own = String(v); }
  append(...cs) {
    for (const c of cs) {
      assert.ok(c instanceof FakeNode, 'tiles append elements only (text goes through textContent)');
      if (c.parentNode) c.parentNode.removeChild(c);
      c.parentNode = this; this.children.push(c);
    }
  }
  replaceChildren(...cs) { for (const c of this.children) c.parentNode = null; this.children = []; this.own = ''; this.append(...cs); }
  removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; return c; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  dispatchEvent(ev) {
    for (let n = this; n; n = ev.bubbles ? n.parentNode : null) for (const f of [...(n.listeners[ev.type] || [])]) f.call(n, ev);
    return true;
  }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}
function fakeElement() {
  const doc = {
    listeners: {},
    createElement: (t) => new FakeNode(doc, t),
    createElementNS: (ns, t) => { assert.equal(ns, 'http://www.w3.org/2000/svg'); return new FakeNode(doc, t); },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); },
    removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); },
  };
  return new FakeNode(doc, 'div');
}
const all = (n) => [n, ...n.children.flatMap(all)];
/** Every text a tile shows, minus the scale labels of an axis (0 / 50 / 100 are drawing, not data). */
const texts = (el) => all(el).filter((n) => n.own && n.attrs['text-anchor'] !== 'end' && n.tag !== 'title').map((n) => n.own);
/** A name as shown: whole, or cut with "…" and whole in the hover title. */
const showsName = (el, name) => all(el).some((n) => n.tag !== 'title' && (n.own === name
  || (n.own.endsWith('…') && name.startsWith(n.own.slice(0, -1)) && n.children.some((c) => c.tag === 'title' && c.own === name))));
const click = (node) => node.dispatchEvent({ type: 'click', bubbles: true, target: node });

const MODULES = new Map();
for (const t of NAMES) MODULES.set(t.name, await import(`./${t.name}.js`));

/** The metadata check of `contract.test.js`, rule for rule. Returns the list of problems. */
function checkMeta(m) {
  const errors = [];
  for (const k of C.meta.keys) if (!(k in m)) errors.push(`missing ${k}`);
  if (Object.keys(m).some((k) => !C.meta.keys.includes(k))) errors.push('extra meta key');
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

test('the 14 Minimal tiles: file name = meta.name, meta after the contract, size = the table', () => {
  let checked = 0;
  for (const t of NAMES) {
    const m = MODULES.get(t.name);
    assert.equal(typeof m.render, 'function', `${t.name} exports render`);
    assert.deepEqual(checkMeta(m.meta), [], t.name);
    assert.equal(m.meta.name, t.name, `${t.name}: meta.name = file name`);
    assert.deepEqual([m.meta.contentBlock, m.meta.style, m.meta.orientation], [t.block, STYLE, t.orientation], t.name);
    assert.deepEqual(m.meta.sizes[0], C.sizes[t.block][STYLE][t.orientation], t.name);
    checked++;
  }
  assert.equal(checked, 14, `trip-wire: ${checked} Minimal tiles checked`);
  const onDisk = readdirSync(HERE).filter((f) => /-minimal-(portrait|landscape)\.js$/.test(f)).sort();
  assert.deepEqual(onDisk, NAMES.map((t) => `${t.name}.js`).sort(), 'no Minimal tile file beyond the 14');
  assert.deepEqual(checkMeta({ ...MODULES.get(NAMES[0].name).meta, sizes: [{ cols: 8, rows: 3 }] }), ['size is not the table size'], 'the check bites');
});

test('every Minimal tile draws the reader data at exactly its size, at unit 20 and 22.5', () => {
  assert.ok(SHEETS.length >= 2, `trip-wire: ${SHEETS.length} fixture sheets`);
  let draws = 0;
  for (const t of NAMES) {
    const { meta, render } = MODULES.get(t.name);
    const [s] = meta.sizes;
    for (const data of SHEETS) {
      for (const unit of [20, 22.5]) {
        const el = fakeElement();
        render(el, data, { ...s, unit });
        assert.equal(el.children.length, 1, `${t.name}: one box`);
        assert.match(el.children[0].style.cssText, new RegExp(`^width:${s.cols * unit}px;height:${s.rows * unit}px;`), `${t.name} @${unit}`);
        const shown = texts(el);
        assert.ok(shown.length >= 2, `${t.name} shows text`);
        assert.ok(shown.every((x) => !/NaN|undefined|null|Infinity/.test(x)), `${t.name}: ${shown.join('|')}`);
        render(el, data, { ...s, unit });
        assert.equal(el.children.length, 1, `${t.name}: redrawn completely, not appended`);
        draws++;
      }
    }
  }
  assert.equal(draws, 14 * SHEETS.length * 2, `trip-wire: ${draws} draws`);
});

test('the numbers are the reader\'s numbers', () => {
  const size = (name) => ({ ...MODULES.get(name).meta.sizes[0], unit: 20 });
  const drawEl = (name, data) => { const el = fakeElement(); MODULES.get(name).render(el, data, size(name)); return el; };
  const draw = (name, data) => texts(drawEl(name, data));
  let checks = 0;
  for (const data of SHEETS) {
    const i = data.live.instances[0];
    for (const o of C.orientations) {
      assert.ok(draw(`context-minimal-${o}`, data).join('').includes(i.context_percent.toFixed(1).split('.')[0]), 'context percent');
      assert.ok(draw(`tokens-minimal-${o}`, data).includes(`${(i.tokens_total / 1e6).toFixed(1)}M`), 'total tokens');
      const subs = data.agents.nodes.filter((n) => n.parent_id != null).length;
      assert.ok(draw(`subagents-minimal-${o}`, data).includes(String(subs)), 'subagent count');
      const turns = data.turn.turns;
      assert.ok(draw(`time-minimal-${o}`, data).includes(String(turns[turns.length - 1].number)), 'turn number');
      const heaviest = data.agents.nodes.filter((n) => n.parent_id != null && n.tokens_self != null).sort((a, b) => b.tokens_self - a.tokens_self)[0];
      assert.ok(showsName(drawEl(`top-three-subagents-minimal-${o}`, data), heaviest.agent_type), `heaviest type ${heaviest.agent_type}`);
      assert.ok(draw(`header-minimal-${o}`, data).includes(data.session.id.slice(0, 8)), 'session id');
      checks += 6;
    }
  }
  assert.ok(WITH_SKILLS, 'a fixture session started skills');
  const names = WITH_SKILLS.turn.turns.flatMap((t) => (t.skills || []).map((s) => s.name));
  for (const o of C.orientations) {
    const shown = draw(`skills-minimal-${o}`, WITH_SKILLS);
    for (const n of names) assert.ok(shown.includes(n), `skill ${n} listed`);
    checks++;
  }
  assert.ok(checks >= 26, `trip-wire: ${checks} value checks`);
});

test('empty state: no data draws the dash, never a number; not_delivered goes on the hover title', () => {
  let n = 0;
  const noLive = sheetOf(SESSIONS[0].session_id, {});
  assert.ok(!noLive.live && noLive.not_delivered.some((x) => x.startsWith('live:')), 'the reader names the missing live type');
  for (const t of NAMES) {
    const { meta, render } = MODULES.get(t.name);
    for (const data of [{}, null, undefined, { version: '1.0', not_delivered: [] }]) {
      const el = fakeElement();
      assert.doesNotThrow(() => render(el, data, { ...meta.sizes[0], unit: 20 }), t.name);
      const shown = texts(el);
      assert.ok(shown.includes('–'), `${t.name} draws the dash`);
      const numbers = shown.filter((x) => /\d/.test(x) && !(t.block === 'header' && /^\d\d:\d\d$/.test(x)));
      assert.deepEqual(numbers, [], `${t.name}: no invented number`);
      n++;
    }
  }
  for (const o of C.orientations) {
    for (const block of ['context', 'tokens']) {
      const el = fakeElement();
      MODULES.get(`${block}-minimal-${o}`).render(el, noLive, { ...MODULES.get(`${block}-minimal-${o}`).meta.sizes[0], unit: 20 });
      assert.ok(texts(el).includes('–'), `${block} ${o}: no live, a dash`);
      assert.match(el.children[0].getAttribute('title') || '', /not delivered: live:device_comes_from_host/, `${block} ${o} names what is missing`);
      n++;
    }
  }
  assert.equal(n, 14 * 4 + 4, `trip-wire: ${n} empty draws`);
});

test('header: click on the session id opens the list; picking dispatches aihud:select-session', () => {
  let rounds = 0;
  const [a, b] = SESSIONS.map((s) => s.session_id);
  for (const o of C.orientations) {
    const { meta, render } = MODULES.get(`header-minimal-${o}`);
    const size = { ...meta.sizes[0], unit: 20 };
    const el = fakeElement();
    const got = [];
    el.addEventListener('aihud:select-session', (ev) => got.push(ev.detail));
    const data = { ...sheetOf(b), hud: hudOf(b) };
    render(el, data, size);
    const sid = all(el).find((x) => x.own === b.slice(0, 8));
    assert.ok(sid, 'the session id is shown');
    assert.equal(sid.getAttribute('role'), 'button');
    click(sid);
    assert.equal(el.children.length, 2, `${o}: the list opened`);
    const list = el.children[1];
    const rows = list.children;
    assert.equal(rows.length, 1 + SESSIONS.length, 'follow newest + one row per session');
    assert.equal(rows[0].children[0].own, 'follow newest');
    const rowA = rows.find((r) => r.getAttribute('data-session') === a);
    click(rowA);
    assert.deepEqual(got, [{ session_id: a }], `${o}: picking a session dispatches its id`);
    assert.equal(el.children.length, 1, 'the list closed');
    click(sid);
    click(el.children[1].children[0]);
    assert.deepEqual(got[1], { session_id: null }, 'follow newest dispatches null');
    click(sid);
    assert.equal(el.children.length, 2);
    render(el, data, size);
    assert.equal(el.children.length, 2, 'an open list survives a redraw');
    for (const f of el.ownerDocument.listeners.click) f({ target: fakeElement() });
    assert.equal(el.children.length, 1, 'a click outside closes it');
    assert.deepEqual(el.ownerDocument.listeners.click, [], 'no listener left behind');

    const plain = fakeElement();
    render(plain, sheetOf(b), size);
    const bare = all(plain).find((x) => x.own === b.slice(0, 8));
    assert.equal(bare.getAttribute('role'), null, 'without data.hud the id is plain text');
    assert.doesNotThrow(() => click(bare));
    assert.equal(plain.children.length, 1, 'no list without data.hud');
    rounds++;
  }
  assert.equal(rounds, 2, `trip-wire: ${rounds} header tiles`);
});

test('the two Minimal layouts: exact keys, the transcription arrangement, valid against the real catalog', async () => {
  const size = (b, o) => C.sizes[b][STYLE][o];
  const tile = (b, o) => `${b}-${STYLE}-${o}`;
  let row = 0;
  const portrait = CLASSIC.map((b) => { const p = { tile: tile(b, 'portrait'), col: 0, row }; row += size(b, 'portrait').rows; return p; });
  const first = Math.max(size('header', 'landscape').cols, size('time', 'landscape').cols);
  let col = first;
  const landscape = [
    { tile: tile('header', 'landscape'), col: 0, row: 0 },
    { tile: tile('time', 'landscape'), col: 0, row: size('header', 'landscape').rows },
    ...CLASSIC.filter((b) => b !== 'header' && b !== 'time').map((b) => { const p = { tile: tile(b, 'landscape'), col, row: 0 }; col += size(b, 'landscape').cols; return p; }),
  ];
  const home = mkdtempSync(join(tmpdir(), 'aihud-minimal-'));
  try {
    const entries = await catalog(home);
    const runs = layoutChecks.runs;
    for (const [o, want] of [['portrait', portrait], ['landscape', landscape]]) {
      const body = JSON.parse(readFileSync(join(HERE, '..', 'layouts', `${STYLE}-${o}.json`), 'utf8'));
      assert.deepEqual(Object.keys(body), C.layoutFile.keys, `${o}: exactly the layout keys`);
      assert.equal(body.orientation, o);
      for (const p of body.tiles) assert.deepEqual(Object.keys(p), C.layoutFile.placementKeys);
      assert.deepEqual(body.tiles, want, `${o}: the arrangement of contract.test.js`);
      assert.equal(layoutViolation(body, entries), null, `${o} passes the node's schema`);
      const cols = Math.max(...body.tiles.map((p) => p.col + MODULES.get(p.tile).meta.sizes[0].cols));
      const rows = Math.max(...body.tiles.map((p) => p.row + MODULES.get(p.tile).meta.sizes[0].rows));
      assert.deepEqual({ cols, rows }, C.layouts[STYLE][o], `${o} extent = contract.json layouts`);
      const catalogued = entries.find((e) => e.kind === 'layout' && e.name === `${STYLE}-${o}`);
      assert.ok(catalogued && catalogued.loadable, `${o} is in the catalog`);
      // the schema bites on this very layout: one tile moved onto its neighbour
      const moved = structuredClone(body);
      moved.tiles[1].row -= 1;
      assert.match(layoutViolation(moved, entries), /overlaps/, `${o}: a moved tile is refused`);
    }
    const mixed = JSON.parse(readFileSync(join(HERE, '..', 'layouts', `${STYLE}-landscape.json`), 'utf8'));
    mixed.tiles[0].tile = tile('header', 'portrait');
    assert.match(layoutViolation(mixed, entries), /orientation_mismatch/, 'a portrait tile in the landscape layout is refused');
    assert.ok(layoutChecks.runs >= runs + 5, `trip-wire: the schema ran ${layoutChecks.runs - runs} times`);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('top-three-subagents: caption + aria say "share of session tokens", against the root total', () => {
  for (const o of C.orientations) {
    const name = `top-three-subagents-minimal-${o}`;
    let aria = 0;
    for (const data of SHEETS) {
      const el = fakeElement(); MODULES.get(name).render(el, data, { ...MODULES.get(name).meta.sizes[0], unit: 20 });
      assert.ok(texts(el).includes('share of tokens'), `${name}: caption`);
      const nodes = data.agents.nodes;
      const total = nodes.find((n) => n.parent_id == null).tokens_total;
      const top = nodes.filter((n) => n.parent_id != null && n.tokens_self != null).sort((a, b) => b.tokens_self - a.tokens_self)[0];
      if (!top) continue;
      const want = `${top.agent_type} ${((top.tokens_self / total) * 100).toFixed(1)} % of session tokens`;
      assert.ok(all(el).some((n) => n.attrs['aria-label'] === want), `${name}: aria "${want}"`);
      aria++;
    }
    assert.ok(aria > 0, 'at least one fixture session has subagents');
  }
});

test('header: a redraw on the same element leaves exactly one clock timer', () => {
  const made = [], cleared = [];
  const real = [globalThis.setInterval, globalThis.clearInterval];
  globalThis.setInterval = (f, ms) => { const t = { f, ms }; made.push(t); return t; };
  globalThis.clearInterval = (t) => { cleared.push(t); };
  try {
    for (const o of C.orientations) {
      made.length = 0; cleared.length = 0;
      const m = MODULES.get(`header-minimal-${o}`);
      const el = fakeElement(); const size = { ...m.meta.sizes[0], unit: 20 };
      m.render(el, SHEETS[0], size); const first = el._aihudClock;
      m.render(el, SHEETS[0], size);
      assert.equal(made.length, 2, 'two renders, two timers created');
      assert.deepEqual(cleared, [first], 'the first timer was cleared by the second render');
      assert.notEqual(el._aihudClock, first);
      assert.equal(made[1].ms, 10000);
      made[1].f();   // the tile was never attached (isConnected unset): the timer clears itself
      assert.equal(cleared[cleared.length - 1], made[1], 'a detached tile stops its own timer');
    }
  } finally { [globalThis.setInterval, globalThis.clearInterval] = real; }
});

test('time: above an hour the runtime reads h:mm:ss, never 141:33', () => {
  for (const o of C.orientations) {
    const m = MODULES.get(`time-minimal-${o}`);
    const data = structuredClone(SHEETS[0]);
    data.turn.turns[data.turn.turns.length - 1].duration_s = 8493;   // 2 h 21 min 33 s
    const el = fakeElement(); m.render(el, data, { ...m.meta.sizes[0], unit: 20 });
    assert.ok(texts(el).includes('2:21:33'), `${o}: 2:21:33 shown`);
    assert.ok(!texts(el).includes('141:33'));
    data.turn.turns[data.turn.turns.length - 1].duration_s = 3600;
    const el2 = fakeElement(); m.render(el2, data, { ...m.meta.sizes[0], unit: 20 });
    assert.ok(texts(el2).includes('1:00:00'), `${o}: 3600 s is 1:00:00`);
  }
});

test('top-three-subagents: a root total of 0 draws three dashes, no number, no aria text', () => {
  for (const o of C.orientations) {
    const name = `top-three-subagents-minimal-${o}`;
    const data = structuredClone(SHEETS.find((d) => d.agents.nodes.some((n) => n.parent_id != null && n.tokens_self != null)));
    data.agents.nodes.find((n) => n.parent_id == null).tokens_total = 0;
    data.live.instances[0].tokens_total = 0;
    const el = fakeElement(); MODULES.get(name).render(el, data, { ...MODULES.get(name).meta.sizes[0], unit: 20 });
    assert.equal(texts(el).filter((t) => t === '–').length >= 3, true, `${name}: dashes`);
    assert.ok(!texts(el).some((t) => /\d/.test(t)), `${name}: no number`);
    assert.ok(!all(el).some((n) => n.attrs['aria-label']), `${name}: no aria text`);
  }
});

test('skills portrait at 8 x 3: up to two skills all shown, a third folds to 1 name + "… +2" (capacity of the 3-row footprint)', () => {
  const m = MODULES.get('skills-minimal-portrait');
  assert.deepEqual(m.meta.sizes[0], { cols: 8, rows: 3 }, 'the measured footprint (results/aihud-tiles-1-2026-10-02)');
  const two = structuredClone(WITH_SKILLS);
  const names = [...new Set(two.turn.turns.flatMap((t) => (t.skills || []).map((s) => s.name)))];
  assert.equal(names.length, 2, 'trip-wire: the fixture starts two skills');
  const draw = (data) => { const el = fakeElement(); m.render(el, data, { ...m.meta.sizes[0], unit: 20 }); return texts(el); };
  const shownTwo = draw(two);
  for (const n of names) assert.ok(shownTwo.includes(n), `two skills: ${n} shown`);
  assert.ok(!shownTwo.some((t) => /^[+][0-9]/.test(t)), 'two skills: no fold');
  const three = structuredClone(WITH_SKILLS);
  const last = three.turn.turns.at(-1);
  last.skills = [...(last.skills || []), { name: 'third-skill', time: '2026-09-10T11:59:00.000Z' }];
  const shownThree = draw(three);
  assert.equal([...names, 'third-skill'].filter((n) => shownThree.includes(n)).length, 1, `three skills: one name shown (${shownThree.join('|')})`);
  assert.ok(shownThree.includes('…') && shownThree.includes('+2'), `three skills: "… +2" (${shownThree.join('|')})`);
});

test('minimal heat: a high context fill draws other colours than a low one', () => {
  const drawn = (v) => {
    const el = fakeElement();
    const m = MODULES.get(`context-${STYLE}-portrait`);
    m.render(el, { live: { instances: [{ context_percent: v, tokens_total: 1000 }] } }, { ...m.meta.sizes[0], unit: 20 });
    return all(el).map((n) => [n.style.cssText, n.getAttribute('style')].filter(Boolean).join(';')).filter((s) => s.includes('--aihud-heat')).join('|');
  };
  const [low, high] = [drawn(10), drawn(90)];
  assert.ok(low && high, 'both draw with the heat variables');
  assert.notEqual(high, low);
});

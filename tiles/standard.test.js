// Probes for the 14 tiles of style `standard` and its two shipped layouts. Run: `npm test`
// Data: the reader's own sheets over `reader/fixtures` (never typed numbers). DOM: a minimal
// stand-in below — enough for tiles that build elements, SVG and one click path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const HOST = { device: 'laptop', state: 'awake' };
const STYLE = 'standard';

const NAMES = CLASSIC.flatMap((b) => C.orientations.map((o) => `${b}-${STYLE}-${o}`));
const MODULES = new Map(await Promise.all(NAMES.map(async (n) => [n, existsSync(join(HERE, `${n}.js`)) ? await import(`./${n}.js`) : null])));

// ── the reader's sheets ──────────────────────────────────────────────────────

const INV = inventory({ root: FIXTURES, nowMs: NOW });
const SESSIONS = INV.projects.flatMap((p) => p.sessions);
const sheetOf = (id) => contractSheet(buildSheet(loadSession(findSession(INV, id)), { nowMs: NOW }), HOST);
const SHEETS = SESSIONS.map((s) => sheetOf(s.session_id));
/** The fixture with skills (the richer sheet): every tile has something to draw. */
const RICH = SHEETS.find((s) => s.turn.turns.some((t) => Array.isArray(t.skills) && t.skills.length));
/** The HUD's session list in the shape the header expects, built from the reader's inventory. */
const HUD = {
  current: RICH.session.id,
  pinned: null,
  sessions: SESSIONS.map((s) => ({ session_id: s.session_id, project_slug: s.project_slug, age_seconds: s.age_seconds })),
};

// ── a minimal DOM ────────────────────────────────────────────────────────────

class Node extends EventTarget {
  constructor(doc, tag) {
    super();
    Object.assign(this, { ownerDocument: doc, tagName: tag, children: [], attributes: {}, style: { cssText: '' }, own: '' });
  }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.own = String(v); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.own = ''; this.children = [...nodes]; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
}
function makeElement() {
  const doc = {
    createElement: (tag) => new Node(doc, tag),
    createElementNS: (_ns, tag) => new Node(doc, tag),
    createTextNode: (t) => { const n = new Node(doc, '#text'); n.own = String(t); return n; },
  };
  return doc.createElement('div');
}
const walk = (n, out = []) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
/** Texts that stand for a data value: not the gauge scale, not the viewer's clock. */
const valueTexts = (el) => walk(el)
  .filter((n) => n.own && n.getAttribute('data-scale') == null && n.getAttribute('data-clock') == null)
  .map((n) => n.own);
const text = (el) => walk(el).map((n) => n.own).join(' ').replace(/\s+/g, ' ');
const boxSize = (el) => el.children[0].style.cssText.match(/^width:([\d.]+)px;height:([\d.]+)px/).slice(1).map(Number);

// ── the checks ───────────────────────────────────────────────────────────────

/** The metadata check of contract.test.js (same rules), plus: exactly the contract's keys. */
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

test('14 standard tiles: each file exists, exports meta + render, meta passes the contract check', () => {
  let checked = 0;
  for (const name of NAMES) {
    const mod = MODULES.get(name);
    assert.ok(mod, `${name}.js exists`);
    assert.equal(typeof mod.render, 'function', `${name} exports render`);
    assert.deepEqual(checkMeta(mod.meta), [], name);
    assert.equal(mod.meta.name, name, 'meta.name is the file name');
    const [block, orientation] = [name.slice(0, name.indexOf(`-${STYLE}-`)), name.slice(name.lastIndexOf('-') + 1)];
    assert.deepEqual([mod.meta.contentBlock, mod.meta.style, mod.meta.orientation], [block, STYLE, orientation]);
    assert.deepEqual(mod.meta.sizes, [C.sizes[block][STYLE][orientation]], `${name}: sizes = contract.json`);
    checked++;
  }
  assert.equal(checked, 14, `trip-wire: ${checked} tiles checked`);
});

test('every tile draws the reader sheets and the empty sheet at its exact box, redrawn not appended', () => {
  const sheets = [...SHEETS, {}, null, { version: '1.0', not_delivered: ['live:device_comes_from_host'] }];
  let draws = 0;
  for (const name of NAMES) {
    const { meta, render } = MODULES.get(name);
    const [{ cols, rows }] = meta.sizes;
    for (const unit of [20, 22.5]) {
      const el = makeElement();
      for (const sheet of sheets) {
        assert.doesNotThrow(() => render(el, sheet, { cols, rows, unit }), `${name} · ${unit}`);
        assert.equal(el.children.length, 1, `${name}: one box, redrawn completely`);
        assert.deepEqual(boxSize(el), [cols * unit, rows * unit], `${name}: cols × unit by rows × unit`);
        draws++;
      }
    }
  }
  assert.equal(draws, 14 * 2 * sheets.length, `trip-wire: ${draws} draws`);
});

test('empty state: every tile draws a dash and no number when the reader delivered nothing', () => {
  let checked = 0;
  for (const name of NAMES) {
    const { meta, render } = MODULES.get(name);
    for (const sheet of [{}, { version: '1.0', not_delivered: ['live:device_comes_from_host'] }]) {
      const el = makeElement();
      render(el, sheet, { ...meta.sizes[0], unit: 20 });
      const values = valueTexts(el);
      assert.ok(values.includes('–'), `${name}: a dash (${values.join(' | ')})`);
      assert.deepEqual(values.filter((t) => /\d/.test(t)), [], `${name}: no invented number`);
      checked++;
    }
  }
  assert.equal(checked, 28);
});

test('the tiles show the reader values (computed from the sheet, not typed)', () => {
  const S = RICH;
  const inst = S.live.instances[0];
  const draw = (name) => { const el = makeElement(); render(name, el); return text(el); };
  function render(name, el, sheet = S) { const { meta, render: r } = MODULES.get(name); r(el, sheet, { ...meta.sizes[0], unit: 20 }); }
  const tok = (n) => (n >= 999500 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);
  const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
  const last = S.turn.turns.at(-1);
  const skills = S.turn.turns.flatMap((t) => t.skills || []);
  const lastSkill = skills.reduce((a, b) => (Date.parse(b.time) > Date.parse(a.time) ? b : a));
  const root = S.agents.nodes.find((n) => n.parent_id == null);
  const heavy = S.agents.nodes.filter((n) => n.parent_id != null && typeof n.tokens_self === 'number')
    .sort((a, b) => b.tokens_self - a.tokens_self)[0];
  let seen = 0;
  for (const o of C.orientations) {
    const n = (b) => `${b}-${STYLE}-${o}`;
    assert.ok(draw(n('header')).includes(S.session.id.slice(0, 8)), 'header: session id');
    assert.ok(draw(n('header')).includes(`/${lastSkill.name}`), 'header: last skill');
    const [whole, tenth] = inst.context_percent.toFixed(1).split('.');
    assert.ok(draw(n('context')).includes(`${whole} .${tenth}%`), 'context: percent');
    assert.ok(draw(n('context')).includes(tok(inst.tokens_total)), 'context: total tokens');
    assert.ok(draw(n('top-three-subagents')).includes(heavy.agent_type), 'three heaviest: type');
    assert.ok(draw(n('top-three-subagents')).includes(((heavy.tokens_self / root.tokens_total) * 100).toFixed(1).split('.')[0]), 'three heaviest: share');
    assert.match(draw(n('time')), new RegExp(`Turn\\s+${last.number}\\b`), 'time: turn number');
    assert.ok(draw(n('time')).includes(mmss(last.duration_s)), 'time: turn runtime');
    assert.ok(draw(n('time')).includes(mmss((Date.parse(inst.last_activity) - Date.parse(S.session.started_at)) / 1000)), 'time: session runtime');
    assert.ok(draw(n('tokens')).includes(tok(inst.tokens_total)), 'tokens: total');
    assert.ok(draw(n('tokens')).includes(`${tok(inst.tokens_main)} / ${tok(inst.tokens_total - inst.tokens_main)}`), 'tokens: main / sub');
    for (const m of Object.keys(inst.tokens_by_model)) assert.ok(draw(n('tokens')).includes(m.replace(/^claude-/, '')), `tokens: model ${m}`);
    assert.ok(draw(n('subagents')).includes(String(S.agents.nodes.length - 1)), 'subagents: count');
    for (const t of Object.keys(inst.tokens_by_agent_type).filter((k) => k !== 'main')) assert.ok(draw(n('subagents')).includes(t), `subagents: ${t}`);
    for (const s of skills) assert.ok(draw(n('skills')).includes(s.name), `skills: ${s.name}`);
    seen++;
  }
  assert.equal(seen, 2);
});

test('header: click on the session id opens the list, a pick dispatches aihud:select-session', () => {
  const { meta, render } = MODULES.get(`header-${STYLE}-portrait`);
  for (const name of [`header-${STYLE}-portrait`, `header-${STYLE}-landscape`]) {
    const { meta: m, render: r } = MODULES.get(name);
    const el = makeElement();
    const events = [];
    el.addEventListener('aihud:select-session', (e) => events.push(e));
    r(el, { ...RICH, hud: HUD }, { ...m.sizes[0], unit: 20 });
    assert.equal(el.children.length, 2, `${name}: box + the list`);
    const list = el.children[1];
    const sid = walk(el.children[0]).find((n) => n.tagName === 'button');
    assert.ok(sid, 'the session id is a button');
    assert.equal(sid.textContent, RICH.session.id.slice(0, 8));
    assert.equal(list.style.display, 'none', 'closed at first');
    sid.dispatchEvent(new Event('click'));
    assert.equal(list.style.display, 'block', 'open after the click');
    const rows = list.children;
    assert.equal(rows.length, 1 + HUD.sessions.length, 'follow newest + one row per session');
    const other = HUD.sessions.find((s) => s.session_id !== HUD.current);
    rows.find((b) => b.getAttribute('data-session-id') === other.session_id).dispatchEvent(new Event('click'));
    assert.equal(list.style.display, 'none', 'closed after the pick');
    rows[0].dispatchEvent(new Event('click'));
    assert.equal(events.length, 2, 'trip-wire: two picks, two events');
    assert.deepEqual(events.map((e) => e.detail), [{ session_id: other.session_id }, { session_id: null }]);
    assert.ok(events.every((e) => e.bubbles && e.type === 'aihud:select-session'));
    assert.equal(rows.find((b) => b.getAttribute('data-session-id') === HUD.current).getAttribute('aria-selected'), 'true', 'current marked');
  }
  // an older HUD without `data.hud`: the id without the list, no error
  for (const hud of [undefined, null, {}, { sessions: 'x' }]) {
    const el = makeElement();
    assert.doesNotThrow(() => render(el, { ...RICH, hud }, { ...meta.sizes[0], unit: 20 }));
    assert.equal(el.children.length, 1, 'no list');
    assert.equal(walk(el).some((n) => n.tagName === 'button'), false, 'the id is plain text');
    assert.ok(text(el).includes(RICH.session.id.slice(0, 8)));
  }
});

test('the two shipped layouts: arrangement per the transcription rule, extent = contract, schema-valid', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aihud-standard-'));
  try {
    const entries = await catalog(home);
    const size = (b, o) => C.sizes[b][b === 'context' ? 'backlight' : STYLE][o];   // the context slot carries the backlight wedge
    let checked = 0;
    for (const o of C.orientations) {
      const file = join(HERE, '..', 'layouts', `${STYLE}-${o}.json`);
      const layout = JSON.parse(readFileSync(file, 'utf8'));
      assert.deepEqual(Object.keys(layout), C.layoutFile.keys);
      for (const p of layout.tiles) assert.deepEqual(Object.keys(p), C.layoutFile.placementKeys);
      assert.equal(layout.orientation, o);
      assert.equal(layoutViolation(layout, entries), null, `${o}: the node's check passes`);
      // the rule of contract.test.js "the sizes add up to the shipped layouts", as placements
      const want = [];
      if (o === 'portrait') {
        let row = 0;
        // since 08.10. the standard portrait layout carries the backlight wedge; the gauge moved to essentials
        for (const b of CLASSIC) { want.push({ tile: b === 'context' ? `context-backlight-${o}` : `${b}-${STYLE}-${o}`, col: 0, row }); row += size(b, o).rows; }
      } else {
        want.push({ tile: `header-${STYLE}-${o}`, col: 0, row: 0 }, { tile: `time-${STYLE}-${o}`, col: 0, row: size('header', o).rows });
        let col = Math.max(size('header', o).cols, size('time', o).cols);
        for (const b of CLASSIC.filter((x) => x !== 'header' && x !== 'time')) { want.push({ tile: b === 'context' ? `context-backlight-${o}` : `${b}-${STYLE}-${o}`, col, row: 0 }); col += size(b, o).cols; }
      }
      assert.deepEqual([...layout.tiles].sort((a, b) => a.tile.localeCompare(b.tile)), want.sort((a, b) => a.tile.localeCompare(b.tile)), `${o}: placements`);
      const ext = layout.tiles.reduce((e, p) => {
        const z = entries.find((x) => x.name === p.tile).meta.sizes[0];
        return { cols: Math.max(e.cols, p.col + z.cols), rows: Math.max(e.rows, p.row + z.rows) };
      }, { cols: 0, rows: 0 });
      assert.deepEqual(ext, C.layouts[STYLE][o], `${o}: extent = contract.json layouts`);
      // the check bites: the same layout with a tile of the other orientation is refused
      const other = o === 'portrait' ? 'landscape' : 'portrait';
      const swapped = { ...layout, tiles: layout.tiles.map((p, i) => (i === 0 ? { ...p, tile: p.tile.replace(o, other) } : p)) };
      assert.equal(layoutViolation(swapped, entries), 'tiles[0].tile:orientation_mismatch');
      checked++;
    }
    assert.equal(checked, 2);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('standard heat: a high context fill draws other colours than a low one', () => {
  const drawn = (v) => {
    const el = makeElement();
    const m = MODULES.get(`context-${STYLE}-portrait`);
    m.render(el, { live: { instances: [{ context_percent: v, tokens_total: 1000 }] } }, { ...m.meta.sizes[0], unit: 20 });
    return walk(el).map((n) => [n.style.cssText, n.getAttribute('style')].filter(Boolean).join(';')).filter((s) => s.includes('--aihud-heat')).join('|');
  };
  const [low, high] = [drawn(10), drawn(90)];
  assert.ok(low && high, 'both draw with the heat variables');
  assert.notEqual(high, low);
});

// ── value marks (CONTRACT.md "Value marks and the tip") ──────────────────────

const NUMERAL = ['glance', 'skills', 'time'].flatMap((b) => C.orientations.map((o) => `${b}-numeral-${o}`));
const NUMERAL_MODULES = new Map(await Promise.all(NUMERAL.map(async (n) => [n, await import(`./${n}.js`)])));
const CATALOG = new Set(C.fields.map((f) => f.path));

test('value marks: every data-field path of the standard and numeral tiles exists in the catalog (contract.json)', () => {
  // a sheet without live data: the tiles must fall back and mark the field they actually read
  const FALLBACK = { session: { provider: 'p', model: 'm', started_at: '2026-09-10T10:00:00Z' }, windows: { p: { m: 200000 } },
    context: { points: [{ time: '2026-09-10T10:05:00Z', percent: 42, tokens_in_window: 80000, turn_number: 1 }] } };
  const sheets = [...SHEETS, FALLBACK, {}, null];
  const seen = new Set();
  let marks = 0;
  const check = (name, field) => {
    const paths = field.split(' ');
    assert.ok(paths.every(Boolean), `${name}: no empty path in "${field}"`);
    for (const p of paths) { assert.ok(CATALOG.has(p), `${name}: data-field path ${p} is in the catalog`); seen.add(p); }
    marks++;
  };
  for (const [name, mod] of [...MODULES, ...NUMERAL_MODULES]) {
    for (const sheet of sheets) {
      const el = makeElement();
      mod.render(el, sheet && sheet.session ? { ...sheet, hud: HUD } : sheet, { ...mod.meta.sizes[0], unit: 20 });
      for (const n of walk(el)) { const f = n.getAttribute('data-field'); if (f != null) check(name, f); }
      for (const m of String(el.innerHTML || '').matchAll(/data-field="([^"]*)"/g)) check(name, m[1]);
    }
  }
  assert.ok(marks > 100, `trip-wire: ${marks} marks seen`);
  for (const p of ['live.instances[].context_percent', 'context.points[].percent', 'windows.<key>.<key>', 'session.id']) {
    assert.ok(seen.has(p), `${p} is marked somewhere (incl. the fallback sheet)`);
  }
  // the clock has no reader field: it carries no mark
  const el = makeElement();
  const h = MODULES.get(`header-${STYLE}-portrait`);
  h.render(el, RICH, { ...h.meta.sizes[0], unit: 20 });
  assert.equal(walk(el).find((n) => n.getAttribute('data-clock') != null).getAttribute('data-field'), null, 'clock: no data-field');
});

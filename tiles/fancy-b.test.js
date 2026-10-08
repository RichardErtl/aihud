// Probes for the 10 fancy-b tiles and the two fancy-b layouts (CONTRACT.md + contract.json).
// fancy-b ships only the blocks where it differs from fancy-a (contract.json: a null size = no
// fancy-b tile); header and tokens are fancy-a's, their probes live in fancy-a.test.js.
// Run: `npm test`
// Data comes from the reader over the transcript fixtures, never typed in by hand; the session
// list of the header is built from the reader's own inventory of those fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';
import { layoutViolation, layoutChecks, tileSize } from '../node/layout-schema.js';
import { catalog } from '../node/store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const C = JSON.parse(readFileSync(join(HERE, 'contract.json'), 'utf8'));
// The blocks of the four first styles (the release styles add blocks of their own; layouts and the per-style
// tile sets below are about these only: a block with no standard size is not part of the four first styles).
const CLASSIC = C.contentBlocks.filter((b) => C.sizes[b].standard);
const STYLE = 'fancy-b';
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const INV = inventory({ root: FIXTURES, nowMs: NOW });
const SESSIONS = INV.projects.flatMap((p) => p.sessions);
const SHEETS = SESSIONS.map((s) => contractSheet(buildSheet(loadSession(findSession(INV, s.session_id)), { nowMs: NOW }),
  { device: 'laptop', state: 'awake' }));

const BLOCKS = CLASSIC.filter((b) => C.sizes[b][STYLE] !== null);
const twinOf = (b, o) => `${b}-${C.sizes[b][STYLE] === null ? 'fancy-a' : STYLE}-${o}`;   // the tile a fancy-b layout places
const NAMES = BLOCKS.flatMap((b) => C.orientations.map((o) => ({ block: b, orientation: o, name: `${b}-${STYLE}-${o}` })));
const TILES = await Promise.all(NAMES.map(async (t) => ({ ...t, mod: await import(`./${t.name}.js`), src: readFileSync(join(HERE, `${t.name}.js`), 'utf8') })));
const tile = (block, orientation) => TILES.find((t) => t.block === block && t.orientation === orientation);

/** The metadata check a shipped tile has to pass — the same rules as checkMeta in contract.test.js. */
function checkMeta(m) {
  const errors = [];
  for (const k of C.meta.keys) if (!(k in m)) errors.push(`missing ${k}`);
  for (const k of Object.keys(m)) if (!C.meta.keys.includes(k)) errors.push(`unknown key ${k}`);
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

// ── a small DOM: enough for tiles that build elements, SVG and text nodes and handle a click ──
class Node {
  constructor(doc, tag, ns) {
    Object.assign(this, { ownerDocument: doc, tagName: tag, namespaceURI: ns, attrs: new Map(), children: [], parentNode: null, style: {}, dispatched: [] });
  }
  setAttribute(k, v) { this.attrs.set(k, String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  append(...kids) { for (const k of kids) { k.parentNode = this; this.children.push(k); } }
  replaceChildren(...kids) { this.children = []; this.append(...kids); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(this.ownerDocument.createTextNode(v)); }
  closest(sel) {
    const attr = sel.match(/^\[([\w-]+)\]$/)[1];
    for (let n = this; n; n = n.parentNode) if (n.attrs && n.attrs.has(attr)) return n;
    return null;
  }
  dispatchEvent(e) { this.dispatched.push(e); return true; }
}
function fakeElement() {
  const doc = {
    createElement: (t) => new Node(doc, t, null),
    createElementNS: (ns, t) => new Node(doc, t, ns),
    createTextNode: (v) => ({ nodeType: 3, textContent: String(v) }),
    defaultView: null,
  };
  return new Node(doc, 'div', null);
}
function* walk(n) { yield n; for (const c of n.children || []) yield* walk(c); }
/** Text of the drawing, skipping the viewer's clock (value #13 is not a reader value). */
const texts = (n) => (n.nodeType === 3 ? [n.textContent] : (n.attrs && n.attrs.has('data-clock')) || n.tagName === 'style' ? [] : (n.children || []).flatMap(texts));
const joined = (el) => texts(el).join(' ');

let renders = 0;
function draw(t, data, unit = 20) {
  const el = fakeElement();
  const [size] = t.mod.meta.sizes;
  t.mod.render(el, data, { ...size, unit });
  renders++;
  return el;
}
const M = (n) => `${(n / 1e6).toFixed(1)}M`;

test('fancy-b: 10 tiles, each with meta per the contract and its file name', () => {
  assert.deepEqual(BLOCKS, ['context', 'top-three-subagents', 'time', 'subagents', 'skills'], 'the blocks fancy-b ships');
  let checked = 0;
  for (const t of TILES) {
    const m = t.mod.meta;
    assert.equal(typeof t.mod.render, 'function', `${t.name} exports render`);
    assert.deepEqual(checkMeta(m), [], t.name);
    assert.deepEqual(Object.keys(m), C.meta.keys, `${t.name} meta keys in contract order`);
    assert.equal(m.name, t.name, 'meta.name is the file name');
    assert.deepEqual([m.contentBlock, m.style, m.orientation], [t.block, STYLE, t.orientation]);
    assert.deepEqual(m.sizes, [C.sizes[t.block][STYLE][t.orientation]], `${t.name} size = contract.json`);
    checked++;
  }
  assert.equal(checked, 10, `trip-wire: ${checked} tiles checked`);
});

test('fancy-b: every tile fills exactly its cell and redraws completely (fixtures, unit 20 and 22.5)', () => {
  assert.ok(SHEETS.length >= 2, `trip-wire: ${SHEETS.length} fixture sheets`);
  const before = renders;
  for (const t of TILES) {
    const [size] = t.mod.meta.sizes;
    for (const sheet of SHEETS) {
      for (const unit of [20, 22.5]) {
        const el = draw(t, sheet, unit);
        t.mod.render(el, sheet, { ...size, unit });   // second call on the same element
        assert.equal(el.children.length, 1, `${t.name}: one box after two renders, nothing appended`);
        assert.match(el.children[0].getAttribute('style'), new RegExp(`^width:${size.cols * unit}px;height:${size.rows * unit}px;`), t.name);
      }
    }
  }
  assert.equal(renders - before, 10 * SHEETS.length * 2, 'trip-wire: every tile × sheet × unit rendered');
});

test('fancy-b: the tiles show what the reader delivers', () => {
  for (const sheet of SHEETS) {
    const inst = sheet.live.instances[0];
    for (const o of C.orientations) {
      const ctx = joined(draw(tile('context', o), sheet));
      const [whole, tenth] = inst.context_percent.toFixed(1).split('.');
      assert.ok(ctx.includes(`${whole} .${tenth} %`) && ctx.includes(M(inst.tokens_total)), `context ${o}: ${ctx}`);

      const subs = sheet.agents.nodes.filter((n) => n.parent_id != null);
      const sub = joined(draw(tile('subagents', o), sheet));
      assert.match(sub, new RegExp(`(^| )${subs.length} [0-9.]+[kM]? tokens`), `subagents ${o}: count ${subs.length} in ${sub}`);
      for (const role of Object.keys(inst.tokens_by_agent_type).filter((r) => r !== 'main')) assert.ok(sub.includes(role), `role ${role}`);

      const heavy = subs.filter((n) => typeof n.tokens_self === 'number').sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3);
      const three = joined(draw(tile('top-three-subagents', o), sheet));
      assert.ok(heavy.length >= 2, 'trip-wire: the fixture has subagents with tokens');
      assert.deepEqual(three.split(' ').filter((w) => /^[a-z]{2,}/.test(w)), heavy.map((n) => n.agent_type), `heaviest first: ${three}`);

      const last = sheet.turn.turns.at(-1);
      assert.ok(joined(draw(tile('time', o), sheet)).includes(String(last.number)), `time ${o}: turn ${last.number}`);
    }
  }
  const withSkills = SHEETS.filter((s) => s.turn.turns.some((t) => t.skills));
  assert.ok(withSkills.length >= 1, 'trip-wire: a fixture with skills');
  for (const sheet of withSkills) {
    const names = [...new Set(sheet.turn.turns.flatMap((t) => (t.skills || []).map((s) => s.name)))].sort();
    assert.ok(names.length >= 1 && names.length <= 3, `trip-wire: ${names.length} distinct skills fit the 3 rows`);
    for (const o of C.orientations) {
      // the tile draws label, then per row: name, count, tokens
      const cells = texts(draw(tile('skills', o), sheet)).slice(1);
      assert.deepEqual(cells.filter((_, i) => i % 3 === 0).sort(), names, `skills ${o}: the drawn rows are exactly the skills`);
    }
  }
  // a fixture with turns delivered and no skill started: the empty text, no number
  const noSkill = SHEETS.filter((s) => s.turn && Array.isArray(s.turn.turns) && s.turn.turns.length && !s.turn.turns.some((t) => t.skills));
  assert.ok(noSkill.length >= 1, 'trip-wire: a fixture with turns and no skill');
  for (const o of C.orientations) {
    const sk = joined(draw(tile('skills', o), noSkill[0]));
    assert.ok(sk.includes('no skill calls this session'), `skills ${o}: the empty text when no skill started`);
    assert.doesNotMatch(sk, /\d/, `skills ${o}: no number when no skill started`);
  }
});

test('fancy-b: honest empty state — {} and not_delivered draw a dash, never a number', () => {
  const sheet = SHEETS[0];
  const cut = { ...sheet, not_delivered: [...sheet.not_delivered, 'session', 'live', 'turn', 'context', 'agents'] };
  let checked = 0;
  for (const t of TILES) {
    for (const data of [{}, cut, null]) {
      const text = joined(draw(t, data));
      assert.ok(text.includes('–'), `${t.name}: a dash in "${text}"`);
      assert.doesNotMatch(text, /\d/, `${t.name}: no number without data ("${text}")`);
      checked++;
    }
  }
  assert.equal(checked, 30, `trip-wire: ${checked} empty renders`);
});

test('fancy-b: colours only through the design variables', () => {
  const known = new Set(C.designVariables.map((d) => d.name));
  let vars = 0;
  for (const t of TILES) {
    assert.doesNotMatch(t.src, /#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i, `${t.name}: no fixed colour in the source`);
    for (const [, name] of t.src.matchAll(/var\((--[a-z0-9-]+)/g)) { assert.ok(known.has(name), `${t.name}: ${name} is a design variable`); vars++; }
    for (const n of walk(draw(t, SHEETS[0]))) {
      for (const k of ['fill', 'stroke']) {
        const v = n.getAttribute && n.getAttribute(k);
        if (v != null) assert.match(v, /^url\(#/, `${t.name}: ${k}="${v}" is a gradient reference`);
      }
      const style = (n.getAttribute && n.getAttribute('style')) || '';
      assert.doesNotMatch(style, /#|rgba?\(|hsla?\(/, `${t.name}: style "${style}"`);
    }
  }
  assert.ok(vars >= 10 * 3, `trip-wire: ${vars} variable uses checked`);
});

test('fancy-b layouts: exact keys, schema-valid against the node catalog, arranged per the contract rule', async () => {
  const entries = (await catalog(join(HERE, '..', 'no-such-home'), { packageDir: join(HERE, '..') })).filter((e) => e.kind === 'tile');
  assert.equal(entries.filter((e) => e.name.includes(`-${STYLE}-`)).length, 10, 'the node catalog lists the 10 tiles');
  const runs = layoutChecks.runs;
  for (const o of C.orientations) {
    const layout = JSON.parse(readFileSync(join(HERE, '..', 'layouts', `${STYLE}-${o}.json`), 'utf8'));
    assert.deepEqual(Object.keys(layout), C.layoutFile.keys);
    assert.equal(layout.name, `${STYLE}-${o}`);
    assert.equal(layout.orientation, o);
    for (const p of layout.tiles) assert.deepEqual(Object.keys(p), C.layoutFile.placementKeys);
    assert.equal(layoutViolation(layout, entries), null, `${o} layout passes the node's check`);

    const size = (b) => tileSize(entries.find((e) => e.name === twinOf(b, o)).meta);
    assert.deepEqual(layout.tiles.map((p) => p.tile).sort(), CLASSIC.map((b) => twinOf(b, o)).sort(), `${o}: fancy-b tiles, the fancy-a twin for header and tokens`);
    const at = Object.fromEntries(layout.tiles.map((p) => [p.tile.replace(new RegExp(`-fancy-[ab]-${o}$`), ''), [p.col, p.row]]));
    assert.deepEqual(Object.keys(at).sort(), [...CLASSIC].sort(), `${o}: each block once`);
    const want = {};
    if (o === 'portrait') {
      let row = 0;
      for (const b of CLASSIC) { want[b] = [0, row]; row += size(b).rows; }
    } else {
      want.header = [0, 0];
      want.time = [0, size('header').rows];
      let col = Math.max(size('header').cols, size('time').cols);
      for (const b of CLASSIC.filter((x) => x !== 'header' && x !== 'time')) { want[b] = [col, 0]; col += size(b).cols; }
    }
    assert.deepEqual(at, want, `${o}: arrangement per the transcription rule`);
    const ext = layout.tiles.reduce((e, p) => {
      const z = tileSize(entries.find((x) => x.name === p.tile).meta);
      return { cols: Math.max(e.cols, p.col + z.cols), rows: Math.max(e.rows, p.row + z.rows) };
    }, { cols: 0, rows: 0 });
    assert.deepEqual(ext, C.layouts[STYLE][o], `${o}: extent = contract.json layouts`);
  }
  assert.equal(layoutChecks.runs - runs, 2, 'trip-wire: the schema check ran for both layouts');
  // the check bites: a portrait tile in the landscape layout, and an overlap
  const land = JSON.parse(readFileSync(join(HERE, '..', 'layouts', `${STYLE}-landscape.json`), 'utf8'));
  assert.equal(layoutViolation({ ...land, tiles: [{ tile: `context-${STYLE}-portrait`, col: 0, row: 0 }] }, entries), 'tiles[0].tile:orientation_mismatch');
  assert.equal(layoutViolation({ ...land, tiles: [land.tiles[0], { ...land.tiles[1], row: 1 }] }, entries), 'tiles[1]:overlaps_tiles[0]');
});

test('fancy-b heat: a high context fill glows in other colours than a low one', () => {
  const drawn = (v) => [...walk(draw(tile('context', 'portrait'), { live: { instances: [{ context_percent: v, tokens_total: 1000 }] } }))]
    .map((n) => (n.getAttribute && n.getAttribute('style')) || '').filter((s) => s.includes('--aihud-heat')).join('|');
  const [low, high] = [drawn(10), drawn(90)];
  assert.ok(low && high, 'both draw with the heat variables');
  assert.notEqual(high, low);
});

test('fancy-b context: the whole-number part of the percent is the big figure (~1.4-1.5x of the old 34)', () => {
  let checked = 0;
  for (const o of C.orientations) {
    const ctx = draw(tile('context', o), SHEETS[0]);
    const pct = [...walk(ctx)].find((n) => n.tagName === 'text' && n.children.some((k) => k.tagName === 'tspan'));
    assert.ok(pct, `${o}: percent text found`);
    const [whole, tenth] = pct.children;
    const w = Number(whole.getAttribute('font-size'));
    assert.ok(w >= 34 * 1.4 && w <= 34 * 1.55, `${o}: whole size ${w} (want 47.6..52.7)`);
    assert.equal(Number(tenth.getAttribute('font-size')), 24, `${o}: tenths size (+2 px)`);
    assert.ok(Number(tenth.getAttribute('font-size')) <= w / 2, `${o}: tenths stay small`);
    const y = Number(pct.getAttribute('y'));
    assert.ok(y >= 104 && y <= 110, `${o}: percent baseline y ${y} keeps the figure centred in the hole`);
    const tot = [...walk(ctx)].filter((n) => n.tagName === 'text').at(-1);
    assert.ok(Number(tot.getAttribute('y')) - Number(tot.getAttribute('font-size')) * 0.72 - y >= 8, `${o}: gap between percent and total line`);
    assert.ok(y - w * 0.72 >= 100 - 86 + 8, `${o}: top of the figure inside the hole`);
    checked++;
  }
  assert.equal(checked, 2, 'trip-wire: both orientations checked');
});

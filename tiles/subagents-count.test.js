// AP-B2: the 16 subagents tiles show agents.subagents_started and count nothing themselves;
// ledger/register/mosaic draw every subagent, the drawn glyphs sum to that number (x n glyphs count n).
// Data is hand-built on purpose (mixed case: classic + tokenless + collapsed workflow node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = ['standard', 'minimal', 'fancy-a', 'fancy-b', 'ledger', 'register', 'mosaic', 'essentials'];
const ORIENT = ['landscape', 'portrait'];
const NAMES = STYLES.flatMap((s) => ORIENT.map((o) => `subagents-${s}-${o}`));
const MODS = new Map(await Promise.all(NAMES.map(async (n) => [n, await import(`./${n}.js`)])));

class Node {
  constructor(doc, tag) { Object.assign(this, { ownerDocument: doc, tagName: tag, children: [], attributes: {}, style: { cssText: '' }, own: '' }); }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.own = String(v); this.children = []; }
  append(...n) { this.children.push(...n); }
  replaceChildren(...n) { this.own = ''; this.children = [...n]; }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'style') this.style.cssText = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
}
function makeElement() {
  const doc = {
    createElement: (t) => new Node(doc, t),
    createElementNS: (_n, t) => new Node(doc, t),
    createTextNode: (t) => { const n = new Node(doc, '#text'); n.own = String(t); return n; },
  };
  return doc.createElement('div');
}
const walk = (n, out = []) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
const draw = (name, data) => {
  const el = makeElement();
  MODS.get(name).render(el, data, { ...MODS.get(name).meta.sizes[0], unit: 20 });
  return el;
};

const node = (id, parent, extra) => ({ id, ...(parent ? { parent_id: parent } : {}), agent_type: 'general-purpose', tokens_self: 1000, tokens_total: 1000, started_in_turn: 1, last_activity: '2026-10-05T10:00:00Z', ...extra });
/** root + 2 classic + 1 tokenless + 1 collapsed workflow node (5 agents): 8 subagents started. */
const MIXED = {
  version: '1.0',
  agents: {
    version: '1.3', session_id: 's', subagents_started: 8,
    nodes: [
      node('r', null, { agent_type: 'main', tokens_self: 5000, tokens_total: 20000 }),
      node('a', 'r', { tokens_self: 4000 }), node('b', 'r', { tokens_self: 2000, started_in_turn: 2 }),
      node('c', 'r', { tokens_self: 0, tokens_total: 0, started_in_turn: 3 }),
      node('w', 'r', { agent_type: 'workflow', agent_count: 5, tokens_self: 3000, started_in_turn: 4 }),
    ],
  },
  live: { instances: [{ tokens_by_agent_type: { main: 5000, 'general-purpose': 6000, workflow: 3000 }, tokens_total: 20000 }] },
};

test('all 16 subagents tiles show the delivered number, even when nodes disagree; absent field -> dash, never a count', () => {
  assert.equal(NAMES.length, 16);
  const lie = structuredClone(MIXED);
  lie.agents.subagents_started = 47; // deliberately different from anything countable in nodes
  for (const n of NAMES) {
    const texts = walk(draw(n, lie)).map((x) => x.own);
    assert.ok(texts.includes('47'), `${n}: shows 47`);
    for (const c of ['8', '4', '3', '9']) assert.ok(!texts.includes(c), `${n}: no self-counted ${c}`);
    const none = structuredClone(MIXED);
    delete none.agents.subagents_started;
    assert.ok(!walk(draw(n, none)).map((x) => x.own).some((t) => ['8', '4', '3', '9'].includes(t)), `${n}: field absent -> no counted number`);
  }
});

test('the 16 sources hold no own counting (no agent_count / parent_id reduce for the number)', () => {
  for (const n of NAMES) {
    const src = readFileSync(join(HERE, `${n}.js`), 'utf8');
    assert.ok(!/reduce\([^)]*agent_count|agent_count\)[^;]*reduce|filter\([^)]*parent_id[^)]*\)\.length/.test(src.replace(/\r/g, '')), `${n}: no count reduce`);
  }
});

/** Glyph sum: every glyph is 1, a glyph with an "x n" label is n. */
function glyphSum(el, tag) {
  const all = walk(el);
  const glyphs = all.filter((x) => x.tagName === tag);
  const labels = all.filter((x) => /^×\d+$/.test(x.own)).map((x) => Number(x.own.slice(1)));
  return { glyphs: glyphs.length, labels, quiet: glyphs.filter((x) => /fill:none/.test(x.style.cssText)).length, sum: glyphs.length - labels.length + labels.reduce((a, b) => a + b, 0) };
}

test('register + mosaic + essentials draw every subagent: glyphs sum (1 each, n for x n) to subagents_started; tokenless = ONE quiet glyph', () => {
  for (const [style, tag] of [['register', 'circle'], ['mosaic', 'rect'], ['essentials', 'rect']]) {
    for (const o of ORIENT) {
      const r = glyphSum(draw(`subagents-${style}-${o}`, MIXED), tag);
      assert.deepEqual(r.labels, [5], `${style}-${o}: one x5 label`);
      assert.equal(r.glyphs, 4, `${style}-${o}: 4 glyphs (2 classic, 1 tokenless, 1 workflow)`);
      assert.equal(r.sum, MIXED.agents.subagents_started, `${style}-${o}: glyph sum = number`);
      assert.equal(r.quiet, 1, `${style}-${o}: exactly one quiet (tokenless) glyph`);
    }
  }
});

test('ledger draws no glyphs (count + heaviest role only): number = subagents_started', () => {
  for (const o of ORIENT) {
    const texts = walk(draw(`subagents-ledger-${o}`, MIXED)).map((x) => x.own);
    assert.ok(texts.includes('8'));
  }
});

// AP-B2 addendum: the top-three tiles that print a count (calibre "TOP 3 OF N", backlight "N SUB") read the same field.
const TOP3 = ['calibre', 'backlight'].flatMap((s) => ORIENT.map((o) => `top-three-subagents-${s}-${o}`));
for (const n of TOP3) MODS.set(n, await import(`./${n}.js`));

test('top-three calibre + backlight show subagents_started (47), not their own count (3 with tokens / 4 nodes); absent field -> dash', () => {
  const lie = structuredClone(MIXED);
  lie.agents.subagents_started = 47;
  const none = structuredClone(MIXED);
  delete none.agents.subagents_started;
  for (const n of TOP3) {
    const texts = walk(draw(n, lie)).map((x) => x.own.trim());
    assert.ok(texts.some((t) => /^47( SUB)?$/.test(t)), `${n}: shows 47`);
    assert.ok(!texts.some((t) => /^[348]( SUB)?$/.test(t)), `${n}: no self-counted 3 (tokens>0) / 4 (nodes) / 8`);
    const t0 = walk(draw(n, none)).map((x) => x.own.trim());
    assert.ok(!t0.some((t) => /^[348]( SUB)?$/.test(t)), `${n}: field absent -> no counted number`);
    assert.ok(t0.some((t) => /^(–|-)( SUB)?$/.test(t)), `${n}: field absent -> dash`);
  }
});

test('the 4 top-three sources count nothing for the number (no subs.length / nodes.length as count)', () => {
  for (const n of TOP3) {
    const src = readFileSync(join(HERE, `${n}.js`), 'utf8');
    assert.ok(!/count[^\n;]*(subs|nodes)\.length/.test(src), `${n}: no own count`);
    assert.ok(/subagents_started/.test(src), `${n}: reads the field`);
  }
});

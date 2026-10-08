// AX.3/AX.4 — the absent mark (a violet dash, the tip says why) for fields a provider does not record. Run: `npm test`
// Tiles are standalone (no imports), so the helper lives as a snippet in CONTRACT.md that every tile
// copies byte for byte; these probes hold the copies identical to the document and the helper's
// answers to the sheets the reader really builds (checked-in fixtures, never hand-written sheets).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const R = join(HERE, '..', 'reader', 'fixtures');
const lf = (s) => s.split(String.fromCharCode(13)).join(''); // the working tree may carry CRLF
const read = (f) => lf(readFileSync(join(HERE, f), 'utf8'));
const DOC = read('CONTRACT.md');
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const inv = inventory({
  root: join(R, 'projects'), codexRoot: join(R, 'codex', 'sessions'), codexIndex: join(R, 'codex', 'session_index.jsonl'),
  antigravityRoot: join(R, 'antigravity'), nowMs: NOW,
});
const sheetOf = (id) => contractSheet(buildSheet(loadSession(findSession(inv, id)), { nowMs: NOW }), { device: 'laptop', state: 'awake' });
const AG = sheetOf('a9a9a9a9-7e57-4a9b-9a9a-2000000000b2');
const CODEX = sheetOf('c0dec0de-5a17-4c0d-9e5e-1000000000a1');
const CLAUDE = sheetOf(inv.projects.find((p) => p.slug !== 'codex' && p.slug !== 'antigravity').sessions[0].session_id);

const snippet = (mark, v = 'v1') => {
  const m = DOC.match(new RegExp('```js\\n(// aihud:' + mark + ' ' + v + '\\n[\\s\\S]*?)```'));
  assert.ok(m, `CONTRACT.md carries the ${mark} snippet`);
  return m[1];
};
const WHOLE = snippet('whole-seconds');
const NOTREC = snippet('not-recorded');
const ABSONLY = snippet('absent-only');
const notRecorded = new Function(`${NOTREC}; return notRecorded;`)();
const absentOnlyFn = new Function(`${ABSONLY}; return absentOnly;`);
const wholeSeconds = new Function(`${WHOLE}; return wholeSeconds;`)();

const TILES = readdirSync(HERE).filter((f) => /-(portrait|landscape)\.js$/.test(f) && !f.startsWith('example-')).sort();
const block = (f) => f.replace(/-(portrait|landscape)\.js$/, '').split('-')[0] === 'top' ? 'top-three-subagents' : f.split('-')[0];
/** The tiles that show token, context or model values (or the context chart): they carry the hint. */
export const HINT_TILES = TILES.filter((f) => ['tokens', 'context', 'glance', 'trace'].includes(block(f)) || f.startsWith('top-three-subagents-blueprint-') || f.startsWith('subagents-fancy-a-'));
/** The tiles that print a call duration: they carry the whole-seconds check. */
export const DURATION_TILES = TILES.filter((f) => block(f) === 'tools');

test('wholeSeconds: only the sheet that carries the whole-second caveat (Antigravity), never Claude or Codex', () => {
  assert.equal(wholeSeconds(AG), true);
  for (const sheet of [CLAUDE, CODEX, {}, null, { caveats: 'x' }, { caveats: [null] }]) assert.equal(wholeSeconds(sheet), false);
});

test('every tile that shows tokens, context, model or the context chart carries the not-recorded snippet, byte-identical to CONTRACT.md', () => {
  const missing = [];
  for (const f of HINT_TILES) if (!read(f).includes(NOTREC)) missing.push(f);
  assert.deepEqual(missing, [], 'tiles without the exact snippet');
  assert.ok(HINT_TILES.length >= 54, `trip-wire: ${HINT_TILES.length} tiles checked`);
});

/** The tiles that have nothing left to show without tokens / context: frame kept, content replaced by caption + hint. */
export const HINT_ONLY_TILES = HINT_TILES.filter((f) => (block(f) === 'tokens' || block(f) === 'context') && !/^context-(slab|mosaic)-/.test(f));

test('the tiles that show only the dash carry the absent-only snippet, byte-identical to CONTRACT.md', () => {
  const missing = HINT_ONLY_TILES.filter((f) => !read(f).includes(ABSONLY));
  assert.deepEqual(missing, []);
  assert.equal(HINT_ONLY_TILES.length, 36, 'trip-wire: 8 context + 10 tokens styles in two orientations');
});

test('every tile that prints call durations carries the whole-seconds snippet, byte-identical to CONTRACT.md', () => {
  const missing = [];
  for (const f of DURATION_TILES) if (!read(f).includes(WHOLE)) missing.push(f);
  assert.deepEqual(missing, [], 'tiles without the exact snippet');
  assert.equal(DURATION_TILES.length, 8, 'trip-wire: the four tools styles in two orientations');
});

test('no tile carries a changed copy of a snippet (a marked block must equal the document)', () => {
  const bad = [];
  for (const f of TILES) {
    const src = read(f);
    for (const [mark, text] of [['not-recorded', NOTREC], ['absent-only', ABSONLY], ['whole-seconds', WHOLE]]) if (src.includes(`// aihud:${mark}`) && !src.includes(text)) bad.push(`${f}: ${mark}`);
  }
  assert.deepEqual(bad, []);
});

test('a tile that calls notRecorded / absentOnly carries that snippet; no tile carries the old hint text, helpers or marks', () => {
  const bad = [];
  for (const f of TILES) {
    const src = read(f);
    if (/\bnotRecorded\(/.test(src) && !src.includes(NOTREC)) bad.push(`${f}: calls notRecorded without the snippet`);
    if (/\babsentOnly\(/.test(src) && !src.includes(ABSONLY)) bad.push(`${f}: calls absentOnly without the snippet`);
    for (const dead of ['providerHint', 'hintOnly', 'aihud:provider-hint', 'aihud:hint-only', 'not provided by']) if (src.includes(dead)) bad.push(`${f}: ${dead}`);
  }
  assert.deepEqual(bad, []);
});

test('notRecorded: true only for the provider that names the field, from the sheets the reader really builds', () => {
  for (const [t, f] of [['live', 'tokens'], ['turn', 'tokens'], ['context', 'points'], ['session', 'model'], ['agents', 'subagents'], ['turn', 'skills']]) {
    assert.equal(notRecorded(AG, t, f), true, `AG ${t}:${f}`);
    for (const sheet of [CLAUDE, CODEX, {}, null, undefined, { not_delivered: 'x' }, { not_delivered: [1, null] }]) assert.equal(notRecorded(sheet, t, f), false, `${t}:${f}`);
  }
  assert.equal(notRecorded({ not_delivered: ['live:tokens_not_recorded_by_antigravity'] }, 'live', 'model'), false, 'a field is only named by its own entry');
  assert.equal(notRecorded({ not_delivered: ['live:tokens_not_recorded_by_codex'] }, 'live', 'tokens'), true);
});

test('absentOnly: keeps the frame, caption + ONE dash in --aihud-absent carrying data-field, scaled by z', () => {
  const doc = { createElement: (tag) => { const e = { tag, style: { cssText: '' }, textContent: '', attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } }; return e; } };
  const node = { ownerDocument: doc, style: { cssText: 'width:160px;height:80px;background:var(--aihud-panel)' }, children: [], replaceChildren(...c) { this.children = c; } };
  absentOnlyFn()(node, 'context', 'live.instances[].context_percent', 1.125);
  assert.ok(node.style.cssText.startsWith('width:160px;height:80px;background:var(--aihud-panel);'), 'the frame styles stay');
  assert.deepEqual(node.children.map((c) => c.textContent), ['context', '\u2013']);
  const dash = node.children[1];
  assert.ok(dash.style.cssText.includes('color:var(--aihud-absent)') && dash.style.cssText.includes('font-size:24.75px'), '22 * z, in the absent colour');
  assert.equal(dash.attrs['data-field'], 'live.instances[].context_percent');
  assert.equal(node.children[0].style.cssText.includes('var(--aihud-absent)'), false, 'the caption stays faint');
  assert.equal(node.children[0].attrs['data-field'], undefined);
});

test('the sample tiles carry notRecorded and no old helper', () => {
  for (const f of ['context-standard-portrait.js', 'glance-hairline-portrait.js']) {
    const src = read(f);
    assert.ok(src.includes(NOTREC) && !src.includes('providerHint') && !src.includes('hintOnly'), f);
  }
});

// THE LEAK CHECK PROBE — the latch that no plain-text field reaches the output.
//
//   green: npm test
//   RED:   READER_LEAKY=1 npm test
//
// The switch swaps ONLY the builder: instead of `buildSheet` (real) `leakySheet` runs
// (deliberately leaky, `leaky-sheet.js`). The assertions stay word for word the same.
// A latch that was never red proves nothing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { leakySheet } from './leaky-sheet.js';
import { checkLeaks, checkLeaksOrThrow, FORBIDDEN_KEYS, PLAINTEXT_MARKER } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const SESSIONS = ['5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10', 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36'];
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

export const LEAKY = process.env.READER_LEAKY === '1';
const build = LEAKY ? leakySheet : buildSheet;

function sheet(id) {
  const inv = inventory({ root: ROOT, nowMs: NOW });
  return build(loadSession(findSession(inv, id)), { nowMs: NOW });
}

test('THE LEAK CHECK: no plain-text field reaches the reader output', () => {
  let runs = 0;
  let checkedStrings = 0;
  for (const id of SESSIONS) {
    const result = checkLeaks(sheet(id));
    runs++;
    checkedStrings += result.checked.strings;
    assert.ok(result.checked.values > 1200,
      `the check must have run against a FILLED sheet (${result.checked.values} values)`);
    assert.deepEqual(result.violations, [],
      `leak check broken for ${id}${LEAKY ? ' (READER_LEAKY=1 — this is the intended red proof)' : ''}`);
    assert.equal(result.clean, true);
  }
  // Trip-wire: the absence claim is only worth something if it ran.
  assert.ok(runs >= 1, 'the leak probe must have run');
  assert.equal(runs, 2);
  assert.ok(checkedStrings > 500, `and it must have seen real strings (${checkedStrings})`);
});

test('the marker of the fixtures arrives nowhere in the output', () => {
  let runs = 0;
  for (const id of SESSIONS) {
    runs++;
    const text = JSON.stringify(sheet(id));
    assert.ok(text.length > 10_000);
    assert.equal(text.includes(PLAINTEXT_MARKER), false,
      `${PLAINTEXT_MARKER} in the output of ${id} — plain text has leaked`);
  }
  assert.equal(runs, 2);
});

test('none of the forbidden keys stands in the output', () => {
  let checked = 0;
  for (const id of SESSIONS) {
    const text = JSON.stringify(sheet(id));
    for (const k of FORBIDDEN_KEYS) {
      checked++;
      assert.equal(text.includes(`"${k}":`), false, `forbidden key "${k}" in ${id}`);
    }
  }
  assert.equal(checked, FORBIDDEN_KEYS.size * SESSIONS.length);
  assert.ok(checked >= 1);
});

test('the leak THROUGH the scrubber is seen', () => {
  // This probe runs in the NORMAL (green) run and calls the leaky version directly.
  // `identity.memo` carries the title through `ident()` — under a key name rule 1 does not
  // know. Only rule 3 can catch it; it can only since `ident()` refuses instead of scrubbing
  // (before, `TEXT` stood there and the check stayed silent).
  const inv = inventory({ root: ROOT, nowMs: NOW });
  const leaky = leakySheet(loadSession(findSession(inv, SESSIONS[0])), { nowMs: NOW });
  assert.equal(leaky.identity.memo, '<<TEXT>>', 'the scrubber must not take the marker apart');
  const e = checkLeaks(leaky);
  const hits = e.violations.filter((v) => v.path === '.identity.memo');
  assert.equal(hits.length, 1, 'exactly one violation on the scrubber path');
  assert.equal(hits[0].reason, 'mask_marker');
  assert.equal(FORBIDDEN_KEYS.has('memo'), false, 'the key name alone would have betrayed nothing');
});

// ── The check itself has to bite: four rules, four proofs ──────────────────────────────────

test('rule 1 — a forbidden key trips', () => {
  const e = checkLeaks({ turns: [{ number: 1, label: 'x' }] });
  assert.equal(e.clean, false);
  assert.equal(e.violations[0].reason, 'forbidden_key');
  assert.equal(e.violations[0].path, '.turns[0].label');
  // Refinement: a NUMBER under a forbidden name is not a leak — the contract names a token
  // kind `input`. Everything that CAN carry text still trips.
  assert.equal(checkLeaks({ tokens_by_kind: { input: 80, output: 32225 } }).clean, true);
  assert.equal(checkLeaks({ input: 0 }).clean, true);
  assert.equal(checkLeaks({ input: true }).clean, true);
  assert.equal(checkLeaks({ input: null }).clean, true);
  for (const dangerous of ['cat docs/README.md', 'x', ['a'], { command: 'x' }]) {
    const f = checkLeaks({ input: dangerous });
    assert.equal(f.clean, false, `input: ${JSON.stringify(dangerous)} must trip`);
    assert.equal(f.violations[0].reason, 'forbidden_key');
  }
});

test('rule 2 — prose (whitespace) trips', () => {
  const e = checkLeaks({ identity: { display: 'please check this for me' } });
  assert.equal(e.clean, false);
  assert.deepEqual(e.violations.map((v) => v.reason), ['whitespace_in_string']);
  assert.equal(checkLeaks({ a: 'claude-opus-5[1m]' }).clean, true);
  assert.equal(checkLeaks({ a: '2026-09-10T12:00:00.000Z' }).clean, true);
  assert.equal(checkLeaks({ a: 'x'.repeat(200) }).violations[0].reason, 'string_too_long');
});

test('rule 3 — the mask marker trips', () => {
  const e = checkLeaks({ deep: { deeper: [{ value: `${PLAINTEXT_MARKER}` }] } });
  assert.equal(e.clean, false);
  assert.equal(e.violations[0].reason, 'mask_marker');
  assert.equal(e.violations[0].path, '.deep.deeper[0].value');
});

test('rule 4 — a path trace trips', () => {
  for (const p of ['C:\\Users\\someone', '/Users/someone/x', '/home/pi/y', 'session.jsonl', '.claude']) {
    const e = checkLeaks({ place: p });
    assert.equal(e.clean, false, `${p} must trip`);
    assert.ok(['path_trace', 'whitespace_in_string'].includes(e.violations[0].reason));
  }
});

test('checkLeaksOrThrow throws with a readable list, but does not secretly check differently', () => {
  assert.throws(() => checkLeaksOrThrow({ prompt: 'secret text' }), /leak check broken/);
  const ok = checkLeaksOrThrow({ number: 1, model: 'claude-opus-5' });
  assert.equal(ok.clean, true);
  assert.equal(ok.checked.strings, 1);
});

test('empty and primitive inputs do not break the check', () => {
  for (const w of [null, undefined, 0, 1, true, [], {}]) {
    assert.equal(checkLeaks(w).clean, true);
  }
});

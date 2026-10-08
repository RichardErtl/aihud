// Probes for the branch chip of an instance card.
// Run: `npm test`
//
// Cause: a first survey called the branch chip "impossible" (0 hits for `branch`). Measured
// against it: every transcript line carries `"gitBranch":"<name>"` (215/215 lines of a real
// session). The parser already collected the field as a SORTED SET (`branches`) — but from a
// set it is no longer readable which branch the session is on NOW. Hence: the last seen branch
// (file order) travels as its own field through raw sheet → contract
// (`live.instances[].git_branch`) → card.
//
// LEAK RULE ("the reader reads only structure, never content"): a branch name is an identifier
// (no spaces, checked by `ident()`) — the probe below runs it explicitly through `checkLeaks()`,
// also with a name that carries a slash.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readTranscript } from './parser.js';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractLive, contractSheet } from './contract.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const HOST = { device: 'laptop', state: 'awake' };

function rawSheet(id) {
  const inv = inventory({ root: ROOT, nowMs: NOW });
  return buildSheet(loadSession(findSession(inv, id)), { nowMs: NOW });
}
const line = (o) => JSON.stringify({ type: 'system', timestamp: '2026-09-23T10:00:00.000Z', ...o });

test('c1 · the parser remembers the LAST seen branch, not only the set', () => {
  const text = [
    line({ gitBranch: 'dev' }),
    line({ gitBranch: 'bugfix/sample-branch' }),
    line({}),                                   // a line without the field changes nothing
  ].join('\n');
  const r = readTranscript(text);
  assert.equal(r.branch_last, 'bugfix/sample-branch');
  assert.deepEqual(r.branches, ['bugfix/sample-branch', 'dev'], 'the set stays unchanged');
});

test('c2 · without a gitBranch field there is no branch — null, never an invented one', () => {
  assert.equal(readTranscript(line({})).branch_last, null);
  // Prose is not an identifier: ident() refuses, the branch stays empty instead of scrubbed.
  assert.equal(readTranscript(line({ gitBranch: 'no branch with spaces' })).branch_last, null);
});

test('c3 · raw sheet and contract carry the branch up to the instance', () => {
  const sheet = rawSheet(A);
  assert.equal(sheet.identity.git_branch_last, 'dev', 'measured on the real (masked) fixture');
  const p = contractLive(sheet, HOST);
  assert.equal(p.instances[0].git_branch, 'dev');
  // OPTIONAL field: not measured ⇒ it is MISSING, never `null`.
  const without = contractLive({ ...sheet, identity: { ...sheet.identity, git_branch_last: null } }, HOST);
  assert.equal('git_branch' in without.instances[0], false);
});

test('c4 · the leak check lets the branch through — it is structure, not content', () => {
  const sheet = rawSheet(A);
  sheet.identity.git_branch_last = 'bugfix/sample-branch';
  const v = contractSheet(sheet, HOST);
  assert.equal(v.live.instances[0].git_branch, 'bugfix/sample-branch');
  assert.deepEqual(checkLeaks(v).violations, []);
});

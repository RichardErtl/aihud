// Probes for the provider-neutral contract (A2.2): `provider` per session, the window table
// `windows[provider][model]`, and the Claude-only parts marked optional.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractSheet, windowsOf, PROVIDER, OPTIONAL_PROVIDER_FIELDS } from './contract.js';
import { windowForModel } from './parser.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

const sheetOf = (id) => buildSheet(loadSession(findSession(inventory({ root: ROOT, nowMs: NOW }), id)), { nowMs: NOW });

test('every session names its provider and its start once, as started_at', () => {
  for (const id of [A, B]) {
    const raw = sheetOf(id);
    const s = contractSheet(raw).session;
    assert.equal(s.provider, 'claude-code');
    assert.equal(s.started_at, raw.time.start);
    assert.equal('start' in s, false, 'no second start field');
  }
  assert.equal(PROVIDER, 'claude-code');
});

test('windows[provider][model]: every model of the session with the hand-table size', () => {
  const sheet = sheetOf(A);
  const v = contractSheet(sheet);
  assert.deepEqual(v.windows, { 'claude-code': { 'claude-opus-5': 1_000_000, 'claude-sonnet-5': 1_000_000 } });
  // The same number the fill level uses — one table, not two.
  assert.equal(v.windows['claude-code'][v.session.model], windowForModel(v.session.model));
  assert.equal(v.windows['claude-code'][sheet.context.model], sheet.context.window);
  assert.equal(windowsOf({}), null, 'no model seen - no table, never an invented row');
});

test('the Claude-only parts are listed as optional', () => {
  assert.deepEqual(OPTIONAL_PROVIDER_FIELDS.map((f) => f.name), ['aiTitle', 'subagents', 'spawnDepth']);
  for (const f of OPTIONAL_PROVIDER_FIELDS) {
    assert.equal(f.optional, true);
    assert.equal(f.provider, 'claude-code');
  }
});

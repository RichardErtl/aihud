// Antigravity CLI >= 1.2.17 writes token numbers per model step. The fixture `fixtures/antigravity-tokens/` is an
// anonymised 6-line transcript of that shape (text masked, numbers as recorded in the 06.10. measurement);
// the 1.2.14 fixture of `antigravity.test.js` stays the "old CLI" case (no token fields, nothing delivered).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractSheet } from './contract.js';
import { readAntigravityTranscript, ASSUMED_WINDOW_DEFAULT } from './parser-antigravity.js';
import { validateSettings } from '../node/store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'antigravity-tokens');
const OLD_ROOT = join(HERE, 'fixtures', 'antigravity');
const NOW = Date.parse('2026-10-06T12:00:00.000Z');
const ID = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000b3';
const OLD_ID = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000b2';

const contractOf = (root, id, opt) => {
  const inv = inventory({ root: join(HERE, 'fixtures', 'projects'), antigravityRoot: root, nowMs: NOW });
  const loaded = loadSession(findSession(inv, id), opt);
  return contractSheet(buildSheet(loaded, { nowMs: NOW }), { device: 'd', state: 'idle' });
};

test('tokens: summed over model steps, fill = input + cache_read of the last step, the shipped window is assumed without settings', () => {
  const c = contractOf(ROOT, ID);
  const inst = c.live.instances[0];
  assert.deepEqual(inst.tokens_by_kind, { input: 11715 + 2430 + 3100, output: 277 + 310 + 95, cache_read: 11700 + 14100, cache_write: 0 });
  assert.equal(inst.tokens_total, 11715 + 2430 + 3100 + 277 + 310 + 95 + 11700 + 14100);
  assert.equal(inst.context_window, 1048576, 'the shipped assumption');
  assert.equal(inst.context_percent, Math.round(((3100 + 14100) / 1048576) * 1000) / 10);
  assert.deepEqual(c.windows, { antigravity: { default: 1048576 } });
  assert.ok(c.context.points.length === 3 && c.context.points[2].tokens_in_window === 3100 + 14100);
  assert.ok(c.not_delivered.includes('live:window_assumed_by_default'));
  assert.equal(c.not_delivered.some((k) => k.includes('window_not_recorded') || k.includes('assumed_by_settings')), false);
  assert.ok(c.not_delivered.includes('session:model_not_recorded_by_antigravity'), 'model stays not delivered');
  assert.equal(c.not_delivered.some((k) => k.startsWith('live:tokens_not_recorded')), false);
  assert.equal(c.session.model, undefined);
});

test('window: a number from settings.windows.antigravity.default gives a percent, named as assumed', () => {
  const c = contractOf(ROOT, ID, { windows: { antigravity: { default: 200000 } } });
  const inst = c.live.instances[0];
  assert.equal(inst.context_window, 200000);
  assert.equal(inst.context_percent, Math.round(((3100 + 14100) / 200000) * 1000) / 10);
  assert.deepEqual(c.windows, { antigravity: { default: 200000 } });
  assert.ok(c.not_delivered.includes('live:window_assumed_by_settings'));
  assert.ok(!c.not_delivered.includes('live:window_assumed_by_default'));
  // junk from settings is no window: the shipped default applies instead
  for (const bad of [{ antigravity: { default: 'big' } }, { antigravity: {} }, { antigravity: { default: -5 } }, { codex: { default: 5 } }, { antigravity: { default: 12 } }, { antigravity: { default: 1500.5 } }]) {
    const j = contractOf(ROOT, ID, { windows: bad });
    assert.equal(j.live.instances[0].context_window, 1048576);
    assert.ok(j.not_delivered.includes('live:window_assumed_by_default'));
  }
});

test('window precedence: a window recorded by the transcript line beats settings and the shipped default', () => {
  // ASSUMPTION: Antigravity does not write this today; the field name `context_window` on the step line is our guess.
  const line = (extra) => JSON.stringify({ step_index: 1, type: 'PLANNER_RESPONSE', source: 'MODEL', created_at: '2026-10-01T10:00:00Z', input_tokens: 1000, output_tokens: 10, cache_read_tokens: 0, ...extra });
  const last = (opt, extra) => readAntigravityTranscript(line(extra), opt).events.find((e) => e.kind === 'usage');
  assert.deepEqual([last({ assumedWindow: 200000 }, { context_window: 500000 }).window, last({ assumedWindow: 200000 }, { context_window: 500000 }).window_source], [500000, 'file']);
  assert.equal(last({ assumedWindow: 200000 }, {}).window_source, 'settings');
  assert.equal(last({}, {}).window, ASSUMED_WINDOW_DEFAULT);
  assert.equal(last({}, {}).window_source, 'default');
  assert.equal(last({}, { context_window: 'x' }).window_source, 'default', 'junk is no recorded window');
});

test('old CLI (1.2.14, no token fields): behaves as before, with or without a settings window', () => {
  for (const opt of [undefined, { windows: { antigravity: { default: 200000 } } }]) {
    const c = contractOf(OLD_ROOT, OLD_ID, opt);
    const inst = c.live.instances[0];
    assert.equal(inst.tokens_total, undefined);
    assert.equal(inst.context_window, undefined);
    assert.equal(c.windows, undefined);
    assert.ok(c.not_delivered.includes('live:tokens_not_recorded_by_antigravity'));
    assert.equal(c.not_delivered.some((k) => k.includes('window_')), false);
  }
});

test('old CLI: the whole contract is identical with and without a settings window', () => {
  assert.deepEqual(contractOf(OLD_ROOT, OLD_ID), contractOf(OLD_ROOT, OLD_ID, { windows: { antigravity: { default: 200000 } } }));
});

test('settings: `windows` accepts only {antigravity: {default: tokens}}', () => {
  assert.doesNotThrow(() => validateSettings({ windows: { antigravity: { default: 1048576 } } }));
  assert.doesNotThrow(() => validateSettings({ windows: null }));
  for (const bad of ['x', { codex: { default: 5000 } }, { antigravity: { default: 'a' } }, { antigravity: { default: 12 } }, { antigravity: { gemini: 5000 } }]) {
    assert.throws(() => validateSettings({ windows: bad }), /settings_invalid:windows/);
  }
});

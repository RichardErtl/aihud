// Probes for the contract form of the reader. Run: `npm test`
// Checked: `version`/`as_of` per type and the field names of the five contract types.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import {
  contractSheet, contractSession, contractLive, contractTurn, contractContext, contractAgents,
  VERSION_BY_TYPE,
} from './contract.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

function rawSheet(id) {
  const inv = inventory({ root: ROOT, nowMs: NOW });
  return buildSheet(loadSession(findSession(inv, id)), { nowMs: NOW });
}
const HOST = { device: 'laptop', state: 'awake' };

test('every delivered type carries version and as_of', () => {
  const v = contractSheet(rawSheet(A), HOST);
  let checked = 0;
  for (const type of ['session', 'live', 'turn', 'context', 'agents']) {
    checked++;
    assert.ok(v[type], `${type} must be delivered`);
    assert.equal(v[type].version, VERSION_BY_TYPE[type], 'minor version per type, not flat');
    assert.equal(v[type].as_of, '2026-09-10T12:00:00.000Z');
  }
  assert.equal(checked, 5);
  // The two subscription fields are in the contract, but not in the JSONL — they stay
  // permanently listed (own probe below).
  assert.deepEqual(v.not_delivered, [
    'live:subscription_7d_fable_usage_not_in_transcript',
    'live:subscription_7d_fable_reset_not_in_transcript',
  ]);
});

test('session: required fields set, plain-text fields deliberately empty', () => {
  const s = contractSession(rawSheet(A));
  assert.equal(s.id, A);
  assert.equal(s.started_at, '2026-08-29T14:40:46.478Z');
  assert.equal('start' in s, false, 'started_at is the ONE start field');
  assert.equal(s.model, 'claude-opus-5');
  // `role` used to be hard-set to one fixed name — an invented value against the file's own
  // rule. The contract says OPTIONAL: so it is MISSING.
  assert.equal('role' in s, false);
  // Leak rule: both would be plain text (`ai-title` / `last-prompt`) — they are MISSING instead of lying.
  assert.equal('display_name' in s, false);
  assert.equal('short_info' in s, false);
  // `end` is missing while it runs — the JSONL has no end marker.
  assert.equal('end' in s, false);
  assert.equal(contractSession({ identity: {}, time: {} }), null, 'without a required field no type');
});

test('session 1.1: #10 work time and wait time travel from the raw sheet, unchanged', () => {
  // Measured in derive.js timing(), lost on the way to the contract until then.
  const raw = rawSheet(A);
  const s = contractSession(raw);
  // 1.1 brought these two fields; 1.2 (provider, sidecar, git) raised it again, additively;
  // 2.0 is the naming pass (breaking); 2.1 makes `provider` per session (AX.1, additive).
  assert.equal(s.version, '2.2', 'provider per session raises the minor version (2.1), a provider without usage (2.2)');
  assert.equal(s.work_ms, 844_739, 'the same value as in the raw sheet, no computing');
  assert.equal(s.wait_ms, 691_982);
  assert.equal(s.work_ms, raw.time.work_ms);
  assert.equal(s.wait_ms, raw.time.wait_ms);
  // Not measurable → the field is MISSING, never an invented 0.
  const without = contractSession({ identity: { session_id: 'x' },
    time: { start: '2026-09-10T10:00:00.000Z', work_ms: null, wait_ms: null } });
  assert.equal('work_ms' in without, false);
  assert.equal('wait_ms' in without, false);
  // A MEASURED 0 stays 0.
  const zero = contractSession({ identity: { session_id: 'x' },
    time: { start: '2026-09-10T10:00:00.000Z', work_ms: 5000, wait_ms: 0 } });
  assert.equal(zero.wait_ms, 0);
});

test('live: device and state come from the host — otherwise there is no instance', () => {
  assert.equal(contractLive(rawSheet(A)), null);
  assert.equal(contractLive(rawSheet(A), { device: 'laptop' }), null, 'state is missing');
  const p = contractLive(rawSheet(A), HOST);
  const f = p.instances[0];
  assert.equal(f.device, 'laptop');
  assert.equal(f.state, 'awake');
  assert.equal(f.session_id, A);
  assert.equal(f.context_percent, 13.7);
  assert.equal(f.context_window, 1_000_000);
  assert.equal(f.tokens_main, 4_149_147);
  assert.equal(f.tokens_total, 5_812_452);
  assert.deepEqual(f.tokens_by_agent_type, { main: 4_149_147, builder: 1_128_866, recorder: 534_439 });
  assert.equal(f.last_activity, '2026-08-29T15:06:23.199Z');
  const without = contractSheet(rawSheet(A));
  assert.equal('live' in without, false);
  assert.deepEqual(without.not_delivered, ['live:device_comes_from_host']);
});

test('turn: number required, duration in SECONDS, label stays empty', () => {
  const t = contractTurn(rawSheet(A));
  assert.equal(t.session_id, A);
  assert.deepEqual(t.turns.map((z) => z.number), [1, 2, 3]);
  const z1 = t.turns[0];
  assert.equal(z1.duration_s, 305, 'the contract measures in seconds, the raw sheet in milliseconds');
  assert.equal(z1.tokens_in, 1_110_107);
  assert.equal(z1.tokens_out, 8_371);
  assert.equal(z1.tokens_in + z1.tokens_out, 1_118_478, 'in + out = the turn sum of the raw sheet');
  assert.deepEqual(z1.tool_names, ['Bash', 'Agent', 'ToolSearch', 'SendMessage']);
  // `duration` (seconds, sum over `count`). `precision` has no name in the contract and stays
  // in the raw sheet.
  assert.deepEqual(z1.tool_stats[0], { tool: 'Bash', count: 8, duration: 10 });
  assert.equal(z1.started_at, '2026-08-29T14:40:46.478Z', 'turns[].started_at = start of the turn');
  // `tokens_by_model[]` names only `model`/`tokens_in`/`tokens_out` — `tokens_total` has no
  // name there and stays in the raw sheet.
  assert.deepEqual(z1.tokens_by_model, [{ model: 'claude-opus-5', tokens_in: 1_110_107, tokens_out: 8_371 }]);
  for (const z of t.turns) assert.equal('label' in z, false, 'the JSONL knows no turn label');
  // Skill fields exist only when skills ran — empty means empty, not "not recorded".
  // The skills sit PER TURN (`turns[].skills[]`), not on the type.
  assert.equal('skill_starts' in t, false);
  assert.equal('tokens_per_skill' in t, false);
  for (const z of t.turns) assert.equal('skills' in z, false, 'fixture A started no skill');
  const tb = contractTurn(rawSheet(B));
  const skills = tb.turns[1].skills;
  assert.deepEqual(skills.map((k) => k.name), ['cleanup', 'review']);
  assert.equal(skills[1].time, '2026-08-26T08:48:50.954Z');
  assert.equal(skills[0].tokens_in + skills[0].tokens_out, 1_634_875, 'tokens per skill per turn');
  for (const k of skills) assert.equal('skill' in k, false, 'the contract calls it `name`');
});

test('context: only the points of the MAIN transcript, ascending', () => {
  const k = contractContext(rawSheet(A));
  assert.equal(k.session_id, A);
  assert.equal(k.points.length, 40, 'the 39 fleet points do not belong in this curve');
  assert.deepEqual(k.points[0], { time: '2026-08-29T14:40:48.586Z', percent: 5.7, tokens_in_window: 56_853, turn_number: 1 });
  for (let i = 1; i < k.points.length; i++) {
    assert.ok(Date.parse(k.points[i].time) >= Date.parse(k.points[i - 1].time), 'ascending by time');
  }
  for (const p of k.points) assert.equal(typeof p.time, 'string', 'time is REQUIRED per point');
});

test('agents: exactly the root has no `parent_id`', () => {
  const b = contractAgents(rawSheet(A));
  assert.equal(b.session_id, A);
  assert.equal(b.nodes.length, 6);
  const withoutParent = b.nodes.filter((k) => !('parent_id' in k));
  assert.equal(withoutParent.length, 1, 'that is how the root is recognised');
  assert.equal(withoutParent[0].id, A);
  assert.equal(withoutParent[0].tokens_self, 4_149_147);
  assert.equal(withoutParent[0].tokens_total, 5_812_452);
  const child = b.nodes.find((k) => k.id === 'af40455aa5d7481a2');
  assert.equal(child.agent_type, 'recorder');
  assert.equal(child.tokens_self, 534_439);
  assert.equal(child.started_in_turn, 1);
  // The unresolved Agent block stays in the tree — without invented tokens.
  const raw = b.nodes.find((k) => k.id.startsWith('toolu_'));
  assert.equal('tokens_self' in raw, false, 'rather no value than an invented one');
});

test('minor version per type', () => {
  const v = contractSheet(rawSheet(A), HOST);
  // Session 1.1: work_ms/wait_ms. Live 1.6: git_branch. The live fields of 1.3–1.5
  // (host metadata) are OPTIONAL — the reader does not measure them, their absence is
  // contract-conforming; the minor version only says which version of the type is delivered.
  // Session 1.2: provider/start time/title/note/closed/close time/git (A2.2-A2.4).
  // Session 2.0: the naming pass (snake_case, `id`, `started_at` only).
  // Session 2.1: `provider` is the provider of THIS session (AX.1) - claude-code or codex.
  assert.deepEqual(VERSION_BY_TYPE, { session: '2.2', live: '1.6', turn: '1.3', context: '1.0', agents: '1.4' });
  assert.equal(v.session.version, '2.2');
  assert.equal(v.live.version, '1.6');
  assert.equal(v.turn.version, '1.3');
  assert.equal(v.context.version, '1.0');
  assert.equal(v.agents.version, '1.4');
});

test('the reader lists the two subscription fields as not deliverable', () => {
  const v = contractSheet(rawSheet(A), HOST);
  assert.ok(v.not_delivered.includes('live:subscription_7d_fable_usage_not_in_transcript'));
  assert.ok(v.not_delivered.includes('live:subscription_7d_fable_reset_not_in_transcript'));
  assert.equal('subscription_7d_fable_usage' in v.live.instances[0], false);
  assert.equal('subscription_7d_fable_reset' in v.live.instances[0], false);
});

test('the leak check holds on the contract form too (trip-wire)', () => {
  let runs = 0;
  for (const id of [A, B]) {
    const v = contractSheet(rawSheet(id), HOST);
    runs++;
    const e = checkLeaks(v);
    assert.ok(e.checked.values > 300, `ran against a filled output (${e.checked.values})`);
    assert.deepEqual(e.violations, []);
  }
  assert.equal(runs, 2);
  assert.ok(runs >= 1);
});

test('an empty raw sheet delivers no type and says which one is missing', () => {
  const v = contractSheet({ identity: {}, time: {} });
  assert.deepEqual(Object.keys(v).sort(), ['not_delivered', 'version']);
  assert.equal('caveats' in v, false, 'without block B there is no caveat to report either');
  // Without `live` its two subscription fields are no topic either: if the whole type is
  // missing, a statement about its fields is moot.
  assert.equal(v.not_delivered.length, 5);
  assert.equal(contractTurn({}), null);
  assert.equal(contractContext({}), null);
  assert.equal(contractAgents({}), null);
});

test('turn: tool_calls[] = one {tool, started_at, duration_s} per call, ascending by start', () => {
  const t = contractTurn(rawSheet(A));
  const z1 = t.turns[0];
  assert.ok(Array.isArray(z1.tool_calls), 'tool_calls delivered');
  const stats = z1.tool_stats.reduce((n, w) => n + w.count, 0);
  assert.equal(z1.tool_calls.length, stats, 'one entry per call, same count as tool_stats');
  for (const c of z1.tool_calls) {
    assert.equal(typeof c.tool, 'string');
    assert.match(c.started_at, /^\d{4}-\d\d-\d\dT.*Z$/);
    if ('duration_s' in c) assert.equal(typeof c.duration_s, 'number');
  }
  const starts = z1.tool_calls.map((c) => c.started_at);
  assert.deepEqual(starts, [...starts].sort(), 'ascending by start');
  assert.equal(z1.tool_calls.filter((c) => c.tool === 'Bash').length, 8);
});

test('turn: tool_calls[] leaves out a call without a timestamp, and omits duration_s when unmeasured', () => {
  const T = Date.parse('2026-09-10T10:00:00.000Z');
  const sheet = {
    as_of: '2026-09-10T12:00:00.000Z',
    identity: { session_id: A },
    turns: [{
      number: 1, tokens_in: 0, tokens_cache_read: 0, tokens_cache_write: 0, tools: [], tools_counted: [],
      tool_calls: [
        { tool: 'Bash', start_ms: T, duration_ms: 1500 },
        { tool: 'Read', start_ms: T + 1, duration_ms: null },
        { tool: 'X', start_ms: null, duration_ms: 5 },
      ],
    }],
  };
  const calls = contractTurn(sheet).turns[0].tool_calls;
  assert.equal(calls.length, 2, 'the call without start_ms is left out');
  assert.equal(calls[0].duration_s, 2);
  assert.equal('duration_s' in calls[1], false, 'unmeasured duration = no duration_s key');
});

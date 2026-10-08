// Probes for block A of the reader derivations — the 17 existing elements as a counter-check.
// Run: `npm test`
// Every expected value is MEASURED on the fixtures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import {
  loadSession, blockA, tokensByKind, tokensByModel, tokensByAgentType, fillLevel,
  buildTurns, timing, ACTOR_MAIN, ACTOR_NO_ROLE,
} from './derive.js';
import { readTranscript } from './parser.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, 'fixtures', 'projects');
export const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
export const B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
export const NOW = Date.parse('2026-09-10T12:00:00.000Z');

export function sheet(id) {
  const inv = inventory({ root: ROOT, nowMs: NOW });
  return blockA(loadSession(findSession(inv, id)), { nowMs: NOW });
}

test('#12 identity + #13 clock: structure, never title text', () => {
  const a = sheet(A);
  assert.equal(a.identity.session_id, A);
  assert.equal(a.identity.project_slug, 'c--dev-sample-app');
  assert.deepEqual(a.identity.git_branches, ['dev']);
  assert.deepEqual(a.identity.harness_versions, ['2.1.247']);
  assert.deepEqual(a.identity.entrypoints, ['claude-vscode']);
  assert.deepEqual(a.identity.prompt_sources, ['sdk']);
  assert.equal(a.as_of, '2026-09-10T12:00:00.000Z');
  assert.equal(a.identity.has_ai_title, true);
  // 8 = the length of the marker `<<TEXT>>` in the masked fixture. Exactly that is the point:
  // the reader counts characters, it does not read them.
  assert.equal(a.identity.ai_title_chars, 8);
  assert.equal('ai_title' in a.identity, false);
});

test('#2/#3 total tokens and tokens per kind — deduplicated sums', () => {
  const a = sheet(A);
  assert.equal(a.tokens.own_total, 4_149_147);
  assert.equal(a.tokens.fleet_total, 1_663_305);
  assert.equal(a.tokens.total, 5_812_452);
  assert.deepEqual(a.tokens.by_kind, { in: 80, out: 32_225, cache_read: 4_012_938, cache_write: 103_904 });
  const kindSum = Object.values(a.tokens.by_kind).reduce((x, y) => x + y, 0);
  assert.equal(kindSum, a.tokens.own_total, 'the four kinds must give the own sum');
});

test('#16/#20 tokens per model and #4/#19 per agent type add up to total', () => {
  const a = sheet(A);
  assert.deepEqual(a.tokens.by_model, { 'claude-opus-5': 4_149_147, 'claude-sonnet-5': 1_663_305 });
  assert.deepEqual(a.tokens.by_agent_type, {
    [ACTOR_MAIN]: 4_149_147, builder: 1_128_866, recorder: 534_439,
  });
  for (const bucket of [a.tokens.by_model, a.tokens.by_agent_type]) {
    assert.equal(Object.values(bucket).reduce((x, y) => x + y, 0), a.tokens.total,
      'adding up exactly is the promise — otherwise the breakdown would be a lie');
  }
  const b = sheet(B);
  assert.deepEqual(b.tokens.by_agent_type, { main: 6_624_156, worker: 470_433, reviewer: 355_762 });
  assert.deepEqual(Object.keys(b.tokens.by_model).sort(),
    ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5']);
});

test('#19 third half ring: tokens per subagent, descending', () => {
  const a = sheet(A);
  assert.deepEqual(a.tokens.by_subagent.map((s) => [s.agent_id, s.agent_type, s.tokens_total]), [
    ['af40455aa5d7481a2', 'recorder', 534_439],
    ['a3ca5dd18ea8078ce', 'builder', 485_114],
    ['ac4f8333e47540c3b', 'builder', 371_390],
    ['a0dd62425ec1c7d7c', 'builder', 272_362],
  ]);
  assert.equal(a.tokens.by_subagent.reduce((n, s) => n + s.tokens_total, 0), a.tokens.fleet_total);
  for (const s of a.tokens.by_subagent) assert.equal(s.spawn_depth, 1);
});

test('#1/#21 fill level: numerator from the file, denominator from the hand table', () => {
  const a = sheet(A);
  assert.equal(a.context.model, 'claude-opus-5');
  assert.equal(a.context.window, 1_000_000);
  assert.equal(a.context.used_tokens, 136_534);
  assert.equal(a.context.percent, 13.7);
  assert.equal(a.context.window_source, 'model_window_table',
    'the window size is in NO line — the field says where it comes from');
  assert.equal(sheet(B).context.model, 'claude-fable-5');
  // Empty series ⇒ null, never 0 %.
  assert.deepEqual(fillLevel(readTranscript('')), {
    model: null, window: null, used_tokens: null, percent: null, measured_at: null,
  });
});

test('#7 turn number + #6 turn duration: three turns, the preamble does not count', () => {
  const a = sheet(A);
  assert.equal(a.turns.length, 3);
  assert.deepEqual(a.turns.map((z) => z.number), [1, 2, 3]);
  assert.equal(a.preamble.number, 0);
  assert.equal(a.preamble.tokens_total, 0, 'this session begins with the human line');
  assert.deepEqual(a.turns.map((z) => z.duration_ms), [305_478, 149_079, 371_310]);
  assert.deepEqual(a.turns.map((z) => z.tokens_total), [1_118_478, 1_374_342, 1_656_327]);
  assert.deepEqual(a.turns.map((z) => z.usages), [14, 13, 13]);
  assert.equal(a.turns.reduce((n, z) => n + z.tokens_total, 0), a.tokens.own_total,
    'the turn sums must give the own sum');
  for (const z of a.turns) {
    assert.equal(z.model, 'claude-opus-5');
    assert.ok(z.user_mark && z.user_mark.time, '#25 user mark at the start of the turn');
    assert.equal(z.user_mark.prompt_source, 'sdk');
  }
});

test('#9 session runtime and #10 work time without wait time', () => {
  const a = sheet(A);
  assert.equal(a.time.start, '2026-08-29T14:40:46.478Z');
  assert.equal(a.time.end, '2026-08-29T15:06:23.199Z');
  assert.equal(a.time.runtime_ms, 1_536_721);
  assert.equal(a.time.wait_ms, 691_982);
  assert.equal(a.time.work_ms, 844_739);
  assert.equal(a.time.work_ms + a.time.wait_ms, a.time.runtime_ms);
  assert.equal(a.time.measured_pauses, 2, 'two pauses with three turns');
  // Without timestamps there is no time — null, never 0.
  const empty = timing(readTranscript(''), [], null);
  assert.deepEqual(empty, { start: null, end: null, runtime_ms: null, wait_ms: null, work_ms: null, measured_pauses: 0 });
});

test('#27 tools per turn with duration — 40 pairs, all tool-precise', () => {
  const a = sheet(A);
  assert.deepEqual(a.turns[0].tools, ['Bash', 'Agent', 'ToolSearch', 'SendMessage']);
  const bash = a.turns[0].tools_counted.find((w) => w.tool === 'Bash');
  assert.deepEqual(bash, { tool: 'Bash', count: 8, duration_ms_sum: 9814, measured_durations: 8, precision: 'tool' });
  const all = a.turns.flatMap((z) => z.tools_counted);
  assert.equal(all.reduce((n, w) => n + w.count, 0), 40);
  assert.equal(all.reduce((n, w) => n + w.measured_durations, 0), 40, '40 of 40 pairs matched');
  const b = sheet(B);
  const skill = b.turns[1].tools_counted.find((w) => w.tool === 'Skill');
  assert.equal(skill.count, 2);
});

test('parallel tool_use of the same message ⇒ duration only MESSAGE-precise', () => {
  // Two tools in ONE assistant message — synthetic, because the fixtures do not contain this
  // case (measured: 40 of 40 pairs tool-precise).
  const lines = [
    { type: 'user', origin: { kind: 'human' }, uuid: 'u0', timestamp: '2026-09-10T10:00:00.000Z' },
    {
      type: 'assistant', uuid: 'a1', timestamp: '2026-09-10T10:00:01.000Z',
      message: {
        model: 'claude-opus-5', id: 'msg_1', usage: { input_tokens: 1, output_tokens: 1 },
        content: [
          { type: 'tool_use', id: 'toolu_A', name: 'Bash', input: { command: 'secret' } },
          { type: 'tool_use', id: 'toolu_B', name: 'Bash', input: { command: 'secret' } },
        ],
      },
    },
    { type: 'user', uuid: 'u1', timestamp: '2026-09-10T10:00:03.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_A' }] } },
    { type: 'user', uuid: 'u2', timestamp: '2026-09-10T10:00:09.000Z', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_B' }] } },
  ].map((o) => JSON.stringify(o)).join('\n');
  const { turns } = buildTurns(readTranscript(lines));
  assert.equal(turns.length, 1);
  const bash = turns[0].tools_counted[0];
  assert.equal(bash.count, 2);
  assert.equal(bash.duration_ms_sum, 2000 + 8000);
  assert.equal(bash.precision, 'message', 'shared start stamp ⇒ only message-precise');
  assert.equal(JSON.stringify(turns).includes('secret'), false, 'leak rule: the input does not travel');
});

test('#11 subagent count + measurements of the run', () => {
  const a = sheet(A);
  assert.equal(a.fleet_count, 4);
  assert.equal(a.measurement.lines_total, 137);
  assert.equal(a.measurement.lines_broken, 0);
  assert.equal(a.measurement.turns_counted, 3);
  assert.equal(a.measurement.fleet_lines, 160);
  assert.equal(a.measurement.duplicates_dropped, 96);
  assert.equal(sheet(B).fleet_count, 2);
});

test('role fallback: subagent without meta.json ⇒ no_role, never dropped', () => {
  const series = readTranscript(JSON.stringify({
    type: 'assistant', uuid: 'x', timestamp: '2026-09-10T10:00:00.000Z',
    message: { model: 'claude-sonnet-5', id: 'm1', usage: { input_tokens: 5, output_tokens: 5 } },
  }));
  const bucket = tokensByAgentType(readTranscript(''), [{ entry: { agent_type: null }, series }]);
  assert.deepEqual(bucket, { [ACTOR_NO_ROLE]: 10 });
  assert.equal(tokensByKind(readTranscript('')).total, 0);
  assert.deepEqual(tokensByModel([]), {});
});

test('no plain text, no path in the sheet (trip-wire)', () => {
  let runs = 0;
  for (const id of [A, B]) {
    const text = JSON.stringify(sheet(id));
    runs++;
    assert.ok(text.length > 3000, 'the probe ran against a real, filled sheet');
    // Checked key-exact: `prompt_sources` is an allowed structure name, `"prompt":` is not.
    for (const forbidden of ['<<TEXT>>', 'main_file', '"file"', 'C:\\\\', '"description"', '"prompt"', '"command"', 'aiTitle', 'lastPrompt']) {
      assert.equal(text.includes(forbidden), false, `${forbidden} in the sheet of ${id}`);
    }
  }
  assert.equal(runs, 2);
  assert.ok(runs >= 1);
});

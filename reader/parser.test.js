// Probes for the reader line parser. Run: `npm test`
// Every expected value is MEASURED on the fixtures (not estimated) — the fixtures themselves are
// real, shortened, masked and anonymised transcripts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  readTranscript, eventsOfKind, windowForModel, WINDOW_FALLBACK, dedupKey,
  isHumanLine, isNotification, isToolResult, usageFrom, timeMs, readNotification, ident,
} from './parser.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const PROJECT = join(HERE, 'fixtures', 'projects', 'c--dev-sample-app');
export const SESSION_A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10'; // 3 human turns, 4 subagents
export const SESSION_B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36'; // 2 skills, 2 resumes

function main(id, seen = new Set()) {
  return readTranscript(readFileSync(join(PROJECT, `${id}.jsonl`), 'utf8'), { source: 'main', seen });
}
function subs(id, seen = new Set()) {
  const dir = join(PROJECT, id, 'subagents');
  return readdirSync(dir).filter((f) => f.endsWith('.jsonl'))
    .map((f) => readTranscript(readFileSync(join(dir, f), 'utf8'), { source: 'subagent', seen }));
}
const sum = (series) => eventsOfKind(series, 'usage').reduce((a, x) => a + x.total, 0);

test('window table (kept by hand)', () => {
  assert.equal(windowForModel('claude-opus-5'), 1_000_000);
  assert.equal(windowForModel('claude-opus-5[1m]'), 1_000_000);
  assert.equal(windowForModel('claude-fable-5'), 1_000_000);
  assert.equal(windowForModel('claude-sonnet-5'), 1_000_000);
  assert.equal(windowForModel('claude-haiku-4-5'), 200_000);
  assert.equal(windowForModel('claude-sonnet-4-6'), 1_000_000);
  assert.equal(windowForModel('something-new'), WINDOW_FALLBACK);
  assert.equal(windowForModel(''), WINDOW_FALLBACK);
  assert.equal(windowForModel(null), WINDOW_FALLBACK);
});

test('dedup key: message.id → requestId → uuid', () => {
  assert.equal(dedupKey({ message: { id: 'msg_1' }, requestId: 'req_1', uuid: 'u1' }), 'msg_1');
  assert.equal(dedupKey({ requestId: 'req_1', uuid: 'u1' }), 'req_1');
  assert.equal(dedupKey({ uuid: 'u1' }), 'u1');
  assert.equal(dedupKey({}), null);
});

test('turn boundaries ONLY via origin.kind:"human" — tool results are user lines too', () => {
  const human = { type: 'user', origin: { kind: 'human' } };
  const tool = { type: 'user', toolUseResult: {} };
  const notification = { type: 'user', origin: { kind: 'task-notification' } };
  assert.equal(isHumanLine(human), true);
  assert.equal(isHumanLine(tool), false);
  assert.equal(isHumanLine(notification), false);
  assert.equal(isToolResult(tool), true);
  assert.equal(isNotification(notification), true);
  // Counter-check on the real file: 49 `user` lines, but only 3 of them are turns.
  const a = main(SESSION_A);
  assert.equal(a.type_counts.user, 49);
  assert.equal(eventsOfKind(a, 'human').length, 3);
  assert.equal(eventsOfKind(a, 'notification').length, 3);
});

test('dedup is mandatory: measured factor 1.874 on fixture A', () => {
  const a = main(SESSION_A);
  assert.equal(a.lines_total, 137);
  assert.equal(a.lines_broken, 0);
  assert.equal(a.type_counts.assistant, 77);
  assert.equal(eventsOfKind(a, 'usage').length, 40);
  assert.equal(a.duplicates, 37);
  assert.equal(40 + 37, 77, 'every assistant line is either a first sight or a duplicate');
  assert.equal(sum(a), 4_149_147);
  // Raw, without the guard — the number that would come out without dedup:
  let raw = 0;
  for (const z of readFileSync(join(PROJECT, `${SESSION_A}.jsonl`), 'utf8').split(/\r?\n/)) {
    if (!z.trim()) continue;
    let o; try { o = JSON.parse(z); } catch { continue; }
    const u = usageFrom(o);
    if (u) raw += u.total;
  }
  assert.equal(raw, 7_773_581);
  assert.ok(raw / sum(a) > 1.8, `factor ${(raw / sum(a)).toFixed(3)} — without dedup the number would be a lie`);
});

test('shared duplicate guard across file boundaries: main + fleet count every line once', () => {
  const seen = new Set();
  const a = main(SESSION_A, seen);
  const fleet = subs(SESSION_A, seen);
  assert.equal(fleet.length, 4);
  const fleetSum = fleet.reduce((n, r) => n + sum(r), 0);
  assert.equal(sum(a), 4_149_147);
  assert.equal(fleetSum, 1_663_305);
  assert.equal(sum(a) + fleetSum, 5_812_452);
  // Second run with THE SAME set: everything already seen, nothing counts twice.
  const again = main(SESSION_A, seen);
  assert.equal(sum(again), 0);
  assert.equal(again.duplicates, 77);
});

test('usage series per assistant line: four kinds + window fill', () => {
  const a = main(SESSION_A);
  const n = eventsOfKind(a, 'usage');
  const s = n.reduce((acc, x) => ({
    in: acc.in + x.in, out: acc.out + x.out,
    read: acc.read + x.cache_read, write: acc.write + x.cache_write,
  }), { in: 0, out: 0, read: 0, write: 0 });
  assert.deepEqual(s, { in: 80, out: 32_225, read: 4_012_938, write: 103_904 });
  for (const x of n) {
    assert.equal(x.total, x.in + x.out + x.cache_read + x.cache_write);
    assert.equal(x.window_used, x.in + x.cache_read + x.cache_write);
    assert.equal(x.window, 1_000_000, 'claude-opus-5 → 1M');
  }
  assert.deepEqual(a.models, ['claude-opus-5']);
  assert.deepEqual(a.versions, ['2.1.247']);
  assert.deepEqual(a.entrypoints, ['claude-vscode']);
  assert.deepEqual(a.prompt_sources, ['sdk']);
  assert.deepEqual(a.branches, ['dev']);
});

test('tool starts carry name and structure — never the input', () => {
  const a = main(SESSION_A);
  const starts = eventsOfKind(a, 'tool_start');
  const counted = {};
  for (const e of starts) counted[e.name] = (counted[e.name] || 0) + 1;
  assert.deepEqual(counted, { Bash: 25, Agent: 4, ToolSearch: 1, SendMessage: 1, Edit: 9 });
  assert.equal(eventsOfKind(a, 'tool_end').length, 40);
  const agents = starts.filter((e) => e.name === 'Agent');
  assert.deepEqual(agents.map((e) => e.subagent_type), ['recorder', 'recorder', 'builder', 'builder']);
  for (const e of starts) {
    assert.equal('command' in e, false);
    assert.equal('prompt' in e, false);
    assert.equal('args' in e, false);
    assert.equal('input' in e, false);
  }
});

test('skills in fixture B: two starts, tokens per skill via attributionSkill', () => {
  const b = main(SESSION_B);
  const skillStarts = eventsOfKind(b, 'tool_start').filter((e) => e.name === 'Skill');
  assert.deepEqual(skillStarts.map((e) => e.skill), ['review', 'cleanup']);
  assert.equal(new Date(skillStarts[0].time).toISOString(), '2026-08-26T08:48:50.954Z');
  const bySkill = {};
  for (const x of eventsOfKind(b, 'usage')) {
    const k = x.skill || '(none)';
    bySkill[k] = (bySkill[k] || 0) + x.total;
  }
  assert.deepEqual(bySkill, { '(none)': 4_775_454, review: 213_827, 'cleanup': 1_634_875 });
  assert.equal(sum(b), 6_624_156);
});

test('resume: SendMessage instead of Agent — resumedAgentId measured', () => {
  const b = main(SESSION_B);
  const results = eventsOfKind(b, 'agent_result');
  assert.equal(results.length, 4);
  const fresh = results.filter((e) => e.agent_id);
  const resumed = results.filter((e) => e.resumed_agent_id);
  assert.equal(fresh.length, 2);
  assert.equal(resumed.length, 2);
  assert.deepEqual(fresh.map((e) => e.resolved_model), ['claude-sonnet-5', 'claude-opus-5[1m]']);
  assert.deepEqual(resumed.map((e) => e.resumed_agent_id), ['af65c42cd31ffb767', 'a228776e90479f493']);
  // Exactly this is where the count gap comes from: 3 Agent blocks, 2 files.
  assert.equal(eventsOfKind(b, 'tool_start').filter((e) => e.name === 'Agent').length, 3);
  assert.equal(readdirSync(join(PROJECT, SESSION_B, 'subagents')).filter((f) => f.endsWith('.jsonl')).length, 2);
});

test('task-notification: only tool-use-id, task-id and status leave the line', () => {
  const b = main(SESSION_B);
  const m = eventsOfKind(b, 'notification');
  assert.equal(m.length, 4);
  assert.deepEqual(m.map((e) => e.status), ['completed', 'completed', 'completed', 'completed']);
  // The same task-id reports done twice — a resume, not a hard end (measured).
  assert.equal(new Set(m.map((e) => e.task_id)).size, 2);
  for (const e of m) {
    assert.deepEqual(Object.keys(e).sort(), ['kind', 'source', 'status', 'task_id', 'tool_use_id', 'time'].sort());
  }
  const raw = '<task-notification><task-id>t1</task-id><tool-use-id>toolu_9</tool-use-id>'
    + '<status>completed</status><summary>Agent "Secret" finished</summary><note>Prose</note></task-notification>';
  const read = readNotification(raw);
  assert.deepEqual(read, { tool_use_id: 'toolu_9', task_id: 't1', status: 'completed' });
  assert.equal(JSON.stringify(read).includes('Secret'), false);
  assert.equal(JSON.stringify(read).includes('Prose'), false);
  assert.equal(readNotification('some plain text'), null);
  assert.equal(readNotification(null), null);
});

test('subagent files: agentId per line, attributionAgent instead of attributionSkill', () => {
  const fleet = subs(SESSION_B);
  assert.equal(fleet.length, 2);
  const roles = fleet.map((r) => [...new Set(eventsOfKind(r, 'usage').map((x) => x.attributed_agent))]);
  assert.deepEqual(roles, [['reviewer'], ['worker']]);
  assert.deepEqual(fleet.map((r) => r.agent_id), ['a228776e90479f493', 'af65c42cd31ffb767']);
  assert.deepEqual(fleet.map((r) => r.models), [['claude-opus-5'], ['claude-sonnet-5']]);
  assert.deepEqual(fleet.map((r) => r.source), ['subagent', 'subagent']);
});

test('broken and empty input ⇒ a count instead of a throw', () => {
  const r = readTranscript('{"type":"user"}\nnot json\n\n{"type":"assistant"}\n');
  assert.equal(r.lines_total, 3);
  assert.equal(r.lines_broken, 1);
  assert.equal(r.events.length, 0);
  assert.equal(readTranscript('').lines_total, 0);
  assert.equal(readTranscript(null).lines_total, 0);
  assert.equal(readTranscript(undefined).events.length, 0);
  // CRLF must give the same series as LF (Windows checkout).
  assert.equal(readTranscript('{"type":"user"}\r\n{"type":"assistant"}\r\n').lines_broken, 0);
});

test('timeMs and usageFrom: unreadable ⇒ null, never 0', () => {
  assert.equal(timeMs('2026-09-10T12:00:00.000Z'), 1789041600000);
  assert.equal(timeMs('nonsense'), null);
  assert.equal(timeMs(null), null);
  assert.equal(timeMs(''), null);
  assert.equal(usageFrom({}), null);
  assert.deepEqual(usageFrom({ message: { usage: { input_tokens: 1, output_tokens: 2 } } }), {
    in: 1, out: 2, cache_read: 0, cache_write: 0, total: 3, window_used: 1,
  });
});

test('no plain text in the event series (trip-wire)', () => {
  let runs = 0;
  for (const id of [SESSION_A, SESSION_B]) {
    const seen = new Set();
    const text = JSON.stringify([main(id, seen), ...subs(id, seen)]);
    runs++;
    assert.ok(text.length > 5000, 'the probe ran against a real, non-empty series');
    assert.equal(text.includes('<<TEXT>>'), false, `plain-text marker in the series of ${id}`);
    for (const field of ['aiTitle', 'lastPrompt', 'description', 'command', 'args']) {
      assert.equal(text.includes(field), false, `forbidden field ${field} in ${id}`);
    }
  }
  assert.ok(runs >= 1, 'the absence probe must have run');
  assert.equal(runs, 2);
});

test('ident() refuses prose and lets the marker THROUGH', () => {
  // The scrubber used to stand IN FRONT of the leak check: it stripped `<` `>` and whitespace,
  // so `<<TEXT>>` became `TEXT` and a prompt became a harmless short word — rule 3 of the leak
  // check did not bite on exactly the path EVERY reader field takes. Now: refuse instead of
  // scrub, and the marker survives so the leak check sees it.
  assert.equal(ident('<<TEXT>>'), '<<TEXT>>', 'the marker must not be taken apart');
  assert.equal(checkLeaks({ a: ident('<<TEXT>>') }).clean, false, 'and the leak check must see it');
  assert.equal(checkLeaks({ a: ident('<<TEXT>>') }).violations[0].reason, 'mask_marker');
  assert.equal(ident('please check the ticket for me'), null, 'prose is refused');
  assert.equal(ident('state-distillate sample-host'), null);
  assert.equal(ident('x'.repeat(200), 80), null, 'too long is refused, not trimmed');
  // What really occurs (measured) travels unchanged:
  for (const real of ['dev', 'agent/some-feature-2', 'claude-opus-5[1m]', 'general-purpose',
    'toolu_VJMUpC3izPoMzQWQzCrIo8NS', '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10', '2.1.247',
    'claude-vscode', 'sdk', 'async_launched', 'cleanup']) {
    assert.equal(ident(real), real, `${real} must travel through`);
  }
  assert.equal(ident(null), null);
  assert.equal(ident(''), null);
});

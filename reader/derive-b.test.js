// Probes for block B of the reader derivations — the NEW elements.
// Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import {
  loadSession, blockA, blockB, buildSheet, buildTurnSeries, topActive, buildTree,
  buildSkills, mainAndFleet, ACTIVE_SECONDS,
  MARK_DEPTH_UNCHECKED, MARK_PROMPT_SOURCE_UNCHECKED, MARK_RESUMABLE,
} from './derive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const SLUG = 'c--dev-sample-app';
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

function loaded(id, root = ROOT, nowMs = NOW) {
  return loadSession(findSession(inventory({ root, nowMs }), id));
}
const b_of = (id) => blockB(loaded(id), { nowMs: NOW });

test('#5 main agent and fleet: the deviation is shown, never smoothed', () => {
  const a = mainAndFleet(loaded(A));
  assert.equal(a.main, 1);
  assert.equal(a.fleet_files, 4);
  assert.equal(a.agent_blocks, 4);
  assert.equal(a.new_starts, 3);
  assert.equal(a.resumes, 0);
  assert.deepEqual(a.deviation_reasons, ['not_yet_resolved']);

  // Fixture B is the resume case: 3 blocks, 2 files, 2 resumes.
  const b = mainAndFleet(loaded(B));
  assert.equal(b.fleet_files, 2);
  assert.equal(b.agent_blocks, 3);
  assert.equal(b.new_starts, 2);
  assert.equal(b.resumes, 2);
  assert.equal(b.deviation, 1);
  assert.deepEqual(b.deviation_reasons, ['resume']);
  assert.deepEqual(b.agent_types, ['worker', 'worker', 'reviewer']);
});

test('#17 time series: one point per usage, ascending, main and fleet told apart', () => {
  const b = b_of(A);
  assert.equal(b.time_series.length, 79);
  for (let i = 1; i < b.time_series.length; i++) {
    assert.ok(b.time_series[i].time_ms >= b.time_series[i - 1].time_ms, 'ascending by time');
  }
  const main = b.time_series.filter((p) => p.source === 'main');
  assert.equal(main.length, 40);
  assert.equal(main[main.length - 1].tokens_cumulative, 4_149_147, 'cumulative ends on the own sum');
  assert.equal(b.time_series.filter((p) => p.source === 'subagent').length, 39);
  assert.equal(main[0].percent, 5.7);
  assert.equal(main[0].agent_type, 'main');
});

test('#18 turn series: the same points, per turn — the sum stays complete', () => {
  const b = b_of(A);
  assert.deepEqual(b.turn_series.map((z) => z.turn_number), [1, 2, 3, null]);
  assert.deepEqual(b.turn_series.map((z) => z.tokens), [1_652_917, 1_374_342, 2_300_079, 485_114]);
  const total = b.turn_series.reduce((n, z) => n + z.tokens, 0);
  assert.equal(total, blockA(loaded(A), { nowMs: NOW }).tokens.total,
    'no point may drop out silently');
  // The null bucket is a subagent whose Agent block lies outside the excerpt.
  const without = b.turn_series.find((z) => z.turn_number === null);
  assert.equal(without.tokens_main, 0);
  assert.equal(without.tokens_fleet, 485_114);
  assert.deepEqual(buildTurnSeries([]), []);
});

test('#23 skills: start = Skill tool_use, tokens per skill = sum of the attributionSkill blocks', () => {
  const b = b_of(B);
  assert.equal(b.skills.start_count, 2);
  assert.deepEqual(b.skills.distinct, ['cleanup', 'review']);
  assert.deepEqual(b.skills.starts.map((s) => [s.skill, s.time, s.turn_number]), [
    ['review', '2026-08-26T08:48:50.954Z', 2],
    ['cleanup', '2026-08-26T09:15:13.278Z', 2],
  ]);
  assert.deepEqual(b.skills.by_skill, [
    { skill: 'cleanup', starts: 1, usages: 10, tokens: 1_634_875 },
    { skill: 'review', starts: 1, usages: 2, tokens: 213_827 },
  ]);
  assert.equal(b.skills.tokens_without_skill, 4_775_454);
  const sum = b.skills.by_skill.reduce((n, s) => n + s.tokens, 0) + b.skills.tokens_without_skill;
  assert.equal(sum, 6_624_156, 'skill buckets + rest = the own sum');
  // Fixture A has no skill — empty means empty, not "not recorded".
  const a = b_of(A);
  assert.equal(a.skills.start_count, 0);
  assert.deepEqual(a.skills.by_skill, []);
  assert.equal(a.skills.tokens_without_skill, 4_149_147);
  assert.deepEqual(buildSkills({ main: { events: [] } }).starts, []);
});

test('#25 user marks: point in time and turn number, never the prompt', () => {
  const b = b_of(A);
  assert.equal(b.user_marks.length, 3);
  assert.deepEqual(b.user_marks.map((m) => m.turn_number), [1, 2, 3]);
  assert.equal(b.user_marks[0].time, '2026-08-29T14:40:46.478Z');
  assert.equal(b.user_marks[0].prompt_source, 'sdk');
  for (const m of b.user_marks) assert.equal('text' in m, false);
});

test('tree: Agent blocks in order of creation, unresolved ones do NOT drop out', () => {
  const tree = buildTree(loaded(A));
  assert.equal(tree.node_count, 6);
  assert.equal(tree.nodes[0].parent, null, 'exactly the root has no parent');
  assert.equal(tree.nodes[0].id, A);
  assert.equal(tree.max_depth, 1);
  assert.equal(tree.unresolved, 1, 'one Agent block without a file — visible, not concealed');
  assert.deepEqual(tree.nodes.slice(1).map((k) => k.role),
    ['recorder', 'recorder', 'builder', 'builder', 'builder']);
  assert.deepEqual(tree.nodes.slice(1).map((k) => k.turn_number), [1, 1, 3, 3, null]);
  assert.equal(tree.nodes.at(-1).file_only, true, 'a file without a visible block stays in the tree');
  assert.deepEqual(tree.unchecked, [MARK_DEPTH_UNCHECKED]);

  // A resume creates NO second node.
  const treeB = buildTree(loaded(B));
  assert.equal(treeB.node_count, 4);
  assert.equal(new Set(treeB.nodes.map((k) => k.id)).size, 4);
  assert.equal(treeB.nodes[2].model_requested, 'sonnet');
});

test('#24 top 3 active: mtime ≤ 180 s AND no completed after it (mtime set, not guessed)', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'reader-active-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const target = join(tmp, 'projects', SLUG);
  cpSync(join(ROOT, SLUG), target, { recursive: true });
  const now = Date.parse('2026-08-29T15:05:00.000Z');
  const set = (agent, isoTime) => {
    const t2 = new Date(isoTime);
    utimesSync(join(target, A, 'subagents', `agent-${agent}.jsonl`), t2, t2);
  };
  //  completed notifications of this session (measured): af40455a 14:45:48Z · a0dd6242 15:02:33Z ·
  //  ac4f8333 15:04:23Z · a3ca5dd1 none at all.
  set('af40455aa5d7481a2', '2026-08-29T15:04:30.000Z'); // fresh, completed BEFORE mtime → active
  set('ac4f8333e47540c3b', '2026-08-29T15:04:00.000Z'); // fresh, completed AFTER mtime  → done
  set('a0dd62425ec1c7d7c', '2026-08-29T14:00:00.000Z'); // old                           → inactive
  set('a3ca5dd18ea8078ce', '2026-08-29T15:03:00.000Z'); // fresh, never reported         → active

  const top = topActive(loaded(A, join(tmp, 'projects'), now), { nowMs: now });
  assert.equal(top.window_seconds, ACTIVE_SECONDS);
  assert.equal(top.window_seconds, 180);
  const by = Object.fromEntries(top.all.map((z) => [z.agent_id, z]));
  assert.equal(by.af40455aa5d7481a2.age_seconds, 30);
  assert.equal(by.af40455aa5d7481a2.active, true);
  assert.equal(by.ac4f8333e47540c3b.fresh, true);
  assert.equal(by.ac4f8333e47540c3b.completed_after_change, true);
  assert.equal(by.ac4f8333e47540c3b.active, false, 'completed after the last change = done');
  assert.equal(by.a0dd62425ec1c7d7c.fresh, false);
  assert.equal(by.a0dd62425ec1c7d7c.age_seconds, 3900);
  assert.equal(by.a0dd62425ec1c7d7c.active, false);
  assert.equal(by.a3ca5dd18ea8078ce.completed_notifications, 0);
  assert.equal(by.a3ca5dd18ea8078ce.active, true);
  assert.equal(top.active_total, 2);
  assert.deepEqual(top.active.map((z) => z.agent_id), ['af40455aa5d7481a2', 'a3ca5dd18ea8078ce']);
  assert.ok(top.active.length <= 3, 'at most three bars next to the session one');
  assert.equal(top.approximation, true);
  assert.equal(top.caveat, MARK_RESUMABLE);
  assert.equal(top.active[0].percent, 5.3);
});

test('the two unchecked items stand in the sheet, not in an assumption', () => {
  const b = b_of(A);
  assert.deepEqual(b.unchecked, [MARK_PROMPT_SOURCE_UNCHECKED, MARK_DEPTH_UNCHECKED]);
  assert.equal(MARK_PROMPT_SOURCE_UNCHECKED, 'prompt_source_outside_vscode_unchecked');
  assert.equal(MARK_DEPTH_UNCHECKED, 'task_notification_at_spawn_depth_above_1_unchecked');
  assert.deepEqual(b.top_active.unchecked, [MARK_DEPTH_UNCHECKED]);
  assert.deepEqual(b.tree.unchecked, [MARK_DEPTH_UNCHECKED]);
  // The active logic must not depend on the depth: depth out, verdict stays.
  const g = loaded(A);
  for (const f of g.fleet) f.entry = { ...f.entry, spawn_depth: null };
  const withoutDepth = topActive(g, { nowMs: NOW });
  assert.equal(withoutDepth.all.length, 4);
  assert.equal(withoutDepth.all.every((z) => typeof z.active === 'boolean'), true);
});

test('buildSheet delivers both blocks, no plain text, no path (trip-wire)', () => {
  let runs = 0;
  for (const id of [A, B]) {
    const s = buildSheet(loaded(id), { nowMs: NOW });
    runs++;
    assert.ok(s.tokens && s.block_b, 'A and B in one sheet');
    const text = JSON.stringify(s);
    assert.ok(text.length > 10_000, 'the probe ran against a real, filled sheet');
    for (const forbidden of ['<<TEXT>>', 'main_file', '"file"', 'C:\\\\', '"description"', '"prompt"', '"command"', 'aiTitle', 'lastPrompt']) {
      assert.equal(text.includes(forbidden), false, `${forbidden} in the sheet of ${id}`);
    }
  }
  assert.equal(runs, 2);
  assert.ok(runs >= 1);
});

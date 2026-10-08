// Probes for workflow agents (`<session>/subagents/workflows/<wf>/agent-*.jsonl`) in the reader.
// Run: `npm test`
// Base: a temporary copy of the existing fixture (pattern of inventory.test.js); no new fixture.
// Recognition ONLY by the directory, never by agentType (measured: a workflow agent can carry general-purpose).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { readTranscript } from './parser.js';
import {
  loadSession, blockA, blockB, buildTree, mainAndFleet, tokensByKind,
} from './derive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = join(HERE, 'fixtures', 'projects');
const SLUG = 'c--dev-sample-app';
const SESSION = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const SOURCE = ['a3ca5dd18ea8078ce', 'a0dd62425ec1c7d7c'];   // two existing fixture agents
// sha256 of {blockA (version normalised to 1.0), buildTree} of the fixture session with fixed file
// times (FIX_TIME). Pins the output of a session WITHOUT a workflows folder byte for byte.
// Derivation: the original reader (before workflow support) produced a golden hash on the original
// fixtures; the port reproduces that exact output on the anonymised fixtures once keys and enumerated
// values are renamed to English (checked when porting: translated original output and port output
// hash identically). Independent of real file mtimes, because `copy()` sets every copied file to FIX_TIME.
const GOLDEN_WITHOUT_WORKFLOW = '426cc161404c77e1fb0e3f6511475fb44cca263452df6adc8e69baaebf3a38e7';
const FIX_TIME = new Date('2026-09-10T11:00:00.000Z');

/** Temp copy of the fixture; `withWorkflow(wfDir, subDir)` may build inside it. */
function copy(t, withWorkflow) {
  const tmp = mkdtempSync(join(tmpdir(), 'reader-wf-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const root = join(tmp, 'projects');
  cpSync(join(FIXTURE_ROOT, SLUG), join(root, SLUG), { recursive: true });
  // cpSync keeps the mtimes: without a fixed time blockA (by_subagent[].mtime) would hang on the checkout time.
  for (const f of readdirSync(join(root, SLUG), { recursive: true })) {
    try { utimesSync(join(root, SLUG, f), FIX_TIME, FIX_TIME); } catch { /* folder edge */ }
  }
  const sub = join(root, SLUG, SESSION, 'subagents');
  if (withWorkflow) withWorkflow(join(sub, 'workflows'), sub);
  return root;
}

/** Copies a fixture agent file with renamed message ids (otherwise the duplicate guard bites). */
function createAgent(sub, wfDir, source, fresh, tag, meta) {
  mkdirSync(wfDir, { recursive: true });
  const text = readFileSync(join(sub, `agent-${source}.jsonl`), 'utf8')
    .replace(/"(msg|req)_/g, `"$1_${tag}_`);
  writeFileSync(join(wfDir, `agent-${fresh}.jsonl`), text);
  if (meta !== undefined) writeFileSync(join(wfDir, `agent-${fresh}.meta.json`), meta);
  return text;
}

const meta1 = JSON.stringify({ agentType: 'general-purpose', toolUseId: 'toolu_wf1', spawnDepth: 2 });
const load = (root) => loadSession(findSession(inventory({ root, nowMs: NOW }), SESSION));

test('two workflow agents: entries with workflow_id, tree nodes, tokens in the sum', (t) => {
  const before = load(FIXTURE_ROOT);
  let texts;
  const root = copy(t, (wf, sub) => {
    const d = join(wf, 'wf_x');
    texts = [
      createAgent(sub, d, SOURCE[0], 'wfaaaa0000000001', 'w1', meta1),
      createAgent(sub, d, SOURCE[1], 'wfbbbb0000000002', 'w2', JSON.stringify({ agentType: 'general-purpose' })),
    ];
    writeFileSync(join(d, 'journal.jsonl'), '{}\n');
  });
  const g = load(root);
  const subs = g.entry.subagents;

  // Trip-wire: the classic ones must be there AND the workflow entries must be found.
  assert.equal(before.entry.subagents.length, 4, 'fixture base: four classic subagents');
  const wf = subs.filter((a) => a.workflow_id === 'wf_x');
  assert.ok(wf.length >= 1, 'trip-wire: at least one workflow entry must be listed');
  assert.equal(wf.length, 2);
  assert.deepEqual(wf.map((a) => a.agent_id).sort(), ['wfaaaa0000000001', 'wfbbbb0000000002']);
  assert.equal(subs.length, 6);
  assert.equal(subs.filter((a) => a.workflow_id === null).length, 4, 'classic ones carry workflow_id null');
  assert.equal(g.entry.subagent_count, 6);

  // Tree: both as nodes (file_only path)
  const tree = buildTree(g);
  const ids = tree.nodes.map((k) => k.id);
  assert.ok(ids.includes('wfaaaa0000000001') && ids.includes('wfbbbb0000000002'), 'both workflow agents in the tree');
  assert.equal(tree.node_count, buildTree(before).node_count + 2);
  // The raw node field travels, but ONLY for workflow agents (classic ones stay byte-identical)
  const wfNodes = tree.nodes.filter((k) => k.workflow_id === 'wf_x');
  assert.equal(wfNodes.length, 2, 'trip-wire: both raw nodes carry workflow_id');
  assert.ok(tree.nodes.filter((k) => k.parent != null && k.workflow_id == null)
    .every((k) => !('workflow_id' in k)), 'classic nodes do not carry the key');

  // Tokens: growth == sum of the two files, measured with a fresh duplicate guard
  const expected = texts.reduce((n, x) => n + tokensByKind(readTranscript(x, { source: 'subagent' })).total, 0);
  assert.ok(expected > 0, 'trip-wire: the workflow files carry tokens at all');
  const a0 = blockA(before, { nowMs: NOW }).tokens;
  const a1 = blockA(g, { nowMs: NOW }).tokens;
  assert.equal(a1.fleet_total - a0.fleet_total, expected);
  assert.equal(a1.total - a0.total, expected);
  assert.ok(a1.by_subagent.some((s) => JSON.stringify(s).includes('wfaaaa0000000001')), 'by_subagent lists the workflow agent');

  // Recognition only by the directory: the general-purpose type changes nothing about the classification
  assert.equal(wf.find((a) => a.agent_id === 'wfaaaa0000000001').agent_type, 'general-purpose');
  assert.equal(wf.find((a) => a.agent_id === 'wfaaaa0000000001').workflow_id, 'wf_x');

  // fleet_files only classic, workflow_agents additive
  const f = mainAndFleet(g);
  assert.equal(f.fleet_files, 4, 'fleet_files counts only entries without workflow_id');
  assert.equal(f.workflow_agents, 2);
  assert.equal(blockB(g, { nowMs: NOW }).main_fleet.workflow_agents, 2);
  assert.equal(mainAndFleet(before).workflow_agents, 0, 'without workflow: field present, value 0');
});

test('run folder with only journal.jsonl (run just started): no entries, no crash', (t) => {
  const root = copy(t, (wf) => {
    mkdirSync(join(wf, 'wf_new'), { recursive: true });
    writeFileSync(join(wf, 'wf_new', 'journal.jsonl'), '{}\n');
  });
  const g = load(root);
  assert.equal(g.entry.subagents.length, 4, 'trip-wire: the four classic ones are listed');
  assert.equal(g.entry.subagents.filter((a) => a.workflow_id != null).length, 0);
  assert.equal(mainAndFleet(g).workflow_agents, 0);
  assert.ok(buildTree(g).node_count >= 1);
});

test('agent file without meta: the entry stands, meta fields null', (t) => {
  const root = copy(t, (wf, sub) => {
    createAgent(sub, join(wf, 'wf_x'), SOURCE[0], 'wfcccc0000000003', 'w3', undefined);
  });
  const s = load(root).entry.subagents.filter((a) => a.workflow_id === 'wf_x');
  assert.equal(s.length, 1, 'trip-wire: the meta-less agent must be listed');
  assert.equal(s[0].agent_type, null);
  assert.equal(s[0].spawn_depth, null);
  assert.equal(s[0].tool_use_id, null);
});

test('`workflows` is a FILE instead of a folder: ignored, no crash', (t) => {
  const root = copy(t, (wf) => { writeFileSync(wf, 'not a folder'); });
  const g = load(root);
  assert.equal(g.entry.subagents.length, 4, 'trip-wire: classic list intact');
  assert.ok(g.entry.subagents.every((a) => a.workflow_id === null));
  assert.equal(mainAndFleet(g).fleet_files, 4);
});

test('session WITHOUT a workflows folder: blockA + tree byte-identical to before (golden hash)', (t) => {
  const root = copy(t, null);   // temp path: proves path independence at the same time
  const g = load(root);
  assert.ok(g.entry.subagents.length >= 1, 'trip-wire: subagents were read');
  assert.ok(g.entry.subagents.every((a) => a.workflow_id === null), 'classic entries: workflow_id null');
  // The additive per-call field `tool_calls` (preamble + turns) is left out of the pin, like the version stamp.
  const a = { ...blockA(g, { nowMs: NOW }), version: '1.0' };
  const strip = (z) => { const { tool_calls, ...rest } = z; void tool_calls; return rest; };
  a.preamble = strip(a.preamble);
  a.turns = a.turns.map(strip);
  const hash = createHash('sha256')
    // The version stamp of blockA was raised (1.0 → 1.1); the golden hash holds for everything ELSE.
    .update(JSON.stringify({ a, b: buildTree(g) })).digest('hex');
  assert.equal(hash, GOLDEN_WITHOUT_WORKFLOW);
});

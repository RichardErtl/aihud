// Probes for `agents.subagents_started` (rule A, AP-B1): the number of subagents started in the
// session = every node WITH a parent, counted on the full uncollapsed list.
// Run: `npm test`
// Fixture `fixtures/started/` (synthetic, see the evidence file): three classic subagents
// (one of them with ZERO tokens: a start line and no reply) plus ONE workflow run of three agents.
// Rule A = 6; the old token rule (`tokens_self > 0`) = 5, so the mixed case tells them apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractSheet } from './contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'started');
const ID = '7e1d4b92-3a6c-4f58-b0d7-9c2e5a8f1b43';
const NOW = Date.parse('2026-09-21T00:00:00.000Z');
const HOST = { device: 'laptop', state: 'awake' };

const sheet = () => buildSheet(loadSession(findSession(inventory({ root: ROOT, nowMs: NOW }), ID)), { nowMs: NOW });
/** Smallest-effort cap that makes the workflow run collapse: shrink until a summary node shows. */
function collapsed(s, full) {
  for (let cap = JSON.stringify(full).length; cap > 0; cap -= 20) {
    const c = contractSheet(s, { ...HOST, capBytes: cap });
    if (c.agents.nodes.some((n) => n.agent_count != null)) return c;
  }
  throw new Error('no cap collapsed the workflow run');
}

test('subagents_started is rule A: every node with a parent, tokenless ones included', () => {
  const full = contractSheet(sheet(), HOST);
  const nodes = full.agents.nodes;
  const ruleA = nodes.filter((n) => n.parent_id != null).length;
  const ruleB = nodes.filter((n) => n.parent_id != null && n.tokens_self > 0).length;
  assert.equal(ruleA, 6, 'trip-wire: fixture has six subagents');
  assert.equal(full.agents.subagents_started, ruleA);
  assert.equal(Number.isInteger(full.agents.subagents_started), true);
  assert.notEqual(full.agents.subagents_started, ruleB, 'mixed case: a tokenless node exists');
  assert.equal(full.agents.version, '1.4');
});

test('subagents_started is identical with and without capBytes (collapsed workflow node counts its agent_count)', () => {
  const s = sheet();
  const full = contractSheet(s, HOST);
  const cut = collapsed(s, full);
  const wf = cut.agents.nodes.find((n) => n.agent_count != null);
  assert.equal(wf.agent_count, 3, 'the workflow run collapsed into one node of three agents');
  assert.ok(cut.agents.nodes.length < full.agents.nodes.length, 'the node list really is shorter');
  assert.equal(cut.agents.subagents_started, full.agents.subagents_started);
  // what the collapsed list alone would say: the summary counts agent_count, not 1
  const fromCollapsed = cut.agents.nodes.filter((n) => n.parent_id != null).reduce((a, n) => a + (n.agent_count || 1), 0);
  assert.equal(fromCollapsed, cut.agents.subagents_started);
});

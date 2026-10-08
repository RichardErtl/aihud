// Probes for the reader inventory. Run: `npm test`
// Source: reader/fixtures/projects — REAL transcripts, shortened, masked (reader/fixtures/mask.js)
// and anonymised (session ids, project slug, agent type names). Every plain-text field carries `<<TEXT>>`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  inventory, projectInventory, findSession, titleMark, readMeta, projectsRoot, clean,
} from './inventory.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const FIXTURE_ROOT = join(HERE, 'fixtures', 'projects');
export const FIXTURE_SLUG = 'c--dev-sample-app';
export const FIXTURE_SESSION = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
export const FIXTURE_SESSION_B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
// Fixed measuring time, so that `age_seconds` does not depend on the clock of the run.
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

test('inventory finds the fixture session with its four subagents', () => {
  const inv = inventory({ root: FIXTURE_ROOT, nowMs: NOW });
  assert.equal(inv.projects.length, 1);
  assert.equal(inv.projects[0].slug, FIXTURE_SLUG);
  assert.equal(inv.sessions_total, 2);
  assert.equal(inv.subagents_total, 6);
  const s = findSession(inv, FIXTURE_SESSION);
  assert.ok(s, 'the session must be in the inventory');
  assert.equal(s.project_slug, FIXTURE_SLUG);
  assert.equal(s.subagent_count, 4);
  assert.ok(s.bytes > 50_000, `main file measured ${s.bytes} bytes`);
  assert.equal(typeof s.mtime, 'string');
  assert.ok(s.age_seconds >= 0);
});

test('agent type and spawn depth come from meta.json — measured values', () => {
  const inv = inventory({ root: FIXTURE_ROOT, nowMs: NOW });
  const s = findSession(inv, FIXTURE_SESSION);
  const types = s.subagents.map((a) => a.agent_type).sort();
  assert.deepEqual(types, ['builder', 'builder', 'builder', 'recorder']);
  for (const a of s.subagents) {
    assert.equal(a.spawn_depth, 1, `${a.agent_id} has depth 1 (no chain > 1 in the whole stock)`);
    assert.match(a.tool_use_id, /^toolu_/);
    assert.ok(a.bytes > 0);
  }
});

test('ai-title appears as a MARK, never as text (leak rule)', () => {
  const inv = inventory({ root: FIXTURE_ROOT, nowMs: NOW });
  const s = findSession(inv, FIXTURE_SESSION);
  assert.equal(s.has_ai_title, true);
  assert.ok(s.ai_title_chars > 0, 'a character count instead of characters');
  assert.equal('ai_title' in s, false);
  assert.equal(JSON.stringify(s).includes('aiTitle'), false);
});

test('no plain text in the inventory: no `description`, no `<<TEXT>>`, no worktreePath', () => {
  const inv = inventory({ root: FIXTURE_ROOT, nowMs: NOW });
  const text = JSON.stringify(inv);
  let runs = 0;
  for (const forbidden of ['description', '<<TEXT>>', 'worktreePath', 'lastPrompt', 'prompt']) {
    runs++;
    assert.equal(text.includes(forbidden), false, `forbidden field in the inventory: ${forbidden}`);
  }
  // Trip-wire: the absence claim above is only worth something if it ran.
  assert.ok(runs >= 1, 'the absence probe must have run');
  assert.equal(runs, 5);
  assert.ok(text.length > 500, 'and it must have run against a non-empty inventory');
});

test('titleMark: missing file ⇒ no mark, never a throw', () => {
  const m = titleMark(join(FIXTURE_ROOT, 'does-not-exist.jsonl'));
  assert.deepEqual(m, { present: false, chars: null });
});

test('readMeta: missing meta.json ⇒ empty structure, never a throw', () => {
  assert.deepEqual(readMeta(join(FIXTURE_ROOT, 'nothing.meta.json')), {
    agent_type: null, spawn_depth: null, tool_use_id: null, model: null,
  });
});

test('unknown root ⇒ empty inventory instead of an error', () => {
  const inv = inventory({ root: join(FIXTURE_ROOT, 'nowhere'), nowMs: NOW });
  assert.equal(inv.sessions_total, 0);
  assert.deepEqual(inv.projects, []);
  assert.equal(inventory({}).sessions_total, 0);
});

test('projectsRoot and clean', () => {
  assert.equal(projectsRoot('C:/home').replace(/\\/g, '/'), 'C:/home/.claude/projects');
  assert.equal(projectsRoot(''), projectsRoot(null));
  // Refuse instead of scrub — a trimmed prompt would look like an identifier and would pass
  // the leak check.
  assert.equal(clean('worker reviewer'), null);
  assert.equal(clean('general-purpose'), 'general-purpose');
  assert.equal(clean(null), null);
  assert.equal(clean('a'.repeat(200)), null);
  assert.equal(clean('<<TEXT>>'), '<<TEXT>>', 'the marker survives, so the leak check sees it');
});

test('projectInventory reads one folder directly, freshest session first', () => {
  const p = projectInventory(join(FIXTURE_ROOT, FIXTURE_SLUG), { nowMs: NOW });
  assert.equal(p.slug, FIXTURE_SLUG);
  assert.equal(p.sessions.length, 2);
  assert.ok(p.sessions[0].mtime_ms >= p.sessions[1].mtime_ms, 'by mtime descending');
});

test('edge 1: the activity of a session is the YOUNGEST of main file AND subagents', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'reader-activity-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const target = join(tmp, 'projects', FIXTURE_SLUG);
  cpSync(join(FIXTURE_ROOT, FIXTURE_SLUG), target, { recursive: true });
  const now = Date.parse('2026-09-10T12:00:00.000Z');
  const old = new Date('2026-09-10T11:00:00.000Z');        // an hour ago
  const young = new Date(now - 30_000);                    // 30 s ago
  utimesSync(join(target, `${FIXTURE_SESSION}.jsonl`), old, old);   // main file: quiet
  const subDir = join(target, FIXTURE_SESSION, 'subagents');
  utimesSync(join(subDir, 'agent-a0dd62425ec1c7d7c.jsonl'), old, old);
  utimesSync(join(subDir, 'agent-ac4f8333e47540c3b.jsonl'), old, old);
  utimesSync(join(subDir, 'agent-a3ca5dd18ea8078ce.jsonl'), old, old);
  utimesSync(join(subDir, 'agent-af40455aa5d7481a2.jsonl'), young, young);  // ONE subagent stirs

  const inv = inventory({ root: join(tmp, 'projects'), nowMs: now });
  const s = findSession(inv, FIXTURE_SESSION);
  assert.ok(s, 'the session must be in the inventory despite a quiet main file');
  assert.equal(s.age_seconds, 30,
    'the activity of the waiting subagent counts, not the quiet main file (3600 s)');
  assert.equal(s.mtime, young.toISOString());
});

test('second fixture session: worker + reviewer, meta.model travels as structure', () => {
  const inv = inventory({ root: FIXTURE_ROOT, nowMs: NOW });
  const s = findSession(inv, FIXTURE_SESSION_B);
  assert.ok(s, 'the second session must be in the inventory');
  assert.equal(s.subagent_count, 2);
  assert.deepEqual(s.subagents.map((a) => a.agent_type), ['reviewer', 'worker']);
  assert.deepEqual(s.subagents.map((a) => a.model), [null, 'sonnet']);
  assert.equal(s.has_ai_title, true);
});

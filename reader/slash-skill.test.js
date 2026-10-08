// AP-A2: a typed slash skill start (isMeta user line with <skill-format>true) counts as a skill
// start in the right turn, once, and a bare <command-name> (built-in like /model) never counts.
// Fixture: fixtures/projects-slash/ — structural only (masked text, neutral skill names).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { loadSession, blockA, buildSkills, buildTurns } from './derive.js';
import { readTranscript, eventsOfKind, slashSkill } from './parser.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects-slash');
const SID = 'd7c41e90-3b5a-4f82-a6e1-0c9b8f2a5d34';
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const loaded = () => loadSession(findSession(inventory({ root: ROOT, nowMs: NOW }), SID));

test('parser: only the skill-format meta line is a slash skill start', () => {
  const s = readTranscript(readFileSync(join(ROOT, 'c--dev-sample-app', `${SID}.jsonl`), 'utf8'));
  const slash = eventsOfKind(s, 'skill_slash');
  assert.deepEqual(slash.map((e) => e.skill), ['cleanup', 'cleanup']);   // /model line has no skill-format
  assert.equal(slashSkill({ type: 'user', isMeta: false, message: { content: '<command-name>x</command-name><skill-format>true</skill-format>' } }), null);
  assert.equal(slashSkill({ type: 'user', isMeta: true, message: { content: '<command-name>model</command-name>' } }), null);
});

test('derive: slash start lands in its own turn and never double counts a Skill tool_use', () => {
  const l = loaded();
  const sk = buildSkills(l);
  // turn 1 slash cleanup · turn 2 slash+tool cleanup = ONE · turn 3 tool review-pass
  assert.deepEqual(sk.starts.map((x) => [x.turn_number, x.skill]), [[1, 'cleanup'], [2, 'cleanup'], [3, 'review-pass']]);
  assert.equal(sk.start_count, 3);
  assert.deepEqual(sk.distinct, ['cleanup', 'review-pass']);
  const turns = buildTurns(l.main).turns;
  assert.deepEqual(turns.map((t) => t.skills.map((x) => x.skill)), [['cleanup'], ['cleanup'], ['review-pass']]);
  assert.ok(turns[0].skills[0].time, 'a slash start carries its start time');
});

test('the fixture and its derived output are leak-clean', () => {
  const v = blockA(loaded(), { nowMs: NOW });
  const e = checkLeaks({ ...v, skills: buildSkills(loaded()) });
  assert.deepEqual(e.violations, []);
});

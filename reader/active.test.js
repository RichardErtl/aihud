// A2.5 — the active marker. A session whose main transcript has gone quiet while a subagent
// keeps writing must count as ACTIVE: its activity is the merged (youngest) mtime of main file
// AND subagent files (`inventory.js`, edge 1). Measured in the wild: 2 of 100 sessions sat in
// exactly this state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, rmSync, utimesSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet, ACTIVE_SECONDS } from './derive.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SLUG = 'c--dev-sample-app';
const ID = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';

test('a subagent newer than the last main turn keeps the session active', (t) => {
  const tmp = mkdtempSync(join(tmpdir(), 'reader-a25-'));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  const target = join(tmp, 'projects', SLUG);
  cpSync(join(HERE, 'fixtures', 'projects', SLUG), target, { recursive: true });

  // The last main turn, measured from the transcript itself — not a hand-typed time.
  const probe = findSession(inventory({ root: join(tmp, 'projects') }), ID);
  const lastMainTurn = Date.parse(buildSheet(loadSession(probe)).time.end);
  const now = lastMainTurn + 60 * 60 * 1000;                  // an hour after the last main turn
  const quiet = new Date(lastMainTurn);
  const busy = new Date(now - 20_000);                        // one subagent wrote 20 s ago
  utimesSync(join(target, `${ID}.jsonl`), quiet, quiet);
  const subs = join(target, ID, 'subagents');
  const files = readdirSync(subs).filter((f) => f.endsWith('.jsonl')).sort();
  for (const f of files) utimesSync(join(subs, f), quiet, quiet);
  utimesSync(join(subs, files[0]), busy, busy);

  const s = findSession(inventory({ root: join(tmp, 'projects'), nowMs: now }), ID);
  assert.ok((now - lastMainTurn) / 1000 > ACTIVE_SECONDS, 'the main transcript alone is quiet');
  assert.equal(s.age_seconds, 20);
  assert.ok(s.age_seconds <= ACTIVE_SECONDS, 'the running subagent makes the session active');

  // Counter-proof: the same session with the subagent quiet as well is NOT active.
  utimesSync(join(subs, files[0]), quiet, quiet);
  const still = findSession(inventory({ root: join(tmp, 'projects'), nowMs: now }), ID);
  assert.ok(still.age_seconds > ACTIVE_SECONDS);
});

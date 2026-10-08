// Probes for the git state of a session (`git.js`): start HEAD from the reflog / HEAD file,
// commits from the transcript (`toolUseResult.gitOperation.commit`, measured shape
// `{sha, kind, branch}` with an abbreviated sha) and from the reflog window.
// Everything lives in a temp directory: a hand-made `.git` (files only, no git process) and a
// transcript folder whose slug is derived from the repository path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractSheet } from './contract.js';
import { readGit, slugOf, findRepo, resolveHead, sessionCwd, cwdReads } from './git.js';
import { checkLeaks } from './leak-check.js';

// Deterministic, obviously synthetic hashes (same seed as the fixture remap).
const sha = (n) => createHash('sha1').update(`aihud-fixtures-v1:${n}`).digest('hex');
const [A, B, C, D, E] = ['a', 'b', 'c', 'd', 'e'].map(sha);
const ZERO = '0'.repeat(40);
const ID = 'git-probe-session';
const at = (iso) => Math.floor(Date.parse(iso) / 1000);
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

const reflogLine = (from, to, iso, msg) => `${from} ${to} Some One <some@example.test> ${at(iso)} +0200\t${msg}`;

/** A repo with four HEAD moves and a session 10:00–10:30 that made commit B itself. */
function world(t, { cwdCase = (p) => p, worktree = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aihud-git-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const main = join(dir, 'repo');
  const git = join(main, '.git');
  mkdirSync(join(git, 'refs', 'heads'), { recursive: true });
  mkdirSync(join(git, 'logs'), { recursive: true });
  writeFileSync(join(git, 'HEAD'), 'ref: refs/heads/main\n');
  writeFileSync(join(git, 'refs', 'heads', 'main'), `${D}\n`);
  writeFileSync(join(git, 'logs', 'HEAD'), [
    reflogLine(ZERO, A, '2026-09-10T09:00:00Z', 'commit (initial): first'),
    reflogLine(A, B, '2026-09-10T10:10:00Z', 'commit: feature one'),
    reflogLine(B, C, '2026-09-10T10:20:00Z', 'commit: feature two'),
    reflogLine(C, D, '2026-09-10T11:00:00Z', 'checkout: moving from main to main'),
  ].join('\n') + '\n');
  let work = main;
  if (worktree) {
    work = join(dir, 'wt');
    const wtGit = join(git, 'worktrees', 'wt');
    mkdirSync(wtGit, { recursive: true });
    mkdirSync(work);
    writeFileSync(join(work, '.git'), `gitdir: ${wtGit}\n`);
    writeFileSync(join(wtGit, 'commondir'), '../..\n');
    writeFileSync(join(wtGit, 'HEAD'), `${E}\n`);
  }
  const cwd = cwdCase(work);
  const projects = join(dir, 'projects', slugOf(work).replace(/^./, (c) => c.toLowerCase()));
  mkdirSync(projects, { recursive: true });
  const line = (o) => JSON.stringify({ sessionId: ID, ...o });
  writeFileSync(join(projects, `${ID}.jsonl`), [
    line({ type: 'queue-operation', timestamp: '2026-09-10T10:00:00.000Z' }),
    line({ type: 'user', origin: { kind: 'human' }, uuid: 'u1', cwd, timestamp: '2026-09-10T10:00:00.000Z', message: { role: 'user', content: 'x' } }),
    line({ type: 'user', uuid: 'u2', cwd, timestamp: '2026-09-10T10:10:01.000Z', message: { role: 'user', content: [] },
      toolUseResult: { stdout: 'x', gitOperation: { commit: { sha: B.slice(0, 8), kind: 'committed', branch: 'main' } } } }),
    line({ type: 'user', origin: { kind: 'human' }, uuid: 'u3', cwd, timestamp: '2026-09-10T10:30:00.000Z', message: { role: 'user', content: 'y' } }),
  ].join('\n') + '\n');
  const loaded = loadSession(findSession(inventory({ root: join(dir, 'projects'), nowMs: NOW }), ID));
  loaded.entry.mtime_ms = Date.parse('2026-09-10T10:30:00.000Z');   // file time = last line
  return { dir, main, work, loaded };
}

test('start HEAD = the old side of the first move after the start; commits from both sources', (t) => {
  const { loaded } = world(t, { cwdCase: (p) => p.replace(/^[a-z]/, (c) => c.toUpperCase()) });
  const g = readGit(loaded, { nowMs: NOW, withText: true });
  assert.equal(g.start_head, A, 'HEAD at 10:00 was A (moved to B at 10:10)');
  assert.deepEqual(g.commits, [
    // transcript source: surely this session; the abbreviated sha widened via the reflog
    { sha: B, at: '2026-09-10T10:10:01.000Z', first_line: 'feature one', source: 'transcript' },
    // reflog source: inside the window, maybe another session in the same checkout
    { sha: C, at: '2026-09-10T10:20:00.000Z', first_line: 'feature two', source: 'reflog' },
  ]);
  assert.equal(g.dirty, null, 'not determined without a git process');
});

test('no HEAD move since the start: the current HEAD (ref, then packed-refs)', (t) => {
  const { main, loaded } = world(t);
  loaded.main.first_time = Date.parse('2026-09-10T11:30:00.000Z');
  assert.equal(readGit(loaded, { nowMs: NOW }).start_head, D);
  rmSync(join(main, '.git', 'refs', 'heads', 'main'));
  writeFileSync(join(main, '.git', 'packed-refs'), `# pack-refs with: peeled\n${C} refs/heads/main\n`);
  assert.equal(resolveHead(findRepo(main)), C);
});

test('outside the 90-day window: no start HEAD, no reflog commits, the transcript commit stays', (t) => {
  const { loaded } = world(t);
  const g = readGit(loaded, { nowMs: NOW + 91 * 86_400_000 });
  assert.equal(g.start_head, null);
  assert.deepEqual(g.commits, [{ sha: B.slice(0, 8), at: '2026-09-10T10:10:01.000Z', source: 'transcript' }]);
});

test('worktree: HEAD followed through the gitdir file, commits from the transcript only', (t) => {
  const { work, loaded } = world(t, { worktree: true });
  assert.equal(findRepo(work).worktree, true);
  assert.equal(resolveHead(findRepo(work)), E);
  const g = readGit(loaded, { nowMs: NOW });
  assert.equal(g.start_head, null, 'the worktree has no reflog of its own here - not guessed');
  assert.deepEqual(g.commits.map((c) => c.source), ['transcript']);
});

test('the slug is the key: a cwd of another folder is not followed', (t) => {
  const { loaded } = world(t);
  loaded.entry.project_slug = 'c--some-other-folder';
  const g = readGit(loaded, { nowMs: NOW });
  assert.equal(g.start_head, null);
  assert.deepEqual(g.commits.map((c) => c.source), ['transcript'], 'no repo: the transcript commit alone');
});

test('git in the contract: hashes always, commit text only with withText', (t) => {
  const { loaded } = world(t);
  const sheet = buildSheet(loaded, { nowMs: NOW });
  const plain = contractSheet(sheet, { extras: { git: readGit(loaded, { nowMs: NOW }) } }).session.git;
  assert.deepEqual(plain, {
    start_head: A,
    commits: [
      { sha: B, at: '2026-09-10T10:10:01.000Z', source: 'transcript' },
      { sha: C, at: '2026-09-10T10:20:00.000Z', source: 'reflog' },
    ],
    dirty: null,
  });
  assert.deepEqual(checkLeaks({ git: plain }).violations, []);
  const text = contractSheet(sheet, { extras: { git: readGit(loaded, { nowMs: NOW, withText: true }) }, withText: true });
  assert.equal(text.session.git.commits[0].first_line, 'feature one');
});

test('sessionCwd is cached: the second call for the same file reads 0 bytes', (t) => {
  const { work, loaded } = world(t);
  const { main_file: file, project_slug: slug } = loaded.entry;
  const before = cwdReads.bytes;
  assert.equal(sessionCwd(file, slug), work);
  const first = cwdReads.bytes - before;
  assert.ok(first > 0, `the first call really read the head (${first} bytes)`);
  assert.equal(sessionCwd(file, slug), work);
  assert.equal(cwdReads.bytes - before, first, 'the second call read 0 bytes');
});

// Probes for the session extras: the sidecar `<aihud home>/sessions/<id>.json` and the title
// precedence (sidecar over `ai-title`). Every probe uses a temp aihud home — never the real one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession, titleText } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractSheet } from './contract.js';
import { readSidecar, readExtras, aihudHome } from './extras.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const HOST = { device: 'laptop', state: 'awake' };

function home(t, sidecars = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'aihud-home-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(join(dir, 'sessions'));
  for (const [id, body] of Object.entries(sidecars)) {
    writeFileSync(join(dir, 'sessions', `${id}.json`), typeof body === 'string' ? body : JSON.stringify(body));
  }
  return dir;
}

const GIT = { start_head: 'a'.repeat(40), dirty: null,
  commits: [{ sha: 'b'.repeat(40), at: '2026-09-10T11:00:00.000Z', first_line: 'fix the thing', source: 'reflog' }] };

function contractOf(id, { aihud, withText, git = null }) {
  const loaded = loadSession(findSession(inventory({ root: ROOT, nowMs: NOW }), id));
  const extras = readExtras(loaded, { aihudHome: aihud, env: {}, nowMs: NOW, withText });
  if (git) extras.git = git;
  return contractSheet(buildSheet(loaded, { nowMs: NOW }), { ...HOST, extras, withText });
}

test('sidecar: the title overrides the ai-title, note/closed/closed_at travel', (t) => {
  const aihud = home(t, {
    [A]: { title: 'Sidecar title', note: 'a note', closed: true, closed_at: '2026-09-10T11:59:00Z', later: 1 },
  });
  const s = contractOf(A, { aihud, withText: true }).session;
  assert.equal(s.title, 'Sidecar title', 'the sidecar wins over the ai-title of the transcript');
  assert.equal(s.note, 'a note');
  assert.equal(s.closed, true);
  assert.equal(s.closed_at, '2026-09-10T11:59:00Z');
  assert.equal('later' in s, false, 'an unknown sidecar field does not enter the contract');
});

test('without a sidecar the ai-title is the title; a missing file is no error', (t) => {
  const aihud = home(t);
  const s = contractOf(A, { aihud, withText: true }).session;
  // The fixture ai-title is masked — the marker IS the proof the real text path ran.
  assert.equal(s.title, '<<TEXT>>');
  for (const f of ['note', 'closed', 'closed_at']) assert.equal(f in s, false, `${f} missing without a sidecar`);
});

test('without withText no plain text travels, the structure fields do (leak rule stays default)', (t) => {
  const aihud = home(t, { [A]: { title: 'Sidecar title', note: 'a note', closed: false } });
  const v = contractOf(A, { aihud, withText: false });
  assert.equal('title' in v.session, false);
  assert.equal('note' in v.session, false);
  assert.equal(v.session.closed, false, 'a measured false stays false');
  assert.deepEqual(checkLeaks(v).violations, []);
});

test('with withText the leak check names exactly the text fields (the opt-in is loud)', (t) => {
  const aihud = home(t, { [A]: { title: 'Sidecar title', note: 'a note' } });
  const v = contractOf(A, { aihud, withText: true, git: GIT });
  assert.equal(v.session.git.commits[0].first_line, 'fix the thing');
  const keys = [...new Set(checkLeaks(v).violations.filter((x) => x.reason === 'forbidden_key').map((x) => x.path))].sort();
  assert.deepEqual(keys, ['.session.git.commits[0].first_line', '.session.note', '.session.title']);
});

test('checkLeaks withText: exactly title/note/first_line are exempt, every other key stays checked', (t) => {
  const aihud = home(t, { [A]: { title: 'Sidecar title', note: 'a note' } });
  const v = contractOf(A, { aihud, withText: true, git: GIT });
  assert.deepEqual(checkLeaks(v, { withText: true }).violations, [], 'the three text fields pass in text mode');
  // Transcript text planted in `title` is user/AI text by design: passes in text mode.
  v.session.title = '<<TEXT>> planted transcript words';
  assert.deepEqual(checkLeaks(v, { withText: true }).violations, []);
  // The same text in ANY other key still trips, text mode or not.
  let planted = 0;
  for (const [where, put] of [
    ['model', (x) => { x.session.model = '<<TEXT>> planted'; }],
    ['sha', (x) => { x.session.git.commits[0].sha = '<<TEXT>>'; }],
    ['description', (x) => { x.session.description = 'planted words'; }],
    ['title-object', (x) => { x.session.title = { text: 'planted words' }; }],
  ]) {
    const w = structuredClone(v);
    put(w);
    planted++;
    assert.ok(checkLeaks(w, { withText: true }).violations.length >= 1, `${where} must trip in text mode`);
  }
  assert.equal(planted, 4);
  // Default mode is unchanged: the three text fields trip.
  assert.ok(checkLeaks(v).violations.length >= 3);
});

test('readSidecar drops wrong types and broken files, refuses path ids', (t) => {
  const aihud = home(t, {
    good: { title: 7, note: '', closed: 'yes', closed_at: 'yesterday' },
    broken: '{ not json',
    list: '[1,2]',
  });
  assert.deepEqual(readSidecar('good', { aihudHome: aihud, withText: true }), {});
  assert.equal(readSidecar('broken', { aihudHome: aihud }), null);
  assert.equal(readSidecar('list', { aihudHome: aihud }), null);
  assert.equal(readSidecar('absent', { aihudHome: aihud }), null);
  assert.equal(readSidecar('../good', { aihudHome: aihud }), null, 'no path out of sessions/');
  assert.equal(readSidecar('a/b', { aihudHome: aihud }), null);
});

test('aihud home: option, then AIHUD_HOME, then <home>/.aihud', () => {
  assert.equal(aihudHome({ aihudHome: 'X', env: { AIHUD_HOME: 'Y', HOME: 'Z' } }), 'X');
  assert.equal(aihudHome({ env: { AIHUD_HOME: 'Y', HOME: 'Z' } }), 'Y');
  assert.equal(aihudHome({ env: { HOME: 'Z' } }).replace(/\\/g, '/'), 'Z/.aihud');
  assert.equal(aihudHome({ env: {} }), null);
});

test('titleText reads the youngest ai-title text, never throws', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'aihud-title-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const f = join(dir, 's.jsonl');
  writeFileSync(f, [
    JSON.stringify({ type: 'ai-title', aiTitle: 'first "one"' }),
    JSON.stringify({ type: 'ai-title', aiTitle: 'second one' }),
  ].join('\n'));
  assert.equal(titleText(f), 'second one');
  assert.equal(titleText(join(dir, 'missing.jsonl')), null);
});

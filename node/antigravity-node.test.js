// AX.2b - the node wires the Antigravity reader: list, sheet, flush by main_file, a third watcher.
// Everything lives in a temp sandbox: a Claude projects folder + a `.gemini/antigravity-cli` folder
// (the reader fixture), never the real ~/.gemini. Test ports come from the OS (port 0, read, release).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as netServer } from 'node:net';
import { createNode, antigravityDir } from './server.js';

const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'reader', 'fixtures');
const ID = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000b2';
const ID2 = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000c3';
const CODEX_ID = 'c0dec0de-5a17-4c0d-9e5e-1000000000a1';
const LOGS = join('.system_generated', 'logs');
const TRANSCRIPT = join('brain', ID, LOGS, 'transcript.jsonl');
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** base/.claude/projects (Claude fixtures) + base/.aihud; `.gemini/antigravity-cli` copied only when asked. */
function sandbox({ ag = true, codex = false } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'aihud-ag-node-'));
  const projects = join(base, '.claude', 'projects');
  cpSync(join(FIX, 'projects'), projects, { recursive: true });
  mkdirSync(join(base, '.aihud'));
  const agDir = join(base, '.gemini', 'antigravity-cli');
  if (ag) cpSync(join(FIX, 'antigravity'), agDir, { recursive: true });
  if (codex) cpSync(join(FIX, 'codex'), join(base, '.codex'), { recursive: true });
  return { base, projects, home: join(base, '.aihud'), agDir, done: () => rmSync(base, { recursive: true, force: true }) };
}
const growTranscript = (file) => {
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
  appendFileSync(file, lines[lines.length - 1] + '\n');
};
async function get(port, path) {
  const r = await fetch(`http://127.0.0.1:${port}${path}`);
  return { status: r.status, json: await r.json() };
}
function events(port) {
  const seen = [];
  const ac = new AbortController();
  fetch(`http://127.0.0.1:${port}/events`, { signal: ac.signal }).then(async (res) => {
    const dec = new TextDecoder();
    let buf = '';
    for await (const c of res.body) {
      buf += dec.decode(c);
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const f = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = f.match(/^event: (.+)$/m); const d = f.match(/^data: (.+)$/m);
        if (ev && d) seen.push({ event: ev[1], data: JSON.parse(d[1]) });
      }
    }
  }).catch(() => {});
  return { seen, close: () => ac.abort() };
}
async function until(pred, ms = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (pred()) return true; await pause(25); }
  return false;
}

test('antigravityDir: option > AIHUD_ANTIGRAVITY > sibling of a default-shaped root > none', () => {
  const was = process.env.AIHUD_ANTIGRAVITY;
  try {
    delete process.env.AIHUD_ANTIGRAVITY;
    assert.equal(antigravityDir('/x/ag', join('/h', '.claude', 'projects')), '/x/ag');
    assert.equal(antigravityDir(undefined, join('/h', '.claude', 'projects')), join('/h', '.gemini', 'antigravity-cli'));
    assert.equal(antigravityDir(undefined, '/some/custom/root'), null, 'a custom projects root reads no Antigravity');
    process.env.AIHUD_ANTIGRAVITY = '/env/ag';
    assert.equal(antigravityDir(undefined, '/some/custom/root'), '/env/ag');
    assert.equal(antigravityDir('/opt/ag', '/some/custom/root'), '/opt/ag', 'the option beats the env');
  } finally { if (was === undefined) delete process.env.AIHUD_ANTIGRAVITY; else process.env.AIHUD_ANTIGRAVITY = was; }
});

test('an Antigravity home next to the projects: the list names the session, the sheet is served without token fields', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  try {
    const list = await get(node.port, '/sessions');
    const e = list.json.sessions.find((x) => x.session_id === ID);
    assert.ok(e, 'the antigravity session is listed');
    assert.equal(e.provider, 'antigravity');
    assert.equal(e.project_slug, 'antigravity');
    assert.equal(e.main_file, undefined, 'no transcript path in the list');
    const claude = list.json.sessions.filter((x) => x.session_id !== ID);
    assert.ok(claude.length >= 2);
    for (const c of claude) assert.equal('provider' in c, false, 'Claude list entries stay without provider');
    const sheet = await get(node.port, `/sessions/${ID}`);
    assert.equal(sheet.status, 200);
    assert.equal(sheet.json.session.provider, 'antigravity');
    assert.equal(sheet.json.session.id, ID);
    assert.equal(sheet.json.turn.turns.length, 1);
    assert.equal(sheet.json.turn.turns[0].tool_calls.length, 13);
    assert.deepEqual(sheet.json.not_delivered.filter((x) => !x.endsWith('_not_in_transcript')), [
      'live:tokens_not_recorded_by_antigravity',
      'turn:tokens_not_recorded_by_antigravity',
      'context:points_not_recorded_by_antigravity',
      'session:model_not_recorded_by_antigravity',
      'agents:subagents_not_recorded_by_antigravity',
      'turn:skills_not_recorded_by_antigravity',
    ]);
    const inst = sheet.json.live.instances[0];
    for (const k of ['tokens_main', 'tokens_total', 'tokens_by_model', 'tokens_by_kind', 'model', 'context_window', 'context_percent']) assert.equal(k in inst, false, `live.${k} absent`);
    for (const k of ['tokens_in', 'tokens_out', 'model']) assert.equal(k in sheet.json.turn.turns[0], false, `turn.${k} absent`);
    assert.equal('windows' in sheet.json, false);
  } finally { await node.close(); s.done(); }
});

test('no Antigravity directory: the node behaves as before (no entry, no provider key, no error)', async () => {
  const s = sandbox({ ag: false });
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  try {
    const list = await get(node.port, '/sessions');
    assert.equal(list.json.sessions.some((x) => x.project_slug === 'antigravity' || 'provider' in x), false);
    assert.equal((await get(node.port, `/sessions/${ID}`)).status, 404);
    assert.equal(node.stats().watchError, null);
    assert.equal(node.stats().freshness, 'watch');
  } finally { await node.close(); s.done(); }
});

test('a custom projects root reads no Antigravity, even with a .gemini folder beside the home', async () => {
  const s = sandbox();
  const custom = join(s.base, 'custom-root');
  cpSync(join(FIX, 'projects'), custom, { recursive: true });
  const was = process.env.AIHUD_ANTIGRAVITY;
  delete process.env.AIHUD_ANTIGRAVITY;
  const node = await createNode({ port: await freePort(), projects: custom, home: s.home });
  try {
    assert.equal((await get(node.port, '/sessions')).json.sessions.some((x) => x.session_id === ID), false);
  } finally {
    await node.close(); s.done();
    if (was !== undefined) process.env.AIHUD_ANTIGRAVITY = was;
  }
});

test('the explicit `antigravity` option reads a folder beside a custom projects root', async () => {
  const s = sandbox();
  const custom = join(s.base, 'custom-root');
  cpSync(join(FIX, 'projects'), custom, { recursive: true });
  const node = await createNode({ port: await freePort(), projects: custom, home: s.home, antigravity: s.agDir });
  try {
    const e = (await get(node.port, '/sessions')).json.sessions.find((x) => x.session_id === ID);
    assert.equal(e && e.provider, 'antigravity');
  } finally { await node.close(); s.done(); }
});

test('Antigravity and Codex side by side: both listed with their provider, Claude entries untouched', async () => {
  const s = sandbox({ codex: true });
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  try {
    const list = (await get(node.port, '/sessions')).json.sessions;
    assert.equal(list.find((x) => x.session_id === ID).provider, 'antigravity');
    assert.equal(list.find((x) => x.session_id === CODEX_ID).provider, 'codex');
    assert.equal(list.filter((x) => 'provider' in x).length, 2);
    assert.equal((await get(node.port, `/sessions/${CODEX_ID}`)).status, 200);
  } finally { await node.close(); s.done(); }
});

test('watch: a growing transcript.jsonl emits session-updated (flush stats main_file, no full scan)', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    assert.equal(node.stats().freshness, 'watch');
    await pause(300);
    const scans = node.stats().scans;
    growTranscript(join(s.agDir, TRANSCRIPT));
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'session-updated' && x.data.id === ID)), 'no session-updated for the transcript');
    assert.equal(node.stats().scans, scans, 'targeted: no full rescan for a known antigravity session');
  } finally { ev.close(); await node.close(); s.done(); }
});

test('watch: a growing transcript_full.jsonl and a chunks/ file trigger no event and no scan', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    await pause(300);
    const before = node.stats();
    const logs = join(s.agDir, 'brain', ID, LOGS);
    writeFileSync(join(logs, 'transcript_full.jsonl'), '{"x":1}\n');
    appendFileSync(join(logs, 'transcript_full.jsonl'), '{"x":2}\n');
    mkdirSync(join(logs, 'chunks'));
    writeFileSync(join(logs, 'chunks', 'c1.jsonl'), '{"y":1}\n');
    await pause(600);
    const after = node.stats();
    assert.ok(after.watchEvents > before.watchEvents, 'the watcher did see the writes (the test is not vacuous)');
    assert.equal(after.scans, before.scans, 'no rescan');
    assert.equal(ev.seen.some((x) => x.event === 'session-updated' || x.event === 'sessions-changed'), false, 'no event');
    const e = (await get(node.port, '/sessions')).json.sessions.find((x) => x.session_id === ID);
    assert.equal(e.bytes, readFileSync(join(logs, 'transcript.jsonl')).length, 'the session size is the transcript.jsonl size alone');
  } finally { ev.close(); await node.close(); s.done(); }
});

test('watch: a new brain folder with a transcript -> sessions-changed and listed', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    await pause(300);
    const dir = join(s.agDir, 'brain', ID2, LOGS);
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(s.agDir, TRANSCRIPT), join(dir, 'transcript.jsonl'));
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'sessions-changed')), 'no sessions-changed');
    const list = await get(node.port, '/sessions');
    assert.ok(list.json.sessions.some((x) => x.session_id === ID2 && x.provider === 'antigravity'));
  } finally { ev.close(); await node.close(); s.done(); }
});

test('an Antigravity folder that appears after the start: found by a poll scan; found by a watch-triggered scan, then its transcript is watched', async () => {
  // (a) forced poll 150 ms: the periodic rescan finds it (no watcher is armed in poll mode)
  const p = sandbox({ ag: false });
  const polled = await createNode({ port: await freePort(), projects: p.projects, home: p.home, pollMs: 150 });
  try {
    assert.equal((await get(polled.port, '/sessions')).json.sessions.some((x) => x.session_id === ID), false);
    cpSync(join(FIX, 'antigravity'), p.agDir, { recursive: true });
    assert.ok(await until(() => polled.stats().sessions >= 3), 'the periodic rescan never found the antigravity session');
    assert.equal((await get(polled.port, `/sessions/${ID}`)).status, 200);
  } finally { await polled.close(); p.done(); }
  // (b) watch mode: a scan triggered by a projects-tree event finds the folder and arms the watcher; then growth is targeted
  const s = sandbox({ ag: false });
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    assert.equal(node.stats().freshness, 'watch');
    await pause(300);
    cpSync(join(FIX, 'antigravity'), s.agDir, { recursive: true });
    writeFileSync(join(s.projects, 'nudge.txt'), 'x');   // an unknown name in the Claude watch = full scan
    assert.ok(await until(() => node.stats().sessions >= 3), 'the scan did not pick up the antigravity folder');
    await pause(300);
    const scans = node.stats().scans;
    growTranscript(join(s.agDir, TRANSCRIPT));
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'session-updated' && x.data.id === ID)), 'the late antigravity watcher did not fire');
    assert.equal(node.stats().scans, scans, 'targeted flush, no full rescan');
  } finally { ev.close(); await node.close(); s.done(); }
});

test('contract cache: an unchanged antigravity session is a real cache hit; growth rebuilds', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home, pollMs: 100 });
  try {
    const a = await get(node.port, `/sessions/${ID}`);
    const a2 = await get(node.port, `/sessions/${ID}`);
    assert.deepEqual(a2.json, a.json);
    assert.equal(a2.json.live.as_of, a.json.live.as_of, 'same as_of = the cached body, not a rebuild');
    growTranscript(join(s.agDir, TRANSCRIPT));
    await pause(300);
    const b = await get(node.port, `/sessions/${ID}`);
    assert.notDeepEqual(a.json, b.json, 'the cached sheet did not follow the growing transcript');
    const b2 = await get(node.port, `/sessions/${ID}`);
    assert.equal(b2.json.live.as_of, b.json.live.as_of, 'cache hit after the rebuild');
  } finally { await node.close(); s.done(); }
});

test('watch: a file written directly into a known <id>/ folder raises no scan; removing the transcript does and drops the session', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    await pause(300);
    const before = node.stats();
    writeFileSync(join(s.agDir, 'brain', ID, 'stray.txt'), 'x');
    await pause(600);
    const mid = node.stats();
    assert.ok(mid.watchEvents > before.watchEvents, 'the watcher did see the write (not vacuous)');
    assert.equal(mid.scans, before.scans, 'no scan for a stray file beside a living transcript');
    assert.equal(ev.seen.some((x) => x.event === 'sessions-changed'), false);
    rmSync(join(s.agDir, TRANSCRIPT));
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'sessions-changed')), 'no sessions-changed after the transcript vanished');
    assert.ok(node.stats().scans > mid.scans, 'a scan ran');
    assert.equal((await get(node.port, `/sessions/${ID}`)).status, 404);
  } finally { ev.close(); await node.close(); s.done(); }
});

test('live node path: settings windows.antigravity.default gives the estimated percent in GET /sessions/<id>; without it the shipped default', async () => {
  const s = sandbox({ ag: false });
  const TID = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000b3';
  cpSync(join(FIX, 'antigravity-tokens'), s.agDir, { recursive: true });
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const inst = async () => (await get(node.port, `/sessions/${TID}`)).json;
  try {
    let c = await inst();
    assert.equal(c.live.instances[0].tokens_total > 0, true);
    assert.equal(c.live.instances[0].context_window, 1048576);
    assert.equal(c.live.instances[0].context_percent, 1.6);
    assert.ok(c.not_delivered.includes('live:window_assumed_by_default'));
    writeFileSync(join(s.home, 'settings.json'), JSON.stringify({ windows: { antigravity: { default: 200000 } } }));
    c = await inst();   // no transcript growth: the changed setting alone refreshes the cache
    assert.equal(c.live.instances[0].context_window, 200000);
    assert.equal(c.live.instances[0].context_percent, 8.6);
    assert.ok(c.not_delivered.includes('live:window_assumed_by_settings'));
  } finally { await node.close(); s.done(); }
});

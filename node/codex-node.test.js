// AX.1b - the node wires the Codex reader: list, sheet, flush by main_file, a second watcher.
// Everything lives in a temp sandbox: a Claude projects folder + a `.codex` folder (the reader
// fixture), never the real ~/.codex. Test ports come from the OS (port 0, read, release).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as netServer } from 'node:net';
import { createNode } from './server.js';

const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const HERE = dirname(fileURLToPath(import.meta.url));
const FIX = join(HERE, '..', 'reader', 'fixtures');
const ID = 'c0dec0de-5a17-4c0d-9e5e-1000000000a1';
const ID2 = 'c0dec0de-5a17-4c0d-9e5e-1000000000b2';
const REL = join('sessions', '2026', '10', '01', `rollout-2026-10-01T22-46-14-${ID}.jsonl`);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** base/.claude/projects (Claude fixtures) + base/.aihud; `.codex` copied only when asked. */
function sandbox({ codex = true } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'aihud-codex-node-'));
  const projects = join(base, '.claude', 'projects');
  cpSync(join(FIX, 'projects'), projects, { recursive: true });
  mkdirSync(join(base, '.aihud'));
  if (codex) cpSync(join(FIX, 'codex'), join(base, '.codex'), { recursive: true });
  return { base, projects, home: join(base, '.aihud'), codexDir: join(base, '.codex'), done: () => rmSync(base, { recursive: true, force: true }) };
}
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
        const ev = /^event: (.+)$/m.exec(f); const d = /^data: (.+)$/m.exec(f);
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

test('a Codex home next to the projects: the list names the session, the sheet is served', async () => {
  const s = sandbox();
  const old = new Date(Date.now() - 3_600_000);
  utimesSync(join(s.codexDir, REL), old, old);
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  try {
    const list = await get(node.port, '/sessions');
    const e = list.json.sessions.find((x) => x.session_id === ID);
    assert.ok(e, 'the codex session is listed');
    assert.equal(e.provider, 'codex');
    assert.equal(e.project_slug, 'codex');
    assert.equal(e.main_file, undefined, 'no transcript path in the list');
    const claude = list.json.sessions.filter((x) => x.session_id !== ID);
    assert.ok(claude.length >= 2);
    for (const c of claude) assert.equal('provider' in c, false, 'Claude list entries stay unchanged');
    const sheet = await get(node.port, `/sessions/${ID}`);
    assert.equal(sheet.status, 200);
    assert.equal(sheet.json.session.provider, 'codex');
    assert.equal(sheet.json.session.title, 'Sample codex session', 'the title comes from session_index.jsonl');
    assert.equal(sheet.json.session.session_id ?? ID, ID);
    assert.equal(JSON.stringify(sheet.json).includes('gpt-6.1-sol'), true);
  } finally { await node.close(); s.done(); }
});

test('no Codex directory: the node behaves as before (no codex entry, no error)', async () => {
  const s = sandbox({ codex: false });
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  try {
    const list = await get(node.port, '/sessions');
    assert.equal(list.json.sessions.some((x) => x.project_slug === 'codex' || 'provider' in x), false);
    assert.equal((await get(node.port, `/sessions/${ID}`)).status, 404);
    assert.equal(node.stats().watchError, null);
  } finally { await node.close(); s.done(); }
});

test('watch: a growing codex rollout emits session-updated (flush stats main_file, no full scan)', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    assert.equal(node.stats().freshness, 'watch');
    await pause(300);
    const scans = node.stats().scans;
    const file = join(s.codexDir, REL);
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
    appendFileSync(file, lines[lines.length - 1] + '\n');
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'session-updated' && x.data.id === ID)), 'no session-updated for the codex file');
    assert.equal(node.stats().scans, scans, 'targeted: no full rescan for a known codex session');
  } finally { ev.close(); await node.close(); s.done(); }
});

test('watch: a new rollout file appears -> sessions-changed and listed', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    await pause(300);
    const dir = join(s.codexDir, 'sessions', '2026', '10', '05');
    mkdirSync(dir, { recursive: true });
    copyFileSync(join(s.codexDir, REL), join(dir, `rollout-2026-10-05T10-00-00-${ID2}.jsonl`));
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'sessions-changed')), 'no sessions-changed');
    const list = await get(node.port, '/sessions');
    assert.ok(list.json.sessions.some((x) => x.session_id === ID2 && x.provider === 'codex'));
  } finally { ev.close(); await node.close(); s.done(); }
});

test('a Codex directory that appears after the start: found by a scan (poll), then watched (no forced poll)', async () => {
  // (a) found by the periodic rescan (forced poll 150 ms; the watcher is not armed in poll mode)
  const p = sandbox({ codex: false });
  const polled = await createNode({ port: await freePort(), projects: p.projects, home: p.home, pollMs: 150 });
  try {
    assert.equal((await get(polled.port, '/sessions')).json.sessions.some((x) => x.session_id === ID), false);
    cpSync(join(FIX, 'codex'), p.codexDir, { recursive: true });
    assert.ok(await until(() => polled.stats().sessions >= 3), 'the periodic rescan never found the codex session');
    assert.equal((await get(polled.port, `/sessions/${ID}`)).status, 200);
  } finally { await polled.close(); p.done(); }
  // (b) watch mode: a scan triggered by a projects-tree event arms the codex watcher; then a growing rollout is targeted
  const s = sandbox({ codex: false });
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home });
  const ev = events(node.port);
  try {
    assert.equal(node.stats().freshness, 'watch');
    await pause(300);
    cpSync(join(FIX, 'codex'), s.codexDir, { recursive: true });
    writeFileSync(join(s.projects, 'nudge.txt'), 'x');   // an unknown name in the Claude watch = full scan
    assert.ok(await until(() => node.stats().sessions >= 3), 'the scan did not pick up the codex folder');
    await pause(300);
    const scans = node.stats().scans;
    const file = join(s.codexDir, REL);
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
    appendFileSync(file, lines[lines.length - 1] + '\n');
    assert.ok(await until(() => ev.seen.some((x) => x.event === 'session-updated' && x.data.id === ID)), 'the late codex watcher did not fire');
    assert.equal(node.stats().scans, scans, 'targeted flush, no full rescan');
  } finally { ev.close(); await node.close(); s.done(); }
});

test('contract cache: an unchanged session is a real cache hit; growth or a new title rebuilds', async () => {
  const s = sandbox();
  const node = await createNode({ port: await freePort(), projects: s.projects, home: s.home, pollMs: 100 });
  try {
    const a = await get(node.port, `/sessions/${ID}`);
    const a2 = await get(node.port, `/sessions/${ID}`);
    assert.deepEqual(a2.json, a.json);
    assert.equal(a2.json.live.as_of, a.json.live.as_of, 'same as_of = the cached body, not a rebuild');
    const file = join(s.codexDir, REL);
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n');
    appendFileSync(file, lines[lines.length - 1] + '\n');
    await pause(300);
    const b = await get(node.port, `/sessions/${ID}`);
    assert.notDeepEqual(a.json, b.json, 'the cached sheet did not follow the growing file');
    const b2 = await get(node.port, `/sessions/${ID}`);
    assert.equal(b2.json.live.as_of, b.json.live.as_of, 'cache hit after the rebuild');
    writeFileSync(join(s.codexDir, 'session_index.jsonl'), JSON.stringify({ id: ID, thread_name: 'Renamed', updated_at: '2026-10-05T10:00:00Z' }) + '\n');
    const c = await get(node.port, `/sessions/${ID}`);
    assert.equal(c.json.session.title, 'Renamed', 'a new title in the index must reach the sheet');
  } finally { await node.close(); s.done(); }
});

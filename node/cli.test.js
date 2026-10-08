// The commands: `close` against a node on test port 4394, `close` with no node on 4395, and a real
// `aihud serve` child process on 4396 (own PID, stopped in `finally`). Temp folders only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as netServer } from 'node:net';
import { createNode } from './server.js';
import { main } from './cli.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const BIN = join(HERE, '..', 'bin', 'aihud.js');
const SLUG = 'c--dev-sample-app';

// FG-A4: the OS hands out the test ports (port 0, read, release) - no fixed 43xx port, parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const P_CLOSE = await freePort();     // node for `close`; later the "refused serve" port
const P_DEAD = await freePort();      // nothing listens
const P_SERVE = await freePort();     // child process `aihud serve`
const P_BARE = await freePort();      // bare `aihud` / `serve` in-process
const P_FAKE = await freePort();      // fake-fetch probe
const P_REAL = await freePort();      // real running node
const P_FOREIGN = await freePort();   // foreign (non-aihud) server

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-cli-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const ids = readdirSync(join(projects, SLUG)).filter((f) => f.endsWith('.jsonl')).map((f) => f.replace(/\.jsonl$/, ''));
  return { base, projects, home, ids, done: () => rmSync(base, { recursive: true, force: true }) };
}

function capture() {
  const out = [];
  const err = [];
  return { out, err, io: { log: (s) => out.push(String(s)), err: (s) => err.push(String(s)) } };
}

test('close posts closed + closed_at (+ title/note) and prints the sidecar', async (t) => {
  const s = sandbox();
  const node = await createNode({ port: P_CLOSE, projects: s.projects, home: s.home });
  try {
    const id = s.ids[0];
    const c = capture();
    const code = await main(['close', id, '--title', 'Night build', '--note', 'done for today', '--port', String(P_CLOSE)], c.io);
    assert.equal(code, 0, c.err.join('\n'));
    const result = JSON.parse(c.out.join('\n'));
    t.diagnostic(`close result: ${JSON.stringify(result)}`);
    assert.equal(result.session_id, id);
    assert.equal(result.closed, true);
    assert.equal(result.title, 'Night build');
    assert.equal(result.note, 'done for today');
    assert.ok(Math.abs(Date.parse(result.closed_at) - Date.now()) < 60_000, 'closed_at is not now');
    const file = join(s.home, 'sessions', `${id}.json`);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { closed: true, closed_at: result.closed_at, title: 'Night build', note: 'done for today' });

    const unknown = capture();
    assert.equal(await main(['close', 'no-such-session', '--port', String(P_CLOSE)], unknown.io), 1);
    assert.match(unknown.out.join(''), /unknown_session/);
    assert.equal(existsSync(join(s.home, 'sessions', 'no-such-session.json')), false);
  } finally { await node.close(); s.done(); }
});

test('close without a running node says so and fails', async () => {
  const c = capture();
  assert.equal(await main(['close', 'abc', '--port', String(P_DEAD)], c.io), 1);
  assert.match(c.out.join(''), new RegExp(`no aihud node answers on localhost:${P_DEAD}`));
  assert.equal(await main(['close'], c.io), 2);
});

test('serve refuses an aihud home inside a .claude folder: clear error, exit 1, nothing listens', async () => {
  const s = sandbox();
  try {
    const c = capture();
    const home = join(s.base, '.claude', 'aihud');
    assert.equal(await main(['serve', '--port', String(P_CLOSE), '--projects', s.projects, '--home', home], c.io), 1);
    assert.match(c.err.join('\n'), /aihud serve: refused - the aihud home must not lie inside Claude Code's folders \(aihud_home_inside_a_claude_folder\)/);
    assert.equal(existsSync(home), false, 'the refused home was created');
    await assert.rejects(fetch(`http://127.0.0.1:${P_CLOSE}/`), 'a node is listening although serve was refused');
  } finally { s.done(); }
});

test('help: `help`, `--help` and unknown commands print the usage, never start anything', async () => {
  const opened = [];
  const open = async (url) => { opened.push(url); };
  const bare = capture();
  assert.equal(await main(['help'], { ...bare.io, version: '9.9.9', open }), 0);
  assert.match(bare.out.join('\n'), /aihud 9\.9\.9[\s\S]*aihud \[--tab\][\s\S]*aihud serve[\s\S]*aihud close/);
  assert.equal(await main(['--help'], { ...capture().io, open }), 0);
  assert.deepEqual(opened, [], 'help opened a window');
  const bogus = capture();
  assert.equal(await main(['frobnicate'], bogus.io), 2);
  assert.equal(await main(['serve', '--bogus'], capture().io), 2);
});

test('`aihud serve` as a real process: listens on the given port, serves JSON, opens nothing', async () => {
  const s = sandbox();
  const child = spawn(process.execPath, [BIN, 'serve', '--port', String(P_SERVE), '--projects', s.projects, '--home', s.home], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const banner = await new Promise((ok, fail) => {
      let out = '';
      const timer = setTimeout(() => fail(new Error(`no banner within 10 s: ${out}`)), 10_000);
      child.stdout.on('data', (d) => { out += d; if (out.includes('aihud home:')) { clearTimeout(timer); ok(out); } });
      child.stderr.on('data', (d) => { out += d; });
      child.on('exit', (code) => { clearTimeout(timer); fail(new Error(`serve exited early (${code}): ${out}`)); });
    });
    assert.match(banner, new RegExp(`aihud node on http://localhost:${P_SERVE}`));
    const list = await (await fetch(`http://127.0.0.1:${P_SERVE}/sessions`)).json();
    assert.equal(list.sessions.length, s.ids.length);
    assert.equal(child.spawnfile, process.execPath, 'the child is our own node process');
    // opens nothing: no source of the node can start a process (a browser would need one) -
    // except launch.js, the window launcher of the bare `aihud`, which `serve` never calls
    // (proven by '`aihud serve` never calls the launcher' below)
    const sources = readdirSync(HERE).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'launch.js');
    assert.ok(sources.length >= 3, 'scanned no node sources');
    assert.ok(existsSync(join(HERE, 'launch.js')), 'the launcher moved - adjust this scan');
    // cli.js reaches the launcher only through the injectable `open` (import + default = 2 hits);
    // a third hit would be a direct call the behavioural test cannot see
    assert.equal(readFileSync(join(HERE, 'cli.js'), 'utf8').match(/\bopenWindow\b/g)?.length, 2, 'cli.js names openWindow outside the import and the `open` default');
    for (const f of sources) {
      assert.ok(!/child_process|\bspawn(Sync)?\(|\bexecFile\b|\bexecSync\b|\bexec\(|\bfork\(|worker_threads/.test(readFileSync(join(HERE, f), 'utf8')), `${f} can start a process`);
    }
  } finally {
    child.kill();
    await new Promise((ok) => (child.exitCode != null || child.signalCode != null ? ok() : child.once('exit', ok)));
    s.done();
  }
});

// ── the bare `aihud`: node + window (the launcher is faked here, see launch.test.js) ──

function fakeOpen() {
  const calls = [];
  return { calls, open: async (url, opts) => { calls.push({ url, opts }); return { mode: 'app' }; } };
}

test('bare `aihud` starts the node AND opens the window on /hud', async () => {
  const s = sandbox();
  const o = fakeOpen();
  let node;
  try {
    const c = capture();
    const code = await main(['--port', String(P_BARE), '--projects', s.projects, '--home', s.home], { ...c.io, open: o.open, onServe: (n) => { node = n; } });
    assert.equal(code, 0, c.err.join('\n'));
    assert.ok(node, 'no node was started');
    const list = await (await fetch(`http://127.0.0.1:${P_BARE}/sessions`)).json();
    assert.equal(list.sessions.length, s.ids.length);
    assert.ok(o.calls.length >= 1, 'the launcher was never called');
    assert.equal(o.calls.length, 1);
    assert.equal(o.calls[0].url, `http://localhost:${P_BARE}/hud`);
    assert.equal(o.calls[0].opts.home, s.home);
    assert.equal(o.calls[0].opts.tab, false);
  } finally { await node?.close(); s.done(); }
});

test('bare `aihud --tab` hands --tab to the launcher', async () => {
  const s = sandbox();
  const o = fakeOpen();
  let node;
  try {
    assert.equal(await main(['--tab', '--port', String(P_BARE), '--projects', s.projects, '--home', s.home], { ...capture().io, open: o.open, onServe: (n) => { node = n; } }), 0);
    assert.equal(o.calls.length, 1);
    assert.equal(o.calls[0].opts.tab, true);
  } finally { await node?.close(); s.done(); }
});

test('second bare `aihud` while a node runs (fake fetch): opens the window only, starts no node, exit 0', async () => {
  const s = sandbox();
  const o = fakeOpen();
  const probed = [];
  const fetchFn = async (url) => { probed.push(url); return { ok: true, json: async () => ({ name: 'aihud' }) }; };
  let served = 0;
  try {
    const c = capture();
    const code = await main(['--port', String(P_FAKE), '--projects', s.projects, '--home', s.home], { ...c.io, open: o.open, fetchFn, onServe: () => { served += 1; } });
    assert.equal(code, 0, c.err.join('\n'));
    assert.deepEqual(probed, [`http://127.0.0.1:${P_FAKE}/`]);
    assert.equal(served, 0, 'a second node was started');
    assert.ok(o.calls.length >= 1, 'the launcher was never called');
    assert.equal(o.calls[0].url, `http://localhost:${P_FAKE}/hud`);
    assert.match(c.out.join('\n'), new RegExp(`aihud node already runs on http://localhost:${P_FAKE} - opening the window only`));
    await assert.rejects(fetch(`http://127.0.0.1:${P_FAKE}/`), 'something listens although only the window should open');
  } finally { s.done(); }
});

test('second bare `aihud` against a real running node: probes it and opens the window only', async () => {
  const s = sandbox();
  const running = await createNode({ port: P_REAL, projects: s.projects, home: s.home });
  const o = fakeOpen();
  let served = 0;
  try {
    const c = capture();
    assert.equal(await main(['--port', String(P_REAL), '--projects', s.projects, '--home', s.home], { ...c.io, open: o.open, onServe: () => { served += 1; } }), 0, c.err.join('\n'));
    assert.equal(served, 0, 'a second node was started');
    assert.equal(o.calls.length, 1);
    assert.equal(o.calls[0].url, `http://localhost:${P_REAL}/hud`);
  } finally { await running.close(); s.done(); }
});

test('`aihud serve` never calls the launcher', async () => {
  const s = sandbox();
  const o = fakeOpen();
  let node;
  try {
    const c = capture();
    assert.equal(await main(['serve', '--port', String(P_BARE), '--projects', s.projects, '--home', s.home], { ...c.io, open: o.open, onServe: (n) => { node = n; } }), 0, c.err.join('\n'));
    assert.ok(node, 'serve started no node');
    assert.equal(o.calls.length, 0, 'serve opened a window');
  } finally { await node?.close(); s.done(); }
});

// ── the probe in front of the bare start: anything but an aihud answer falls through to serve ──

async function foreignServer(port) {
  const { createServer } = await import('node:http');
  const server = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('not json'); });
  await new Promise((ok) => server.listen(port, '127.0.0.1', ok));
  return { close: () => new Promise((ok) => server.close(ok)) };
}

test('probe: a foreign server ({name:"other"} or non-JSON) is no aihud node - serve is tried, the launcher stays shut', async () => {
  const s = sandbox();
  const foreign = await foreignServer(P_FOREIGN);
  try {
    for (const fetchFn of [async () => ({ ok: true, json: async () => ({ name: 'other' }) }), fetch]) {
      const o = fakeOpen();
      let served = 0;
      const c = capture();
      const code = await main(['--port', String(P_FOREIGN), '--projects', s.projects, '--home', s.home], { ...c.io, open: o.open, fetchFn, onServe: () => { served += 1; } });
      assert.equal(code, 1);
      assert.match(c.err.join('\n'), /aihud: port already in use/, 'serve was not tried');
      assert.doesNotMatch(c.out.join('\n'), /already runs/);
      assert.equal(served, 0);
      assert.equal(o.calls.length, 0, 'the launcher opened a window for a foreign server');
    }
  } finally { await foreign.close(); s.done(); }
});

test('probe: a throwing fetch counts as "no node" - serve is tried, the launcher stays shut on a busy port', async () => {
  const s = sandbox();
  const foreign = await foreignServer(P_FOREIGN);
  const o = fakeOpen();
  let probes = 0;
  try {
    const c = capture();
    const fetchFn = async () => { probes += 1; throw new TypeError('fetch failed'); };
    assert.equal(await main(['--port', String(P_FOREIGN), '--projects', s.projects, '--home', s.home], { ...c.io, open: o.open, fetchFn }), 1);
    assert.ok(probes >= 1, 'the probe never ran');
    assert.match(c.err.join('\n'), /aihud: port already in use/, 'serve was not tried');
    assert.equal(o.calls.length, 0);
  } finally { await foreign.close(); s.done(); }
});

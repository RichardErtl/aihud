// The node over real HTTP on test ports 4391/4392, against a temp copy of the reader fixtures and
// a temp aihud home. Never the real transcript folder, never the real ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { performance } from 'node:perf_hooks';
import { appendFileSync, copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNode } from './server.js';
import { checkLeaks } from '../reader/leak-check.js';
import { layoutChecks } from './layout-schema.js';
import { createServer as netServer } from 'node:net';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed 43xx/44xx port, so parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'reader', 'fixtures', 'projects');
const SLUG = 'c--dev-sample-app';
const PORT = await freePort();
const POLL_PORT = await freePort();

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-node-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const ids = readdirSync(join(projects, SLUG)).filter((f) => f.endsWith('.jsonl')).map((f) => f.replace(/\.jsonl$/, ''));
  return { base, projects, home, ids, done: () => rmSync(base, { recursive: true, force: true }) };
}

function tree(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

async function req(port, path, { method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method, headers: body === undefined ? headers : { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, text };
}

/** A POST with a chosen Origin header (raw http, so nothing rewrites the header). */
function postWithOrigin(port, path, origin, body) {
  return new Promise((ok, fail) => {
    const r = http.request({
      host: '127.0.0.1', port, path, method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', Origin: origin },
    }, (res) => { res.resume(); ok(res.statusCode); });
    r.on('error', fail);
    r.end(JSON.stringify(body));
  });
}

/** An SSE client that resolves waiters with the arrival time of the matching event. */
function listen(port) {
  return new Promise((ok, fail) => {
    const waiters = [];
    // agent: false — a pooled keep-alive socket of an earlier node on the same port would be reset.
    const r = http.get({ host: '127.0.0.1', port, path: '/events', agent: false }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const at = performance.now();
          const ev = { event: null, data: null };
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) ev.event = line.slice(7);
            if (line.startsWith('data: ')) ev.data = JSON.parse(line.slice(6));
          }
          if (ev.event === 'hello') ok(client);
          for (const w of [...waiters]) if (w.pred(ev)) { waiters.splice(waiters.indexOf(w), 1); clearTimeout(w.timer); w.ok({ ev, at }); }
        }
      });
    });
    r.on('error', fail);
    const client = {
      wait: (pred, ms) => new Promise((resolve, reject) => {
        const w = { pred, ok: resolve, timer: setTimeout(() => { waiters.splice(waiters.indexOf(w), 1); reject(new Error(`no matching event within ${ms} ms`)); }, ms) };
        waiters.push(w);
      }),
      close: () => r.destroy(),
    };
  });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const lastLine = (file) => readFileSync(file, 'utf8').trimEnd().split('\n').pop() + '\n';

test('serves the session list, the contract per session, settings, catalog and svg; refuses foreign hosts', async (t) => {
  const s = sandbox();
  // The state comes from the file age (<= 180 s = awake). A copy may keep the source mtime (cpSync
  // on Windows), and a fresh checkout is minutes old: set it explicitly to one hour ago, so 'quiet'
  // never depends on when the fixtures were checked out.
  const old = new Date(Date.now() - 3_600_000);
  for (const f of tree(s.projects)) utimesSync(join(s.projects, f), old, old);
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home, startDir: 'C:\\dev\\sample-app' });
  try {
    assert.equal(node.url, `http://localhost:${PORT}`);
    const list = await req(PORT, '/sessions');
    assert.equal(list.status, 200);
    assert.equal(list.json.sessions.length, s.ids.length);
    assert.ok(s.ids.length >= 2, 'fixture copy is empty - the list would prove nothing');
    for (const e of list.json.sessions) {
      assert.equal(e.project_slug, SLUG);
      assert.equal(typeof e.mtime_ms, 'number');
      assert.equal(e.main_file, undefined, 'the list must not carry transcript paths');
    }
    // start folder C:\dev\sample-app → slug C--dev-sample-app matches folder c--dev-sample-app
    assert.equal(list.json.start_slug, 'C--dev-sample-app');
    assert.equal(list.json.current, list.json.sessions[0].session_id);
    assert.equal(list.json.current_from, 'start_folder');

    const id = s.ids[0];
    const one = await req(PORT, `/sessions/${id}`);
    assert.equal(one.status, 200);
    assert.equal(one.json.version, '1.0');
    assert.equal(one.json.session.id, id);
    assert.equal(one.json.live.instances[0].state, 'quiet');
    assert.ok(!one.text.includes(s.projects), 'the contract carries a transcript path');
    t.diagnostic(`contract types: ${Object.keys(one.json).join(',')}`);

    assert.equal((await req(PORT, '/sessions/nope')).status, 404);
    assert.equal((await req(PORT, '/sessions/..%2F..%2Fetc')).status, 404);
    assert.deepEqual((await req(PORT, '/settings')).json, { port: 4747, layout_portrait: 'essentials-portrait', layout_landscape: 'essentials-landscape', landscape_ratio: 1, unit_max: 22.5 });
    assert.ok(Array.isArray((await req(PORT, '/catalog')).json.entries));
    assert.ok(Array.isArray((await req(PORT, '/svg')).json));
    assert.equal((await req(PORT, '/svg/..%2Fsettings.json')).status, 404);

    const foreign = await new Promise((ok) => {
      http.get({ host: '127.0.0.1', port: PORT, path: '/sessions', agent: false, headers: { Host: `evil.example:${PORT}` } }, (res) => { res.resume(); ok(res.statusCode); });
    });
    assert.equal(foreign, 403);
    assert.equal((await req(PORT, '/layouts', { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).status, 415);
  } finally { await node.close(); s.done(); }
});

async function measureLatency(t, port, opts, label) {
  const s = sandbox();
  const node = await createNode({ port, projects: s.projects, home: s.home, ...opts });
  let sse = { close() {} };
  try {
    sse = await listen(port);
    const id = s.ids[0];
    const file = join(s.projects, SLUG, `${id}.jsonl`);
    const line = lastLine(file);
    const ms = [];
    for (let run = 0; run < 3; run++) {
      await pause(300);
      const got = sse.wait((e) => e.event === 'session-updated' && e.data.id === id, 5000);
      const t0 = performance.now();
      appendFileSync(file, line);
      const { at } = await got;
      ms.push(Math.round((at - t0) * 10) / 10);
    }
    t.diagnostic(`${label} session-updated latency ms: ${ms.join(', ')} (freshness ${node.stats().freshness})`);
    assert.equal(ms.length, 3);
    for (const v of ms) assert.ok(v <= 5000, `latency ${v} ms > 5000 ms`);

    // a new session file appears → sessions-changed
    const fresh = '00000000-0000-4000-8000-00000000abcd';
    const changed = sse.wait((e) => e.event === 'sessions-changed', 5000);
    const t0 = performance.now();
    copyFileSync(file, join(s.projects, SLUG, `${fresh}.jsonl`));
    const { at } = await changed;
    t.diagnostic(`${label} sessions-changed latency ms: ${Math.round((at - t0) * 10) / 10}`);
    const list = await req(port, '/sessions');
    assert.ok(list.json.sessions.some((e) => e.session_id === fresh));
    return node.stats();
  } finally { sse.close(); await node.close(); s.done(); }
}

test('SSE: session-updated arrives <= 5 s after a transcript line is appended (fs.watch)', async (t) => {
  const stats = await measureLatency(t, PORT, {}, 'watch');
  assert.equal(stats.freshness, 'watch');
  assert.ok(stats.watchEvents >= 1, 'the watch never fired - the latency came from somewhere else');
});

test('SSE: the same with the watch switched off (mtime poll fallback)', async (t) => {
  const stats = await measureLatency(t, POLL_PORT, { pollMs: 1000 }, 'poll');
  assert.equal(stats.freshness, 'poll');
  assert.equal(stats.watchEvents, 0);
  assert.ok(stats.scans >= 2, 'the poll never scanned');
});

test('write ways over HTTP: sidecar and layout land only under the aihud home', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  let sse = { close() {} };
  try {
    sse = await listen(PORT);
    const before = tree(s.base);
    const id = s.ids[1];
    const changed = sse.wait((e) => e.event === 'sessions-changed', 2000);
    const sc = await req(PORT, `/sessions/${id}/sidecar`, { method: 'POST', body: { title: 'Refactor', closed: true, closed_at: '2026-09-30T21:00:00.000Z' } });
    assert.equal(sc.status, 200);
    assert.deepEqual(sc.json, { session_id: id, title: 'Refactor', closed: true, closed_at: '2026-09-30T21:00:00.000Z' });
    await changed;
    assert.equal((await req(PORT, `/sessions/${id}/sidecar`, { method: 'POST', body: { color: 'red' } })).status, 400);
    assert.equal((await req(PORT, '/sessions/unknown-id/sidecar', { method: 'POST', body: { closed: true } })).status, 404);
    const listed = (await req(PORT, '/sessions')).json.sessions.find((e) => e.session_id === id);
    assert.equal(listed.sidecar.closed, true);
    assert.equal((await req(PORT, `/sessions/${id}`)).json.live.instances[0].state, 'closed');

    // Origin guard: a present Origin must be this node's own loopback origin
    const body = { name: 'Foreign', orientation: 'landscape', tiles: [] };
    for (const origin of ['http://evil.example', `http://evil.example:${PORT}`, 'null', `https://localhost:${PORT}`, `http://localhost:${PORT + 1}`]) {
      assert.equal(await postWithOrigin(PORT, '/layouts', origin, body), 403, origin);
      assert.equal(await postWithOrigin(PORT, `/sessions/${id}/sidecar`, origin, { note: 'x' }), 403, origin);
    }
    assert.equal(await postWithOrigin(PORT, '/layouts', `http://localhost:${PORT}`, body), 201);
    assert.equal(await postWithOrigin(PORT, '/layouts', `http://127.0.0.1:${PORT}`, body), 201);
    assert.equal(await postWithOrigin(PORT, '/layouts', `http://[::1]:${PORT}`, body), 201);
    const lay = await req(PORT, '/layouts', { method: 'POST', body: { name: 'Night Strip', orientation: 'landscape', tiles: [] } });
    assert.equal(lay.status, 201);
    assert.equal(lay.json.path, join(s.home, 'layouts', 'night-strip.json'));
    assert.equal((await req(PORT, '/layouts', { method: 'POST', body: { name: '../x', orientation: 'landscape', tiles: [] } })).status, 400);
    assert.equal((await req(PORT, '/layouts', { method: 'POST', body: { name: 'x', orientation: 'landscape', tiles: [], more: 1 } })).status, 400);

    assert.deepEqual(tree(s.base), [...before, 'home/layouts/foreign.json', 'home/layouts/night-strip.json', `home/sessions/${id}.json`].sort());
    assert.equal(JSON.parse(readFileSync(join(s.home, 'sessions', `${id}.json`), 'utf8')).note, undefined, 'a foreign-origin POST reached the sidecar');
    const cat = (await req(PORT, '/catalog')).json.entries;
    const own = cat.find((e) => e.kind === 'layout' && e.name === 'night-strip');
    assert.equal(own.own, true);
    assert.equal(cat[0].own, true, 'own entries are listed first');
  } finally { sse.close(); await node.close(); s.done(); }
});

test('POST /layouts checks the layout schema against the catalog (400 with the first violation path); the guards stay', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  let sse = { close() {} };
  try {
    sse = await listen(PORT);
    const before = tree(s.base);
    const runs = layoutChecks.runs;
    const post = (body) => req(PORT, '/layouts', { method: 'POST', body });
    const refused = [
      [{ name: 'a', orientation: 'portrait', tiles: [{ tile: 'no-such-tile', col: 0, row: 0 }] }, 'layout_invalid:tiles[0].tile:unknown_tile_no-such-tile'],
      [{ name: 'a', orientation: 'portrait', tiles: [{ tile: 'example-number', col: 1, row: 0 }] }, 'layout_invalid:tiles[0]:exceeds_width_1+8>8'],
      [{ name: 'a', orientation: 'landscape', tiles: [{ tile: 'example-number-landscape', col: 0, row: 1 }] }, 'layout_invalid:tiles[0]:exceeds_band_1+7>7'],
      [{ name: 'a', orientation: 'landscape', tiles: [{ tile: 'example-number', col: 0, row: 0 }] }, 'layout_invalid:tiles[0].tile:orientation_mismatch'],
      [{ name: 'a', orientation: 'portrait', tiles: [{ tile: 'example-number', col: 0, row: 0 }, { tile: 'example-number', col: 0, row: 5 }] }, 'layout_invalid:tiles[1]:overlaps_tiles[0]'],
      [{ name: 'a', orientation: 'portrait', tiles: [{ tile: 'example-number', col: '0', row: 0 }] }, 'layout_invalid:tiles[0].col:not_an_integer_>=_0'],
      [{ name: 'a', orientation: 'portrait', tiles: [{ tile: 'cli', col: 0, row: 0 }] }, 'layout_invalid:tiles[0].tile:unknown_tile_cli'],
    ];
    for (const [body, error] of refused) {
      const r = await post(body);
      assert.equal(r.status, 400, error);
      assert.deepEqual(r.json, { error });
    }
    assert.deepEqual(tree(s.base), before, 'a refused layout left a file');
    const changed = sse.wait((e) => e.event === 'catalog-changed' && e.data.slug === 'night-strip', 2000);
    const ok = await post({ name: 'Night Strip', orientation: 'portrait', tiles: [{ tile: 'example-number', col: 0, row: 0 }, { tile: 'example-number', col: 0, row: 6 }] });
    assert.equal(ok.status, 201, JSON.stringify(ok.json));
    await changed;
    assert.ok(layoutChecks.runs >= runs + refused.length + 1, `the schema check ran ${layoutChecks.runs - runs} times in the POST path`);
    // the guards in front of the check are unchanged
    assert.equal(await postWithOrigin(PORT, '/layouts', 'http://evil.example', { name: 'x', orientation: 'portrait', tiles: [] }), 403);
    assert.equal((await req(PORT, '/layouts', { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.equal((await post({ name: '../x', orientation: 'portrait', tiles: [] })).status, 400);
  } finally { sse.close(); await node.close(); s.done(); }
});

test('GET /hud, its files, tile modules and layouts by catalog name; settings carry the layout pair and the shape threshold', async () => {
  const s = sandbox();
  mkdirSync(join(s.home, 'layouts'));
  writeFileSync(join(s.home, 'layouts', 'probe-portrait.json'), JSON.stringify({ name: 'probe portrait', orientation: 'portrait', tiles: [] }));
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  // raw http without a pooled socket: a keep-alive socket of the previous node on this port is reset
  const get = (path) => new Promise((ok, fail) => {
    http.get({ host: '127.0.0.1', port: PORT, path, agent: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(text); } catch { /* not json */ }
        ok({ status: res.statusCode, type: res.headers['content-type'], text, json });
      });
    }).on('error', fail);
  });
  try {
    const page = await get('/hud');
    assert.equal(page.status, 200);
    assert.match(page.type, /^text\/html/);
    assert.match(page.text, /<script type="module">[^<]*\/hud\/hud\.js[^<]*boot\(window\);/, 'the page boots the HUD module');
    for (const [path, type] of [['/hud/', /^text\/html/], ['/hud/hud.js', /^text\/javascript/], ['/hud/hud.css', /^text\/css/], ['/tiles/example-number.js', /^text\/javascript/]]) {
      const r = await get(path);
      assert.equal(r.status, 200, path);
      assert.match(r.type, type, path);
    }
    assert.match((await get('/tiles/example-number.js')).text, /export function render\(el, data, size\)/);
    for (const path of ['/tiles/cli.js', '/tiles/contract.json', '/tiles/example-number', '/tiles/..%2Fnode%2Fstore.js', '/hud/index.html', '/hud/hud.test.js', '/layouts/nope', '/layouts/probe-portrait.json']) {
      assert.equal((await get(path)).status, 404, path);
    }
    // own first: the own file of the same name shadows the shipped one
    assert.deepEqual((await get('/layouts/probe-portrait')).json, { name: 'probe portrait', orientation: 'portrait', tiles: [] });
    assert.equal((await get('/layouts/probe-landscape')).json.orientation, 'landscape');
    const cat = (await get('/catalog')).json.entries;
    const layoutTags = cat.filter((e) => e.kind === 'layout').map((e) => `${e.own}:${e.name}`);
    assert.equal(layoutTags[0], 'true:probe-portrait', 'own first');
    assert.ok(layoutTags.includes('false:probe-landscape') && layoutTags.includes('false:probe-portrait'), `probe pair shipped: ${layoutTags.join(', ')}`);
    assert.equal(layoutTags.filter((t) => t.startsWith('true:')).length, 1, 'exactly the one own layout');
    assert.deepEqual((await get('/settings')).json, { port: 4747, layout_portrait: 'essentials-portrait', layout_landscape: 'essentials-landscape', landscape_ratio: 1, unit_max: 22.5 });
    assert.ok((await get('/')).json.endpoints.includes('GET /hud'));
  } finally { await node.close(); s.done(); }
});

test('the contract carries the sidecar through the reader extras (withText), and the leak check does not widen', async () => {
  const s = sandbox();
  const id = s.ids[0];
  mkdirSync(join(s.home, 'sessions'));
  writeFileSync(join(s.home, 'sessions', `${id}.json`), JSON.stringify({
    title: 'Parser rework, part two', note: 'waiting for review', closed: true, closed_at: '2026-09-30T22:15:00.000Z',
  }));
  const closedPort = await freePort();
  const node = await createNode({ port: closedPort, projects: s.projects, home: s.home });
  try {
    const { status, json } = await req(closedPort,`/sessions/${id}`);
    assert.equal(status, 200, JSON.stringify(json));
    assert.equal(json.session.title, 'Parser rework, part two');
    assert.equal(json.session.note, 'waiting for review');
    assert.equal(json.session.closed, true);
    assert.equal(json.session.closed_at, '2026-09-30T22:15:00.000Z');
    assert.equal(json.live.instances[0].state, 'closed');
    assert.equal(checkLeaks(json, { withText: true }).clean, true, 'the served contract fails the withText leak check');
    assert.equal(checkLeaks(json).clean, false, 'without withText the title must count as a leak');
    // the mode exempts title/note/first_line only: transcript-like text anywhere else still trips
    const planted = structuredClone(json);
    planted.session.model = 'please refactor the parser';
    const r = checkLeaks(planted, { withText: true });
    assert.equal(r.clean, false);
    assert.ok(r.violations.some((v) => v.path === '.session.model'), JSON.stringify(r.violations));
  } finally { await node.close(); s.done(); }
});

test('a busy port is reported, not swallowed', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  try {
    await assert.rejects(createNode({ port: PORT, projects: s.projects, home: s.home }), (e) => e.code === 'EADDRINUSE');
  } finally { await node.close(); s.done(); }
});

test('GET /sessions: start folder without sessions falls back to the newest overall (current_from), switches back, empty list stays null', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home, startDir: 'C:/dev/elsewhere'.replace(/\//g, '\\') });
  const poll = async (pred) => {
    for (let i = 0; i < 100; i++) { const r = (await req(PORT, '/sessions')).json; if (pred(r)) return r; await pause(100); }
    throw new Error('list never reached the expected state');
  };
  try {
    const a = (await req(PORT, '/sessions')).json;
    assert.equal(a.start_slug, 'C--dev-elsewhere');
    assert.equal(a.current, a.sessions[0].session_id, 'newest overall');
    assert.equal(a.current_from, 'newest');
    // a session appears in the start folder: current switches back to it
    mkdirSync(join(s.projects, 'c--dev-elsewhere'));
    const id = '00000000-0000-4000-8000-0000000000ee';
    copyFileSync(join(s.projects, SLUG, `${s.ids[0]}.jsonl`), join(s.projects, 'c--dev-elsewhere', `${id}.jsonl`));
    const b = await poll((r) => r.current_from === 'start_folder');
    assert.equal(b.current, id);
    assert.equal(b.sessions.find((e) => e.session_id === id).project_slug, 'c--dev-elsewhere');
  } finally { await node.close(); s.done(); }
  const e = sandbox();
  for (const f of readdirSync(join(e.projects, SLUG))) rmSync(join(e.projects, SLUG, f), { recursive: true, force: true });
  let ep;
  const empty = await createNode({ port: (ep = await freePort()), projects: e.projects, home: e.home, startDir: 'C:/dev/elsewhere'.replace(/\//g, '\\') });
  try {
    const r = (await req(ep, '/sessions')).json;
    assert.equal(r.sessions.length, 0);
    assert.equal(r.current, null);
    assert.equal(r.current_from, null);
  } finally { await empty.close(); e.done(); }
});

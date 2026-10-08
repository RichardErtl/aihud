// POST /settings — the third write way, with the fences of POST /layouts (Origin-403, JSON-only,
// writes only inside the aihud home via writeInside), over real HTTP on test ports 4412–4415,
// against a temp copy of the reader fixtures and a temp aihud home. Never the real ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNode } from './server.js';
import { DEFAULT_SETTINGS } from './store.js';
import { createServer as netServer } from 'node:net';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed 43xx/44xx port, so parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'reader', 'fixtures', 'projects');
const PORT = await freePort();
const PORT_2 = await freePort();
const PORT_3 = await freePort();
const PORT_4 = await freePort();   // the restarted node: a pooled socket of a closed node is never reused

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-settings-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  return { base, projects, home, done: () => rmSync(base, { recursive: true, force: true }) };
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

/** An SSE listener: `ready` once the node said hello, `event` = the first event of `type`. */
function nextEvent(port, type, ms = 3000) {
  let ready;
  const readyP = new Promise((go) => { ready = go; });
  const event = new Promise((ok, fail) => {
    const timer = setTimeout(() => { r.destroy(); fail(new Error(`no ${type} within ${ms} ms`)); }, ms);
    const r = http.get({ host: '127.0.0.1', port, path: '/events', agent: false }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        if (buf.includes('event: hello\n')) ready();
        for (const frame of buf.split('\n\n')) {
          if (frame.startsWith(`event: ${type}\n`)) { clearTimeout(timer); r.destroy(); ok(JSON.parse(frame.split('\ndata: ')[1])); }
        }
      });
    });
    r.on('error', () => {});
  });
  return { ready: readyP, event };
}

const fileOf = (home) => JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8'));

test('POST /settings: a round trip — saved into settings.json under the home only, read back by GET and by a restarted node; settings-changed is pushed', async () => {
  const s = sandbox();
  let node = await createNode({ port: PORT, projects: s.projects, home: s.home, startDir: 'C:\\dev\\sample-app' });
  try {
    assert.deepEqual((await req(PORT, '/settings')).json, { ...DEFAULT_SETTINGS }, 'a fresh home reads the defaults');
    const pushed = nextEvent(PORT, 'settings-changed');
    await pushed.ready;
    const patch = {
      layout_landscape: 'minimal-landscape', layout_portrait: 'fancy-a-portrait', landscape_ratio: 1.5, unit_max: 20, port: 4800,
      theme: 'light', welcome_seen: true, last_tab: 'layouts', projects: s.projects,
      design_variables: { dark: { '--aihud-heat-100': '#123456', '--aihud-glow': '4px' }, light: { '--aihud-glow-core': '0.5', '--aihud-font': 'Inter, sans-serif' } },
    };
    const saved = await req(PORT, '/settings', { method: 'POST', body: patch });
    assert.equal(saved.status, 200, saved.text);
    assert.deepEqual(saved.json, { ...DEFAULT_SETTINGS, ...patch });
    assert.deepEqual((await pushed.event).keys, Object.keys(patch).sort());
    assert.deepEqual(fileOf(s.home), patch, 'exactly the posted keys on disk, no defaults frozen in');
    assert.deepEqual(readdirSync(s.home), ['settings.json'], 'one file, inside the home');
    assert.deepEqual((await req(PORT, '/settings')).json, { ...DEFAULT_SETTINGS, ...patch });
    // a second POST merges per top-level key; the earlier keys stay
    assert.equal((await req(PORT, '/settings', { method: 'POST', body: { unit_max: 21.5 } })).status, 200);
    assert.deepEqual(fileOf(s.home), { ...patch, unit_max: 21.5 });
    // reload = a restarted node on the same home
    await node.close();
    node = await createNode({ port: PORT_4, projects: s.projects, home: s.home, startDir: 'C:\\dev\\sample-app' });
    assert.deepEqual((await req(PORT_4, '/settings')).json, { ...DEFAULT_SETTINGS, ...patch, unit_max: 21.5 });
    // the node names its folders (read-only) for the Settings tab
    const index = (await req(PORT_4, '/')).json;
    assert.ok(index.endpoints.includes('POST /settings'));
    assert.deepEqual(index.paths, { home: node.home, projects: node.projects, svg: join(node.home, 'svg') });
  } finally { await node.close(); s.done(); }
});

test('POST /settings refuses: unknown key, wrong type, out of bounds, unknown or wrong-orientation layout, bad design variable — 400 settings_invalid:<key>:<reason>, nothing written', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT_2, projects: s.projects, home: s.home, startDir: 'C:\\dev\\sample-app' });
  const cases = [
    [{ nope: 1 }, 'settings_invalid:nope:unknown_key'],
    [{ port: 0 }, 'settings_invalid:port:not_an_integer_1_to_65535'],
    [{ port: '4747' }, 'settings_invalid:port:not_an_integer_1_to_65535'],
    [{ port: 70000 }, 'settings_invalid:port:not_an_integer_1_to_65535'],
    [{ landscape_ratio: 0.1 }, 'settings_invalid:landscape_ratio:out_of_bounds_0.25_to_4'],
    [{ landscape_ratio: '1' }, 'settings_invalid:landscape_ratio:out_of_bounds_0.25_to_4'],
    [{ unit_max: 14.5 }, 'settings_invalid:unit_max:out_of_bounds_15_to_45'],
    [{ unit_max: 20.3 }, 'settings_invalid:unit_max:not_a_multiple_of_0.5'],
    [{ layout_landscape: 'no-such-layout' }, 'settings_invalid:layout_landscape:unknown_layout'],
    [{ layout_landscape: 'standard-portrait' }, 'settings_invalid:layout_landscape:not_a_landscape_layout'],
    [{ layout_portrait: 'minimal-landscape' }, 'settings_invalid:layout_portrait:not_a_portrait_layout'],
    [{ layout_portrait: 42 }, 'settings_invalid:layout_portrait:unknown_layout'],
    [{ theme: 'blue' }, 'settings_invalid:theme:not_system_dark_or_light'],
    [{ welcome_seen: 'yes' }, 'settings_invalid:welcome_seen:not_a_boolean'],
    [{ last_tab: 'start' }, 'settings_invalid:last_tab:not_a_tab_name'],
    [{ last_tab: 7 }, 'settings_invalid:last_tab:not_a_tab_name'],
    [{ projects: 'relative/path' }, 'settings_invalid:projects:not_an_absolute_path'],
    [{ design_variables: [] }, 'settings_invalid:design_variables:not_dark_and_light_objects'],
    [{ design_variables: { dark: {}, light: {}, dim: {} } }, 'settings_invalid:design_variables:not_dark_and_light_objects'],
    [{ design_variables: { dark: { '--aihud-nope': '#000000' }, light: {} } }, 'settings_invalid:design_variables:dark.--aihud-nope:unknown_variable'],
    [{ design_variables: { dark: { '--aihud-bg': 'red' }, light: {} } }, 'settings_invalid:design_variables:dark.--aihud-bg:not_a_hex_colour'],
    [{ design_variables: { dark: {}, light: { '--aihud-heat-rest': '2' } } }, 'settings_invalid:design_variables:light.--aihud-heat-rest:not_a_number_0_to_1'],
    [{ design_variables: { dark: { '--aihud-glow': 'big' }, light: {} } }, 'settings_invalid:design_variables:dark.--aihud-glow:not_a_px_length'],
    [{ design_variables: { dark: { '--aihud-font': 'x; } body { display: none' }, light: {} } }, 'settings_invalid:design_variables:dark.--aihud-font:not_a_font_list'],
  ];
  let runs = 0;
  try {
    for (const [body, reason] of cases) {
      const r = await req(PORT_2, '/settings', { method: 'POST', body });
      assert.deepEqual([r.status, r.json && r.json.error], [400, reason], JSON.stringify(body));
      runs++;
    }
    assert.equal(runs, cases.length, 'every refusal case ran');
    assert.ok(runs >= 1);
    assert.deepEqual([(await req(PORT_2, '/settings', { method: 'POST', body: [] })).json.error], ['body_not_an_object']);
    assert.equal(existsSync(join(s.home, 'settings.json')), false, 'no refused POST wrote a file');
    // the fences of POST /layouts: a foreign Origin is 403, a non-JSON body type 415
    for (const origin of ['http://evil.example', `http://localhost:${PORT_2 + 1}`, 'null']) {
      assert.equal(await postWithOrigin(PORT_2, '/settings', origin, { unit_max: 20 }), 403, origin);
    }
    assert.equal(await postWithOrigin(PORT_2, '/settings', `http://localhost:${PORT_2}`, { unit_max: 20 }), 200, 'its own origin may write');
    assert.equal((await req(PORT_2, '/settings', { method: 'POST', headers: { 'Content-Type': 'text/plain' } })).status, 415);
    assert.deepEqual(fileOf(s.home), { unit_max: 20 }, 'only the own-origin POST landed');
  } finally { await node.close(); s.done(); }
});

test('POST /settings never overwrites a broken settings.json and never writes through a link out of the home; settings.projects names the transcript folder', async (t) => {
  const s = sandbox();
  const node = await createNode({ port: PORT_3, projects: s.projects, home: s.home, startDir: 'C:\\dev\\sample-app' });
  try {
    writeFileSync(join(s.home, 'settings.json'), '{ broken');
    const r = await req(PORT_3, '/settings', { method: 'POST', body: { unit_max: 20 } });
    assert.deepEqual([r.status, r.json.error], [500, 'settings_json_unreadable']);
    assert.equal(readFileSync(join(s.home, 'settings.json'), 'utf8'), '{ broken', 'the broken file is left as it was');
    rmSync(join(s.home, 'settings.json'));
    // settings.json as a link to a file outside the home: the write replaces the link, the outside file stays
    const outside = join(s.base, 'outside.json');
    writeFileSync(outside, '{}');
    let linked = true;
    try { symlinkSync(outside, join(s.home, 'settings.json'), 'file'); } catch { linked = false; }
    t.diagnostic(linked ? 'settings.json link probe ran' : 'settings.json link probe skipped: no symlink right');
    if (linked) {
      assert.equal((await req(PORT_3, '/settings', { method: 'POST', body: { unit_max: 20 } })).status, 200);
      assert.equal(readFileSync(outside, 'utf8'), '{}', 'nothing written outside the home');
    }
  } finally { await node.close(); }
  // settings.projects: used when neither --projects nor AIHUD_PROJECTS names the folder
  const saved = process.env.AIHUD_PROJECTS;
  delete process.env.AIHUD_PROJECTS;
  const home2 = join(s.base, 'home2');
  mkdirSync(home2);
  writeFileSync(join(home2, 'settings.json'), JSON.stringify({ projects: s.projects }));
  let node2 = null;
  try {
    node2 = await createNode({ port: PORT_3, home: home2, startDir: 'C:\\dev\\sample-app' });
    assert.equal(node2.projects, s.projects);
    assert.ok((await req(PORT_3, '/sessions')).json.sessions.length >= 1, 'the sessions come from that folder');
  } finally {
    if (node2) await node2.close();
    if (saved === undefined) delete process.env.AIHUD_PROJECTS; else process.env.AIHUD_PROJECTS = saved;
    s.done();
  }
});

test('start: a broken settings.json refuses createNode without projects (the file is read for the transcript folder) — settings_json_unreadable, nothing listens', async () => {
  const s = sandbox();
  const saved = process.env.AIHUD_PROJECTS;
  delete process.env.AIHUD_PROJECTS;
  writeFileSync(join(s.home, 'settings.json'), '{ broken');
  try {
    await assert.rejects(createNode({ port: PORT_3, home: s.home, startDir: 'C:\dev\sample-app' }), (e) => e.reason === 'settings_json_unreadable');
    assert.equal(readFileSync(join(s.home, 'settings.json'), 'utf8'), '{ broken', 'the file is left as it was');
    await assert.rejects(fetch(`http://127.0.0.1:${PORT_3}/`), 'nothing listens on the port');
  } finally {
    if (saved === undefined) delete process.env.AIHUD_PROJECTS; else process.env.AIHUD_PROJECTS = saved;
    s.done();
  }
});

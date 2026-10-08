// AP.b: the draft channel (POST /layouts/draft → `layout-draft` over SSE, memory only) and the
// layout delete (DELETE /layouts/<name> → trash folder, never a hard delete) against a real node on
// test ports 4366/4367 (temp copy of the reader fixtures, temp aihud home). Never the real ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNode } from './server.js';
import { PACKAGE_DIR, DEFAULT_SETTINGS } from './store.js';
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

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-draft-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  return { base, projects, home, done: () => rmSync(base, { recursive: true, force: true }) };
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
async function req(port, path, { method = 'GET', body, origin } = {}) {
  const headers = { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(origin ? { Origin: origin } : {}) };
  return new Promise((ok, fail) => {
    const r = http.request({ host: '127.0.0.1', port, path, method, headers, agent: false }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { text += c; });
      res.on('end', () => { let json = null; try { json = JSON.parse(text); } catch { /* not json */ } ok({ status: res.statusCode, json, text }); });
    });
    r.on('error', fail);
    r.end(body === undefined ? undefined : JSON.stringify(body));
  });
}
/** An SSE client: `events` collects `{type, data}` in order. */
function listen(port) {
  return new Promise((ok, fail) => {
    const events = [];
    const r = http.get({ host: '127.0.0.1', port, path: '/events', agent: false }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const type = (frame.match(/^event: (.+)$/m) || [])[1];
          const data = (frame.match(/^data: (.+)$/m) || [])[1];
          if (type) events.push({ type, data: JSON.parse(data) });
        }
      });
      ok({ events, close: () => r.destroy() });
    });
    r.on('error', fail);
  });
}
const until = async (fn, what, ms = 3000) => {
  const end = Date.now() + ms;
  for (;;) { const v = fn(); if (v) return v; if (Date.now() > end) throw new Error(`timed out: ${what}`); await new Promise((r) => setTimeout(r, 15)); }
};
const DRAFT = { orientation: 'portrait', cols: 8, rows: 12, tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] };

test('POST /layouts stays byte-identical for old clients: same keys, same answer, same file bytes; a grid key is still refused', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  try {
    const body = { name: 'Old Client', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] };
    const res = await req(PORT, '/layouts', { method: 'POST', body });
    assert.equal(res.status, 201);
    assert.deepEqual(Object.keys(res.json).sort(), ['path', 'replaced', 'slug']);
    assert.equal(res.json.slug, 'old-client');
    assert.equal(readFileSync(join(s.home, 'layouts', 'old-client.json'), 'utf8'), JSON.stringify(body, null, 2) + '\n');
    const extra = await req(PORT, '/layouts', { method: 'POST', body: { ...body, cols: 8 } });
    assert.equal(extra.status, 400);
    assert.equal(extra.json.error, 'unknown_keys:cols');
  } finally { await node.close(); s.done(); }
});

test('draft: POST /layouts/draft is broadcast as `layout-draft`, writes no file, a new client hears the live draft, {end:true} ends it', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  const sse = await listen(PORT);
  try {
    await until(() => sse.events.some((e) => e.type === 'hello'), 'hello');
    const before = tree(s.home);
    const res = await req(PORT, '/layouts/draft', { method: 'POST', body: DRAFT });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.alive, true);
    const got = await until(() => sse.events.find((e) => e.type === 'layout-draft'), 'layout-draft');
    assert.deepEqual(got.data, DRAFT);
    assert.deepEqual(tree(s.home), before, 'memory only: nothing written');

    const late = await listen(PORT);
    const heard = await until(() => late.events.find((e) => e.type === 'layout-draft'), 'live draft on connect');
    assert.deepEqual(heard.data, DRAFT);
    late.close();

    const end = await req(PORT, '/layouts/draft', { method: 'POST', body: { end: true } });
    assert.equal(end.status, 200);
    await until(() => sse.events.filter((e) => e.type === 'layout-draft').length === 2, 'the end');
    assert.deepEqual(sse.events.filter((e) => e.type === 'layout-draft')[1].data, { end: true });
    const later = await listen(PORT);
    await until(() => later.events.some((e) => e.type === 'hello'), 'hello 2');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(later.events.some((e) => e.type === 'layout-draft'), false, 'an ended draft is not replayed');
    later.close();
    assert.deepEqual(tree(s.home), before);
  } finally { sse.close(); await node.close(); s.done(); }
});

test('draft fences: same Origin guard and validation as POST /layouts (403 / 400), nothing broadcast, nothing written', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  const sse = await listen(PORT);
  try {
    const before = tree(s.home);
    const foreign = await req(PORT, '/layouts/draft', { method: 'POST', body: DRAFT, origin: 'http://evil.example' });
    assert.equal(foreign.status, 403);
    assert.equal(foreign.json.error, 'origin_not_allowed');
    const own = await req(PORT, '/layouts/draft', { method: 'POST', body: DRAFT, origin: `http://localhost:${PORT}` });
    assert.equal(own.status, 200);
    const probes = [
      [{ ...DRAFT, orientation: 'sideways' }, 'draft_invalid:orientation'],
      [{ ...DRAFT, cols: 0 }, 'draft_invalid:cols'],
      [{ ...DRAFT, rows: 61 }, 'draft_invalid:rows'],
      [{ ...DRAFT, extra: 1 }, 'draft_invalid:unknown_key_extra'],
      [{ ...DRAFT, tiles: [{ tile: 'no-such-tile', col: 0, row: 0 }] }, 'draft_invalid:tiles[0].tile:unknown_tile_no-such-tile'],
      [{ ...DRAFT, tiles: [{ tile: 'header-standard-portrait', col: 4, row: 0 }] }, 'draft_invalid:tiles[0]:exceeds_width_4+8>8'],
    ];
    let checked = 0;
    for (const [body, error] of probes) {
      const res = await req(PORT, '/layouts/draft', { method: 'POST', body });
      assert.equal(res.status, 400, error);
      assert.equal(res.json.error, error);
      checked++;
    }
    assert.equal(checked, 6, 'trip-wire: every probe was asserted');
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(sse.events.filter((e) => e.type === 'layout-draft').length, 1, 'only the valid draft was broadcast');
    assert.deepEqual(tree(s.home), before);
  } finally { sse.close(); await node.close(); s.done(); }
});

test('draft heartbeat TTL: a draft nobody renews is dropped and the end is broadcast; a renewal keeps it alive', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT_2, projects: s.projects, home: s.home, draftTtlMs: 2000 });
  const sse = await listen(PORT_2);
  try {
    await req(PORT_2, '/layouts/draft', { method: 'POST', body: DRAFT });
    await new Promise((r) => setTimeout(r, 1100));
    await req(PORT_2, '/layouts/draft', { method: 'POST', body: DRAFT });
    await new Promise((r) => setTimeout(r, 1100));
    // 2200 ms since the first POST > the 2000 ms TTL: alive only because of the renewal; a ~900 ms stall under load is absorbed
    assert.equal(sse.events.filter((e) => e.type === 'layout-draft' && e.data.end).length, 0, 'renewed: still alive after 2200 ms (TTL 2000)');
    await until(() => sse.events.some((e) => e.type === 'layout-draft' && e.data.end === true), 'the TTL end', 6000);
  } finally { sse.close(); await node.close(); s.done(); }
});

test('DELETE own layout: the file moves to layouts/trash/<slug>-<iso>.json, the catalog forgets it, nothing is hard-deleted; fences like POST', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  const sse = await listen(PORT);
  try {
    const body = { name: 'Night Strip', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] };
    assert.equal((await req(PORT, '/layouts', { method: 'POST', body })).status, 201);
    const bytes = readFileSync(join(s.home, 'layouts', 'night-strip.json'), 'utf8');

    assert.equal((await req(PORT, '/layouts/night-strip', { method: 'DELETE', origin: 'http://evil.example' })).status, 403);
    assert.equal(existsSync(join(s.home, 'layouts', 'night-strip.json')), true, 'a foreign origin deletes nothing');
    assert.equal((await req(PORT, '/layouts/nope-nope', { method: 'DELETE' })).status, 404);
    assert.equal((await req(PORT, '/layouts/..%2Fsettings', { method: 'DELETE' })).status, 400);
    assert.equal((await req(PORT, '/layouts/night-strip/x', { method: 'DELETE' })).status, 404);
    const back = await req(PORT, '/layouts/a%5Cb', { method: 'DELETE' });
    assert.equal(back.status, 400);
    assert.equal(back.json.error, 'invalid_name');

    const res = await req(PORT, '/layouts/night-strip', { method: 'DELETE' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.name, 'night-strip');
    assert.equal(res.json.own, true);
    assert.equal(res.json.settings_reset, null);
    assert.equal(existsSync(join(s.home, 'layouts', 'night-strip.json')), false);
    const trashed = readdirSync(join(s.home, 'layouts', 'trash'));
    assert.equal(trashed.length, 1);
    assert.match(trashed[0], /^night-strip-\d{4}-\d\d-\d\dT[\d-]+Z\.json$/);
    assert.equal(readFileSync(join(s.home, 'layouts', 'trash', trashed[0]), 'utf8'), bytes, 'the trash holds the very bytes');
    const entries = (await req(PORT, '/catalog')).json.entries;
    assert.equal(entries.some((e) => e.kind === 'layout' && e.name === 'night-strip'), false);
    assert.equal(entries.some((e) => e.kind === 'layout' && e.name.includes('trash')), false);
    assert.equal((await req(PORT, '/layouts/night-strip')).status, 404);
    await until(() => sse.events.some((e) => e.type === 'catalog-changed' && e.data.slug === 'night-strip'), 'catalog-changed');
    // same name saved again and deleted again: both copies stay in the trash
    await req(PORT, '/layouts', { method: 'POST', body });
    assert.equal((await req(PORT, '/layouts/night-strip', { method: 'DELETE' })).status, 200);
    assert.equal(readdirSync(join(s.home, 'layouts', 'trash')).length, 2);
  } finally { sse.close(); await node.close(); s.done(); }
});

test('DELETE shipped layout: the package file stays, a marker trash/<slug>.hidden.json hides it from the catalog', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  try {
    const shipped = join(PACKAGE_DIR, 'layouts', 'minimal-landscape.json');
    const original = readFileSync(shipped, 'utf8');
    const res = await req(PORT, '/layouts/minimal-landscape', { method: 'DELETE' });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.own, false);
    assert.equal(readFileSync(shipped, 'utf8'), original, 'the shipped file is untouched');
    const marker = JSON.parse(readFileSync(join(s.home, 'layouts', 'trash', 'minimal-landscape.hidden.json'), 'utf8'));
    assert.equal(marker.hidden_shipped, true);
    assert.equal(marker.orientation, 'landscape');
    assert.ok(Array.isArray(marker.tiles) && marker.tiles.length > 0, 'the body is copied');
    const names = (await req(PORT, '/catalog')).json.entries.filter((e) => e.kind === 'layout').map((e) => e.name);
    assert.equal(names.includes('minimal-landscape'), false);
    assert.equal(names.includes('minimal-portrait'), true, 'its sibling stays');
    assert.equal((await req(PORT, '/layouts/minimal-landscape')).status, 404);
    assert.equal((await req(PORT, '/layouts/minimal-landscape', { method: 'DELETE' })).status, 404, 'a hidden layout is unknown');
  } finally { await node.close(); s.done(); }
});

test('DELETE the layout settings point at: layout_portrait/layout_landscape fall back to the default shipped layout, settings-changed is broadcast', async () => {
  const s = sandbox();
  writeFileSync(join(s.home, 'settings.json'), JSON.stringify({ layout_portrait: 'fancy-a-portrait', layout_landscape: 'fancy-a-landscape', unit_max: 20 }));
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  const sse = await listen(PORT);
  try {
    assert.equal(DEFAULT_SETTINGS.layout_portrait, 'essentials-portrait');
    assert.equal(DEFAULT_SETTINGS.layout_landscape, 'essentials-landscape');
    const a = await req(PORT, '/layouts/fancy-a-portrait', { method: 'DELETE' });
    assert.equal(a.status, 200, a.text);
    assert.deepEqual(a.json.settings_reset, { layout_portrait: 'essentials-portrait' });
    let settings = (await req(PORT, '/settings')).json;
    assert.equal(settings.layout_portrait, 'essentials-portrait');
    assert.equal(settings.layout_landscape, 'fancy-a-landscape', 'the other key is untouched');
    assert.equal(settings.unit_max, 20, 'other settings are untouched');
    await until(() => sse.events.some((e) => e.type === 'settings-changed' && e.data.keys.includes('layout_portrait')), 'settings-changed');

    const b = await req(PORT, '/layouts/fancy-a-landscape', { method: 'DELETE' });
    assert.deepEqual(b.json.settings_reset, { layout_landscape: 'essentials-landscape' });
    settings = (await req(PORT, '/settings')).json;
    assert.equal(settings.layout_landscape, 'essentials-landscape');

    // deleting the default itself while it is selected: the first remaining shipped layout of the orientation
    const c = await req(PORT, '/layouts/essentials-portrait', { method: 'DELETE' });
    assert.equal(c.status, 200);
    assert.deepEqual(c.json.settings_reset, { layout_portrait: 'fancy-b-portrait' });
    assert.equal((await req(PORT, '/settings')).json.layout_portrait, 'fancy-b-portrait');
    // a layout settings do not use: no settings change
    const d = await req(PORT, '/layouts/minimal-portrait', { method: 'DELETE' });
    assert.equal(d.json.settings_reset, null);
    assert.equal(JSON.parse(readFileSync(join(s.home, 'settings.json'), 'utf8')).layout_landscape, 'essentials-landscape');
  } finally { sse.close(); await node.close(); s.done(); }
});

test('DELETE fence: a layouts folder that is a link outside the home is refused (realpath), nothing moves', async () => {
  const s = sandbox();
  const outside = join(s.base, 'outside');
  mkdirSync(outside);
  writeFileSync(join(outside, 'escape.json'), JSON.stringify({ name: 'escape', orientation: 'portrait', tiles: [] }));
  symlinkSync(outside, join(s.home, 'layouts'), 'junction');
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  try {
    const res = await req(PORT, '/layouts/escape', { method: 'DELETE' });
    assert.equal(res.status, 400, res.text);
    assert.equal(res.json.error, 'target_outside_aihud_home');
    assert.deepEqual(readdirSync(outside), ['escape.json'], 'nothing left the folder behind the link');
  } finally { await node.close(); s.done(); }
});

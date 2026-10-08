// AP.b composer polish, the pure side: drag-to-resize, load an existing layout, the layouts list,
// the draft body, the delete confirm text, the one-step-larger fonts, and the new HUD overlay file
// served by the node. The page itself is proven in a real browser (composer-polish.browser.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  FORM_MAX, dragForm, layoutList, gridFromLayout, draftBody, deleteConfirmText, DRAFT_HEARTBEAT_MS, deleteLayout, settingsUrl, postDraft, nameSlug,
} from './composer.js';
import { createServer as netServer } from 'node:net';
import { createNode } from '../node/server.js';
import { catalog, PACKAGE_DIR } from '../node/store.js';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed port, parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');

test('drag to resize: portrait grows by rows (down), landscape by columns (right); limits are the form limits; the other axis never moves', () => {
  const portrait = { cols: 8, rows: 24 };
  assert.deepEqual(dragForm('portrait', portrait, 40, 67, 22.5), { cols: 8, rows: 27 }, '67 px = 3 cells of 22.5');
  assert.deepEqual(dragForm('portrait', portrait, 500, -45, 22.5), { cols: 8, rows: 22 }, 'dx is ignored in portrait');
  assert.deepEqual(dragForm('portrait', portrait, 0, 99999, 22.5), { cols: 8, rows: FORM_MAX.rows });
  assert.deepEqual(dragForm('portrait', portrait, 0, -99999, 22.5), { cols: 8, rows: 1 });
  const landscape = { cols: 48, rows: 6 };
  assert.deepEqual(dragForm('landscape', landscape, 90, 300, 20), { cols: 53, rows: 6 }, '90 px = 4.5 → 5 cells of 20, dy is ignored');
  assert.deepEqual(dragForm('landscape', landscape, 99999, 0, 20), { cols: FORM_MAX.cols, rows: 6 });
  assert.deepEqual(dragForm('landscape', landscape, -99999, 0, 20), { cols: 1, rows: 6 });
  assert.deepEqual(dragForm('portrait', portrait, 0, 30, 0), portrait, 'a broken unit changes nothing');
});

test('the layouts list: own newest first, then shipped by name; a shipped one shadowed by an own one is not listed twice; probes stay out', () => {
  const entries = [
    { kind: 'layout', name: 'b-ship', own: false, meta: { orientation: 'portrait' }, mtime_ms: 1 },
    { kind: 'layout', name: 'probe-portrait', own: false, meta: { orientation: 'portrait' }, mtime_ms: 1 },
    { kind: 'layout', name: 'old', own: true, meta: { orientation: 'landscape' }, mtime_ms: 100 },
    { kind: 'layout', name: 'new', own: true, meta: { orientation: 'portrait' }, mtime_ms: 900 },
    { kind: 'layout', name: 'a-ship', own: false, meta: { orientation: 'landscape' }, mtime_ms: 1 },
    { kind: 'layout', name: 'a-ship', own: true, meta: { orientation: 'landscape' }, mtime_ms: 500 },
    { kind: 'tile', name: 'header', own: false },
    { kind: 'layout', name: 'broken', own: true, loadable: false },
  ];
  const list = layoutList(entries);
  assert.deepEqual(list.map((l) => `${l.own ? 'own' : 'ship'}:${l.name}:${l.orientation}`),
    ['own:new:portrait', 'own:a-ship:landscape', 'own:old:landscape', 'ship:b-ship:portrait']);
});

test('loading a layout: grid = what the HUD would draw (portrait 8 x extent rows, landscape extent cols x at least 6 rows), tiles at their meta.sizes[0]', async () => {
  const s = mkdtempSync(join(tmpdir(), 'aihud-polish-'));
  try {
    const entries = await catalog(s, { packageDir: PACKAGE_DIR });
    const standard = JSON.parse(readFileSync(join(PACKAGE_DIR, 'layouts', 'standard-portrait.json'), 'utf8'));
    const g = gridFromLayout(standard, entries);
    assert.equal(g.orientation, 'portrait');
    assert.equal(g.form.cols, 8);
    assert.equal(g.placed.length, 7);
    assert.deepEqual(g.skipped, []);
    assert.equal(g.form.rows, Math.max(...g.placed.map((p) => p.row + p.size.rows)));
    assert.deepEqual(g.placed[0], { tile: 'header-standard-portrait', col: 0, row: 0, size: { cols: 8, rows: 2 } });
    const land = gridFromLayout(JSON.parse(readFileSync(join(PACKAGE_DIR, 'layouts', 'standard-landscape.json'), 'utf8')), entries);
    assert.equal(land.orientation, 'landscape');
    assert.ok(land.form.rows >= 6 && land.form.rows <= 7);
    assert.equal(land.form.cols, Math.max(...land.placed.map((p) => p.col + p.size.cols)));
    // an unknown tile is skipped and named, never silently dropped
    const ghost = gridFromLayout({ name: 'x', orientation: 'portrait', tiles: [{ tile: 'gone-tile', col: 0, row: 0 }, { tile: 'header-standard-portrait', col: 0, row: 3 }] }, entries);
    assert.deepEqual(ghost.skipped, ['gone-tile']);
    assert.equal(ghost.placed.length, 1);
    // an empty layout falls back to the default form
    assert.deepEqual(gridFromLayout({ name: 'e', orientation: 'portrait', tiles: [] }, entries).form, { cols: 8, rows: 24 });
  } finally { rmSync(s, { recursive: true, force: true }); }
});

test('the draft body: {orientation, cols, rows, tiles:[{tile,col,row}]} sorted top-left first, no size, heartbeat ~5 s (node TTL 15 s)', () => {
  const b = draftBody('portrait', { cols: 8, rows: 12 }, [
    { tile: 'b', col: 0, row: 4, size: { cols: 8, rows: 2 } }, { tile: 'a', col: 0, row: 0, size: { cols: 8, rows: 2 } },
  ]);
  assert.deepEqual(b, { orientation: 'portrait', cols: 8, rows: 12, tiles: [{ tile: 'a', col: 0, row: 0 }, { tile: 'b', col: 0, row: 4 }] });
  assert.equal(DRAFT_HEARTBEAT_MS, 5000);
});

test('the delete confirm names the layout, and says "shipped layout" for a shipped one', () => {
  assert.match(deleteConfirmText('night-strip', true), /"night-strip"/);
  assert.match(deleteConfirmText('night-strip', true), /trash/i);
  assert.doesNotMatch(deleteConfirmText('night-strip', true), /shipped layout/);
  assert.match(deleteConfirmText('standard-portrait', false), /shipped layout "standard-portrait"/);
  assert.match(deleteConfirmText('standard-portrait', false), /default/i, 'it says settings fall back to the default');
});

test('the composer\'s new calls reach the node: postDraft and deleteLayout over a real node (free port)', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-polish-node-'));
  const home = join(base, 'home');
  cpSync(FIXTURES, join(base, 'projects'), { recursive: true });
  mkdirSync(home);
  const port = await freePort();
  const node = await createNode({ port, projects: join(base, 'projects'), home });
  const url = `http://127.0.0.1:${port}`;
  try {
    const d = await postDraft(fetch, url, { orientation: 'portrait', cols: 8, rows: 10, tiles: [] });
    assert.equal(d.status, 200);
    assert.equal(d.json.alive, true);
    assert.equal((await postDraft(fetch, url, { end: true })).json.alive, false);
    const res = await fetch(`${url}/layouts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Gone Soon', orientation: 'portrait', tiles: [] }) });
    assert.equal(res.status, 201);
    const del = await deleteLayout(fetch, url, 'gone-soon');
    assert.equal(del.status, 200);
    assert.equal(del.json.own, true);
    assert.equal((await deleteLayout(fetch, url, 'gone-soon')).status, 404);
    assert.equal(nameSlug('Gone Soon'), 'gone-soon');
  } finally { await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('fonts one step larger (composer.css only): every font size +1 px of the old set — 10.5→11.5, 11→12, 11.5→12.5, 12→13, 13→14', () => {
  const css = readFileSync(join(HERE, 'composer.css'), 'utf8');
  const sizes = new Set([...css.matchAll(/font(?:-size)?:[^;}]*?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1])));
  const expected = [10, 11, 11.5, 12, 12.5, 13, 13.5, 14, 16];   // the old 9, 10, 10.5, 11, 11.5, 12, 12.5, 13, 15 each +1
  assert.deepEqual([...sizes].sort((a, b) => a - b), expected);
  assert.match(css, /body \{ font: 13\.5px\/1\.45/);
});

test('GET /hud/draft-overlay.js is served (the HUD imports it), still a fixed list', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-polish-route-'));
  const home = join(base, 'home');
  cpSync(FIXTURES, join(base, 'projects'), { recursive: true });
  mkdirSync(home);
  const port = await freePort();
  const node = await createNode({ port, projects: join(base, 'projects'), home });
  try {
    const ok = await fetch(`http://127.0.0.1:${port}/hud/draft-overlay.js`);
    assert.equal(ok.status, 200);
    assert.match(ok.headers.get('content-type'), /^text\/javascript/);
    await ok.arrayBuffer();
    const no = await fetch(`http://127.0.0.1:${port}/hud/draft-overlay.test.js`);
    assert.equal(no.status, 404);
    await no.arrayBuffer();
  } finally { await node.close(); rmSync(base, { recursive: true, force: true }); }
});

test('settingsUrl: the window Settings page, under the base', () => {
  assert.equal(settingsUrl(''), '/window#settings');
  assert.equal(settingsUrl('http://127.0.0.1:4747'), 'http://127.0.0.1:4747/window#settings');
});

// The composer: the pure grid/collision/layout functions, the page routes, and the save path —
// the composer's own `saveLayout` against a real node on test ports 4361/4362/4363 (temp copy of
// the reader fixtures, temp aihud home). Never the real transcript folder, never the real ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LAYOUT, FLOOR_INNER_PX, FORM_MAX, gridForm, panelTiles, checkPlacement, formFits, layoutBody, nameSlug,
  cellFromPoint, composerUnit, saveLayout, INSTRUCTIONS, tilesDir, CONTENT_BLOCKS, STYLES, FAMILIES, FAMILY_NAMES, refusalText, panelGroups, previewScale, PREVIEW,
} from './composer.js';
import { unitFor } from '../hud/hud.js';
import { createNode } from '../node/server.js';
import { catalog, layoutSlug, PACKAGE_DIR } from '../node/store.js';
import { layoutViolation, layoutChecks } from '../node/layout-schema.js';
import { createServer as netServer } from 'node:net';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed 43xx/44xx port, so parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const PORT = await freePort();
const PORT_2 = await freePort();
const PORT_3 = await freePort();

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-composer-'));
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

/** The shipped catalog (temp home without own files) — the real tile sizes. */
async function shipped() {
  const s = sandbox();
  try { return await catalog(s.home, { packageDir: PACKAGE_DIR }); } finally { s.done(); }
}
const sizeOf = (entries, name) => entries.find((e) => e.kind === 'tile' && e.name === name).meta.sizes[0];
const at = (entries, tile, col, row) => ({ tile, col, row, size: sizeOf(entries, tile) });

// ── pure functions ─────────────────────────────────────────────────────────

test('composer grid numbers are the contract numbers (width 8, band up to 7, floor 162 px inner = 20 px unit)', () => {
  assert.equal(LAYOUT.portraitMaxCols, CONTRACT.layoutFile.portraitMaxCols);
  assert.equal(LAYOUT.landscapeMaxRows, CONTRACT.layoutFile.landscapeMaxRows);
  assert.equal(unitFor('portrait', FLOOR_INNER_PX, 900), CONTRACT.grid.floorPx);
  assert.equal(composerUnit('portrait', 180, 30), CONTRACT.grid.basePx);
  assert.equal(composerUnit('portrait', 400, 30), 22.5, 'unit_max 22.5 caps a wide composer grid');
  assert.equal(composerUnit('portrait', 400, 30, 30), 30, 'a higher unit_max from the settings is honoured');
  assert.equal(composerUnit('landscape', 140, 7), 20, 'landscape: inner height / band rows');
  assert.equal(composerUnit('landscape', 120, 3), 20, 'a low landscape grid still sits in the 6-row band, like the HUD');
  assert.deepEqual(CONTENT_BLOCKS, CONTRACT.contentBlocks, 'panel groups in contract order');
  assert.deepEqual(STYLES, CONTRACT.styles, 'style order of the contract');
  assert.deepEqual(FAMILIES, CONTRACT.families, 'the filter families are the contract families, in order');
  assert.deepEqual(Object.keys(FAMILY_NAMES), Object.keys(CONTRACT.families));
});

test('refusal in words (J17) and the panel groups (J15): what the ghost says, Your tiles first, the family filter keeps own tiles', () => {
  const form = { cols: 8, rows: 24 };
  const size = { cols: 8, rows: 6 };
  assert.equal(refusalText('portrait', form, { col: 0, row: 1, size }, 'occupied:header-standard-portrait'), 'overlaps header-standard-portrait');
  assert.equal(refusalText('portrait', form, { col: 2, row: 0, size }, 'outside_grid'), '2 columns too wide — the strip is 8');
  assert.equal(refusalText('portrait', form, { col: 1, row: 0, size }, 'outside_grid'), '1 column too wide — the strip is 8');
  assert.equal(refusalText('portrait', form, { col: 0, row: 20, size }, 'outside_grid'), 'runs past row 24');
  assert.equal(refusalText('landscape', { cols: 48, rows: 6 }, { col: 0, row: 0, size: { cols: 8, rows: 7 } }, 'outside_grid'), '1 row too high — the band is 6');
  assert.equal(refusalText('landscape', { cols: 48, rows: 6 }, { col: 44, row: 0, size: { cols: 8, rows: 6 } }, 'outside_grid'), 'runs past column 48');
  assert.equal(refusalText('portrait', form, { col: -1, row: 0, size }, 'outside_grid'), 'outside the grid');
  assert.equal(refusalText('portrait', form, { col: 0, row: 0, size }, null), '');
  const panel = [
    { name: 'mine', own: true, block: null, style: null },
    { name: 'header-standard-portrait', own: false, block: 'header', style: 'standard' },
    { name: 'header-minimal-portrait', own: false, block: 'header', style: 'minimal' },
    { name: 'time-minimal-portrait', own: false, block: 'time', style: 'minimal' },
  ];
  assert.deepEqual(panelGroups(panel).map((g) => `${g.title}:${g.tiles.map((t) => t.name).join('+')}`),
    ['Your tiles:mine', 'Header:header-standard-portrait+header-minimal-portrait', 'Time:time-minimal-portrait']);
  assert.deepEqual(panelGroups(panel, 'classic').map((g) => g.tiles.length), [1, 2, 1], 'classic holds standard + minimal; own tiles pass every filter');
  assert.deepEqual(panelGroups(panel, 'quiet').map((g) => g.tiles.length), [1], 'a family without a matching shipped tile leaves only the own tiles');
  assert.deepEqual(panelGroups(panel, 'all', 'TIME').map((g) => g.title), ['Time']);
  // the preview box: 8 columns at 20 px shrink to the largest scale, a 16-column landscape tile fits the 212 px box
  assert.equal(previewScale({ cols: 8, rows: 2 }), PREVIEW.maxScale);
  assert.ok(16 * PREVIEW.unit * previewScale({ cols: 16, rows: 7 }) <= PREVIEW.boxPx);
});

test('any grid form: portrait is 8 wide with free height (a box too), landscape is free wide within the 7-row band', () => {
  assert.deepEqual(gridForm('portrait', 3, 8), { cols: 8, rows: 8 }, 'the box: 8 x 8');
  assert.deepEqual(gridForm('portrait', 8, 36), { cols: 8, rows: 36 });
  assert.deepEqual(gridForm('portrait', 8, 0), { cols: 8, rows: 1 });
  assert.deepEqual(gridForm('portrait', 8, 10_000), { cols: 8, rows: FORM_MAX.rows });
  assert.deepEqual(gridForm('landscape', 7, 7), { cols: 7, rows: 7 }, 'a landscape box');
  assert.deepEqual(gridForm('landscape', 62, 6), { cols: 62, rows: 6 });
  assert.deepEqual(gridForm('landscape', 62, 9), { cols: 62, rows: 7 }, 'the band never grows past 7');
  assert.deepEqual(gridForm('landscape', 'x', 'y'), gridForm('landscape', undefined, undefined), 'garbage falls back to the default form');
  assert.ok(gridForm('landscape').cols >= 1 && gridForm('portrait').rows >= 1);
});

test('tile panel: tiles of the chosen orientation only, own first, an own tile shadows a shipped one, then catalog order', () => {
  const entries = [
    { kind: 'tile', name: 'zz-mine', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 4, rows: 2 }] } },
    { kind: 'tile', name: 'context-standard-portrait', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 3 }] } },
    { kind: 'tile', name: 'broken', own: true, loadable: false, error: 'x' },
    { kind: 'tile', name: 'sizeless', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [[2, 1]] } },
    { kind: 'layout', name: 'mine', own: true, loadable: true, meta: { orientation: 'portrait' } },
    { kind: 'tile', name: 'a-shipped', own: false, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 2 }] } },
    { kind: 'tile', name: 'context-standard-portrait', own: false, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }] } },
    { kind: 'tile', name: 'b-landscape', own: false, loadable: true, meta: { orientation: 'landscape', sizes: [{ cols: 8, rows: 7 }] } },
  ];
  assert.deepEqual(panelTiles(entries, 'portrait').map(({ name, own, size }) => ({ name, own, size })), [
    { name: 'zz-mine', own: true, size: { cols: 4, rows: 2 } },
    { name: 'context-standard-portrait', own: true, size: { cols: 8, rows: 3 } },
    { name: 'a-shipped', own: false, size: { cols: 8, rows: 2 } },
  ]);
  assert.deepEqual(panelTiles(entries, 'landscape').map((t) => t.name), ['b-landscape']);
  // an own tile listed AFTER a shipped one in a foreign order still comes first
  assert.deepEqual(panelTiles([entries[5], entries[0]], 'portrait').map((t) => t.name), ['zz-mine', 'a-shipped']);
});

test('the shipped catalog fills both panels: one portrait and one landscape tile per contract size entry (73 each: 25 + 48 release tiles); the two example (probe) tiles stay out of the panel (Q5)', async () => {
  const entries = await shipped();
  const p = panelTiles(entries, 'portrait');
  const l = panelTiles(entries, 'landscape');
  const examples = entries.filter((e) => e.kind === 'tile' && /^example-/.test(e.name));
  assert.equal(examples.length, 2, 'trip-wire: the two example tiles are shipped');
  assert.equal(p.length + l.length, entries.filter((e) => e.kind === 'tile').length - examples.length);
  const perOrientation = Object.values(CONTRACT.sizes).flatMap((b) => Object.values(b)).filter(Boolean).length;   // every non-null size entry = one portrait + one landscape tile (tiles/CONTRACT.md §Sizes)
  assert.equal(perOrientation, 73, 'trip-wire: 25 first tiles + 48 release tiles per orientation');
  assert.equal(p.length, perOrientation, `${p.length} portrait`);
  assert.equal(l.length, perOrientation, `${l.length} landscape`);
  assert.ok(![...p, ...l].some((t) => /^example-/.test(t.name)), 'no example tile in a panel');
});

test('tile panel order (Q1/J15): own tiles newest saved first, then the shipped ones grouped by content block in contract order, inside a block in style order', () => {
  const tile = (name, own, extra = {}, mtime_ms = 5) => ({ kind: 'tile', name, own, loadable: true, mtime_ms, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 2 }], ...extra } });
  const entries = [
    tile('old-tile', true, {}, 1000),
    tile('new-tile', true, {}, 2000),
    tile('tokens-minimal-portrait', false, { contentBlock: 'tokens', style: 'minimal' }),
    tile('header-fancy-a-portrait', false, { contentBlock: 'header', style: 'fancy-a' }),
    tile('example-number', false, { contentBlock: 'context', style: 'standard' }),
    tile('context-minimal-portrait', false, { contentBlock: 'context', style: 'minimal' }),
    tile('header-standard-portrait', false, { contentBlock: 'header', style: 'standard' }),
  ];
  assert.deepEqual(panelTiles(entries, 'portrait').map((t) => t.name),
    ['new-tile', 'old-tile', 'header-standard-portrait', 'header-fancy-a-portrait', 'context-minimal-portrait', 'tokens-minimal-portrait']);
});

test('collision against meta.sizes[0]: an occupied cell is refused, touching is fine, the grid edge holds', async () => {
  const e = await shipped();
  const form = gridForm('portrait', 8, 12);
  const header = at(e, 'header-standard-portrait', 0, 0);            // 8 x 2
  const placed = [header];
  assert.equal(checkPlacement(form, placed, at(e, 'context-standard-portrait', 0, 2)), null, 'touching the header is fine');
  assert.equal(checkPlacement(form, placed, at(e, 'context-standard-portrait', 0, 1)), 'occupied:header-standard-portrait');
  assert.equal(checkPlacement(form, placed, at(e, 'context-standard-portrait', 0, 7)), 'outside_grid', '7 + 6 > 12 rows');
  assert.equal(checkPlacement(form, placed, at(e, 'context-standard-portrait', 0, 6)), null, '6 + 6 = 12 rows fits exactly');
  assert.equal(checkPlacement(form, placed, at(e, 'context-standard-portrait', 1, 4)), 'outside_grid', '1 + 8 > 8 columns');
  assert.equal(checkPlacement(form, placed, at(e, 'context-standard-portrait', -1, 4)), 'outside_grid');
  assert.equal(checkPlacement(form, placed, { ...at(e, 'context-standard-portrait', 0, 4), col: 0.5 }), 'outside_grid', 'cells only');
  // moving a placed tile: its own old cells do not block it
  assert.equal(checkPlacement(form, placed, { ...header, row: 1 }, 0), null);
  assert.equal(checkPlacement(form, placed, { ...header, row: 1 }), 'occupied:header-standard-portrait');
  // landscape: the 7-row standard context does not fit a 6-row band, it fits a 7-row one
  const ctx = at(e, 'context-standard-landscape', 0, 0);                // 8 x 7
  assert.equal(checkPlacement(gridForm('landscape', 20, 6), [], ctx), 'outside_grid');
  assert.equal(checkPlacement(gridForm('landscape', 20, 7), [], ctx), null);
  assert.equal(checkPlacement(gridForm('landscape', 20, 7), [ctx], { ...ctx, col: 7 }), 'occupied:context-standard-landscape');
  assert.equal(checkPlacement(gridForm('landscape', 20, 7), [ctx], { ...ctx, col: 8 }), null);
});

test('the composer never accepts what the node refuses (and the reverse): 400 random portrait layouts', async (t) => {
  const e = await shipped();
  const pool = panelTiles(e, 'portrait');
  const form = gridForm('portrait', 8, 40);
  let seed = 7;
  const rnd = (n) => { seed = (seed * 48271) % 2147483647; return seed % n; };   // Park-Miller, exact in doubles
  let accepted = 0;
  let refused = 0;
  const before = layoutChecks.runs;
  for (let n = 0; n < 400; n++) {
    const placed = [];
    let ok = true;
    for (let k = 0; k < 2; k++) {
      const t = pool[rnd(pool.length)];
      const cand = { tile: t.name, col: rnd(4) === 0 ? 1 : 0, row: rnd(30), size: t.size };   // 1 in 4 pokes past the width
      if (checkPlacement(form, placed, cand)) { ok = false; }
      placed.push(cand);
    }
    const verdict = layoutViolation(layoutBody('x', 'portrait', placed), e);
    assert.equal(ok, verdict === null, `composer ${ok ? 'accepts' : 'refuses'}, node says ${verdict}: ${JSON.stringify(placed.map(({ size, ...p }) => p))}`);
    if (ok) accepted++; else refused++;
  }
  assert.ok(layoutChecks.runs - before >= 400, 'the node check really ran');
  t.diagnostic(`${accepted} accepted, ${refused} refused, ${layoutChecks.runs - before} node checks`);
  assert.ok(accepted >= 20 && refused >= 20, `both branches ran: ${accepted} accepted, ${refused} refused`);
});

test('shrinking the grid is refused while a tile would fall off', async () => {
  const e = await shipped();
  const placed = [at(e, 'context-standard-portrait', 0, 4)];          // rows 4..10
  assert.equal(formFits(gridForm('portrait', 8, 10), placed), null);
  assert.equal(formFits(gridForm('portrait', 8, 9), placed), 'outside:context-standard-portrait');
  assert.equal(formFits(gridForm('portrait', 8, 9), []), null);
});

test('layout body: exactly {name, orientation, tiles:[{tile, col, row}]}, sorted top-left first, no size carried', () => {
  const body = layoutBody('My Strip', 'portrait', [
    { tile: 'b', col: 0, row: 6, size: { cols: 8, rows: 6 } },
    { tile: 'a', col: 0, row: 0, size: { cols: 8, rows: 6 } },
  ]);
  assert.deepEqual(body, { name: 'My Strip', orientation: 'portrait', tiles: [{ tile: 'a', col: 0, row: 0 }, { tile: 'b', col: 0, row: 6 }] });
  assert.deepEqual(Object.keys(body), CONTRACT.layoutFile.keys);
  for (const p of body.tiles) assert.deepEqual(Object.keys(p), CONTRACT.layoutFile.placementKeys);
  assert.equal(layoutBody('  padded  ', 'landscape', []).name, 'padded');
});

test('name → file slug is the node\'s slug; a name the node refuses gives an empty slug', () => {
  for (const n of ['Night Strip', 'My Layout 2', '  x  ', 'Ä-b_c', 'a'.repeat(64)]) assert.equal(nameSlug(n), layoutSlug(n), n);
  for (const n of ['', '   ', '../x', 'a/b', 'a\\b', '---', 'a'.repeat(65), 42]) assert.equal(nameSlug(n), '', String(n));
});

test('pointer to cell: floor by the unit', () => {
  assert.deepEqual(cellFromPoint(0, 0, 20), { col: 0, row: 0 });
  assert.deepEqual(cellFromPoint(19.9, 20, 20), { col: 0, row: 1 });
  assert.deepEqual(cellFromPoint(45, 67.5, 22.5), { col: 2, row: 3 });
  assert.deepEqual(cellFromPoint(-1, 5, 20), { col: -1, row: 0 });
});

test('the instructions for Claude Code are text: the new-tile command, the layout JSON, no second skill', () => {
  assert.equal(typeof INSTRUCTIONS, 'string');
  assert.match(INSTRUCTIONS, /npx aihud new-tile/);
  assert.match(INSTRUCTIONS, /\/new-tile/);
  assert.match(INSTRUCTIONS, /full tile/);
  assert.match(INSTRUCTIONS, /"orientation": "portrait"/);
  assert.match(INSTRUCTIONS, /\{ "tile": "[a-z-]+", "col": 0, "row": 0 \}/);
  assert.match(INSTRUCTIONS, /\/hud\?layout=/);
  assert.doesNotMatch(INSTRUCTIONS, /new-layout|layout skill/i);
  assert.deepEqual([tilesDir(null), tilesDir('/h/aihud/')], ['~/.aihud/tiles/', '/h/aihud/tiles/'], 'F6: the guide names the real aihud home');
});

// ── routes and the save path against a real node ───────────────────────────

test('GET /composer serves the page and its two files (fixed list); the page loads nothing from the network', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT, projects: s.projects, home: s.home });
  try {
    const get = (p) => fetch(`http://127.0.0.1:${PORT}${p}`);
    for (const [p, type] of [['/composer', /^text\/html/], ['/composer/', /^text\/html/], ['/composer/composer.js', /^text\/javascript/], ['/composer/composer.css', /^text\/css/]]) {
      const res = await get(p);
      assert.equal(res.status, 200, p);
      assert.match(res.headers.get('content-type'), type, p);
      await res.arrayBuffer();
    }
    const html = await (await get('/composer')).text();
    assert.match(html, /\/composer\/composer\.js/);
    assert.match(html, /\/hud\/hud\.css/, 'the design variables come from the HUD sheet (tiles/CONTRACT.md)');
    for (const p of ['/composer/index.html', '/composer/composer.test.js', '/composer/..%2Fnode%2Fstore.js', '/composer/x.js']) {
      const res = await get(p);
      assert.equal(res.status, 404, p);
      await res.arrayBuffer();
    }
    assert.ok((await (await get('/')).json()).endpoints.includes('GET /composer'));
    for (const f of ['index.html', 'composer.js', 'composer.css']) {
      const text = readFileSync(join(HERE, f), 'utf8');
      assert.doesNotMatch(text, /https?:\/\//, `${f} names no network address`);
      assert.doesNotMatch(text, /@import|<link[^>]+\/\/|src=["']\/\//, `${f} loads nothing from elsewhere`);
    }
  } finally {
    await node.close();
    s.done();
  }
});

test('save: the composer\'s body over POST /layouts lands in <home>/layouts/<slug>.json, lists first, loads by name; a collision is refused, nothing written', async () => {
  const s = sandbox();
  const node = await createNode({ port: PORT_2, projects: s.projects, home: s.home });
  const base = `http://127.0.0.1:${PORT_2}`;
  try {
    const e = (await (await fetch(`${base}/catalog`)).json()).entries;
    const placed = [at(e, 'header-standard-portrait', 0, 0), at(e, 'context-minimal-portrait', 0, 2)];
    const before = tree(s.base);
    const runs = layoutChecks.runs;
    const res = await saveLayout(fetch, base, layoutBody('Night Strip', 'portrait', placed));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.deepEqual(res.json, { slug: 'night-strip', path: join(s.home, 'layouts', 'night-strip.json'), replaced: false });
    assert.ok(layoutChecks.runs > runs, 'the node checked the layout');
    assert.deepEqual(tree(s.base), [...before, 'home/layouts/night-strip.json'].sort());
    const stored = JSON.parse(readFileSync(join(s.home, 'layouts', 'night-strip.json'), 'utf8'));
    assert.deepEqual(stored, { name: 'Night Strip', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }, { tile: 'context-minimal-portrait', col: 0, row: 2 }] });
    const layouts = (await (await fetch(`${base}/catalog`)).json()).entries.filter((x) => x.kind === 'layout');
    assert.equal(layouts[0].name, 'night-strip', 'the own layout is listed first');
    assert.equal(layouts[0].own, true);
    assert.deepEqual(await (await fetch(`${base}/layouts/night-strip`)).json(), stored);

    // the same name again replaces, and says so
    const again = await saveLayout(fetch, base, layoutBody('Night Strip', 'portrait', placed.slice(0, 1)));
    assert.equal(again.status, 201);
    assert.equal(again.json.replaced, true);

    // a collision the page would refuse is refused by the node too; nothing is written
    const mid = tree(s.base);
    const clash = await saveLayout(fetch, base, layoutBody('clash', 'portrait', [placed[0], { ...placed[1], row: 1 }]));
    assert.equal(clash.status, 400);
    assert.equal(clash.json.error, 'layout_invalid:tiles[1]:overlaps_tiles[0]');
    const edge = await saveLayout(fetch, base, layoutBody('edge', 'portrait', [{ ...placed[1], col: 1 }]));
    assert.equal(edge.status, 400);
    assert.match(edge.json.error, /^layout_invalid:tiles\[0\]:exceeds_width_1\+8>8$/);
    assert.deepEqual(tree(s.base), mid);
  } finally {
    await node.close();
    s.done();
  }
});

/** A fetch over raw node:http with a chosen Origin header — what a foreign page's browser sends. */
const fetchFrom = (origin) => (url, opt) => new Promise((ok, fail) => {
  const u = new URL(url);
  const r = http.request({ host: u.hostname, port: u.port, path: u.pathname, method: opt.method, agent: false, headers: { ...opt.headers, Origin: origin } }, (res) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { text += c; });
    res.on('end', () => ok({ status: res.statusCode, ok: res.statusCode < 300, json: async () => JSON.parse(text), text: async () => text }));
  });
  r.on('error', fail);
  r.end(opt.body);
});

test('fence: the composer\'s save path writes only inside the aihud home (realpath guard) and only for its own origin (403)', async () => {
  const s = sandbox();
  const outside = join(s.base, 'outside');
  mkdirSync(outside);
  symlinkSync(outside, join(s.home, 'layouts'), 'junction');   // 'junction' needs no privileges on Windows; ignored elsewhere
  const node = await createNode({ port: PORT_3, projects: s.projects, home: s.home });
  const base = `http://127.0.0.1:${PORT_3}`;
  try {
    const e = (await (await fetch(`${base}/catalog`)).json()).entries;
    const body = layoutBody('escape', 'portrait', [at(e, 'header-standard-portrait', 0, 0)]);
    const answered = []; // [error code, status] of every probe that was actually asserted

    const linked = await saveLayout(fetch, base, body);

    assert.equal(linked.status, 400);
    assert.equal(linked.json.error, 'target_outside_aihud_home');
    answered.push([linked.json.error, linked.status]);
    assert.deepEqual(readdirSync(outside), [], 'nothing landed behind the link');

    for (const origin of ['http://evil.example', `http://evil.example:${PORT_3}`, 'null', `http://localhost:${PORT_3 + 1}`]) {
      const foreign = await saveLayout(fetchFrom(origin), base, layoutBody('foreign', 'portrait', []));

      assert.equal(foreign.status, 403, origin);
      assert.equal(foreign.json.error, 'origin_not_allowed', origin);
      answered.push([foreign.json.error, foreign.status]);
    }
    const own = await saveLayout(fetchFrom(`http://localhost:${PORT_3}`), base, { ...body, name: 'own origin' });

    assert.equal(own.status, 400, 'own origin passes the origin guard and meets the realpath guard');
    assert.equal(own.json.error, 'target_outside_aihud_home');
    answered.push([own.json.error, own.status]);

    const traversal = await saveLayout(fetch, base, { ...body, name: '../escape' });

    assert.equal(traversal.status, 400);
    assert.equal(traversal.json.error, 'invalid_name');
    answered.push([traversal.json.error, traversal.status]);
    assert.deepEqual(readdirSync(outside), []);
    assert.equal(existsSync(join(s.base, 'escape.json')), false);
    assert.deepEqual(answered, [
      ['target_outside_aihud_home', 400],
      ['origin_not_allowed', 403], ['origin_not_allowed', 403], ['origin_not_allowed', 403], ['origin_not_allowed', 403],
      ['target_outside_aihud_home', 400],
      ['invalid_name', 400],
    ], 'all seven probes were asserted, each with its own refusal');
  } finally {
    await node.close();
    s.done();
  }
});

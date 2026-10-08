// The store of the node: settings, the two write ways, the catalog. No ports, temp folders only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import {
  Refusal, DEFAULT_SETTINGS, aihudHome, checkHome, isInside, writeInside, readSettings, writeSidecar,
  sidecarPath, writeLayout, layoutSlug, catalog, svgList, svgFile,
} from './store.js';
import { slugOf, sameSlug } from './server.js';
import { readSidecar } from '../reader/extras.js';

function sandbox() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-store-'));
  const home = join(base, 'home');
  mkdirSync(home);
  return { base, home, done: () => rmSync(base, { recursive: true, force: true }) };
}

/** Every file under `dir`, relative, sorted — the before/after picture of "nothing landed elsewhere". */
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

const refused = (fn, status, reason) => assert.throws(fn, (e) => e instanceof Refusal && e.status === status && (!reason || e.reason === reason));

test('aihud home: explicit option, then AIHUD_HOME, then ~/.aihud', () => {
  const before = process.env.AIHUD_HOME;
  try {
    process.env.AIHUD_HOME = join(tmpdir(), 'env-home');
    assert.equal(aihudHome(join(tmpdir(), 'opt-home')), join(tmpdir(), 'opt-home'));
    assert.equal(aihudHome(), join(tmpdir(), 'env-home'));
    delete process.env.AIHUD_HOME;
    assert.ok(aihudHome().endsWith(`${sep}.aihud`));
  } finally {
    if (before == null) delete process.env.AIHUD_HOME; else process.env.AIHUD_HOME = before;
  }
});

test('the write guard: nothing can be written outside the aihud home', () => {
  const s = sandbox();
  try {
    const escapes = [
      join(s.home, '..', 'escape.json'),
      join(s.home, '..', 'home-sibling', 'x.json'),
      join(s.base, '..', 'far.json'),
      s.home,
    ];
    let tried = 0;
    for (const target of escapes) {
      tried++;
      refused(() => writeInside(s.home, target, { x: 1 }), 400, 'target_outside_aihud_home');
    }
    assert.ok(tried >= 4, 'the guard was never exercised');
    assert.deepEqual(tree(s.base), [], 'a refused write left a file behind');
    // ids and names that would walk out are refused before any path is built
    for (const id of ['../x', '..\\x', 'a/b', '', 'x'.repeat(129)]) refused(() => sidecarPath(s.home, id), 400, 'invalid_session_id');
    for (const name of ['../x', 'a/b', 'a\\b', '..', '', '   ', '---']) refused(() => layoutSlug(name), 400, 'invalid_name');
    assert.equal(isInside(s.home, join(s.home, 'layouts', 'a.json')), true);
    assert.equal(isInside(s.home, join(s.home + 'x', 'a.json')), false, 'string-prefix sibling must not count as inside');
  } finally { s.done(); }
});

test('the write guard follows links: a link under the home pointing outside carries no write', (t) => {
  const s = sandbox();
  try {
    const outside = join(s.base, 'outside');
    mkdirSync(outside);
    try {
      symlinkSync(outside, join(s.home, 'layouts'), 'junction');   // 'junction' needs no privileges on Windows; ignored elsewhere
    } catch (e) {
      t.skip(`cannot create a directory link here: ${e.code || e.message}`);
      return;
    }
    refused(() => writeLayout(s.home, { name: 'x', orientation: 'portrait', tiles: [] }), 400, 'target_outside_aihud_home');
    refused(() => writeInside(s.home, join(s.home, 'layouts', 'deep', 'x.json'), {}), 400, 'target_outside_aihud_home');
    assert.deepEqual(readdirSync(outside), [], 'a write went through the link');
    // the same home without the link still writes
    assert.equal(writeSidecar(s.home, 'abc', { closed: true }).closed, true);
  } finally { s.done(); }
});

test('an aihud home inside a .claude folder or the transcript folder is refused', () => {
  const s = sandbox();
  try {
    const projects = join(s.base, 'projects');
    refused(() => checkHome(join(s.base, '.claude', 'aihud')), 400, 'aihud_home_inside_a_claude_folder');
    refused(() => checkHome(join(s.base, '.Claude')), 400, 'aihud_home_inside_a_claude_folder');
    refused(() => checkHome(join(projects, 'x'), { projects }), 400, 'aihud_home_inside_the_transcript_folder');
    refused(() => checkHome(projects, { projects }), 400, 'aihud_home_inside_the_transcript_folder');
    assert.ok(checkHome(s.home, { projects }));
    assert.ok(checkHome(join(s.base, 'claude-notes'), { projects }), 'only the exact .claude segment counts');
  } finally { s.done(); }
});

test('sidecar: merges the four keys, rejects every other key and wrong types', () => {
  const s = sandbox();
  try {
    const id = 'abc-123';
    assert.equal(readSidecar(id, { aihudHome: s.home, withText: true }), null);
    assert.deepEqual(writeSidecar(s.home, id, { title: 'first' }), { title: 'first' });
    const merged = writeSidecar(s.home, id, { closed: true, closed_at: '2026-09-30T20:00:00.000Z', note: 'n' });
    assert.deepEqual(merged, { title: 'first', closed: true, closed_at: '2026-09-30T20:00:00.000Z', note: 'n' });
    assert.deepEqual(JSON.parse(readFileSync(join(s.home, 'sessions', `${id}.json`), 'utf8')), merged);
    refused(() => writeSidecar(s.home, id, { title: 'x', color: 'red' }), 400, 'unknown_keys:color');
    refused(() => writeSidecar(s.home, id, { closed: 'yes' }), 400, 'invalid_closed');
    refused(() => writeSidecar(s.home, id, { closed_at: 'yesterday' }), 400, 'invalid_closed_at');
    refused(() => writeSidecar(s.home, id, { title: 7 }), 400, 'invalid_title');
    refused(() => writeSidecar(s.home, id, []), 400, 'body_not_an_object');
    assert.deepEqual(readSidecar(id, { aihudHome: s.home, withText: true }), merged, 'a refused patch changed the file');
    // a broken sidecar is never overwritten silently
    writeFileSync(join(s.home, 'sessions', 'broken.json'), '{nope');
    refused(() => writeSidecar(s.home, 'broken', { closed: true }), 500, 'sidecar_unreadable');
    assert.equal(readFileSync(join(s.home, 'sessions', 'broken.json'), 'utf8'), '{nope');
  } finally { s.done(); }
});

test('layout: three top-level keys, stored as given under <home>/layouts/<slug>.json and nowhere else', () => {
  const s = sandbox();
  try {
    const before = tree(s.base);
    // A4a-R: the body must pass the layout schema, so the tile it names comes from a catalog
    const cat = [{ kind: 'tile', name: 'x', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 2 }] } }];
    const body = { name: 'My Strip 2', orientation: 'portrait', tiles: [{ tile: 'x', col: 0, row: 0 }] };
    const saved = writeLayout(s.home, body, cat);
    assert.equal(saved.slug, 'my-strip-2');
    assert.equal(saved.replaced, false);
    assert.equal(saved.path, join(s.home, 'layouts', 'my-strip-2.json'));
    assert.deepEqual(JSON.parse(readFileSync(saved.path, 'utf8')), body);
    assert.deepEqual(tree(s.base), [...before, 'home/layouts/my-strip-2.json'].sort());
    assert.equal(writeLayout(s.home, body, cat).replaced, true);
    refused(() => writeLayout(s.home, { name: 'a', orientation: 'portrait' }), 400, 'missing_keys:tiles');
    refused(() => writeLayout(s.home, { ...body, extra: 1 }), 400, 'unknown_keys:extra');
    refused(() => writeLayout(s.home, { ...body, orientation: 'diagonal' }), 400, 'invalid_orientation');
    refused(() => writeLayout(s.home, { ...body, tiles: {} }), 400, 'invalid_tiles');
    refused(() => writeLayout(s.home, { ...body, name: '../../evil' }), 400, 'invalid_name');
    assert.deepEqual(tree(s.base), [...before, 'home/layouts/my-strip-2.json'].sort());
  } finally { s.done(); }
});

test('settings: defaults when missing, merged when present, loud when broken', () => {
  const s = sandbox();
  try {
    assert.deepEqual(readSettings(s.home), DEFAULT_SETTINGS);
    writeFileSync(join(s.home, 'settings.json'), JSON.stringify({ port: 4399, theme: 'dark' }));
    assert.deepEqual(readSettings(s.home), { port: 4399, layout_portrait: 'essentials-portrait', layout_landscape: 'essentials-landscape', landscape_ratio: 1, unit_max: 22.5, theme: 'dark' });
    writeFileSync(join(s.home, 'settings.json'), '{');
    refused(() => readSettings(s.home), 500, 'settings_json_unreadable');
  } finally { s.done(); }
});

test('catalog: shipped and own tiles/layouts, own first, only real tiles (render + meta)', async () => {
  const s = sandbox();
  try {
    const pkg = join(s.base, 'pkg');
    for (const d of [join(pkg, 'tiles'), join(pkg, 'layouts'), join(s.home, 'tiles'), join(s.home, 'layouts')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(pkg, 'tiles', 'number.js'), "export const meta = { name: 'number', orientation: 'portrait', sizes: [[2, 1]], contractVersion: '1.0' };\nexport function render() {}\n");
    writeFileSync(join(pkg, 'tiles', 'number.test.js'), 'export {};\n');
    writeFileSync(join(pkg, 'tiles', 'contract.json'), '{}');
    // a command module next to the tiles: exports functions and a plain object, but no render/meta pair
    writeFileSync(join(pkg, 'tiles', 'cli.js'), "export const OPTIONS = { orientation: 'portrait', sizes: [] };\nexport function main() { return 0; }\n");
    writeFileSync(join(pkg, 'tiles', 'half.js'), "export const meta = { name: 'half' };\n");
    writeFileSync(join(pkg, 'layouts', 'default.json'), JSON.stringify({ name: 'default', orientation: 'landscape', tiles: [] }));
    writeFileSync(join(s.home, 'tiles', 'mine.js'), "export const meta = { orientation: 'landscape' };\nexport const render = () => {};\n");
    writeFileSync(join(s.home, 'tiles', 'broken.js'), 'export const = ;\n');
    writeFileSync(join(s.home, 'layouts', 'mine.json'), JSON.stringify({ name: 'mine', orientation: 'portrait', tiles: [] }));
    const entries = await catalog(s.home, { packageDir: pkg });
    assert.deepEqual(entries.map((e) => `${e.own ? 'own' : 'pkg'}:${e.kind}:${e.name}`), [
      'own:tile:broken', 'own:tile:mine', 'own:layout:mine', 'pkg:tile:number', 'pkg:layout:default',
    ]);
    const byKey = Object.fromEntries(entries.map((e) => [`${e.own}:${e.kind}:${e.name}`, e]));
    assert.deepEqual(byKey['false:tile:number'].meta, { name: 'number', orientation: 'portrait', sizes: [[2, 1]], contractVersion: '1.0' });
    assert.deepEqual(byKey['true:tile:mine'].meta, { orientation: 'landscape' });
    assert.equal(byKey['true:tile:broken'].loadable, false);
    assert.equal(typeof byKey['true:tile:broken'].error, 'string');
    assert.deepEqual(byKey['true:layout:mine'].meta, { orientation: 'portrait' });
    assert.equal(byKey['true:layout:mine'].path, join(s.home, 'layouts', 'mine.json'));
    // an empty catalog is a valid answer (no tiles shipped yet)
    assert.deepEqual(await catalog(join(s.base, 'nothing'), { packageDir: join(s.base, 'nothing') }), []);
  } finally { s.done(); }
});

test('catalog: every entry carries its file time mtime_ms (read-only) — the window and the composer order own entries newest first by it', async () => {
  const s = sandbox();
  try {
    const pkg = join(s.base, 'pkg');
    for (const d of [join(pkg, 'tiles'), join(pkg, 'layouts'), join(s.home, 'tiles'), join(s.home, 'layouts')]) mkdirSync(d, { recursive: true });
    writeFileSync(join(pkg, 'layouts', 'standard-portrait.json'), JSON.stringify({ name: 'standard portrait', orientation: 'portrait', tiles: [] }));
    writeFileSync(join(s.home, 'tiles', 'mine.js'), "export const meta = { orientation: 'portrait' };\nexport const render = () => {};\n");
    for (const [name, sec] of [['older', 1_700_000_000], ['newer', 1_800_000_000]]) {
      const f = join(s.home, 'layouts', `${name}.json`);
      writeFileSync(f, JSON.stringify({ name, orientation: 'portrait', tiles: [] }));
      utimesSync(f, sec, sec);
    }
    const entries = await catalog(s.home, { packageDir: pkg });
    assert.equal(entries.length, 4, `trip-wire: ${entries.map((e) => e.name)}`);
    for (const e of entries) assert.equal(e.mtime_ms, statSync(e.path).mtimeMs, `${e.kind} ${e.name}: mtime_ms = the file's mtime`);
    const byName = Object.fromEntries(entries.map((e) => [e.name, e]));
    assert.ok(byName.newer.mtime_ms > byName.older.mtime_ms);
    assert.equal(byName.newer.mtime_ms, 1_800_000_000_000);
  } finally { s.done(); }
});

test('catalog of the real package: the shipped example tiles are in, every shipped tile loadable, never tiles/cli.js', async () => {
  const s = sandbox();
  try {
    const entries = await catalog(s.home);
    const tiles = entries.filter((e) => e.kind === 'tile');
    const names = tiles.map((e) => e.name);
    assert.ok(names.includes('example-number') && names.includes('example-number-landscape'), `examples present: ${names.join(',')}`);
    assert.ok(!names.includes('cli'), 'tiles/cli.js is never a tile');
    for (const t of tiles) { assert.equal(t.own, false, `${t.name} shipped`); assert.equal(t.loadable, true, `${t.name} loadable`); assert.equal(t.meta.name, t.name, `${t.name} meta.name = file name`); }
    assert.ok(tiles.length >= 2, `trip-wire: ${tiles.length} tiles`);
  } finally { s.done(); }
});

test('svg folder: shipped and own symbols, own shadows shipped, names never joined blind', () => {
  const s = sandbox();
  try {
    const pkg = join(s.base, 'pkg');
    mkdirSync(join(pkg, 'svg'), { recursive: true });
    mkdirSync(join(s.home, 'svg'));
    writeFileSync(join(pkg, 'svg', 'main.svg'), '<svg id="pkg"/>');
    writeFileSync(join(pkg, 'svg', 'agent.svg'), '<svg id="agent"/>');
    writeFileSync(join(s.home, 'svg', 'main.svg'), '<svg id="own"/>');
    const list = svgList(s.home, { packageDir: pkg });
    assert.deepEqual(list.map((x) => `${x.own}:${x.name}`), ['true:main.svg', 'false:agent.svg']);
    assert.equal(String(svgFile(s.home, 'main.svg', { packageDir: pkg })), '<svg id="own"/>');
    assert.equal(svgFile(s.home, '../pkg/svg/agent.svg', { packageDir: pkg }), null);
    assert.equal(svgFile(s.home, 'missing.svg', { packageDir: pkg }), null);
  } finally { s.done(); }
});

test('slug of the start folder matches the transcript folder, drive letter case-insensitive', () => {
  assert.equal(slugOf('C:\\dev\\sample-app'), 'C--dev-sample-app');
  assert.equal(slugOf('/home/u/my.app'), '-home-u-my-app');
  assert.equal(sameSlug('C--dev-sample-app', 'c--dev-sample-app'), true);
  assert.equal(sameSlug('C--dev-Sample-app', 'c--dev-sample-app'), false, 'only the drive letter is case-insensitive');
  assert.equal(sameSlug('-home-u-x', '-home-u-x'), true);
});

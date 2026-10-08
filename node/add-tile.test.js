// `aihud add-tile <id>`: temp homes only, never the package's layouts/ and never ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './cli.js';
import { PACKAGE_DIR } from './store.js';

function home() {
  const base = mkdtempSync(join(tmpdir(), 'aihud-addtile-'));
  const h = join(base, 'home');
  mkdirSync(h);
  return { h, done: () => rmSync(base, { recursive: true, force: true }) };
}
async function run(args) {
  const out = []; const err = [];
  const code = await main(['add-tile', ...args], { log: (s) => out.push(String(s)), err: (s) => err.push(String(s)) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const shipped = (n) => json(join(PACKAGE_DIR, 'layouts', `${n}.json`));

test('shipped default portrait: copied to my-portrait, setting points at it, package untouched', async () => {
  const s = home();
  try {
    const before = JSON.stringify(shipped('essentials-portrait'));
    const r = await run(['example-number', '--home', s.h, '--orientation', 'portrait']);
    assert.equal(r.code, 0, r.err);
    const copy = json(join(s.h, 'layouts', 'my-portrait.json'));
    const added = copy.tiles.find((p) => p.tile === 'example-number');
    // portrait goes to the very top; the old row-0 tile moves down by the new tile's 6 rows
    assert.deepEqual(added, { tile: 'example-number', col: 0, row: 0 });
    const orig = shipped('essentials-portrait').tiles;
    const moved = copy.tiles.find((p) => p.tile === orig[0].tile);
    assert.equal(orig[0].row, 0);
    assert.equal(moved.row, 6);
    for (const o of orig) assert.equal(copy.tiles.find((p) => p.tile === o.tile).row, o.row + 6);
    assert.equal(copy.tiles.length, orig.length + 1);
    assert.match(r.out, /at the very top, above the header/);
    assert.doesNotMatch(r.out, /note:/, 'example-number has a landscape twin: no note');
    assert.equal(json(join(s.h, 'settings.json')).layout_portrait, 'my-portrait');
    assert.equal(JSON.stringify(shipped('essentials-portrait')), before);
    assert.match(r.out, /my-portrait/);
    assert.match(r.out, /undo/i);
  } finally { s.done(); }
});

test('both orientations (default): portrait tile goes to portrait, its landscape twin to landscape', async () => {
  const s = home();
  try {
    const r = await run(['example-number', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.ok(existsSync(join(s.h, 'layouts', 'my-portrait.json')));
    const land = json(join(s.h, 'layouts', 'my-landscape.json'));
    const added = land.tiles.find((p) => p.tile === 'example-number-landscape');
    assert.ok(added, 'twin placed');
    assert.equal(added.row, 0);
    const set = json(join(s.h, 'settings.json'));
    assert.equal(set.layout_landscape, 'my-landscape');
    assert.equal(set.layout_portrait, 'my-portrait');
  } finally { s.done(); }
});

test('home layout is edited in place, idempotent on the second call', async () => {
  const s = home();
  try {
    mkdirSync(join(s.h, 'layouts'));
    writeFileSync(join(s.h, 'layouts', 'mine.json'), JSON.stringify({ name: 'mine', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] }));
    writeFileSync(join(s.h, 'settings.json'), JSON.stringify({ layout_portrait: 'mine' }));
    const r1 = await run(['example-number', '--home', s.h, '--orientation', 'portrait']);
    assert.equal(r1.code, 0, r1.err);
    const l = json(join(s.h, 'layouts', 'mine.json'));
    assert.equal(l.tiles.length, 2);
    assert.deepEqual(l.tiles[0], { tile: 'example-number', col: 0, row: 0 });
    assert.deepEqual(l.tiles[1], { tile: 'header-standard-portrait', col: 0, row: 6 });
    assert.deepEqual(readdirSync(join(s.h, 'layouts')), ['mine.json']);
    const r2 = await run(['example-number', '--home', s.h, '--orientation', 'portrait']);
    assert.equal(r2.code, 0);
    assert.match(r2.out, /already in layout/);
    assert.equal(json(join(s.h, 'layouts', 'mine.json')).tiles.length, 2);
  } finally { s.done(); }
});

test('unknown tile id: exit 1, nothing written', async () => {
  const s = home();
  try {
    const r = await run(['no-such-tile', '--home', s.h]);
    assert.equal(r.code, 1);
    assert.match(r.err, /no-such-tile/);
    assert.deepEqual(readdirSync(s.h), []);
  } finally { s.done(); }
});

test('a layout violation writes nothing', async () => {
  const s = home();
  try {
    mkdirSync(join(s.h, 'layouts'));
    const bad = { name: 'bad', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }, { tile: 'header-standard-portrait', col: 0, row: 0 }] };
    writeFileSync(join(s.h, 'layouts', 'bad.json'), JSON.stringify(bad));
    writeFileSync(join(s.h, 'settings.json'), JSON.stringify({ layout_portrait: 'bad' }));
    const r = await run(['example-number', '--home', s.h, '--orientation', 'portrait']);
    assert.equal(r.code, 1);
    assert.match(r.err, /overlaps/);
    assert.deepEqual(json(join(s.h, 'layouts', 'bad.json')), bad);
  } finally { s.done(); }
});

test('own portrait layout WITH a form: form.rows grows by the new tile, everything shifts down', async () => {
  const s = home();
  try {
    mkdirSync(join(s.h, 'layouts'));
    writeFileSync(join(s.h, 'layouts', 'mine.json'), JSON.stringify({ name: 'mine', orientation: 'portrait', form: { cols: 8, rows: 10 }, tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] }));
    writeFileSync(join(s.h, 'settings.json'), JSON.stringify({ layout_portrait: 'mine' }));
    const r = await run(['example-number', '--home', s.h, '--orientation', 'portrait']);
    assert.equal(r.code, 0, r.err);
    const l = json(join(s.h, 'layouts', 'mine.json'));
    assert.equal(l.form.rows, 16);
    assert.deepEqual(l.tiles[0], { tile: 'example-number', col: 0, row: 0 });
    assert.equal(l.tiles[1].row, 6);
  } finally { s.done(); }
});

test('shifting beyond the form maximum is refused, nothing written', async () => {
  const s = home();
  try {
    mkdirSync(join(s.h, 'layouts'));
    const full = { name: 'full', orientation: 'portrait', form: { cols: 8, rows: 58 }, tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] };
    writeFileSync(join(s.h, 'layouts', 'full.json'), JSON.stringify(full));
    writeFileSync(join(s.h, 'settings.json'), JSON.stringify({ layout_portrait: 'full' }));
    const r = await run(['example-number', '--home', s.h, '--orientation', 'portrait']);
    assert.equal(r.code, 1);
    assert.match(r.err, /exceeds_max/);
    assert.deepEqual(json(join(s.h, 'layouts', 'full.json')), full);
  } finally { s.done(); }
});

test('twin rule: a portrait-only tile prints ONE note (also with --orientation portrait); a tile with a twin prints none', async () => {
  const s = home();
  try {
    for (const args of [[], ['--orientation', 'portrait']]) {
      const h = join(s.h, `h${args.length}`);
      mkdirSync(join(h, 'tiles'), { recursive: true });
      writeFileSync(join(h, 'tiles', 'solo-note.js'), readFileSync(join(PACKAGE_DIR, 'tiles', 'example-number.js'), 'utf8').replace(/example-number/g, 'solo-note'));
      const r = await run(['solo-note', '--home', h, ...args]);
      assert.equal(r.code, 0, r.err);
      assert.equal(r.out.split('\n').filter((l) => l.startsWith('note:')).length, 1);
      assert.match(r.out, /note: no landscape twin "solo-note-landscape"/);
      assert.match(r.out, /at the very top/);
    }
    const t = await run(['example-number', '--home', join(s.h, 'h0'), '--orientation', 'portrait']);
    assert.doesNotMatch(t.out, /note:/);
  } finally { s.done(); }
});

test('bad --orientation and a missing id are usage errors', async () => {
  const s = home();
  try {
    assert.equal((await run(['example-number', '--home', s.h, '--orientation', 'tilted'])).code, 2);
    assert.equal((await run(['--home', s.h])).code, 2);
  } finally { s.done(); }
});

test('a --home inside a .claude folder is refused, nothing written', async () => {
  const s = home();
  try {
    const h = join(s.h, '.claude', 'aihud');
    const r = await run(['example-number', '--home', h]);
    assert.equal(r.code, 1);
    assert.match(r.err, /aihud_home_inside/);
    assert.equal(existsSync(h), false);
    assert.equal(existsSync(join(s.h, '.claude')), false);
  } finally { s.done(); }
});

// The layout schema (`layout-schema.js`) on its own, the store refusing what it refuses, and the
// shipped layouts passing it against the real catalog. Temp folders only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layoutViolation, layoutChecks, tileSize, LAYOUT_FILE } from './layout-schema.js';
import { Refusal, writeLayout, catalog, PACKAGE_DIR } from './store.js';

const CAT = [
  { kind: 'tile', name: 'wide', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }] } },
  { kind: 'tile', name: 'small', own: false, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 2, rows: 2 }] } },
  { kind: 'tile', name: 'band', own: false, loadable: true, meta: { orientation: 'landscape', sizes: [{ cols: 8, rows: 6 }] } },
  { kind: 'tile', name: 'tall', own: false, loadable: true, meta: { orientation: 'landscape', sizes: [{ cols: 7, rows: 7 }] } },
  { kind: 'tile', name: 'chip', own: false, loadable: true, meta: { orientation: 'landscape', sizes: [{ cols: 2, rows: 2 }] } },
  { kind: 'tile', name: 'broken', own: true, loadable: false, error: 'SyntaxError' },
  { kind: 'tile', name: 'sizeless', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [[2, 1]] } },
  { kind: 'tile', name: 'unsure', own: true, loadable: true, meta: { sizes: [{ cols: 2, rows: 2 }] } },
  { kind: 'layout', name: 'small', own: true, loadable: true },
];
const P = (tiles, orientation = 'portrait') => ({ name: 'n', orientation, tiles });

test('valid layouts pass: portrait fills 8 columns, landscape up to the 7-row band, touching is not overlapping', () => {
  assert.equal(layoutViolation(P([]), CAT), null);
  assert.equal(layoutViolation(P([{ tile: 'wide', col: 0, row: 0 }, { tile: 'wide', col: 0, row: 6 }, { tile: 'small', col: 6, row: 12 }]), CAT), null);
  assert.equal(layoutViolation(P([{ tile: 'band', col: 0, row: 0 }, { tile: 'tall', col: 8, row: 0 }, { tile: 'chip', col: 100, row: 5 }], 'landscape'), CAT), null);
});

test('every violation is refused with its path, the first one wins', () => {
  const cases = [
    [null, '$:not_an_object'],
    [{ ...P([]), style: 'x' }, 'style:unknown_key'],
    [{ name: 'n', orientation: 'portrait' }, 'tiles:missing'],
    [{ ...P([]), name: '  ' }, 'name:not_a_non_empty_string'],
    [{ ...P([]), orientation: 'box' }, 'orientation:not_one_of_portrait|landscape'],
    [{ ...P([]), tiles: {} }, 'tiles:not_an_array'],
    [P(['wide']), 'tiles[0]:not_an_object'],
    [P([{ tile: 'wide', col: 0, row: 0, stretch: true }]), 'tiles[0].stretch:unknown_key'],
    [P([{ tile: '', col: 0, row: 0 }]), 'tiles[0].tile:not_a_non_empty_string'],
    [P([{ tile: 'wide', col: -1, row: 0 }]), 'tiles[0].col:not_an_integer_>=_0'],
    [P([{ tile: 'wide', col: 0, row: 1.5 }]), 'tiles[0].row:not_an_integer_>=_0'],
    [P([{ tile: 'wide', col: 0, row: 0 }, { tile: 'nope', col: 0, row: 6 }]), 'tiles[1].tile:unknown_tile_nope'],
    [P([{ tile: 'broken', col: 0, row: 0 }]), 'tiles[0].tile:tile_not_loadable_broken'],
    [P([{ tile: 'sizeless', col: 0, row: 0 }]), 'tiles[0].tile:tile_without_size_sizeless'],
    [P([{ tile: 'band', col: 0, row: 0 }]), 'tiles[0].tile:orientation_mismatch'],
    [P([{ tile: 'wide', col: 0, row: 0 }], 'landscape'), 'tiles[0].tile:orientation_mismatch'],
    [P([{ tile: 'unsure', col: 0, row: 0 }]), 'tiles[0].tile:orientation_mismatch'],
    [P([{ tile: 'wide', col: 1, row: 0 }]), 'tiles[0]:exceeds_width_1+8>8'],
    [P([{ tile: 'tall', col: 0, row: 1 }], 'landscape'), 'tiles[0]:exceeds_band_1+7>7'],
    [P([{ tile: 'wide', col: 0, row: 0 }, { tile: 'small', col: 6, row: 5 }]), 'tiles[1]:overlaps_tiles[0]'],
    [P([{ tile: 'small', col: 0, row: 0 }, { tile: 'small', col: 2, row: 0 }, { tile: 'small', col: 3, row: 1 }]), 'tiles[2]:overlaps_tiles[1]'],
  ];
  for (const [body, want] of cases) assert.equal(layoutViolation(body, CAT), want, JSON.stringify(body));
  assert.equal(layoutViolation(P([{ tile: 'small', col: 0, row: 0 }]), CAT.filter((e) => e.kind === 'layout')), 'tiles[0].tile:unknown_tile_small',
    'a layout entry of the same name is not a tile');
});

test('the store refuses what the schema refuses and writes nothing; the check really runs', () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-schema-'));
  const home = join(base, 'home');
  mkdirSync(home);
  try {
    const runs = layoutChecks.runs;
    assert.throws(() => writeLayout(home, P([{ tile: 'nope', col: 0, row: 0 }]), CAT),
      (e) => e instanceof Refusal && e.status === 400 && e.reason === 'layout_invalid:tiles[0].tile:unknown_tile_nope');
    assert.throws(() => writeLayout(home, P([{ tile: 'wide', col: 0, row: 0 }])),
      (e) => e.reason === 'layout_invalid:tiles[0].tile:unknown_tile_wide', 'without a catalog every tile is unknown');
    assert.deepEqual(readdirSync(home), []);
    assert.ok(layoutChecks.runs >= runs + 2, `the schema check ran ${layoutChecks.runs - runs} times`);
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('the shipped layouts pass the schema against the real catalog; the probe pair is in, at least one per orientation', async () => {
  const base = mkdtempSync(join(tmpdir(), 'aihud-schema-'));
  try {
    const entries = await catalog(join(base, 'home'));
    const layouts = entries.filter((e) => e.kind === 'layout');
    const tags = layouts.map((e) => `${e.own}:${e.name}:${e.meta.orientation}`);
    assert.ok(tags.includes('false:probe-landscape:landscape') && tags.includes('false:probe-portrait:portrait'), `probe pair present: ${tags.join(', ')}`);
    assert.ok(layouts.every((e) => e.own === false), 'all shipped');
    for (const o of ['portrait', 'landscape']) assert.ok(layouts.some((e) => e.meta.orientation === o), `one per orientation: ${o}`);
    for (const e of layouts) {
      const body = JSON.parse(readFileSync(e.path, 'utf8'));
      assert.equal(layoutViolation(body, entries), null, e.name);
      assert.ok(body.tiles.length >= 1, `${e.name} places no tile`);
      if (e.name.startsWith('probe-')) assert.ok(body.tiles.every((p) => p.tile === (body.orientation === 'portrait' ? 'example-number' : 'example-number-landscape')), 'probe layouts use the example tile (or its landscape twin) only');
      assert.equal(e.path, join(PACKAGE_DIR, 'layouts', `${e.name}.json`));
    }
    assert.deepEqual(LAYOUT_FILE.keys, ['name', 'orientation', 'tiles']);
    assert.deepEqual(tileSize(entries.find((e) => e.name === 'example-number').meta), { cols: 8, rows: 6 });
  } finally { rmSync(base, { recursive: true, force: true }); }
});

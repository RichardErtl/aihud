// The saved grid form: a layout file may carry `form: {cols, rows}` so free space at the end survives
// Save (schema · composer · HUD · window card). Files without `form` behave as ever (the extent).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { layoutViolation } from '../node/layout-schema.js';
import { writeLayout } from '../node/store.js';
import * as composer from '../composer/composer.js';
import * as hud from '../hud/hud.js';
import { layoutThumb } from '../window/window.js';

const CAT = [
  { kind: 'tile', name: 'wide', own: true, loadable: true, meta: { orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }] } },
  { kind: 'tile', name: 'band', own: false, loadable: true, meta: { orientation: 'landscape', sizes: [{ cols: 8, rows: 6 }] } },
];
const P = (extra = {}, tiles = [{ tile: 'wide', col: 0, row: 0 }]) => ({ name: 'n', orientation: 'portrait', tiles, ...extra });
const L = (extra = {}) => ({ name: 'n', orientation: 'landscape', tiles: [{ tile: 'band', col: 0, row: 0 }], ...extra });

test('schema: a valid form passes, trailing space allowed, form optional', () => {
  assert.equal(layoutViolation(P({ form: { cols: 8, rows: 10 } }), CAT), null);
  assert.equal(layoutViolation(P({ form: { cols: 8, rows: 6 } }), CAT), null, 'tight form');
  assert.equal(layoutViolation(L({ form: { cols: 30, rows: 7 } }), CAT), null);
  assert.equal(layoutViolation(P(), CAT), null);
});

test('schema: bad forms are refused in the existing path:reason style', () => {
  const cases = [
    [P({ form: { cols: 6, rows: 10 } }), 'form.cols:portrait_cols_must_be_8'],
    [P({ form: { cols: 8, rows: 5 } }), 'tiles[0]:outside_form_8x6>8x5'],
    [L({ form: { cols: 7, rows: 6 } }), 'tiles[0]:outside_form_8x6>7x6'],
    [L({ form: { cols: 30, rows: 8 } }), 'form.rows:exceeds_band_8>7'],
    [P({ form: { cols: 8, rows: 10, gap: 1 } }), 'form.gap:unknown_key'],
    [P({ form: { cols: 8 } }), 'form.rows:missing'],
    [P({ form: { cols: 8, rows: 0 } }), 'form.rows:not_an_integer_>=_1'],
    [P({ form: { cols: 8, rows: 1.5 } }), 'form.rows:not_an_integer_>=_1'],
    [P({ form: { cols: 8, rows: 61 } }), 'form.rows:exceeds_max_61>60'],
    [L({ form: { cols: 121, rows: 7 } }), 'form.cols:exceeds_max_121>120'],
    [P({ form: [8, 10] }), 'form:not_an_object'],
    [P({ form: null }), 'form:not_an_object'],
  ];
  for (const [body, want] of cases) assert.equal(layoutViolation(body, CAT), want);
});

test('node: POST /layouts body without form is stored byte-identical; with form it is stored and read back', () => {
  const home = mkdtempSync(join(tmpdir(), 'aihud-form-'));
  try {
    const plain = P();
    const a = writeLayout(home, plain, CAT);
    assert.equal(readFileSync(a.path, 'utf8'), JSON.stringify(plain, null, 2) + '\n', 'format of a no-form file unchanged');
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(a.path, 'utf8'))), ['name', 'orientation', 'tiles']);
    const withForm = { ...P({ form: { cols: 8, rows: 10 } }), name: 'formed' };
    const b = writeLayout(home, withForm, CAT);
    assert.deepEqual(JSON.parse(readFileSync(b.path, 'utf8')).form, { cols: 8, rows: 10 });
    assert.throws(() => writeLayout(home, { ...withForm, name: 'bad', form: { cols: 8, rows: 2 } }, CAT), /layout_invalid:tiles\[0\]:outside_form/);
  } finally { rmSync(home, { recursive: true, force: true }); }
});

test('composer: layoutBody carries the form, load restores it, a file without form falls back to the extent', () => {
  const placed = [{ tile: 'wide', col: 0, row: 0, size: { cols: 8, rows: 6 } }];
  const form = composer.gridForm('portrait', 8, 10);
  const body = composer.layoutBody('x', 'portrait', placed, form);
  assert.deepEqual(body.form, { cols: 8, rows: 10 });
  assert.deepEqual(Object.keys(body), ['name', 'orientation', 'tiles', 'form']);
  assert.equal('form' in composer.layoutBody('x', 'portrait', placed), false, 'no form given, none written');
  assert.equal(layoutViolation(body, CAT), null);
  const entries = CAT;
  assert.deepEqual(composer.gridFromLayout(body, entries).form, { cols: 8, rows: 10 }, 'round trip');
  assert.deepEqual(composer.gridFromLayout({ ...body, form: undefined }, entries).form, { cols: 8, rows: 6 }, 'extent fallback');
  const land = composer.layoutBody('l', 'landscape', [{ tile: 'band', col: 0, row: 0, size: { cols: 8, rows: 6 } }], composer.gridForm('landscape', 20, 7));
  assert.deepEqual(composer.gridFromLayout(land, entries).form, { cols: 20, rows: 7 });
  const chip = { kind: 'tile', name: 'chip', loadable: true, meta: { orientation: 'landscape', sizes: [{ cols: 2, rows: 2 }] } };
  const low = { name: 'low', orientation: 'landscape', tiles: [{ tile: 'chip', col: 0, row: 0 }], form: { cols: 20, rows: 5 } };
  assert.equal(layoutViolation(low, [...CAT, chip]), null);
  assert.deepEqual(composer.gridFromLayout(low, [...entries, chip]).form, { cols: 20, rows: 5 }, 'landscape rows below 6 restored exactly');
  assert.deepEqual(composer.gridFromLayout({ ...body, form: { cols: 8, rows: 2 } }, entries).form, { cols: 8, rows: 6 }, 'never smaller than the tiles');
});

test('hud: grid dims = extent without form, widened by the form with one', () => {
  const ext = { cols: 8, rows: 6 };
  assert.deepEqual(hud.gridDims('portrait', ext, null), { cols: 8, rows: 6 });
  assert.deepEqual(hud.gridDims('portrait', ext, { cols: 8, rows: 10 }), { cols: 8, rows: 10 });
  assert.deepEqual(hud.gridDims('portrait', { cols: 8, rows: 12 }, { cols: 8, rows: 10 }), { cols: 8, rows: 12 });
  assert.deepEqual(hud.gridDims('landscape', ext, null), { cols: 8, rows: 6 });
  assert.deepEqual(hud.gridDims('landscape', ext, { cols: 30, rows: 7 }), { cols: 30, rows: 7 });
  assert.deepEqual(hud.gridDims('landscape', ext, { cols: 30, rows: 6 }), { cols: 30, rows: 6 });
});

test('proof: a saved layout with 4 trailing empty rows — HUD rows before = extent, after = form', () => {
  const placed = [{ col: 0, row: 0, size: { cols: 8, rows: 6 } }, { col: 0, row: 6, size: { cols: 8, rows: 6 } }];
  const ext = hud.extent(placed);
  const form = { cols: 8, rows: ext.rows + 4 };
  assert.equal(hud.gridDims('portrait', ext, null).rows, 12, 'before (no form): extent');
  assert.equal(hud.gridDims('portrait', ext, form).rows, 16, 'after (form): extent + 4 free rows');
});

test('window: the card thumb uses the form when present', () => {
  const sizes = new Map([['wide', { cols: 8, rows: 6 }], ['band', { cols: 8, rows: 6 }]]);
  const plain = layoutThumb(P(), sizes, 'portrait');
  const formed = layoutThumb(P({ form: { cols: 8, rows: 10 } }), sizes, 'portrait');
  assert.equal(plain.rows, 6);
  assert.equal(formed.rows, 10);
  assert.equal(formed.height, 20);
  assert.equal(layoutThumb(L({ form: { cols: 30, rows: 7 } }), sizes, 'landscape').cols, 30);
  assert.equal(layoutThumb(L(), sizes, 'landscape').cols, 8);
});

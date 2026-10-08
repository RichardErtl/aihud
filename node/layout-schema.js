// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · LAYOUT SCHEMA
//
//  The one check a layout file passes before `POST /layouts` stores it (`tiles/CONTRACT.md`
//  §Layouts, `contract.json` → `layoutFile`). A layout is `{name, orientation, tiles}`; every
//  placement is `{tile, col, row}` and takes its size from the tile's `meta.sizes[0]`; the tile's
//  `meta.orientation` must be the layout's.
//  It answers the FIRST violation as `<path>:<reason>` (or `null`); `store.js writeLayout` turns it
//  into `400 layout_invalid:<path>:<reason>`. No imports from the node, so the check stands alone.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';

const CONTRACT = JSON.parse(readFileSync(new URL('../tiles/contract.json', import.meta.url), 'utf8'));
export const LAYOUT_FILE = Object.freeze(CONTRACT.layoutFile);

/** How often the check ran in this process — the trip-wire of the tests ("the POST path really checks"). */
export const layoutChecks = { runs: 0 };

const isInt = (v) => Number.isInteger(v) && v >= 0;
const isPlain = (v) => v != null && typeof v === 'object' && !Array.isArray(v);

/** The tile's one size in grid units from its `meta`, or `null`. */
export function tileSize(meta) {
  const s = meta && Array.isArray(meta.sizes) ? meta.sizes[0] : null;
  return isPlain(s) && Number.isInteger(s.cols) && s.cols > 0 && Number.isInteger(s.rows) && s.rows > 0
    ? { cols: s.cols, rows: s.rows } : null;
}

/**
 * Checks a layout body against the schema and the tile catalog (entries of `catalog()`; only
 * `kind: "tile"` entries count, own before shipped as the catalog orders them). Returns the first
 * violation as `<path>:<reason>`, or `null` when the layout is valid.
 */
export function layoutViolation(body, catalogEntries = []) {
  layoutChecks.runs++;
  try { check(body, catalogEntries); return null; } catch (e) { if (e instanceof Violation) return e.message; throw e; }
}

class Violation extends Error {}

function check(body, catalogEntries) {
  const fail = (path, reason) => { throw new Violation(`${path}:${reason}`); };
  if (!isPlain(body)) fail('$', 'not_an_object');
  const extra = Object.keys(body).filter((k) => !LAYOUT_FILE.keys.includes(k) && !LAYOUT_FILE.optionalKeys.includes(k));
  if (extra.length) fail(extra[0], 'unknown_key');
  for (const k of LAYOUT_FILE.keys) if (!(k in body)) fail(k, 'missing');
  if (typeof body.name !== 'string' || !body.name.trim()) fail('name', 'not_a_non_empty_string');
  if (!LAYOUT_FILE.orientations.includes(body.orientation)) fail('orientation', `not_one_of_${LAYOUT_FILE.orientations.join('|')}`);
  if (!Array.isArray(body.tiles)) fail('tiles', 'not_an_array');

  const tiles = new Map();
  for (const e of catalogEntries) if (e && e.kind === 'tile' && !tiles.has(e.name)) tiles.set(e.name, e);
  let form = null;
  if ('form' in body) {
    const f = body.form;
    if (!isPlain(f)) fail('form', 'not_an_object');
    const fx = Object.keys(f).filter((k) => !LAYOUT_FILE.formKeys.includes(k));
    if (fx.length) fail(`form.${fx[0]}`, 'unknown_key');
    for (const k of LAYOUT_FILE.formKeys) {
      if (!(k in f)) fail(`form.${k}`, 'missing');
      if (!Number.isInteger(f[k]) || f[k] < 1) fail(`form.${k}`, 'not_an_integer_>=_1');
    }
    if (body.orientation === 'portrait' && f.cols !== LAYOUT_FILE.portraitMaxCols) fail('form.cols', `portrait_cols_must_be_${LAYOUT_FILE.portraitMaxCols}`);
    if (body.orientation === 'landscape' && f.rows > LAYOUT_FILE.landscapeMaxRows) fail('form.rows', `exceeds_band_${f.rows}>${LAYOUT_FILE.landscapeMaxRows}`);
    if (body.orientation === 'portrait' && f.rows > LAYOUT_FILE.formMax.rows) fail('form.rows', `exceeds_max_${f.rows}>${LAYOUT_FILE.formMax.rows}`);
    if (body.orientation === 'landscape' && f.cols > LAYOUT_FILE.formMax.cols) fail('form.cols', `exceeds_max_${f.cols}>${LAYOUT_FILE.formMax.cols}`);
    form = f;
  }
  const placed = [];
  body.tiles.forEach((p, i) => {
    const at = `tiles[${i}]`;
    if (!isPlain(p)) fail(at, 'not_an_object');
    const extraKeys = Object.keys(p).filter((k) => !LAYOUT_FILE.placementKeys.includes(k));
    if (extraKeys.length) fail(`${at}.${extraKeys[0]}`, 'unknown_key');
    if (typeof p.tile !== 'string' || !p.tile) fail(`${at}.tile`, 'not_a_non_empty_string');
    if (!isInt(p.col)) fail(`${at}.col`, 'not_an_integer_>=_0');
    if (!isInt(p.row)) fail(`${at}.row`, 'not_an_integer_>=_0');
    const entry = tiles.get(p.tile);
    if (!entry) fail(`${at}.tile`, `unknown_tile_${p.tile}`);
    if (entry.loadable === false) fail(`${at}.tile`, `tile_not_loadable_${p.tile}`);
    if (!entry.meta || entry.meta.orientation !== body.orientation) fail(`${at}.tile`, 'orientation_mismatch');
    const size = tileSize(entry.meta);
    if (!size) fail(`${at}.tile`, `tile_without_size_${p.tile}`);
    if (body.orientation === 'portrait' && p.col + size.cols > LAYOUT_FILE.portraitMaxCols) {
      fail(at, `exceeds_width_${p.col}+${size.cols}>${LAYOUT_FILE.portraitMaxCols}`);
    }
    if (body.orientation === 'landscape' && p.row + size.rows > LAYOUT_FILE.landscapeMaxRows) {
      fail(at, `exceeds_band_${p.row}+${size.rows}>${LAYOUT_FILE.landscapeMaxRows}`);
    }
    const box = { i, c0: p.col, c1: p.col + size.cols, r0: p.row, r1: p.row + size.rows };
    const hit = placed.find((q) => box.c0 < q.c1 && q.c0 < box.c1 && box.r0 < q.r1 && q.r0 < box.r1);
    if (hit) fail(at, `overlaps_tiles[${hit.i}]`);
    if (form && (box.c1 > form.cols || box.r1 > form.rows)) fail(at, `outside_form_${box.c1}x${box.r1}>${form.cols}x${form.rows}`);
    placed.push(box);
  });
}

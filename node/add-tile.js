// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · `aihud add-tile <id>`
//
//  Puts a tile into the active portrait and/or landscape layout. A layout of the aihud home is edited
//  in place; a shipped one is copied into `<home>/layouts/` (`my-<orientation>`) and the setting is
//  pointed at the copy — the package is never written. Everything is planned and validated first
//  (`layoutViolation`), then written: a refusal leaves the home untouched.
//  A tile has ONE orientation (`meta.orientation`); for the other one the twin is used
//  (`<id>-<orientation>`, or the id without the orientation suffix for portrait).
//  Placement: portrait = col 0, row 0 at the very top (above the header); every tile already in the
//  layout moves down by the new tile's rows (a `form` grows by the same). Landscape = row 0 right of
//  the rightmost column (the landscape band is only 6-7 rows high, so a stack would never fit).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_SETTINGS, ORIENTATIONS, Refusal, aihudHome, catalog, checkHome, layoutSlug, readSettings, writeInside, writeSettings } from './store.js';
import { layoutViolation, tileSize } from './layout-schema.js';

const KEY = { portrait: 'layout_portrait', landscape: 'layout_landscape' };

/** The tile entry that fits `orientation`: the id itself, else its twin; `null` when there is none. */
function pick(tiles, id, orientation) {
  const base = id.replace(/-(portrait|landscape)$/, '');
  const names = [id, `${base}-${orientation}`, ...(orientation === 'portrait' ? [base] : [])];
  for (const n of names) {
    const e = tiles.get(n);
    if (e && e.loadable !== false && e.meta && e.meta.orientation === orientation) return e;
  }
  return null;
}

function plan(entries, tiles, tile, orientation, settings) {
  const active = settings[KEY[orientation]] || DEFAULT_SETTINGS[KEY[orientation]];
  const hit = entries.find((e) => e.kind === 'layout' && e.name === active && e.loadable !== false);
  if (!hit) throw new Refusal(400, `${KEY[orientation]} names "${active}", which is not an available layout`);
  const layout = JSON.parse(readFileSync(hit.path, 'utf8'));
  if (layout.tiles.some((p) => p.tile === tile.name)) return { orientation, tile: tile.name, active, already: true };
  const size = tileSize(tile.meta);
  const extent = (p) => { const e = tiles.get(p.tile); return (e && tileSize(e.meta)) || { cols: 0, rows: 0 }; };
  const portrait = orientation === 'portrait';
  const shift = portrait && size ? size.rows : 0;
  const placement = portrait
    ? { tile: tile.name, col: 0, row: 0 }
    : { tile: tile.name, col: Math.max(0, ...layout.tiles.map((p) => p.col + extent(p).cols)), row: 0 };
  const body = { ...layout, tiles: portrait ? [placement, ...layout.tiles.map((p) => ({ ...p, row: p.row + shift }))] : [...layout.tiles, placement] };
  if (body.form && size) {
    body.form = { ...body.form };
    if (portrait) body.form.rows += size.rows;
    else {
      body.form.cols = Math.max(body.form.cols, placement.col + size.cols);
      body.form.rows = Math.max(body.form.rows, size.rows);
    }
  }
  const violation = layoutViolation(body, entries);
  if (violation) throw new Refusal(400, `the layout "${active}" would become invalid (${violation}); nothing written`);
  return { orientation, tile: tile.name, active, placement, body, own: hit.own, file: hit.path };
}

/** Returns the exit code; prints through `log`/`err`. */
export async function addTile(id, values, log, err) {
  const mode = values.orientation ?? 'both';
  if (!['both', ...ORIENTATIONS].includes(mode)) { err('add-tile: --orientation must be portrait, landscape or both'); return 2; }
  const wanted = mode === 'both' ? ORIENTATIONS : [mode];
  const home = aihudHome(values.home);
  checkHome(home);
  const entries = await catalog(home);
  const tiles = new Map();
  for (const e of entries) if (e.kind === 'tile' && !tiles.has(e.name)) tiles.set(e.name, e);
  const settings = readSettings(home);
  const plans = [];
  for (const o of wanted) {
    const tile = pick(tiles, id, o);
    if (!tile) continue;
    plans.push(plan(entries, tiles, tile, o, settings));
  }
  if (!plans.length) {
    const known = tiles.get(id);
    err(`add-tile: ${known && known.loadable === false ? `tile "${id}" does not load (${known.error})` : `no loadable ${wanted.join('/')} tile "${id}" (or its twin) in the catalog`}; nothing written`);
    return 1;
  }
  let wrote = false;
  for (const p of plans) {
    if (p.already) { log(`${p.orientation}: ${p.tile} is already in layout "${p.active}" - nothing to do`); continue; }
    let target = p.file;
    let name = p.active;
    const patch = {};
    if (!p.own) {
      const taken = new Set(entries.filter((e) => e.kind === 'layout').map((e) => e.name));
      name = `my-${p.orientation}`;
      for (let i = 2; taken.has(name); i++) name = `my-${p.orientation}-${i}`;
      p.body.name = name.replace(/-/g, ' ');
      target = join(home, 'layouts', `${layoutSlug(p.body.name)}.json`);
      patch[KEY[p.orientation]] = name;
    }
    writeInside(home, target, p.body);
    wrote = true;
    log(`${p.orientation}: added ${p.tile} ${p.orientation === 'portrait' ? 'at the very top, above the header (everything else moved down)' : `at col ${p.placement.col}, row ${p.placement.row}`} in layout "${name}" (${target})`);
    if (patch[KEY[p.orientation]]) {
      writeSettings(home, patch, await catalog(home));
      log(`  copied from the shipped "${p.active}"; setting ${KEY[p.orientation]} -> ${name}`);
      log(`  undo: set ${KEY[p.orientation]} back to "${p.active}" in ${join(home, 'settings.json')} and delete ${target}`);
    } else {
      log(`  undo: remove the entry for "${p.tile}" from ${target}`);
    }
  }
  const base = id.replace(/-(portrait|landscape)$/, '');
  for (const o of ORIENTATIONS.filter((x) => !pick(tiles, id, x))) {
    log(`note: no ${o} twin "${o === 'portrait' ? base : `${base}-${o}`}" - the ${o} HUD will not show this tile; write that file (same values, a ${o} size) and run add-tile again`);
  }
  if (wrote) log('reload the HUD page to see it (a running node serves the new layout without a restart).');
  return 0;
}

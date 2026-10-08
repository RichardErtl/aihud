// ─────────────────────────────────────────────────────────────────────────────
//  THE COMPOSER
//
//  The one place where tiles are arranged into a layout (`tiles/CONTRACT.md` §Layouts); the HUD
//  only shows. The page (`index.html`, served at `GET /composer`) calls `boot(window)`:
//   · a grid of any form — portrait 8 cells wide with a free height (a box too), landscape free
//     wide within the 7-row band — drawn at the HUD's unit (inner width ÷ 8, capped by `unit_max`),
//     with the inner width floor (162 px) marked
//   · the tile panel from the catalog: tiles of the chosen orientation, own tiles first (newest
//     saved first), then by content block and style; every tile shows as a live mini preview —
//     its own render at 20 px, scaled into a fixed box — and the preview is what the hand drags.
//     The example (probe) tiles stay out of the panel
//   · drag a tile from the panel onto the grid, drag a placed tile to move it, drag it off the grid
//     or press ✕ to remove it; a tile sits at its `meta.sizes[0]`, an occupied or off-grid place is
//     refused, and the ghost says why in words
//   · drag the grid's corner handle to resize it (portrait: rows, landscape: columns)
//   · a labelled name, and save through the node's one layout write path (`POST /layouts`), which
//     checks the layout again and writes only inside the aihud home; a Save without a name
//     highlights the name field
//   · load an existing layout (`?layout=<name>` or the Layouts list: own newest first, then shipped)
//     and delete the loaded one after a confirm (`DELETE /layouts/<name>`: the trash folder, never
//     a hard delete)
//   · while it is open the composer mirrors its grid + placed tiles live into the real HUD page
//     (`POST /layouts/draft`, renewed every DRAFT_HEARTBEAT_MS; ends on Save, Clear and tab close)
//   · a drawer for Claude Code: how to have a tile built, what a layout file looks like
//  `?orientation=landscape` in the address opens the composer in landscape.
//
//  The functions above `boot` are pure (no DOM) and tested directly.
// ─────────────────────────────────────────────────────────────────────────────

import { unitFor, tileSize, isProbe, themeOverrides, extent } from '../hud/hud.js';

/** The layout limits of `tiles/contract.json` → `layoutFile` (a test holds the two together). */
export const LAYOUT = Object.freeze({ portraitMaxCols: 8, landscapeMaxRows: 7 });
/** The inner width floor of the portrait strip in px (unit 20 px there, `contract.json` → `grid.floorPx`). */
export const FLOOR_INNER_PX = 162;
/** The largest grid the composer offers — a bound for the inputs, not a rule of the layout file. */
export const FORM_MAX = Object.freeze({ rows: 60, cols: 120 });
const DEFAULT_FORM = Object.freeze({ portrait: { cols: LAYOUT.portraitMaxCols, rows: 24 }, landscape: { cols: 48, rows: 6 } });
/** The size slider: inner width (portrait) or inner height (landscape) in px. */
const PX_RANGE = Object.freeze({ portrait: { min: 120, max: 400, start: 180 }, landscape: { min: 90, max: 300, start: 135 } });

const clampInt = (v, lo, hi, fallback) => {
  const n = Math.floor(Number(v));
  return v == null || v === '' || !Number.isFinite(n) ? fallback : Math.min(hi, Math.max(lo, n));
};

/**
 * The grid form in cells. Portrait: always 8 columns (the strip), rows 1…FORM_MAX.rows.
 * Landscape: columns 1…FORM_MAX.cols, rows 1…7 (the band). Garbage falls back to the default form.
 */
export function gridForm(orientation, cols, rows) {
  if (orientation === 'landscape') {
    const d = DEFAULT_FORM.landscape;
    return { cols: clampInt(cols, 1, FORM_MAX.cols, d.cols), rows: clampInt(rows, 1, LAYOUT.landscapeMaxRows, d.rows) };
  }
  return { cols: LAYOUT.portraitMaxCols, rows: clampInt(rows, 1, FORM_MAX.rows, DEFAULT_FORM.portrait.rows) };
}

/** Pixels per cell, the HUD's rule: portrait from the inner width, landscape from the inner height. */
export function composerUnit(orientation, px, rows, unitMax) {
  return orientation === 'landscape' ? unitFor('landscape', 0, px, rows, unitMax) : unitFor('portrait', px, 0, 0, unitMax);
}

/** The content blocks and styles in contract order (`contract.json` → `contentBlocks`, `styles`). */
export const CONTENT_BLOCKS = Object.freeze(['header', 'context', 'top-three-subagents', 'time', 'tokens', 'subagents', 'skills', 'glance', 'trace', 'tools', 'active-time']);
export const STYLES = Object.freeze(['standard', 'minimal', 'fancy-a', 'fancy-b', 'hairline', 'ledger', 'slab', 'register', 'numeral', 'calibre', 'redline', 'seismograph', 'cellwork', 'column', 'backlight', 'relief', 'bauhaus', 'splitflap', 'particle', 'blueprint', 'mosaic', 'strata', 'essentials']);
export const STYLE_NAMES = Object.freeze({ standard: 'Standard', minimal: 'Minimal', 'fancy-a': 'Fancy A', 'fancy-b': 'Fancy B', hairline: 'Hairline', ledger: 'Ledger', slab: 'Slab', register: 'Register', numeral: 'Numeral', calibre: 'Calibre', redline: 'Redline', seismograph: 'Seismograph', cellwork: 'Cellwork', column: 'Column', backlight: 'Backlight', relief: 'Relief', bauhaus: 'Bauhaus', splitflap: 'Splitflap', particle: 'Particle', blueprint: 'Blueprint', mosaic: 'Mosaic', strata: 'Strata', essentials: 'Essentials' });
/** The style families, the panel's filter chips (`contract.json` → `families`): family key → ordered style list; every style sits in exactly one. */
export const FAMILIES = Object.freeze({ quiet: Object.freeze(['hairline', 'ledger', 'register', 'slab']), instrument: Object.freeze(['numeral', 'calibre', 'redline', 'splitflap']), drafting: Object.freeze(['blueprint', 'seismograph', 'column', 'bauhaus']), material: Object.freeze(['backlight', 'relief', 'particle', 'mosaic', 'strata', 'cellwork']), classic: Object.freeze(['standard', 'minimal', 'fancy-a', 'fancy-b', 'essentials']) });
export const FAMILY_NAMES = Object.freeze({ quiet: 'Quiet', instrument: 'Instrument', drafting: 'Drafting', material: 'Material', classic: 'Classic' });
const BLOCK_NAMES = Object.freeze({ header: 'Header', context: 'Context', 'top-three-subagents': 'Top three subagents', time: 'Time', tokens: 'Tokens', subagents: 'Subagents', skills: 'Skills', glance: 'Context at a glance', trace: 'Trace', tools: 'Tools', 'active-time': 'Active time' });
const rankOf = (list, v) => { const i = list.indexOf(v); return i < 0 ? list.length : i; };

/**
 * The tile panel: catalog tiles of `orientation` that load and have a size, as
 * `{name, own, size, block, style, mtime_ms}`. Own tiles first, newest saved first (an own tile
 * shadows a shipped one of the same name, as in the HUD); then the shipped ones by content block
 * in contract order, inside a block in style order. The example (probe) tiles stay out.
 */
export function panelTiles(entries, orientation) {
  const tiles = (Array.isArray(entries) ? entries : []).filter((e) => e && e.kind === 'tile');
  const ordered = [...tiles.filter((e) => e.own), ...tiles.filter((e) => !e.own)];
  const seen = new Set();
  const out = [];
  for (const e of ordered) {
    if (seen.has(e.name)) continue;   // shadowed
    seen.add(e.name);
    if (e.loadable === false || !e.meta || e.meta.orientation !== orientation || isProbe(e)) continue;
    const size = tileSize(e.meta);
    if (size) out.push({ name: e.name, own: Boolean(e.own), size, block: e.meta.contentBlock || null, style: e.meta.style || null, mtime_ms: Number(e.mtime_ms) || 0 });
  }
  return out.sort((a, b) => {
    if (a.own !== b.own) return a.own ? -1 : 1;
    if (a.own) return b.mtime_ms - a.mtime_ms;   // same time: catalog order (the sort is stable)
    return rankOf(CONTENT_BLOCKS, a.block) - rankOf(CONTENT_BLOCKS, b.block)
      || rankOf(STYLES, a.style) - rankOf(STYLES, b.style) || a.name.localeCompare(b.name);
  });
}

/**
 * The panel as groups for the page: "Your tiles" first, then one group per content block. `style`
 * filters the shipped tiles (`all` or a family key of `FAMILIES`; own tiles always show), `query` matches the name.
 */
export function panelGroups(panel, style = 'all', query = '') {
  const q = String(query || '').trim().toLowerCase();
  const pass = (t) => (style === 'all' || t.own || (FAMILIES[style] || []).includes(t.style)) && (!q || t.name.toLowerCase().includes(q));
  const groups = [];
  const own = panel.filter((t) => t.own && pass(t));
  if (own.length) groups.push({ title: 'Your tiles', own: true, tiles: own });
  for (const b of [...CONTENT_BLOCKS, null]) {
    const tiles = panel.filter((t) => !t.own && (b === null ? !CONTENT_BLOCKS.includes(t.block) : t.block === b) && pass(t));
    if (tiles.length) groups.push({ title: b === null ? 'Other' : BLOCK_NAMES[b], own: false, tiles });
  }
  return groups;
}

/** The unit a panel preview is drawn at, and the largest share of it a preview shows. */
export const PREVIEW = Object.freeze({ unit: 20, maxScale: 0.55, boxPx: 200 });

/** The scale of one tile's preview: its render at `PREVIEW.unit`, shrunk to fit the panel box. */
export function previewScale(size) {
  const w = size.cols * PREVIEW.unit;
  return Math.min(PREVIEW.maxScale, PREVIEW.boxPx / w);
}

/**
 * The reason a drop is refused, in words — `verdict` as `checkPlacement` gives it:
 * "overlaps <tile>", "1 row too high — the band is 6", "2 columns too wide — the strip is 8",
 * "runs past row 24", "runs past column 48", "outside the grid".
 */
export function refusalText(orientation, form, cand, verdict) {
  if (!verdict) return '';
  if (verdict.startsWith('occupied:')) return `overlaps ${verdict.slice('occupied:'.length)}`;
  const { col, row, size } = cand;
  if (col < 0 || row < 0 || !size) return 'outside the grid';
  const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;
  const wide = col + size.cols - form.cols;
  if (wide > 0) return orientation === 'portrait' ? `${plural(wide, 'column')} too wide — the strip is ${form.cols}` : `runs past column ${form.cols}`;
  const high = row + size.rows - form.rows;
  if (high > 0) return orientation === 'landscape' ? `${plural(high, 'row')} too high — the band is ${form.rows}` : `runs past row ${form.rows}`;
  return 'outside the grid';
}

/**
 * May `cand` (`{tile, col, row, size}`) sit on `form` next to `placed`? `null` = yes, else the
 * reason: `outside_grid` or `occupied:<tile>`. `skip` = the index of the tile being moved (its
 * own old cells do not block it). Two tiles may touch, never share a cell.
 */
export function checkPlacement(form, placed, cand, skip = -1) {
  const { col, row, size } = cand;
  if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || !size
    || col + size.cols > form.cols || row + size.rows > form.rows) return 'outside_grid';
  for (let i = 0; i < placed.length; i++) {
    if (i === skip) continue;
    const q = placed[i];
    if (col < q.col + q.size.cols && q.col < col + size.cols && row < q.row + q.size.rows && q.row < row + size.rows) {
      return `occupied:${q.tile}`;
    }
  }
  return null;
}

/** Does every placed tile still fit `form`? `null`, or `outside:<tile>` for the first that falls off. */
export function formFits(form, placed) {
  const off = placed.find((p) => p.col + p.size.cols > form.cols || p.row + p.size.rows > form.rows);
  return off ? `outside:${off.tile}` : null;
}

/** The layout file: `{name, orientation, tiles: [{tile, col, row}]}` top-left first, plus `form: {cols, rows}` when a form is given. */
export function layoutBody(name, orientation, placed, form = null) {
  const tiles = [...placed].sort((a, b) => a.row - b.row || a.col - b.col).map(({ tile, col, row }) => ({ tile, col, row }));
  const body = { name: String(name ?? '').trim(), orientation, tiles };
  if (form) body.form = { cols: form.cols, rows: form.rows };
  return body;
}

/** The file slug the node will write (`store.js layoutSlug`), or `''` for a name the node refuses. */
export function nameSlug(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 64) return '';
  if (/[\\/]|\.\.|[\u0000-\u001f]/.test(name)) return '';
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** The composer renews its draft this often; the node drops one that is not renewed for 15 s. */
export const DRAFT_HEARTBEAT_MS = 5000;

/**
 * The grid form after dragging the corner handle by `dx`/`dy` px at `unit` px per cell: portrait
 * grows by rows (dy), landscape by columns (dx); the other axis never moves; the form limits hold.
 */
export function dragForm(orientation, form, dx, dy, unit) {
  if (!(unit > 0)) return form;
  return orientation === 'landscape'
    ? gridForm('landscape', form.cols + Math.round(dx / unit), form.rows)
    : gridForm('portrait', form.cols, form.rows + Math.round(dy / unit));
}

/**
 * The layouts the composer lists, as `{name, own, orientation, mtime_ms}`: own newest first, then the
 * shipped ones by name; a shipped layout shadowed by an own one of the same name is listed once (the
 * own one); the shipped probe pair stays out, as in the window.
 */
export function layoutList(entries) {
  const seen = new Set();
  const out = [];
  const layouts = (Array.isArray(entries) ? entries : []).filter((e) => e && e.kind === 'layout' && e.loadable !== false && e.meta && e.meta.orientation && !isProbe(e));
  for (const e of [...layouts.filter((x) => x.own), ...layouts.filter((x) => !x.own)]) {
    if (seen.has(e.name)) continue;
    seen.add(e.name);
    out.push({ name: e.name, own: Boolean(e.own), orientation: e.meta.orientation, mtime_ms: Number(e.mtime_ms) || 0 });
  }
  return out.sort((a, b) => {
    if (a.own !== b.own) return a.own ? -1 : 1;
    return a.own ? b.mtime_ms - a.mtime_ms : a.name.localeCompare(b.name);
  });
}

/**
 * A layout file as the composer's grid: `{orientation, form, placed, skipped}`. The form is what the
 * HUD would draw for it (portrait 8 × the rows the tiles reach, landscape the columns they reach ×
 * at least 6 rows); no placed tile → the default form. A tile the catalog does not know (or cannot
 * size) is not placed but named in `skipped`.
 */
export function gridFromLayout(layout, entries) {
  const orientation = layout && layout.orientation === 'landscape' ? 'landscape' : 'portrait';
  const sizes = new Map();
  for (const e of (Array.isArray(entries) ? entries : []).filter((x) => x && x.kind === 'tile' && x.loadable !== false)) {
    if (!sizes.has(e.name) && tileSize(e.meta)) sizes.set(e.name, tileSize(e.meta));
  }
  const placed = [];
  const skipped = [];
  for (const p of Array.isArray(layout && layout.tiles) ? layout.tiles : []) {
    const size = sizes.get(p.tile);
    if (size) placed.push({ tile: p.tile, col: p.col, row: p.row, size }); else skipped.push(String(p.tile));
  }
  if (!placed.length) return { orientation, form: gridForm(orientation), placed, skipped };
  const ext = extent(placed.map((p) => ({ col: p.col, row: p.row, size: p.size })));
  const fromExt = orientation === 'landscape' ? gridForm('landscape', ext.cols, Math.max(6, ext.rows)) : gridForm('portrait', 8, ext.rows);
  // the saved form wins, but never smaller than the tiles need
  const saved = layout.form && typeof layout.form === 'object' ? gridForm(orientation, layout.form.cols, layout.form.rows) : null;
  const form = saved ? gridForm(orientation, Math.max(saved.cols, fromExt.cols), Math.max(saved.rows, orientation === 'landscape' ? ext.rows : fromExt.rows)) : fromExt;
  return { orientation, form, placed, skipped };
}

/** The draft the HUD overlay gets: `{orientation, cols, rows, tiles:[{tile, col, row}]}`, top-left first. */
export function draftBody(orientation, form, placed) {
  const { tiles } = layoutBody('', orientation, placed);
  return { orientation, cols: form.cols, rows: form.rows, tiles };
}

/** The question before a delete: names the layout; a shipped one says so and says where settings go. */
export function deleteConfirmText(name, own) {
  return own
    ? `Delete your layout "${name}"? It moves to the trash folder (~/.aihud/layouts/trash) — nothing is erased.`
    : `Delete shipped layout "${name}"? It is hidden from your layouts (a marker in ~/.aihud/layouts/trash; the package file stays). If the HUD settings use it, they fall back to the default layout.`;
}

/** The cell under a point, `x`/`y` relative to the grid's top-left corner. */
export function cellFromPoint(x, y, unit) {
  return { col: Math.floor(x / unit), row: Math.floor(y / unit) };
}

/**
 * Saves a layout through the node's layout write path. `fetchFn` is the page's `fetch`; answers
 * `{status, json}` — 201 `{slug, path, replaced}`, or 4xx `{error}`.
 */
export async function saveLayout(fetchFn, base, body) {
  const res = await fetchFn(`${base}/layouts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

/** Sends (or, with `{end:true}`, ends) the live draft: `POST /layouts/draft`. `{status, json}`. */
export async function postDraft(fetchFn, base, body) {
  const res = await fetchFn(`${base}/layouts/draft`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true,
  });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

/** Deletes a layout by catalog name: `DELETE /layouts/<name>` (the trash folder). `{status, json}`. */
export async function deleteLayout(fetchFn, base, name) {
  const res = await fetchFn(`${base}/layouts/${encodeURIComponent(name)}`, { method: 'DELETE' });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json };
}

/** The window's Settings page, where the composer returns after a layout is deleted. */
export function settingsUrl(base = '') {
  return `${base}/window#settings`;
}

/** What the page tells a user about Claude Code and the layout file — text, nothing to install. */
export const INSTRUCTIONS = `Build a new tile with Claude Code

1. In a terminal run:
     npx aihud new-tile
   It prints the tile contract, the list of values a
   tile can show and the steps. Paste that into Claude
   Code, or ask Claude Code to run the command itself.
   With the skill installed (npx aihud install-skill)
   you can type /new-tile in Claude Code instead.
2. Tell Claude Code what the tile should show and how.
   It picks from the value list; you decide.
   One full tile that holds everything you want to see
   is built the same way.
3. The tile lands in ~/.aihud/tiles/<name>.js (or in
   AIHUD_HOME/tiles). Reload this page: your own tiles
   are listed first.

What a layout looks like

Saving here writes ~/.aihud/layouts/<name>.json, only
inside your aihud home:

{
  "name": "night strip",
  "orientation": "portrait",
  "tiles": [
    { "tile": "header-standard-portrait", "col": 0, "row": 0 },
    { "tile": "context-standard-portrait", "col": 0, "row": 2 }
  ]
}

Every tile sits at its own size (meta.sizes[0]); col
and row are its top-left cell, counted from 0. Portrait
layouts are 8 cells wide, landscape layouts at most 7
rows high, and two tiles never share a cell. Claude Code
can write this file too; the node checks a layout when
it is saved here, not when a file is copied into the
folder by hand.

Show it

Open /hud?layout=<name> to see a saved layout in the
HUD. To make it the HUD's default, set "layout_portrait"
or "layout_landscape" in settings.json in your aihud
home to its name.`;

// ── the page ────────────────────────────────────────────────────────────────

/** The orientation named in the page address (`?orientation=landscape`), else portrait. */
export function orientationParam(search) {
  return new URLSearchParams(String(search || '')).get('orientation') === 'landscape' ? 'landscape' : 'portrait';
}

/**
 * Starts the composer in `win`. `base` prefixes every node URL (empty in the page); `importModule`
 * loads a tile module by URL for the previews. Returns `{state, ready}`.
 */
export function boot(win, { base = '', importModule = (url) => import(url) } = {}) {
  const doc = win.document;
  const root = doc.getElementById('composer');
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  };
  const input = (type, attrs = {}) => {
    const i = el('input');
    i.type = type;
    for (const [k, v] of Object.entries(attrs)) i.setAttribute(k, String(v));
    return i;
  };
  const button = (cls, text) => { const b = el('button', cls, text); b.type = 'button'; return b; };
  const now = () => (win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now());
  const loc = win.location || {};
  const start = orientationParam(loc.search);

  const state = {
    orientation: start, form: gridForm(start), px: PX_RANGE[start].start, unitMax: undefined, unit: 0,
    entries: [], panel: [], placed: [], drag: null, saved: null, modules: new Map(), data: null,
    filter: 'all', query: '', guideOpen: start === 'portrait', dirty: false, previews: new Map(),
    loaded: null, draftOn: false, resize: null,
  };

  // ── the bar: back · name with its file · orientation · grid · size · Open in HUD · Save ──
  const back = el('a', 'back', '← Settings');
  back.href = `${base}/window#settings`;
  const nameIn = input('text', { maxlength: 64, placeholder: 'Untitled layout', spellcheck: 'false', id: 'layout-name' });
  const nameLabel = el('label', null, 'Layout name');
  nameLabel.htmlFor = 'layout-name';
  const slugOut = el('span', 'slug');
  const nameBox = el('div', 'c-name');
  nameBox.append(nameLabel, nameIn, slugOut);
  const seg = el('span', 'seg');
  const segButtons = {};
  for (const o of ['portrait', 'landscape']) {
    segButtons[o] = button(null, o === 'portrait' ? 'Portrait' : 'Landscape');
    segButtons[o].dataset.o = o;
    segButtons[o].addEventListener('click', () => switchTo(o));
    seg.append(segButtons[o]);
  }
  const colsIn = input('number', { min: 1, max: FORM_MAX.cols, 'aria-label': 'columns' });
  const rowsIn = input('number', { min: 1, max: FORM_MAX.rows, 'aria-label': 'rows' });
  const gridField = el('span', 'c-field');
  gridField.append(el('span', null, 'Grid'), colsIn, el('span', null, '×'), rowsIn);
  const pxIn = input('range', { step: 1, 'aria-label': 'size' });
  const pxOut = el('span', 'readout');
  const sizeField = el('span', 'c-field');
  sizeField.append(el('span', null, 'Size'), pxIn, pxOut);
  const hudLink = el('a', 'link hud-link', 'Open in HUD ↗');
  hudLink.hidden = true;
  hudLink.target = '_blank';
  const clearBtn = button('quiet-button clear', 'Clear');
  const deleteBtn = button('quiet-button delete', 'Delete layout');
  deleteBtn.hidden = true;
  const saveBtn = button('save', 'Save');
  const barRight = el('span', 'c-right');
  barRight.append(hudLink, clearBtn, deleteBtn, saveBtn);
  const bar = el('header', 'bar');
  bar.append(back, nameBox, seg, gridField, sizeField, barRight);

  // ── panel (with live mini previews), stage, guide drawer ──
  const search = input('search', { placeholder: 'Search tiles', spellcheck: 'false', 'aria-label': 'search tiles' });
  search.className = 'search';
  const chips = el('div', 'chips');
  const chipButtons = {};
  for (const f of ['all', ...Object.keys(FAMILIES)]) {
    chipButtons[f] = button(null, f === 'all' ? 'All' : FAMILY_NAMES[f]);
    chipButtons[f].addEventListener('click', () => { state.filter = f; drawPanel(); });
    chips.append(chipButtons[f]);
  }
  const panelList = el('ul', 'tiles');
  const layoutsBox = el('details', 'layouts');
  layoutsBox.open = true;
  const layoutsList = el('ul', 'layout-list');
  const panel = el('aside', 'panel');
  panel.append(layoutsBox, search, chips, panelList);
  const info = el('div', 'c-info');
  const status = el('p', 'status');
  status.setAttribute('role', 'status');
  const grid = el('div', 'grid');
  const resizer = el('div', 'resize');
  const floor = el('div', 'floor');
  floor.append(el('span', null, `inner floor ${FLOOR_INNER_PX} px`));
  const ghost = el('div', 'ghost');
  ghost.hidden = true;
  const stage = el('section', 'stage');
  stage.append(info, status, grid);
  const guide = el('aside', 'guide');
  drawGuide();
  const work = el('div', 'work');
  work.append(panel, stage, guide);
  root.replaceChildren(bar, work);

  const say = (text) => { status.textContent = text; };
  const get = async (path) => {
    const res = await win.fetch(base + path);
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  };

  function drawGuide() {
    const head = el('div', 'g-head');
    const fold = button('fold', state.guideOpen ? '›' : '‹');
    fold.title = state.guideOpen ? 'Fold' : 'Open';
    fold.addEventListener('click', () => { state.guideOpen = !state.guideOpen; drawGuide(); });
    head.append(el('b', null, 'Build a tile with Claude Code'), fold);
    const command = (text) => {
      const c = el('div', 'command');
      const copy = button('copy', 'Copy');
      copy.addEventListener('click', () => {
        const clip = win.navigator && win.navigator.clipboard;
        if (clip && typeof clip.writeText === 'function') clip.writeText(text).then(() => { copy.textContent = 'Copied'; copy.className = 'copy ok'; win.setTimeout(() => { copy.textContent = 'Copy'; copy.className = 'copy'; }, 1400); }, () => {});
      });
      c.append(el('span', null, text), copy);
      return c;
    };
    const step = (n, ...body) => { const s = el('div', 'step'); const b = el('div'); b.append(...body); s.append(el('span', null, String(n)), b); return s; };
    const p = (...parts) => { const e = el('p'); e.append(...parts.map((x) => (typeof x === 'string' ? doc.createTextNode(x) : x))); return e; };
    const catalogLink = el('a', 'link', 'data catalog');
    catalogLink.href = `${base}/window#analysis`;
    const format = el('details', 'format');
    const [, layoutPart] = INSTRUCTIONS.split('What a layout looks like');
    format.append(el('summary', null, 'Layout file format'), el('pre', null, `What a layout looks like${layoutPart}`));
    const bodyBox = el('div', 'g-body');
    bodyBox.append(
      step(1, p('Get the contract, the value list and the steps:'), command('npx aihud new-tile'),
        p('Paste the output into Claude Code — or let Claude Code run it. With the skill installed, ', el('code', null, '/new-tile'), ' does the same:'),
        command('npx aihud install-skill')),
      step(2, p('Tell Claude Code what the tile should show. It picks from the values in the ', catalogLink, ' — you decide. One ', el('b', null, 'full tile'), ' with everything you want is built the same way.')),
      step(3, p('The tile lands in ', el('code', null, '~/.aihud/tiles/'), ' and shows up here first, under Your tiles.')),
      format,
    );
    guide.className = state.guideOpen ? 'guide' : 'guide folded';
    guide.replaceChildren(head, bodyBox);
  }

  // ── drawing ──
  function drawBar() {
    const range = PX_RANGE[state.orientation];
    for (const o of ['portrait', 'landscape']) segButtons[o].className = o === state.orientation ? 'on' : '';
    colsIn.value = String(state.form.cols);
    colsIn.disabled = state.orientation === 'portrait';
    rowsIn.value = String(state.form.rows);
    rowsIn.max = String(state.orientation === 'landscape' ? LAYOUT.landscapeMaxRows : FORM_MAX.rows);
    pxIn.min = String(range.min);
    pxIn.max = String(range.max);
    pxIn.value = String(state.px);
    const below = state.orientation === 'portrait' && state.px < FLOOR_INNER_PX ? ' · below the floor' : '';
    pxOut.textContent = state.orientation === 'landscape' ? `${state.px} px band · unit ${state.unit}` : `${state.px} px inner · unit ${state.unit}${below}`;
    const typed = nameIn.value.trim();
    const slug = nameSlug(typed);
    slugOut.replaceChildren(el('i'), doc.createTextNode(slug ? `→ ${slug}.json` : typed ? 'name: 1–64 characters, no / \\ or ..' : '→ …'));
    slugOut.className = state.dirty ? 'slug' : 'slug clean';
    hudLink.hidden = !state.saved || state.dirty;
    deleteBtn.hidden = !state.loaded;
    for (const f of ['all', ...Object.keys(FAMILIES)]) chipButtons[f].className = f === state.filter ? 'on' : '';
  }

  function tileModule(name) {
    if (!state.modules.has(name)) {
      state.modules.set(name, Promise.resolve()
        .then(() => importModule(`${base}/tiles/${encodeURIComponent(name)}.js`))
        .then((m) => (m && typeof m.render === 'function' ? m : null), () => null));
    }
    return state.modules.get(name);
  }
  const sheet = () => state.data || { hud: { current: null, pinned: false, sessions: [] } };

  /** One panel item: the tile's own render at PREVIEW.unit, scaled into a fixed box — what the hand drags. */
  function panelItem(t) {
    const li = el('li', t.own ? 'tile own' : 'tile');
    li.dataset.tile = t.name;
    const k = previewScale(t.size);
    const u = PREVIEW.unit;
    const box = el('div', 'preview');
    const boxW = Math.round(t.size.cols * u * k);
    Object.assign(box.style, { width: `${boxW}px`, height: `${Math.round(t.size.rows * u * k)}px` });
    li.style.width = `${boxW + 10}px`;   // the item is as wide as its preview: two portrait tiles side by side
    const inner = el('div', 'inner');
    Object.assign(inner.style, { width: `${t.size.cols * u}px`, height: `${t.size.rows * u}px`, transform: `scale(${k})` });
    box.append(inner);
    const meta = el('div', 'p-meta');
    const name = el('span', 'p-name', t.own ? t.name : STYLE_NAMES[t.style] || t.name);
    name.append(el('small', null, t.own ? 'own tile' : t.name));
    meta.append(name, el('span', 'p-size', `${t.size.cols}×${t.size.rows}`));
    li.append(box, meta);
    li.title = t.name;
    li.addEventListener('pointerdown', (e) => startDrag(e, { tile: t.name, size: t.size, from: -1, grab: { col: 0, row: 0 } }));
    const drawn = tileModule(t.name).then((mod) => {
      const t0 = now();
      try {
        if (!mod) throw new Error('no tile');
        mod.render(inner, sheet(), { cols: t.size.cols, rows: t.size.rows, unit: u });
        box.dataset.drawn = 'tile';
      } catch {
        inner.textContent = t.name;
        box.dataset.drawn = 'name';
      }
      return now() - t0;
    });
    return { li, drawn };
  }

  function drawPanel() {
    const groups = panelGroups(state.panel, state.filter, state.query);
    const items = [];
    for (const g of groups) {
      const head = el('li', g.own ? 'group own' : 'group');
      head.append(el('span', null, g.title), el('span', null, String(g.tiles.length)));
      items.push(head);
      for (const t of g.tiles) {
        if (!state.previews.has(t.name)) state.previews.set(t.name, panelItem(t));
        items.push(state.previews.get(t.name).li);
      }
    }
    if (!items.length) items.push(el('li', 'empty', state.panel.length ? 'No tile matches.' : `no ${state.orientation} tiles in the catalog`));
    panelList.replaceChildren(...items);
    drawBar();
  }

  /** Builds every preview of the orientation once and measures it: `data-preview-ms` (imports + renders), `data-render-ms` (renders only). */
  async function buildPreviews() {
    const t0 = now();
    state.previews = new Map(state.panel.map((t) => [t.name, panelItem(t)]));
    drawPanel();
    const renders = await Promise.all([...state.previews.values()].map((p) => p.drawn));
    root.dataset.previewMs = String(Math.round(now() - t0));
    root.dataset.renderMs = String(Math.round(renders.reduce((a, b) => a + b, 0)));
    root.dataset.previews = String(renders.length);
  }

  // a placed tile: drawn by its own render at the grid's unit, its name if it cannot draw
  function drawTileInto(body, p) {
    body.textContent = p.tile;
    const unit = state.unit;
    tileModule(p.tile).then((mod) => {
      if (!mod || !body.isConnected) return;
      try {
        mod.render(body, sheet(), { cols: p.size.cols, rows: p.size.rows, unit });
      } catch { body.textContent = p.tile; }
    });
  }

  function drawGrid() {
    const u = state.unit;
    grid.style.width = `${state.form.cols * u}px`;
    grid.style.height = `${state.form.rows * u}px`;
    grid.style.backgroundSize = `${u}px ${u}px`;
    floor.hidden = state.orientation !== 'portrait' || FLOOR_INNER_PX >= state.form.cols * u;
    floor.style.left = `${FLOOR_INNER_PX}px`;
    const cells = state.placed.map((p, i) => {
      const cell = el('div', 'cell');
      cell.dataset.tile = p.tile;
      cell.dataset.col = String(p.col);
      cell.dataset.row = String(p.row);
      Object.assign(cell.style, { left: `${p.col * u}px`, top: `${p.row * u}px`, width: `${p.size.cols * u}px`, height: `${p.size.rows * u}px` });
      const body = el('div', 'body');
      const remove = el('span', 'remove', '✕');
      remove.title = 'Remove';
      remove.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
      remove.addEventListener('click', () => { state.placed.splice(i, 1); state.dirty = true; say(`removed ${p.tile}`); redraw(); editedDraft(); });
      cell.append(body, el('span', 'grip', '⠿'), remove, el('span', 'label', p.tile));
      cell.addEventListener('pointerdown', (e) => {
        const r = cell.getBoundingClientRect();
        startDrag(e, { tile: p.tile, size: p.size, from: i, grab: cellFromPoint(e.clientX - r.left, e.clientY - r.top, u) });
      });
      drawTileInto(body, p);
      return cell;
    });
    resizer.title = state.orientation === 'portrait' ? 'Drag to resize the rows' : 'Drag to resize the columns';
    grid.replaceChildren(floor, ...cells, ghost, resizer);
    const used = state.placed.reduce((m, p) => Math.max(m, state.orientation === 'portrait' ? p.row + p.size.rows : p.col + p.size.cols), 0);
    const b = (t) => el('b', null, String(t));
    const span = (...parts) => { const s = el('span'); s.append(...parts.map((x) => (typeof x === 'string' ? doc.createTextNode(x) : x))); return s; };
    info.replaceChildren(
      span(b(state.placed.length), ' tiles'),
      state.orientation === 'portrait' ? span('rows ', b(used), ` of ${state.form.rows}`) : span('columns ', b(used), ` of ${state.form.cols}`),
      span(state.orientation === 'portrait' ? `inner ${state.form.cols * u} px` : `band ${state.form.rows * u} px`, ` · unit ${u} px`),
    );
    Object.assign(root.dataset, {
      orientation: state.orientation, cols: String(state.form.cols), rows: String(state.form.rows),
      unit: String(u), placed: String(state.placed.length), loaded: state.loaded ? state.loaded.name : '',
    });
  }

  function redraw() {
    state.unit = composerUnit(state.orientation, state.px, state.form.rows, state.unitMax);
    drawBar();
    drawGrid();
  }

  // ── dragging (pointer events on the window, so a fast move never loses the tile) ──
  function target(e) {
    const d = state.drag;
    const r = grid.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const inside = x >= 0 && y >= 0 && x < r.width && y < r.height;
    const c = cellFromPoint(x, y, state.unit);
    const cand = { tile: d.tile, size: d.size, col: c.col - d.grab.col, row: c.row - d.grab.row };
    return { inside, cand, verdict: inside ? checkPlacement(state.form, state.placed, cand, d.from) : null };
  }
  const cellsOnGrid = () => [...grid.children].filter((c) => c.dataset && c.dataset.tile);
  function markHit(name, from) {
    cellsOnGrid().forEach((c, i) => { c.className = ['cell', i === from ? 'source' : '', name && c.dataset.tile === name ? 'hit' : ''].filter(Boolean).join(' '); });
  }

  function startDrag(e, drag) {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    state.drag = drag;
    root.classList.add('dragging');
    moveDrag(e);
  }

  function moveDrag(e) {
    if (!state.drag) return;
    const { inside, cand, verdict } = target(e);
    ghost.hidden = !inside;
    if (!inside) { markHit(null, state.drag.from); return; }
    const u = state.unit;
    ghost.className = verdict ? 'ghost refused' : 'ghost';
    Object.assign(ghost.style, {
      left: `${Math.max(0, cand.col) * u}px`, top: `${Math.max(0, cand.row) * u}px`,
      width: `${cand.size.cols * u}px`, height: `${cand.size.rows * u}px`,
    });
    const why = el('span', 'why', verdict ? refusalText(state.orientation, state.form, cand, verdict) : `${cand.tile} · ${cand.col}, ${cand.row}`);
    ghost.replaceChildren(why);
    markHit(verdict && verdict.startsWith('occupied:') ? verdict.slice('occupied:'.length) : null, state.drag.from);
  }

  function endDrag(e) {
    const d = state.drag;
    if (!d) return;
    const { inside, cand, verdict } = target(e);
    state.drag = null;
    root.classList.remove('dragging');
    ghost.hidden = true;
    if (!inside) {
      if (d.from >= 0) {
        state.placed.splice(d.from, 1);
        state.dirty = true;
        say(`removed ${d.tile}`);
        editedDraft();
      }
      redraw();
      return;
    }
    if (verdict) { say(`refused: ${d.tile} at ${cand.col},${cand.row} — ${verdict.replace(':', ' by ')}`); redraw(); return; }
    const placed = { tile: d.tile, col: cand.col, row: cand.row, size: d.size };
    if (d.from >= 0) state.placed[d.from] = placed; else state.placed.push(placed);
    state.dirty = true;
    say(`${d.from >= 0 ? 'moved' : 'placed'} ${d.tile} at ${cand.col},${cand.row}`);
    redraw();
    editedDraft();
  }

  win.addEventListener('pointermove', moveDrag);
  win.addEventListener('pointerup', endDrag);
  win.addEventListener('pointercancel', () => { state.drag = null; ghost.hidden = true; root.classList.remove('dragging'); redraw(); });

  // ── the draft: this grid + placed tiles, mirrored live into the real HUD page ──
  const timers = { set: win.setTimeout ? win.setTimeout.bind(win) : setTimeout, clear: win.clearTimeout ? win.clearTimeout.bind(win) : clearTimeout, every: win.setInterval ? win.setInterval.bind(win) : setInterval };
  let draftTimer = null;
  let pendingDraft = Promise.resolve();   // the last draft post: the end waits for it, so a late post cannot revive the overlay
  const sendDraft = () => {
    if (!state.draftOn) return;
    pendingDraft = postDraft((u, o) => win.fetch(u, o), base, draftBody(state.orientation, state.form, state.placed)).catch(() => {});
  };
  /** An edit happened: (re)start the draft, sent a moment later so a drag sends one, not forty. */
  function editedDraft() {
    state.draftOn = true;
    timers.clear(draftTimer);
    draftTimer = timers.set(sendDraft, 120);
  }
  function endDraft() {
    state.draftOn = false;
    timers.clear(draftTimer);
    pendingDraft = pendingDraft.then(() => postDraft((u, o) => win.fetch(u, o), base, { end: true })).catch(() => {});
  }
  timers.every(sendDraft, DRAFT_HEARTBEAT_MS);
  // a hidden tab's timers are throttled (the draft would expire and return every minute): end it while hidden, restart when shown
  let wasOn = false;
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') { wasOn = state.draftOn; if (wasOn) endDraft(); }
    else if (wasOn) { wasOn = false; editedDraft(); }
  });
  win.addEventListener('pagehide', endDraft);
  win.addEventListener('beforeunload', endDraft);

  // ── resize: the corner handle (portrait: rows, landscape: columns), never smaller than the tiles need ──
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    state.resize = { x: e.clientX, y: e.clientY, form: { ...state.form } };
    root.classList.add('resizing');
  });
  win.addEventListener('pointermove', (e) => {
    const r = state.resize;
    if (!r) return;
    const next = dragForm(state.orientation, r.form, e.clientX - r.x, e.clientY - r.y, state.unit);
    const need = extent(state.placed.map((p) => ({ col: p.col, row: p.row, size: p.size })));
    if (state.orientation === 'portrait') next.rows = Math.max(next.rows, need.rows); else next.cols = Math.max(next.cols, need.cols);
    if (next.cols === state.form.cols && next.rows === state.form.rows) return;
    state.form = next;
    state.dirty = true;
    redraw();
    editedDraft();
  });
  const endResize = () => {
    if (!state.resize) return;
    state.resize = null;
    root.classList.remove('resizing');
    say(`grid ${state.form.cols} × ${state.form.rows}`);
  };
  win.addEventListener('pointerup', endResize);
  win.addEventListener('pointercancel', endResize);

  // ── layouts: the list, load, delete ──
  function drawLayouts() {
    const list = layoutList(state.entries);
    const items = list.map((l) => {
      const li = el('li', state.loaded && state.loaded.name === l.name ? 'on' : '');
      li.dataset.layout = l.name;
      li.dataset.own = String(l.own);
      li.append(el('span', 'l-name', l.name), el('small', null, `${l.own ? 'own' : 'shipped'} · ${l.orientation}`));
      li.addEventListener('click', () => run(() => loadLayout(l.name)));
      return li;
    });
    if (!items.length) items.push(el('li', 'empty', 'no layouts yet'));
    layoutsList.replaceChildren(...items);
    layoutsBox.replaceChildren(el('summary', null, `Layouts (${list.length})`), layoutsList);
  }

  /** Fills the grid, the tiles and the name from a layout; `boot` skips the preview rebuild (the page does it after). */
  async function loadLayout(name, { boot: atBoot = false } = {}) {
    if (!atBoot && state.dirty && state.placed.length && !win.confirm(`Replace the grid with "${name}"? Your unsaved changes are lost.`)) { say('not loaded'); return; }
    const layout = await get(`/layouts/${encodeURIComponent(name)}`);
    const hit = state.entries.find((e) => e.kind === 'layout' && e.name === name);
    const g = gridFromLayout(layout, state.entries);
    const changed = g.orientation !== state.orientation;
    if (changed) {
      state.orientation = g.orientation;
      state.px = PX_RANGE[g.orientation].start;
      state.guideOpen = g.orientation === 'portrait';
      drawGuide();
      state.panel = panelTiles(state.entries, g.orientation);
    }
    state.form = g.form;
    state.placed = g.placed;
    state.loaded = { name, own: Boolean(hit && hit.own), orientation: g.orientation };
    state.saved = null;
    state.dirty = false;
    nameIn.value = typeof layout.name === 'string' ? layout.name : name;
    clearNameMark();
    redraw();
    drawLayouts();
    if (changed && !atBoot) run(buildPreviews);
    say(g.skipped.length ? `loaded ${name} — skipped unknown tiles: ${g.skipped.join(', ')}` : `loaded ${name}`);
    if (!atBoot) editedDraft();
  }

  deleteBtn.addEventListener('click', () => run(async () => {
    const was = state.loaded;
    if (!was) return;
    if (!win.confirm(deleteConfirmText(was.name, was.own))) { say('not deleted'); return; }
    const res = await deleteLayout((u, o) => win.fetch(u, o), base, was.name);
    if (res.status !== 200) { say(`refused (${res.status}): ${(res.json && res.json.error) || 'no answer'}`); return; }
    // the deleted layout closes with the composer: back to the window's Settings page, same tab
    win.location.href = settingsUrl(base);
  }));

  // the name field: a Save without a name marks it (accent border, aria-invalid, focus)
  function clearNameMark() { nameIn.classList.remove('invalid'); nameIn.removeAttribute('aria-invalid'); }
  function markName() { nameIn.classList.add('invalid'); nameIn.setAttribute('aria-invalid', 'true'); nameIn.focus(); }

  // ── the controls ──
  function setForm(cols, rows) {
    const next = gridForm(state.orientation, cols, rows);
    const off = formFits(next, state.placed);
    if (off) { say(`refused: ${off.slice('outside:'.length)} would fall off a ${next.cols} × ${next.rows} grid`); drawBar(); return; }
    state.form = next;
    state.dirty = true;
    redraw();
    editedDraft();
  }
  colsIn.addEventListener('change', () => setForm(colsIn.value, state.form.rows));
  rowsIn.addEventListener('change', () => setForm(state.form.cols, rowsIn.value));
  pxIn.addEventListener('input', () => { state.px = Number(pxIn.value); redraw(); });
  nameIn.addEventListener('input', () => { state.dirty = true; clearNameMark(); drawBar(); });
  search.addEventListener('input', () => { state.query = search.value; drawPanel(); });
  function switchTo(next) {
    if (next === state.orientation) return;
    if (state.placed.length && !win.confirm('Switching the orientation clears the grid. Go on?')) return;
    state.orientation = next;
    state.form = gridForm(next);
    state.px = PX_RANGE[next].start;
    state.placed = [];
    state.loaded = null;
    state.guideOpen = next === 'portrait';
    drawGuide();
    state.panel = panelTiles(state.entries, next);
    run(buildPreviews);
    redraw();
    drawLayouts();
    say('');
    editedDraft();
  }
  clearBtn.addEventListener('click', () => {
    if (state.placed.length && !win.confirm('Remove every tile from the grid?')) return;
    state.placed = [];
    state.dirty = true;
    redraw();
    say('grid cleared');
    endDraft();
  });

  let queue = Promise.resolve();
  const run = (fn) => { queue = queue.then(fn).catch((e) => say(String((e && e.message) || e))); return queue; };

  async function loadCatalog() {
    state.entries = (await get('/catalog')).entries || [];
    state.panel = panelTiles(state.entries, state.orientation);
  }

  saveBtn.addEventListener('click', () => run(async () => {
    const body = layoutBody(nameIn.value, state.orientation, state.placed, state.form);
    const slug = nameSlug(body.name);
    if (!slug) { markName(); say('refused: the name needs 1–64 characters, without / \\ or ..'); return; }
    const mine = state.entries.find((e) => e.kind === 'layout' && e.own && e.name === slug);
    if (mine && !win.confirm(`Replace your layout "${slug}"?`)) { say('not saved'); return; }
    const res = await saveLayout((u, o) => win.fetch(u, o), base, body);
    if (res.status !== 201) {
      say(`refused (${res.status}): ${(res.json && res.json.error) || 'no answer'}`);
      return;
    }
    state.saved = res.json;
    state.dirty = false;
    state.loaded = { name: res.json.slug, own: true, orientation: state.orientation };
    endDraft();
    root.dataset.saved = res.json.slug;
    hudLink.href = `${base}/hud?layout=${encodeURIComponent(res.json.slug)}`;
    say(`saved ${res.json.path}${res.json.replaced ? ' (replaced)' : ''}`);
    drawBar();
    await loadCatalog();
    state.panel = panelTiles(state.entries, state.orientation);
    drawPanel();
    drawLayouts();
    redraw();
  }));

  run(async () => {
    const settings = await get('/settings');
    state.unitMax = settings.unit_max;
    const light = win.matchMedia && win.matchMedia('(prefers-color-scheme: light)').matches;
    const theme = settings.theme === 'light' || settings.theme === 'dark' ? settings.theme : light ? 'light' : 'dark';
    const html = doc.documentElement;
    html.dataset.theme = theme;
    if (html.style && typeof html.style.setProperty === 'function') for (const [n, v] of themeOverrides(settings, theme)) html.style.setProperty(n, v);
    // the previews draw the session the HUD shows by default; without one, the tiles draw empty
    try {
      const current = (await get('/sessions')).current || null;
      if (current) state.data = { ...(await get(`/sessions/${encodeURIComponent(current)}`)), hud: { current, pinned: false, sessions: [] } };
    } catch { state.data = null; }
    await loadCatalog();
    const asked = new URLSearchParams(String(loc.search || '')).get('layout');
    if (asked) { try { await loadLayout(asked, { boot: true }); } catch (e) { say(`could not load "${asked}": ${(e && e.message) || e}`); } }
    redraw();
    drawLayouts();
    await buildPreviews();
    editedDraft();   // the composer is open: the HUD shows the frame from now on
  });
  redraw();

  return { state, ready: () => queue };
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · STORE
//
//  Everything the node reads or writes on disk that is NOT a transcript:
//   · the aihud home (`~/.aihud`, overridable via `AIHUD_HOME` or `--home`)
//   · `settings.json` (defaults when missing) — WRITE WAY 3 (`writeSettings`, the window's Settings)
//   · the sidecar of a session (`<home>/sessions/<sessionId>.json`) — WRITE WAY 1
//   · layouts (`<home>/layouts/<slug>.json`) — WRITE WAY 2; a deleted layout moves to
//     `<home>/layouts/trash/` (never a hard delete, `deleteLayout`)
//   · the tile/layout catalog and the SVG folder (read only)
//
//  THE WRITE RULE: all three write ways end in `writeInside()`, which refuses every target that does
//  not resolve inside the aihud home. Nothing here ever writes under `~/.claude/`.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { aihudHome as readerAihudHome, readSidecar } from '../reader/extras.js';
import { ASSUMED_WINDOW_BOUNDS } from '../reader/parser-antigravity.js';
import { basename, dirname, extname, join, relative, resolve, sep, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { layoutViolation, LAYOUT_FILE } from './layout-schema.js';

/** The package root (`aihud/`), where the shipped `tiles/`, `layouts/` and `svg/` live. */
export const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Defaults of `settings.json`. A missing file means exactly these; a present file is merged over them.
 * `layout_portrait` / `layout_landscape`: catalog names (file slugs) of the two layouts the HUD
 * switches between; `landscape_ratio`: inner width / inner height at or above which the HUD shows
 * the landscape layout; `unit_max`: the largest grid unit in px (the base unit, 22.5 px at 180 px
 * inner width — the largest unit the sketches were fit-checked at).
 */
export const DEFAULT_SETTINGS = Object.freeze({
  port: 4747, layout_portrait: 'essentials-portrait', layout_landscape: 'essentials-landscape', landscape_ratio: 1, unit_max: 22.5,
});

/**
 * The keys `settings.json` may carry beyond the defaults — optional, absent = the stated default:
 * `theme` (`system` | `dark` | `light`; absent = the system preference), `design_variables`
 * (`{dark: {<--aihud-…>: value}, light: {…}}`, overrides of `tiles/contract.json designVariables`;
 * absent = none), `last_tab` (the window tab last open, one of `LAST_TAB_NAMES`; absent = Live), `welcome_seen` (the introduction's (Start tab) marker; absent = not seen yet), `projects`
 * (the transcript folder, used when neither `--projects` nor `AIHUD_PROJECTS` names one), `windows`
 * (`{antigravity: {default: <tokens>}}`, the context window size ASSUMED for Antigravity, whose transcript names none; absent = no percent).
 */
export const OPTIONAL_SETTINGS = Object.freeze(['theme', 'design_variables', 'welcome_seen', 'projects', 'windows', 'last_tab']);
/** The window tabs `last_tab` may name (a test holds it equal to `window/window.js TABS`; a tab added later is added here too). */
export const LAST_TAB_NAMES = Object.freeze(['live', 'layouts', 'settings', 'analysis']);
/** Keys only the window reads (its tab memory); the HUD ignores a `settings-changed` naming only these (`hud/hud.js WINDOW_ONLY_SETTINGS`, a test holds the two equal). */
export const WINDOW_ONLY_SETTINGS = Object.freeze(['last_tab']);
/** Bounds of the two layout limits, checked on write (the HUD itself only needs them > 0). */
export const SETTINGS_BOUNDS = Object.freeze({ landscape_ratio: [0.25, 4], unit_max: [15, 45], unit_step: 0.5 });
const DESIGN_VARIABLES = JSON.parse(readFileSync(new URL('../tiles/contract.json', import.meta.url), 'utf8')).designVariables;

/** The four sidecar keys — shared with the reader, which reads the same file. */
export const SIDECAR_KEYS = Object.freeze(['title', 'note', 'closed', 'closed_at']);
export const LAYOUT_KEYS = Object.freeze(['name', 'orientation', 'tiles']);
export const ORIENTATIONS = Object.freeze(['portrait', 'landscape']);

const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
const SVG_NAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,127}\.svg$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_TEXT = 2000;

/** A refusal with an HTTP status — the server maps it 1:1, the CLI prints it. */
export class Refusal extends Error {
  constructor(status, reason) { super(reason); this.status = status; this.reason = reason; }
}

/**
 * The aihud home — ONE truth, the reader's (`reader/extras.js aihudHome`): explicit option →
 * `AIHUD_HOME` → `<user home>/.aihud`. Resolved to an absolute path here.
 */
export function aihudHome(explicit) {
  const home = readerAihudHome({ aihudHome: explicit || null });
  if (!home) throw new Refusal(500, 'no_aihud_home_user_home_unknown');
  return resolve(home);
}

/** Is `target` inside `root` (or `root` itself)? Resolved paths, no string prefix tricks. */
export function isInside(root, target) {
  const rel = relative(resolve(root), resolve(target));
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel));
}

/** The real path of `p`, or of its nearest existing ancestor with the missing rest appended. */
function realish(p) {
  const missing = [];
  let cur = resolve(p);
  for (;;) {
    try { return join(realpathSync(cur), ...missing.reverse()); } catch { /* not there yet */ }
    const up = dirname(cur);
    if (up === cur) return resolve(p);
    missing.push(basename(cur));
    cur = up;
  }
}

/**
 * Refuses an aihud home that lies inside Claude Code's own folders: any `.claude` path segment,
 * or inside the transcript folder. Checked on the real path (links followed).
 */
export function checkHome(home, { projects } = {}) {
  const real = realish(home);
  if (real.split(/[\\/]/).some((seg) => seg.toLowerCase() === '.claude')) throw new Refusal(400, 'aihud_home_inside_a_claude_folder');
  if (projects && isInside(realish(projects), real)) throw new Refusal(400, 'aihud_home_inside_the_transcript_folder');
  return real;
}

/**
 * The ONE write path of the node. Refuses anything outside `home` — by path AND by real path, so
 * a link inside the home cannot carry a write outside. Writes via a temp file + rename, so a
 * reader never sees half a JSON file.
 */
export function writeInside(home, target, value) {
  if (!isInside(home, target) || resolve(target) === resolve(home)) {
    throw new Refusal(400, 'target_outside_aihud_home');
  }
  mkdirSync(home, { recursive: true });
  const realHome = realpathSync(home);
  // before creating any folder: the deepest existing ancestor must really be inside the home
  if (!isInside(realHome, realish(dirname(target)))) throw new Refusal(400, 'target_outside_aihud_home');
  mkdirSync(dirname(target), { recursive: true });
  if (!isInside(realHome, realpathSync(dirname(target)))) throw new Refusal(400, 'target_outside_aihud_home');
  const tmp = `${target}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  renameSync(tmp, target);
  return target;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

// ── settings ────────────────────────────────────────────────────────────────

/** `settings.json` merged over the defaults. A broken file is a loud 500, never silently the defaults. */
export function readSettings(home) {
  const path = join(home, 'settings.json');
  if (!existsSync(path)) return { ...DEFAULT_SETTINGS };
  let file;
  try { file = readJson(path); } catch { throw new Refusal(500, 'settings_json_unreadable'); }
  if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Refusal(500, 'settings_json_not_an_object');
  return { ...DEFAULT_SETTINGS, ...file };
}

/** A design variable's kind, from its shipped dark value: `[shape, refusal reason]`. */
function variableKind(def) {
  if (/^#[0-9a-f]{6}$/i.test(def.dark)) return [/^#[0-9a-f]{6}$/i, 'not_a_hex_colour'];
  if (/^\d+(\.\d+)?px$/.test(def.dark)) return [/^\d{1,2}(\.\d+)?px$/, 'not_a_px_length'];
  if (/^\d+(\.\d+)?$/.test(def.dark)) return [/^(0(\.\d+)?|1(\.0+)?)$/, 'not_a_number_0_to_1'];
  return [/^[A-Za-z0-9 ,'"_-]{1,200}$/, 'not_a_font_list'];
}

/**
 * Checks a settings patch key by key against the shape of the defaults plus `OPTIONAL_SETTINGS`.
 * `null` removes a key (its default applies again). `layouts`: the catalog's entries — a layout key
 * must name a loadable layout of its own orientation. Refusal: `400 settings_invalid:<key>:<reason>`.
 */
export function validateSettings(patch, layouts = []) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Refusal(400, 'body_not_an_object');
  const bad = (key, reason) => { throw new Refusal(400, `settings_invalid:${key}:${reason}`); };
  for (const [key, v] of Object.entries(patch)) {
    if (!Object.hasOwn(DEFAULT_SETTINGS, key) && !OPTIONAL_SETTINGS.includes(key)) bad(key, 'unknown_key');
    if (v === null) continue;
    if (key === 'port' && !(Number.isInteger(v) && v >= 1 && v <= 65535)) bad(key, 'not_an_integer_1_to_65535');
    if (key === 'layout_portrait' || key === 'layout_landscape') {
      const want = key === 'layout_portrait' ? 'portrait' : 'landscape';
      const hit = typeof v === 'string' && layouts.find((e) => e.kind === 'layout' && e.name === v && e.loadable !== false);
      if (!hit) bad(key, 'unknown_layout');
      if (!hit.meta || hit.meta.orientation !== want) bad(key, `not_a_${want}_layout`);
    }
    if (key === 'landscape_ratio' || key === 'unit_max') {
      const [lo, hi] = SETTINGS_BOUNDS[key];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) bad(key, `out_of_bounds_${lo}_to_${hi}`);
      if (key === 'unit_max' && !Number.isInteger(v / SETTINGS_BOUNDS.unit_step)) bad(key, `not_a_multiple_of_${SETTINGS_BOUNDS.unit_step}`);
    }
    if (key === 'theme' && !['system', 'dark', 'light'].includes(v)) bad(key, 'not_system_dark_or_light');
    if (key === 'welcome_seen' && typeof v !== 'boolean') bad(key, 'not_a_boolean');
    if (key === 'last_tab' && !LAST_TAB_NAMES.includes(v)) bad(key, 'not_a_tab_name');
    if (key === 'projects' && (typeof v !== 'string' || v.length > 1024 || !isAbsolute(v) || /[\u0000-\u001f]/.test(v))) bad(key, 'not_an_absolute_path');
    if (key === 'windows') {
      const ok = isPlainObject(v) && Object.keys(v).every((p) => p === 'antigravity') && (!v.antigravity || (isPlainObject(v.antigravity)
        && Object.keys(v.antigravity).every((m) => m === 'default') && (!('default' in v.antigravity) || (Number.isInteger(v.antigravity.default) && v.antigravity.default >= ASSUMED_WINDOW_BOUNDS[0] && v.antigravity.default <= ASSUMED_WINDOW_BOUNDS[1]))));
      if (!ok) bad(key, 'not_antigravity_default_tokens_1000_to_100000000');
    }
    if (key === 'design_variables') {
      const ok = isPlainObject(v) && Object.keys(v).every((t) => t === 'dark' || t === 'light') && isPlainObject(v.dark) && isPlainObject(v.light);
      if (!ok) bad(key, 'not_dark_and_light_objects');
      for (const t of ['dark', 'light']) {
        for (const [name, value] of Object.entries(v[t])) {
          const def = DESIGN_VARIABLES.find((d) => d.name === name);
          if (!def) bad(key, `${t}.${name}:unknown_variable`);
          const [shape, reason] = variableKind(def);
          if (typeof value !== 'string' || !shape.test(value)) bad(key, `${t}.${name}:${reason}`);
        }
      }
    }
  }
  return patch;
}

/**
 * Merges `patch` into `settings.json` per top-level key (`null` removes one) and returns the
 * settings as `readSettings` reads them. Only the file's own keys plus the patch are written — the
 * defaults are never frozen into the file. A file that exists but does not read is refused, never
 * overwritten.
 */
export function writeSettings(home, patch, layouts = []) {
  validateSettings(patch, layouts);
  const path = join(home, 'settings.json');
  let file = {};
  if (existsSync(path)) {
    try { file = readJson(path); } catch { throw new Refusal(500, 'settings_json_unreadable'); }
    if (!file || typeof file !== 'object' || Array.isArray(file)) throw new Refusal(500, 'settings_json_not_an_object');
  }
  const merged = { ...file, ...patch };
  for (const [k, v] of Object.entries(patch)) if (v === null) delete merged[k];
  writeInside(home, path, merged);
  return readSettings(home);
}

// ── sidecar (write way 1) ───────────────────────────────────────────────────

export function sidecarPath(home, sessionId) {
  if (!SESSION_ID.test(String(sessionId || ''))) throw new Refusal(400, 'invalid_session_id');
  return join(home, 'sessions', `${sessionId}.json`);
}

/** Checks a sidecar patch: an object with only the four keys, each with its type. */
export function validateSidecar(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Refusal(400, 'body_not_an_object');
  const extra = Object.keys(patch).filter((k) => !SIDECAR_KEYS.includes(k));
  if (extra.length) throw new Refusal(400, `unknown_keys:${extra.join(',')}`);
  for (const k of ['title', 'note']) {
    if (k in patch && (typeof patch[k] !== 'string' || patch[k].length > MAX_TEXT)) throw new Refusal(400, `invalid_${k}`);
  }
  if ('closed' in patch && typeof patch.closed !== 'boolean') throw new Refusal(400, 'invalid_closed');
  if ('closed_at' in patch && (typeof patch.closed_at !== 'string' || !ISO.test(patch.closed_at) || Number.isNaN(Date.parse(patch.closed_at)))) {
    throw new Refusal(400, 'invalid_closed_at');
  }
  return patch;
}

/**
 * Merges `patch` into the sidecar file and returns the merged object. The current file is read
 * through the READER (`reader/extras.js readSidecar`, the one sidecar reader of aihud); a file
 * that exists but the reader cannot read is refused, never overwritten. Fields the reader drops
 * (wrong type, unknown key) do not survive a write.
 */
export function writeSidecar(home, sessionId, patch) {
  validateSidecar(patch);
  const path = sidecarPath(home, sessionId);
  const current = readSidecar(sessionId, { aihudHome: home, withText: true });
  if (current == null && existsSync(path)) throw new Refusal(500, 'sidecar_unreadable');
  const merged = { ...(current || {}), ...patch };
  writeInside(home, path, merged);
  return merged;
}

// ── layouts (write way 2) ───────────────────────────────────────────────────

/** `"My Layout 2"` → `"my-layout-2"`. Path separators are refused before, not slugged away. */
export function layoutSlug(name) {
  if (typeof name !== 'string' || !name.trim() || name.length > 64) throw new Refusal(400, 'invalid_name');
  if (/[\\/]|\.\.|[\u0000-\u001f]/.test(name)) throw new Refusal(400, 'invalid_name');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Refusal(400, 'invalid_name');
  return slug;
}

/**
 * Stores a layout as given, after the layout schema check (`layout-schema.js`) against the tile
 * catalog `tiles` (entries of `catalog()`): unknown tile, a placement off the grid or on top of
 * another → `400 layout_invalid:<path>:<reason>`. Without a catalog every named tile is unknown.
 */
export function writeLayout(home, body, tiles = []) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Refusal(400, 'body_not_an_object');
  const extra = Object.keys(body).filter((k) => !LAYOUT_KEYS.includes(k) && !LAYOUT_FILE.optionalKeys.includes(k));
  const missing = LAYOUT_KEYS.filter((k) => !(k in body));
  if (extra.length) throw new Refusal(400, `unknown_keys:${extra.join(',')}`);
  if (missing.length) throw new Refusal(400, `missing_keys:${missing.join(',')}`);
  if (!ORIENTATIONS.includes(body.orientation)) throw new Refusal(400, 'invalid_orientation');
  if (!Array.isArray(body.tiles)) throw new Refusal(400, 'invalid_tiles');
  const slug = layoutSlug(body.name);
  const violation = layoutViolation(body, tiles);
  if (violation) throw new Refusal(400, `layout_invalid:${violation}`);
  const path = join(home, 'layouts', `${slug}.json`);
  const replaced = existsSync(path);
  writeInside(home, path, body);
  return { slug, path, replaced };
}

// ── layout delete and the draft ──────────────────────────────────────

/** The file names in `<home>/layouts/trash/` that hide a shipped layout: `<slug>.hidden.json`. */
function hiddenShipped(home) {
  return new Set(listFiles(join(home, 'layouts', 'trash'), ['.json']).map((p) => basename(p))
    .filter((n) => n.endsWith('.hidden.json')).map((n) => n.slice(0, -'.hidden.json'.length)));
}

/**
 * Deletes a layout by its catalog name, never hard: an OWN layout moves to
 * `<home>/layouts/trash/<name>-<iso>.json`; a SHIPPED one (a package file that cannot move) gets the
 * marker `<home>/layouts/trash/<name>.hidden.json` (its body + `"hidden_shipped": true`), which the
 * catalog honours. Same fences as `writeLayout`: a name without separators, every path inside the
 * aihud home by real path. `entries` = the catalog. `404 unknown_layout` for a name it does not list.
 * Returns `{name, own, trashed}`.
 */
export function deleteLayout(home, name, entries = []) {
  if (typeof name !== 'string' || !name.trim() || name.length > 64 || /[\\/]|\.\.|[\u0000-\u001f]/.test(name)) throw new Refusal(400, 'invalid_name');
  const hit = entries.find((e) => e.kind === 'layout' && e.name === name);   // own first, as the catalog orders
  if (!hit) throw new Refusal(404, 'unknown_layout');
  const dir = join(home, 'layouts', 'trash');
  mkdirSync(home, { recursive: true });
  const realHome = realpathSync(home);
  const inside = (p) => isInside(realHome, realish(p));
  if (!hit.own) {
    let body = {};
    try { body = readJson(hit.path); } catch { /* an unreadable shipped file still gets hidden */ }
    const marker = join(dir, `${name}.hidden.json`);
    writeInside(home, marker, { ...(body && typeof body === 'object' && !Array.isArray(body) ? body : {}), hidden_shipped: true });
    return { name, own: false, trashed: marker };
  }
  if (!isInside(home, hit.path) || !inside(dirname(hit.path)) || !inside(dir)) throw new Refusal(400, 'target_outside_aihud_home');
  mkdirSync(dir, { recursive: true });
  if (!isInside(realHome, realpathSync(dir))) throw new Refusal(400, 'target_outside_aihud_home');
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  let target = join(dir, `${name}-${iso}.json`);
  for (let i = 2; existsSync(target); i++) target = join(dir, `${name}-${iso}-${i}.json`);
  renameSync(hit.path, target);
  return { name, own: true, trashed: target };
}

/**
 * The layout settings fall back to when the one they name is gone: the default shipped layout of
 * the orientation if the catalog (`entries`, AFTER the delete) still lists it, else the first
 * remaining shipped layout of that orientation (by name, probes last), else the first of any
 * kind; `null` when nothing is left (the key is then removed).
 */
export function layoutFallback(entries, orientation) {
  const key = orientation === 'landscape' ? 'layout_landscape' : 'layout_portrait';
  const fit = entries.filter((e) => e.kind === 'layout' && e.loadable !== false && e.meta && e.meta.orientation === orientation);
  const shipped = fit.filter((e) => !e.own);
  const hit = shipped.find((e) => e.name === DEFAULT_SETTINGS[key])
    || shipped.find((e) => !e.name.startsWith('probe-')) || shipped[0] || fit[0];
  return hit ? hit.name : null;
}

/** The size limits of a composer draft grid (the composer's `FORM_MAX`). */
const DRAFT_MAX = Object.freeze({ cols: 120, rows: 60 });

/**
 * Checks a draft body `{orientation, cols, rows, tiles:[{tile, col, row}]}` (the composer's live
 * grid, `POST /layouts/draft`) with the layout schema against the tile catalog `tiles`; the draft is
 * never stored. `400 draft_invalid:<path>[:<reason>]`. Returns the body in key order.
 */
export function validateDraft(body, tiles = []) {
  const bad = (what) => { throw new Refusal(400, `draft_invalid:${what}`); };
  if (!body || typeof body !== 'object' || Array.isArray(body)) bad('body');
  for (const k of Object.keys(body)) if (!['orientation', 'cols', 'rows', 'tiles'].includes(k)) bad(`unknown_key_${k}`);
  if (!ORIENTATIONS.includes(body.orientation)) bad('orientation');
  const landscape = body.orientation === 'landscape';
  const isInt = (v, max) => Number.isInteger(v) && v >= 1 && v <= max;
  if (!isInt(body.cols, landscape ? DRAFT_MAX.cols : LAYOUT_FILE.portraitMaxCols)) bad('cols');
  if (!isInt(body.rows, landscape ? LAYOUT_FILE.landscapeMaxRows : DRAFT_MAX.rows)) bad('rows');
  if (!Array.isArray(body.tiles)) bad('tiles');
  const violation = layoutViolation({ name: 'draft', orientation: body.orientation, tiles: body.tiles }, tiles);
  if (violation) bad(violation);
  return { orientation: body.orientation, cols: body.cols, rows: body.rows, tiles: body.tiles };
}

// ── catalog (read only) ─────────────────────────────────────────────────────

function listFiles(dir, exts) {
  let names;
  try { names = readdirSync(dir); } catch { return []; }
  return names
    .filter((n) => exts.includes(extname(n)) && !/\.test\.[cm]?js$/.test(n))
    .map((n) => join(dir, n))
    .filter((p) => { try { return statSync(p).isFile(); } catch { return false; } });
}

const isPlainObject = (v) => v != null && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));

/**
 * What a tile file is, per the tile contract (`tiles/CONTRACT.md`: every tile exports `render`
 * and `meta`). A module that imports but lacks that pair is NOT a tile → `null` (left out of the
 * catalog). A module that fails to import is listed with `loadable: false` — it may be a broken
 * tile, and hiding it would hide the error from its author.
 */
const META_CACHE = new Map();   // path -> { mtimeMs, result }
async function tileMeta(path) {
  let mtimeMs = 0;
  try { mtimeMs = statSync(path).mtimeMs; } catch { /* listed a moment ago */ }
  const hit = META_CACHE.get(path);
  if (hit && hit.mtimeMs === mtimeMs) return hit.result;
  let result;
  try {
    const mod = await import(`${pathToFileURL(path).href}?v=${mtimeMs}`);
    result = typeof mod.render === 'function' && isPlainObject(mod.meta)
      ? { loadable: true, meta: JSON.parse(JSON.stringify(mod.meta)) }
      : null;
  } catch (e) {
    result = { loadable: false, error: String((e && e.message) || e).split('\n')[0].slice(0, 200) };
  }
  META_CACHE.set(path, { mtimeMs, result });
  return result;
}

function layoutMeta(path) {
  try {
    const v = readJson(path);
    return { loadable: true, ...(ORIENTATIONS.includes(v && v.orientation) ? { meta: { orientation: v.orientation } } : {}) };
  } catch {
    return { loadable: false, error: 'layout_json_unreadable' };
  }
}

/**
 * The tile/layout catalog: shipped (package) and own (`<home>/tiles`, `<home>/layouts`).
 * Entry: `{name, path, own, kind: "tile"|"layout", mtime_ms, loadable, meta?, error?}` — `mtime_ms` is
 * the file's modification time (read, never set), so a page can list own entries newest first.
 * Order: own first, then tiles before layouts, then by name. Own tiles are IMPORTED to read their
 * `meta` — their top-level code runs in this process.
 */
export async function catalog(home, { packageDir = PACKAGE_DIR } = {}) {
  const sources = [
    { dir: join(packageDir, 'tiles'), own: false, kind: 'tile' },
    { dir: join(home, 'tiles'), own: true, kind: 'tile' },
    { dir: join(packageDir, 'layouts'), own: false, kind: 'layout' },
    { dir: join(home, 'layouts'), own: true, kind: 'layout' },
  ];
  const entries = [];
  const hidden = hiddenShipped(home);
  for (const s of sources) {
    const files = listFiles(s.dir, s.kind === 'tile' ? ['.js', '.mjs'] : ['.json']);
    for (const path of files) {
      if (s.kind === 'layout' && !s.own && hidden.has(basename(path, extname(path)))) continue;   // deleted in the composer
      const extra = s.kind === 'tile' ? await tileMeta(path) : layoutMeta(path);
      if (!extra) continue;   // imports, but is not a tile (no render + meta)
      let mtimeMs = 0;
      try { mtimeMs = statSync(path).mtimeMs; } catch { /* listed a moment ago */ }
      entries.push({ name: basename(path, extname(path)), path, own: s.own, kind: s.kind, mtime_ms: mtimeMs, ...extra });
    }
  }
  const rank = (e) => `${e.own ? 0 : 1}${e.kind === 'tile' ? 0 : 1}${e.name}`;
  return entries.sort((a, b) => rank(a).localeCompare(rank(b)));
}

// ── svg folder (read only) ──────────────────────────────────────────────────

/** Shipped symbols (`aihud/svg/`) and own ones (`<home>/svg/`); an own file shadows a shipped one. */
export function svgList(home, { packageDir = PACKAGE_DIR } = {}) {
  const byName = new Map();
  for (const [dir, own] of [[join(packageDir, 'svg'), false], [join(home, 'svg'), true]]) {
    for (const path of listFiles(dir, ['.svg'])) {
      const name = basename(path);
      if (SVG_NAME.test(name)) byName.set(name, { name, own, url: `/svg/${name}`, path });
    }
  }
  return [...byName.values()].sort((a, b) => (a.own === b.own ? a.name.localeCompare(b.name) : a.own ? -1 : 1));
}

/** One SVG file by name, or `null`. The name is checked against the listing, never joined blind. */
export function svgFile(home, name, opt) {
  if (!SVG_NAME.test(String(name || ''))) return null;
  const hit = svgList(home, opt).find((s) => s.name === name);
  return hit ? readFileSync(hit.path) : null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE WINDOW
//
//  One page, `GET /window`, four tabs: Live · Layouts · Settings · Analysis (Start in front until the intro is done). A click on the HUD opens it
//  with the HUD's session (`/window?session=<id>`); without `?session=` it shows the session the
//  HUD shows by default (the node's `current`, the youngest of the start folder). Read-only.
//   · Live      — the two layouts of the settings, stacked: landscape on top, portrait below at the
//                 strip width, each drawn by the HUD itself in a frame (`/hud?layout=<name>&session=<id>`),
//                 no second renderer. The frames wear the window's theme (their HUD listens itself).
//   · Analysis  — the value catalog: one row per `fields` entry of `tiles/contract.json`
//                 (path · meaning · unit · source · live value of the session). A missing value
//                 is a visible gap `—`, never invented.
//   · Settings  — one page, four sections (Colours · Size · Folders & port · About), an
//                 index on the left and a dark + light preview on the right. The Layouts tab holds two rows
//                 of cards drawn with the real tiles, mini-scaled (own first, newest saved first; the probe
//                 pair hidden; a tile that cannot draw leaves grey blocks), the theme control (Auto · Dark ·
//                 Light) on top,
//                 one colour row per design variable (dark + light side by side). Every change is
//                 saved on its own after a short pause: only the changed keys go through
//                 `POST /settings`, the node's one settings write way; the head says `saved hh:mm:ss`.
//  The head carries the wordmark, the tabs and the session id; the window wears the settings' theme.
//  `#live` / `#layouts` / `#settings` / `#analysis` in the address picks the tab (else the remembered `last_tab`, else Live).
//  The first tab "Start" (a three-step list) shows on every open until the intro is finished or skipped; only then
//  its marker `welcome_seen` is set in `settings.json` (and `last_tab` = layouts). Start is never a stored tab.
//  Settings has "Show introduction again" (a button in the header of its last section, Guide). Analysis wears a permanent 30-day badge.
//
//  The functions above `boot` are pure (no DOM) and tested directly.
// ─────────────────────────────────────────────────────────────────────────────

import { GRID, WINDOW_ONLY_SETTINGS, folderOf, isProbe, themeOverrides, tileSize, unitFor } from '../hud/hud.js';
import { FLOOR_INNER_PX } from '../composer/composer.js';

export const TABS = Object.freeze(['live', 'layouts', 'settings', 'analysis']);
/** The tab a window opens on when nothing else names a valid one — by NAME, never by position (a Start tab may come first). */
export const FALLBACK_TAB = 'live';
/** The Start tab: in front while the intro is due, never in `TABS` (so never a `last_tab`). */
export const START_TAB = 'start';
export const GAP = '—';
/** The defaults of `settings.json` the form names — `node/store.js DEFAULT_SETTINGS` (a test holds the two together). */
export const DEFAULTS = Object.freeze({ port: 4747, layout_portrait: 'essentials-portrait', layout_landscape: 'essentials-landscape', landscape_ratio: 1, unit_max: 22.5 });
// shipped Antigravity window default (not a node setting key) = `ASSUMED_WINDOW_DEFAULT` of reader/parser-antigravity.js (a browser module does not import the reader; a test pins them equal)
export const ANTIGRAVITY_WINDOW_DEFAULT = 1_048_576;
const MAX_TEXT = 160;

/** The session named in the page address (`?session=<id>`), or `null`. */
export function sessionParam(search) {
  const id = new URLSearchParams(String(search || '')).get('session');
  return id && id.trim() ? id.trim() : null;
}

/** The tab named in the address hash, else `FALLBACK_TAB` (by name, not `TABS[0]`). */
export function tabOf(hash, tabs = TABS) {
  const t = String(hash || '').replace(/^#/, '');
  return tabs.includes(t) ? t : FALLBACK_TAB;
}

/**
 * The tab a window opens on. Priority: a valid address hash > Start (while it is in `tabs` and the intro is due)
 * > the remembered `last_tab` > `FALLBACK_TAB`. A name that is no longer a tab (a removed tab, a stale hash) is
 * skipped to the next rule, and the end is the name `live`, never the first tab. `start` is never a remembered tab.
 */
export function initialTab(hash, settings, tabs = TABS) {
  const valid = (v) => (typeof v === 'string' && tabs.includes(v) ? v : null);
  return valid(String(hash || '').replace(/^#/, ''))
    || (tabs.includes(START_TAB) && showWelcome(settings) ? START_TAB : null)
    || (settings && settings.last_tab !== START_TAB ? valid(settings.last_tab) : null)
    || FALLBACK_TAB;
}

const has = (v) => v !== undefined;

/**
 * Resolves a contract field path against a sheet. `a[]` walks a list, `<key>` walks an object's
 * keys; both take the FIRST element that carries a value at the rest of the path, and say which
 * (`at`, e.g. `turn.turns[3 of 12].tool_stats[0 of 2].tool`). A plain path has no `at`.
 * @returns {{value: any, at: string|null}}  `value` undefined = not delivered
 */
export function resolvePath(sheet, path) {
  const steps = String(path).split('.').flatMap((s) => (s.endsWith('[]') ? [s.slice(0, -2), '[]'] : [s]));
  let wild = false;
  function walk(node, i, at) {
    if (i === steps.length) return has(node) ? { value: node, at } : null;
    const s = steps[i];
    if (s === '[]') {
      wild = true;
      if (!Array.isArray(node)) return null;
      for (let k = 0; k < node.length; k++) {
        const hit = walk(node[k], i + 1, `${at}[${k} of ${node.length}]`);
        if (hit) return hit;
      }
      return null;
    }
    if (node === null || typeof node !== 'object' || Array.isArray(node)) return null;
    if (s === '<key>') {
      wild = true;
      for (const k of Object.keys(node)) {
        const hit = walk(node[k], i + 1, `${at}${at ? '.' : ''}${k}`);
        if (hit) return hit;
      }
      return null;
    }
    return Object.hasOwn(node, s) ? walk(node[s], i + 1, `${at}${at ? '.' : ''}${s}`) : null;
  }
  const hit = walk(sheet, 0, '');
  return { value: hit ? hit.value : undefined, at: hit && wild ? hit.at : null };
}

/** A value as one line of text: lists of records as `n=<count>`, everything else compact JSON. */
export function formatValue(v) {
  if (v === undefined) return GAP;
  if (typeof v === 'string') return v.length > MAX_TEXT ? `${v.slice(0, MAX_TEXT)}…` : v;
  if (Array.isArray(v) && v.some((x) => x !== null && typeof x === 'object')) return `n=${v.length}`;
  const s = JSON.stringify(v);
  return s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT)}…` : s;
}

/** The catalog: one row per contract field, in contract order, with the session's live value. */
export function catalogRows(fields, sheet) {
  return (Array.isArray(fields) ? fields : []).map((f) => {
    const { value, at } = resolvePath(sheet || {}, f.path);
    return {
      path: f.path, meaning: f.meaning || '', unit: f.unit || '', source: f.source || '',
      value: formatValue(value), at, missing: value === undefined,
    };
  });
}

/** The rows whose path or meaning contains `query` (case-insensitive); all for an empty query. */
export function filterRows(rows, query) {
  const q = String(query || '').trim().toLowerCase();
  return q ? rows.filter((r) => `${r.path} ${r.meaning}`.toLowerCase().includes(q)) : rows;
}

/** The 30-day note (permanent badge at the top of Analysis), in three parts: text · the setting's name (shown as code) · text. */
export const WELCOME_NOTE = Object.freeze(['Claude Code deletes sessions after 30 days (', 'cleanupPeriodDays', ') — raise it if you want history.']);

/** Is the intro (the Start tab) due? Until its marker is set in the settings. */
export function showWelcome(settings) {
  return !(settings && settings.welcome_seen === true);
}

/** The shipped styles in contract order — the order of the shipped layouts in the choice. */
export const STYLE_ORDER = Object.freeze(['essentials', 'standard', 'minimal', 'fancy-a', 'fancy-b']);
const styleRank = (name) => { const i = STYLE_ORDER.findIndex((st) => String(name).startsWith(`${st}-`)); return i < 0 ? STYLE_ORDER.length : i; };

/**
 * The layouts of one orientation from the catalog entries, for a layout choice:
 * own first, newest saved first (`mtime_ms`); then the shipped ones in style order standard ·
 * minimal · fancy-a · fancy-b. The probe pair stays out — unless it is `keep`, the chosen one, which
 * is never hidden. `[{name, own, mtime_ms}]`. Unloadable layouts are left out.
 */
export function layoutChoices(entries, orientation, keep = null) {
  return (Array.isArray(entries) ? entries : [])
    .filter((e) => e.kind === 'layout' && e.loadable !== false && e.meta && e.meta.orientation === orientation
      && (!isProbe(e) || e.name === keep))
    .map((e) => ({ name: e.name, own: Boolean(e.own), mtime_ms: Number(e.mtime_ms) || 0, probe: isProbe(e) }))
    .sort((a, b) => {
      if (a.own !== b.own) return a.own ? -1 : 1;
      if (a.probe !== b.probe) return a.probe ? 1 : -1;
      if (a.own) return b.mtime_ms - a.mtime_ms || a.name.localeCompare(b.name);
      return styleRank(a.name) - styleRank(b.name) || a.name.localeCompare(b.name);
    })
    .map(({ name, own, mtime_ms }) => ({ name, own, mtime_ms }));
}

/** The composer opened on one layout — the target of a layout card's edit control. */
export function composerEditUrl(name) {
  return `/composer?layout=${encodeURIComponent(String(name))}`;
}

// a 16 px pencil, stroked in the button's text colour
const PENCIL_SVG = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.5 2.5l3 3L6 13H3v-3z"/><path d="M9 4l3 3"/></svg>';

/**
 * A layout drawn to scale for its card: one block per placement, `k` px per grid unit (2 in
 * portrait, 1.6 in landscape), a 1 px gap. `sizes` maps a tile name to `{cols, rows, context}`.
 * Answers `{cols, rows, blocks: [{left, top, width, height, context}]}`; a tile without a size is
 * left out (the HUD marks it, the card does not guess).
 */
export function layoutThumb(layout, sizes, orientation) {
  const k = orientation === 'landscape' ? 1.6 : 2;
  const blocks = [];
  const f = layout && layout.form && Number.isInteger(layout.form.cols) && Number.isInteger(layout.form.rows) ? layout.form : null;
  let cols = orientation === 'portrait' ? 8 : 0;
  let rows = 0;
  if (f) { cols = Math.max(cols, f.cols); rows = f.rows; }
  for (const p of (layout && Array.isArray(layout.tiles) ? layout.tiles : [])) {
    const s = sizes && sizes.get ? sizes.get(p.tile) : null;
    if (!s || !Number.isInteger(p.col) || !Number.isInteger(p.row)) continue;
    cols = Math.max(cols, p.col + s.cols);
    rows = Math.max(rows, p.row + s.rows);
    const r = (v) => Math.round(v * 10) / 10;
    blocks.push({ left: r(p.col * k), top: r(p.row * k), width: r(s.cols * k - 1), height: r(s.rows * k - 1), context: Boolean(s.context) });
  }
  return { cols, rows, k, width: Math.round(cols * k), height: Math.round(rows * k), blocks };
}

// ── layout previews: a layout drawn with its real tiles, mini-scaled, for the Settings cards ──
// Like the composer's tile panel (composer.js `panelItem`): every tile renders at 20 px per grid unit,
// the whole layout is one box scaled down by CSS `transform: scale(k)`, so a tile draws exactly as the
// HUD draws it, only small. No click reaches a tile (the card is a radio). A tile that cannot load or
// render fails the whole preview — the thumb keeps its grey blocks. (In this file, not its own: the
// node serves the window's files by name, `node/server.js` ROUTES.)

/** The unit a preview renders at, the largest share of it shown, and the box each shape fits into (px). */
export const MINI = Object.freeze({
  unit: 20, maxScale: 0.55, portraitColumns: 8, landscapeRows: 6,
  box: Object.freeze({ portrait: Object.freeze({ w: 100, h: 300 }), landscape: Object.freeze({ w: 300, h: 90 }) }),
});

/** The scale of a layout of `cols` x `rows` cells: its render at `MINI.unit`, shrunk to fit its box. */
export function miniScale(orientation, cols, rows) {
  const b = MINI.box[orientation === 'landscape' ? 'landscape' : 'portrait'];
  return Math.min(MINI.maxScale, b.w / (cols * MINI.unit), b.h / (rows * MINI.unit));
}

/**
 * Draws `layout` into `thumb` with the real tiles. `sizes` maps a tile name to `{cols, rows}`;
 * `load(name)` answers the tile module (or null); `data` is the sheet the tiles draw.
 * Answers `true` when every tile drew, else `false` and `thumb` is untouched.
 */
export async function drawMini({ doc, thumb, layout, orientation, sizes, load, data }) {
  const placed = (layout && Array.isArray(layout.tiles) ? layout.tiles : []).map((p) => ({ ...p, size: sizes.get(p.tile) }));
  if (!placed.length || placed.some((p) => !p.size || !Number.isInteger(p.col) || !Number.isInteger(p.row))) return false;
  const mods = await Promise.all(placed.map((p) => load(p.tile)));
  if (mods.some((m) => !m || typeof m.render !== 'function')) return false;
  const u = MINI.unit;
  const landscape = orientation === 'landscape';
  const cols = landscape ? Math.max(...placed.map((p) => p.col + p.size.cols), layout.form && Number.isInteger(layout.form.cols) ? layout.form.cols : 0) : MINI.portraitColumns;
  const extent = Math.max(...placed.map((p) => p.row + p.size.rows), layout.form && Number.isInteger(layout.form.rows) ? layout.form.rows : 0);
  const rows = landscape ? Math.max(MINI.landscapeRows, extent) : extent;
  const k = miniScale(orientation, cols, rows);
  const box = doc.createElement('div');
  box.className = 'pv';
  Object.assign(box.style, { width: `${cols * u}px`, height: `${rows * u}px`, transform: `scale(${k})` });
  const cells = placed.map((p) => {
    const cell = doc.createElement('div');
    cell.className = 'tile';
    cell.dataset.tile = p.tile;
    Object.assign(cell.style, { position: 'absolute', overflow: 'hidden', left: `${p.col * u}px`, top: `${p.row * u}px`, width: `${p.size.cols * u}px`, height: `${p.size.rows * u}px` });
    box.append(cell);
    return cell;
  });
  try {
    cells.forEach((cell, i) => mods[i].render(cell, data, { cols: placed[i].size.cols, rows: placed[i].size.rows, unit: u }));
  } catch {
    return false;   // nothing was put into the thumb: its blocks stay
  }
  thumb.replaceChildren(box);
  Object.assign(thumb.style, { width: `${Math.round(cols * u * k)}px`, height: `${Math.round(rows * u * k)}px` });
  thumb.dataset.drawn = 'tiles';
  return true;
}

/**
 * The landscape frame's height: the band, but never so tall that the HUD inside (width / height under
 * `landscape_ratio`) would pick portrait in a narrow pane. `paneWidth` <= 0 = unknown, no cap.
 */
export function landscapeFrameHeight(height, paneWidth, ratio) {
  const r = Number(ratio) > 0 ? Number(ratio) : 1;
  return paneWidth > 0 ? Math.min(height, Math.floor(paneWidth / r)) : height;
}

/** The 35 design variables in seven groups, each `{title, kind, vars}` in contract order. */
export function colourGroups(vars) {
  const groups = [
    { title: 'Surface & text', test: (n) => /^--aihud-(bg|panel|line|line-2|text|dim|faint)$/.test(n) },
    { title: 'Shares & series', test: (n) => /^--aihud-(main|sub|role|series-\d)$/.test(n) },
    { title: 'Heat · fill', kind: 'fill', test: (n) => /^--aihud-heat-\d+$/.test(n) },
    { title: 'Heat · numbers', kind: 'text', test: (n) => /^--aihud-heat-text-\d+$/.test(n) },
    { title: 'Heat rest & glow', test: (n) => /^--aihud-(heat-rest|glow.*)$/.test(n) },
    { title: 'Roles', test: (n) => /^--aihud-role-\d$/.test(n) },
    { title: 'Type & shape', test: (n) => /^--aihud-(font.*|radius.*)$/.test(n) },
  ];
  const out = groups.map((g) => ({ title: g.title, kind: g.kind || null, vars: [] }));
  const rest = { title: 'Other', kind: null, vars: [] };
  for (const v of Array.isArray(vars) ? vars : []) {
    const i = groups.findIndex((g) => g.test(v.name));
    (i < 0 ? rest : out[i]).vars.push(v);
  }
  return [...out, rest].filter((g) => g.vars.length);
}

/** The heat colour of a value 0…100 as CSS — the `color-mix` of CONTRACT.md §Heat. `text` = the number stops. */
export function heatMix(value, text = false) {
  const stops = [0, 30, 50, 75, 100];
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  let i = 1;
  while (i < stops.length - 1 && v > stops[i]) i++;
  const a = stops[i - 1];
  const b = stops[i];
  const share = (((b - v) / (b - a)) * 100).toFixed(1);
  const n = text ? 'heat-text-' : 'heat-';
  return `color-mix(in srgb, var(--aihud-${n}${a}) ${share}%, var(--aihud-${n}${b}))`;
}

/** The head's save stamp: `saved hh:mm:ss`, local time. */
export function savedStamp(date) {
  const two = (n) => String(n).padStart(2, '0');
  return `saved ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

/** The pause after the last change before the settings are written. */
export const AUTOSAVE_MS = 300;

/** A design variable's value for a theme: the settings' override, else the contract default. */
export function designValue(settings, variable, theme) {
  const set = settings && settings.design_variables && settings.design_variables[theme];
  return set && typeof set[variable.name] === 'string' ? set[variable.name] : variable[theme];
}

/** A settings view the form compares against: optional keys at their "absent" value. */
function comparable(settings) {
  const s = settings || {};
  const dv = s.design_variables || {};
  return {
    ...s, theme: s.theme || 'system', projects: s.projects || '',
    antigravity_window: (s.windows && s.windows.antigravity && s.windows.antigravity.default) ?? null,
    design_variables: { dark: { ...(dv.dark || {}) }, light: { ...(dv.light || {}) } },
  };
}

/**
 * The patch Save sends: only the keys whose form value differs from the loaded settings. An empty
 * transcript folder removes the key (`null`, the default applies); `system` theme and no colour
 * override are the absent values, never written unless something was set before.
 */
export function settingsPatch(loaded, form) {
  const before = comparable(loaded);
  const patch = {};
  const same = (a, b) => (a && b && typeof a === 'object' && typeof b === 'object'
    ? Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => same(a[k], b[k]))
    : a === b);
  for (const [key, value] of Object.entries(form)) {
    if (same(value, before[key])) continue;
    if (key === 'antigravity_window') {
      // empty = back to the shipped default (the `windows` key goes); the shipped value itself, never stored, is no change
      if (value == null) patch.windows = null;
      else if (!(before.antigravity_window == null && value === ANTIGRAVITY_WINDOW_DEFAULT)) patch.windows = { antigravity: { default: value } };
      continue;
    }
    patch[key] = key === 'projects' && value === '' ? null : value;
  }
  return patch;
}


/** The Start tab's three steps (title, text). */
export const START_STEPS = Object.freeze([
  Object.freeze(['Your strip', 'aihud is a slim strip at the edge of your screen. It works upright (portrait) and lying down (landscape) — put it where it suits you.']),
  Object.freeze(['What it shows', 'The strip follows your newest Claude Code session: how full the context is, how long the session runs, how many subagents it started, and the tokens it used. Hover any value on the strip for a tooltip that explains it.']),
  Object.freeze(['This window', 'A click on the strip always opens this window. Here you change settings, look up every value aihud delivers, switch layouts, and equip layouts you built yourself.']),
]);

/**
 * Starts the window in `win`. `base` prefixes every node URL (empty in the page, the node's URL in
 * tests). Returns `{state, ready, close}`; `ready()` resolves when the queued work is done,
 * a pending autosave included.
 */
export function boot(win, { base = '', importModule = (url) => import(url) } = {}) {
  const doc = win.document;
  const loc = win.location || {};
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const later = (fn, ms) => (typeof win.setTimeout === 'function' ? win.setTimeout(fn, ms) : setTimeout(fn, ms));
  const cancel = (t) => (typeof win.clearTimeout === 'function' ? win.clearTimeout(t) : clearTimeout(t));
  const setVar = (node, name, value) => { if (node.style && typeof node.style.setProperty === 'function') node.style.setProperty(name, value); };
  const scrollTo = (node) => { if (typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'start', behavior: 'smooth' }); };
  const root = doc.getElementById('window');

  // ── the head: wordmark · tabs as text · session id and the save stamp on the right ──
  const head = el('header', 'w-head');
  const mark = el('span', 'w-mark');
  mark.append(el('i'), el('span', null, 'aihud'));
  const tabsBar = el('nav', 'tabs');
  const sid = el('span', 'sid');
  const stamp = el('span', 'settings-status');
  const right = el('span', 'w-right');
  right.append(sid, stamp);
  head.append(mark, tabsBar, right);
  const status = el('p', 'status');
  const panes = {};
  const buttons = {};
  for (const t of [START_TAB, ...TABS]) {
    buttons[t] = el('button', 'tab', t[0].toUpperCase() + t.slice(1));
    buttons[t].type = 'button';
    buttons[t].dataset.tab = t;
    buttons[t].addEventListener('click', () => show(t));
    panes[t] = el('section', `pane ${t}`);
  }
  // the tabs now in the window: Start in front while the intro is due, else the four
  const tabList = () => (state.startOn ? [START_TAB, ...TABS] : TABS);
  function layoutTabs() {
    const list = tabList();
    tabsBar.replaceChildren(...list.map((t) => buttons[t]));
    root.replaceChildren(head, status, ...list.map((t) => panes[t]));
  }
  tabsBar.replaceChildren(...TABS.map((t) => buttons[t]));
  root.replaceChildren(head, status, ...TABS.map((t) => panes[t]));

  const state = { startOn: false, step: 0, tab: null, session: sessionParam(loc.search), current: null, loaded: false, sheet: null, fields: [], rows: [], query: '', settings: null, welcome: null, touched: false, counts: { dataLoads: 0, draws: 0, saves: 0, tabSaves: 0, liveDraws: 0 } };
  const get = async (path) => {
    const res = await win.fetch(base + path);
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  };
  // a refusal of the node is said with its reason (`settings_invalid:<key>:<reason>`)
  const post = async (path, body) => {
    const res = await win.fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${path} → ${res.status} ${json.error || ''}`.trim());
    return json;
  };
  let queue = Promise.resolve();
  const run = (fn) => { queue = queue.then(fn).catch((e) => { status.textContent = String((e && e.message) || e); }); return queue; };

  // `remember`: a switch the user made (click, address change) — saved as `last_tab`; the opening pick is not
  function show(tab, remember = true) {
    const changed = remember && state.tab !== tab && tab !== START_TAB;   // Start is never remembered
    if (remember) state.touched = true;
    state.tab = tab;
    for (const t of Object.keys(panes)) {
      panes[t].hidden = t !== tab;
      buttons[t].className = t === tab ? 'tab active' : 'tab';
    }
    root.dataset.tab = tab;
    if (changed) rememberTab(tab);
  }
  // the last tab is remembered in the settings (`last_tab`), saved on every switch. It is its own
  // small POST, never the form's autosave, and `settings-changed` for it alone does not redraw Live.
  function rememberTab(tab) {
    if (state.settings) state.settings.last_tab = tab;
    state.counts.tabSaves++;
    run(() => post('/settings', { last_tab: tab }));
  }

  // the window wears the settings' theme and colours, like the HUD (one palette for both)
  let themed = [];
  let wearing = null;   // the settings the theme was last applied from
  function applyTheme(settings) {
    const html = doc.documentElement;
    if (!html) return;
    wearing = settings;
    const set = settings && settings.theme;
    const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: light)') : null;
    const light = Boolean(mq && mq.matches);
    const theme = set === 'light' || set === 'dark' ? set : light ? 'light' : 'dark';
    html.dataset.theme = theme;
    if (!html.style || typeof html.style.setProperty !== 'function') return;
    for (const n of themed) html.style.removeProperty(n);
    const pairs = themeOverrides(settings, theme);
    for (const [n, v] of pairs) html.style.setProperty(n, v);
    themed = pairs.map(([n]) => n);
  }
  // Auto follows the system: a change of the OS scheme re-applies the theme (a fixed theme ignores it)
  const scheme = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: light)') : null;
  if (scheme && typeof scheme.addEventListener === 'function') {
    scheme.addEventListener('change', () => { if (wearing && (wearing.theme || 'system') === 'system') applyTheme(wearing); });
  }

  // ── Analysis: the search box and the table; only the body is redrawn ──
  const search = el('input', 'search');
  search.type = 'search';
  search.placeholder = 'filter by path or meaning';
  search.addEventListener('input', () => { state.query = search.value; drawRows(); });
  const table = el('table', 'catalog');
  const thRow = el('tr');
  for (const h of ['path', 'meaning', 'unit', 'source', 'live value']) thRow.append(el('th', null, h));
  const thead = el('thead');
  thead.append(thRow);
  const tbody = el('tbody');
  table.append(thead, tbody);
  const badge = el('p', 'note-badge');
  badge.append(el('span', null, WELCOME_NOTE[0]), el('code', null, WELCOME_NOTE[1]), el('span', null, WELCOME_NOTE[2]));
  panes.analysis.append(badge, search, table);

  function drawRows() {
    state.counts.draws++;
    const shown = filterRows(state.rows, state.query);
    tbody.replaceChildren(...shown.map((r) => {
      const tr = el('tr', [r.source === 'estimated' ? 'estimated' : '', r.missing ? 'missing' : ''].filter(Boolean).join(' '));
      tr.dataset.path = r.path;
      // the value shows at most two lines (a long list or object would stretch the page); the title holds all of it
      const value = el('td', 'value');
      const text = el('div', 'v', r.value);
      text.title = r.value;
      value.append(text);
      if (r.at) { const at = el('div', 'at', r.at); at.title = r.at; value.append(at); }
      tr.append(el('td', 'path', r.path), el('td', 'meaning', r.meaning), el('td', 'unit', r.unit),
        el('td', 'source', r.source === 'estimated' ? 'estimated *' : r.source), value);
      return tr;
    }));
    Object.assign(root.dataset, { rows: String(state.rows.length), shown: String(shown.length), gaps: String(state.rows.filter((r) => r.missing).length) });
  }

  // ── data: the field list once, the session sheet now and on every update of that session ──
  async function loadData() {
    state.counts.dataLoads++;
    let id = state.session;
    let newestNote = '';
    if (!id) {
      const list = await get('/sessions');
      id = list.current || null;
      if (id && list.current_from === 'newest') newestNote = `· newest session (none in ${folderOf(list)})`;
    }
    state.current = id;
    root.dataset.session = id || '';
    sid.textContent = id ? String(id).slice(0, 8) : '';
    sid.title = id || '';
    let sheet = {};
    state.loaded = false;
    if (id) {
      try { sheet = await get(`/sessions/${encodeURIComponent(id)}`); state.loaded = true; } catch (e) { status.textContent = `session ${id}: ${String((e && e.message) || e)}`; }
      if (state.loaded && newestNote) status.textContent = newestNote;
    } else status.textContent = 'no session';
    state.sheet = sheet;
    state.rows = catalogRows(state.fields, sheet);
    drawRows();
  }

  const events = new win.EventSource(`${base}/events`);
  events.addEventListener('session-updated', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch { /* not ours */ }
    if (d && d.id === state.current) run(loadData);
  });

  let syncTheme = () => {};   // set by drawSettings: shows a theme on the Auto · Dark · Light control
  // a settings change made elsewhere (a second window, the CLI) re-themes this window and redraws Live;
  // not while an edit of this form waits for its save (it would flick the instant pick back)
  events.addEventListener('settings-changed', (e) => run(async () => {
    // the tab memory alone (`last_tab`) changes nothing this window draws: no re-fetch, no Live redraw
    let keys = null;
    try { keys = JSON.parse(e && e.data).keys; } catch { /* no keys named: treat as a full change */ }
    if (Array.isArray(keys) && keys.length && keys.every((k) => WINDOW_ONLY_SETTINGS.includes(k))) return;
    const fresh = await get('/settings');
    if (!pending) { state.settings = fresh; applyTheme(fresh); syncTheme(fresh.theme || 'system'); }
    drawLive(fresh);
  }));

  if (win.addEventListener) win.addEventListener('resize', () => drawLive());
  // the settings are not read yet: a hash that names a tab shows it at once; otherwise every pane stays
  // hidden (no flash of Live) and the boot below does the first paint with the tab memory
  if (TABS.includes(String(loc.hash || '').replace(/^#/, ''))) show(tabOf(loc.hash), false);
  else for (const t of TABS) panes[t].hidden = true;
  if (win.addEventListener) win.addEventListener('hashchange', () => show(tabOf(win.location.hash, tabList())));

  // ── Live: landscape on top, portrait below; the HUD in each frame picks its shape from the frame's ──
  const live = { landscape: null, portrait: null, layouts: new Map(), sizes: new Map() };
  const liveStack = el('div', 'live-stack');
  for (const o of ['landscape', 'portrait']) {
    const fig = el('figure', `live-fig ${o}`);
    const frame = el('iframe', `live-hud ${o}`);
    frame.title = `Live ${o}`;
    live[o] = frame;
    fig.append(el('figcaption', 'quiet', o === 'landscape' ? 'Landscape' : 'Portrait'), frame);
    liveStack.append(fig);
  }
  // the session goes to the HUD only once its data loaded; else the HUD shows its default, said out loud
  const liveSrc = (name) => `/hud?layout=${encodeURIComponent(String(name || ''))}${state.loaded ? `&session=${encodeURIComponent(state.current)}` : ''}`;
  /**
   * The frame sizes by the HUD's own rules: portrait = the strip, inner width 8 units (floor 162 px) and
   * the layout's rows, at least as tall as the shape threshold needs for the HUD to pick portrait;
   * landscape = the band rows x the unit, as wide as the pane.
   */
  function liveSize(o, s) {
    const max = Number(s.unit_max) > 0 ? Number(s.unit_max) : GRID.basePx;
    const unit = Math.max(GRID.minPx, Math.floor(max / GRID.unitStepPx) * GRID.unitStepPx);
    const thumb = layoutThumb(live.layouts.get(String(s[`layout_${o}`] || '')), live.sizes, o);
    if (o === 'landscape') {
      const pane = (doc.documentElement && doc.documentElement.clientWidth || win.innerWidth || 0) - 40;   // the pane's 20 px padding
      return { height: landscapeFrameHeight(Math.max(GRID.landscapeRows, thumb.rows) * unit, pane, s.landscape_ratio) };
    }
    const width = Math.max(FLOOR_INNER_PX, GRID.portraitColumns * unit);
    const ratio = Number(s.landscape_ratio) > 0 ? Number(s.landscape_ratio) : 1;
    const real = unitFor('portrait', width, 0, 0, max);
    return { width, height: Math.max((thumb.rows || 20) * real, Math.floor(width / ratio) + 1) };
  }
  function drawLive(s = state.settings) {
    if (!s) return;
    state.counts.liveDraws++;
    for (const o of ['landscape', 'portrait']) {
      const frame = live[o];
      const want = liveSrc(s[`layout_${o}`]);
      if (frame.dataset.want !== want) { frame.dataset.want = want; frame.src = want; }
      const size = liveSize(o, s);
      Object.assign(frame.style, { height: `${size.height}px`, width: size.width ? `${size.width}px` : '100%' });
    }
  }

  // ── autosave: every change waits AUTOSAVE_MS for the next, then posts only what changed ──
  let formValues = () => ({});
  let onFormChange = () => {};
  let timer = null;
  let pending = null;
  let settle = null;
  function scheduleSave() {
    onFormChange();
    if (timer) cancel(timer);
    if (!pending) pending = new Promise((ok) => { settle = ok; });
    timer = later(() => {
      timer = null;
      const done = settle;
      pending = null;
      run(saveNow).then(done, done);
    }, AUTOSAVE_MS);
  }
  async function saveNow() {
    const patch = settingsPatch(state.settings, formValues());
    if (!Object.keys(patch).length) return;
    state.counts.saves++;
    try {
      state.settings = await post('/settings', patch);
      stamp.textContent = savedStamp(new Date());
      stamp.className = 'settings-status fresh';
      later(() => { if (stamp.className === 'settings-status fresh') stamp.className = 'settings-status'; }, 40);
      applyTheme(state.settings);
      drawLive();
    } catch (e) {
      stamp.textContent = String((e && e.message) || e);
      stamp.className = 'settings-status refused';
    }
  }

  // ── Settings: one page, four sections (Layouts: own tab), index left, preview right ──
  function drawSettings(contract, entries, paths, layouts) {
    const s = state.settings;
    const grid = contract.grid || {};
    const vars = Array.isArray(contract.designVariables) ? contract.designVariables : [];
    const input = (name, type, value, attrs = {}) => {
      const i = el('input');
      Object.assign(i, { name, type }, attrs);
      i.value = String(value ?? '');   // after min/max/step: a range would round the value to its default step
      return i;
    };
    const watch = (control, onInput) => {
      control.addEventListener('input', () => { if (onInput) onInput(); scheduleSave(); });
      control.addEventListener('change', () => { if (onInput) onInput(); scheduleSave(); });
    };
    // typed fields save on `change` only: a pause mid-typing must not write a half value
    const watchTyped = (control) => control.addEventListener('change', () => scheduleSave());
    const link = (text, cls = 'link') => { const a = el('a', cls, text); a.href = '#settings'; return a; };
    const act = (a, fn) => a.addEventListener('click', (e) => { if (e && typeof e.preventDefault === 'function') e.preventDefault(); fn(); });
    // a section is a card: its header (chevron · title · one-line summary) opens and closes the body.
    // Every open of the window starts with the Settings cards closed (never remembered); the Layouts
    // card is the whole content of its own tab and starts open.
    const sectionOf = (title, ...extra) => {
      const sec = el('section', 's-sec closed');
      sec.dataset.section = title;
      const h = el('header');
      const h3 = el('h3');
      const toggle = el('button', 's-toggle');
      toggle.type = 'button';
      toggle.ariaExpanded = 'false';
      const summary = el('span', 'summary');
      toggle.append(el('span', 'chevron', '▸'), el('span', 'title', title), summary);
      h3.append(toggle);
      const extras = el('span', 'extras');
      extras.append(...extra);
      h.append(h3, extras);
      const body = el('div', 's-sec-body');
      body.hidden = true;
      sec.append(h, body);
      const setOpen = (open) => { body.hidden = !open; toggle.ariaExpanded = String(open); sec.className = open ? 's-sec' : 's-sec closed'; };
      toggle.addEventListener('click', () => setOpen(body.hidden));
      Object.assign(sec, { sBody: body, sSummary: summary, sOpen: setOpen });
      return sec;
    };
    const row = (label, ...value) => { const v = el('span', 'value-row'); v.append(...value); return [el('span', 'lbl', label), v]; };

    // Layouts (layout choice): two card rows, own newest first, the probe pair hidden
    const tileInfo = live.sizes;
    const thumbJobs = [];
    const selected = { portrait: String(s.layout_portrait || ''), landscape: String(s.layout_landscape || '') };
    const cardsOf = { portrait: [], landscape: [] };
    const layoutRow = (orientation) => {
      const wrap = el('div', 'l-row');
      const cards = el('div', 'l-cards');
      const fresh = el('a', 'l-card new');
      fresh.href = `/composer?orientation=${orientation}`;
      fresh.title = `New ${orientation} layout in the composer`;
      fresh.append(el('b', null, '＋'), el('span', 'm', 'New'));
      cards.append(fresh);
      const choices = layoutChoices(entries, orientation, selected[orientation]);
      if (!choices.some((c) => c.name === selected[orientation])) choices.push({ name: selected[orientation], own: false, missing: true });
      let sepDone = false;
      for (const c of choices) {
        if (!c.own && !sepDone) { cards.append(el('span', 'l-sep')); sepDone = true; }
        const card = el('label', 'l-card');
        card.dataset.layout = c.name;
        const radio = input(`layout_${orientation}`, 'radio', c.name);
        radio.checked = c.name === selected[orientation];
        radio.className = 'l-radio';
        const thumb = el('div', `thumb ${orientation}`);
        thumb.dataset.drawn = 'none';
        const size = el('span', 'm', c.missing ? 'not found' : '');
        card.append(radio);
        if (c.own) card.append(el('i', 'own-dot'));
        card.append(thumb, el('span', 'n', c.name), size);
        card.title = c.own ? `${c.name} (own)` : c.name;
        // the card and its edit control are siblings in one item: a label holds one labelable control
        const item = el('div', 'l-item');
        item.dataset.layout = c.name;
        item.append(card);
        if (!c.missing) {
          // top-right, shown on hover/focus: opens this layout in the composer, the way `fresh` does
          // (same tab), without touching the card's selection
          const edit = el('button', 'edit');
          edit.type = 'button';
          edit.title = edit.ariaLabel = `Edit ${c.name} in the composer`;
          edit.innerHTML = PENCIL_SVG;
          edit.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); loc.href = composerEditUrl(c.name); });
          item.append(edit);
        }
        const drawn = layouts.get(c.name);
        if (drawn) {
          const t = layoutThumb(drawn, tileInfo, orientation);
          Object.assign(thumb.style, { width: `${t.width}px`, height: `${t.height}px` });
          thumb.replaceChildren(...t.blocks.map((b) => {
            const span = el('span', b.context ? 'ctx' : null);
            Object.assign(span.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });
            return span;
          }));
          size.textContent = `${t.cols} × ${t.rows}`;
          thumb.dataset.drawn = 'blocks';
          thumbJobs.push({ thumb, layout: drawn, orientation });
        }
        cardsOf[orientation].push({ card, radio });
        const pick = () => {
          if (!radio.checked) return;
          selected[orientation] = radio.value;
          for (const x of cardsOf[orientation]) {
            if (x.radio !== radio) x.radio.checked = false;
            x.card.className = x.radio === radio ? 'l-card on' : 'l-card';
          }
        };
        watch(radio, pick);
        card.className = radio.checked ? 'l-card on' : 'l-card';
        cards.append(item);
      }
      wrap.append(el('span', 'lbl', orientation === 'portrait' ? 'Portrait' : 'Landscape'), cards);
      return wrap;
    };
    const composerLink = el('a', 'link right composer-link', 'Open composer ↗');
    composerLink.href = '/composer';
    const secLayouts = sectionOf('Layouts', el('span', 'quiet', 'shown by the HUD — portrait or landscape by window shape'), composerLink);
    secLayouts.sBody.append(layoutRow('portrait'), layoutRow('landscape'));
    secLayouts.sOpen(true);

    // the theme control: Auto · Dark · Light, the first thing of the Settings tab.
    // Auto is the settings value `system`; a pick applies to the window at once, the autosave keeps it.
    const themeValue = { current: s.theme || 'system' };
    const themeBar = el('div', 'theme-bar');
    const themePick = el('span', 'theme-pick');
    const themeRadios = [];
    for (const [v, text] of [['system', 'Auto'], ['dark', 'Dark'], ['light', 'Light']]) {
      const l = el('label', themeValue.current === v ? 'on' : null);
      const r = input('theme', 'radio', v);
      r.checked = themeValue.current === v;
      themeRadios.push({ l, r, v });
      watch(r, () => {
        if (!r.checked) return;
        themeValue.current = v;
        for (const x of themeRadios) { if (x.r !== r) x.r.checked = false; x.l.className = x.r === r ? 'on' : ''; }
        applyTheme({ ...state.settings, theme: v });
      });
      l.append(r, el('span', null, text));
      themePick.append(l);
    }
    syncTheme = (v) => {
      themeValue.current = v;
      for (const x of themeRadios) { x.r.checked = x.v === v; x.l.className = x.v === v ? 'on' : ''; }
      onFormChange();
    };
    themeBar.append(el('span', 'lbl', 'Theme'), themePick, el('span', 'quiet', 'Auto follows the system'));

    // Colours: one row per variable, Dark and Light side by side
    const resetAll = link('Reset all', 'link right');
    const secColours = sectionOf('Colours', resetAll);
    const cellsOf = { dark: [], light: [] };
    const rowsOf = [];
    const colourTable = el('table', 'colours');
    const thead2 = el('thead');
    const hr = el('tr');
    for (const h of ['Variable', 'Meaning', 'Dark', 'Light', '']) hr.append(el('th', null, h));
    thead2.append(hr);
    const body = el('tbody');
    colourTable.append(thead2, body);
    const probes = [];
    const paintProbes = () => {
      for (const p of probes) for (const { v, i } of cellsOf[p.theme]) setVar(p.node, v.name, String(i.value).trim() || v[p.theme]);
    };
    for (const g of colourGroups(vars)) {
      const gtr = el('tr', 'group');
      const gtd = el('td');
      gtd.colSpan = 5;
      const title = el('span', 'g', g.title);
      const resetGroup = link('Reset group', 'link right');
      gtd.append(title, el('span', 'count', String(g.vars.length)), resetGroup);
      if (g.kind) {
        const pair = el('div', 'ramp-pair');
        for (const t of ['dark', 'light']) {
          const box = el('div', `ramp-box ${t}`);
          box.append(el('div', `ramp${g.kind === 'text' ? ' text' : ''}`));
          probes.push({ node: box, theme: t });
          pair.append(box);
        }
        gtd.append(pair);
      }
      gtr.append(gtd);
      body.append(gtr);
      const members = [];
      for (const v of g.vars) {
        const tr = el('tr', 'var-row');
        tr.dataset.variable = v.name;
        tr.append(el('td', 'var', v.name.replace(/^--aihud-/, '')), el('td', 'meaning', v.meaning || ''));
        const mine = [];
        for (const t of ['dark', 'light']) {
          const value = designValue(s, v, t);
          const colour = /^#[0-9a-f]{6}$/i.test(v[t]);
          const td = el('td', 'value');
          const i = input(`${v.name}:${t}`, colour ? 'color' : 'text', value);
          i.dataset.var = v.name;
          i.dataset.theme = t;
          if (colour) {
            const sw = el('label', 'sw');
            const chip = el('i');
            chip.style.background = value;
            const code = el('code', null, value);
            sw.append(chip, i, code);
            mine.push({ v, i, t, chip, code });
            td.append(sw);
          } else {
            i.className = /font/.test(v.name) ? 'field wide' : 'field';
            i.spellcheck = false;
            i.title = value;
            mine.push({ v, i, t });
            td.append(i);
          }
          cellsOf[t].push({ v, i });
          tr.append(td);
        }
        const reset = el('span', 'revert', '↺');
        reset.title = 'Reset to default';
        const rtd = el('td', 'reset');
        rtd.append(reset);
        tr.append(rtd);
        const mark = () => {
          for (const m of mine) if (m.chip) { m.chip.style.background = m.i.value; m.code.textContent = m.i.value; }
          const changed = mine.some((m) => String(m.i.value).trim().toLowerCase() !== String(m.v[m.t]).toLowerCase());
          tr.className = changed ? 'var-row changed' : 'var-row';
        };
        const back = () => { for (const m of mine) m.i.value = m.v[m.t]; mark(); };
        for (const m of mine) watch(m.i, () => { mark(); paintProbes(); });
        act(reset, () => { back(); paintProbes(); scheduleSave(); });
        mark();
        members.push({ tr, back });
        rowsOf.push({ back });
        body.append(tr);
      }
      act(resetGroup, () => { for (const m of members) m.back(); paintProbes(); scheduleSave(); });
      act(title, () => {
        const closed = gtr.className !== 'group closed';
        gtr.className = closed ? 'group closed' : 'group';
        for (const m of members) m.tr.hidden = closed;
      });
    }
    act(resetAll, () => { for (const r of rowsOf) r.back(); paintProbes(); scheduleSave(); });
    secColours.sBody.append(colourTable);
    const overrides = (t) => Object.fromEntries(cellsOf[t]
      .filter(({ v, i }) => String(i.value).trim().toLowerCase() !== String(v[t]).toLowerCase())
      .map(({ v, i }) => [v.name, String(i.value).trim()]));

    // Size
    const unit = input('unit_max', 'range', s.unit_max, { min: '15', max: '45', step: '0.5', className: 'slider' });
    const unitOut = el('span', 'mono');
    const sayUnit = () => { const u = Number(unit.value); unitOut.textContent = `${u} px unit · ${u * (grid.portraitColumns || 8)} px inner`; };
    sayUnit();
    watch(unit, sayUnit);
    const ratio = input('landscape_ratio', 'number', s.landscape_ratio, { min: '0.25', max: '4', step: '0.05', className: 'field narrow' });
    watchTyped(ratio);
    const sizeDefaults = link('Defaults', 'link right');
    act(sizeDefaults, () => { unit.value = String(DEFAULTS.unit_max); ratio.value = String(DEFAULTS.landscape_ratio); sayUnit(); scheduleSave(); });
    const secSize = sectionOf('Size', sizeDefaults);
    const sizeRows = el('div', 'rows');
    sizeRows.append(...row('Base size', unit, unitOut), ...row('Landscape from', ratio, el('span', 'quiet', `width ÷ height · default ${DEFAULTS.landscape_ratio}`)));
    const facts = el('p', 'facts');
    const b = (t) => el('b', null, String(t));
    facts.append(el('span', null, 'Fixed by the grid: portrait '), b(grid.portraitColumns), el('span', null, ' columns · smallest unit '), b(`${grid.minPx} px`),
      el('span', null, ' · narrowest inner width '), b(`${FLOOR_INNER_PX} px`), el('span', null, ' · landscape band '), b(grid.landscapeRows),
      el('span', null, ' rows ('), b(grid.landscapeRowsStandard), el('span', null, ' for standard and essentials)'));
    secSize.sBody.append(sizeRows, facts);

    // Folders & port: the folders the node uses; a page cannot open a folder, it copies the path
    const copy = (textOf) => {
      const a = link('Copy');
      act(a, () => {
        const clip = win.navigator && win.navigator.clipboard;
        if (clip && typeof clip.writeText === 'function') clip.writeText(String(textOf() || '')).then(() => { a.textContent = 'Copied'; later(() => { a.textContent = 'Copy'; }, 1400); }, () => {});
      });
      return a;
    };
    const port = input('port', 'number', s.port, { min: '1', max: '65535', step: '1', className: 'field mono narrow' });
    watchTyped(port);
    const projects = input('projects', 'text', s.projects || '', { placeholder: (paths && paths.projects) || '~/.claude/projects', className: 'field wide', spellcheck: false });
    watchTyped(projects);
    const svg = input('svg', 'text', (paths && paths.svg) || '', { readOnly: true, className: 'field wide' });
    const home = el('span', 'mono half', (paths && paths.home) || '');
    const secFolders = sectionOf('Folders & port');
    const agWindow = input('antigravity_window', 'number', ((s.windows && s.windows.antigravity && s.windows.antigravity.default) ?? ANTIGRAVITY_WINDOW_DEFAULT), { min: '1000', max: '100000000', step: '1', placeholder: String(ANTIGRAVITY_WINDOW_DEFAULT), className: 'field mono narrow' });
    watchTyped(agWindow);
    const agHint = el('span', 'quiet', `tokens · assumed, Antigravity records none · default ${ANTIGRAVITY_WINDOW_DEFAULT.toLocaleString('en-US')}`);
    const folderRows = el('div', 'rows');
    folderRows.append(
      ...row('Antigravity context window', agWindow, agHint),
      ...row('Port', port, el('span', 'quiet', 'applies on next start')),
      ...row('Transcripts', projects, el('span', 'quiet', 'applies on next start'), copy(() => String(projects.value).trim() || (paths && paths.projects) || '')),
      ...row('Role icons (SVG)', svg, copy(() => svg.value)),
      ...row('aihud home', home, copy(() => home.textContent)),
    );
    secFolders.sBody.append(folderRows);

    // About
    const secAbout = sectionOf('About');
    const aboutRows = el('div', 'rows');
    aboutRows.append(
      ...row('Version', el('span', 'mono half', `contract ${contract.contractVersion || '?'} · reader ${contract.readerVersion || '?'}`)),
    );
    secAbout.sBody.append(aboutRows);

    // Guide: the last, visibly set-apart section. "Show introduction again" sits in its header (shown while closed too);
    // the body is short plain help on the features beyond the first start.
    const introAgain = el('button', 'intro-again', 'Show introduction again');
    introAgain.type = 'button';
    introAgain.addEventListener('click', () => restartStart());
    const secGuide = sectionOf('Guide', introAgain);
    const guideItems = [
      ['Build your own tiles', ['Run npx aihud new-tile — it prints the tile contract and the instructions.', 'Run npx aihud install-skill to add /new-tile to Claude Code.']],
      ['Build layouts', ['Open the Layouts tab and pick ＋ New: it opens the Composer.', 'Drag tiles onto the grid, name the layout and save it.']],
      ['Copy and reuse layouts', ['A layout is one JSON file in ~/.aihud/layouts/.', 'Copy the file (and your own tiles from ~/.aihud/tiles/) into the same folders on another machine.', 'npx aihud check tells you if something is missing there.']],
      ['Which sessions the HUD shows', ['aihud follows the newest session of the folder you start it in — start it in your project folder.', 'If that folder has no session, it shows the newest session overall.']],
      ['More', ['See the README of the aihud package for all commands and files.']],
    ];
    const guideList = el('div', 'guide-list');
    for (const [title, lines] of guideItems) {
      const item = el('div', 'guide-item');
      item.append(el('h4', null, title), ...lines.map((t) => el('p', null, t)));
      guideList.append(item);
    }
    secGuide.sBody.append(guideList);

    // the one-line summaries of the closed cards, redrawn on every change of the form
    const changedColours = () => Object.keys(overrides('dark')).length + Object.keys(overrides('light')).length;
    const summaries = [
      [secLayouts, () => `${selected.portrait} · ${selected.landscape}`],
      [secColours, () => `${themeValue.current[0].toUpperCase()}${themeValue.current.slice(1)} theme · ${changedColours() ? `${changedColours()} changed` : 'defaults'}`],
      [secSize, () => `${unit.value} px unit · landscape from ${ratio.value}`],
      [secFolders, () => `port ${port.value}`],
      [secAbout, () => `contract ${contract.contractVersion || '?'} · reader ${contract.readerVersion || '?'}`],
      [secGuide, () => 'tiles · layouts · sessions'],
    ];
    onFormChange = () => { for (const [sec, text] of summaries) sec.sSummary.textContent = text(); };
    onFormChange();

    formValues = () => ({
      layout_portrait: selected.portrait, layout_landscape: selected.landscape,
      landscape_ratio: Number(ratio.value), unit_max: Number(unit.value), port: Number(port.value),
      antigravity_window: String(agWindow.value).trim() === '' ? null : Number(agWindow.value),
      projects: String(projects.value).trim(), theme: themeValue.current,
      design_variables: { dark: overrides('dark'), light: overrides('light') },
    });

    // the index (sticky, left) and the preview (right)
    // (Layouts has its own tab — same form state, same autosave — and is no section of this page)
    const sections = [['Colours', secColours], ['Size', secSize], ['Folders & port', secFolders], ['About', secAbout], ['Guide', secGuide]];
    const index = el('nav', 's-index');
    const indexLinks = sections.map(([name, sec], i) => {
      const a = link(name, i === 0 ? 'on' : '');
      act(a, () => { for (const x of indexLinks) x.className = x === a ? 'on' : ''; sec.sOpen(true); scrollTo(sec); });
      return a;
    });
    index.append(...indexLinks);
    const main = el('div', 's-main');
    main.append(...sections.map(([, sec]) => sec));
    const preview = el('aside', 's-preview');
    preview.append(el('span', 'title', 'Preview'));
    for (const t of ['dark', 'light']) {
      const p = probe(t);
      probes.push({ node: p, theme: t });
      preview.append(p);
    }
    paintProbes();
    const page = el('div', 's-body');
    page.append(index, main, preview);
    panes.settings.replaceChildren(themeBar, page);
    panes.layouts.replaceChildren(secLayouts);
    root.dataset.settings = 'ready';
    return thumbJobs;
  }

  /** The real-tile previews of the layout cards: one shared module load per tile, measured. */
  async function drawThumbs(jobs) {
    const clock = (win.performance || performance);
    const t0 = clock.now();
    const modules = new Map();
    const load = (name) => {
      if (!modules.has(name)) {
        modules.set(name, Promise.resolve().then(() => importModule(`${base}/tiles/${encodeURIComponent(name)}.js`))
          .then((m) => (m && typeof m.render === 'function' ? m : null), () => null));
      }
      return modules.get(name);
    };
    const data = { ...(state.sheet || {}), hud: { current: state.current, pinned: false, sessions: [] } };
    const done = await Promise.all(jobs.map((j) => drawMini({ doc, thumb: j.thumb, layout: j.layout, orientation: j.orientation, sizes: live.sizes, load, data }).catch(() => false)));
    Object.assign(root.dataset, { thumbs: String(jobs.length), thumbsDrawn: String(done.filter(Boolean).length), thumbMs: String(Math.round(clock.now() - t0)) });
  }

  /** The preview probe of one theme: 20 heat blocks lit to 63.4 %, a ring at 72 %, roles, series, main/sub. */
  function probe(theme) {
    const p = el('div', `probe ${theme}`);
    const kz = el('div', 'kz');
    kz.append(el('span', null, theme), el('span', 'mono', 'context'));
    const blocks = el('div', 'blocks');
    for (let i = 0; i < 20; i++) {
      const w = (i + 0.5) * 5;
      const span = el('span');
      span.style.background = heatMix(w);
      span.style.opacity = w <= 63.4 ? '1' : 'var(--aihud-heat-rest)';
      blocks.append(span);
    }
    const big = el('div', 'big', '63.4 %');
    big.style.color = heatMix(63.4, true);
    const ringRow = el('div', 'ring-row');
    const ring = el('div', 'ring');
    setVar(ring, '--ring', heatMix(72));
    const ringText = el('div');
    const pct = el('div', 'pct', '72 %');
    pct.style.color = heatMix(72, true);
    ringText.append(el('div', 'mono sub', 'heavy subagent'), pct);
    ringRow.append(ring, ringText);
    const bar = (label, parts, gap) => {
      const r = el('div', 'bar');
      const track = el('div', gap ? 'track gap' : 'track');
      for (const [w, v] of parts) { const s = el('span'); s.style.width = `${w}%`; s.style.background = `var(${v})`; track.append(s); }
      r.append(el('span', null, label), track);
      return r;
    };
    p.append(kz, blocks, big, ringRow,
      bar('roles', [[46, '--aihud-role-1'], [28, '--aihud-role-2'], [16, '--aihud-role-3']]),
      bar('models', [[58, '--aihud-series-1'], [24, '--aihud-series-2'], [10, '--aihud-series-3']]),
      bar('main', [[62, '--aihud-main'], [38, '--aihud-sub']], true));
    return p;
  }

  // ── Start tab: the steps as one list. The step lives in window state only; nothing is stored until Done / Skip. ──
  const startLive = el('p', 'start-live');   // aria-live region: "Step N of 3"
  startLive.setAttribute('aria-live', 'polite');
  const startBody = el('div', 'start-body');   // the only part drawStart redraws; the live region stays put
  panes.start.replaceChildren(startLive, startBody);
  function drawStart(focusHeading = false) {
    const top = el('div', 'start-top');
    const skip = el('button', 'start-skip', 'Skip introduction');
    skip.type = 'button';
    skip.addEventListener('click', () => finishStart());
    top.append(el('h2', null, 'Getting started'), skip);
    const list = el('div', 'start-steps');
    let heading = null;
    START_STEPS.forEach(([title, text], i) => {
      const kind = i < state.step ? 'done' : i === state.step ? 'cur' : 'todo';
      const row = el('div', `step ${kind}`);
      const n = el('div', 'n', kind === 'done' ? '✓' : String(i + 1));
      n.setAttribute('aria-hidden', 'true');
      const h = el('h3', null, title);
      if (kind === 'done') h.append(el('span', 'sr-only', ' (done)'));
      if (kind === 'cur') {
        h.setAttribute('tabindex', '-1');
        heading = h;
        h.dataset.current = 'true';
        const body = el('div', 'body');
        const next = el('button', 'start-next', i === START_STEPS.length - 1 ? 'Done' : 'Next');
        next.type = 'button';
        next.addEventListener('click', () => { if (i === START_STEPS.length - 1) finishStart(); else { state.step = i + 1; drawStart(true); } });
        body.append(h, el('p', null, text), next);
        row.append(n, body);
      } else row.append(n, h);
      list.append(row);
    });
    startBody.replaceChildren(top, list);
    if (focusHeading) {
      startLive.textContent = `Step ${state.step + 1} of ${START_STEPS.length}`;
      if (heading && typeof heading.focus === 'function') heading.focus();
    } else startLive.textContent = '';
  }
  // Done and Skip: marker + last_tab in one save, Start gone, Layouts shown. A failed save is said, never a loop.
  function finishStart() {
    state.startOn = false;
    state.step = 0;
    state.welcome = 'done';
    layoutTabs();
    show('layouts', false);
    if (typeof buttons.layouts.focus === 'function') buttons.layouts.focus();   // focus must not fall to the body
    state.touched = true;
    run(async () => {
      try { state.settings = await post('/settings', { welcome_seen: true, last_tab: 'layouts' }); }
      catch (e) { status.textContent = `welcome marker not saved: ${String((e && e.message) || e)}`; }
    });
  }
  // Settings → "Show introduction again": marker off, Start back in front at step 1
  function restartStart() {
    state.startOn = true;
    state.step = 0;
    state.welcome = 'shown';
    layoutTabs();
    drawStart();
    show(START_TAB, false);
    state.touched = true;
    run(async () => {
      try { state.settings = await post('/settings', { welcome_seen: false }); }
      catch (e) { status.textContent = `welcome marker not reset: ${String((e && e.message) || e)}`; }
    });
  }

  run(async () => {
    let loaded;
    try { loaded = await Promise.all([get('/contract.json'), get('/settings'), get('/catalog'), get('/')]); } catch (e) { if (state.tab === null) show(FALLBACK_TAB, false); throw e; }
    const [contract, settings, entries, index] = loaded;
    state.fields = Array.isArray(contract.fields) ? contract.fields : [];
    state.settings = settings;
    state.startOn = showWelcome(settings);
    if (state.startOn) { state.welcome = 'shown'; drawStart(); }
    layoutTabs();
    if (!state.touched || state.tab === null) show(initialTab(loc.hash, settings, tabList()), false);   // hash > start > last_tab > live
    applyTheme(settings);
    await loadData();
    // the tile sizes and the layout files: for the Live frame sizes and the cards' previews (one that fails to load draws empty)
    const all = Array.isArray(entries.entries) ? entries.entries : [];
    for (const e of all) {
      if (e.kind !== 'tile' || live.sizes.has(e.name)) continue;   // own first: an own tile shadows
      const size = tileSize(e.meta);
      if (size) live.sizes.set(e.name, { ...size, context: e.meta.contentBlock === 'context' });
    }
    const names = new Set(['portrait', 'landscape'].flatMap((o) => layoutChoices(all, o, String(settings[`layout_${o}`] || '')).map((c) => c.name)));
    await Promise.all([...names].map(async (n) => { try { live.layouts.set(n, await get(`/layouts/${encodeURIComponent(n)}`)); } catch { /* drawn empty */ } }));
    // Live: the HUD itself draws the settings' two layouts for this session
    drawLive();
    if (!state.loaded && state.current) status.textContent += ' · Live shows the HUD default session';
    panes.live.replaceChildren(liveStack);
    const jobs = drawSettings(contract, all, index.paths, live.layouts);
    await drawThumbs(jobs);
  });

  return {
    state,
    ready: async () => { while (pending) await pending; return queue; },
    close: () => { if (timer) cancel(timer); events.close(); },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE HUD
//
//  Shows ONE layout on the grid (`tiles/CONTRACT.md` §Layouts). It only shows — arranging is the
//  composer's job. The page (`index.html`, served at `GET /hud`) calls `boot(window)`:
//   settings → orientation by window shape → layout of that orientation → tile modules from the
//   catalog → every tile drawn at its contract size with the current session's data.
//  `/hud?layout=<name>` shows that one layout in both shapes instead (nothing is written).
//  `/hud?session=<id>` starts pinned on that session (the window's Live tab uses both).
//  A click on the HUD (not on a tile's own control) opens the window with the HUD's session:
//  `/window?session=<id>` (`windowHref`).
//  Live: `session-updated` of the current session redraws with fresh data; a resize re-picks the
//  orientation (and the layout) and redraws at the new unit; `catalog-changed` reloads the layout;
//  `settings-changed` reloads the settings (theme, colour overrides, layout pair, limits).
//  `layout-draft` (the composer's live grid) is laid over the HUD by `draft-overlay.js`.
//  The tip: hover or keyboard focus on an element carrying `data-field="<catalog path(s)>"` draws a
//  bubble from the catalog (`GET /contract.json`, fetched once): the row's `hint` (else `meaning`),
//  its `unit` and `source` (`tiles/CONTRACT.md` §Value marks and the tip). The tile only carries the mark.
//
//  The functions above `boot` are pure (no DOM) and tested directly.
// ─────────────────────────────────────────────────────────────────────────────

import { createDraftOverlay } from './draft-overlay.js';

/** The grid numbers of `tiles/contract.json` → `grid` (a test holds the two together). */
/** Settings keys only the window uses (its tab memory): a `settings-changed` naming nothing else changes nothing the HUD draws. A test holds it equal to `node/store.js WINDOW_ONLY_SETTINGS` (a browser module cannot import the node). */
export const WINDOW_ONLY_SETTINGS = Object.freeze(['last_tab']);
export const GRID = Object.freeze({ portraitColumns: 8, landscapeRows: 6, minPx: 15, basePx: 22.5, unitStepPx: 0.5 });

/** Portrait or landscape by window shape: landscape once width / height reaches `ratio` (default 1). */
export function pickOrientation(width, height, ratio) {
  const r = Number(ratio) > 0 ? Number(ratio) : 1;
  return height > 0 && width / height >= r ? 'landscape' : 'portrait';
}

/**
 * Pixels per grid unit. Portrait: inner width ÷ 8. Landscape: inner height ÷ band rows, where the
 * band is the layout's row extent but at least 6 rows. Rounded down to 0.5 px, never below 15 px
 * (below that the strip clips on the right / at the bottom) and never above `unitMax` (settings
 * `unit_max`, default the base unit 22.5 px — a big window does not blow the tiles up).
 * 162–163 px inner width → 20 px, 180 px → 22.5 px.
 */
export function unitFor(orientation, width, height, bandRows = 0, unitMax = GRID.basePx) {
  const raw = orientation === 'landscape'
    ? height / Math.max(GRID.landscapeRows, bandRows)
    : width / GRID.portraitColumns;
  const max = Number(unitMax) > 0 ? Number(unitMax) : GRID.basePx;
  return Math.max(GRID.minPx, Math.min(max, Math.floor(raw / GRID.unitStepPx) * GRID.unitStepPx));
}

/** The tile's one size in grid units, `meta.sizes[0]`, or `null`. */
export function tileSize(meta) {
  const s = meta && Array.isArray(meta.sizes) ? meta.sizes[0] : null;
  return s && Number.isInteger(s.cols) && s.cols > 0 && Number.isInteger(s.rows) && s.rows > 0
    ? { cols: s.cols, rows: s.rows } : null;
}

/**
 * The probe pair (`probe-*` layouts, source checkout only, not in the npm package) and its example
 * tiles (`example-*`): kept out of the window's layout choice and the composer's tile panel, usable
 * by name where present (`tiles/CONTRACT.md`
 * §Layouts). An own entry of the same name is never a probe.
 */
export function isProbe(entry) {
  if (!entry || entry.own) return false;
  return entry.kind === 'layout' ? String(entry.name).startsWith('probe-') : String(entry.name).startsWith('example-');
}

/** A module is a tile by its exports — `render` (function) and `meta` (object) — never by file name. */
export function isTile(mod) {
  return Boolean(mod) && typeof mod.render === 'function'
    && mod.meta != null && typeof mod.meta === 'object' && !Array.isArray(mod.meta);
}

/** The grid the placed cells need: `{cols, rows}` of the furthest cell edges. */
export function extent(cells) {
  let cols = 0;
  let rows = 0;
  for (const c of cells) {
    cols = Math.max(cols, c.col + c.size.cols);
    rows = Math.max(rows, c.row + c.size.rows);
  }
  return { cols, rows };
}

/**
 * The grid a layout is drawn on: `ext` (the tiles' extent) widened by the saved `form`, when the layout
 * file carries one — free space at the end stays. Without a form: the extent, as ever.
 */
export function gridDims(orientation, ext, form) {
  const f = form && Number.isInteger(form.cols) && Number.isInteger(form.rows) ? form : { cols: 0, rows: 0 };
  if (orientation === 'landscape') return { cols: Math.max(ext.cols, f.cols), rows: Math.max(GRID.landscapeRows, ext.rows, f.rows) };
  return { cols: GRID.portraitColumns, rows: Math.max(ext.rows, f.rows) };
}

/**
 * A layout named in the page address (`/hud?layout=<name>`, the composer links there after a save),
 * or `null`. A named layout stands for both window shapes; without one the settings pick.
 */
export function layoutOverride(search) {
  const name = new URLSearchParams(String(search || '')).get('layout');
  return name && name.trim() ? name : null;
}

/** The session named in the page address (`/hud?session=<id>`), or `null`. */
export function sessionOverride(search) {
  const id = new URLSearchParams(String(search || '')).get('session');
  return id && id.trim() ? id.trim() : null;
}

// readable start-folder name from a /sessions answer: the node's `start_dir_name`, else the slug minus a drive prefix or
// leading dash ('C--dev-app' / '-home-u-app' -> lossy, hint only)
export function folderOf(list) {
  const l = list || {};
  if (typeof l.start_dir_name === 'string' && l.start_dir_name) return l.start_dir_name;
  return typeof l.start_slug === 'string' && l.start_slug ? l.start_slug.replace(/^[A-Za-z]--/, '').replace(/^-+/, '') || 'the start folder' : 'the start folder';
}

/** The window's address for a session: `/window?session=<id>`, or `/window` without one. */
export function windowHref(sessionId) {
  return sessionId ? `/window?session=${encodeURIComponent(sessionId)}` : '/window';
}

/**
 * What counts as a tile's own control: a click inside one never opens the window. By role and
 * markup, not by tile, so a user-built tile with an ARIA-conformant control holds too: the native
 * controls, anything focusable (`tabindex`), the interactive ARIA roles, and the session-switch
 * markers of the shipped header tiles (`data-session` rows, `data-close` / session backdrop and list).
 * Deliberately NOT every `[role]` / `[data-role]`: the gauges carry `role=img` and many parts a
 * `data-role`, and a click on those should open the window.
 */
export const CONTROL_SELECTOR = [
  'button', 'a', 'input', 'select', 'textarea', '[popover]', '[tabindex]',
  ...['button', 'option', 'listbox', 'menu', 'menuitem', 'link', 'checkbox', 'switch', 'tab'].map((r) => `[role="${r}"]`),
  '[data-session]', '[data-close]', '[data-role="session-backdrop"]', '[data-role="session-list"]',
].join(', ');

/** Display names of the providers named in the tip's `not provided by <Provider>`. */
const PROVIDER_NAMES = Object.freeze({ antigravity: 'Antigravity', codex: 'Codex', 'claude-code': 'Claude Code' });

const ASSUMED_TIP = Object.freeze({
  default: " · assumed from Google's model documentation for antigravity-preview (ai.google.dev); change it in Settings",
  settings: ' · assumed by you in Settings (Antigravity context window)',
});

/**
 * The tip's entries for a `data-field` value (one path, or several separated by spaces): per catalog
 * row the short `hint` (else the long `meaning`), the data `unit` and the source mark — `exact`, or
 * `≈ estimated`. A path the catalog does not know gives no entry (an unknown path shows no tip).
 * `notDelivered` = the sheet's `not_delivered`: a row with `gap` (`<type>:<field>`) that the sheet names as
 * `<gap>_not_recorded_by_<provider>` (`gap` may also be a list, one hit is enough) gets the text `not provided by <Provider>`, no unit, no source
 * (`absent: true`). An unknown provider id is shown only if it is `[a-z0-9-]{1,40}`, else `this provider`.
 */
export function tipEntries(catalog, attr, notDelivered) {
  const rows = catalog && Array.isArray(catalog.fields) ? catalog.fields : [];
  const nd = Array.isArray(notDelivered) ? notDelivered : [];
  const out = [];
  for (const path of String(attr || '').split(/\s+/).filter(Boolean)) {
    const row = rows.find((r) => r.path === path);
    if (!row) continue;
    // `gap`: one `<type>:<field>` or a list of them (any one named by the sheet counts)
    const gaps = typeof row.gap === 'string' ? [row.gap] : Array.isArray(row.gap) ? row.gap.filter((g) => typeof g === 'string') : [];
    let key = null, hit = null;
    for (const g of gaps) {
      const k = g + '_not_recorded_by_';
      const h = nd.find((n) => typeof n === 'string' && n.startsWith(k));
      if (h) { key = k; hit = h; break; }
    }
    if (hit) {
      const p = hit.slice(key.length);
      const who = Object.hasOwn(PROVIDER_NAMES, p) ? PROVIDER_NAMES[p] : /^[a-z0-9-]{1,40}$/.test(p) ? p : 'this provider';
      out.push({ path, text: 'not provided by ' + who, unit: '', source: '', estimated: false, absent: true });
      continue;
    }
    const estimated = row.source === 'estimated';
    // an ASSUMED window (`<gap>_assumed_by_default|settings`): the tip says where the number comes from
    const assumedBy = gaps.some((g) => nd.includes(g + '_assumed_by_default')) ? ASSUMED_TIP.default : gaps.some((g) => nd.includes(g + '_assumed_by_settings')) ? ASSUMED_TIP.settings : '';
    out.push({ path, text: String(row.hint || row.meaning || '') + assumedBy, unit: String(row.unit || ''), source: estimated ? '≈ estimated' : 'exact', estimated });
  }
  return out;
}

/**
 * Where the tip goes, in window (viewport) pixels. `rect` = the marked value {left,right,top,bottom},
 * `tip` = {w,h}, `view` = {w,h}. Portrait: above or below the value (below when it fits), centred on it,
 * never wider than the strip. Landscape: beside the value (right when it fits, else left), never
 * higher than the band. `caret` = which tip side the pointer sits on, and its offset along that side.
 */
export function placeTip({ rect, tip, view, orientation, margin = 4, gap = 9 }) {
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  if (orientation === 'landscape') {
    const right = rect.right + gap + tip.w <= view.w - margin;
    const x = clamp(right ? rect.right + gap : rect.left - gap - tip.w, margin, Math.max(margin, view.w - tip.w - margin));
    const y = clamp(cy - tip.h / 2, margin, Math.max(margin, view.h - tip.h - margin));
    return { x, y, caret: { side: right ? 'left' : 'right', offset: clamp(cy - y - 4, 6, Math.max(6, tip.h - 14)) } };
  }
  const x = clamp(cx - tip.w / 2, margin, Math.max(margin, view.w - tip.w - margin));
  const below = rect.bottom + gap + tip.h <= view.h - margin;
  const y = clamp(below ? rect.bottom + gap : rect.top - gap - tip.h, margin, Math.max(margin, view.h - tip.h - margin));
  return { x, y, caret: { side: below ? 'top' : 'bottom', offset: clamp(cx - x - 4, 8, Math.max(8, tip.w - 16)) } };
}

/** The smallest tile of the plan, used for a cell whose tile is missing from the catalog. */
const MISSING_SIZE = Object.freeze({ cols: 2, rows: 2 });

/**
 * The design-variable overrides of the settings (`design_variables`, set in the window's Settings)
 * for one theme, as `[name, value]` pairs. The node checked the values on write; only
 * `--aihud-…` names pass here.
 */
export function themeOverrides(settings, theme) {
  const set = settings && settings.design_variables && settings.design_variables[theme];
  if (!set || typeof set !== 'object' || Array.isArray(set)) return [];
  return Object.entries(set).filter(([n, v]) => /^--aihud-[a-z0-9-]+$/.test(n) && typeof v === 'string');
}

/**
 * Starts the HUD in `win`. `base` prefixes every node URL (empty in the page, the node's URL in
 * tests); `importModule` loads a tile module by URL (the browser's `import()` by default).
 * Returns `{state, ready, close}`; `ready()` resolves when the queued work is done.
 */
export function boot(win, { base = '', importModule = (url) => import(url) } = {}) {
  const doc = win.document;
  const named = layoutOverride(win.location && win.location.search);
  const startSession = sessionOverride(win.location && win.location.search);
  const root = doc.getElementById('hud');
  const grid = doc.createElement('div');
  grid.className = 'grid';
  const status = doc.createElement('p');
  status.className = 'status';
  root.replaceChildren(grid, status);

  const state = {
    settings: null, overrides: [], orientation: null, layout: null, form: null, cells: [], current: null, pinned: false, sessions: [], data: { hud: { current: null, pinned: false, sessions: [] } }, drawn: null, unit: 0, notice: '', hint: '', bust: 0,
    modules: new Map(), counts: { draws: 0, dataLoads: 0, layoutLoads: 0, resizes: 0 },
  };
  const get = async (path) => {
    const res = await win.fetch(base + path);
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  };
  // ── the tip: one bubble element, drawn on hover / focus of a `data-field` mark ──
  let catalogOnce = null;
  const loadCatalog = () => (catalogOnce ||= get('/contract.json').catch(() => { catalogOnce = null; return null; }));
  let tipEl = null;
  let tipFor = null;   // the marked element the tip is (being) shown for
  const hideTip = () => { tipFor = null; if (tipEl) tipEl.hidden = true; };
  const markOf = (t) => (t && typeof t.closest === 'function' ? t.closest('[data-field]') : null);
  async function showTip(el) {
    tipFor = el;
    const catalog = await loadCatalog();
    if (tipFor !== el) return;
    const entries = tipEntries(catalog, el.getAttribute('data-field'), state.data && state.data.not_delivered);
    if (!entries.length) { hideTip(); return; }
    if (!tipEl) {
      tipEl = doc.createElement('div');
      tipEl.className = 'aihud-tip';
      tipEl.setAttribute('role', 'tooltip');
      (doc.body || root).append(tipEl);
    }
    const view = { w: doc.documentElement.clientWidth || win.innerWidth, h: win.innerHeight };
    const mk = (tag, cls, text) => { const n = doc.createElement(tag); n.className = cls; if (text != null) n.textContent = text; return n; };
    const parts = entries.map((e) => {
      const entry = mk('div', 'tip-entry');
      const meta = mk('div', 'tip-meta');
      if (e.absent) { entry.append(mk('div', 'tip-text', e.text)); return entry; }
      meta.append(mk('span', e.estimated ? 'tip-src est' : 'tip-src', e.source), mk('span', 'tip-unit', e.unit));
      entry.append(mk('div', 'tip-text', e.text), meta);
      return entry;
    });
    const body = mk('div', 'tip-body');
    body.append(...parts);
    body.style.maxHeight = `${Math.max(20, view.h - 8 - 15)}px`;   // the padding and borders take the rest: never higher than the band
    const caret = mk('div', 'tip-caret');
    tipEl.replaceChildren(body, caret);
    let w = Math.min(view.w - 8, state.orientation === 'landscape' ? 230 : 240);
    const landscape = state.orientation === 'landscape';
    delete tipEl.dataset.wide;
    if (landscape) tipEl.dataset.orientation = 'landscape'; else delete tipEl.dataset.orientation;
    Object.assign(tipEl.style, { width: `${w}px`, left: '0px', top: '0px', visibility: 'hidden' });
    tipEl.hidden = false;
    // landscape: the band is low - when the entries do not fit one under the other, widen the bubble and lay them side by side
    if (landscape && body.scrollHeight > body.clientHeight) {
      w = Math.min(view.w - 8, 2 * 230);
      tipEl.dataset.wide = '';
      tipEl.style.width = `${w}px`;
    }
    const pos = placeTip({ rect: el.getBoundingClientRect(), tip: { w, h: tipEl.offsetHeight }, view, orientation: state.orientation });
    Object.assign(tipEl.style, { left: `${pos.x}px`, top: `${pos.y}px`, visibility: 'visible' });
    caret.dataset.side = pos.caret.side;
    caret.style[pos.caret.side === 'left' || pos.caret.side === 'right' ? 'top' : 'left'] = `${pos.caret.offset}px`;
  }
  const overlay = createDraftOverlay({ win, doc, state, parent: doc.body || root, base, importModule });
  let queue = Promise.resolve();
  const run = (fn) => { queue = queue.then(fn).catch((e) => { status.textContent = String((e && e.message) || e); }); return queue; };


  // `pick` (select event): the id to pin, or null to follow; applied only after the fetch succeeded
  async function loadData(pick) {
    state.counts.dataLoads++;
    const pin = pick !== undefined;
    const want = pin ? pick : state.current;
    const wantPinned = pin ? pick !== null : state.pinned;
    const list = await get('/sessions');
    state.sessions = (Array.isArray(list.sessions) ? list.sessions : []).map((s) => ({
      session_id: s.session_id, project_slug: s.project_slug, age_seconds: s.age_seconds,
      title: (s.sidecar && s.sidecar.title) || null,
    }));
    // pinned: stay on the chosen session while it is listed; once it vanished, follow the youngest again
    const pinned = wantPinned && state.sessions.some((s) => s.session_id === want);
    const current = pinned ? want : list.current || null;
    const data = current ? await get(`/sessions/${encodeURIComponent(current)}`) : {};
    state.pinned = pinned;
    state.current = current;
    // fallback hint: the node picked the newest session because the start folder has none (a pin overrides it)
    state.hint = !pinned && list.current_from === 'newest' ? `no session in ${folderOf(list)} — showing newest` : '';
    // HUD-side data for the header tile's session list (not part of the reader contract)
    data.hud = { current, pinned, sessions: state.sessions };
    state.data = data;
  }

  async function loadLayout(orientation) {
    state.counts.layoutLoads++;
    const name = named || String(state.settings[orientation === 'landscape' ? 'layout_landscape' : 'layout_portrait'] || '');
    const [layout, catalog] = await Promise.all([get(`/layouts/${encodeURIComponent(name)}`), get('/catalog')]);
    const tiles = new Map();
    for (const e of catalog.entries || []) if (e.kind === 'tile' && !tiles.has(e.name)) tiles.set(e.name, e);   // own first
    const cells = [];
    for (const p of Array.isArray(layout.tiles) ? layout.tiles : []) {
      const entry = tiles.get(p.tile);
      let mod = null;
      if (entry && entry.loadable !== false) {
        if (!state.modules.has(p.tile)) {
          const url = `${base}/tiles/${encodeURIComponent(p.tile)}.js${state.bust ? `?v=${state.bust}` : ''}`;
          state.modules.set(p.tile, importModule(url).then((m) => (isTile(m) ? m : null), () => null));
        }
        mod = await state.modules.get(p.tile);
      }
      cells.push({ name: p.tile, col: p.col, row: p.row, mod, size: (mod && tileSize(mod.meta)) || MISSING_SIZE });
    }
    state.orientation = orientation;
    state.layout = name;
    state.form = layout.form || null;
    state.cells = cells;
    // a layout of the other orientation is shown, but never silently
    state.notice = layout.orientation === orientation ? '' : `layout "${name}" is ${layout.orientation}, the window is ${orientation}`;
  }

  function draw() {
    state.counts.draws++;
    const landscape = state.orientation === 'landscape';
    const ext = extent(state.cells);
    const width = doc.documentElement.clientWidth || win.innerWidth;
    const { cols, rows } = gridDims(state.orientation, ext, state.form);
    const unit = unitFor(state.orientation, width, win.innerHeight, rows, state.settings.unit_max);
    grid.style.gridTemplateColumns = `repeat(${Math.max(cols, 1)}, ${unit}px)`;
    grid.style.gridTemplateRows = `repeat(${Math.max(rows, 1)}, ${unit}px)`;
    // reuse the cell elements while cells (layout load), orientation and unit stay the same, so a
    // tile's open UI (the header's session list) survives a live redraw
    const key = { cells: state.cells, layout: state.layout, orientation: state.orientation, unit };
    const reuse = state.drawn && ['cells', 'layout', 'orientation', 'unit'].every((k) => state.drawn[k] === key[k]);
    const els = state.cells.map((c, i) => {
      const el = reuse ? state.drawn.els[i] : doc.createElement('div');
      el.className = 'tile';
      el.dataset.tile = c.name;
      el.style.gridColumn = `${c.col + 1} / span ${c.size.cols}`;
      el.style.gridRow = `${c.row + 1} / span ${c.size.rows}`;
      if (!c.mod) {
        el.className = 'tile missing';
        el.textContent = c.name;
        return el;
      }
      try {
        c.mod.render(el, state.data, { cols: c.size.cols, rows: c.size.rows, unit });
      } catch (e) {
        el.className = 'tile missing';
        el.textContent = `${c.name}: ${String((e && e.message) || e).slice(0, 80)}`;
      }
      return el;
    });
    if (!reuse) grid.replaceChildren(...els);
    state.drawn = { ...key, els };
    status.textContent = [state.notice, state.hint].filter(Boolean).join(' · ');
    hideTip();   // a re-render replaces the marked elements; the next hover draws the tip anew
    state.unit = unit;
    overlay.redraw();
    Object.assign(root.dataset, {
      orientation: state.orientation, layout: state.layout, unit: String(unit),
      cols: String(cols), rows: String(rows), tiles: String(els.length), mismatch: String(Boolean(state.notice)), fallback: String(Boolean(state.hint)),
    });
  }

  function applyTheme() {
    const set = state.settings.theme;
    const mq = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: light)') : null;
    const light = Boolean(mq && mq.matches);
    const theme = set === 'light' || set === 'dark' ? set : light ? 'light' : 'dark';
    doc.documentElement.dataset.theme = theme;
    // the settings' colour overrides of that theme, inline on <html>; the earlier ones are taken back
    const style = doc.documentElement.style;
    if (!style || typeof style.setProperty !== 'function') return;
    for (const n of state.overrides) style.removeProperty(n);
    const pairs = themeOverrides(state.settings, theme);
    for (const [n, v] of pairs) style.setProperty(n, v);
    state.overrides = pairs.map(([n]) => n);
  }

  // Auto follows the system: a change of the OS scheme re-applies the theme (a fixed theme ignores it)
  const scheme = typeof win.matchMedia === 'function' ? win.matchMedia('(prefers-color-scheme: light)') : null;
  if (scheme && typeof scheme.addEventListener === 'function') scheme.addEventListener('change', () => { if (state.settings) applyTheme(); });

  async function onShape() {
    const next = pickOrientation(win.innerWidth, win.innerHeight, state.settings.landscape_ratio);
    if (next !== state.orientation) await loadLayout(next);
    draw();
  }

  // resize: one re-pick per frame, queued behind whatever is loading
  let framePending = false;
  win.addEventListener('resize', () => {
    state.counts.resizes++;
    if (framePending) return;
    framePending = true;
    win.requestAnimationFrame(() => { framePending = false; run(onShape); });
  });

  // a tile asks for another session (tiles/CONTRACT.md "Session switch"); null / follow unpins
  grid.addEventListener('aihud:select-session', (e) => {
    const d = (e && e.detail) || {};
    const id = d.follow || d.session_id == null || d.session_id === '' ? null : String(d.session_id);
    run(async () => {
      await loadData(id);
      draw();
    });
  });

  // a click on the HUD opens the window with the HUD's session; a tile's own controls (the header's
  // session list) keep their click, and a HUD framed inside the window opens nothing
  grid.addEventListener('click', (e) => {
    const t = e && e.target;
    if (t && typeof t.closest === 'function' && t.closest(CONTROL_SELECTOR)) return;
    if (win.top && win.top !== win) return;
    if (typeof win.open === 'function') win.open(windowHref(state.current), 'aihud-window');
  });

  // the tip: hover and keyboard focus on a marked value; leave, blur, Escape and scroll take it away
  grid.addEventListener('mouseover', (e) => {
    const el = markOf(e && e.target);
    if (!el) hideTip(); else if (el !== tipFor) showTip(el);
  });
  grid.addEventListener('mouseleave', hideTip);
  grid.addEventListener('focusin', (e) => { const el = markOf(e && e.target); if (el) showTip(el); });
  grid.addEventListener('focusout', hideTip);
  win.addEventListener('keydown', (e) => { if (e && e.key === 'Escape') hideTip(); });
  win.addEventListener('scroll', hideTip);

  // minute tick: redraw with the held data (no fetch) so tile clocks advance
  const setTick = win.setInterval ? win.setInterval.bind(win) : setInterval;
  const clearTick = win.clearInterval ? win.clearInterval.bind(win) : clearInterval;
  const tick = setTick(() => { if (state.cells.length) draw(); }, 60_000);
  if (tick && tick.unref) tick.unref();

  const events = new win.EventSource(`${base}/events`);
  events.addEventListener('layout-draft', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch { /* not ours */ }
    if (d) overlay.set(d);
  });
  const refresh = () => run(async () => { await loadData(); draw(); });
  events.addEventListener('session-updated', (e) => {
    let d = null;
    try { d = JSON.parse(e.data); } catch { /* not ours */ }
    if (d && d.id === state.current) refresh();
  });
  events.addEventListener('sessions-changed', refresh);   // the youngest session may have changed
  // catalog-changed (a layout save): forget the loaded modules and load them fresh, so a failed
  // import, an edited tile or a new own tile that shadows a shipped one shows after the next
  // catalog-changed — not on its own the moment the file changes
  events.addEventListener('catalog-changed', () => run(async () => {
    state.modules.clear();
    state.bust = Date.now();
    await loadLayout(state.orientation);
    draw();
  }));
  // settings-changed (a Save in the window): theme, colours, the layout pair and the limits anew
  events.addEventListener('settings-changed', (e) => run(async () => {
    let keys = null;
    try { keys = JSON.parse(e && e.data).keys; } catch { /* no keys named: a full change */ }
    if (Array.isArray(keys) && keys.length && keys.every((k) => WINDOW_ONLY_SETTINGS.includes(k))) return;   // the window's tab memory: nothing to redraw
    state.settings = await get('/settings');
    applyTheme();
    state.orientation = null;   // forces the layout load, even when the window shape stayed
    await onShape();
  }));

  run(async () => {
    state.settings = await get('/settings');
    applyTheme();
    await loadData(startSession === null ? undefined : startSession);
    await onShape();
  });

  return { state, ready: () => queue, close: () => { clearTick(tick); events.close(); } };
}

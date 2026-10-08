// ─────────────────────────────────────────────────────────────────────────────
//  THE HUD · DRAFT OVERLAY
//
//  While the composer is open it sends its live grid to the node (`POST /layouts/draft`); the node
//  broadcasts it as the `layout-draft` event (`tiles/CONTRACT.md` §Layouts → "The draft"). The HUD
//  page hands that event to `createDraftOverlay(...).set(draft)`: while a draft is alive and its
//  orientation is the HUD's current one, a frame the size of the draft grid is laid over the HUD at
//  the REAL unit (the one the HUD would use), with the grid lines and every placed tile rendered for
//  real. Another orientation, or the end of the draft, shows nothing. The overlay never touches the
//  HUD's own grid; it is its own absolutely placed layer that ignores the pointer.
//  All styles are inline (the HUD's style sheet stays as it is).
// ─────────────────────────────────────────────────────────────────────────────

import { unitFor, tileSize, isTile } from './hud.js';

const MISSING_SIZE = Object.freeze({ cols: 2, rows: 2 });

/** Is `draft` a live draft (not the end marker) of the HUD's current orientation? */
export function draftMatches(draft, orientation) {
  return Boolean(draft) && !draft.end && Boolean(orientation) && draft.orientation === orientation;
}

/** The frame in px for `draft` in a window of `width` × `height`: the unit the HUD would use, and cols/rows × unit. */
export function draftGeometry(draft, { width, height, unitMax }) {
  const unit = unitFor(draft.orientation, width, height, draft.rows, unitMax);
  return { unit, width: draft.cols * unit, height: draft.rows * unit };
}

/**
 * The overlay of one HUD page. `state` is the HUD's state (orientation, settings, data, modules,
 * bust); `parent` the element the layer is appended to. Returns `{set, redraw, ready, state}`:
 * `set(draft)` takes the event data (`{orientation, cols, rows, tiles}` or `{end:true}`), `redraw()`
 * re-evaluates after the HUD changed shape or data, `ready()` resolves once the drawing is done.
 */
export function createDraftOverlay({ win, doc, state, parent, base = '', importModule = (url) => import(url) }) {
  let draft = null;
  let layer = null;
  let last = null;       // what the layer shows now: { key, data }
  let version = 0;
  let queue = Promise.resolve();

  const el = (tag, cls) => { const e = doc.createElement(tag); if (cls) e.className = cls; return e; };
  function ensureLayer() {
    if (layer) return layer;
    layer = el('div', 'draft-overlay');
    Object.assign(layer.style, { position: 'absolute', left: '0px', top: '0px', zIndex: '1000', pointerEvents: 'none' });
    parent.append(layer);
    return layer;
  }
  function hide(why) {
    version++;
    last = null;
    if (!layer) return;
    layer.hidden = true;
    layer.dataset.state = why;
  }

  async function moduleOf(name) {
    if (!state.modules.has(name)) {
      const url = `${base}/tiles/${encodeURIComponent(name)}.js${state.bust ? `?v=${state.bust}` : ''}`;
      state.modules.set(name, Promise.resolve().then(() => importModule(url)).then((m) => (isTile(m) ? m : null), () => null));
    }
    return state.modules.get(name);
  }

  async function paint() {
    if (!draft) { hide('off'); return; }
    if (!draftMatches(draft, state.orientation)) { if (layer || draft) hide('mismatch'); return; }
    const width = (win.document && win.document.documentElement && win.document.documentElement.clientWidth) || win.innerWidth;
    const geo = draftGeometry(draft, { width, height: win.innerHeight, unitMax: state.settings && state.settings.unit_max });
    const key = JSON.stringify([draft, geo.unit, state.orientation, state.bust]);
    if (last && last.key === key && last.data === state.data) { layer.hidden = false; layer.dataset.state = 'shown'; return; }
    const mine = ++version;
    const { unit } = geo;
    const frame = el('div', 'frame');
    Object.assign(frame.style, {
      position: 'relative', boxSizing: 'content-box', width: `${geo.width}px`, height: `${geo.height}px`, overflow: 'hidden',
      background: 'var(--aihud-bg)',
      backgroundImage: 'linear-gradient(to right, var(--aihud-line) 1px, transparent 1px), linear-gradient(to bottom, var(--aihud-line) 1px, transparent 1px)',
      backgroundSize: `${unit}px ${unit}px`,
    });
    const cells = [];
    for (const p of draft.tiles) {
      const mod = await moduleOf(p.tile);
      if (mine !== version) return;   // a newer draft came while the module loaded
      const size = (mod && tileSize(mod.meta)) || MISSING_SIZE;
      const cell = el('div', mod ? 'tile' : 'tile missing');
      cell.dataset.tile = p.tile;
      Object.assign(cell.style, {
        position: 'absolute', left: `${p.col * unit}px`, top: `${p.row * unit}px`, width: `${size.cols * unit}px`, height: `${size.rows * unit}px`,
        overflow: 'hidden', background: 'var(--aihud-bg)',
      });
      if (!mod) cell.textContent = p.tile;
      else {
        try { mod.render(cell, state.data, { cols: size.cols, rows: size.rows, unit }); } catch (e) {
          cell.className = 'tile missing';
          cell.textContent = `${p.tile}: ${String((e && e.message) || e).slice(0, 80)}`;
        }
      }
      cells.push(cell);
    }
    if (mine !== version) return;
    const tag = el('div', 'tag');
    tag.textContent = `draft · ${draft.cols} × ${draft.rows} · ${unit} px`;
    Object.assign(tag.style, {
      position: 'absolute', left: '0px', top: `${geo.height + 4}px`, whiteSpace: 'nowrap', font: '10px var(--aihud-font-mono, monospace)', color: 'var(--aihud-bg)',
      background: 'var(--aihud-series-1)', padding: '0 4px', borderRadius: '2px',
    });
    // the frame's edge sits above the tiles, so it stays visible where a tile reaches the border
    const edge = el('div', 'edge');
    Object.assign(edge.style, { position: 'absolute', left: '0px', top: '0px', right: '0px', bottom: '0px', boxSizing: 'border-box', border: '2px dashed var(--aihud-series-1)', pointerEvents: 'none' });
    frame.append(...cells, edge);
    ensureLayer().replaceChildren(frame, tag);   // the tag sits under the frame (the frame clips its children)
    layer.hidden = false;
    layer.dataset.state = 'shown';
    layer.dataset.unit = String(unit);
    layer.dataset.cols = String(draft.cols);
    layer.dataset.rows = String(draft.rows);
    last = { key, data: state.data };
  }

  const redraw = () => { queue = queue.then(paint).catch(() => {}); return queue; };
  return {
    state: { get draft() { return draft; } },
    set(next) { draft = next && !next.end ? next : null; if (draft) ensureLayer(); return redraw(); },
    redraw,
    ready: () => queue,
  };
}

// Slab · tools live · landscape (11 × 5): model, totals, the last calls (turn.turns[].tool_calls) as slabs.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tools-slab-landscape',
  contentBlock: 'tools',
  style: 'slab',
  orientation: 'landscape',
  sizes: [{ cols: 11, rows: 5 }],
  contractVersion: '1.1',
};

// aihud:whole-seconds v1
const wholeSeconds = (d) => !!(d && Array.isArray(d.caveats) && d.caveats.some((c) => typeof c === 'string' && c.includes('_second_resolution')));
let SUB = false; // whole-second resolution: a 0 is "under 1 s" (tools draw it as <1s)

export function render(el, data, size) {
  SUB = wholeSeconds(data);
  drawToolsLandscape(el, data, size);
}

// ── drawing helpers (Slab: one svg per tile; copied in so the tile stands alone) ──
const NS = 'http://www.w3.org/2000/svg';
const DASH = '–';
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;
function node(doc, tag, attrs, text) {
  const e = doc.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  if (text != null) e.textContent = String(text);
  return e;
}
/** The tile: an svg exactly cols*unit x rows*unit, the panel 2 px inset (sketch px). */
function slate(el, size) {
  const doc = el.ownerDocument, W = size.cols * 20, H = size.rows * 20;
  const s = node(doc, 'svg', { width: size.cols * size.unit, height: size.rows * size.unit, viewBox: `0 0 ${W} ${H}` });
  s.style.cssText = 'display:block;overflow:hidden;font-family:var(--aihud-font);font-variant-numeric:tabular-nums';
  s.append(node(doc, 'rect', { x: 2, y: 2, width: W - 4, height: H - 4, style: 'fill:var(--aihud-panel);rx:var(--aihud-radius)' }));
  el.replaceChildren(s);
  return { doc, s, W, H };
}
/** One flat solid block - no stroke, no track. */
function block(s, x, y, w, h, fill) {
  s.append(node(s.ownerDocument, 'rect', { x, y, width: Math.max(0, w), height: h, style: `fill:${fill};rx:var(--aihud-radius-small)` }));
}
/** A text, vertically centred on y; max = width budget in sketch px (ellipsis when it does not fit). */
function text(s, x, y, str, o) {
  const t = node(s.ownerDocument, 'text', {
    ...(o.f ? { 'data-field': o.f } : {}), x, y, 'dominant-baseline': 'central', 'text-anchor': o.anchor || 'start',
    style: `font-size:${o.px}px;font-weight:${o.wt || 400};fill:${o.fill || 'var(--aihud-text)'}${o.ls ? `;letter-spacing:${o.ls}` : ''}`,
  }, str == null ? DASH : str);
  s.append(t);
  if (o.max != null) clip(t, o.max, o.px);
  return t;
}
function width(t, px) {
  let n = 0;
  try { n = t.getComputedTextLength(); } catch (e) { n = 0; }
  return n > 0 ? n : String(t.textContent).length * px * 0.56;
}
function clip(t, max, px) {
  const full = String(t.textContent);
  if (max < px * 0.8) { t.textContent = ''; return; }
  let s = full;
  while (width(t, px) > max && s.length > 1) { s = s.slice(0, -1); t.textContent = `${s}…`; }
  if (t.textContent !== full) t.append(node(t.ownerDocument, 'title', {}, full));
}
/** The name behind a block: trailing its end, or knocked out into the block when the room is gone. */
function trail(s, bx, len, y, label, px, right, fill, f) {
  const room = right - (bx + len + 5);
  const t = text(s, bx + len + 5, y, label, { px, fill, f });
  const need = width(t, px);
  if (need <= room || len < need + 8) { clip(t, room, px); return t; }
  t.remove();
  return text(s, bx + len - 4, y, label, { px, wt: 600, fill: 'var(--aihud-panel)', anchor: 'end', max: len - 8, f });
}

/** One call's duration: 0.3s · 13.9s · 22s · 3:19. */
function dur(ms) {
  if (num(ms) == null) return DASH;
  if (SUB && ms === 0) return '<1s';
  const s = ms / 1000;
  if (SUB && s < 10) return `${Math.round(s)}s`;
  if (s < 10) return `${s.toFixed(1)}s`;
  if (s < 59.5) return `${Math.round(s)}s`;
  const r = Math.round(s), m = Math.floor(r / 60);
  return m < 60 ? `${m}:${String(r % 60).padStart(2, '0')}` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
/** A summed time in seconds: 45s · 15m · 1.2h. */
function span(sec) {
  if (num(sec) == null) return DASH;
  if (sec < 59.5) return `${Math.round(sec)}s`;
  if (sec < 3570) return `${Math.round(sec / 60)}m`;
  return `${(sec / 3600).toFixed(1)}h`;
}
/** Model id, short: claude-fable-5-1 -> fable 5.1. */
function modelName(m) {
  if (typeof m !== 'string' || !m) return DASH;
  return m.replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2');
}

/** #27: the last n main-agent calls, newest first (contract field turn.turns[].tool_calls, flattened over the turns). */
function lastCalls(data, n) {
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  const a = [];
  for (const t of turns) {
    for (const c of (t && Array.isArray(t.tool_calls) ? t.tool_calls : [])) {
      if (c && typeof c.tool === 'string' && c.tool) a.push({ name: c.tool, ms: num(c.duration_s) != null ? c.duration_s * 1000 : null });
    }
  }
  return a.slice(-n).reverse();
}
/** Total calls and total tool time over all turns (contract: turn.turns[].tool_stats). */
function toolTotals(data) {
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  let calls = null, sec = null;
  for (const t of turns) for (const x of (t && Array.isArray(t.tool_stats) ? t.tool_stats : [])) {
    if (num(x.count) != null) calls = (calls || 0) + x.count;
    if (num(x.duration) != null) sec = (sec || 0) + x.duration;
  }
  return { calls, sec };
}
const modelOf = (data) => (data && data.session && data.session.model) || (inst(data) && inst(data).model) || null;
const modelSrc = (data) => (data && data.session && data.session.model ? 'session.model' : inst(data) && inst(data).model ? 'live.instances[].model' : null);
const modelAbs = (data) => (modelOf(data) ? null : notRecorded(data, 'session', 'model') ? 'session.model' : notRecorded(data, 'live', 'tokens') ? 'live.instances[].model' : null);
// ── part 2: tools live: model, totals, the last calls as grey slabs ──
function callRows(s, calls, rows, L) {
  const max = calls.reduce((m, c) => Math.max(m, c.ms || 0), 0);
  for (let k = 0; k < rows.length; k++) {
    const y = rows[k], c = calls[k];
    if (!c) { text(s, L.fx, y, DASH, { px: 10.5, wt: 700, fill: 'var(--aihud-faint)', anchor: 'end' }); continue; }
    const live = k === 0;
    text(s, L.fx, y, dur(c.ms), { px: 10.5, wt: 750, fill: live ? 'var(--aihud-text)' : 'var(--aihud-dim)', anchor: 'end', f: c.ms != null ? 'turn.turns[].tool_calls[].duration_s' : null });
    const len = Math.max(2, max > 0 ? L.blen * c.ms / max : 2);
    block(s, L.bx, y - L.bh / 2, len, L.bh, live ? 'var(--aihud-main)' : 'var(--aihud-sub)');
    trail(s, L.bx, len, y, c.name || DASH, 10, L.right, live ? 'var(--aihud-text)' : 'var(--aihud-dim)', 'turn.turns[].tool_calls[].tool');
  }
}
function drawToolsLandscape(el, data, size) {
  const { s, W } = slate(el, size);
  const right = W - 8, tot = toolTotals(data), cw = 56;
  text(s, 8, 14, 'model', { px: 9, fill: 'var(--aihud-faint)', ls: '.05em' });
  text(s, 8, 29, modelName(modelOf(data)), { px: 12, wt: 700, max: cw, f: modelSrc(data) || modelAbs(data), fill: modelAbs(data) ? 'var(--aihud-absent)' : undefined });
  text(s, 8, 49, 'calls', { px: 9, fill: 'var(--aihud-faint)', ls: '.05em' });
  text(s, 8, 65, tot.calls == null ? DASH : String(tot.calls), { px: 16, wt: 750, fill: tot.calls == null ? 'var(--aihud-faint)' : 'var(--aihud-text)', max: cw, f: tot.calls != null ? 'turn.turns[].tool_stats[].count' : null });
  text(s, 8, 85, tot.sec == null ? DASH : `${span(tot.sec)} in tools`, { px: 9.5, fill: 'var(--aihud-dim)', max: cw, f: tot.sec != null ? 'turn.turns[].tool_stats[].duration' : null });
  callRows(s, lastCalls(data, 5), [15, 32, 49, 66, 83], { fx: 106, bx: 110, bh: 11, blen: 50, right });
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

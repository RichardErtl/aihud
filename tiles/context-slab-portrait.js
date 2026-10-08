// Slab · context · portrait (8 × 2): the fill as one heat block.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'context-slab-portrait',
  contentBlock: 'context',
  style: 'slab',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 2 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  drawContextPortrait(el, data, size);
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
    x, y, 'dominant-baseline': 'central', 'text-anchor': o.anchor || 'start',
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
function trail(s, bx, len, y, label, px, right, fill) {
  const room = right - (bx + len + 5);
  const t = text(s, bx + len + 5, y, label, { px, fill });
  const need = width(t, px);
  if (need <= room || len < need + 8) { clip(t, room, px); return t; }
  t.remove();
  return text(s, bx + len - 4, y, label, { px, wt: 600, fill: 'var(--aihud-panel)', anchor: 'end', max: len - 8 });
}

/** A heavy figure: the big part plus a small tail ("31" + ".8%"). */
function figure(s, x, y, big, tail, o) {
  const doc = s.ownerDocument;
  const t = node(doc, 'text', { x, y, 'dominant-baseline': 'central', 'text-anchor': o.anchor || 'end', style: `font-size:${o.px}px;font-weight:750;fill:${o.fill}` });
  t.append(node(doc, 'tspan', {}, big));
  if (tail) t.append(node(doc, 'tspan', { style: `font-size:${o.tail}px;font-weight:650` }, tail));
  s.append(t);
  return t;
}
// ── heat: CONTRACT.md §Heat - the one colour function, local copy ──
const HEAT_STOPS = [0, 30, 50, 75, 100];
const HEAT_FILL = ['var(--aihud-heat-0)', 'var(--aihud-heat-30)', 'var(--aihud-heat-50)', 'var(--aihud-heat-75)', 'var(--aihud-heat-100)'];
const HEAT_TEXT = ['var(--aihud-heat-text-0)', 'var(--aihud-heat-text-30)', 'var(--aihud-heat-text-50)', 'var(--aihud-heat-text-75)', 'var(--aihud-heat-text-100)'];
function heat(v, ramp) {
  ramp = ramp || HEAT_FILL;
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i]) i++;
  const p = ((HEAT_STOPS[i] - x) / (HEAT_STOPS[i] - HEAT_STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}

// ── part 3: context, reduced to its essence: the fill as one heat block ──
function pctParts(v) { const [w, d] = v.toFixed(1).split('.'); return [w, `.${d}%`]; }
function drawContextPortrait(el, data, size) {
  const { s, W } = slate(el, size);
  const right = W - 8, i = inst(data), pct = num(i && i.context_percent), y = 20, fx = 47, bx = 51;
  if (pct == null) {
    const absent = (notRecorded(data, 'live', 'tokens') || notRecorded(data, 'live', 'window'));
    const dash = text(s, fx, y, DASH, { px: 16, wt: 700, fill: absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)', anchor: 'end' });
    if (absent) dash.setAttribute('data-field', 'live.instances[].context_percent');
    text(s, bx, y, 'context', { px: 9.5, fill: 'var(--aihud-faint)', ls: '.05em' });
    return;
  }
  const [w, d] = pctParts(pct);
  figure(s, fx, y, w, d, { px: 16, tail: 9, fill: heat(pct, HEAT_TEXT) }).setAttribute('data-field', 'live.instances[].context_percent');
  const len = Math.max(2, (right - bx) * Math.min(100, pct) / 100);
  block(s, bx, 8, len, 24, heat(pct));
  trail(s, bx, len, y, 'context', 9.5, right, 'var(--aihud-dim)');
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

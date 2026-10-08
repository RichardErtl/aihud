// Slab · top-three-subagents · landscape (6 × 5): three heaviest subagents, figure · block · name.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'top-three-subagents-slab-landscape',
  contentBlock: 'top-three-subagents',
  style: 'slab',
  orientation: 'landscape',
  sizes: [{ cols: 6, rows: 5 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  drawTopThree(el, data, size, { y: [21, 50, 79], fx: 34, fpx: 16, bx: 39, bh: 22, stack: true });
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
    x, y, 'dominant-baseline': 'central', 'text-anchor': o.anchor || 'start', ...(o.field ? { 'data-field': o.field } : {}),
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
function trail(s, bx, len, y, label, px, right, fill, field) {
  const room = right - (bx + len + 5);
  const t = text(s, bx + len + 5, y, label, { px, fill, field });
  const need = width(t, px);
  if (need <= room || len < need + 8) { clip(t, room, px); return t; }
  t.remove();
  return text(s, bx + len - 4, y, label, { px, wt: 600, fill: 'var(--aihud-panel)', anchor: 'end', max: len - 8, field });
}

/** A heavy figure: the big part plus a small tail ("31" + ".8%"). */
function figure(s, x, y, big, tail, o) {
  const doc = s.ownerDocument;
  const t = node(doc, 'text', { x, y, 'dominant-baseline': 'central', 'text-anchor': o.anchor || 'end', ...(o.field ? { 'data-field': o.field } : {}), style: `font-size:${o.px}px;font-weight:750;fill:${o.fill}` });
  t.append(node(doc, 'tspan', {}, big));
  if (tail) t.append(node(doc, 'tspan', { style: `font-size:${o.tail}px;font-weight:650` }, tail));
  s.append(t);
  return t;
}
/** Tokens as a short number: 812 · 534k · 5.8M. Missing -> the dash. */
function compact(n) {
  if (num(n) == null) return DASH;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
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

/** #24: the three heaviest subagents, share of the session's tokens (nodes without tokens_self > 0 skipped). */
function heaviest(data) {
  const nodes = data && data.agents && Array.isArray(data.agents.nodes) ? data.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const i = inst(data);
  const total = root && num(root.tokens_total) != null ? root.tokens_total : i && num(i.tokens_total) != null ? i.tokens_total : null;
  const tPath = root && num(root.tokens_total) != null ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const subs = total > 0 ? nodes.filter((n) => n.parent_id != null && num(n.tokens_self) != null && n.tokens_self > 0) : [];
  const top = subs.sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3)
    .map((n) => ({ share: (n.tokens_self / total) * 100, type: n.agent_type || DASH, tokens: n.tokens_self, shareF: 'agents.nodes[].tokens_self ' + tPath, typeF: n.agent_type ? 'agents.nodes[].agent_type' : null, tokF: 'agents.nodes[].tokens_self' }));
  while (top.length < 3) top.push({ share: null, type: null, tokens: null });
  return top;
}
// ── part 1: top-three-subagents, reinterpreted: three slabs, figure · block · name ──
function drawTopThree(el, data, size, L) {
  const { s, W } = slate(el, size);
  const right = W - 8;
  const tops = heaviest(data), subAbs = tops[0].share == null && notRecorded(data, 'agents', 'subagents');
  tops.forEach((t, k) => {
    const y = L.y[k];
    if (t.share == null) { text(s, L.fx, y, DASH, k === 0 && subAbs ? { px: L.fpx, wt: 700, fill: 'var(--aihud-absent)', anchor: 'end', field: 'agents.subagents_started' } : { px: L.fpx, wt: 700, fill: 'var(--aihud-faint)', anchor: 'end' }); return; }
    figure(s, L.fx, y, String(Math.round(t.share)), '%', { px: L.fpx, tail: Math.max(9, L.fpx * 0.6), fill: heat(t.share, HEAT_TEXT), field: t.shareF });
    const len = Math.max(2, (right - L.bx) * Math.min(100, t.share) / 100);
    block(s, L.bx, y - L.bh / 2, len, L.bh, heat(t.share));
    if (L.stack) {
      const nx = L.bx + len + 5;
      text(s, nx, y - 5.5, t.type, { px: 10, fill: 'var(--aihud-dim)', max: right - nx, field: t.typeF });
      text(s, nx, y + 6.5, compact(t.tokens), { px: 9, fill: 'var(--aihud-faint)', max: right - nx, field: t.tokF });
    } else {
      const tk = text(s, right, y, compact(t.tokens), { px: 9, fill: 'var(--aihud-faint)', anchor: 'end', field: t.tokF });
      trail(s, L.bx, len, y, t.type, 10, right - width(tk, 9) - 5, 'var(--aihud-dim)', t.typeF);
    }
  });
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

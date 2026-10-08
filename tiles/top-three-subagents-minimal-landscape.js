// Minimal · top-three-subagents · landscape (6 × 6): value #24 (share of session tokens), the same three scaled columns as the
// portrait tile, taller and narrower for the band.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'top-three-subagents-minimal-landscape',
  contentBlock: 'top-three-subagents',
  style: 'minimal',
  orientation: 'landscape',
  sizes: [{ cols: 6, rows: 6 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, box, k, inner } = card(el, size);
  const bars = h(doc, 'div', `margin-top:${4 * z}px`);
  bars.append(columns(doc, z, heaviest(data), { width: inner, barH: 58, scale: true }));
  k.append(h(doc, 'div', CAP(z), 'share of tokens'), bars);
  mark(box, data, ['agents']);
}

// ── drawing helpers (Minimal style; copied into every Minimal tile so each tile stands alone) ──
// Drawn in sketch pixels at unit 20 and scaled by z = unit / 20 (CONTRACT.md §Layouts).
const DASH = '–';

/** A styled element; text only through textContent (names come from the transcript). */
function h(doc, tag, css, text) {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = String(text);
  return e;
}

/** The tile box (cols × unit by rows × unit) and the Minimal card inside it, 2 px inset. */
function card(el, size, padY = 5, padX = 6) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const box = h(doc, 'div', [
    `width:${size.cols * size.unit}px`, `height:${size.rows * size.unit}px`, 'box-sizing:border-box',
    `padding:${2 * z}px`, 'overflow:hidden', 'font-family:var(--aihud-font)', 'color:var(--aihud-text)',
  ].join(';'));
  const k = h(doc, 'div', [
    'height:100%', 'box-sizing:border-box', 'overflow:hidden', 'display:flex', 'flex-direction:column',
    `padding:${padY * z}px ${padX * z}px`, 'background:var(--aihud-panel)', 'border-radius:var(--aihud-radius)',
  ].join(';'));
  box.append(k);
  el.replaceChildren(box);
  // inner width of the card in sketch pixels
  return { doc, z, box, k, inner: size.cols * 20 - 4 - 2 * padX };
}

const CAP = (z) => `color:var(--aihud-faint);font-size:${10 * z}px;text-transform:uppercase;letter-spacing:.06em;line-height:1.2;white-space:nowrap;overflow:hidden`;
const LBL = (z) => `color:var(--aihud-faint);font-size:${9.5 * z}px;text-transform:uppercase;letter-spacing:.05em;line-height:1.2;white-space:nowrap;overflow:hidden`;
const VALUE = (z, px = 16) => `font-size:${px * z}px;font-weight:650;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap`;
const SUB = (z) => `color:var(--aihud-dim);font-size:${11 * z}px;line-height:1.35;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
const EMPTY = ';color:var(--aihud-faint)';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inst = (data) => (data && data.live && Array.isArray(data.live.instances) && data.live.instances[0]) || null;

/** Tokens as a short number: 812 · 534k · 5.8M. Missing → the dash, never 0. */
function compact(n) {
  if (num(n) == null) return DASH;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A type the tile needs is missing: the reader's own not_delivered names go on the hover title. */
function mark(box, data, types) {
  const nd = data && Array.isArray(data.not_delivered) ? data.not_delivered : [];
  const hit = nd.filter((n) => types.some((t) => !(data && data[t]) && String(n).startsWith(`${t}:`)));
  if (hit.length) box.setAttribute('title', `not delivered: ${hit.join(', ')}`);
}

// ── heat: CONTRACT.md §Heat — the mockup's heat colour function in CSS, the same in every style ──
const HEAT_STOPS = [0, 30, 50, 75, 100];
const HEAT_FILL = ['var(--aihud-heat-0)', 'var(--aihud-heat-30)', 'var(--aihud-heat-50)', 'var(--aihud-heat-75)', 'var(--aihud-heat-100)'];
const HEAT_TEXT = ['var(--aihud-heat-text-0)', 'var(--aihud-heat-text-30)', 'var(--aihud-heat-text-50)', 'var(--aihud-heat-text-75)', 'var(--aihud-heat-text-100)'];
/** The colour of v percent: a straight mix of the two neighbouring stops (ramp = fill or text stops). */
function heat(v, ramp = HEAT_FILL) {
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i]) i++;
  const p = ((HEAT_STOPS[i] - x) / (HEAT_STOPS[i] - HEAT_STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}
let axes = 0;   // gradient ids: unique per drawing (dark and light tiles share one page in the probe)

const NS = 'http://www.w3.org/2000/svg';
function svg(doc, tag, attrs, text) {
  const e = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = String(text);
  return e;
}
const fit = (s, w, px) => { const n = Math.max(1, Math.floor(w / (px * 0.56))); s = String(s); return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s; };

/**
 * Bars and numbers: columns as ONE svg, drawn in sketch pixels (viewBox) and scaled by z.
 * cols: [{ fill: 0..100 or null, color, top, bottom }] · width/barH in sketch px · scale = the
 * 0/50/100 axis with ticks · labels = a number row above and a name row below.
 */
function columns(doc, z, cols, { width, barH, scale = false, labels = true, colW = null }) {
  const LH = 12.8, GAP = 3, AX = scale ? 22 : 0, FS = 9.5;
  const top = labels ? LH + GAP : 0;
  const H = top + barH + (labels ? GAP + LH : 0);
  const s = svg(doc, 'svg', { width: width * z, height: H * z, viewBox: `0 0 ${width} ${H}` });
  s.style.cssText = 'display:block;overflow:visible';
  const txt = `font-family:var(--aihud-font);font-variant-numeric:tabular-nums`;
  if (scale) {
    const axis = { x: AX - 3, y: top, width: 3, height: barH, rx: 1 };
    if (cols.some((c) => num(c.fill) != null)) {
      // the sketch's axis is the heat scale itself, 0 at the bottom, 100 at the top (scale columns)
      const id = `${meta.name}-axis-${axes++}`;
      const ramp = svg(doc, 'linearGradient', { id, x1: 0, y1: 1, x2: 0, y2: 0 });
      HEAT_STOPS.forEach((p, j) => ramp.append(svg(doc, 'stop', { offset: p / 100, style: `stop-color:${HEAT_FILL[j]}` })));
      const defs = svg(doc, 'defs', {});
      defs.append(ramp);
      s.append(defs, svg(doc, 'rect', { ...axis, fill: `url(#${id})` }));
    } else s.append(svg(doc, 'rect', { ...axis, style: 'fill:var(--aihud-faint)' }));   // nothing delivered: heat stands only for values
    for (const [t, y] of [['100', top + 3], ['50', top + barH / 2], ['0', top + barH - 3]]) {
      s.append(svg(doc, 'text', { x: AX - 6, y, 'text-anchor': 'end', 'dominant-baseline': 'central', style: `${txt};font-size:8.5px;fill:var(--aihud-faint)` }, t));
    }
  }
  const x0 = scale ? AX + GAP : 0;
  const n = cols.length;
  const cw = colW != null ? colW : (width - x0 - GAP * (n - 1)) / n;
  cols.forEach((c, i) => {
    const x = x0 + i * (cw + GAP);
    const track = svg(doc, 'rect', { x, y: top, width: cw, height: barH, rx: 2, style: 'fill:var(--aihud-line-2)' });
    if (c.aria) { track.setAttribute('role', 'img'); track.setAttribute('aria-label', c.aria); }
    s.append(track);
    const f = num(c.fill);
    if (f != null && f > 0) {
      const hh = barH * Math.min(100, f) / 100;
      s.append(svg(doc, 'rect', { x, y: top + barH - hh, width: cw, height: hh, rx: 2, style: `fill:${c.color}` }));
    }
    if (scale) {
      for (const p of [25, 50, 75]) {
        s.append(svg(doc, 'rect', { x, y: top + barH * (1 - p / 100) - 0.5, width: cw, height: 1, style: `fill:var(${p === 50 ? '--aihud-faint' : '--aihud-line'});opacity:.6` }));
      }
    }
    if (labels) {
      const cx = x + cw / 2;
      const dim = c.top == null || c.top === DASH;
      const ink = c.topAbsent ? 'var(--aihud-absent)' : dim ? 'var(--aihud-faint)' : c.topColor || 'var(--aihud-dim)';
      s.append(svg(doc, 'text', { x: cx, y: LH / 2, ...(c.topF ? { 'data-field': c.topF } : {}), 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `${txt};font-size:${FS}px;fill:${ink}` }, fit(c.top == null ? DASH : c.top, cw + GAP, FS)));
      const name = c.bottom == null ? DASH : String(c.bottom);
      const shown = fit(name, cw + GAP, FS);
      const t = svg(doc, 'text', { x: cx, y: top + barH + GAP + LH / 2, ...(c.bottomF ? { 'data-field': c.bottomF } : {}), 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `${txt};font-size:${FS}px;fill:var(--aihud-faint)` }, shown);
      if (shown !== name) t.append(svg(doc, 'title', {}, name));   // the full name on hover
      s.append(t);
    }
  });
  return s;
}

/**
 * Value #24: the three subagents with the most tokens of their own (`tokens_self`), each as its
 * share of the session's tokens (root `tokens_total`) in percent. Always three slots; a missing one
 * stays an empty track.
 */
function heaviest(data) {
  const nodes = data && data.agents && Array.isArray(data.agents.nodes) ? data.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const i = inst(data);
  const total = root && num(root.tokens_total) != null ? root.tokens_total : i && num(i.tokens_total) != null ? i.tokens_total : null;
  const subs = total > 0 ? nodes.filter((n) => n.parent_id != null && num(n.tokens_self) != null) : [];
  const top = subs.sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3)
    .map((n) => ({ share: (n.tokens_self / total) * 100, type: n.agent_type || DASH, typeF: n.agent_type ? 'agents.nodes[].agent_type' : null, shareF: 'agents.nodes[].tokens_self ' + (root && num(root.tokens_total) != null ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total') }));
  while (top.length < 3) top.push({ share: null, type: null });
  const subAbs = !top[0].type && notRecorded(data, 'agents', 'subagents');
  return top.map((t, ix) => ({
    // column in the heat colour of the share, its number in the text stops
    fill: t.share, color: t.share == null ? null : heat(t.share), topColor: t.share == null ? null : heat(t.share, HEAT_TEXT),
    topF: t.shareF || null, bottomF: t.typeF || null, top: t.share == null ? DASH : String(Math.round(t.share)), bottom: t.type == null ? DASH : t.type,
    aria: t.share == null ? null : `${t.type} ${t.share.toFixed(1)} % of session tokens`,
    ...(ix === 0 && subAbs ? { topAbsent: true, topF: 'agents.subagents_started' } : {}),
  }));
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

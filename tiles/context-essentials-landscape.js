// Essentials (flat --aihud-bg surface) - context - landscape: the gauge of the main agent's context fill, as large as the
// 6-row band allows (116 px high), centred; window size at the gauge end, fill percent and the session's total tokens in the middle.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'context-essentials-landscape',
  contentBlock: 'context',
  style: 'essentials',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 6 }],
  contractVersion: '1.1',
};

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  draw(el, data, size);
  if ((notRecorded(data, 'live', 'tokens') || notRecorded(data, 'live', 'window'))) absentOnly(el.firstElementChild, 'context', 'live.instances[].context_percent', size.unit / 20);
}

function draw(el, data, size) {
  const d = data || {};
  const inner = frame(el, size, '2px 10px');
  const svg = gauge(el.ownerDocument, values(d));
  svg.style.cssText = 'display:block;width:auto;height:116px;margin:0 auto';
  inner.append(svg);
}

// ── data ─────────────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Fill percent (live, else the last context point), window size, total tokens — each null when missing. */
function values(d) {
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  let percent = inst && isNum(inst.context_percent) ? inst.context_percent : null;
  let percentPath = percent != null ? 'live.instances[].context_percent' : null;
  const points = d.context && Array.isArray(d.context.points) ? d.context.points : [];
  if (percent == null && points.length && isNum(points[points.length - 1].percent)) {
    percent = points[points.length - 1].percent;
    percentPath = 'context.points[].percent';
  }
  let windowSize = inst && isNum(inst.context_window) ? inst.context_window : null;
  let windowPath = windowSize != null ? 'live.instances[].context_window' : null;
  const s = d.session;
  if (windowSize == null && s && d.windows && d.windows[s.provider] && isNum(d.windows[s.provider][s.model])) {
    windowSize = d.windows[s.provider][s.model];
    windowPath = 'windows.<key>.<key>';
  }
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  return { percent, percentPath, windowSize, windowPath, total };
}

function tokens(n) {
  if (n >= 999500) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}
const windowLabel = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`);

// ── drawing ──────────────────────────────────────────────────────────────────

const SVG = 'http://www.w3.org/2000/svg';
const ARC = 210;
const START = -ARC / 2;
const BLOCKS = 21;
const CY = 100;

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

function s(doc, tag, attrs, text) {
  const n = doc.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}
const pt = (r, a) => {
  const rad = (a * Math.PI) / 180;
  return [(100 + r * Math.sin(rad)).toFixed(2), (CY - r * Math.cos(rad)).toFixed(2)];
};
const arc = (r, a0, a1) => {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/** The sketch's big gauge, viewBox 200 × 180. */
function gauge(doc, { percent, percentPath, windowSize, windowPath, total }) {
  const has = percent != null;
  const v = has ? Math.max(0, Math.min(100, percent)) : 0;
  const svg = s(doc, 'svg', { viewBox: '0 0 200 180', role: 'img', 'aria-label': has ? `context ${percent.toFixed(1)} percent` : 'context –' });
  const step = ARC / BLOCKS;
  const width = step * 0.74;
  for (let i = 0; i < BLOCKS; i++) {
    const a0 = START + i * step + (step - width) / 2;
    const on = has && (i / BLOCKS) * 100 < v;
    // every block in the heat colour of its position, the unlit ones faded
    svg.append(s(doc, 'path', { d: arc(86, a0, a0 + width), fill: 'none', 'stroke-width': 20,
      style: has ? `stroke:${heat(((i + 0.5) / BLOCKS) * 100)}${on ? '' : ';opacity:var(--aihud-heat-rest)'}` : 'stroke:var(--aihud-line)' }));
  }
  const hot = has ? heat(v, HEAT_TEXT) : null;
  if (has) {
    const a = START + (v / 100) * ARC;
    const [x0, y0] = pt(14, a);
    const [x1, y1] = pt(68, a);
    svg.append(s(doc, 'line', { x1: x0, y1: y0, x2: x1, y2: y1, 'stroke-width': 4, 'stroke-linecap': 'round', style: `stroke:${hot}` }));
  }
  svg.append(s(doc, 'circle', { cx: 100, cy: CY, r: 7, style: `fill:${has ? hot : 'var(--aihud-line)'}` }));
  const [lx, ly] = pt(86, START);
  const [rx, ry] = pt(86, -START);
  const scale = 'fill:var(--aihud-faint);font-size:15px';
  svg.append(s(doc, 'text', { x: lx, y: +ly + 24, 'text-anchor': 'middle', 'data-scale': '', style: scale }, '0'));
  if (windowSize != null) svg.append(s(doc, 'text', { x: 199, y: +ry + 24, 'text-anchor': 'end', 'data-scale': '', 'data-field': windowPath, style: scale }, windowLabel(windowSize)));

  const pct = s(doc, 'text', { x: 100, y: CY + 52, 'text-anchor': 'middle', ...(has ? { 'data-field': percentPath } : {}),
    style: `fill:${has ? hot : 'var(--aihud-faint)'};font-weight:650;font-size:48px;font-variant-numeric:tabular-nums` });
  if (has) {
    const [whole, tenth] = percent.toFixed(1).split('.');
    pct.append(s(doc, 'tspan', { style: 'font-size:48px' }, whole), s(doc, 'tspan', { style: 'font-size:25px' }, `.${tenth}%`));
  } else pct.textContent = '–';
  svg.append(pct);
  svg.append(s(doc, 'text', { x: 100, y: CY + 78, 'text-anchor': 'middle', ...(total != null ? { 'data-field': 'live.instances[].tokens_total' } : {}),
    style: `fill:var(${total != null ? '--aihud-text' : '--aihud-faint'});font-size:23px;font-weight:600;font-variant-numeric:tabular-nums` },
  total != null ? tokens(total) : '–'));
  return svg;
}

function h(doc, tag, css, text) {
  const n = doc.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}

/** The tile box at its exact pixel size; inside, the sketch at 20 px per unit, zoomed to the unit. */
function frame(el, size, pad) {
  const doc = el.ownerDocument;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
    + 'background:var(--aihud-bg);color:var(--aihud-text)');
  const inner = h(doc, 'div', `width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
    + `box-sizing:border-box;padding:${pad};display:grid;align-content:safe center;`
    + 'font:13px/1.35 var(--aihud-font);font-variant-numeric:tabular-nums');
  box.append(inner);
  el.replaceChildren(box);
  return inner;
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

// aihud:absent-only v1
const absentOnly = (node, caption, field, z) => {
  const doc = node.ownerDocument, part = (css, t) => { const e = doc.createElement('div'); e.style.cssText = css + ';line-height:1.25'; e.textContent = t; return e; };
  const dash = part('font-size:' + 22 * z + 'px;font-weight:650;color:var(--aihud-absent)', '–');
  dash.setAttribute('data-field', field);
  node.style.cssText += ';box-sizing:border-box;display:flex;flex-direction:column;align-content:center;justify-content:center;align-items:center;text-align:center;gap:' + 2 * z + 'px;padding:' + 4 * z + 'px';
  node.replaceChildren(part('font-size:' + 9 * z + 'px;letter-spacing:.06em;text-transform:uppercase;color:var(--aihud-faint);font-weight:400', caption), dash);
};

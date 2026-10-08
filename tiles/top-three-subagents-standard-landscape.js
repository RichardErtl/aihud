// Standard · the three heaviest subagents · landscape: three small gauges stacked in one column, the
// agent type to the right of each; a caption names what the gauges show. A gauge shows the subagent's own tokens as a share of the session's total tokens
// (agents.nodes[].tokens_self against the root's tokens_total).
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'top-three-subagents-standard-landscape',
  contentBlock: 'top-three-subagents',
  style: 'standard',
  orientation: 'landscape',
  sizes: [{ cols: 7, rows: 7 }],
  contractVersion: '1.1',
};

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const inner = frame(el, size, '4px 14px');
  const caption = h(doc, 'div', 'color:var(--aihud-faint);font-size:10px;line-height:1.2;text-transform:uppercase;letter-spacing:.06em;margin:0 0 1px', 'share of tokens');
  const column = h(doc, 'div', 'display:flex;flex-direction:column;justify-content:space-between;height:104px');
  const items = heaviest(data || {}), subAbs = !items[0] && notRecorded(data, 'agents', 'subagents');
  for (const [i, item] of items.entries()) {
    const cell = h(doc, 'div', 'display:flex;align-items:center;gap:6px');
    const svg = mini(doc, item, i === 0 && subAbs);
    svg.style.cssText = 'display:block;width:34px;height:34px;margin:0;flex:none';
    const label = h(doc, 'div',
      'font-size:11px;color:var(--aihud-dim);width:62px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
      item ? item.name : NBSP);
    if (item && item.nameMarked) label.setAttribute('data-field', 'agents.nodes[].agent_type');
    cell.append(svg, label);
    column.append(cell);
  }
  inner.append(caption, column);
}

// ── data ─────────────────────────────────────────────────────────────────────

const NBSP = String.fromCharCode(160);   // keeps the empty label line its height
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Always three slots: `{name, percent}` of the heaviest subagents by own tokens, `null` where none. */
function heaviest(d) {
  const nodes = d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] : null;
  const total = root && isNum(root.tokens_total) ? root.tokens_total : inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  // the total the share was divided by: the field actually read
  const totalPath = root && isNum(root.tokens_total) ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const subs = total > 0
    ? nodes.filter((n) => n.parent_id != null && isNum(n.tokens_self)).sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3)
    : [];
  const out = subs.map((n) => ({
    name: typeof n.agent_type === 'string' ? n.agent_type : '–',
    nameMarked: typeof n.agent_type === 'string',
    percent: (n.tokens_self / total) * 100,
    percentPath: `agents.nodes[].tokens_self ${totalPath}`,
  }));
  while (out.length < 3) out.push(null);
  return out;
}

// ── drawing ──────────────────────────────────────────────────────────────────

const SVG = 'http://www.w3.org/2000/svg';

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
  return [(24 + r * Math.sin(rad)).toFixed(2), (24 - r * Math.cos(rad)).toFixed(2)];
};
const arc = (r, a0, a1) => {
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/** The sketch's mini gauge, viewBox 48 × 48: a 270° track, the share on top, the percent inside. */
function mini(doc, item, absent = false) {
  const svg = s(doc, 'svg', { viewBox: '0 0 48 48', role: 'img', 'aria-label': item ? `${item.name} ${item.percent.toFixed(1)} percent of session tokens` : absent ? 'not recorded' : 'no subagent' });
  const line = { fill: 'none', 'stroke-width': 3, 'stroke-linecap': 'round' };
  svg.append(s(doc, 'path', { ...line, d: arc(18, -135, 135), style: 'stroke:var(--aihud-line)' }));
  // arc and percent in the heat colour of the share (text stops)
  const hot = item ? heat(item.percent, HEAT_TEXT) : null;
  const text = s(doc, 'text', { x: 24, y: 28, 'text-anchor': 'middle', ...(item ? { 'data-field': item.percentPath } : absent ? { 'data-field': 'agents.subagents_started' } : {}),
    style: `fill:${item ? hot : absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)'};font-weight:600;font-size:12.5px;font-variant-numeric:tabular-nums` });
  if (item) {
    const v = Math.max(0.5, Math.min(100, item.percent));
    svg.append(s(doc, 'path', { ...line, d: arc(18, -135, -135 + v * 2.7), style: `stroke:${hot}` }));
    const [whole, tenth] = item.percent.toFixed(1).split('.');
    text.append(s(doc, 'tspan', { style: 'font-size:12.5px' }, whole), s(doc, 'tspan', { style: 'font-size:7.5px' }, `.${tenth}%`));
  } else text.textContent = '–';
  svg.append(text);
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
    + 'background:var(--aihud-panel);color:var(--aihud-text)');
  const inner = h(doc, 'div', `width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
    + `box-sizing:border-box;padding:${pad};display:grid;align-content:safe center;`
    + 'font:13px/1.35 var(--aihud-font);font-variant-numeric:tabular-nums');
  box.append(inner);
  el.replaceChildren(box);
  return inner;
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

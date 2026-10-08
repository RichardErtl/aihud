// Fancy A · context · portrait (8×7). The outer ring alone: the main agent's context fill as a
// ring that brightens along its length, the percent and the session's total tokens in the middle.
// (The sketch drew the three heaviest subagents as inner rings of the same SVG; they are their own
// tile now: top-three-subagents.)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'context-fancy-a-portrait',
  contentBlock: 'context',
  style: 'fancy-a',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 7 }],
  contractVersion: '1.1',
};

/** Ring diameter in px at unit 20 (the sketch's size). */
const RING = 128;

const NS = 'http://www.w3.org/2000/svg';
const SVG = new Set(['svg', 'g', 'path', 'circle', 'text', 'tspan']);
/** One element. `text` sets textContent (never innerHTML: names come from the transcript). */
function h(doc, tag, props = {}, ...kids) {
  const n = SVG.has(tag) ? doc.createElementNS(NS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'style') n.style.cssText = v;
    else if (k === 'text') n.textContent = String(v);
    else n.setAttribute(k, String(v));
  }
  for (const c of kids.flat(Infinity)) if (c) n.append(c);
  return n;
}
/** What the reader said about the types this tile needs (CONTRACT.md: a missing value is named in not_delivered). */
function why(data, types) {
  const nd = data && Array.isArray(data.not_delivered) ? data.not_delivered : [];
  return types.filter((t) => !(data && data[t])).map((t) => {
    const named = nd.filter((n) => String(n).startsWith(`${t}:`));
    return `${t} not delivered${named.length ? `: ${named.join(', ')}` : ''}`;
  }).join('\n') || null;
}
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const tok = (n) => (n == null ? '–' : n < 1000 ? String(Math.round(n))
  : n < 1e6 ? `${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k` : `${(n / 1e6).toFixed(1)}M`);

// ── the ring ────────────────────────────────────────────────────────────────
const pt = (cx, cy, r, a) => {
  const rad = (a * Math.PI) / 180;
  return [+(cx + r * Math.sin(rad)).toFixed(2), +(cy - r * Math.cos(rad)).toFixed(2)];
};
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
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
/**
 * Track plus the filled arc in 3° pieces, each in the heat colour of its position, and a round tip
 * in the colour of the value; the arc glows in that colour where the theme asks for it (gradient arc).
 */
function ring(doc, cx, cy, r, sw, v) {
  const out = [h(doc, 'circle', { cx, cy, r, fill: 'none', style: `stroke:var(--aihud-line-2);stroke-width:${sw}` })];
  if (v == null) return out;
  const end = (360 * Math.max(0, Math.min(100, v))) / 100;
  const c = heat(v);
  const pieces = [];
  for (let a = 0; a < end; a += 3) {
    pieces.push(h(doc, 'path', { d: arc(cx, cy, r, a, Math.min(a + 3.6, end)), fill: 'none', style: `stroke:${heat(a / 3.6)};stroke-width:${sw}` }));
  }
  out.push(h(doc, 'g', { style: `filter:drop-shadow(0 0 var(--aihud-glow) ${c})` }, pieces));
  if (end > 0) {
    const [x, y] = pt(cx, cy, r, end);
    out.push(h(doc, 'circle', { cx: x, cy: y, r: sw / 2, style: `fill:${c};filter:drop-shadow(0 0 calc(var(--aihud-glow) * 5 / 3) ${c})` }));
  }
  return out;
}

/** The main agent's context fill: the live instance, else the last context point. */
function fill(data) {
  const inst = data && data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  const live = inst ? num(inst.context_percent) : null;
  if (live != null) return live;
  const points = data && data.context && Array.isArray(data.context.points) ? data.context.points : [];
  return points.length ? num(points[points.length - 1].percent) : null;
}
/** The whole session's tokens: the live instance, else the root of the agent tree. */
function total(data) {
  const inst = data && data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  if (inst && num(inst.tokens_total) != null) return inst.tokens_total;
  const nodes = data && data.agents && Array.isArray(data.agents.nodes) ? data.agents.nodes : [];
  const root = nodes.find((n) => n && !n.parent_id);
  return root ? num(root.tokens_total) : null;
}

/** The catalog path fill() / total() actually read (the fallback = the second path); null when nothing was read. */
function fillPath(data) {
  const inst = data && data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  return inst && num(inst.context_percent) != null ? 'live.instances[].context_percent' : 'context.points[].percent';
}
function totalPath(data) {
  const inst = data && data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  return inst && num(inst.tokens_total) != null ? 'live.instances[].tokens_total' : 'agents.nodes[].tokens_total';
}

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
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const v = fill(data);
  const t = total(data);
  const [whole, tenth] = v == null ? ['–', ''] : v.toFixed(1).split('.');
  const svg = h(doc, 'svg', { viewBox: '0 0 200 200', width: RING * z, height: RING * z, style: 'display:block;flex:none' },
    ring(doc, 100, 100, 88, 11, v),
    h(doc, 'text', {
      x: 100, y: 107, 'text-anchor': 'middle', 'font-weight': 600, 'data-role': 'percent', 'data-field': v == null ? null : fillPath(data),
      style: `fill:${v == null ? 'var(--aihud-faint)' : heat(v, HEAT_TEXT)};font-variant-numeric:tabular-nums`,
    },
    h(doc, 'tspan', { 'font-size': 52, text: whole }),
    v == null ? null : h(doc, 'tspan', { 'font-size': 20, text: `.${tenth}%` })),
    h(doc, 'text', {
      x: 100, y: 128, 'text-anchor': 'middle', 'font-size': 13, 'data-role': 'total', 'data-field': t == null ? null : totalPath(data),
      style: `fill:var(--aihud-${t == null ? 'faint' : 'dim'});font-variant-numeric:tabular-nums`, text: tok(t),
    }));
  const box = h(doc, 'div', {
    title: v == null && t == null ? why(data, ['live', 'context']) : null,
    style: `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;overflow:hidden;`
      + `display:flex;align-items:center;justify-content:center;padding:${4 * z}px ${10 * z}px;`
      + 'background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font)',
  }, svg);
  el.replaceChildren(box);
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

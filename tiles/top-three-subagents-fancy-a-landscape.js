// Fancy A · top-three-subagents · landscape (11×6). The three heaviest subagents as three rings one
// inside the other (the heaviest outside), the legend to the right: agent type and its share of the
// session's tokens. Fewer than three subagents leave empty rings and a dash.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'top-three-subagents-fancy-a-landscape',
  contentBlock: 'top-three-subagents',
  style: 'fancy-a',
  orientation: 'landscape',
  sizes: [{ cols: 11, rows: 6 }],
  contractVersion: '1.1',
};

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

/**
 * The three heaviest subagents by their own tokens (`tokens_self`), each with its share of the
 * session's tokens. `null` when the agent tree is not delivered.
 */
function heaviest(data) {
  const nodes = data && data.agents && Array.isArray(data.agents.nodes) ? data.agents.nodes : null;
  if (!nodes) return null;
  const inst = data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  const root = nodes.find((n) => n && !n.parent_id);
  const whole = (inst && num(inst.tokens_total)) ?? (root ? num(root.tokens_total) : null);
  const wholePath = inst && num(inst.tokens_total) != null ? 'live.instances[].tokens_total' : 'agents.nodes[].tokens_total';
  return nodes
    .filter((n) => n && n.parent_id && num(n.tokens_self) != null)
    .sort((a, b) => b.tokens_self - a.tokens_self)
    .slice(0, 3)
    .map((n) => ({
      type: n.agent_type ? String(n.agent_type) : '–',
      typeField: n.agent_type ? 'agents.nodes[].agent_type' : null,
      valueField: whole ? `agents.nodes[].tokens_self ${wholePath}` : 'agents.nodes[].tokens_self',
      tokens: n.tokens_self,
      share: whole ? (100 * n.tokens_self) / whole : null,
      last: n.last_activity || null,
    }));
}

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const top = heaviest(data);
  const slots = [0, 1, 2].map((i) => (top && top[i]) || null);
  const subAbs = !slots[0] && notRecorded(data, 'agents', 'subagents');
  // the heaviest outside, the next two inside it
  const rings = h(doc, 'svg', { viewBox: '0 0 200 200', width: 92 * z, height: 92 * z, style: 'display:block' },
    slots.map((s, i) => ring(doc, 100, 100, 84 - i * 22, 13, s ? s.share : null)));
  const legend = h(doc, 'div', {
    style: `display:grid;grid-template-columns:${10 * z}px minmax(0,1fr) auto;gap:${3 * z}px ${6 * z}px;align-items:center;`
      + `font-size:${11 * z}px;min-width:0`,
  }, slots.map((s, i) => [
    h(doc, 'i', { style: `display:block;width:${10 * z}px;height:${3 * z}px;border-radius:var(--aihud-radius-small);`
      + `background:${s && s.share != null ? heat(s.share) : 'var(--aihud-line-2)'}` }),
    h(doc, 'span', {
      'data-role': 'subagent',
      title: s ? `${s.type} · ${tok(s.tokens)} tokens${s.last ? ` · last activity ${s.last}` : ''}` : null,
      'data-field': s ? s.typeField : i === 0 && subAbs ? 'agents.subagents_started' : null,
      style: `white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${s ? 'var(--aihud-text)' : i === 0 && subAbs ? 'var(--aihud-absent)' : 'var(--aihud-faint)'}`,
      text: s ? s.type : '–',
    }),
    h(doc, 'span', {
      'data-field': s ? s.valueField : null,
      style: `text-align:right;font-variant-numeric:tabular-nums;color:var(--aihud-${s ? 'dim' : 'faint'})`,
      text: !s ? '–' : s.share != null ? `${s.share.toFixed(1)}%` : tok(s.tokens),
    }),
  ]));
  const box = h(doc, 'div', {
    title: top ? null : why(data, ['agents']),
    style: `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;overflow:hidden;`
      + `display:grid;grid-template-columns:${92 * z}px minmax(0,1fr);gap:${12 * z}px;align-items:center;`
      + `padding:${4 * z}px ${10 * z}px;background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font)`,
  }, rings, legend);
  el.replaceChildren(box);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

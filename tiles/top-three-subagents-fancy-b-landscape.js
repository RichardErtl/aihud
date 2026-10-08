// Fancy B · the three heaviest subagents · landscape: the three glowing holes, larger, side by side
// in their own 10 × 6 field. Each holds one subagent's own tokens; its glow is that subagent's share
// of the session's tokens; the agent type stands below.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'top-three-subagents-fancy-b-landscape',
  contentBlock: 'top-three-subagents',
  style: 'fancy-b',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 6 }],
  contractVersion: '1.1',
};

const DIAMETER = 58;   // px at unit 20
const COLUMN = 58;

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const { top, total } = heaviest(data);
  const root = frame(doc, size);
  root.append(motion(doc), h(doc, 'div', { style: 'display:flex;justify-content:space-between' },
    [0, 1, 2].map((i) => mini(doc, z, top && top[i], total, i === 0 && !(top && top[0]) && notRecorded(data, 'agents', 'subagents')))));
  el.replaceChildren(root);
}

/** Subagents (nodes with a parent) by their own tokens, heaviest first; total = the root's tokens_total. */
function heaviest(data) {
  const agents = part(data, 'agents');
  if (!agents || !Array.isArray(agents.nodes)) return { top: null, total: null };
  const nodes = agents.nodes.filter((n) => n && typeof n === 'object');
  const root = nodes.find((n) => n.parent_id == null);
  const top = nodes.filter((n) => n.parent_id != null && num(n.tokens_self) != null)
    .sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3);
  return { top, total: root ? num(root.tokens_total) : null };
}

function mini(doc, z, node, total, absent = false) {
  const own = node ? node.tokens_self : null;
  const v = own != null && total ? own / total * 100 : null;
  const [n, unit] = compact(own);
  const mono = 'font-family:var(--aihud-font-mono);font-variant-numeric:tabular-nums';
  const text = own == null
    ? h(doc, 'text', { x: 24, y: 29, 'font-size': 12, 'text-anchor': 'middle', 'data-field': absent ? 'agents.subagents_started' : null, style: `fill:${absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)'};${mono}` }, '–')
    : h(doc, 'text', { x: 24, y: 28, 'data-field': 'agents.nodes[].tokens_self', 'font-weight': 700, 'text-anchor': 'middle', style: `fill:${v == null ? 'var(--aihud-text)' : heat(v, HEAT_TEXT)};${mono}` },
      h(doc, 'tspan', { 'font-size': 11 }, n), h(doc, 'tspan', { 'font-size': 7 }, unit));
  return h(doc, 'div', { style: `text-align:center;width:${COLUMN * z}px;min-width:0` },
    h(doc, 'svg', { viewBox: '0 0 48 48', width: DIAMETER * z, height: DIAMETER * z, style: 'display:block;margin:0 auto' },
      hole(doc, 24, 24, 21, v, false), text),
    h(doc, 'div', { 'data-field': node && node.agent_type ? 'agents.nodes[].agent_type' : null, style: `font-size:${10 * z}px;color:var(${node ? '--aihud-dim' : '--aihud-faint'});margin-top:${2 * z}px;`
      + 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, node ? String(node.agent_type || '–') : '\u00a0'));
}

// ── the glowing hole (its colours taken from the design variables) ──
let uid = 0;
const nextId = () => `${meta.name}-${uid++}`;
const clamp = (v) => Math.max(0, Math.min(100, v));
// heat: CONTRACT.md §Heat — the mockup's heat colour function in CSS, the same in every style; the glow takes the fill stops
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
const pt = (cx, cy, r, a) => { const rad = a * Math.PI / 180; return [+(cx + r * Math.sin(rad)).toFixed(2), +(cy - r * Math.cos(rad)).toFixed(2)]; };
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
const stop = (doc, offset, color, opacity) => h(doc, 'stop', { offset, style: `stop-color:${color};stop-opacity:${opacity}` });
const MOTION = '.fb-spark{animation:fb-rise 4s linear infinite;transform-box:fill-box}'
  + '@keyframes fb-rise{0%{transform:translateY(0);opacity:0}15%{opacity:.9}100%{transform:translateY(-46px);opacity:0}}'
  + '.fb-spin{animation:fb-spin 9s linear infinite;transform-box:view-box}@keyframes fb-spin{to{transform:rotate(360deg)}}'
  + '@media (prefers-reduced-motion:reduce){.fb-spark{animation:none;opacity:.5}.fb-spin{animation:none}}';
const motion = (doc) => h(doc, 'style', null, MOTION);

/** A hole of radius r at (cx, cy); v = fill 0–100 or null (empty: the bare hole, no glow). */
function hole(doc, cx, cy, r, v, sparks) {
  const id = nextId();
  const c = v == null ? null : heat(v);
  const kids = [h(doc, 'defs', null,
    c && h(doc, 'radialGradient', { id: `${id}g`, cx: '50%', cy: `${(118 - clamp(v) * 0.55).toFixed(1)}%`, r: '88%' },
      stop(doc, 0, c, 'var(--aihud-glow-core)'), stop(doc, 0.35, c, 'var(--aihud-glow-mid)'), stop(doc, 0.7, c, 0)),
    h(doc, 'linearGradient', { id: `${id}f`, x1: 0, y1: 0, x2: 0, y2: 1 },
      stop(doc, 0, 'var(--aihud-bg)', 0.9), stop(doc, 0.22, 'var(--aihud-bg)', 0),
      stop(doc, 0.88, 'var(--aihud-panel)', 0), stop(doc, 1, 'var(--aihud-panel)', 0.9)),
    h(doc, 'clipPath', { id: `${id}c` }, h(doc, 'circle', { cx, cy, r }))),
  h(doc, 'circle', { cx, cy, r, style: 'fill:var(--aihud-bg)' })];
  if (c) {
    kids.push(h(doc, 'circle', { cx, cy, r, fill: `url(#${id}g)` }));
    if (sparks) {
      kids.push(h(doc, 'g', { 'clip-path': `url(#${id}c)` }, Array.from({ length: 11 }, (_, i) => h(doc, 'circle', {
        class: 'fb-spark', cx: (cx - r * 0.6 + (i * 37 % 100) / 100 * r * 1.2).toFixed(1),
        cy: (cy + r * 0.55 - (i * 53 % 40) / 100 * r).toFixed(1), r: i % 3 ? 1 : 1.7,
        style: `fill:${c};animation-delay:${-(i * 0.73 % 4).toFixed(2)}s`,
      }))));
    }
  }
  kids.push(h(doc, 'circle', { cx, cy, r, fill: `url(#${id}f)` }),
    h(doc, 'circle', { cx, cy, r, style: 'fill:none;stroke:var(--aihud-line);stroke-width:1' }));
  if (c) {
    // the pulse: the filled share of the rim, brighter towards its head, turning slowly
    const span = Math.min(359.9, Math.max(4, 3.6 * clamp(v))), n = Math.max(6, Math.round(span / 4));
    const sw = Math.max(1, r * 0.017);
    const segs = Array.from({ length: n }, (_, i) => {
      const a0 = i * span / n, a1 = Math.min(span, a0 + span / n + 0.5);
      return h(doc, 'path', { d: arc(cx, cy, r, a0, a1), style: `fill:none;stroke:${c};stroke-width:${sw}`, opacity: (0.3 + 0.7 * ((i + 1) / n) ** 1.4).toFixed(2) });
    });
    kids.push(h(doc, 'g', { class: 'fb-spin', style: `transform-origin:${cx}px ${cy}px` },
      h(doc, 'path', { d: arc(cx, cy, r, span * 0.5, span),
        style: `fill:none;stroke:${c};stroke-width:${r * 0.15};filter:blur(${Math.max(1.5, r * 0.05)}px);opacity:var(--aihud-glow-halo)` }),
      segs));
  }
  return h(doc, 'g', null, kids);
}

// ── drawing core (the same in every fancy-b tile: tiles are standalone, nothing is shared) ──
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'defs', 'path', 'circle', 'text', 'tspan', 'radialGradient', 'linearGradient', 'stop', 'clipPath']);

/** One element; text children become text nodes (names from the data never pass through innerHTML). */
function h(doc, tag, attrs, ...kids) {
  const n = SVG_TAGS.has(tag) ? doc.createElementNS(SVG_NS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null && v !== false) n.setAttribute(k, String(v));
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    n.append(typeof k === 'object' ? k : doc.createTextNode(String(k)));
  }
  return n;
}

/** The tile box: exactly cols × unit by rows × unit px; the sketch is drawn at unit 20, z scales it. */
function frame(doc, size, css = '') {
  const z = size.unit / 20;
  return h(doc, 'div', {
    'data-tile': meta.name,
    style: [
      `width:${size.cols * size.unit}px`, `height:${size.rows * size.unit}px`, 'box-sizing:border-box', 'overflow:hidden',
      'display:flex', 'flex-direction:column', 'justify-content:safe center', `padding:${4 * z}px ${10 * z}px`,
      'background:var(--aihud-panel)', 'color:var(--aihud-text)', 'font-family:var(--aihud-font)',
      `font-size:${11 * z}px`, 'line-height:1.35', css,
    ].filter(Boolean).join(';'),
  });
}

// A type named in not_delivered counts as missing even when an object is there.
const gone = (d, t) => Boolean(d) && Array.isArray(d.not_delivered) && d.not_delivered.includes(t);
const part = (d, t) => (d && !gone(d, t) && d[t] && typeof d[t] === 'object' ? d[t] : null);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const instance = (d) => { const l = part(d, 'live'); return (l && Array.isArray(l.instances) && l.instances[0]) || null; };

/** Tokens as [number, unit]: 5.8 M · 534 k · 812; missing → ['–', '']. */
function compact(n) {
  if (n == null) return ['–', ''];
  if (Math.abs(n) >= 999500) return [(n / 1e6).toFixed(1), 'M'];
  if (Math.abs(n) >= 1000) return [String(Math.round(n / 1000)), 'k'];
  return [String(Math.round(n)), ''];
}
const tokens = (n) => compact(n).join('');
const label = (doc, z, text, css = '') => h(doc, 'div', {
  style: `font-size:${9.5 * z}px;letter-spacing:.12em;text-transform:uppercase;color:var(--aihud-faint);${css}`,
}, text);

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

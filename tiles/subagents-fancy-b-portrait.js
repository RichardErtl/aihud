// Fancy B · subagents · portrait: the subagents' tokens as a half ring split by role, the number
// of subagents in its centre, their tokens below it, a tight legend under the ring (8 × 7).
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'subagents-fancy-b-portrait',
  contentBlock: 'subagents',
  style: 'fancy-b',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 7 }],
  contractVersion: '1.1',
};

const ROLES = [1, 0.66, 0.4].map((opacity) => ({ color: 'var(--aihud-role)', opacity }));
const ROLE_FIELD = 'live.instances[].tokens_by_agent_type';

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const s = subagentData(data);
  const root = frame(doc, size);
  root.append(
    label(doc, z, 'subagents', 'text-align:center'),
    halfRing(doc, s.list, ROLES, s.count == null ? '–' : String(s.count), s.list ? `${tokens(s.sum)} tokens` : s.tokAbsent ? '–' : '', (size.cols * 20 - 20) * z, { top: 'agents.subagents_started', bottom: ROLE_FIELD, topAbsent: s.count == null && notRecorded(data, 'agents', 'subagents'), bottomAbsent: !s.list && s.tokAbsent }),
    legend(doc, z, s.list, ROLES, true));
  el.replaceChildren(root);
}

/** Roles from tokens_by_agent_type without the main agent; count read from agents.subagents_started. */
function subagentData(data) {
  const inst = instance(data);
  const by = inst && inst.tokens_by_agent_type && typeof inst.tokens_by_agent_type === 'object' ? inst.tokens_by_agent_type : null;
  const roles = by ? Object.entries(by).filter(([k]) => k !== 'main') : null;
  const list = roles ? topThree(roles) : null;
  const sum = roles ? roles.reduce((s, [, v]) => s + (num(v) || 0), 0) : null;
  const agents = part(data, 'agents');
  const count = agents && Number.isInteger(agents.subagents_started) && agents.subagents_started >= 0 ? agents.subagents_started : null;
  return { list, sum, count, tokAbsent: !list && notRecorded(data, 'live', 'tokens') };
}

// ── the half ring with its legend ──
const pt = (cx, cy, r, a) => { const rad = a * Math.PI / 180; return [+(cx + r * Math.sin(rad)).toFixed(2), +(cy - r * Math.cos(rad)).toFixed(2)]; };
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};

/** Largest first; more than three → the two largest plus "other". Entries [name, tokens]. */
function topThree(entries) {
  const list = entries.filter(([, v]) => num(v) != null && v > 0).sort((a, b) => b[1] - a[1]);
  if (list.length <= 3) return list;
  return [list[0], list[1], ['other', list.slice(2).reduce((s, [, v]) => s + v, 0)]];
}

/** Half ring over `list` (null = no data: the bare track); `top` and `bottom` are the centre lines. */
function halfRing(doc, list, colors, top, bottom, width, marks = {}) {
  const sum = list ? list.reduce((s, [, v]) => s + v, 0) : 0;
  const arcs = marks.topAbsent ? [] : [h(doc, 'path', { d: arc(100, 96, 78, -90, 90), style: 'fill:none;stroke:var(--aihud-line-2);stroke-width:12' })];
  let a = -90;
  if (sum > 0) {
    list.forEach(([, v], i) => {
      const span = 180 * v / sum, a1 = a + span - (i < list.length - 1 ? 1.5 : 0);
      if (a1 > a) arcs.push(h(doc, 'path', { d: arc(100, 96, 78, a, a1), style: `fill:none;stroke:${colors[i].color};stroke-width:12`, opacity: colors[i].opacity }));
      a += span;
    });
  }
  return h(doc, 'svg', { viewBox: '0 0 200 104', width, height: +(width * 104 / 200).toFixed(2), style: 'display:block;margin:0 auto;flex:none' },
    arcs,
    h(doc, 'text', { x: 100, y: 80, 'data-field': top === '–' && !marks.topAbsent ? null : marks.top, 'font-size': 22, 'font-weight': 300, 'text-anchor': 'middle', style: `fill:var(${marks.topAbsent ? '--aihud-absent' : top === '–' ? '--aihud-faint' : '--aihud-text'});font-variant-numeric:tabular-nums` }, top),
    h(doc, 'text', { x: 100, y: 97, 'data-field': bottom ? marks.bottom : null, 'font-size': 10.5, 'text-anchor': 'middle', style: `fill:var(${marks.bottomAbsent ? '--aihud-absent' : '--aihud-dim'})` }, bottom));
}

/** Legend rows: colour bar · name · tokens; `tight` = the portrait 8 × 7 spacing (design decision 30.09.). */
function legend(doc, z, list, colors, tight) {
  if (!list || !list.length) return h(doc, 'div');   // nothing to name: the ring's own dash says it
  return h(doc, 'div', {
    style: `display:grid;grid-template-columns:${10 * z}px minmax(0,1fr) auto;align-items:center;font-size:${11 * z}px;`
      + (tight ? `margin-top:${2 * z}px;gap:${1 * z}px ${6 * z}px;line-height:1.2` : `margin-top:${6 * z}px;gap:${3 * z}px ${6 * z}px`),
  }, list.map(([name, v], i) => [
    h(doc, 'i', { style: `display:block;width:${10 * z}px;height:${3 * z}px;border-radius:var(--aihud-radius-small);background:${colors[i].color};opacity:${colors[i].opacity}` }),
    h(doc, 'span', { 'data-field': ROLE_FIELD, style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, name),
    h(doc, 'span', { 'data-field': ROLE_FIELD, style: 'color:var(--aihud-dim);text-align:right;font-variant-numeric:tabular-nums' }, tokens(v)),
  ]));
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

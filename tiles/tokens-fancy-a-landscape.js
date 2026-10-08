// Fancy A · tokens · landscape (14×6). The half ring split by model on the left (the session's total
// tokens in its middle, main agent / subagents below), the legend to its right. More than three models:
// the two largest plus one part for the rest.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tokens-fancy-a-landscape',
  contentBlock: 'tokens',
  style: 'fancy-a',
  orientation: 'landscape',
  sizes: [{ cols: 14, rows: 6 }],
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

// ── the half ring ───────────────────────────────────────────────────────────
const pt = (cx, cy, r, a) => {
  const rad = (a * Math.PI) / 180;
  return [+(cx + r * Math.sin(rad)).toFixed(2), +(cy - r * Math.cos(rad)).toFixed(2)];
};
const arc = (cx, cy, r, a0, a1) => {
  const [x0, y0] = pt(cx, cy, r, a0);
  const [x1, y1] = pt(cx, cy, r, a1);
  return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
};
/** −90° … +90° around (100, 96), split by the parts' values with 1.5° gaps; an empty track without parts. */
function half(doc, parts, top, bottom, width, topField, bottomField) {
  const sum = parts.reduce((s, p) => s + p.value, 0);
  const pieces = [];
  if (!sum) pieces.push(h(doc, 'path', { d: arc(100, 96, 78, -90, 90), fill: 'none', style: 'stroke:var(--aihud-line-2);stroke-width:12' }));
  let a = -90;
  parts.forEach((p, i) => {
    const s = (180 * p.value) / (sum || 1);
    const a1 = a + s - (i < parts.length - 1 ? 1.5 : 0);
    if (a1 > a) pieces.push(h(doc, 'path', { d: arc(100, 96, 78, a, a1), fill: 'none', style: `stroke:${p.color};stroke-width:12` }));
    a += s;
  });
  return h(doc, 'svg', { viewBox: '0 0 200 104', width, height: (width * 104) / 200, style: 'display:block;flex:none;margin:0 auto' },
    pieces,
    h(doc, 'text', {
      x: 100, y: 80, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 300, 'data-role': 'centre', 'data-field': topField,
      style: `fill:var(--aihud-${top === '–' ? 'faint' : 'text'});font-variant-numeric:tabular-nums`, text: top,
    }),
    h(doc, 'text', {
      x: 100, y: 97, 'text-anchor': 'middle', 'font-size': 10.5, 'data-field': bottomField,
      style: 'fill:var(--aihud-dim);font-variant-numeric:tabular-nums', text: bottom,
    }));
}
function legend(doc, parts, z, css) {
  return h(doc, 'div', {
    style: `display:grid;grid-template-columns:${10 * z}px minmax(0,1fr) auto;align-items:center;font-size:${11 * z}px;${css}`,
  }, parts.map((p) => [
    h(doc, 'i', { style: `display:block;width:${10 * z}px;height:${3 * z}px;border-radius:var(--aihud-radius-small);background:${p.color}` }),
    h(doc, 'span', { 'data-role': 'part', 'data-field': 'live.instances[].tokens_by_model', style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis', text: p.name }),
    h(doc, 'span', { 'data-field': 'live.instances[].tokens_by_model', style: 'text-align:right;color:var(--aihud-dim);font-variant-numeric:tabular-nums', text: tok(p.value) }),
  ]));
}

const COLOURS = ['var(--aihud-series-1)', 'var(--aihud-series-2)', 'var(--aihud-series-3)'];
/** Tokens by model (largest first, at most three parts) and the totals: all, main agent, subagents. */
function tokens(data) {
  const inst = data && data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  if (!inst) return null;
  const byModel = inst.tokens_by_model && typeof inst.tokens_by_model === 'object' ? inst.tokens_by_model : {};
  let rows = Object.entries(byModel).filter(([, v]) => num(v) != null && v > 0)
    .map(([k, v]) => ({ name: k.replace(/^claude-/, ''), value: v })).sort((a, b) => b.value - a.value);
  if (rows.length > 3) {
    const rest = rows.slice(2);
    rows = [...rows.slice(0, 2), { name: `${rest.length} more`, value: rest.reduce((s, r) => s + r.value, 0) }];
  }
  const all = num(inst.tokens_total);
  const main = num(inst.tokens_main);
  return {
    parts: rows.map((r, i) => ({ ...r, color: COLOURS[i] })),
    all,
    main,
    sub: all != null && main != null ? all - main : null,
  };
}

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const t = tokens(data);
  const ringWidth = size.cols * size.unit - 20 * z - 12 * z - 90 * z;
  const box = h(doc, 'div', {
    title: t ? null : why(data, ['live']),
    style: `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;overflow:hidden;`
      + `display:grid;grid-template-columns:minmax(0,1fr) ${90 * z}px;gap:${12 * z}px;align-items:center;`
      + `padding:${4 * z}px ${10 * z}px;background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font)`,
  },
  half(doc, t ? t.parts : [], tok(t && t.all), t ? `${tok(t.main)} / ${tok(t.sub)}` : '', ringWidth, t && t.all != null ? 'live.instances[].tokens_total' : null, t && t.main != null ? (t.sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : 'live.instances[].tokens_main') : null),
  h(doc, 'div', { style: 'min-width:0' },
    h(doc, 'div', { style: `font-size:${9.5 * z}px;letter-spacing:.12em;text-transform:uppercase;color:var(--aihud-faint)`, text: 'tokens' }),
    legend(doc, t ? t.parts : [], z, `margin-top:${6 * z}px;gap:${3 * z}px ${6 * z}px`)));
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

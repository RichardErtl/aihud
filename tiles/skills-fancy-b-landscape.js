// Fancy B · skills · landscape: the same list in a taller 8 × 6 field, five rows — name, how often,
// their tokens, most used first.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'skills-fancy-b-landscape',
  contentBlock: 'skills',
  style: 'fancy-b',
  orientation: 'landscape',
  sizes: [{ cols: 8, rows: 6 }],
  contractVersion: '1.1',
};

const ROWS = 5;

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const root = frame(doc, size);
  root.append(label(doc, z, 'skills'), skillRows(doc, z, skillList(data).slice(0, ROWS), !!(part(data, 'turn') && Array.isArray(part(data, 'turn').turns))));
  if (notRecorded(data, 'turn', 'skills') && !skillList(data).length) absentOnly(root, 'skills', 'turn.turns[].skills', z);
  el.replaceChildren(root);
}

/** Skills over all turns by name: count and tokens in + out; most used first, then most tokens. */
function skillList(data) {
  const turn = part(data, 'turn');
  const by = new Map();
  for (const t of turn && Array.isArray(turn.turns) ? turn.turns : []) {
    for (const s of t && Array.isArray(t.skills) ? t.skills : []) {
      if (!s || typeof s.name !== 'string') continue;
      const e = by.get(s.name) || { name: s.name, count: 0, tokens: 0, known: true };
      e.count++;
      if (num(s.tokens_in) == null || num(s.tokens_out) == null) e.known = false;
      else e.tokens += s.tokens_in + s.tokens_out;
      by.set(s.name, e);
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || b.tokens - a.tokens);
}

function skillRows(doc, z, rows, delivered) {
  if (!rows.length) return h(doc, 'div', { style: `margin-top:${4 * z}px;color:var(--aihud-faint)` }, delivered ? 'no skill calls this session' : '–');
  const dim = 'color:var(--aihud-dim);text-align:right;font-variant-numeric:tabular-nums';
  return h(doc, 'div', {
    style: `margin-top:${4 * z}px;font-size:${11.5 * z}px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:${2 * z}px ${8 * z}px`,
  }, rows.map((r) => [
    h(doc, 'span', { 'data-field': 'turn.turns[].skills[].name', style: 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, r.name),
    h(doc, 'span', { 'data-field': 'turn.turns[].skills', style: dim }, `×${r.count}`),
    h(doc, 'span', { 'data-field': r.known ? 'turn.turns[].skills[].tokens_in turn.turns[].skills[].tokens_out' : null, style: dim }, r.known ? tokens(r.tokens) : '–'),
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

// aihud:absent-only v1
const absentOnly = (node, caption, field, z) => {
  const doc = node.ownerDocument, part = (css, t) => { const e = doc.createElement('div'); e.style.cssText = css + ';line-height:1.25'; e.textContent = t; return e; };
  const dash = part('font-size:' + 22 * z + 'px;font-weight:650;color:var(--aihud-absent)', '–');
  dash.setAttribute('data-field', field);
  node.style.cssText += ';box-sizing:border-box;display:flex;flex-direction:column;align-content:center;justify-content:center;align-items:center;text-align:center;gap:' + 2 * z + 'px;padding:' + 4 * z + 'px';
  node.replaceChildren(part('font-size:' + 9 * z + 'px;letter-spacing:.06em;text-transform:uppercase;color:var(--aihud-faint);font-weight:400', caption), dash);
};

// Fancy B · time · landscape: one row — turn number, the turn's runtime, and the session's runtime
// on the right.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'time-fancy-b-landscape',
  contentBlock: 'time',
  style: 'fancy-b',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 4 }],
  contractVersion: '1.1',
};

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const t = timeData(data);
  const root = frame(doc, size);
  root.append(h(doc, 'div', { style: `display:grid;grid-template-columns:auto auto 1fr;gap:${14 * z}px;align-items:end` },
    h(doc, 'div', null, label(doc, z, 'turn'), big(doc, z, t.turn, 'turn.turns[].number')),
    medium(doc, z, t.turnRun, 'turn.turns[].duration_s'),
    h(doc, 'div', { style: 'text-align:right' }, label(doc, z, 'session'), medium(doc, z, t.sessionRun, 'session.started_at live.instances[].last_activity'))));
  el.replaceChildren(root);
}

/** Last turn's number and runtime; session runtime = last activity − start (value #9). */
function timeData(data) {
  const turn = part(data, 'turn');
  const last = turn && Array.isArray(turn.turns) && turn.turns.length ? turn.turns[turn.turns.length - 1] : null;
  const session = part(data, 'session');
  const inst = instance(data);
  const start = session ? Date.parse(session.started_at) : NaN;
  const end = inst ? Date.parse(inst.last_activity) : NaN;
  return {
    turn: last && num(last.number) != null ? String(last.number) : '–',
    turnRun: clock(last ? num(last.duration_s) : null),
    sessionRun: clock(Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null),
  };
}

/** Seconds as m:ss, from an hour on as h:mm:ss; missing → '–'. */
function clock(seconds) {
  if (seconds == null) return '–';
  const s = Math.round(seconds), hours = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const two = (n) => String(n).padStart(2, '0');
  return hours ? `${hours}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

const numeral = (doc, z, text, px, weight, field) => h(doc, 'div', {
  'data-field': text === '–' ? null : field,
  style: `font-size:${px * z}px;font-weight:${weight};line-height:${px > 20 ? 1.15 : 1.35};font-variant-numeric:tabular-nums;`
    + `color:var(${text === '–' ? '--aihud-faint' : '--aihud-text'})`,
}, text);
const big = (doc, z, text, field) => numeral(doc, z, text, 30, 250, field);
const medium = (doc, z, text, field) => numeral(doc, z, text, 18, 300, field);

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

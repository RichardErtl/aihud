// Fancy A · time · portrait (8×5). The current turn's number large, its runtime to the right, the
// session's runtime below. Runtimes under an hour read m:ss, longer ones 2h 05m.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'time-fancy-a-portrait',
  contentBlock: 'time',
  style: 'fancy-a',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 5 }],
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

/** Seconds → `m:ss` under an hour, `2h 05m` from an hour on; `–` when missing. */
function span(s) {
  if (s == null || s < 0) return '–';
  const t = Math.floor(s);
  if (t < 3600) return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  return `${Math.floor(t / 3600)}h ${String(Math.floor((t % 3600) / 60)).padStart(2, '0')}m`;
}
/** Turn number, turn runtime and session runtime (start of the session → last activity). */
function times(data) {
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  const last = turns.length ? turns[turns.length - 1] : null;
  const inst = data && data.live && Array.isArray(data.live.instances) ? data.live.instances[0] : null;
  const start = data && data.session ? Date.parse(data.session.started_at) : NaN;
  const end = inst ? Date.parse(inst.last_activity) : NaN;
  return {
    turn: last ? num(last.number) : null,
    turnSeconds: last ? num(last.duration_s) : null,
    sessionSeconds: Number.isFinite(start) && Number.isFinite(end) ? (end - start) / 1000 : null,
  };
}
const LABEL = (z) => `font-size:${9.5 * z}px;letter-spacing:.12em;text-transform:uppercase;color:var(--aihud-faint)`;
const value = (z, px, weight, missing) => `font-size:${px * z}px;font-weight:${weight};line-height:1;`
  + `font-variant-numeric:tabular-nums;color:var(--aihud-${missing ? 'faint' : 'text'})`;

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const t = times(data);
  const missing = why(data, ['turn', 'session', 'live']);
  const box = h(doc, 'div', {
    title: t.turn == null || t.sessionSeconds == null ? missing : null,
    style: `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;overflow:hidden;`
      + `display:flex;flex-direction:column;justify-content:center;padding:${4 * z}px ${10 * z}px;`
      + 'background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font)',
  },
  h(doc, 'div', { style: 'display:grid;grid-template-columns:1fr 1fr;align-items:end' },
    h(doc, 'div', {},
      h(doc, 'div', { style: LABEL(z), text: 'turn' }),
      h(doc, 'div', { 'data-role': 'turn', 'data-field': t.turn == null ? null : 'turn.turns[].number', style: value(z, 30, 250, t.turn == null), text: t.turn == null ? '–' : t.turn })),
    h(doc, 'div', { 'data-role': 'turn-runtime', 'data-field': t.turnSeconds == null || t.turnSeconds < 0 ? null : 'turn.turns[].duration_s', style: `text-align:right;${value(z, 18, 300, t.turnSeconds == null)}`, text: span(t.turnSeconds) })),
  h(doc, 'div', { style: `margin-top:${8 * z}px;display:flex;justify-content:space-between;align-items:baseline` },
    h(doc, 'span', { style: LABEL(z), text: 'session' }),
    h(doc, 'span', { 'data-role': 'session-runtime', 'data-field': t.sessionSeconds == null || t.sessionSeconds < 0 ? null : 'session.started_at live.instances[].last_activity', style: value(z, 18, 300, t.sessionSeconds == null), text: span(t.sessionSeconds) })));
  el.replaceChildren(box);
}

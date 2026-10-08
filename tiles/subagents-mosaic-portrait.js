// Mosaic (Tessera), portrait: subagents reduced to the count and one tessera each, heaviest first; hovering a tessera shows the subagent's role name.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by unit / 20.

const NS = 'http://www.w3.org/2000/svg';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const STOPS = [0, 30, 50, 75, 100];
/** CONTRACT.md heat function: v percent -> colour; text=true uses the --aihud-heat-text-* stops. */
const heat = (v, text) => {
  const pre = text ? '--aihud-heat-text-' : '--aihud-heat-';
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < STOPS.length - 1 && x > STOPS[i]) i++;
  const p = ((STOPS[i] - x) / (STOPS[i] - STOPS[i - 1])) * 100;
  return 'color-mix(in srgb, var(' + pre + STOPS[i - 1] + ') ' + p.toFixed(1) + '%, var(' + pre + STOPS[i] + '))';
};
const glow = (c, k) => 'filter:drop-shadow(0 0 calc(var(--aihud-glow) * ' + (k || 1) + ') ' + c + ')';
const node = (doc, tag, attrs, style, text) => {
  const n = doc.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, String(attrs[k]));
  if (style) n.setAttribute('style', style);
  if (text != null) n.textContent = text;
  return n;
};
/** The tile box: one svg of exactly cols*unit x rows*unit px, drawn at 20 px per unit. */
const stage = (el, size) => {
  const doc = el.ownerDocument;
  const w = size.cols * 20, h = size.rows * 20;
  const svg = node(doc, 'svg', { viewBox: '0 0 ' + w + ' ' + h, width: size.cols * size.unit, height: size.rows * size.unit },
    'display:block;background:var(--aihud-panel);border-radius:var(--aihud-radius);font-family:var(--aihud-font);font-variant-numeric:tabular-nums');
  el.replaceChildren(svg);
  return { doc, svg, w, h, add: (n) => (svg.append(n), n) };
};
/** text at (x, y baseline); o = {size, fill, anchor, weight, ls, mono} */
const label = (S, x, y, str, o) => {
  o = o || {};
  return S.add(node(S.doc, 'text', { x, y, 'text-anchor': o.anchor || 'start' },
    'font-size:' + (o.size || 10) + 'px;fill:' + (o.fill || 'var(--aihud-dim)') + ';font-weight:' + (o.weight || 400)
    + (o.ls ? ';letter-spacing:' + o.ls + 'px' : '') + (o.mono ? ';font-family:var(--aihud-font-mono)' : ''), str));
};
/** largest square cell (gap = ratio * cell) so that n cells fit column-major into w x h */
const fit = (n, w, h, max, ratio) => {
  for (let s = max; s >= 2; s -= 0.25) {
    const g = s * ratio, step = s + g;
    const rows = Math.floor((h + g) / step), cols = Math.floor((w + g) / step);
    if (rows >= 1 && rows * cols >= n) return { s, g, step, rows, cols };
  }
  return null;
};
const cell = (S, x, y, s, style) => S.add(node(S.doc, 'rect', { x: x.toFixed(2), y: y.toFixed(2), width: s.toFixed(2), height: s.toFixed(2) }, 'rx:var(--aihud-radius-small);' + style));
const DASH = '–';

// ===== reduce subagents: one tessera per subagent (tokenless: quiet outline; a collapsed workflow node: one tessera + label x n) =====
const subagents = (d) => {
  if (!d.agents || !Array.isArray(d.agents.nodes)) return null;
  const out = [];
  for (const n of d.agents.nodes) {
    if (!n || n.parent_id == null) continue;
    out.push({ v: isNum(n.tokens_self) && n.tokens_self > 0 ? n.tokens_self : 0, w: isNum(n.agent_count) ? n.agent_count : 1, role: typeof n.agent_type === 'string' && n.agent_type ? n.agent_type : DASH, f: [typeof n.agent_type === 'string' && n.agent_type ? 'agents.nodes[].agent_type' : '', isNum(n.tokens_self) ? 'agents.nodes[].tokens_self' : ''].filter(Boolean).join(' ') });
  }
  const sum = out.reduce((a, b) => a + (b.v || 0), 0);
  out.sort((a, b) => (b.v == null ? -1 : b.v) - (a.v == null ? -1 : a.v));
  return { list: out, sum };
};
/** value mark: data-field (agent type + own tokens) plus the native title with the role name (the value itself) */
const named = (rect, item, big) => { if (!big && item.f) rect.setAttribute('data-field', item.f); rect.append(node(rect.ownerDocument, 'title', {}, '', item.role)); return rect; };
const tesserae = (S, A, x0, y0, w, h) => {
  if (!A || !A.list.length) {
    const f = fit(8, w, h, 14, 0.24);
    for (let k = 0; k < 8; k++) cell(S, x0 + (k % f.cols) * f.step, y0 + Math.floor(k / f.cols) * f.step, f.s, 'fill:var(--aihud-line-2)');
    return;
  }
  // a collapsed workflow node takes three slots (tessera + the room for its x n label); slack of four slots each: two for the label, up to two lost to a wrap
  const wfs = A.list.filter((i) => i.w !== 1).length;
  const f = fit(A.list.length + 4 * wfs, w, h, 16, 0.24);
  if (!f) return;
  const big = A.list.length > 40;   // more than ~40 tesserae: ONE mark on a container instead of one per tessera
  const G = big ? S.add(node(S.doc, 'g', { 'data-field': 'agents.nodes[].agent_type agents.nodes[].tokens_self' })) : null;
  const T = big ? { doc: S.doc, add: (n) => (G.append(n), n) } : S;
  // row-major reading order: heaviest top-left, tokenless last
  let slot = 0;
  A.list.forEach((item, k) => {
    const wf = item.w !== 1;
    if (wf && f.cols >= 3 && slot % f.cols > f.cols - 3) slot += f.cols - (slot % f.cols);
    const n = item.v;
    const x = x0 + (slot % f.cols) * f.step, y = y0 + Math.floor(slot / f.cols) * f.step;
    if (!(A.sum > 0) || !(n > 0)) named(cell(T, x + 0.5, y + 0.5, f.s - 1, 'fill:none;stroke:var(--aihud-faint);stroke-width:1;stroke-dasharray:2 1.5'), item, big);
    else {
      const c = heat((n / A.sum) * 100);
      named(cell(T, x, y, f.s, 'fill:' + c + (k === 0 ? ';' + glow(c, 5 / 3) : '')), item, big);
    }
    if (wf) label(T, x + f.s + 1.5, y + f.s / 2 + 3, '×' + item.w, { size: Math.min(9.5, Math.max(7, f.s)), fill: 'var(--aihud-dim)' }).setAttribute('data-field', 'agents.nodes[].agent_count');
    slot += wf ? 3 : 1;
  });
};
/** The number: read from the reader (agents.subagents_started), never counted here. */
const startedOf = (d) => (d.agents && Number.isInteger(d.agents.subagents_started) && d.agents.subagents_started >= 0 ? d.agents.subagents_started : null);

export const meta = { name: 'subagents-mosaic-portrait', contentBlock: 'subagents', style: 'mosaic', orientation: 'portrait', sizes: [{ cols: 8, rows: 3 }], contractVersion: '1.1' };

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
    const d = data || {}, S = stage(el, size), A = subagents(d), n = startedOf(d);
    const absent = n == null && notRecorded(d, 'agents', 'subagents');
    const cnt = label(S, 8, 35, n == null ? DASH : String(n), { size: 30, weight: 650, fill: n == null ? (absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)') : 'var(--aihud-text)' });
    if (n != null || absent) cnt.setAttribute('data-field', 'agents.subagents_started');
    label(S, 8, 51, 'subagents', { size: 9.5 });
    if (!absent) tesserae(S, A, 66, 8, 86, 44);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

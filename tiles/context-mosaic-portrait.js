// Mosaic (Tessera), portrait: context as a field of tesserae, one per 5 percent; what the last turn added is outlined.
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
/** a big value: whole part large, tail (".8%") small, both in one text */
const figure = (S, x, y, whole, tail, big, small, fill, anchor) => {
  const t = S.add(node(S.doc, 'text', { x, y, 'text-anchor': anchor || 'start' }, 'fill:' + fill + ';font-weight:650'));
  t.append(node(S.doc, 'tspan', {}, 'font-size:' + big + 'px', whole));
  if (tail) t.append(node(S.doc, 'tspan', {}, 'font-size:' + small + 'px', tail));
  return t;
};
const cell = (S, x, y, s, style) => S.add(node(S.doc, 'rect', { x: x.toFixed(2), y: y.toFixed(2), width: s.toFixed(2), height: s.toFixed(2) }, 'rx:var(--aihud-radius-small);' + style));
const tok = (n) => (n >= 999500 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));
const win = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : Math.round(n / 1000) + 'k');
const DASH = '–';

// ===== data readers =====
const inst0 = (d) => (d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null);
const points = (d) => (d.context && Array.isArray(d.context.points) ? d.context.points : [])
  .filter((p) => p && isNum(p.percent)).map((p) => ({ t: Date.parse(p.time), v: p.percent, turn: p.turn_number }));

/** context: fill %, window, total tokens (like the base) + what the latest turn added */
const contextValues = (d) => {
  const inst = inst0(d), pts = points(d);
  let percent = inst && isNum(inst.context_percent) ? inst.context_percent : null;
  let percentPath = percent != null ? 'live.instances[].context_percent' : null;
  if (percent == null && pts.length) { percent = pts[pts.length - 1].v; percentPath = 'context.points[].percent'; }
  let windowSize = inst && isNum(inst.context_window) ? inst.context_window : null;
  let windowPath = windowSize != null ? 'live.instances[].context_window' : null;
  const s = d.session;
  if (windowSize == null && s && d.windows && d.windows[s.provider] && isNum(d.windows[s.provider][s.model])) { windowSize = d.windows[s.provider][s.model]; windowPath = 'windows.<key>.<key>'; }
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  let before = null;
  if (percent != null && pts.length) {
    const lastTurn = pts[pts.length - 1].turn;
    const prev = pts.filter((p) => isNum(p.turn) && p.turn < lastTurn);
    if (isNum(lastTurn) && prev.length) before = prev[prev.length - 1].v;
  }
  return { percent, percentPath, windowSize, windowPath, total, before };
};

/** the 100-tessera field; order(i) -> [col,row] */
const contextField = (S, v, x0, y0, s, g, perCol, before) => {
  const has = v.percent != null, p = has ? Math.max(0, Math.min(100, v.percent)) : 0;
  const full = Math.floor(p), frac = p - full;
  for (let i = 0; i < 100; i++) {
    const x = x0 + Math.floor(i / perCol) * (s + g), y = y0 + (i % perCol) * (s + g);
    if (!has) { cell(S, x, y, s, 'fill:var(--aihud-line)'); continue; }
    const c = heat(i + 0.5);
    if (i < full) {
      const fresh = before != null && i >= Math.floor(before);
      cell(S, x, y, s, 'fill:' + c + (fresh ? ';stroke:var(--aihud-text);stroke-width:0.8' : ''));
    } else {
      cell(S, x, y, s, 'fill:' + c + ';opacity:var(--aihud-heat-rest)');
      if (i === full && frac > 0.04) {
        S.add(node(S.doc, 'rect', { x: x.toFixed(2), y: y.toFixed(2), width: (s * frac).toFixed(2), height: s.toFixed(2) }, 'rx:var(--aihud-radius-small);fill:' + c + ';' + glow(c, 5 / 3)));
      }
    }
  }
  if (has && full > 0 && frac <= 0.04) {
    const i = full - 1, x = x0 + Math.floor(i / perCol) * (s + g), y = y0 + (i % perCol) * (s + g);
    cell(S, x, y, s, 'fill:' + heat(i + 0.5) + ';' + glow(heat(i + 0.5), 5 / 3));
  }
};

export const meta = { name: 'context-mosaic-portrait', contentBlock: 'context', style: 'mosaic', orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }], contractVersion: '1.1' };

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
    const d = data || {}, S = stage(el, size), v = contextValues(d);
    if ((notRecorded(d, 'live', 'tokens') || notRecorded(d, 'live', 'window'))) {
      label(S, 8, 13, 'CONTEXT', { size: 9.5, ls: 1.2 });
      label(S, size.cols * 10, size.rows * 10 + 9, DASH, { size: 28, weight: 650, fill: 'var(--aihud-absent)', anchor: 'middle' }).setAttribute('data-field', 'live.instances[].context_percent');
      return;
    }
    label(S, 8, 13, 'CONTEXT', { size: 9.5, ls: 1.2 });
    const ww = label(S, 152, 13, v.windowSize != null ? win(v.windowSize) + ' window' : DASH, { size: 9, fill: 'var(--aihud-faint)', anchor: 'end' });
    if (v.windowSize != null) ww.setAttribute('data-field', v.windowPath);
    const g = 1.5, s = (144 - 19 * g) / 20; // 20 columns of 5 % - a calendar of the window
    contextField(S, v, 8, 20, s, g, 5, v.before);
    const has = v.percent != null;
    if (has) {
      const [w0, t0] = v.percent.toFixed(1).split('.');
      figure(S, 7, 95, w0, '.' + t0 + '%', 34, 15, heat(v.percent, true)).setAttribute('data-field', v.percentPath);
    } else label(S, 8, 95, DASH, { size: 30, fill: 'var(--aihud-faint)' });
    const tt = label(S, 152, 84, v.total != null ? tok(v.total) : DASH, { size: 15, weight: 600, fill: v.total != null ? 'var(--aihud-text)' : 'var(--aihud-faint)', anchor: 'end' });
    if (v.total != null) tt.setAttribute('data-field', 'live.instances[].tokens_total');
    label(S, 152, 96, 'tokens', { size: 9, anchor: 'end' });
    if (has && v.before != null) label(S, 8, 113, (v.percent - v.before >= 0 ? '+' : '\u2212') + Math.abs(v.percent - v.before).toFixed(1) + '% last turn', { size: 9.5, fill: 'var(--aihud-faint)' }).setAttribute('data-field', [...new Set([v.percentPath, 'context.points[].percent'])].join(' '));
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

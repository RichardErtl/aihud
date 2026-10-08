// Mosaic (Tessera), landscape: trace of the context fill, one tessera per time step, the turns on an axis below.
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
  return S.add(node(S.doc, 'text', { x, y, 'text-anchor': o.anchor || 'start', ...(o.f ? { 'data-field': o.f } : {}) },
    'font-size:' + (o.size || 10) + 'px;fill:' + (o.fill || 'var(--aihud-dim)') + ';font-weight:' + (o.weight || 400)
    + (o.ls ? ';letter-spacing:' + o.ls + 'px' : '') + (o.mono ? ';font-family:var(--aihud-font-mono)' : ''), str));
};
/** a big value: whole part large, tail (".8%") small, both in one text */
const figure = (S, x, y, whole, tail, big, small, fill, anchor, f) => {
  const t = S.add(node(S.doc, 'text', { x, y, 'text-anchor': anchor || 'start', ...(f ? { 'data-field': f } : {}) }, 'fill:' + fill + ';font-weight:650'));
  t.append(node(S.doc, 'tspan', {}, 'font-size:' + big + 'px', whole));
  if (tail) t.append(node(S.doc, 'tspan', {}, 'font-size:' + small + 'px', tail));
  return t;
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
const cell = (S, x, y, s, style, f) => S.add(node(S.doc, 'rect', { x: x.toFixed(2), y: y.toFixed(2), width: s.toFixed(2), height: s.toFixed(2), ...(f ? { 'data-field': f } : {}) }, 'rx:var(--aihud-radius-small);' + style));
const span = (ms) => {
  const m = Math.round(ms / 60000);
  if (m < 1) return Math.round(ms / 1000) + 's';
  return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm';
};
const DASH = '–';

// ===== data readers =====
const inst0 = (d) => (d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null);
const points = (d) => (d.context && Array.isArray(d.context.points) ? d.context.points : [])
  .filter((p) => p && isNum(p.percent)).map((p) => ({ t: Date.parse(p.time), v: p.percent, turn: p.turn_number }));

/** Trace model: minutes of the session, the fill per minute, the turns */
const traceModel = (d) => {
  const pts = points(d).filter((p) => isFinite(p.t)).sort((a, b) => a.t - b.t);
  const turns = (d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : [])
    .map((t) => ({ n: t && t.number, t: Date.parse(t && t.started_at), dur: t && isNum(t.duration_s) ? t.duration_s * 1000 : null }))
    .filter((t) => isNum(t.n) && isFinite(t.t)).sort((a, b) => a.t - b.t);
  if (!pts.length && !turns.length) return null;
  const starts = pts.map((p) => p.t).concat(turns.map((t) => t.t));
  const ss = d.session ? Date.parse(d.session.started_at) : NaN;
  if (isFinite(ss)) starts.push(ss);
  const ends = pts.map((p) => p.t).concat(turns.map((t) => t.t + (t.dur || 0)));
  const inst = inst0(d), la = inst ? Date.parse(inst.last_activity) : NaN;
  if (isFinite(la)) ends.push(la);
  const t0 = Math.min.apply(null, starts), t1 = Math.max.apply(null, ends);
  return { pts, turns, t0, t1, now: pts.length ? pts[pts.length - 1].v : null, first: pts.length ? pts[0].v : null };
};
const STEPS = [1, 2, 3, 5, 10, 15, 20, 30, 60, 120, 240, 480, 1440];

/** draws the minute mosaic + turn axis into (x0,y0,w,h); returns {m, used} or null when empty */
const traceField = (S, M, x0, y0, w, h, axisGap) => {
  const AX = 4 + axisGap + 11; // axis strip + labels below the grid
  if (!M) {
    const f = fit(96, w, h - AX, 6, 0.28);
    for (let k = 0; k < f.rows * f.cols; k++) cell(S, x0 + Math.floor(k / f.rows) * f.step, y0 + (k % f.rows) * f.step, f.s, 'fill:var(--aihud-line-2)');
    return null;
  }
  const total = Math.max(1, M.t1 - M.t0);
  let m = STEPS[STEPS.length - 1], f = null, n = 1;
  for (const st of STEPS) {
    n = Math.max(1, Math.ceil(total / (st * 60000)));
    const t = fit(n, w, h - AX, 10, 0.28);
    if (t && t.s >= 5) { m = st; f = t; break; }
  }
  if (!f) { n = Math.max(1, Math.ceil(total / (m * 60000))); f = fit(n, w, h - AX, 10, 0.28); }
  const ms = m * 60000;
  const peak = new Array(n).fill(null), mark = new Array(n).fill(false);
  for (const p of M.pts) { const k = Math.min(n - 1, Math.floor((p.t - M.t0) / ms)); peak[k] = peak[k] == null ? p.v : Math.max(peak[k], p.v); }
  for (const t of M.turns) mark[Math.min(n - 1, Math.max(0, Math.floor((t.t - M.t0) / ms)))] = true;
  const running = (a, b) => M.turns.some((t) => t.t < b && t.t + (t.dur || 0) > a);
  let last = null, tip = -1;
  for (let k = 0; k < n; k++) if (peak[k] != null) tip = k;
  for (let k = 0; k < n; k++) {
    const x = x0 + Math.floor(k / f.rows) * f.step, y = y0 + (k % f.rows) * f.step;
    if (peak[k] != null) {
      last = peak[k];
      const c = heat(peak[k]);
      cell(S, x, y, f.s, 'fill:' + c + (k === tip ? ';' + glow(c, 5 / 3) : ''), 'context.points[].time context.points[].percent');
    } else if (running(M.t0 + k * ms, M.t0 + (k + 1) * ms)) {
      cell(S, x, y, f.s, last != null ? 'fill:' + heat(last) + ';opacity:0.34' : 'fill:var(--aihud-faint)');
    } else cell(S, x, y, f.s, 'fill:var(--aihud-line)');
    if (mark[k]) {
      const r = f.s / 2 + f.g * 0.42;
      S.add(node(S.doc, 'circle', { cx: (x + f.s / 2).toFixed(2), cy: (y + f.s / 2).toFixed(2), r: Math.max(0.5, r - 0.45).toFixed(2), 'data-field': 'turn.turns[].started_at' }, 'fill:none;stroke:var(--aihud-text);stroke-width:0.9'));
    }
  }
  // turn axis (#18): one bar per column, banded by the turn running at the column's middle
  const used = Math.ceil(n / f.rows), ay = y0 + f.rows * f.step - f.g + axisGap;
  const turnAt = (t) => { let r = null; for (const x of M.turns) if (x.t <= t) r = x; return r; };
  let lx = -99;
  for (let c = 0; c < used; c++) {
    const tm = M.t0 + (c + 0.5) * f.rows * ms, tr = turnAt(tm), x = x0 + c * f.step;
    if (tr) S.add(node(S.doc, 'rect', { x: x.toFixed(2), y: ay.toFixed(2), width: f.step.toFixed(2), height: 3 }, 'fill:var(' + (tr.n % 2 ? '--aihud-dim' : '--aihud-faint') + ')'));
  }
  for (const t of M.turns) {
    const c = Math.floor(Math.min(n - 1, Math.max(0, Math.floor((t.t - M.t0) / ms))) / f.rows);
    const x = x0 + c * f.step + f.s / 2;
    if (x - lx < 10) continue;
    lx = x;
    label(S, Math.min(x, x0 + w - 3), ay + 13, String(t.n), { size: 9, fill: 'var(--aihud-dim)', anchor: 'middle', f: 'turn.turns[].number' });
  }
  return { m, used: used * f.step - f.g, ay };
};

export const meta = { name: 'trace-mosaic-landscape', contentBlock: 'trace', style: 'mosaic', orientation: 'landscape', sizes: [{ cols: 16, rows: 6 }], contractVersion: '1.1' };

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
    const d = data || {}, S = stage(el, size), M = traceModel(d);
    label(S, 8, 18, 'TRACE', { size: 9.5, ls: 1.2 });
    const now = M && M.now != null ? M.now : null;
    if (now != null) {
      const [w0, t0] = now.toFixed(1).split('.');
      figure(S, 7, 50, w0, '.' + t0 + '%', 26, 12, heat(now, true), undefined, 'context.points[].percent');
      if (M.first != null) label(S, 8, 64, 'from ' + M.first.toFixed(1) + '%', { size: 9, fill: 'var(--aihud-faint)', f: 'context.points[].percent' });
    } else if (notRecorded(d, 'context', 'points')) label(S, 8, 50, DASH, { size: 24, fill: 'var(--aihud-absent)', f: 'context.points[].percent' });
    else label(S, 8, 50, DASH, { size: 24, fill: 'var(--aihud-faint)' });
    label(S, 8, 94, M && M.turns.length ? M.turns.length + (M.turns.length === 1 ? ' turn' : ' turns') : DASH, { size: 10, f: M && M.turns.length ? 'turn.turns[].number' : null });
    label(S, 8, 108, M ? span(M.t1 - M.t0) : DASH, { size: 10, fill: 'var(--aihud-faint)', f: M ? 'session.started_at live.instances[].last_activity' : null });
    const r = traceField(S, M, 86, 9, 226, 98, 3);
    if (r) label(S, 312, 113, '1 cell = ' + (r.m >= 60 ? r.m / 60 + ' h' : r.m + ' min'), { size: 9, fill: 'var(--aihud-faint)', anchor: 'end' });
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

// recorder · trace-seismograph-landscape
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = { name: 'trace-seismograph-landscape', contentBlock: 'trace', style: 'seismograph', orientation: 'landscape', sizes: [{ cols: 16, rows: 6 }], contractVersion: '1.1' };

const SG = (() => {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const num = (v) => (isNum(v) ? v : null);

  const tms = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

  const c = (n) => String(Math.round(n * 10) / 10);

  const esc = (s) => String(s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  const v = (name) => 'var(--aihud-' + name + ')';

  let seq = 0;

  const uid = () => 'sg' + (++seq).toString(36) + Math.floor(Math.random() * 46656).toString(36);

  const tok = (n) => (!isNum(n) ? '–' : n >= 999500 ? (n / 1e6).toFixed(1) + 'M' : n >= 1000 ? Math.round(n / 1000) + 'k' : String(Math.round(n)));

  const pct = (p) => (isNum(p) ? (Math.round(p * 10) / 10).toFixed(1) : '–');

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // text width estimate (generous): mono 0.62 em, proportional 0.58 em
  const tw = (s, size, mono) => String(s).length * size * (mono ? 0.62 : 0.58);


  // the heat function of CONTRACT.md §Heat (surface stops, or text stops for numbers/needles/thin strokes)
  const HS = [0, 30, 50, 75, 100];

  const heat = (val, text) => {
    const x = clamp(isNum(val) ? val : 0, 0, 100); let a = 0, b = 30;
    for (let i = 1; i < HS.length; i++) if (x <= HS[i]) { a = HS[i - 1]; b = HS[i]; break; }
    const p = ((b - x) / (b - a) * 100).toFixed(1), k = text ? 'heat-text-' : 'heat-';
    return 'color-mix(in srgb, var(--aihud-' + k + a + ') ' + p + '%, var(--aihud-' + k + b + '))';
  };

  const glow = (col, f) => 'filter:drop-shadow(0 0 calc(var(--aihud-glow) * ' + (f || 1) + ') ' + col + ')';


  // <text>: o = {s size, c colour css, a anchor, m mono, w weight, ls letter-spacing, st extra style, raw}
  const t = (x, y, str, o = {}) => {
    const st = ['fill:' + (o.c || v('dim')), 'font-family:' + (o.m ? v('font-mono') : v('font')), 'font-size:' + (o.s || 9) + 'px',
      'font-weight:' + (o.w || 400), 'font-variant-numeric:tabular-nums'];
    if (o.ls) st.push('letter-spacing:' + o.ls + 'px');
    if (o.halo) st.push('paint-order:stroke;stroke:' + v('panel') + ';stroke-width:3px;stroke-linejoin:round');
    if (o.st) st.push(o.st);
    return '<text x="' + c(x) + '" y="' + c(y) + '" text-anchor="' + (o.a || 'start') + '"' + (o.f ? ' data-field="' + o.f + '"' : '') + ' style="' + st.join(';') + '">' + (o.raw ? str : esc(str)) + '</text>';
  };

  const line = (x1, y1, x2, y2, st, f) => '<line x1="' + c(x1) + '" y1="' + c(y1) + '" x2="' + c(x2) + '" y2="' + c(y2) + '"' + (f ? ' data-field="' + f + '"' : '') + ' style="' + st + '"/>';

  const dot = (x, y, r, st, cls) => '<circle cx="' + c(x) + '" cy="' + c(y) + '" r="' + r + '"' + (cls ? ' class="' + cls + '"' : '') + ' style="' + st + '"/>';


  // the data sheet, defensively read; time span = first..last stamp anywhere in the sheet
  const sheet = (data) => {
    const d = data && typeof data === 'object' ? data : {};
    const inst = d.live && Array.isArray(d.live.instances) && d.live.instances[0] && typeof d.live.instances[0] === 'object' ? d.live.instances[0] : null;
    const turns = d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((x) => x && tms(x.started_at) != null && isNum(x.number)) : [];
    const points = d.context && Array.isArray(d.context.points)
      ? d.context.points.filter((p) => p && tms(p.time) != null && isNum(p.percent))
        .map((p) => ({ t: tms(p.time), pct: p.percent, win: num(p.tokens_in_window), turn: num(p.turn_number) })).sort((a, b) => a.t - b.t)
      : [];
    const nodes = d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter((n) => n && typeof n === 'object') : null;
    const stamps = [tms(d.session && d.session.started_at), tms(inst && inst.last_activity)];
    for (const p of points) stamps.push(p.t);
    for (const x of turns) stamps.push(tms(x.started_at));
    if (nodes) for (const n of nodes) stamps.push(tms(n.last_activity));
    const ok = stamps.filter((x) => x != null);
    const t0 = ok.length ? Math.min(...ok) : null, t1 = ok.length ? Math.max(...ok) : null;
    return { d, inst, turns, points, nodes, t0, t1, live: t0 != null && t1 > t0 };
  };

  const xmap = (S, x0, x1) => (S.live ? (tt) => x0 + (tt - S.t0) / (S.t1 - S.t0) * (x1 - x0) : null);

  const span = (S) => {
    if (!S.live) return '–';
    const m = Math.round((S.t1 - S.t0) / 60000);
    return m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm';
  };


  // paper: dot grid + phosphor decay mask + breathing tip style
  const paper = (id, W, H, x0, xh) =>
    '<style>.sgb{animation:sgb 1.3s ease-in-out infinite alternate}@keyframes sgb{from{opacity:1}to{opacity:.5}}' +
    '@media (prefers-reduced-motion:reduce){.sgb{animation:none}}</style>' +
    '<defs><pattern id="' + id + 'd" width="10" height="10" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r=".55" style="fill:' + v('line') + '"/></pattern>' +
    '<linearGradient id="' + id + 'f" gradientUnits="userSpaceOnUse" x1="' + x0 + '" y1="0" x2="' + xh + '" y2="0">' +
    '<stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".72" stop-color="#fff" stop-opacity=".78"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>' +
    '<mask id="' + id + 'm" maskUnits="userSpaceOnUse" x="0" y="0" width="' + W + '" height="' + H + '"><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#' + id + 'f)"/></mask></defs>' +
    '<rect x="1" y="1" width="' + (W - 2) + '" height="' + (H - 2) + '" rx="5" style="fill:url(#' + id + 'd);stroke:' + v('line') + ';stroke-width:1"/>';


  // the writing head: dotted stylus line + triangle
  const head = (x, y0, y1) => line(x, y0, x, y1, 'stroke:' + v('dim') + ';stroke-width:.7;stroke-dasharray:1 1.7;opacity:.75') +
    '<path d="M' + c(x - 2.6) + ' ' + c(y0 - 3.4) + 'L' + c(x + 2.6) + ' ' + c(y0 - 3.4) + 'L' + c(x) + ' ' + c(y0) + 'Z" style="fill:' + v('dim') + '"/>';


  // relative time ticks back from the head (-1h, -2h / -30m ...), never a fake clock
  const axis = (S, X, x0, x1, yAxis, yLab) => {
    if (!X) return '';
    const spanMs = S.t1 - S.t0, H = 3600e3, M = 60e3;
    const step = spanMs > 2.5 * H ? H : spanMs > 50 * M ? 30 * M : spanMs > 12 * M ? 5 * M : M;
    let s = line(x0, yAxis, x1, yAxis, 'stroke:' + v('line') + ';stroke-width:.8'), last = 1e9;
    for (let k = 1; S.t1 - k * step > S.t0; k++) {
      const x = X(S.t1 - k * step), lab = step >= H ? '-' + (k * step / H) + 'h' : '-' + (k * step / M) + 'm', w = tw(lab, 9, true);
      s += line(x, yAxis, x, yAxis + 3, 'stroke:' + v('dim') + ';stroke-width:.7');
      if (x - w / 2 < x0 || last - x < w + 8) continue;
      s += t(x, yLab, lab, { m: 1, a: 'middle' }); last = x;
    }
    return s;
  };


  // turn cells for the turn axis: tokens, context at the end of the turn (carried when the turn has no reply)
  const turnCells = (S) => {
    let carry = null;
    return S.turns.slice().sort((a, b) => a.number - b.number).map((tr) => {
      const pts = S.points.filter((p) => p.turn === tr.number), has = pts.length > 0;
      if (has) carry = pts[pts.length - 1].pct;
      const amount = isNum(tr.tokens_in) || isNum(tr.tokens_out) ? (isNum(tr.tokens_in) ? tr.tokens_in : 0) + (isNum(tr.tokens_out) ? tr.tokens_out : 0) : null; // null = not recorded, never 0
      return { n: tr.number, t: tms(tr.started_at), tokens: amount, end: carry, has };
    });
  };


  const box = (el, size, body) => {
    const doc = el.ownerDocument, w = size.cols * size.unit, h = size.rows * size.unit;
    const div = doc.createElement('div');
    div.style.cssText = 'width:' + w + 'px;height:' + h + 'px;overflow:hidden;background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)';
    div.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + size.cols * 20 + ' ' + size.rows * 20 + '" style="display:block;overflow:hidden">' + body + '</svg>';
    el.replaceChildren(div);
  };

  return { sheet, uid, v, xmap, num, paper, turnCells, t, heat, line, c, head, dot, glow, clamp, pct, tok, axis, box };
})();

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const K = SG, S = K.sheet(data), W = size.cols * 20, H = size.rows * 20, id = K.uid(), v = K.v;
  const x0 = 8, xh = 236, yT = 32, yB = 66, lT = 84, lB = 102;
  const P = S.points, X = K.xmap(S, x0, xh);
  const cur = K.num(S.inst && S.inst.context_percent) != null ? S.inst.context_percent : P.length ? P[P.length - 1].pct : null;
  const mx = Math.max(cur || 0, ...P.map((p) => p.pct));
  const top = [25, 50, 75, 100].find((k) => k >= mx * 1.08) || 100, Y = (p) => yB - Math.min(p, top) / top * (yB - yT);
  let s = K.paper(id, W, H, x0, xh);
  const cells = K.turnCells(S);
  s += K.t(8, 14, 'TRACE', { ls: 1.2 }) + K.t(xh, 14, cells.length ? cells.length + ' turns' : '–', { m: 1, a: 'end', f: cells.length ? 'turn.turns[].number' : null }) + K.t(xh + 8, 14, 'CONTEXT', { ls: 1.2 });
  const grad = (gid, text, y0, y1) => '<linearGradient id="' + gid + '" gradientUnits="userSpaceOnUse" x1="0" y1="' + y0 + '" x2="0" y2="' + y1 + '">' +
    [0, 30, 50, 75, 100].filter((k) => k < top).concat([top]).map((k) => '<stop offset="' + (k / top).toFixed(3) + '" style="stop-color:' + K.heat(k, text) + '"/>').join('') + '</linearGradient>';
  s += '<defs>' + grad(id + 'h', true, yB, yT) + grad(id + 's', false, yB, yT) + '</defs>';
  const N = cells.length, cw = N ? (xh - x0) / N : 0, maxTok = Math.max(1, ...cells.map((q) => q.tokens || 0)),
    lk = N ? Math.max(1, Math.ceil((String('T' + Math.max(...cells.map((q) => q.n))).length * 9 * 0.62 + 4) / cw)) : 1; // label every lk-th cell
  s += K.line(x0, 24, xh, 24, 'stroke:' + v('faint') + ';stroke-width:.7');
  cells.forEach((q, k) => {
    const xa = x0 + k * cw;
    if (X) {
      const xt = X(q.t);
      s += '<path d="M' + K.c(xt) + ' 25L' + K.c(xt) + ' ' + yB + 'L' + K.c(xa) + ' ' + lT + '" style="fill:none;stroke:' + v('dim') + ';stroke-width:.5;stroke-dasharray:1 2;opacity:.32"/>';
      s += '<path d="M' + K.c(xt - 1.4) + ' 24L' + K.c(xt - 1.4) + ' 19.4L' + K.c(xt + 1.4) + ' 19.4L' + K.c(xt + 1.4) + ' 24" data-field="turn.turns[].started_at" style="fill:none;stroke:' + v('text') + ';stroke-width:.85"/>';
    }
    s += K.line(xa, lT, xa, lB, 'stroke:' + v('line') + ';stroke-width:.6');
    const a = q.tokens / maxTok * (lB - lT - 3);
    if (q.tokens > 0) s += K.line(xa + cw / 2, lB, xa + cw / 2, lB - a, 'stroke:' + v('series-1') + ';stroke-width:2.4;opacity:.85', 'turn.turns[].tokens_in turn.turns[].tokens_out');
    if ((k % lk === 0 && N - 1 - k >= lk) || k === N - 1) s += K.t(xa + cw / 2, lB + 12, 'T' + q.n, { m: 1, a: 'middle', f: 'turn.turns[].number', c: q.has ? v('dim') : v('faint') });
  });
  if (N) {
    const LY = (p) => lB - Math.min(p, top) / top * (lB - lT);
    cells.forEach((q, k) => {
      if (q.end == null) return;
      const xa = x0 + k * cw;
      s += K.line(xa, LY(q.end), xa + cw, LY(q.end), 'stroke:' + K.heat(q.end, true) + ';stroke-width:1.3' + (q.has ? '' : ';stroke-dasharray:2 2'), 'context.points[].percent context.points[].turn_number');
      if (k && cells[k - 1].end != null) s += K.line(xa, LY(cells[k - 1].end), xa, LY(q.end), 'stroke:' + K.heat(q.end, true) + ';stroke-width:.8;opacity:.6', 'context.points[].percent context.points[].turn_number');
    });
  }
  s += K.line(x0, lB, xh, lB, 'stroke:' + v('line') + ';stroke-width:.8');
  if (P.length) {
    for (const k of [30, 50, 75]) if (k < top) s += K.line(x0, Y(k), xh, Y(k), 'stroke:' + v('line') + ';stroke-width:.6;stroke-dasharray:2 2');
    s += K.line(x0, yT, xh, yT, 'stroke:' + v('line') + ';stroke-width:.6');
    s += K.t(x0 + 2, yT + 10, top + '%', { m: 1 });
  }
  if (X && P.length) {
    const d = P.map((p, i) => (i ? 'L' : 'M') + K.c(X(p.t)) + ' ' + K.c(Y(p.pct))).join('') + 'L' + xh + ' ' + K.c(Y(P[P.length - 1].pct));
    s += '<g mask="url(#' + id + 'm)" data-field="context.points[].time context.points[].percent"><path d="' + d + 'L' + xh + ' ' + yB + 'L' + K.c(X(P[0].t)) + ' ' + yB + 'Z" style="fill:url(#' + id + 's);opacity:.12"/>';
    s += '<path d="' + d + '" style="fill:none;stroke:url(#' + id + 'h);stroke-width:1.4;stroke-linejoin:round"/></g>';
    for (let i = 1; i < P.length; i++) if (P[i - 1].pct - P[i].pct >= 8) {
      const xc = X(P[i].t);
      s += K.line(xc, yT + 2, xc, yB, 'stroke:' + v('dim') + ';stroke-width:.7');
      if (xc + 40 < xh) s += K.t(xc + 2, yB - 3, 'compact', {});
    }
  } else s += K.line(x0, yB, xh, yB, 'stroke:' + v('faint') + ';stroke-width:1;stroke-dasharray:3 3');
  if (!P.length && notRecorded(data, 'context', 'points')) s += K.t((x0 + xh) / 2, (yT + yB) / 2 + 9, '–', { a: 'middle', c: v('absent'), s: 24, w: 650, f: 'context.points' });
  s += K.line(x0, yB, xh, yB, 'stroke:' + v('line') + ';stroke-width:.8');
  s += K.head(xh, yT - 3, lB);
  const absCur = cur == null && notRecorded(data, 'live', 'tokens');
  const yc = cur == null ? yB : Y(cur), hc = K.heat(cur, true);
  s += K.dot(xh, yc, 2.4, 'fill:' + (cur == null ? v('faint') : K.heat(cur, false)) + ';' + (cur == null ? '' : K.glow(K.heat(cur, false), 1.6)), 'sgb');
  const nb = K.clamp(yc + 8, yT + 16, yB + 2);
  s += K.t(xh + 7, nb, cur == null ? '–' : K.pct(cur) + '<tspan style="font-size:11px;font-weight:400" dx="1" dy="-10">%</tspan>',
    { s: 24, w: 250, raw: 1, f: cur == null ? (absCur ? 'live.instances[].context_percent' : null) : (K.num(S.inst && S.inst.context_percent) != null ? 'live.instances[].context_percent' : 'context.points[].percent'), c: cur == null ? v(absCur ? 'absent' : 'faint') : hc, st: cur == null ? '' : K.glow(hc, 0.6) });
  const win = K.num(S.inst && S.inst.context_window);
  s += K.t(xh + 8, nb + 13, win == null ? '' : 'of ' + K.tok(win) + ' window', { f: win == null ? null : 'live.instances[].context_window' });
  s += K.axis(S, X, x0, xh, yB, yB + 12);
  const lc = cells[cells.length - 1];
  const absTok = !!lc && lc.tokens == null && notRecorded(data, 'turn', 'tokens');
  s += K.t(xh + 8, lT + 6, lc ? 'turn ' + lc.n : 'turn –', { f: lc ? 'turn.turns[].number' : null });
  s += K.t(xh + 8, lB + 1, lc && lc.tokens != null ? K.tok(lc.tokens) : '–', { m: 1, s: 11, f: lc && lc.tokens != null ? 'turn.turns[].tokens_in turn.turns[].tokens_out' : absTok ? 'turn.turns[].tokens_in' : null, c: lc && lc.tokens != null ? v('series-1') : v(absTok ? 'absent' : 'faint') });
  s += K.t(W - 8, lB + 1, lc ? 'this turn' : '', { a: 'end' });
  K.box(el, size, s);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

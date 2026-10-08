// recorder · tokens-seismograph-portrait
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = { name: 'tokens-seismograph-portrait', contentBlock: 'tokens', style: 'seismograph', orientation: 'portrait', sizes: [{ cols: 8, rows: 10 }], contractVersion: '1.1' };

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

  const fit = (s, maxW, size, mono) => {
    s = String(s); if (tw(s, size, mono) <= maxW) return s;
    while (s.length > 1 && tw(s + '…', size, mono) > maxW) s = s.slice(0, -1);
    return s + '…';
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

  const line = (x1, y1, x2, y2, st) => '<line x1="' + c(x1) + '" y1="' + c(y1) + '" x2="' + c(x2) + '" y2="' + c(y2) + '" style="' + st + '"/>';

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

  const nice = (n) => {
    if (!(n > 0)) return 0;
    const e = Math.pow(10, Math.floor(Math.log10(n)));
    for (const k of [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (k * e >= n * 1.04) return k * e;
    return 10 * e;
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


  // event-marker pen: baseline + square needle kick per user message (#25); guide drops to guideY
  const kicks = (S, X, x0, x1, y, guideY) => {
    let s = line(x0, y, x1, y, 'stroke:' + v('faint') + ';stroke-width:.7');
    if (!X) return s;
    for (const tr of S.turns) {
      const x = X(tms(tr.started_at));
      if (guideY) s += line(x, y + 1, x, guideY, 'stroke:' + v('dim') + ';stroke-width:.5;stroke-dasharray:1 2;opacity:.32');
      s += '<path d="M' + c(x - 1.4) + ' ' + y + 'L' + c(x - 1.4) + ' ' + c(y - 4.6) + 'L' + c(x + 1.4) + ' ' + c(y - 4.6) + 'L' + c(x + 1.4) + ' ' + y + '" style="fill:none;stroke:' + v('text') + ';stroke-width:.85"/>';
    }
    return s;
  };


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


  // pen-stroke legend row: name (+ small count) on top, stroke length = share, value written at the tip
  const penRow = (x0, x1, y, name, count, val, share, col, f) => {
    const vw = tw(val, 9, true), L = Math.max(0, x1 - x0 - vw - 6), len = Math.max(2, clamp(share, 0, 1) * L);
    const nm = fit(name, x1 - x0 - (count ? 24 : 0), 9, false);
    let s = t(x0, y, nm, { f });
    if (count) s += t(x0 + tw(nm, 9, false) + 3, y, count, { m: 1, c: v('faint') });
    const sy = y + 7;
    s += line(x0, sy, x0 + L, sy, 'stroke:' + v('line-2') + ';stroke-width:2;stroke-linecap:round');
    s += line(x0, sy, x0 + len, sy, 'stroke:' + col + ';stroke-width:2;stroke-linecap:round');
    s += dot(x0 + len, sy, 1.9, 'fill:' + col + ';' + glow(col, 0.7));
    s += t(x0 + len + 5, sy + 3.2, val, { m: 1, c: v('text'), halo: 1, f });
    return s;
  };

  // stack labels top-down with a minimum gap, inside [lo, hi]
  const stack = (ys, gap, lo, hi) => {
    const out = ys.slice();
    for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], i ? out[i - 1] + gap[i] : lo);
    for (let i = out.length - 1; i >= 0; i--) out[i] = Math.min(out[i], i < out.length - 1 ? out[i + 1] - gap[i + 1] : hi);
    return out;
  };


  // step polyline points for [t, value] events, holding until the head
  const steps = (ev, X, Y, x0, xh, pick) => {
    const pts = [[x0, Y(0)]]; let y = Y(0);
    for (const e of ev) { const x = X(e[0]); pts.push([x, y]); y = Y(pick(e)); pts.push([x, y]); }
    pts.push([xh, y]);
    return pts;
  };

  const poly = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + c(p[0]) + ' ' + c(p[1])).join('');


  // tokens over time: main = each turn's exact tokens spread over its replies by tokens_in_window,
  // sub = each subagent's tokens_self at its last_activity. Rows [t, cumMain, cumTotal].
  const tokenSeries = (S) => {
    const ev = [];
    for (const tr of S.turns) {
      const amount = (isNum(tr.tokens_in) ? tr.tokens_in : 0) + (isNum(tr.tokens_out) ? tr.tokens_out : 0);
      if (!(amount > 0)) continue;
      const pts = S.points.filter((p) => p.turn === tr.number && p.win > 0), w = pts.reduce((a, p) => a + p.win, 0);
      if (pts.length && w > 0) for (const p of pts) ev.push([p.t, amount * p.win / w, 0]);
      else ev.push([tms(tr.started_at) + (isNum(tr.duration_s) ? tr.duration_s * 1000 : 0), amount, 0]);
    }
    if (S.nodes) for (const n of S.nodes) {
      const ta = tms(n.last_activity);
      if (n.parent_id != null && isNum(n.tokens_self) && n.tokens_self > 0 && ta != null) ev.push([ta, 0, n.tokens_self]);
    }
    ev.sort((a, b) => a[0] - b[0]);
    let m = 0, s = 0;
    return ev.map((e) => { m += e[1]; s += e[2]; return [e[0], m, m + s]; });
  };


  // model names: drop the vendor prefix, then the version when that stays unique
  const modelNames = (ids) => {
    const a = ids.map((id) => String(id).replace(/^claude-/, '')), b = a.map((x) => x.replace(/-\d.*$/, ''));
    return new Set(b).size === b.length ? b : a;
  };


  const box = (el, size, body) => {
    const doc = el.ownerDocument, w = size.cols * size.unit, h = size.rows * size.unit;
    const div = doc.createElement('div');
    div.style.cssText = 'width:' + w + 'px;height:' + h + 'px;overflow:hidden;background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)';
    div.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + size.cols * 20 + ' ' + size.rows * 20 + '" style="display:block;overflow:hidden">' + body + '</svg>';
    el.replaceChildren(div);
  };

  return { sheet, uid, v, num, tokenSeries, xmap, nice, paper, t, span, kicks, line, tok, steps, poly, head, dot, glow, stack, axis, isNum, modelNames, penRow, box };
})();

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
  const K = SG, S = K.sheet(data), W = size.cols * 20, id = K.uid(), v = K.v;
  const x0 = 8, xh = W - 62, yT = 34, yB = 104;
  const total = K.num(S.inst && S.inst.tokens_total), main = K.num(S.inst && S.inst.tokens_main);
  const sub = total != null && main != null ? Math.max(0, total - main) : null;
  const ser = K.tokenSeries(S), X = K.xmap(S, x0, xh), last = ser.length ? ser[ser.length - 1] : null;
  const top = K.nice(Math.max(total || 0, last ? last[2] : 0)), Y = (n) => yB - (top ? n / top : 0) * (yB - yT);
  let s = K.paper(id, W, size.rows * 20, x0, xh);
  s += K.t(8, 14, 'TOKENS', { ls: 1.2 }) + K.t(W - 8, 14, K.span(S), { m: 1, a: 'end', f: S.live ? 'session.started_at live.instances[].last_activity' : null });
  s += K.kicks(S, X, x0, xh, 24, yB);
  if (top) {
    s += K.line(x0, yT, xh, yT, 'stroke:' + v('line') + ';stroke-width:.6;stroke-dasharray:2 2');
    s += K.t(x0 + 2, yT + 10, K.tok(top), { m: 1 });
  }
  let yTot = yB, yMain = yB;
  if (X && ser.length) {
    const mp = K.steps(ser, X, Y, x0, xh, (e) => e[1]), tp = K.steps(ser, X, Y, x0, xh, (e) => e[2]);
    yTot = tp[tp.length - 1][1]; yMain = mp[mp.length - 1][1];
    s += '<g mask="url(#' + id + 'm)" data-field="turn.turns[].tokens_in turn.turns[].tokens_out agents.nodes[].tokens_self">';
    s += '<path d="' + K.poly(mp) + 'L' + xh + ' ' + yB + 'L' + x0 + ' ' + yB + 'Z" style="fill:' + v('main') + ';opacity:.1"/>';
    s += '<path d="' + K.poly(tp) + K.poly(mp.slice().reverse()).replace(/^M/, 'L') + 'Z" style="fill:' + v('sub') + ';opacity:.32"/>';
    s += '<path d="' + K.poly(mp) + '" style="fill:none;stroke:' + v('main') + ';stroke-width:1;stroke-linejoin:round"/>';
    s += '<path d="' + K.poly(tp) + '" style="fill:none;stroke:' + v('text') + ';stroke-width:1.35;stroke-linejoin:round"/>';
    s += '</g>';
  } else s += K.line(x0, yB, xh, yB, 'stroke:' + v('faint') + ';stroke-width:1;stroke-dasharray:3 3');
  s += K.line(x0, yB, xh, yB, 'stroke:' + v('line') + ';stroke-width:.8');
  s += K.head(xh, yT - 3, yB + 2);
  // tips + riding numerals (total on the top pen, sub in its band, main on the lower pen)
  s += K.dot(xh, yTot, 2.5, 'fill:' + v('text') + ';' + K.glow(v('text')), 'sgb');
  if (X && ser.length) s += K.dot(xh, yMain, 1.8, 'fill:' + v('main'));
  const [nb, sb, mb] = K.stack([yTot + 7, (yTot + yMain) / 2 + 3, yMain + 3], [0, 13, 11], yT + 12, yB + 1);
  const tx = xh + 6, tv = K.tok(total), unit = /[Mk]$/.test(tv) ? tv.slice(-1) : '', big = unit ? tv.slice(0, -1) : tv;
  s += K.t(tx, nb, big + (unit ? '<tspan style="font-size:10px;font-weight:400" dx="1">' + unit + '</tspan>' : ''),
    { s: 20, w: 250, c: total == null ? v('faint') : v('text'), raw: 1, f: total != null ? 'live.instances[].tokens_total' : null, st: total == null ? '' : K.glow(v('text'), 0.6) });
  s += K.t(tx, sb, 'sub <tspan style="fill:' + v('text') + ';font-family:' + v('font-mono') + '">' + K.tok(sub) + '</tspan>', { raw: 1, f: sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : null });
  s += K.t(tx, mb, 'main <tspan style="fill:' + v('text') + ';font-family:' + v('font-mono') + '">' + K.tok(main) + '</tspan>', { raw: 1, f: main != null ? 'live.instances[].tokens_main' : null });
  s += K.axis(S, X, x0, xh, yB + 2, yB + 14);
  // by model: pen strokes, value at the tip
  const bm = S.inst && S.inst.tokens_by_model && typeof S.inst.tokens_by_model === 'object'
    ? Object.entries(S.inst.tokens_by_model).filter(([, n]) => K.isNum(n) && n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  s += K.t(8, 133, 'BY MODEL', { ls: 1.2 });
  if (bm.length && total > 0) {
    const names = K.modelNames(bm.map((e) => e[0]));
    bm.forEach(([, n], i) => { s += K.penRow(8, W - 8, 148 + i * 18, names[i], '', K.tok(n), n / total, v('series-' + (i + 1)), 'live.instances[].tokens_by_model'); });
  } else s += K.t(8, 150, '–', { c: v('faint'), s: 11 });
  K.box(el, size, s);
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

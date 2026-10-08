// Redline · context · portrait (8 × 6): tachometer, window tenths, peak pointer, odometer.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'context-redline-portrait',
  contentBlock: 'context',
  style: 'redline',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 6 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  draw(el, data, size);
  if ((notRecorded(data, 'live', 'tokens') || notRecorded(data, 'live', 'window'))) absentOnly(el.firstElementChild, 'context', 'live.instances[].context_percent', size.unit / 20);
}

function draw(el, data, size) {
  const R = RL, v = R.context(data || {}), has = v.percent != null, urgent = has && v.percent >= 75;
  R.frame(el, size, () => {
    const cx = 80, cy = 54;
    let s = R.gauge(cx, cy, 40, v.percent, { peak: v.peak, num: v.win != null, tw: 3 });
    s += R.L(7, 15, 'CTX');
    if (v.win != null) s += R.T(7, 27, '×' + R.tok(v.win / 10), { c: 'var(--aihud-faint)', df: v.winPath });
    const hv = has ? (urgent ? R.heat(v.percent, 1) : 'var(--aihud-text)') : 'var(--aihud-faint)';
    if (has) { const [g, k] = v.percent.toFixed(1).split('.');
      s += `<text x="${cx}" y="${cy + 25}" text-anchor="middle" data-field="${v.percentPath}" style="fill:${hv};font-family:var(--aihud-font);font-weight:300;${urgent ? R.glow(hv) : ''}">`
        + `<tspan style="font-size:16px">${g}</tspan><tspan style="font-size:9px">.${k}%</tspan></text>`;
    } else s += R.T(cx, cy + 20, '–', { a: 'middle', fs: 14, c: hv, sans: 1 });
    // compact telltale: dark until the redline
    s += R.lamp('compact', 150, 13, urgent ? R.heat(v.percent) : 'var(--aihud-faint)', { size: 11, lit: urgent, op: urgent ? 1 : 0.5 }).replace('<title>compact</title>', '<title>auto-compact near</title>');
    // corners: peak (drag pointer) + window
    s += R.L(7, 78, 'PEAK') + R.T(7, 90, v.peak != null ? v.peak.toFixed(1) : '–', { df: v.peak != null ? 'context.points[].percent' : null, c: v.peak != null ? R.heat(v.peak, 1) : 'var(--aihud-faint)' });
    s += R.L(153, 78, 'WIN', { a: 'end' }) + R.T(153, 90, v.win != null ? R.tok(v.win) : '–', { a: 'end', df: v.winPath, c: v.win != null ? 'var(--aihud-text)' : 'var(--aihud-faint)' });
    // odometer: total tokens, exact, last three drums inverted
    s += R.L(7, 112, 'TOK');
    const str = v.total != null ? String(Math.round(v.total)) : '–';
    const cw = str.length > 8 ? 8 : 9.5, w = R.drumWidth(str, cw), x0 = Math.min(153 - w, Math.max(34, 80 - w / 2));
    s += R.drum(x0, 101, str, cw, 14, 10, { inv: v.total != null && str.length > 3 ? str.length - 3 : null, df: v.total != null ? 'live.instances[].tokens_total' : null }).s;
    return s;
  });
}

// ── Redline kit (scale, lamp, heat; copied in so the tile stands alone) ──
const RL = (() => {
  let seq = 0;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const f = (n) => +(+n).toFixed(2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const STOPS = [0, 30, 50, 75, 100];
  /* CONTRACT §Heat: straight srgb mix of the two neighbouring stops; text = the -text- ramp */
  function heat(v, text) {
    const x = clamp(v, 0, 100); let i = 1;
    while (i < STOPS.length - 1 && x > STOPS[i]) i++;
    const p = ((STOPS[i] - x) / (STOPS[i] - STOPS[i - 1])) * 100, k = text ? 'text-' : '';
    return `color-mix(in srgb, var(--aihud-heat-${k}${STOPS[i - 1]}) ${p.toFixed(1)}%, var(--aihud-heat-${k}${STOPS[i]}))`;
  }
  const glow = (c) => `filter:drop-shadow(0 0 var(--aihud-glow) ${c});`;
  const pt = (cx, cy, r, a) => { const k = a * Math.PI / 180; return [f(cx + r * Math.sin(k)), f(cy - r * Math.cos(k))]; };
  const arc = (cx, cy, r, a0, a1) => { const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
    return `M${x0} ${y0}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /* text — every engraving >= 9 px at unit 20 (legibility floor) */
  function T(x, y, s, o = {}) {
    const fs = Math.max(9, o.fs || 9);
    return `<text x="${f(x)}" y="${f(y)}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.mid ? ' dominant-baseline="central"' : ''}${o.df ? ` data-field="${o.df}"` : ''} style="font-size:${fs}px;`
      + `fill:${o.c || 'var(--aihud-text)'};font-family:var(${o.sans ? '--aihud-font' : '--aihud-font-mono'});`
      + `${o.w ? `font-weight:${o.w};` : ''}${o.ls ? `letter-spacing:${o.ls}px;` : ''}${o.st || ''}">${s}</text>`;
  }
  const L = (x, y, s, o = {}) => T(x, y, s, Object.assign({ c: 'var(--aihud-dim)', ls: 0.6 }, o));
  const line = (x1, y1, x2, y2, c, w, st = '') => `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" style="stroke:${c};stroke-width:${w};${st}"/>`;
  const path = (d, c, w, st = '') => `<path d="${d}" style="fill:none;stroke:${c};stroke-width:${w};${st}"/>`;
  /* the tile box: exact cols*unit x rows*unit, drawing at 20 px per unit via viewBox */
  function frame(el, size, body) {
    const W = size.cols * 20, H = size.rows * 20;
    el.innerHTML = `<div style="width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
      + `background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)">`
      + `<svg xmlns="http://www.w3.org/2000/svg" width="${size.cols * size.unit}" height="${size.rows * size.unit}" viewBox="0 0 ${W} ${H}" style="display:block">`
      + `<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="6" style="fill:none;stroke:var(--aihud-line);stroke-width:1"/>`
      + body(W, H) + `</svg></div>`;
  }
  /* generic lit scale over [0,max]: engraved track, painted redline, lit run up to v (null = unlit) */
  function scale(cx, cy, r, A, v, max, red, col, w) {
    let s = '', lit = '';
    const vv = v == null ? 0 : clamp(v, 0, max), step = max / 100;
    if (vv < red) s += path(arc(cx, cy, r, A(vv), A(red)), 'var(--aihud-line)', w);
    for (let p = Math.max(red, Math.floor(vv / step) * step); p < max - 1e-9; p += step) { const p0 = Math.max(p, vv);
      if (p0 >= p + step) continue;
      s += path(arc(cx, cy, r, A(p0), A(p + step) + 0.2), col(p + step / 2), w, 'opacity:var(--aihud-heat-rest)'); }
    if (v != null) for (let p = 0; p < vv; p += step) { const p1 = Math.min(p + step, vv);
      lit += path(arc(cx, cy, r, A(p), A(p1) + (p1 < vv ? 0.2 : 0)), col(p + step / 2), w); }
    return { s, lit };
  }
  function face(cx, cy, R) {
    return `<circle cx="${cx}" cy="${cy}" r="${R}" style="fill:var(--aihud-bg);stroke:var(--aihud-line);stroke-width:1"/>`
      + `<circle cx="${cx}" cy="${cy}" r="${f(R - 2)}" style="fill:none;stroke:var(--aihud-line-2);stroke-width:.6"/>`;
  }
  /* tachometer: 240 deg sweep over 0..100 %, numerals 0..10 = tenths of the window */
  function gauge(cx, cy, r, v, o = {}) {
    const A = (p) => -120 + p * 2.4, has = v != null, vv = has ? clamp(v, 0, 100) : 0, tw = o.tw || 3;
    let s = face(cx, cy, r + 4);
    const sc = scale(cx, cy, r, A, has ? vv : null, 100, 75, (p) => heat(p), tw);
    s += sc.s; let lit = sc.lit;
    for (let p = 0; p <= 100; p += 5) {
      const maj = p % 20 === 0, r1 = r - tw / 2 - 1, r2 = r1 - (maj ? 5 : 2.5);
      const [x1, y1] = pt(cx, cy, r1, A(p)), [x2, y2] = pt(cx, cy, r2, A(p));
      const on = has && p <= vv;
      if (on) lit += line(x1, y1, x2, y2, heat(p), maj ? 1.1 : 0.6);
      else if (p >= 75) s += line(x1, y1, x2, y2, heat(p), maj ? 1.1 : 0.6, 'opacity:.6');
      else s += line(x1, y1, x2, y2, maj ? 'var(--aihud-dim)' : 'var(--aihud-faint)', maj ? 1.1 : 0.6);
    }
    if (o.num) for (let p = 0; p <= 100; p += 20) { const [x, y] = pt(cx, cy, r - 15, A(p));
      s += T(x, y, p / 10, { a: 'middle', mid: 1, c: p >= 75 ? heat(p, 1) : 'var(--aihud-dim)' }); }
    if (o.peak != null) { const a = A(clamp(o.peak, 0, 100)), p1 = pt(cx, cy, r + 1.6, a), p2 = pt(cx, cy, r + 5.8, a - 3.6), p3 = pt(cx, cy, r + 5.8, a + 3.6);
      s += `<path d="M${p1}L${p2}L${p3}Z" style="fill:${heat(o.peak)};stroke:var(--aihud-panel);stroke-width:.4"/>`; }
    const hv = has ? heat(vv, 1) : 'var(--aihud-faint)';
    if (has) { const [nx, ny] = pt(cx, cy, r - 5, A(vv)), [tx, ty] = pt(cx, cy, -6, A(vv));
      lit += line(tx, ty, nx, ny, hv, 1.7, 'stroke-linecap:round'); }
    s += `<g style="${has ? glow(heat(vv)) : ''}">${lit}</g>`;
    s += `<circle cx="${cx}" cy="${cy}" r="3.8" style="fill:var(--aihud-bg);stroke:var(--aihud-line);stroke-width:.8"/><circle cx="${cx}" cy="${cy}" r="1.3" style="fill:${hv}"/>`;
    return s;
  }
  /* odometer / hobbs drum: digits in cells, ':' '.' as narrow gaps, inv = index from which cells invert */
  function drum(x, y, str, cw, ch, fs, o = {}) {
    const gid = 'rlDrum' + (++seq); let cx = x;
    let s = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--aihud-bg)"/>`
      + `<stop offset=".5" style="stop-color:var(--aihud-line-2)"/><stop offset="1" style="stop-color:var(--aihud-bg)"/></linearGradient></defs>`;
    [...String(str)].forEach((chr, i) => {
      if (chr === ':' || chr === '.') { s += T(cx + 2.2, y + ch / 2, chr, { fs: fs * 0.8, c: 'var(--aihud-dim)', a: 'middle', mid: 1 }); cx += 4.4; return; }
      const inv = o.inv != null && i >= o.inv, dash = chr === '–';
      s += `<rect x="${f(cx)}" y="${f(y)}" width="${cw}" height="${ch}" rx="1.2" style="fill:${inv ? 'var(--aihud-main)' : `url(#${gid})`};stroke:var(--aihud-line);stroke-width:.5"/>`;
      s += T(cx + cw / 2, y + ch / 2 + 0.4, chr, { fs, a: 'middle', mid: 1, c: dash ? 'var(--aihud-faint)' : inv ? 'var(--aihud-panel)' : (o.dimTo != null && i < o.dimTo ? 'var(--aihud-faint)' : 'var(--aihud-text)') });
      cx += cw + 1;
    });
    return { s: o.df ? `<g data-field="${o.df}">${s}</g>` : s, end: cx };
  }
  const drumWidth = (str, cw) => [...String(str)].reduce((w, c) => w + (c === ':' || c === '.' ? 4.4 : cw + 1), 0);
  /* telltale pictograms (16 x 16 box) */
  const ICON = {
    compact: () => '<path d="M8 1.5V6M5.6 3.8L8 6L10.4 3.8M8 14.5V10M5.6 12.2L8 10L10.4 12.2M2.5 8H13.5"/>',
    socket: () => '<circle cx="8" cy="8" r="5"/>'
  };
  function iconOf(name) {
    return String(name).toLowerCase() === 'compact' ? 'compact' : null;
  }
  function lamp(name, x, y, c, o = {}) {
    const sz = o.size || 14, k = sz / 16, kind = name == null ? 'socket' : iconOf(name);
    const g = kind ? ICON[kind](c)
      : `<rect x="2" y="2" width="12" height="12" rx="3"/><text x="8" y="8.6" text-anchor="middle" dominant-baseline="central" style="font-size:${f(9 / k)}px;stroke:none;fill:${c};font-family:var(--aihud-font-mono)">${esc(String(name)[0].toUpperCase())}</text>`;
    return `<g transform="translate(${f(x - sz / 2)} ${f(y - sz / 2)}) scale(${f(k)})" style="fill:none;stroke:${c};stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;`
      + `${o.lit ? glow(c) : ''}opacity:${o.op ?? 1}"><title>${esc(name == null ? 'no tool' : name)}</title>${g}</g>`;
  }
  const inst = (d) => d && d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const points = (d) => d && d.context && Array.isArray(d.context.points) ? d.context.points.filter((p) => p && isNum(p.percent)) : [];
  function context(d) {
    const i = inst(d), P = points(d), s = d && d.session;
    let percent = i && isNum(i.context_percent) ? i.context_percent : null;
    let percentPath = percent != null ? 'live.instances[].context_percent' : null;
    if (percent == null && P.length) { percent = P[P.length - 1].percent; percentPath = 'context.points[].percent'; }
    let win = i && isNum(i.context_window) ? i.context_window : null;
    let winPath = win != null ? 'live.instances[].context_window' : null;
    if (win == null && s && d.windows && d.windows[s.provider] && isNum(d.windows[s.provider][s.model])) { win = d.windows[s.provider][s.model]; winPath = 'windows.<key>.<key>'; }
    const total = i && isNum(i.tokens_total) ? i.tokens_total : null;
    const peak = P.length ? Math.max(...P.map((p) => p.percent)) : null;
    return { percent, win, total, peak, percentPath, winPath };
  }
  const tok = (n) => n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : String(Math.round(n));
  return { isNum, f, clamp, heat, glow, pt, arc, esc, T, L, line, path, frame, scale, face, gauge, drum, drumWidth, lamp, context, tok };
})();

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

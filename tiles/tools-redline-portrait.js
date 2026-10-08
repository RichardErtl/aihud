// Redline · tools live · portrait (8 × 8): stopwatch, trip LCD of the latest calls (turn.turns[].tool_calls), telltales, gear gate.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tools-redline-portrait',
  contentBlock: 'tools',
  style: 'redline',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 8 }],
  contractVersion: '1.1',
};

// aihud:whole-seconds v1
const wholeSeconds = (d) => !!(d && Array.isArray(d.caveats) && d.caveats.some((c) => typeof c === 'string' && c.includes('_second_resolution')));
let SUB = false; // whole-second resolution: a 0 is "under 1 s" (tools draw it as <1s)

export function render(el, data, size) {
  SUB = wholeSeconds(data);
  const R = RL, t = R.tools(data || {}), last = t.calls.length ? t.calls[t.calls.length - 1] : null;
  R.frame(el, size, () => {
    const cx = 31, cy = 33, sec = last && last.ms != null ? last.ms / 1000 : null;
    let s = R.stopwatch(cx, cy, 22, sec, { tw: 2.4 });
    s += R.T(cx, cy + 13, sec != null ? (SUB ? (sec === 0 ? '<1' : Math.round(sec)) : sec < 10 ? sec.toFixed(1) : Math.round(sec)) : '–', { a: 'middle', c: sec != null ? R.heat(R.hs(sec), 1) : 'var(--aihud-faint)', f: sec != null ? 'turn.turns[].tool_calls[].duration_s' : null });
    s += R.L(64, 15, 'LAST CALL');
    s += R.T(64, 34, last ? R.esc(last.name.length > 10 ? last.name.slice(0, 9) + '.' : last.name) : '–', { fs: 16, sans: 1, f: last ? 'turn.turns[].tool_calls[].tool' : null, c: last ? 'var(--aihud-text)' : 'var(--aihud-faint)' });
    s += R.L(64, 50, 'CALLS') + R.T(97, 50, t.calls.length ? t.calls.length : '–', { f: t.calls.length ? 'turn.turns[].tool_calls' : null, c: t.calls.length ? 'var(--aihud-text)' : 'var(--aihud-faint)' });
    s += R.T(154, 50, t.calls.length ? 'Σ' + R.hms(t.sum / 1000) : '', { f: t.calls.length ? 'turn.turns[].tool_calls[].duration_s' : null, a: 'end', c: 'var(--aihud-dim)' });
    s += R.line(6, 62, 154, 62, 'var(--aihud-line)', 0.6);
    s += rlLamps(R, t, [0, 1, 2, 3, 4, 5].map((i) => [16 + i * 25.6, 74]), 14);
    s += `<rect x="5" y="85" width="150" height="54" rx="2.5" style="fill:var(--aihud-bg);stroke:var(--aihud-line);stroke-width:.6"/>`;
    s += rlCallRows(R, t, 5, 98, 150, 12, 4, { fs: 9.5, nameN: 10, barX: 78, barW: 36 });
    s += R.L(6, 154, 'MODEL') + rlGear(R, t, 47, 154.5, 11, 10);
    s += R.T(154, 154, R.esc(R.modelLabel(t.model)), { f: t.model ? t.modelSrc : t.absLabel, a: 'end', c: t.model ? 'var(--aihud-dim)' : t.absLabel ? 'var(--aihud-absent)' : 'var(--aihud-faint)', ...(!t.model && t.absLabel ? { fs: 14, w: 650 } : {}) });
    return s;
  });
}

// ── Redline kit (scale, lamp, heat; copied in so the tile stands alone) ──
const RL = (() => {
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
    return `<text x="${f(x)}" y="${f(y)}"${o.a ? ` text-anchor="${o.a}"` : ''}${o.mid ? ' dominant-baseline="central"' : ''}${o.f ? ` data-field="${o.f}"` : ''} style="font-size:${fs}px;`
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
  /* stopwatch: 360 deg over 0..60 s, heat by seconds, redline 45..60 s */
  const hs = (sec) => clamp(sec / 60 * 100, 0, 100);
  function stopwatch(cx, cy, r, t, o = {}) {
    const A = (k) => k * 6, has = t != null, tt = has ? clamp(t, 0, 60) : 0, tw = o.tw || 2.4;
    let s = face(cx, cy, r + 3);
    const sc = scale(cx, cy, r, A, has ? tt : null, 60, 45, (k) => heat(hs(k)), tw);
    s += sc.s; let lit = sc.lit;
    for (let k = 0; k < 60; k += 5) {
      const maj = k % 15 === 0, r1 = r - tw / 2 - 1, r2 = r1 - (maj ? 4.5 : 2.2);
      const [x1, y1] = pt(cx, cy, r1, A(k)), [x2, y2] = pt(cx, cy, r2, A(k)), on = has && k <= tt;
      if (on) lit += line(x1, y1, x2, y2, heat(hs(k)), maj ? 1 : 0.6);
      else if (k >= 45) s += line(x1, y1, x2, y2, heat(hs(k)), maj ? 1 : 0.6, 'opacity:.6');
      else s += line(x1, y1, x2, y2, maj ? 'var(--aihud-dim)' : 'var(--aihud-faint)', maj ? 1 : 0.6);
    }
    if (o.num && has) for (const k of [15, 30, 45]) { const [x, y] = pt(cx, cy, r - 13, A(k));
      s += T(x, y, k, { a: 'middle', mid: 1, c: k >= 45 ? heat(hs(k), 1) : 'var(--aihud-dim)' }); }
    const hv = has ? heat(hs(tt), 1) : 'var(--aihud-faint)';
    if (has) { const [nx, ny] = pt(cx, cy, r - 3, A(tt)), [tx, ty] = pt(cx, cy, -5, A(tt));
      lit += line(tx, ty, nx, ny, hv, 1.4, 'stroke-linecap:round'); }
    s += `<g style="${has ? glow(heat(hs(tt))) : ''}">${lit}</g>`;
    s += `<circle cx="${cx}" cy="${cy}" r="2.8" style="fill:var(--aihud-bg);stroke:var(--aihud-line);stroke-width:.7"/><circle cx="${cx}" cy="${cy}" r="1" style="fill:${hv}"/>`;
    return s;
  }
  /* telltale pictograms (16 x 16 box) */
  const ICON = {
    term: () => '<path d="M2.5 4.5L7 8L2.5 11.5M8.5 12H13.5"/>',
    ps: () => '<rect x="1.5" y="2.5" width="13" height="11" rx="1.6"/><path d="M4.5 6L7 8L4.5 10M8.5 10.5H11.5"/>',
    read: (c) => `<path d="M1.5 8Q8 1.8 14.5 8Q8 14.2 1.5 8Z"/><circle cx="8" cy="8" r="2" style="fill:${c}"/>`,
    edit: () => '<path d="M3 13L3.8 9.6L10.8 2.6L13.4 5.2L6.4 12.2Z M9.4 4L12 6.6"/>',
    grep: () => '<circle cx="6.8" cy="6.8" r="4.2"/><path d="M10 10L14 14"/>',
    web: () => '<circle cx="8" cy="8" r="5.8"/><ellipse cx="8" cy="8" rx="2.5" ry="5.8"/><path d="M2.2 8H13.8"/>',
    task: () => '<circle cx="4" cy="3.6" r="1.8"/><circle cx="12" cy="3.6" r="1.8"/><circle cx="8" cy="13" r="1.8"/><path d="M4 5.4V7.6Q4 9.4 8 9.4Q12 9.4 12 7.6V5.4M8 9.4V11.2"/>',
    compact: () => '<path d="M8 1.5V6M5.6 3.8L8 6L10.4 3.8M8 14.5V10M5.6 12.2L8 10L10.4 12.2M2.5 8H13.5"/>',
    skill: () => '<path d="M8 1.8L9.5 6.5L14.2 8L9.5 9.5L8 14.2L6.5 9.5L1.8 8L6.5 6.5Z"/>',
    socket: () => '<circle cx="8" cy="8" r="5"/>'
  };
  function iconOf(name) {
    const n = String(name).toLowerCase();
    if (n === 'bash' || n === 'shell') return 'term';
    if (n === 'powershell') return 'ps';
    if (/read/.test(n)) return 'read';
    if (/write|edit/.test(n)) return 'edit';
    if (/grep|glob|search/.test(n) && !/web/.test(n)) return 'grep';
    if (/web/.test(n)) return 'web';
    if (/agent|task|message/.test(n)) return 'task';
    if (/skill/.test(n)) return 'skill';
    if (n === 'compact') return 'compact';
    return null;
  }
  function lamp(name, x, y, c, o = {}) {
    const sz = o.size || 14, k = sz / 16, kind = name == null ? 'socket' : iconOf(name);
    const g = kind ? ICON[kind](c)
      : `<rect x="2" y="2" width="12" height="12" rx="3"/><text x="8" y="8.6" text-anchor="middle" dominant-baseline="central" style="font-size:${f(9 / k)}px;stroke:none;fill:${c};font-family:var(--aihud-font-mono)">${esc(String(name)[0].toUpperCase())}</text>`;
    return `<g${name != null ? ' data-field="turn.turns[].tool_calls[].tool"' : ''} transform="translate(${f(x - sz / 2)} ${f(y - sz / 2)}) scale(${f(k)})" style="fill:none;stroke:${c};stroke-width:1.4;stroke-linecap:round;stroke-linejoin:round;`
      + `${o.lit ? glow(c) : ''}opacity:${o.op ?? 1}"><title>${esc(name == null ? 'no tool' : name)}</title>${g}</g>`;
  }
  const inst = (d) => d && d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const points = (d) => d && d.context && Array.isArray(d.context.points) ? d.context.points.filter((p) => p && isNum(p.percent)) : [];
  const turns = (d) => d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((t) => t && isNum(t.number)) : [];
  function tools(d) {
    const raw = [];
      for (const t of (d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : [])) {
        for (const c of (t && Array.isArray(t.tool_calls) ? t.tool_calls : [])) raw.push(c);
      }
      const calls = raw.filter((c) => c && typeof c.tool === 'string' && c.tool !== '').map((c) => ({ name: c.tool, ms: isNum(c.duration_s) ? c.duration_s * 1000 : null, t: Date.parse(c.started_at) }));
    const by = new Map();
    for (const c of calls) { const e = by.get(c.name) || { name: c.name, n: 0, max: 0 }; e.n++; e.max = c.ms == null ? e.max : Math.max(e.max, c.ms); by.set(c.name, e); }
    const fams = [...by.values()].sort((a, b) => b.n - a.n || b.max - a.max);
    const i = inst(d), model = (d && d.session && d.session.model) || (i && i.model) || null;
    let models = i && i.tokens_by_model && typeof i.tokens_by_model === 'object'
      ? Object.entries(i.tokens_by_model).filter(([, v]) => isNum(v)).sort((a, b) => b[1] - a[1]).map(([k]) => k) : [];
    let modelsSrc = models.length ? 'live.instances[].tokens_by_model' : null;
    if (!models.length) { models = [...new Set(turns(d).map((t) => t.model).filter(Boolean))]; if (models.length) modelsSrc = 'turn.turns[].model'; }
    const modelSrc = d && d.session && d.session.model ? 'session.model' : i && i.model ? 'live.instances[].model' : null;
    const modelExtra = !!model && !models.includes(model);
    if (modelExtra) models.unshift(model);
    const absLabel = model ? null : notRecorded(d, 'session', 'model') ? 'session.model' : notRecorded(d, 'live', 'tokens') ? 'live.instances[].model' : null;
    const absGear = models.length ? null : notRecorded(d, 'live', 'tokens') ? 'live.instances[].tokens_by_model' : notRecorded(d, 'turn', 'tokens') ? 'turn.turns[].model' : null;
    return { calls, fams, model, models, modelSrc, modelsSrc, modelExtra, absLabel, absGear, sum: calls.reduce((a, c) => a + (c.ms || 0), 0) };
  }
  const hms = (sec) => { if (sec == null) return '–'; const x = Math.floor(sec), h = Math.floor(x / 3600), m = Math.floor(x % 3600 / 60), s = x % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`; };
  const dur = (ms) => ms == null ? '–' : SUB && ms === 0 ? '<1s' : SUB && ms < 10000 ? Math.round(ms / 1000) + 's' : ms < 10000 ? (ms / 1000).toFixed(1) + 's' : ms < 60000 ? Math.round(ms / 1000) + 's' : hms(ms / 1000);
  const modelLabel = (m) => m ? String(m).replace(/^claude-/, '').replace(/-(\d+)-(\d+)$/, ' $1.$2').replace(/-(\d+)$/, ' $1') : '–';
  const gearOf = (m) => String(m).replace(/^claude-/, '').charAt(0).toUpperCase() || '?';
  return { isNum, f, clamp, heat, glow, esc, T, L, line, frame, stopwatch, hs, lamp, tools, hms, dur, modelLabel, gearOf };
})();

function rlCallRows(R, t, x0, y0, w, step, rows, o) {
  let s = '';
  const recent = t.calls.slice(-rows).reverse();
  if (!recent.length) return R.T(x0 + 9, y0, '–', { c: 'var(--aihud-faint)' });
  recent.forEach((c, i) => {
    const y = y0 + i * step, known = c.ms != null, sec = known ? c.ms / 1000 : 0, col = known ? R.heat(R.hs(sec)) : 'var(--aihud-faint)', hot = known && sec >= 45, cy = y - 3.2;
    s += `<circle cx="${x0 + 4}" cy="${R.f(cy)}" r="1.8" style="fill:${col};${hot ? R.glow(col) : ''}"/>`;
    s += R.T(x0 + 9, y, R.esc(c.name.length > o.nameN ? c.name.slice(0, o.nameN - 1) + '.' : c.name), { fs: o.fs, c: i === 0 ? 'var(--aihud-text)' : 'var(--aihud-dim)', f: 'turn.turns[].tool_calls[].tool' });
    const bx = o.barX, bw = o.barW, sx = (k) => bx + bw * Math.min(k, 60) / 60;
    s += R.line(bx, cy, sx(45), cy, 'var(--aihud-line)', 1.6);
    s += R.line(sx(45), cy, bx + bw, cy, R.heat(88), 1.6, 'opacity:var(--aihud-heat-rest)');
    if (known) s += R.line(bx, cy, sx(Math.max(sec, 0.8)), cy, col, 1.6);
    s += R.T(x0 + w - 4, y, known ? R.dur(c.ms) : '–', { fs: o.fs, f: known ? 'turn.turns[].tool_calls[].duration_s' : null, a: 'end', c: hot ? R.heat(R.hs(sec), 1) : i === 0 ? 'var(--aihud-text)' : 'var(--aihud-dim)' });
  });
  return s;
}
function rlGear(R, t, x, y, gap, fs) {
  if (!t.models.length) return R.T(x, y, '–', { c: t.absGear ? 'var(--aihud-absent)' : 'var(--aihud-faint)', f: t.absGear, ...(t.absGear ? { fs: 14, w: 650 } : {}) });
  let s = '';
  t.models.slice(0, 4).forEach((m, i) => {
    const on = m === t.model, gx = x + i * gap;
    if (on) s += `<rect x="${R.f(gx - fs * 0.5)}" y="${R.f(y - fs * 0.86)}" width="${R.f(fs)}" height="${R.f(fs * 1.2)}" rx="1.4" style="fill:none;stroke:var(--aihud-main);stroke-width:.7"/>`;
    s += R.T(gx, y, R.esc(R.gearOf(m)), { fs, f: t.modelExtra && m === t.model ? t.modelSrc : (t.modelsSrc || t.modelSrc), a: 'middle', w: on ? 600 : 400, c: on ? 'var(--aihud-text)' : 'var(--aihud-faint)', st: on ? R.glow('var(--aihud-text)') : '' });
  });
  return s;
}
function rlLamps(R, t, pos, size) {
  let s = '';
  pos.forEach(([x, y], i) => {
    const fam = t.fams[i];
    if (!fam) { s += R.lamp(null, x, y, 'var(--aihud-faint)', { size, op: 0.35 }); return; }
    const col = R.heat(R.hs(fam.max / 1000)), hot = fam.max >= 45000;
    s += R.lamp(fam.name, x, y, col, { size, lit: hot, op: hot ? 1 : 0.9 });
  });
  return s;
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

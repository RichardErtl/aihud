// Cellwork · tools live · portrait (8 × 7): calls from turn.turns[].tool_calls.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tools-cellwork-portrait',
  contentBlock: 'tools',
  style: 'cellwork',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 7 }],
  contractVersion: '1.1',
};

// aihud:whole-seconds v1
const wholeSeconds = (d) => !!(d && Array.isArray(d.caveats) && d.caveats.some((c) => typeof c === 'string' && c.includes('_second_resolution')));
let SUB = false; // whole-second resolution: a 0 is "under 1 s" (tools draw it as <1s)

export function render(el, data, size) {
  SUB = wholeSeconds(data);
  const d = data || {}, g = new Cells(size.cols, size.rows), W = g.c, H = g.r, R = W - 2;
  const calls = callsOf(d), lanes = lanesOf(calls), total = callsTotal(d), model = shortModel(d.session && d.session.model), absModel = !model && notRecorded(d, 'session', 'model');
  const live = stateOf(d) === 'awake';
  g.box(K.frame, {
    tl: [[' tools ', K.dim]],
    tr: total != null ? [[' ' + total, K.dim, { field: 'turn.turns[].tool_stats[].count' }], ['×', K.faint]] : null,
    bl: [[' ', K.faint], ['◆', live ? K.s1 : K.sub, { glow: live }], [' ' + fit(model || '–', R - 5) + ' ', model ? K.main : absModel ? K.absent : K.faint, model || absModel ? { field: 'session.model' } : undefined]],
  });
  const list = calls.slice(-(H - 3)).reverse();
  if (!list.length) g.text(2, 1, '–', { fg: K.faint });
  list.forEach((c, n) => {
    const y = 1 + n, fg = LANE[lanes.of(c.name)];
    g.text(1, y, fit(c.name, 5), { fg: n ? K.dim : K.text, field: 'turn.turns[].tool_calls[].tool' });
    lbar(g, 7, y, 3, logf(c.ms), fg);
    g.rtext(R, y, fmtDur(c.ms), { fg: n ? K.faint : K.main, field: 'turn.turns[].tool_calls[].duration_s' });
  });
  // braille rhythm: one dot column per call (newest right), height = log duration, colour = tool lane
  const cols = R * 2, recent = calls.slice(-cols), lit = [], off = cols - recent.length;
  recent.forEach((c, n) => { const h = Math.max(1, Math.ceil(logf(c.ms) * 4)); for (let k = 0; k < h; k++) lit.push({ X: off + n, Y: 3 - k, fg: LANE[lanes.of(c.name)] }); });
  dots(g, 1, H - 2, R, 1, lit, 'turn.turns[].tool_calls[].duration_s');
  paint(el, g, size);
}

// ── Cellwork kit (cells buffer -> DOM; copied in so the tile stands alone) ──
const V = (n) => 'var(--aihud-' + n + ')';
const K = {
  text: V('text'), dim: V('dim'), faint: V('faint'), absent: V('absent'), main: V('main'), sub: V('sub'), bg: V('bg'),
  s1: V('series-1'), s2: V('series-2'), s3: V('series-3'), ghost: V('line'),
  frame: 'color-mix(in srgb, var(--aihud-faint) 70%, var(--aihud-line))',
};
const LANE = [K.s1, K.s2, K.s3, K.sub];
const ARROW = '';
class Cells {
  constructor(cols, rows) {
    this.c = cols * 2; this.r = rows;
    this.g = Array.from({ length: rows }, () => Array.from({ length: this.c }, () => ({ ch: ' ' })));
  }
  set(x, y, ch, st) { if (x < 0 || y < 0 || x >= this.c || y >= this.r) return; this.g[y][x] = Object.assign({ ch }, st || {}); }
  at(x, y) { return this.g[y] && this.g[y][x]; }
  text(x, y, s, st) { for (const ch of [...s]) this.set(x++, y, ch, st); return x; }
  rtext(xe, y, s, st) { return this.text(xe - [...s].length + 1, y, s, st); }
  segs(x, y, a) { for (const [s, fg, ex] of a) x = this.text(x, y, s, Object.assign({ fg }, ex || {})); return x; }
  box(fg, L) {
    const c = this.c, r = this.r; L = L || {};
    for (let x = 1; x < c - 1; x++) { this.set(x, 0, '─', { fg }); this.set(x, r - 1, '─', { fg }); }
    for (let y = 1; y < r - 1; y++) { this.set(0, y, '│', { fg }); this.set(c - 1, y, '│', { fg }); }
    this.set(0, 0, '╭', { fg }); this.set(c - 1, 0, '╮', { fg }); this.set(0, r - 1, '╰', { fg }); this.set(c - 1, r - 1, '╯', { fg });
    for (const [l, rr, y] of [[L.tl, L.tr, 0], [L.bl, L.br, r - 1]]) {
      const le = l ? this.segs(2, y, l) : 1;                       // first cell after the left label
      if (rr) { const x0 = c - 2 - seglen(rr); if (x0 >= le) this.segs(x0, y, rr); }   // skip a right label that would overlap
    }
  }
}
const seglen = (a) => a.reduce((n, s) => n + [...s[0]].length, 0);
const fit = (s, n) => ([...s].length <= n ? s : [...s].slice(0, Math.max(1, n - 1)).join('') + '…');
const hblock = (e) => (e >= 8 ? '█' : e > 0 ? String.fromCodePoint(0x2590 - e) : ' ');  // left eighths
const ARMS = { '─': 'lr', '│': 'ud', '┴': 'lru', '┬': 'lrd' };
const BLK = { '█': [0, 0, 1, 1] };
for (let e = 1; e <= 7; e++) { BLK[String.fromCodePoint(0x2580 + e)] = [0, 1 - e / 8, 1, 1]; BLK[String.fromCodePoint(0x2590 - e)] = [0, 0, e / 8, 1]; }

/** Cells -> DOM, exactly cols*unit x rows*unit; returns the root */
function paint(el, g, size) {
  const u = size.unit, cw = u / 2, k = u / 20, t = Math.max(1, Math.round(k)), mx = (cw - t) / 2, my = (u - t) / 2;
  const doc = el.ownerDocument, root = doc.createElement('div');
  root.style.cssText = 'position:relative;display:grid;overflow:hidden;'
    + 'grid-template-columns:repeat(' + g.c + ',' + cw + 'px);grid-template-rows:repeat(' + g.r + ',' + u + 'px);'
    + 'width:' + g.c * cw + 'px;height:' + g.r * u + 'px;background:var(--aihud-bg);color:var(--aihud-text);'
    + 'font:' + (u * 0.65).toFixed(2) + 'px/' + u + 'px var(--aihud-font-mono);font-variant-numeric:tabular-nums';
  const m = { u, cw, k, t, mx, my };
  for (const row of g.g) for (const cell of row) {
    const d = doc.createElement('div');
    d.style.cssText = 'position:relative;text-align:center;white-space:pre;overflow:hidden';
    cellDraw(d, cell, m);
    if (cell.field) d.setAttribute('data-field', cell.field);
    root.appendChild(d);
  }
  el.replaceChildren(root);
  return root;
}
function cellDraw(d, cell, m) {
  const { u, cw, k, t, mx, my } = m, ch = cell.ch, fg = cell.fg || K.text;
  const px = (v) => v + 'px', glow = (c) => (cell.glow ? '0 0 var(--aihud-glow) ' + c : 'none');
  const add = (css) => { const i = d.ownerDocument.createElement('i'); i.style.cssText = 'position:absolute;display:block'; Object.assign(i.style, css); d.appendChild(i); return i; };
  const hline = (c) => { add({ left: 0, right: 0, top: px(my), height: px(t), background: c }); };
  if (cell.bg) d.style.background = cell.bg;
  if (cell.clk != null) d.dataset.clk = cell.clk;
  if (ARMS[ch]) {
    const a = ARMS[ch];
    if (a.includes('l')) add({ left: 0, top: px(my), width: px(mx + t), height: px(t), background: fg });
    if (a.includes('r')) add({ left: px(mx), top: px(my), right: 0, height: px(t), background: fg });
    if (a.includes('u')) add({ left: px(mx), top: 0, width: px(t), height: px(my + t), background: fg });
    if (a.includes('d')) add({ left: px(mx), top: px(my), width: px(t), bottom: 0, background: fg });
    return;
  }
  const bd = t + 'px solid ' + fg, rad = px(cw * 0.9);
  if (ch === '╭') return void add({ left: px(mx), top: px(my), right: 0, bottom: 0, borderLeft: bd, borderTop: bd, borderTopLeftRadius: rad });
  if (ch === '╮') return void add({ left: 0, top: px(my), right: px(mx), bottom: 0, borderRight: bd, borderTop: bd, borderTopRightRadius: rad });
  if (ch === '╰') return void add({ left: px(mx), top: 0, right: 0, bottom: px(my), borderLeft: bd, borderBottom: bd, borderBottomLeftRadius: rad });
  if (ch === '╯') return void add({ left: 0, top: 0, right: px(mx), bottom: px(my), borderRight: bd, borderBottom: bd, borderBottomRightRadius: rad });
  if (ch === ARROW) return void add({ left: 0, top: 0, width: px(cw), height: px(u), background: fg, clipPath: 'polygon(0 0,100% 50%,0 100%)' });
  if (ch === '◆') {                                   // diamond: skill / model mark, optionally sitting on a border line
    if (cell.line) hline(cell.line);
    const s = u * 0.3;
    return void add({ left: px((cw - s) / 2), top: px((u - s) / 2), width: px(s), height: px(s), background: fg, transform: 'rotate(45deg)', boxShadow: glow(fg) });
  }
  if (ch === '●' || ch === '○') {
    const s = u * 0.34, on = ch === '●';
    return void add({ left: px((cw - s) / 2), top: px((u - s) / 2), width: px(s), height: px(s), borderRadius: '50%', boxSizing: 'border-box',
      background: on ? fg : 'transparent', border: on ? 'none' : t + 'px solid ' + fg, boxShadow: on ? glow(fg) : 'none' });
  }
  if (BLK[ch] || cell.seg) {                          // LED segment: gap between cells, vertical band, unlit track
    const gap = cell.seg ? k * 1.2 : 0, b = cell.band || [0, 1], H = (b[1] - b[0]) * u, T = b[0] * u, W = cw - gap;
    const rect = (x0, y0, x1, y1, bg, sh) => add({ left: px(gap / 2 + x0 * W), top: px(T + y0 * H), width: px((x1 - x0) * W), height: px((y1 - y0) * H),
      background: bg, boxShadow: sh, borderRadius: px(cell.seg ? 0.8 * k : 0) });
    if (cell.ghost) rect(0, 0, 1, 1, cell.ghost, 'none');
    if (BLK[ch]) { const [x0, y0, x1, y1] = BLK[ch]; rect(x0, y0, x1, y1, fg, glow(fg)); }
    return;
  }
  if (cell.dots) {                                    // braille: 2 x 4 dots, each lit dot with its own colour
    const s = 2.3 * k, lit = new Map(cell.dots.map(([x, y, c]) => [x + ',' + y, c]));
    for (const [cx, cy] of BR) {
      const c = lit.get(cx + ',' + cy); if (!c && !cell.ghost) continue;
      add({ left: px(cw * (0.27 + 0.46 * cx) - s / 2), top: px(u * (0.125 + 0.25 * cy) - s / 2), width: px(s), height: px(s),
        borderRadius: '50%', background: c || cell.ghost, boxShadow: c && cell.glow ? glow(c) : 'none' });
    }
    return;
  }
  d.textContent = ch; d.style.color = fg;
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const tms = (s) => { const v = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(v) ? v : null; };
const turnsOf = (d) => (d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((x) => x && typeof x === 'object') : []);
const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0] && typeof d.live.instances[0] === 'object' ? d.live.instances[0] : null);
/** horizontal LED bar: frac 0..1 (null = track only); every cell a segment with its unlit track */
function lbar(g, x0, y, w, frac, fg, band) {
  const fill = frac == null ? 0 : Math.max(frac > 0 ? 1 / 8 : 0, Math.min(1, frac)) * w;
  for (let i = 0; i < w; i++) {
    let ch = ' ';
    if (i < Math.floor(fill)) ch = '█'; else if (i === Math.floor(fill)) ch = hblock(Math.round((fill - i) * 8));
    g.set(x0 + i, y, ch, { fg, seg: true, band: band || [0.34, 0.66], ghost: K.ghost });
  }
}
/** braille field from a list of lit dots {X, Y, fg} in dot coordinates (2 x 4 per cell) */
const BR = [[0, 0, 1], [0, 1, 2], [0, 2, 4], [1, 0, 8], [1, 1, 16], [1, 2, 32], [0, 3, 64], [1, 3, 128]];
function dots(g, x0, y0, w, h, lit, field) {
  const cells = Array.from({ length: h }, () => Array.from({ length: w }, () => []));
  for (const p of lit) {
    const cx = p.X >> 1, cy = p.Y >> 2; if (cx < 0 || cy < 0 || cx >= w || cy >= h) continue;
    cells[cy][cx].push([p.X & 1, p.Y & 3, p.fg]);
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.set(x0 + x, y0 + y, '⠀', { dots: cells[y][x], ghost: K.ghost, field: cells[y][x].length ? field : undefined });
}
const pad2 = (n) => String(n).padStart(2, '0');
const fmtDur = (ms) => {
  if (!isNum(ms)) return '–';
  if (SUB && ms === 0) return '<1s';
  const s = ms / 1000;
  if (SUB && s < 10) return Math.round(s) + 's';
  if (s < 10) return s.toFixed(1) + 's';
  if (s < 59.5) return Math.round(s) + 's';
  if (s < 3599.5) { const r = Math.round(s); return Math.floor(r / 60) + ':' + pad2(r % 60); }
  return Math.floor(s / 3600) + 'h' + pad2(Math.floor((s % 3600) / 60));
};
const shortModel = (m) => (typeof m === 'string' && m ? m.replace(/^claude-/, '') : null);
/** tool calls of the main agent (contract field turn.turns[].tool_calls, flattened over the turns), oldest first */
function callsOf(d) {
  const a = [];
  for (const t of turnsOf(d)) for (const c of (Array.isArray(t.tool_calls) ? t.tool_calls : [])) a.push(c);
  return a.filter((c) => c && typeof c.tool === 'string' && c.tool && tms(c.started_at) != null && isNum(c.duration_s))
    .map((c) => ({ name: c.tool, at: tms(c.started_at), ms: c.duration_s * 1000 })).sort((x, y) => x.at - y.at);
}
function callsTotal(d) {
  let n = 0, seen = false;
  for (const t of turnsOf(d)) for (const s of (Array.isArray(t.tool_stats) ? t.tool_stats : [])) if (s && isNum(s.count)) { n += s.count; seen = true; }
  return seen ? n : null;
}
/** tool lanes: the three most called tools get series 1-3, everything else lane 4 */
function lanesOf(calls) {
  const n = new Map(); for (const c of calls) n.set(c.name, (n.get(c.name) || 0) + 1);
  const top = [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map((e) => e[0]);
  return { top, of: (name) => { const i = top.indexOf(name); return i < 0 ? 3 : i; } };
}
const logf = (ms) => Math.min(1, Math.log(1 + ms / 1000) / Math.log(301));   // 5 minutes = full bar
function stateOf(d) { const i = inst(d); return i && typeof i.state === 'string' && i.state ? i.state : null; }

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

// Cellwork · header (extended) · portrait (8 × 3).
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'header-cellwork-portrait',
  contentBlock: 'header',
  style: 'cellwork',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 3 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const d = data || {}, g = new Cells(size.cols, size.rows), W = g.c;
  const id = idOf(d), state = stateOf(d), seg = state === 'awake' ? K.s1 : id ? K.dim : K.faint, sk = lastSkill(d), skA = !sk && notRecorded(d, 'turn', 'skills'), sp = spanOf(d);
  g.text(0, 0, fit(' ' + (id ? id.slice(0, 8) : '–'), 9).padEnd(9, ' '), { fg: K.bg, bg: seg, field: id ? 'session.id' : undefined });
  g.set(9, 0, ARROW, { fg: seg });
  if (id) [...hhmm(Date.now())].forEach((c, n) => g.set(W - 5 + n, 0, c, { fg: K.dim, clk: n }));
  g.segs(0, 1, [['/', K.faint], [sk ? fit(sk, W - 1) : '–', sk ? K.text : skA ? V('absent') : K.faint, sk || skA ? { field: 'turn.turns[].skills[].name' } : undefined]]);
  const tn = turnLane(g, 0, 2, 6, d);
  g.segs(7, 2, [['t', K.faint], [tn != null ? String(tn) : '–', tn != null ? K.text : K.faint, tn != null ? { field: 'turn.turns[].number' } : undefined]]);
  g.rtext(W - 1, 2, sp ? fmtHM(sp.b - sp.a) : '–', { fg: sp ? K.main : K.faint, field: sp ? sp.f : undefined });
  const root = paint(el, g, size);
  if (id) clockTick(el, root);
  if (d.hud && Array.isArray(d.hud.sessions)) sessionSwitch(el, root, d.hud, size, 9, d);
}

// ── Cellwork kit (cells buffer -> DOM; copied in so the tile stands alone) ──
const V = (n) => 'var(--aihud-' + n + ')';
const K = {
  text: V('text'), dim: V('dim'), faint: V('faint'), main: V('main'), sub: V('sub'), bg: V('bg'),
  s1: V('series-1'), s2: V('series-2'), s3: V('series-3'), ghost: V('line'),
  frame: 'color-mix(in srgb, var(--aihud-faint) 70%, var(--aihud-line))',
};
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
const vblock = (e) => (e >= 8 ? '█' : String.fromCodePoint(0x2580 + Math.max(1, e)));   // lower eighths
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
  if (cell.field) d.setAttribute('data-field', cell.field);   // value mark (CONTRACT.md "Value marks")
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
function spanOf(d) {
  const a = tms(d && d.session && d.session.started_at), i = inst(d);
  let b = tms(i && i.last_activity);
  const via = b != null ? 'live.instances[].last_activity' : 'turn.turns[].started_at turn.turns[].duration_s';
  if (b == null) for (const t of turnsOf(d)) { const s = tms(t.started_at); if (s != null) b = Math.max(b || 0, s + (isNum(t.duration_s) ? t.duration_s * 1000 : 0)); }
  return a != null && b != null && b > a ? { a, b, f: 'session.started_at ' + via } : null;
}
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (ms) => { const x = new Date(ms); return pad2(x.getHours()) + ':' + pad2(x.getMinutes()); };
const fmtHM = (ms) => { if (!isNum(ms) || ms < 0) return '–'; const m = Math.round(ms / 60000); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + pad2(m % 60); };
/** skills grouped by name, plus every start in time order */
function skillData(d) {
  const by = new Map(), starts = [];
  for (const t of turnsOf(d)) for (const s of (Array.isArray(t.skills) ? t.skills : [])) {
    if (!s || typeof s.name !== 'string' || !s.name) continue;
    const e = by.get(s.name) || { name: s.name, count: 0, tokens: 0, last: null, turn: null };
    e.count++;
    e.tokens = e.tokens != null && isNum(s.tokens_in) && isNum(s.tokens_out) ? e.tokens + s.tokens_in + s.tokens_out : null;
    const at = tms(s.time);
    if (at != null && (e.last == null || at >= e.last)) { e.last = at; e.turn = isNum(t.number) ? t.number : null; }
    if (at != null) starts.push({ name: s.name, at });
    by.set(s.name, e);
  }
  const list = [...by.values()].sort((a, b) => b.count - a.count || (b.tokens || 0) - (a.tokens || 0) || a.name.localeCompare(b.name));
  return { list, starts: starts.sort((a, b) => a.at - b.at) };
}
function stateOf(d) { const i = inst(d); return i && typeof i.state === 'string' && i.state ? i.state : null; }
function idOf(d) { return d && d.session && typeof d.session.id === 'string' && d.session.id ? d.session.id : null; }
function lastSkill(d) { const s = skillData(d).starts; return s.length ? s[s.length - 1].name : null; }
/** one LED cell per turn, height = runtime against the longest shown turn, missing runtime = unlit */
function turnLane(g, x0, y, w, d) {
  const turns = turnsOf(d).filter((t) => isNum(t.number)).sort((a, b) => a.number - b.number).slice(-w);
  const max = Math.max(0, ...turns.map((t) => (isNum(t.duration_s) ? t.duration_s : 0)));
  const off = w - turns.length;
  for (let i = 0; i < w; i++) {
    const t = turns[i - off];
    const e = t && isNum(t.duration_s) && max > 0 ? Math.max(1, Math.round(t.duration_s / max * 8)) : 0;
    const last = t && i === w - 1;
    g.set(x0 + i, y, e ? vblock(e) : ' ', { fg: last ? K.main : K.sub, field: e ? 'turn.turns[].duration_s' : undefined, seg: true, band: [0.16, 0.84], ghost: K.ghost, glow: last });
  }
  return turns.length ? turns[turns.length - 1].number : null;
}
/** the viewer's clock keeps ticking between redraws (one timer per tile element) */
function clockTick(el, root) {
  if (el._cwClock) clearInterval(el._cwClock);
  const t = setInterval(() => {
    if (!root.isConnected) return clearInterval(t);
    const s = hhmm(Date.now());
    root.querySelectorAll('[data-clk]').forEach((c) => { c.textContent = s[+c.dataset.clk] || ''; });
  }, 10000);
  el._cwClock = t;
}
/** session switch (data.hud): a transparent button over the id segment, a plain list as popover */
function sessionSwitch(el, root, hud, size, cells, hudData) {
  const doc = el.ownerDocument, z = size.unit / 20;
  const btn = doc.createElement('button');
  btn.style.cssText = 'position:absolute;left:0;top:0;width:' + cells * size.unit / 2 + 'px;height:' + size.unit + 'px;padding:0;margin:0;border:0;background:none;cursor:pointer';
  btn.setAttribute('aria-label', 'switch session'); btn.setAttribute('aria-haspopup', 'listbox');
  if (idOf(hudData)) btn.setAttribute('data-field', 'session.id');
  const list = doc.createElement('div');
  list.setAttribute('role', 'listbox');
  list.style.cssText = 'position:fixed;inset:auto;margin:0;padding:' + 4 * z + 'px 0;min-width:' + 180 * z + 'px;max-width:' + 300 * z + 'px;overflow:auto;'
    + 'background:var(--aihud-bg);color:var(--aihud-text);border:' + Math.max(1, Math.round(z)) + 'px solid var(--aihud-faint);border-radius:var(--aihud-radius-small);'
    + 'font:' + 13 * z + 'px/' + 20 * z + 'px var(--aihud-font-mono)';
  const pick = (id) => { try { list.hidePopover(); } catch (e) { list.style.display = 'none'; } el.dispatchEvent(new CustomEvent('aihud:select-session', { bubbles: true, detail: { session_id: id } })); };
  const entry = (id, strong, label, right) => {
    const b = doc.createElement('button');
    b.style.cssText = 'display:flex;gap:' + 10 * z + 'px;width:100%;padding:0 ' + 10 * z + 'px;margin:0;border:0;background:none;font:inherit;text-align:left;cursor:pointer;color:var(' + (strong ? '--aihud-text' : '--aihud-dim') + ')';
    b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(strong));
    const a = doc.createElement('span'); a.textContent = (strong ? '▌' : ' ') + label; a.style.flex = '1';
    const r = doc.createElement('span'); r.textContent = right || ''; r.style.color = 'var(--aihud-faint)';
    b.append(a, r); b.addEventListener('click', (ev) => { ev.stopPropagation(); pick(id); });
    return b;
  };
  list.append(entry(null, !hud.pinned, 'follow newest', ''));
  for (const s of hud.sessions) {
    if (!s || typeof s.session_id !== 'string') continue;
    const age = isNum(s.age_seconds) && s.age_seconds >= 0 ? (s.age_seconds < 86400 ? hhmm(Date.now() - s.age_seconds * 1000) : Math.floor(s.age_seconds / 86400) + 'd') : '–';
    list.append(entry(s.session_id, s.session_id === hud.current, s.session_id.slice(0, 8), age));
  }
  const place = () => { const r = btn.getBoundingClientRect(); list.style.left = Math.max(0, r.left) + 'px'; list.style.top = (r.bottom + 2 * z) + 'px'; };
  if (typeof list.showPopover === 'function') {
    list.setAttribute('popover', 'auto'); btn.popoverTargetElement = list; btn.popoverTargetAction = 'toggle';
    list.addEventListener('beforetoggle', (ev) => { if (ev.newState === 'open') place(); });
  } else { list.style.display = 'none'; btn.addEventListener('click', () => { place(); list.style.display = list.style.display === 'none' ? 'block' : 'none'; }); }
  root.append(btn); el.append(list);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

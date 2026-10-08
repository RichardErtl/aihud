// Calibre · top-three-subagents-calibre-portrait
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = {
  name: 'top-three-subagents-calibre-portrait',
  contentBlock: 'top-three-subagents',
  style: 'calibre',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 4 }],
  contractVersion: '1.1',
};

const NS = 'http://www.w3.org/2000/svg';

const f = (n) => Math.round(n * 100) / 100;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);


const DASH = '–';


// heat: CONTRACT.md Heat - color-mix of the two neighbouring stops
const HS = [0, 30, 50, 75, 100];

function heat(v, txt) {
  const x = Math.max(0, Math.min(100, v)); let i = 1;
  while (i < HS.length - 1 && x > HS[i]) i++;
  const p = ((HS[i] - x) / (HS[i] - HS[i - 1])) * 100, k = txt ? 'heat-text-' : 'heat-';
  return 'color-mix(in srgb, var(--aihud-' + k + HS[i - 1] + ') ' + p.toFixed(1) + '%, var(--aihud-' + k + HS[i] + '))';
}

const glow = (c, tip) => 'filter:drop-shadow(0 0 ' + (tip ? 'calc(var(--aihud-glow) * 5 / 3)' : 'var(--aihud-glow)') + ' ' + c + ')';


function E(doc, tag, a, txt) {
  const n = doc.createElementNS(NS, tag);
  for (const k in a) if (a[k] != null) n.setAttribute(k, String(a[k]));
  if (txt != null) n.textContent = txt;
  return n;
}

// angles: degrees clockwise from 12 o'clock
function P(cx, cy, r, a) { const t = a * Math.PI / 180; return [cx + r * Math.sin(t), cy - r * Math.cos(t)]; }

function arcD(cx, cy, r, a0, a1) {
  if (a1 - a0 >= 359.9) { const [x0, y0] = P(cx, cy, r, 0), [x1, y1] = P(cx, cy, r, 180);
    return 'M' + f(x0) + ' ' + f(y0) + 'A' + r + ' ' + r + ' 0 1 1 ' + f(x1) + ' ' + f(y1) + 'A' + r + ' ' + r + ' 0 1 1 ' + f(x0) + ' ' + f(y0); }
  const [x0, y0] = P(cx, cy, r, a0), [x1, y1] = P(cx, cy, r, a1);
  return 'M' + f(x0) + ' ' + f(y0) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + f(x1) + ' ' + f(y1);
}


/** The tile box at its exact pixel size; inside one SVG drawn at 20 px per unit (viewBox), scaled to the unit. */
function stage(el, size) {
  const doc = el.ownerDocument, W = size.cols * 20, H = size.rows * 20;
  const box = doc.createElement('div');
  box.style.cssText = 'width:' + size.cols * size.unit + 'px;height:' + size.rows * size.unit + 'px;overflow:hidden;'
    + 'background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)';
  const svg = E(doc, 'svg', { viewBox: '0 0 ' + W + ' ' + H, width: size.cols * size.unit, height: size.rows * size.unit,
    style: 'display:block;font-family:var(--aihud-font);font-variant-numeric:tabular-nums' });
  const defs = E(doc, 'defs', {});
  svg.append(defs); box.append(svg); el.replaceChildren(box);
  const g = { doc, svg, defs, W, H, at: svg };
  g.add = (tag, a, txt) => { const n = E(doc, tag, a, txt); g.at.append(n); return n; };
  g.group = (style) => { const n = E(doc, 'g', { style }); g.at.append(n); return n; };
  return g;
}

function text(g, x, y, str, sz, color, o) {
  o = o || {};
  const st = 'fill:' + color + ';font-size:' + sz + 'px;' + (o.w ? 'font-weight:' + o.w + ';' : '')
    + (o.ls ? 'letter-spacing:' + o.ls + 'px;' : '') + (o.mono ? 'font-family:var(--aihud-font-mono);' : '');
  const e = g.add('text', { x: f(x), y: f(y), 'text-anchor': o.a || 'start', style: st }, str);
  if (o.f) e.setAttribute('data-field', o.f);
  return e;
}

function tspan(g, parent, str, sz, color, extra) {
  const n = E(g.doc, 'tspan', { style: 'font-size:' + sz + 'px;' + (color ? 'fill:' + color + ';' : '') + (extra || '') }, str);
  parent.append(n); return n;
}

function radial(g, cx, cy, r0, r1, a, style) {
  const [x0, y0] = P(cx, cy, r0, a), [x1, y1] = P(cx, cy, r1, a);
  return g.add('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), style });
}

function pip(g, x, y, r, c) { g.add('circle', { cx: f(x), cy: f(y), r: f(r), style: 'fill:' + c + ';stroke:var(--aihud-panel);stroke-width:.5;' + glow(c, true) }); }


/* ---------------- data readers (contract fields; null when missing) ---------------- */
const inst = (d) => d && d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;

function tok(n) {
  if (n >= 9.995e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 999500) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

const fit = (s, n) => s.length > n ? s.slice(0, n - 1) + '…' : s;


function heavy(d) {
  d = d || {};
  const nodes = d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null), i = inst(d);
  const total = root && isNum(root.tokens_total) ? root.tokens_total : i && isNum(i.tokens_total) ? i.tokens_total : null;
  const totalPath = root && isNum(root.tokens_total) ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const subs = total > 0 ? nodes.filter((n) => n.parent_id != null && isNum(n.tokens_self) && n.tokens_self > 0).sort((a, b) => b.tokens_self - a.tokens_self) : [];
  const top = subs.slice(0, 3).map((n) => ({ name: typeof n.agent_type === 'string' && n.agent_type ? n.agent_type : DASH,
    pct: (n.tokens_self / total) * 100, pctF: 'agents.nodes[].tokens_self ' + totalPath, tokF: 'agents.nodes[].tokens_self', nameF: typeof n.agent_type === 'string' && n.agent_type ? 'agents.nodes[].agent_type' : null, tok: n.tokens_self, turn: isNum(n.started_in_turn) ? n.started_in_turn : null }));
  while (top.length < 3) top.push(null);
  const nTurns = d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.length : 0;
  const turns = Math.max(nTurns, ...top.map((x) => (x && x.turn) || 0));
  const subPct = total > 0 ? (subs.reduce((s, n) => s + n.tokens_self, 0) / total) * 100 : null;
  return { top, total, totalPath, subPct, count: d.agents && Number.isInteger(d.agents.subagents_started) && d.agents.subagents_started >= 0 ? d.agents.subagents_started : null, turns, subAbs: !(d.agents && Number.isInteger(d.agents.subagents_started)) && notRecorded(d, 'agents', 'subagents'), tokAbs: total == null && notRecorded(d, 'live', 'tokens') }; // count read from the reader (agents.subagents_started), never counted here
}

/** a chronograph register: arc = share (heat, from 12), bezel ticks = turns (start turn lit), share inside */
function register(g, cx, cy, r, it, N, o) {
  g.add('circle', { cx, cy, r, style: 'fill:color-mix(in srgb, var(--aihud-bg) 60%, var(--aihud-panel));stroke:var(--aihud-line);stroke-width:.8' });
  for (let k = 0; k < N; k++) { const on = it && it.turn === k + 1;
    const tick = radial(g, cx, cy, on ? r - 3.4 : r - 2.4, r - 0.9, (360 * k) / N, 'stroke:var(' + (on ? '--aihud-text' : '--aihud-faint') + ');stroke-width:' + (on ? 1.5 : 0.7));
    if (on) tick.setAttribute('data-field', 'agents.nodes[].started_in_turn'); }
  const ar = r - 5.6, w = o.w;
  g.add('circle', { cx, cy, r: ar, style: 'fill:none;stroke:var(--aihud-line);stroke-width:' + w });
  if (it) {
    const v = Math.max(0.8, Math.min(99.9, it.pct)), c = heat(it.pct);
    g.add('path', { d: arcD(cx, cy, ar, 0, v * 3.6), style: 'fill:none;stroke:' + c + ';stroke-width:' + w + ';stroke-linecap:round;' + glow(c) });
    const [x, y] = P(cx, cy, ar, v * 3.6); pip(g, x, y, w * 0.62, c);
    const [wh, te] = it.pct.toFixed(1).split('.');
    const t = text(g, cx, cy + o.dy, '', o.big, heat(it.pct, true), { a: 'middle', w: 600 });
    t.setAttribute('data-field', it.pctF);
    tspan(g, t, wh, o.big); tspan(g, t, '.' + te + '%', 9);
    if (o.tokInside) text(g, cx, cy + o.dy + 11, tok(it.tok), 9, 'var(--aihud-dim)', { a: 'middle', mono: true, f: it.tokF });
  } else text(g, cx, cy + 4, DASH, 12, 'var(--aihud-faint)', { a: 'middle' });
}

function topThreePortrait(el, data, size) {
  const g = stage(el, size), H = heavy(data);
  const head = text(g, 4, 10, '', 9, 'var(--aihud-faint)', { ls: 0.7 });
  tspan(g, head, 'TOP 3 OF ', 9);
  const cn = tspan(g, head, H.count != null ? String(H.count) : DASH, 9, H.subAbs ? 'var(--aihud-absent)' : 'var(--aihud-dim)');
  if (H.count != null || H.subAbs) cn.setAttribute('data-field', 'agents.subagents_started');
  text(g, 156, 10, H.total != null ? tok(H.total) : DASH, 9, H.tokAbs ? 'var(--aihud-absent)' : 'var(--aihud-dim)', { a: 'end', mono: true, f: H.total != null || H.tokAbs ? H.totalPath : null });
  [27, 80, 133].forEach((x, i) => {
    const it = H.top[i];
    register(g, x, 37, 23, it, H.turns, { w: 3, big: 11, dy: 1, tokInside: true });
    text(g, x, 72, it ? fit(it.name, 10) : DASH, 9.5, it ? 'var(--aihud-dim)' : 'var(--aihud-faint)', { a: 'middle', f: it ? it.nameF : null });
  });
}

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
topThreePortrait(el, data, size);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

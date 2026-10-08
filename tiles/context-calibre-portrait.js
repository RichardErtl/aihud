// Calibre · context-calibre-portrait
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = {
  name: 'context-calibre-portrait',
  contentBlock: 'context',
  style: 'calibre',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 3 }],
  contractVersion: '1.1',
};

const NS = 'http://www.w3.org/2000/svg';

let UID = 0; const uid = (p) => meta.name + '-' + p + (++UID);

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

function inGroup(g, node, fn) { const prev = g.at; g.at = node; try { fn(); } finally { g.at = prev; } }

function text(g, x, y, str, sz, color, o) {
  o = o || {};
  const st = 'fill:' + color + ';font-size:' + sz + 'px;' + (o.w ? 'font-weight:' + o.w + ';' : '')
    + (o.ls ? 'letter-spacing:' + o.ls + 'px;' : '') + (o.mono ? 'font-family:var(--aihud-font-mono);' : '');
  return g.add('text', { x: f(x), y: f(y), 'text-anchor': o.a || 'start', style: st }, str);
}

function tspan(g, parent, str, sz, color, extra) {
  const n = E(g.doc, 'tspan', { style: 'font-size:' + sz + 'px;' + (color ? 'fill:' + color + ';' : '') + (extra || '') }, str);
  parent.append(n); return n;
}

function radial(g, cx, cy, r0, r1, a, style) {
  const [x0, y0] = P(cx, cy, r0, a), [x1, y1] = P(cx, cy, r1, a);
  return g.add('line', { x1: f(x0), y1: f(y0), x2: f(x1), y2: f(y1), style });
}

function face(g, cx, cy, r) {
  const id = uid('f'), gr = E(g.doc, 'radialGradient', { id, cx: '50%', cy: '36%', r: '68%' });
  gr.append(E(g.doc, 'stop', { offset: 0, style: 'stop-color:color-mix(in srgb, var(--aihud-text) 5%, var(--aihud-panel))' }),
    E(g.doc, 'stop', { offset: 1, style: 'stop-color:color-mix(in srgb, var(--aihud-bg) 75%, var(--aihud-panel))' }));
  g.defs.append(gr);
  g.add('circle', { cx: f(cx), cy: f(cy), r: f(r - 0.5), style: 'fill:url(#' + id + ');stroke:var(--aihud-line);stroke-width:1' });
}

function pip(g, x, y, r, c) { g.add('circle', { cx: f(x), cy: f(y), r: f(r), style: 'fill:' + c + ';stroke:var(--aihud-panel);stroke-width:.5;' + glow(c, true) }); }

/** continuous heat arc from 12: every percent drawn in the colour of its position, glowing */
function heatArc(g, cx, cy, r, w, pct) {
  const grp = g.group(glow(heat(pct)));
  inGroup(g, grp, () => {
    for (let i = 0; i < pct; i++) { const e = Math.min(i + 1.3, pct);
      g.add('path', { d: arcD(cx, cy, r, 3.6 * i, 3.6 * e), style: 'fill:none;stroke:' + heat(i + 0.5) + ';stroke-width:' + w }); }
  });
}


/* ---------------- data readers (contract fields; null when missing) ---------------- */
const inst = (d) => d && d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;

function ctxPct(d) {
  const i = inst(d); if (i && isNum(i.context_percent)) return i.context_percent;
  const pts = d && d.context && Array.isArray(d.context.points) ? d.context.points : [];
  const last = pts.length ? pts[pts.length - 1] : null;
  return last && isNum(last.percent) ? last.percent : null;
}

// the catalog path ctxPct / ctxWindow actually read (fallback = the second path)
const ctxPctPath = (d) => { const i = inst(d); return i && isNum(i.context_percent) ? 'live.instances[].context_percent' : 'context.points[].percent'; };
const ctxWindowPath = (d) => { const i = inst(d); return i && isNum(i.context_window) ? 'live.instances[].context_window' : 'windows.<key>.<key>'; };

function ctxWindow(d) {
  const i = inst(d); if (i && isNum(i.context_window)) return i.context_window;
  const s = d && d.session;
  return s && d.windows && d.windows[s.provider] && isNum(d.windows[s.provider][s.model]) ? d.windows[s.provider][s.model] : null;
}

const winLabel = (n) => n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : Math.round(n / 1000) + 'k';


function contextDial(g, cx, cy, R, w, pct) {
  face(g, cx, cy, R);
  for (let v = 0; v < 100; v += 2) { const major = v % 10 === 0;
    radial(g, cx, cy, major ? R - 5.5 : R - 3.6, R - 1.6, v * 3.6, 'stroke:var(' + (pct != null && v <= pct ? '--aihud-dim' : '--aihud-faint') + ');stroke-width:' + (major ? 0.9 : 0.5)); }
  for (const st of [30, 50, 75]) { const [x, y] = P(cx, cy, R - 8.5, st * 3.6); g.add('circle', { cx: f(x), cy: f(y), r: 1.1, style: 'fill:' + heat(st) }); }
  { const [x, y] = P(cx, cy, R - 8.5, 0); g.add('path', { d: 'M' + f(x - 1.7) + ' ' + f(y - 1.4) + 'L' + f(x + 1.7) + ' ' + f(y - 1.4) + 'L' + f(x) + ' ' + f(y + 1.5) + 'Z', style: 'fill:' + heat(100) }); }
  const ar = R - 13;
  g.add('circle', { cx, cy, r: ar, style: 'fill:none;stroke:var(--aihud-line);stroke-width:' + w });
  if (pct != null) { const v = Math.max(0, Math.min(100, pct)); if (v > 0) { heatArc(g, cx, cy, ar, w, v); const [x, y] = P(cx, cy, ar, v * 3.6); pip(g, x, y, w * 0.6, heat(v)); } }
  return ar;
}

function pctText(g, x, y, pct, big, small, anchor) {
  if (pct == null) return text(g, x, y, DASH, big, 'var(--aihud-faint)', { a: anchor, w: 300 });
  const t = text(g, x, y, '', big, heat(pct, true), { a: anchor, w: 300 });
  tspan(g, t, pct.toFixed(1), big); tspan(g, t, '%', small, null, 'font-weight:500');
  return t;
}

function contextPortrait(el, data, size) {
  const g = stage(el, size), pct = ctxPct(data), win = ctxWindow(data);
  contextDial(g, 30, 30, 28, 4.5, pct);
  text(g, 68, 14, 'CONTEXT', 9, 'var(--aihud-faint)', { ls: 1.2 });
  const pn = pctText(g, 66, 40, pct, 27, 12, 'start');
  if (pct != null) pn.setAttribute('data-field', ctxPctPath(data));
  const o = text(g, 68, 53, '', 9, 'var(--aihud-faint)', { ls: 0.6 });
  tspan(g, o, 'OF ', 9); const wn = tspan(g, o, win != null ? winLabel(win) : DASH, 9, 'var(--aihud-dim)', 'font-family:var(--aihud-font-mono)');
  if (win != null) wn.setAttribute('data-field', ctxWindowPath(data));
}

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  draw(el, data, size);
  if ((notRecorded(data, 'live', 'tokens') || notRecorded(data, 'live', 'window'))) absentOnly(el.firstElementChild, 'context', 'live.instances[].context_percent', size.unit / 20);
}

function draw(el, data, size) {
contextPortrait(el, data, size);
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

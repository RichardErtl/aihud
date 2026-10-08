// Backlight - context (portrait): the filament wedge.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'context-backlight-portrait',
  contentBlock: 'context',
  style: 'backlight',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 6 }],
  contractVersion: '1.1',
};

const STOPS = [0, 30, 50, 75, 100];

const FILL = STOPS.map((s) => 'var(--aihud-heat-' + s + ')');

const TEXT = STOPS.map((s) => 'var(--aihud-heat-text-' + s + ')');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const clamp = (v) => Math.max(0, Math.min(100, v));

/** CONTRACT.md heat function: straight srgb mix of the two neighbouring stops. */
function heat(v, ramp) {
  const r = ramp || FILL, x = clamp(v);
  let i = 1;
  while (i < STOPS.length - 1 && x > STOPS[i]) i++;
  const p = ((STOPS[i] - x) / (STOPS[i] - STOPS[i - 1])) * 100;
  return 'color-mix(in srgb, ' + r[i - 1] + ' ' + p.toFixed(1) + '%, ' + r[i] + ')';
}

const textHeat = (v) => heat(v, TEXT);

const fade = (c, pct) => 'color-mix(in srgb, ' + c + ' ' + pct.toFixed(1) + '%, transparent)';

/** The lit edge: above 55 % the deep stops sink into black - rim / core mixed toward the text colour. */
const hot = (v) => clamp(v) >= 55;

const edge = (v) => 'color-mix(in srgb, ' + heat(v) + ' ' + (80 - 40 * Math.max(0, (clamp(v) - 55) / 45)).toFixed(0) + '%, var(--aihud-text))';

/** Glow radius grows with the value; scaled off --aihud-glow (0px in light = no glow) and the zoom. */
const glow = (v, z, k) => 'calc(var(--aihud-glow) * ' + ((0.6 + 2.4 * clamp(v) / 100) * z * (k || 1)).toFixed(2) + ')';

function frame(el, size) {
  const u = size.unit, z = u / 20, doc = el.ownerDocument;
  const box = doc.createElement('div');
  box.style.cssText = 'position:relative;overflow:hidden;width:' + size.cols * u + 'px;height:' + size.rows * u + 'px;'
    + 'background:var(--aihud-bg);box-shadow:inset 0 0 0 1px var(--aihud-line-2);border-radius:var(--aihud-radius);'
    + 'font-family:var(--aihud-font);color:var(--aihud-text)';
  el.replaceChildren(box);
  return { box, u, z };
}

function add(box, css, text) {
  const n = box.ownerDocument.createElement('div');
  n.style.cssText = 'position:absolute;line-height:1;white-space:nowrap;' + css;
  if (text != null) n.textContent = text;
  box.append(n);
  return n;
}

function span(parent, css, text) {
  const n = parent.ownerDocument.createElement('span');
  n.style.cssText = css;
  n.textContent = text;
  parent.append(n);
  return n;
}

const pos = (o) => (o.right != null ? 'right:' + o.right + 'px;' : 'left:' + o.x + 'px;') + 'top:' + o.y + 'px;';

/** Caption: unlit, 10 px at unit 20. */
const label = (box, u, o, text) => add(box, pos(o) + 'font:500 ' + 0.5 * u + 'px var(--aihud-font);letter-spacing:.16em;color:var(--aihud-dim)', text);

/** Scale mark at a filament end. */
const mark = (box, u, o, text) => add(box, pos(o) + 'font:' + 0.5 * u + 'px var(--aihud-font-mono);color:var(--aihud-dim)', text);

/** A plain second value (unlit). */
const val = (box, u, o, size, text, has) => add(box, pos(o) + 'font:' + size + 'px var(--aihud-font-mono);font-variant-numeric:tabular-nums;color:var(--aihud-' + (has ? 'text' : 'faint') + ')', has ? text : '–');

function glowText(v, u, z) {
  const c = heat(v);
  let s = '0 0 ' + glow(v, z, 0.5) + ' ' + c + ', 0 0 ' + glow(v, z, 1.6) + ' ' + fade(c, 45);
  if (hot(v)) s = '0 0 ' + Math.max(0.6, 0.05 * u).toFixed(2) + 'px ' + edge(v) + ', ' + s;
  return s;
}

/** The one crisp number: thin weight, heat colour, glow growing with the value. */
function num(box, u, z, o) {
  const has = o.v != null;
  const n = add(box, pos(o) + (o.width != null ? 'width:' + o.width + 'px;text-align:center;' : '')
    + 'font:' + (o.weight || 300) + ' ' + o.size + 'px var(--aihud-font);letter-spacing:-.02em;font-variant-numeric:tabular-nums;'
    + 'color:' + (has ? textHeat(o.v) : 'var(--aihud-faint)') + ';' + (has ? 'text-shadow:' + glowText(o.v, u, z) : ''), has ? o.text : '–');
  if (has && o.unit) span(n, 'font-size:' + Math.max(0.45 * u, o.size * 0.4).toFixed(2) + 'px;opacity:.8;margin-left:.06em;letter-spacing:0', o.unit);
  return n;
}

/** Field: a halo behind the number, opacity = --aihud-glow-halo x value. */
function field(box, cx, cy, rx, ry, v) {
  const c = heat(v);
  add(box, 'left:0;top:0;width:100%;height:100%;pointer-events:none;'
    + 'background:radial-gradient(ellipse ' + rx.toFixed(1) + 'px ' + ry.toFixed(1) + 'px at ' + cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px, ' + c + ', ' + fade(c, 35) + ' 45%, transparent);'
    + 'opacity:calc(var(--aihud-glow-halo) * ' + (0.6 + 1.8 * clamp(v) / 100).toFixed(2) + ')');
}

/** Pulse: a bright point, white-hot core, coloured sheath, glow growing with the value. */
function pulse(box, cx, cy, r, v, z, a) {
  const c = heat(v);
  add(box, 'left:' + (cx - r).toFixed(2) + 'px;top:' + (cy - r).toFixed(2) + 'px;width:' + (2 * r).toFixed(2) + 'px;height:' + (2 * r).toFixed(2) + 'px;border-radius:50%;'
    + 'opacity:' + (a == null ? 1 : a).toFixed(2) + ';'
    + 'background:radial-gradient(circle, var(--aihud-heat-text-0) 0 30%, ' + c + ' 58%, ' + fade(c, 0) + ' 74%);'
    + 'box-shadow:0 0 ' + glow(v, z, 1.3) + ' ' + fade(c, 70) + (hot(v) ? ', 0 0 0 ' + Math.max(0.5, 0.03 * r).toFixed(2) + 'px ' + edge(v) : ''));
}

/** Filament wedge: n filaments climbing left to right, each in the heat colour of its position. */
function wedge(box, u, z, o) {
  const n = 21, has = o.v != null, w = Math.max(1.5, 0.1 * u), step = (o.x1 - o.x0 - w) / (n - 1);
  let tip = null;
  for (let i = 0; i < n; i++) {
    const at = ((i + 0.5) / n) * 100, on = has && (i / n) * 100 < o.v, h = o.h0 + ((o.h1 - o.h0) * i) / (n - 1), x = o.x0 + i * step;
    const css = 'left:' + x.toFixed(2) + 'px;top:' + (o.base - h).toFixed(2) + 'px;width:' + w.toFixed(2) + 'px;height:' + h.toFixed(2) + 'px;border-radius:' + (w / 2).toFixed(2) + 'px;';
    if (!has) { add(box, css + 'background:var(--aihud-line)'); continue; }
    const f = add(box, css + 'background:' + heat(at) + ';' + (on ? 'box-shadow:0 0 ' + glow(o.v, z, 0.9) + ' ' + fade(heat(at), 75) : 'opacity:var(--aihud-heat-rest)'));
    if (on && hot(at)) {
      const cw = Math.max(0.6, w * 0.4);
      add(box, 'left:' + (x + (w - cw) / 2).toFixed(2) + 'px;top:' + (o.base - h + w / 2).toFixed(2) + 'px;width:' + cw.toFixed(2) + 'px;height:' + Math.max(0, h - w).toFixed(2) + 'px;border-radius:' + cw + 'px;background:' + edge(at));
    }
    if (on) tip = { x: x + w / 2, y: o.base - h, at };
    void f;
  }
  if (tip) pulse(box, tip.x, tip.y, 0.17 * u, o.v, z, 1);
}

const iso = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

/** Context values, each null when missing. */
function ctx(data) {
  const d = data || {};
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const raw = d.context && Array.isArray(d.context.points) ? d.context.points : [];
  const pts = raw.filter((p) => p && isNum(p.percent) && iso(p.time) != null).map((p) => ({ t: iso(p.time), pct: p.percent }));
  let pct = inst && isNum(inst.context_percent) ? inst.context_percent : null;
  let pctPath = pct != null ? 'live.instances[].context_percent' : null;
  if (pct == null && pts.length) { pct = pts[pts.length - 1].pct; pctPath = 'context.points[].percent'; }
  let win = inst && isNum(inst.context_window) ? inst.context_window : null;
  let winPath = win != null ? 'live.instances[].context_window' : null;
  const s = d.session || null;
  if (win == null && s && d.windows && d.windows[s.provider] && isNum(d.windows[s.provider][s.model])) { win = d.windows[s.provider][s.model]; winPath = 'windows.<key>.<key>'; }
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  return { pct, win, total, pts, pctPath, winPath };
}

function tok(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 999500) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

const winLabel = (n) => (n >= 1e6 ? +(n / 1e6).toFixed(1) + 'M' : Math.round(n / 1000) + 'k');

const pct = (v) => (v >= 99.95 ? '100' : v.toFixed(1));

const KIT = { frame, ctx, clamp, field, label, val, tok, span, num, pct, wedge, mark, winLabel };

export function render(el, data, size) {
  draw(el, data, size);
  if ((notRecorded(data, 'live', 'tokens') || notRecorded(data, 'live', 'window'))) absentOnly(el.firstElementChild, 'context', 'live.instances[].context_percent', size.unit / 20);
}

function draw(el, data, size) {
  const B = KIT, { box, u, z } = B.frame(el, size), v = B.ctx(data), has = v.pct != null, p = has ? B.clamp(v.pct) : null;
  if (has) B.field(box, 2.2 * u, 2.2 * u, 3.8 * u, 2.4 * u, p);
  B.label(box, u, { x: 0.5 * u, y: 0.45 * u }, 'CONTEXT');
  const t = B.val(box, u, { right: 0.5 * u, y: 0.4 * u }, 0.6 * u, v.total != null ? B.tok(v.total) : '', v.total != null);
  if (v.total != null) t.setAttribute('data-field', 'live.instances[].tokens_total');
  B.span(t, 'font:500 ' + 0.5 * u + 'px var(--aihud-font);letter-spacing:.14em;color:var(--aihud-dim);margin-left:' + 0.2 * u + 'px', 'TOK');
  const nn = B.num(box, u, z, { x: 0.4 * u, y: 1.05 * u, size: 2.3 * u, v: p, text: has ? B.pct(v.pct) : '', unit: '%' });
  if (has) nn.setAttribute('data-field', v.pctPath);
  B.wedge(box, u, z, { x0: 0.5 * u, x1: 7.5 * u, base: 4.95 * u, h0: 0.3 * u, h1: 1.45 * u, v: p });
  if (has) {
    B.mark(box, u, { x: 0.5 * u, y: 5.2 * u }, '0');
    if (v.win != null) B.mark(box, u, { right: 0.5 * u, y: 5.2 * u }, B.winLabel(v.win)).setAttribute('data-field', v.winPath);
  }
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

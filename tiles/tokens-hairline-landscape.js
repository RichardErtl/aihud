// Minimal (Hairline) tokens, reduced: #2 total + #5 main / sub as one split hairline. (landscape, 11 × 2)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tokens-hairline-landscape',
  contentBlock: 'tokens',
  style: 'hairline',
  orientation: 'landscape',
  sizes: [{ cols: 11, rows: 2 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  const { doc, z, k } = card(el, size, 3, 6);
  const t = tok(data);
  const grid = h(doc, 'div', `display:grid;grid-template-columns:auto minmax(0,1fr);gap:${12 * z}px;align-items:center;height:100%`);
  const total = h(doc, 'div', 'display:flex;align-items:baseline;min-width:0');
  total.append(df(fig(doc, z, 20, 24, tokSeg(t.total)), t.total != null ? 'live.instances[].tokens_total' : null), h(doc, 'div', LBL(z) + `;margin-left:${4 * z}px`, 'tok'));
  const split = h(doc, 'div', 'display:flex;flex-direction:column;min-width:0');
  const r = row(doc);
  r.append(df(h(doc, 'div', SUB(z, 10, 13), `main ${txt(t.main)}`), t.main != null ? 'live.instances[].tokens_main' : null), df(h(doc, 'div', SUB(z, 10, 13) + ';color:var(--aihud-faint)', `sub ${txt(t.sub)}`), t.sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : null));
  split.append(r, h(doc, 'div', `height:${3 * z}px`), splitHair(doc, t.main, t.total, 'var(--aihud-main)', 'var(--aihud-sub)'));
  grid.append(total, split);
  k.append(grid);
}

// ── drawing helpers (copied in so this tile stands alone) ──
const DASH = '–';

function h(doc, tag, css, text) {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = String(text);
  return e;
}

const df = (e, p) => { if (p) e.setAttribute('data-field', p); return e; };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;

/** Box cols x unit by rows x unit, a 2 px inset card; returns the inner size in sketch px (unit 20). */
function card(el, size, padY = 5, padX = 6) {
  const doc = el.ownerDocument, z = size.unit / 20;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;padding:${2 * z}px;overflow:hidden;font-family:var(--aihud-font);color:var(--aihud-text)`);
  const k = h(doc, 'div', `height:100%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;padding:${padY * z}px ${padX * z}px;background:var(--aihud-panel);border-radius:var(--aihud-radius)`);
  box.append(k);
  el.replaceChildren(box);
  return { doc, z, box, k, W: size.cols * 20 - 4 - 2 * padX, H: size.rows * 20 - 4 - 2 * padY };
}

const LBL = (z) => `color:var(--aihud-faint);font-size:${9.5 * z}px;line-height:${12 * z}px;height:${12 * z}px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;overflow:hidden`;

const SUB = (z, px = 11, lh = 14) => `color:var(--aihud-dim);font-size:${px * z}px;line-height:${lh * z}px;height:${lh * z}px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden`;

/** 812 / 534k / 5.8M; missing -> null (the caller draws the dash). */
function compact(n) {
  if (num(n) == null) return null;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

const txt = (n) => compact(n) ?? DASH;

const tokSeg = (n) => { const c = compact(n); if (c == null) return null; const m = c.match(/^([\d.]+)([kM]?)$/); return m ? [{ t: m[1] }, { t: m[2], s: 1 }] : [{ t: c }]; };

/** A heavy number line; null segments -> the faint dash. */
function fig(doc, z, px, lh, segs, color) {
  const d = h(doc, 'div', `font-size:${px * z}px;line-height:${lh * z}px;height:${lh * z}px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;letter-spacing:-.01em;color:${segs ? color || 'var(--aihud-text)' : 'var(--aihud-faint)'}`);
  if (!segs) { d.textContent = DASH; return d; }
  for (const g of segs) d.append(h(doc, 'span', g.s ? 'font-size:.55em;font-weight:500;letter-spacing:0' : '', g.t));
  return d;
}

/** THE hairline: 1 px track, coloured segments [{a, b, color, glow}] as fractions 0..1, an optional end tick. */
function hair(doc, segs, tick) {
  const line = h(doc, 'div', 'position:relative;height:1px;flex:none;background:var(--aihud-line)');
  for (const g of segs) {
    if (!(g.b > g.a)) continue;
    const gap = g.gapL ? ' + 2px' : '';
    line.append(h(doc, 'div', `position:absolute;top:0;height:1px;left:calc(${(g.a * 100).toFixed(2)}%${gap});width:calc(${((g.b - g.a) * 100).toFixed(2)}%${g.gapL ? ' - 2px' : ''});background:${g.color}${g.glow ? `;box-shadow:0 0 var(--aihud-glow) ${g.color}` : ''}`));
  }
  if (tick) line.append(h(doc, 'div', `position:absolute;top:-2px;height:5px;width:1px;left:calc(${(tick.at * 100).toFixed(2)}% - ${tick.at > 0.5 ? 1 : 0}px);background:${tick.color}`));
  return line;
}

const frac = (a, b) => (num(a) != null && num(b) != null && b > 0 ? Math.max(0, Math.min(1, a / b)) : null);

/** A split line: part / total, the rest after a 2 px gap. */
function splitHair(doc, part, total, colA, colB) {
  const f = frac(part, total);
  if (f == null) return hair(doc, []);
  return hair(doc, [{ a: 0, b: f, color: colA }, { a: f, b: 1, color: colB, gapL: 1 }]);
}

const row = (doc, css = '') => h(doc, 'div', `display:flex;justify-content:space-between;align-items:flex-end;gap:6px;flex:none;min-width:0;${css}`);

function tok(data) {
  const i = inst(data), total = num(i && i.tokens_total), main = num(i && i.tokens_main);
  return { total, main, sub: total != null && main != null ? total - main : null };
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

// Strata, portrait: tokens, the total on the front plane and the heaviest models as planes stepping back behind it; hovering the tile lifts the front plane so the layers behind show.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by unit / 20.

// ── shared layer kit ─────────────────────────────────────────────────────────
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const DASH = '–';
const SERIES = ['--aihud-series-1', '--aihud-series-2', '--aihud-series-3'];
const HEAT_STOPS = [0, 30, 50, 75, 100];
const HEAT_FILL = ['var(--aihud-heat-0)', 'var(--aihud-heat-30)', 'var(--aihud-heat-50)', 'var(--aihud-heat-75)', 'var(--aihud-heat-100)'];
/** CONTRACT.md §Heat: straight srgb mix of the two neighbouring stops. */
function heat(v, ramp = HEAT_FILL) {
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i]) i++;
  const p = ((HEAT_STOPS[i] - x) / (HEAT_STOPS[i] - HEAT_STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}
function h(doc, tag, css, text) {
  const n = doc.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}
/** The tile box at its exact pixel size on the OLED ground; inside, the drawing at 20 px per unit, zoomed. */
function frame(el, size) {
  const doc = el.ownerDocument;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
    + 'background:var(--aihud-bg);color:var(--aihud-text)');
  const inner = h(doc, 'div', `position:relative;width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
    + 'font-family:var(--aihud-font);font-variant-numeric:tabular-nums');
  box.append(inner);
  el.replaceChildren(box);
  return inner;
}
/** Ink of depth k: the text colour sunk toward the ground, one step per plane (floor 42 %). */
const ink = (k) => `color-mix(in srgb, var(--aihud-text) ${Math.max(42, 90 - 12 * k)}%, var(--aihud-bg))`;
/** One plane at depth k (0 = front): translucent panel, hairline edge; deeper = thinner, more transparent. */
function plane(doc, x, y, w, ht, k) {
  const fill = k === 0 ? 90 : Math.max(22, 64 - 9 * k);
  const edge = k === 0 ? 30 : Math.max(8, 21 - 3 * k);
  return h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${ht}px;box-sizing:border-box;`
    + `border:1px solid color-mix(in srgb, var(--aihud-text) ${edge}%, transparent);border-radius:var(--aihud-radius);`
    + `background:color-mix(in srgb, var(--aihud-panel) ${fill}%, transparent);overflow:hidden`);
}
/** One line of text at an absolute spot; never wraps, ellipsis instead of overflow. */
function tx(doc, x, y, w, px, color, text, o = {}) {
  const lh = Math.ceil(px * 1.22);
  const n = h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${lh}px;line-height:${lh}px;`
    + `font-size:${px}px;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
    + `text-align:${o.align || 'left'};font-weight:${o.weight || 400};${o.css || ''}`, text);
  if (o.field) n.setAttribute('data-field', o.field);
  return n;
}
const CAP = 'text-transform:uppercase;letter-spacing:.08em';
/** A rail: a hairline bar (horizontal or vertical) carrying a value. */
function rail(doc, x, y, w, ht, color, alpha = 1) {
  return h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, ht)}px;`
    + `background:${color};opacity:${alpha};border-radius:1px`);
}

// ── data readers ─────────────────────────────────────────────────────────────
const inst0 = (d) => (d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;
function fmtTok(n) {
  if (!isNum(n)) return DASH;
  if (n >= 999500) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}
const modelName = (id) => (typeof id === 'string' && id ? id.replace(/^claude-/, '') : DASH);
function tokVals(d) {
  const inst = inst0(d);
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const main = inst && isNum(inst.tokens_main) ? inst.tokens_main : null;
  const sub = total != null && main != null ? Math.max(0, total - main) : null;
  const byModel = inst && inst.tokens_by_model && typeof inst.tokens_by_model === 'object'
    ? Object.entries(inst.tokens_by_model).filter(([, n]) => isNum(n)).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  return { total, main, sub, byModel };
}

/**
 * Hover over the tile lifts the front plane out of the way so the layers behind it show;
 * leaving puts it back. One pair of listeners per element, replaced on every redraw.
 */
function reveal(el, front) {
  front.style.transition = 'opacity .18s ease';
  const old = el.__aihudReveal;
  if (old) { el.removeEventListener('mouseenter', old.on); el.removeEventListener('mouseleave', old.off); }
  const on = () => { front.style.opacity = '0.14'; el.setAttribute('data-aihud-reveal', 'on'); };
  const off = () => { front.style.opacity = ''; el.removeAttribute('data-aihud-reveal'); };
  el.__aihudReveal = { on, off };
  el.addEventListener('mouseenter', on);
  el.addEventListener('mouseleave', off);
  if (el.matches(':hover')) on(); else off();
}

function drawTokens(el, data, size, ori) {
  const doc = el.ownerDocument, root = frame(el, size), d = data || {};
  const W = size.cols * 20, H = size.rows * 20, P = 8, v = tokVals(d);
  const L = ori === 'portrait' ? { N: 3, dx: 6, dy: 15 } : { N: 3, dx: 12, dy: 13 };
  const fw = W - 2 * P - L.N * L.dx, fy = P + L.N * L.dy, fh = H - P - fy, iw = fw - 2;
  for (let k = L.N; k >= 1; k--) {
    const pl = plane(doc, P + k * L.dx, fy - k * L.dy, fw, fh, k);
    const m = v.byModel[k - 1];
    if (m) {
      pl.append(
        rail(doc, 0, 0, v.total > 0 ? iw * Math.min(1, m[1] / v.total) : 0, 2, `var(${SERIES[k - 1]})`, 1 - 0.12 * k),
        tx(doc, 6, 2, iw - 64, 9.5, ink(k), modelName(m[0]), { field: 'live.instances[].tokens_by_model' }),
        tx(doc, iw - 58, 2, 52, 9.5, ink(k), fmtTok(m[1]), { align: 'right', field: 'live.instances[].tokens_by_model' }));
    } else pl.append(tx(doc, 6, 2, 30, 9.5, ink(k), DASH));
    root.append(pl);
  }
  const f = plane(doc, P, fy, fw, fh, 0);
  const has = v.main != null && v.sub != null && v.main + v.sub > 0;
  const tot = tx(doc, 8, 0, 0, 26, v.total == null ? 'var(--aihud-faint)' : 'var(--aihud-text)', fmtTok(v.total), { weight: 650, css: 'letter-spacing:-.01em', field: v.total != null ? 'live.instances[].tokens_total' : null });
  const mainC = v.main == null ? 'var(--aihud-faint)' : 'var(--aihud-text)';
  const subC = v.sub == null ? 'var(--aihud-faint)' : 'var(--aihud-dim)';
  const split = (x, y, w) => {
    const bar = h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:4px;display:flex;gap:2px`);
    if (has) bar.append(
      h(doc, 'span', `flex:${v.main};background:var(--aihud-main);border-radius:1px`),
      h(doc, 'span', `flex:${v.sub};background:var(--aihud-sub);border-radius:1px`));
    else bar.append(h(doc, 'span', 'flex:1;background:var(--aihud-line);border-radius:1px'));
    return bar;
  };
  if (ori === 'portrait') {
    tot.style.top = '17px'; tot.style.width = `${iw - 16}px`;
    f.append(
      tx(doc, 8, 5, iw - 16, 9.5, 'var(--aihud-faint)', 'tokens', { css: CAP }), tot,
      tx(doc, 8, 54, 52, 9.5, 'var(--aihud-faint)', 'main', { css: CAP }),
      tx(doc, 64, 54, 52, 9.5, 'var(--aihud-faint)', 'sub', { css: CAP }),
      tx(doc, 8, 66, 54, 12, mainC, fmtTok(v.main), { weight: 600, field: v.main != null ? 'live.instances[].tokens_main' : null }),
      tx(doc, 64, 66, 54, 12, subC, fmtTok(v.sub), { weight: 600, field: v.sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : null }),
      split(8, 86, iw - 16));
  } else {
    tot.style.top = '15px'; tot.style.width = '90px';
    const rx = 104, rw = iw - rx - 8;
    f.append(
      tx(doc, 8, 4, 90, 9.5, 'var(--aihud-faint)', 'tokens', { css: CAP }), tot,
      split(8, 51, 84),
      tx(doc, rx, 11, 40, 9.5, 'var(--aihud-faint)', 'main', { css: CAP }),
      tx(doc, rx, 8, rw, 12, mainC, fmtTok(v.main), { align: 'right', weight: 600 }),
      tx(doc, rx, 35, 40, 9.5, 'var(--aihud-faint)', 'sub', { css: CAP }),
      tx(doc, rx, 32, rw, 12, subC, fmtTok(v.sub), { align: 'right', weight: 600 }));
  }
  root.append(f);
  reveal(el, f);
}

export const meta = { name: 'tokens-strata-portrait', contentBlock: 'tokens', style: 'strata', orientation: 'portrait', sizes: [{ cols: 8, rows: 8 }], contractVersion: '1.1' };

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
  drawTokens(el, data, size, 'portrait');
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

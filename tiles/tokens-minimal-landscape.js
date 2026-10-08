// Minimal · tokens · landscape (10 × 6): text left — total (#2), main and subagents (#5) at the
// foot — and the three model columns (#3) right.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tokens-minimal-landscape',
  contentBlock: 'tokens',
  style: 'minimal',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 6 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  const { doc, z, box, k, inner } = card(el, size);
  const t = tokens(data);
  const row = h(doc, 'div', `display:grid;grid-template-columns:${62 * z}px minmax(0,1fr);gap:${8 * z}px;height:100%`);
  const text = h(doc, 'div', 'display:flex;flex-direction:column;min-width:0');
  text.append(
    h(doc, 'div', LBL(z), 'tokens'),
    df(h(doc, 'div', VALUE(z, 16) + (t.total == null ? EMPTY : ''), compact(t.total)), t.total != null ? 'live.instances[].tokens_total' : null),
    df(h(doc, 'div', SUB(z) + ';margin-top:auto', `main ${compact(t.main)}`), t.main != null ? 'live.instances[].tokens_main' : null),
    df(h(doc, 'div', SUB(z), `sub ${compact(t.sub)}`), t.sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : null),
  );
  const bars = h(doc, 'div', `margin-top:${4 * z}px`);
  bars.append(columns(doc, z, t.cols, { width: inner - 62 - 8, barH: 68 }));
  row.append(text, bars);
  k.append(row);
  mark(box, data, ['live']);
}

// ── drawing helpers (Minimal style; copied into every Minimal tile so each tile stands alone) ──
// Drawn in sketch pixels at unit 20 and scaled by z = unit / 20 (CONTRACT.md §Layouts).
const DASH = '–';

/** A styled element; text only through textContent (names come from the transcript). */
function h(doc, tag, css, text) {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = String(text);
  return e;
}

/** The tile box (cols × unit by rows × unit) and the Minimal card inside it, 2 px inset. */
function card(el, size, padY = 5, padX = 6) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const box = h(doc, 'div', [
    `width:${size.cols * size.unit}px`, `height:${size.rows * size.unit}px`, 'box-sizing:border-box',
    `padding:${2 * z}px`, 'overflow:hidden', 'font-family:var(--aihud-font)', 'color:var(--aihud-text)',
  ].join(';'));
  const k = h(doc, 'div', [
    'height:100%', 'box-sizing:border-box', 'overflow:hidden', 'display:flex', 'flex-direction:column',
    `padding:${padY * z}px ${padX * z}px`, 'background:var(--aihud-panel)', 'border-radius:var(--aihud-radius)',
  ].join(';'));
  box.append(k);
  el.replaceChildren(box);
  // inner width of the card in sketch pixels
  return { doc, z, box, k, inner: size.cols * 20 - 4 - 2 * padX };
}

const LBL = (z) => `color:var(--aihud-faint);font-size:${9.5 * z}px;text-transform:uppercase;letter-spacing:.05em;line-height:1.2;white-space:nowrap;overflow:hidden`;
const VALUE = (z, px = 16) => `font-size:${px * z}px;font-weight:650;line-height:1.15;font-variant-numeric:tabular-nums;white-space:nowrap`;
const SUB = (z) => `color:var(--aihud-dim);font-size:${11 * z}px;line-height:1.35;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
const EMPTY = ';color:var(--aihud-faint)';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const inst = (data) => (data && data.live && Array.isArray(data.live.instances) && data.live.instances[0]) || null;

/** Tokens as a short number: 812 · 534k · 5.8M. Missing → the dash, never 0. */
function compact(n) {
  if (num(n) == null) return DASH;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

/** A type the tile needs is missing: the reader's own not_delivered names go on the hover title. */
function mark(box, data, types) {
  const nd = data && Array.isArray(data.not_delivered) ? data.not_delivered : [];
  const hit = nd.filter((n) => types.some((t) => !(data && data[t]) && String(n).startsWith(`${t}:`)));
  if (hit.length) box.setAttribute('title', `not delivered: ${hit.join(', ')}`);
}

const df = (e, p) => { if (p) e.setAttribute('data-field', p); return e; };
const NS = 'http://www.w3.org/2000/svg';
function svg(doc, tag, attrs, text) {
  const e = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = String(text);
  return e;
}
const fit = (s, w, px) => { const n = Math.max(1, Math.floor(w / (px * 0.56))); s = String(s); return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s; };

/**
 * Bars and numbers: columns as ONE svg, drawn in sketch pixels (viewBox) and scaled by z.
 * cols: [{ fill: 0..100 or null, color, top, bottom }] · width/barH in sketch px · scale = the
 * 0/50/100 axis with ticks · labels = a number row above and a name row below.
 */
function columns(doc, z, cols, { width, barH, scale = false, labels = true, colW = null }) {
  const LH = 12.8, GAP = 3, AX = scale ? 22 : 0, FS = 9.5;
  const top = labels ? LH + GAP : 0;
  const H = top + barH + (labels ? GAP + LH : 0);
  const s = svg(doc, 'svg', { width: width * z, height: H * z, viewBox: `0 0 ${width} ${H}` });
  s.style.cssText = 'display:block;overflow:visible';
  const txt = `font-family:var(--aihud-font);font-variant-numeric:tabular-nums`;
  if (scale) {
    s.append(svg(doc, 'rect', { x: AX - 3, y: top, width: 3, height: barH, rx: 1, style: 'fill:var(--aihud-faint)' }));
    for (const [t, y] of [['100', top + 3], ['50', top + barH / 2], ['0', top + barH - 3]]) {
      s.append(svg(doc, 'text', { x: AX - 6, y, 'text-anchor': 'end', 'dominant-baseline': 'central', style: `${txt};font-size:8.5px;fill:var(--aihud-faint)` }, t));
    }
  }
  const x0 = scale ? AX + GAP : 0;
  const n = cols.length;
  const cw = colW != null ? colW : (width - x0 - GAP * (n - 1)) / n;
  cols.forEach((c, i) => {
    const x = x0 + i * (cw + GAP);
    s.append(svg(doc, 'rect', { x, y: top, width: cw, height: barH, rx: 2, style: 'fill:var(--aihud-line-2)' }));
    const f = num(c.fill);
    if (f != null && f > 0) {
      const hh = barH * Math.min(100, f) / 100;
      s.append(svg(doc, 'rect', { x, y: top + barH - hh, width: cw, height: hh, rx: 2, style: `fill:${c.color}` }));
    }
    if (scale) {
      for (const p of [25, 50, 75]) {
        s.append(svg(doc, 'rect', { x, y: top + barH * (1 - p / 100) - 0.5, width: cw, height: 1, style: `fill:var(${p === 50 ? '--aihud-faint' : '--aihud-line'});opacity:.6` }));
      }
    }
    if (labels) {
      const cx = x + cw / 2;
      const dim = c.top == null || c.top === DASH;
      s.append(svg(doc, 'text', { ...(c.field ? { 'data-field': c.field } : {}), x: cx, y: LH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `${txt};font-size:${FS}px;fill:var(${dim ? '--aihud-faint' : '--aihud-dim'})` }, fit(c.top == null ? DASH : c.top, cw + GAP, FS)));
      const name = c.bottom == null ? DASH : String(c.bottom);
      const shown = fit(name, cw + GAP, FS);
      const t = svg(doc, 'text', { ...(c.field ? { 'data-field': c.field } : {}), x: cx, y: top + barH + GAP + LH / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', style: `${txt};font-size:${FS}px;fill:var(--aihud-faint)` }, shown);
      if (shown !== name) t.append(svg(doc, 'title', {}, name));   // the full name on hover
      s.append(t);
    }
  });
  return s;
}

/** A model id as a short word: claude-opus-5 → Opus. */
const modelWord = (id) => { const w = String(id).replace(/^claude-/, '').split(/[-_.\s]/)[0] || String(id); return w.charAt(0).toUpperCase() + w.slice(1); };

/** Values #2 total, #5 main vs subagents, #3 the three largest models as columns (relative to the largest). */
function tokens(data) {
  const i = inst(data);
  const total = num(i && i.tokens_total), main = num(i && i.tokens_main);
  const byModel = i && i.tokens_by_model && typeof i.tokens_by_model === 'object'
    ? Object.entries(i.tokens_by_model).filter(([, v]) => num(v) != null).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  const max = byModel.length ? byModel[0][1] : 0;
  const cols = byModel.map(([m, v]) => ({ fill: max > 0 ? (v / max) * 100 : null, color: 'var(--aihud-dim)', top: compact(v), bottom: modelWord(m), field: 'live.instances[].tokens_by_model' }));
  while (cols.length < 3) cols.push({ fill: null, top: DASH, bottom: DASH });
  return { total, main, sub: total != null && main != null ? total - main : null, cols };
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

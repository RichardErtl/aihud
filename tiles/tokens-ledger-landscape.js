// Minimal (Ledger) tokens, re-interpreted: #2 total, #5 main / sub hairline, #3 per model as ledger lines. (landscape, 10 × 5)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tokens-ledger-landscape',
  contentBlock: 'tokens',
  style: 'ledger',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 5 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  const { doc, z, box, k } = card(el, size);
  const t = tokensOf(data);
  const grid = h(doc, 'div', `display:grid;grid-template-columns:${74 * z}px minmax(0,1fr);gap:${10 * z}px;height:100%;min-height:0`);
  const left = h(doc, 'div', 'display:flex;flex-direction:column;min-width:0;min-height:0');
  left.append(
    label(doc, z, 'tokens'),
    hero(doc, z, 24, compact(t.total), '', 'live.instances[].tokens_total'),
    hairline(doc, z, t.frac, 4, 2),
    h(doc, 'div', 'flex:1 1 auto;min-height:0'),
    line(doc, z, 'main', compact(t.main), undefined, false, null, 'live.instances[].tokens_main'),
    line(doc, z, 'sub', compact(t.sub), undefined, false, null, 'live.instances[].tokens_total live.instances[].tokens_main'),
  );
  const right = h(doc, 'div', 'display:flex;flex-direction:column;justify-content:flex-end;min-width:0;min-height:0');
  right.append(
    label(doc, z, 'by model', `;margin-bottom:${2 * z}px`),
    ...t.models.map((m, n) => line(doc, z, m.name, m.value, m.share, n === 0 && m.value !== DASH, m.name !== DASH ? 'live.instances[].tokens_by_model' : null, 'live.instances[].tokens_by_model', 'live.instances[].tokens_by_model live.instances[].tokens_total')),
  );
  grid.append(left, right);
  k.append(grid);
  mark(box, data, ['live']);
}

// ── drawing helpers (copied in so this tile stands alone) ──
const DASH = '–';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const inst = (data) => (data && data.live && Array.isArray(data.live.instances) && data.live.instances[0]) || null;

/** A styled element; text only through textContent (names come from the transcript). */
function h(doc, tag, css, text) {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = String(text);
  return e;
}

/** The tile box (cols x unit by rows x unit) and the card inside it, 2 px inset. */
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
  return { doc, z, box, k };
}

/** The small caps label (9.5 px at unit 20 — the legibility floor is 9 px). */
const label = (doc, z, text, extra = '') => h(doc, 'div', `color:var(--aihud-faint);font-size:${9.5 * z}px;text-transform:uppercase;letter-spacing:.06em;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:none;min-width:0${extra}`, text);

/** The hero numeral: digits large, unit letters (M, k, h, m, %) small and dimmed beside them. */
function hero(doc, z, px, str, extra = '', field = null) {
  const empty = str === DASH;
  const d = h(doc, 'div', `font-size:${px * z}px;font-weight:650;line-height:1.1;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;flex:none;min-width:0;color:var(${empty ? '--aihud-faint' : '--aihud-text'})${extra}`);
  if (field && !empty) d.setAttribute('data-field', field);
  for (const part of String(str).match(/[0-9.,\s–]+|[^0-9.,\s–]+/g) || []) {
    if (/[0-9–]/.test(part)) d.append(doc.createTextNode(part));
    else d.append(h(doc, 'span', 'font-size:.58em;font-weight:600;color:var(--aihud-dim);margin-left:.05em', part));
  }
  return d;
}

/** One ledger line: key left (ellipsis), value right, optional share; strong = the leading rank. */
function line(doc, z, key, value, share, strong, keyField = null, valField = null, shareField = null) {
  const r = h(doc, 'div', `display:flex;align-items:baseline;gap:${5 * z}px;font-size:${11 * z}px;line-height:1.3;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0;flex:none;color:var(${strong ? '--aihud-text' : '--aihud-dim'})`);
  const kEl = h(doc, 'div', `flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis${strong ? ';font-weight:600' : ''}`, key);
  if (keyField) kEl.setAttribute('data-field', keyField);
  r.append(kEl);
  const vEl = h(doc, 'div', `flex:none${value === DASH ? ';color:var(--aihud-faint)' : ''}`, value);
  if (valField && value !== DASH) vEl.setAttribute('data-field', valField);
  r.append(vEl);
  if (share !== undefined) {
    const sEl = h(doc, 'div', `flex:none;width:${24 * z}px;text-align:right;color:var(${share === DASH ? '--aihud-faint' : '--aihud-dim'})`, share);
    if (shareField && share !== DASH) sEl.setAttribute('data-field', shareField);
    r.append(sEl);
  }
  return r;
}

/** The one hairline a tile may carry: a 2 px share bar (frac 0..1, null = empty track). */
function hairline(doc, z, frac, mt = 4, mb = 3) {
  const t = h(doc, 'div', `height:${2 * z}px;margin:${mt * z}px 0 ${mb * z}px;background:var(--aihud-line);border-radius:${z}px;overflow:hidden;flex:none`);
  const f = num(frac);
  if (f != null) t.append(h(doc, 'div', `height:100%;width:${Math.max(0, Math.min(1, f)) * 100}%;background:var(--aihud-main)`));
  return t;
}

/** Tokens as a short number: 812 · 534k · 5.8M. Missing → the dash, never 0. */
function compact(n) {
  if (num(n) == null) return DASH;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

const pct = (f) => (num(f) == null ? DASH : `${Math.round(f * 100)}%`);

const modelWord = (id) => { const w = String(id).replace(/^claude-/, '').split(/[-_.\s]/)[0] || String(id); return w.charAt(0).toUpperCase() + w.slice(1); };

/** A type the tile needs is missing: the reader's own not_delivered names go on the hover title. */
function mark(box, data, types) {
  const nd = data && Array.isArray(data.not_delivered) ? data.not_delivered : [];
  const hit = nd.filter((n) => types.some((t) => !(data && data[t]) && String(n).startsWith(`${t}:`)));
  if (hit.length) box.setAttribute('title', `not delivered: ${hit.join(', ')}`);
}

/** #2 total, #5 main vs subagents, #3 the three largest models with their share of the total. */
function tokensOf(data) {
  const i = inst(data);
  const total = num(i && i.tokens_total), main = num(i && i.tokens_main);
  const byModel = i && i.tokens_by_model && typeof i.tokens_by_model === 'object'
    ? Object.entries(i.tokens_by_model).filter(([, v]) => num(v) != null).sort((a, b) => b[1] - a[1]).slice(0, 3) : [];
  const models = byModel.map(([m, v]) => ({ name: modelWord(m), full: m, value: compact(v), share: total ? pct(v / total) : DASH }));
  while (models.length < 3) models.push({ name: DASH, full: '', value: DASH, share: DASH });
  const sub = total != null && main != null ? total - main : null;
  return { total, main, sub, frac: total && main != null ? main / total : null, models };
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

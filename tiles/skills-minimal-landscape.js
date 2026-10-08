// Minimal · skills · landscape (7 × 6): value #23 — the same list as portrait, more rows, more air.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'skills-minimal-landscape',
  contentBlock: 'skills',
  style: 'minimal',
  orientation: 'landscape',
  sizes: [{ cols: 7, rows: 6 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, box, k } = card(el, size);
  const list = h(doc, 'div', `margin-top:${4 * z}px`);
  const availH = size.rows * 20 - 4 - 10 - 9.5 * 1.2 - 4;
  list.append(skillList(doc, z, skills(data), availH, 3, 8, !!(data && data.turn && Array.isArray(data.turn.turns))));
  k.append(h(doc, 'div', LBL(z), 'skills'), list);
  mark(box, data, ['turn']);
  if (notRecorded(data, 'turn', 'skills') && !skills(data).length) absentOnly(k, 'skills', 'turn.turns[].skills', z);
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

/** Value mark (CONTRACT.md "Value marks and the tip"): the catalog path the shown value is read from; null = no mark. */
function fld(node, path) {
  if (path) node.setAttribute('data-field', path);
  return node;
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

/** Value #23 (name and count): skills started in the session, most often first, then the latest. */
function skills(data) {
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  const by = new Map();
  for (const t of turns) for (const s of Array.isArray(t.skills) ? t.skills : []) {
    if (!s || !s.name) continue;
    const e = by.get(s.name) || { name: s.name, count: 0, last: '' };
    e.count++;
    if (String(s.time) > e.last) e.last = String(s.time);
    by.set(s.name, e);
  }
  return [...by.values()].sort((a, b) => b.count - a.count || (a.last < b.last ? 1 : -1));
}

/** The list: name left, ×count right; rows that do not fit fold into one "+n" row. */
function skillList(doc, z, list, availH, gapY, gapX, delivered) {
  const rowH = 11 * 1.35;
  const fits = Math.max(1, Math.floor((availH + gapY) / (rowH + gapY)));
  const shown = list.length > fits ? list.slice(0, fits - 1) : list;
  const g = h(doc, 'div', `display:grid;grid-template-columns:minmax(0,1fr) auto;gap:${gapY * z}px ${gapX * z}px;font-size:${11 * z}px;line-height:1.35;font-variant-numeric:tabular-nums`);
  if (!list.length) { g.append(h(doc, 'span', 'color:var(--aihud-faint)', delivered ? 'no skill calls this session' : DASH)); return g; }
  for (const s of shown) {
    g.append(fld(h(doc, 'span', 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis', s.name), 'turn.turns[].skills[].name'), fld(h(doc, 'span', 'color:var(--aihud-dim)', `×${s.count}`), 'turn.turns[].skills'));
  }
  if (shown.length < list.length) g.append(h(doc, 'span', 'color:var(--aihud-faint)', '…'), fld(h(doc, 'span', 'color:var(--aihud-faint)', `+${list.length - shown.length}`), 'turn.turns[].skills'));
  return g;
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

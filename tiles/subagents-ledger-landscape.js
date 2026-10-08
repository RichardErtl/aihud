// Minimal (Ledger) subagents, reduced: the count (agents.subagents_started) + the heaviest role. (landscape, 9 × 2)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'subagents-ledger-landscape',
  contentBlock: 'subagents',
  style: 'ledger',
  orientation: 'landscape',
  sizes: [{ cols: 9, rows: 2 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, box, k } = card(el, size);
  const s = subagentsOf(data);
  const row = h(doc, 'div', `display:flex;align-items:center;gap:${9 * z}px;height:100%;min-width:0;min-height:0`);
  const col = h(doc, 'div', 'display:flex;flex-direction:column;flex:1 1 auto;min-width:0');
  col.append(label(doc, z, 'subagents · heaviest'), line(doc, z, s.role, s.roleTokens, undefined, false, 'live.instances[].tokens_by_agent_type', s.roleAbsent));
  row.append(hero(doc, z, 22, s.count == null ? DASH : String(s.count), `;min-width:${18 * z}px`, 'agents.subagents_started', s.absent), col);
  k.append(row);
  mark(box, data, ['agents', 'live']);
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
function hero(doc, z, px, str, extra = '', field = '', absent = false) {
  const empty = str === DASH;
  const d = h(doc, 'div', `font-size:${px * z}px;font-weight:650;line-height:1.1;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;flex:none;min-width:0;color:var(${empty ? (absent ? '--aihud-absent' : '--aihud-faint') : '--aihud-text'})${extra}`);
  if (field && (!empty || absent)) d.setAttribute('data-field', field);
  for (const part of String(str).match(/[0-9.,\s–]+|[^0-9.,\s–]+/g) || []) {
    if (/[0-9–]/.test(part)) d.append(doc.createTextNode(part));
    else d.append(h(doc, 'span', 'font-size:.58em;font-weight:600;color:var(--aihud-dim);margin-left:.05em', part));
  }
  return d;
}

/** One ledger line: key left (ellipsis), value right, optional share; strong = the leading rank. */
function line(doc, z, key, value, share, strong, field, absent = null) {
  const r = h(doc, 'div', `display:flex;align-items:baseline;gap:${5 * z}px;font-size:${11 * z}px;line-height:1.3;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0;flex:none;color:var(${strong ? '--aihud-text' : '--aihud-dim'})`);
  const kEl = h(doc, 'div', `flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis${strong ? ';font-weight:600' : ''}`, key);
  if (field && key !== DASH) kEl.setAttribute('data-field', field);
  if (absent) { kEl.style.color = 'var(--aihud-absent)'; kEl.setAttribute('data-field', absent); r.append(kEl); return r; }
  r.append(kEl);
  const vEl = h(doc, 'div', `flex:none${value === DASH ? ';color:var(--aihud-faint)' : ''}`, value);
  if (field && value !== DASH) vEl.setAttribute('data-field', field);
  r.append(vEl);
  if (share !== undefined) r.append(h(doc, 'div', `flex:none;width:${24 * z}px;text-align:right;color:var(${share === DASH ? '--aihud-faint' : '--aihud-dim'})`, share));
  return r;
}

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

/** #11 subagents started (read from agents.subagents_started, never counted here), #4 only the heaviest role. */
function subagentsOf(data) {
  const started = data && data.agents ? data.agents.subagents_started : null;
  const count = Number.isInteger(started) && started >= 0 ? started : null;
  const i = inst(data);
  const roles = i && i.tokens_by_agent_type && typeof i.tokens_by_agent_type === 'object'
    ? Object.entries(i.tokens_by_agent_type).filter(([k, v]) => k !== 'main' && num(v) != null).sort((a, b) => b[1] - a[1]) : [];
  const absent = count == null && notRecorded(data, 'agents', 'subagents');
  const roleAbsent = !roles.length ? (notRecorded(data, 'live', 'tokens') ? 'live.instances[].tokens_by_agent_type' : absent ? 'agents.subagents_started' : null) : null;
  return { count, absent, roleAbsent, role: roles.length ? roles[0][0] : DASH, roleTokens: roles.length ? compact(roles[0][1]) : DASH };
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

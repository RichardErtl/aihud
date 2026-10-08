// Active time, Ledger: #10 work vs wait, #9 span, longest turn. (portrait, 8 × 5)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'active-time-ledger-portrait',
  contentBlock: 'active-time',
  style: 'ledger',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 5 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, box, k } = card(el, size);
  const a = activeOf(data);
  const top = h(doc, 'div', `display:flex;align-items:baseline;justify-content:space-between;gap:${6 * z}px;min-width:0;flex:none`);
  top.append(hero(doc, z, 20, dur(a.work), '', 'session.work_ms'), fld(h(doc, 'div', `flex:none;font-size:${11 * z}px;line-height:1.2;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--aihud-dim)`, `${pct(a.frac)} active`), a.frac != null ? 'session.work_ms session.wait_ms' : null));
  k.append(
    label(doc, z, 'active time'),
    top,
    hairline(doc, z, a.frac, 3, 2),
    line(doc, z, 'waiting', dur(a.wait), undefined, false, 'session.wait_ms'),
    line(doc, z, 'span', dur(a.span), undefined, false, 'session.started_at live.instances[].last_activity'),
    line(doc, z, `longest ${a.longTurn}`, dur(a.longMs), undefined, false, 'turn.turns[].duration_s', a.longTurn === DASH ? null : 'turn.turns[].number'),
  );
  mark(box, data, ['session', 'turn']);
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

/** Value mark (CONTRACT.md "Value marks and the tip"): the catalog path the shown value is read from; null = no mark. */
function fld(node, path) {
  if (path) node.setAttribute('data-field', path);
  return node;
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
function hero(doc, z, px, str, extra = '', field) {
  const empty = str === DASH;
  const d = h(doc, 'div', `font-size:${px * z}px;font-weight:650;line-height:1.1;letter-spacing:-.01em;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;flex:none;min-width:0;color:var(${empty ? '--aihud-faint' : '--aihud-text'})${extra}`);
  for (const part of String(str).match(/[0-9.,\s–]+|[^0-9.,\s–]+/g) || []) {
    if (/[0-9–]/.test(part)) d.append(doc.createTextNode(part));
    else d.append(h(doc, 'span', 'font-size:.58em;font-weight:600;color:var(--aihud-dim);margin-left:.05em', part));
  }
  return fld(d, empty ? null : field);
}

/** One ledger line: key left (ellipsis), value right, optional share; strong = the leading rank. */
function line(doc, z, key, value, share, strong, field, keyField) {
  const r = h(doc, 'div', `display:flex;align-items:baseline;gap:${5 * z}px;font-size:${11 * z}px;line-height:1.3;font-variant-numeric:tabular-nums;white-space:nowrap;min-width:0;flex:none;color:var(${strong ? '--aihud-text' : '--aihud-dim'})`);
  r.append(fld(h(doc, 'div', `flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis${strong ? ';font-weight:600' : ''}`, key), keyField));
  r.append(fld(h(doc, 'div', `flex:none${value === DASH ? ';color:var(--aihud-faint)' : ''}`, value), value === DASH ? null : field));
  if (share !== undefined) r.append(h(doc, 'div', `flex:none;width:${24 * z}px;text-align:right;color:var(${share === DASH ? '--aihud-faint' : '--aihud-dim'})`, share));
  return r;
}

/** The one hairline a tile may carry: a 2 px share bar (frac 0..1, null = empty track). */
function hairline(doc, z, frac, mt = 4, mb = 3) {
  const t = h(doc, 'div', `height:${2 * z}px;margin:${mt * z}px 0 ${mb * z}px;background:var(--aihud-line);border-radius:${z}px;overflow:hidden;flex:none`);
  const f = num(frac);
  if (f != null) t.append(fld(h(doc, 'div', `height:100%;width:${Math.max(0, Math.min(1, f)) * 100}%;background:var(--aihud-main)`), 'session.work_ms session.wait_ms'));
  return t;
}

/** Milliseconds as 42s · 57m · 1h 48m. Missing → the dash. */
function dur(ms) {
  if (num(ms) == null || ms < 0) return DASH;
  if (ms < 59500) return `${Math.round(ms / 1000)}s`;
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

const pct = (f) => (num(f) == null ? DASH : `${Math.round(f * 100)}%`);

/** A type the tile needs is missing: the reader's own not_delivered names go on the hover title. */
function mark(box, data, types) {
  const nd = data && Array.isArray(data.not_delivered) ? data.not_delivered : [];
  const hit = nd.filter((n) => types.some((t) => !(data && data[t]) && String(n).startsWith(`${t}:`)));
  if (hit.length) box.setAttribute('title', `not delivered: ${hit.join(', ')}`);
}

/** #10 work vs wait, #9 the session span, the longest measured turn. */
function activeOf(data) {
  const s = data && data.session;
  const work = num(s && s.work_ms), wait = num(s && s.wait_ms);
  const frac = work != null && wait != null && work + wait > 0 ? work / (work + wait) : null;
  const i = inst(data);
  const t0 = s && Date.parse(s.started_at), t1 = i && Date.parse(i.last_activity);
  const span = Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0 ? t1 - t0 : null;
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  let longest = null;
  for (const t of turns) if (t && num(t.duration_s) != null && (!longest || t.duration_s > longest.duration_s)) longest = t;
  return {
    work, wait, frac, span,
    longMs: longest ? longest.duration_s * 1000 : null,
    longTurn: longest && num(longest.number) != null ? `T${longest.number}` : DASH,
  };
}

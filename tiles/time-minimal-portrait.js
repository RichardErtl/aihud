// Minimal · time · portrait (8 × 3): two cards — turn number (#7) with the turn's runtime (#6), and
// the session runtime (#9) as m:ss (h:mm:ss from an hour).
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'time-minimal-portrait',
  contentBlock: 'time',
  style: 'minimal',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 3 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, box, a, b } = pair(el, size);
  const t = times(data);
  a.append(h(doc, 'div', LBL(z), 'turn'), fld(h(doc, 'div', VALUE(z, 16) + (t.turn === DASH ? EMPTY : ''), t.turn), t.turn === DASH ? null : 'turn.turns[].number'), fld(h(doc, 'div', SUB(z), t.turnTime), t.turnTime === DASH ? null : 'turn.turns[].duration_s'));
  b.append(h(doc, 'div', LBL(z), 'session'), fld(h(doc, 'div', VALUE(z, 14) + (t.session === DASH ? EMPTY : ''), t.session), t.session === DASH ? null : 'session.started_at live.instances[].last_activity'));
  mark(box, data, ['turn', 'session', 'live']);
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

const mmss = (s) => {
  if (num(s) == null || s < 0) return DASH;
  const p2 = (n) => String(n).padStart(2, '0');
  const t = Math.floor(s);
  return t >= 3600 ? `${Math.floor(t / 3600)}:${p2(Math.floor(t % 3600 / 60))}:${p2(t % 60)}` : `${Math.floor(t / 60)}:${p2(t % 60)}`;
};

/** Values #7 turn number, #6 turn runtime (the last turn), #9 session runtime (start → last activity). */
function times(data) {
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  const last = turns.length ? turns[turns.length - 1] : null;
  const i = inst(data);
  const start = Date.parse(data && data.session ? data.session.started_at : '');
  const end = Date.parse(i ? i.last_activity : '');
  return {
    turn: last && num(last.number) != null ? String(last.number) : DASH,
    turnTime: last ? mmss(last.duration_s) : DASH,
    session: Number.isFinite(start) && Number.isFinite(end) ? mmss((end - start) / 1000) : DASH,
  };
}

/** Two small cards side by side, each with its own 2 px inset (the sketch's card pair). */
function pair(el, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const box = h(doc, 'div', [
    `width:${size.cols * size.unit}px`, `height:${size.rows * size.unit}px`, 'box-sizing:border-box', 'overflow:hidden',
    'display:grid', 'grid-template-columns:1fr 1fr', 'font-family:var(--aihud-font)', 'color:var(--aihud-text)',
  ].join(';'));
  const one = () => h(doc, 'div', [
    `margin:${2 * z}px`, 'box-sizing:border-box', 'overflow:hidden', 'min-width:0', `padding:${5 * z}px ${6 * z}px`,
    'background:var(--aihud-panel)', 'border-radius:var(--aihud-radius)',
  ].join(';'));
  const a = one(), b = one();
  box.append(a, b);
  el.replaceChildren(box);
  return { doc, z, box, a, b };
}

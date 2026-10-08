// Minimal · header · portrait (8 × 2). Value #12 session id and #13 the viewer's clock, below the
// skill started last (#23, part). A click on the session id opens the session list (plan §0.1 Nr. 8).
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'header-minimal-portrait',
  contentBlock: 'header',
  style: 'minimal',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 2 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, box, k } = card(el, size, 3, 6);
  const id = data && data.session && data.session.id ? shortId(data.session.id) : null;
  const top = h(doc, 'div', `display:flex;justify-content:space-between;gap:${4 * z}px;font-size:${11 * z}px;line-height:1.35`);
  const sid = h(doc, 'span', 'font-family:var(--aihud-font-mono);white-space:nowrap;overflow:hidden' + (id ? '' : EMPTY), id || DASH);
  fld(sid, id ? 'session.id' : null);
  const clk = h(doc, 'span', 'color:var(--aihud-dim);font-variant-numeric:tabular-nums', clock());
  top.append(sid, clk);
  tick(el, clk);
  const skill = lastSkill(data), skA = !skill && notRecorded(data, 'turn', 'skills');
  const line = h(doc, 'div', `color:var(--aihud-dim);font-size:${10.5 * z}px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`);
  line.append(h(doc, 'span', '', 'last '), fld(h(doc, 'span', `font-weight:500;color:var(${skill ? '--aihud-text' : skA ? '--aihud-absent' : '--aihud-faint'})`, skill ? `/${skill}` : DASH), skill || skA ? 'turn.turns[].skills[].name' : null));
  k.append(top, line);
  mark(box, data, ['session', 'turn']);
  sessionSwitch(el, sid, data, z);
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

const pad2 = (n) => String(n).padStart(2, '0');
/** The viewer's clock keeps ticking between redraws: one timer per tile element (a redraw clears
 * the old one), and it stops once the tile left the page. */
function tick(el, node) {
  if (el._aihudClock) clearInterval(el._aihudClock);
  const t = setInterval(() => {
    if (!node.isConnected) clearInterval(t);
    else node.textContent = clock();
  }, 10000);
  if (t && typeof t.unref === 'function') t.unref();
  el._aihudClock = t;
}

/** Value #13: the viewer's own clock, not a reader field. */
const clock = () => { const d = new Date(); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const shortId = (id) => String(id).slice(0, 8);

/** Value #23 (part): the skill started last in the session, or null. */
function lastSkill(data) {
  let last = null;
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : [];
  for (const t of turns) for (const s of Array.isArray(t.skills) ? t.skills : []) {
    if (s && s.name && (!last || String(s.time) > String(last.time))) last = s;
  }
  return last ? last.name : null;
}

const within = (node, root) => { for (let n = node; n; n = n.parentNode) if (n === root) return true; return false; };

/**
 * The session switch (plan §0.1 Nr. 8): click on the session id opens a plain list from data.hud
 * (`sessions`, `current`, `pinned`); picking a row dispatches `aihud:select-session` from the tile,
 * "follow newest" with session_id null. Without data.hud the id stays plain text.
 */
function sessionSwitch(el, anchor, data, z) {
  const reopen = el._aihudListOpen === true;
  if (typeof el._aihudCloseList === 'function') el._aihudCloseList();
  el._aihudCloseList = null;
  const hud = data && data.hud;
  if (!hud || !Array.isArray(hud.sessions)) return;
  const doc = el.ownerDocument;
  const view = doc.defaultView || globalThis;
  anchor.style.cursor = 'pointer';
  anchor.setAttribute('role', 'button');
  anchor.setAttribute('tabindex', '0');
  let list = null;
  const outside = (ev) => { if (!within(ev.target, el)) close(); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  function close() {
    if (list) { if (list.parentNode) list.parentNode.removeChild(list); list = null; }
    if (doc.removeEventListener) { doc.removeEventListener('click', outside, true); doc.removeEventListener('keydown', onKey); }
    el._aihudListOpen = false;
  }
  function pick(sessionId) {
    close();
    el.dispatchEvent(new view.CustomEvent('aihud:select-session', { bubbles: true, detail: { session_id: sessionId } }));
  }
  function row(left, right, strong, mono, onPick, hover) {
    const r = h(doc, 'div', `display:flex;justify-content:space-between;gap:${12 * z}px;padding:${4 * z}px ${10 * z}px;cursor:pointer;white-space:nowrap`);
    r.append(
      h(doc, 'span', `${mono ? 'font-family:var(--aihud-font-mono);' : ''}${strong ? 'color:var(--aihud-text);font-weight:600' : 'color:var(--aihud-dim)'}`, left),
      h(doc, 'span', 'color:var(--aihud-dim)', right),
    );
    if (hover) r.setAttribute('title', hover);
    r.setAttribute('data-session', onPick == null ? '' : onPick);
    r.addEventListener('click', () => pick(onPick));
    r.addEventListener('mouseenter', () => { r.style.background = 'var(--aihud-line-2)'; });
    r.addEventListener('mouseleave', () => { r.style.background = ''; });
    return r;
  }
  function open() {
    const b = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 0, bottom: 0 };
    list = h(doc, 'div', [
      'position:fixed', `left:${b.left}px`, `top:${b.bottom + 4 * z}px`, 'z-index:10', `min-width:${170 * z}px`,
      'max-height:70vh', 'overflow-y:auto', `padding:${4 * z}px 0`, 'box-sizing:border-box',
      'background:var(--aihud-panel)', 'border:1px solid var(--aihud-line)', 'border-radius:var(--aihud-radius)',
      'font-family:var(--aihud-font)', `font-size:${11.5 * z}px`, 'font-variant-numeric:tabular-nums',
    ].join(';'));
    list.setAttribute('role', 'listbox');
    list.append(row('follow newest', '', !hud.pinned, false, null));
    const now = Date.now();
    for (const s of hud.sessions) {
      if (!s || !s.session_id) continue;
      const age = num(s.age_seconds);
      const when = age == null ? DASH : age < 86400
        ? (() => { const d = new Date(now - age * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; })()
        : `${Math.floor(age / 86400)}d`;
      const hover = [s.title, s.project_slug].filter(Boolean).join(' · ');
      list.append(row(shortId(s.session_id), when, s.session_id === hud.current, true, s.session_id, hover));
    }
    el.append(list);
    el._aihudListOpen = true;
    if (doc.addEventListener) { doc.addEventListener('click', outside, true); doc.addEventListener('keydown', onKey); }
  }
  anchor.addEventListener('click', () => (list ? close() : open()));
  anchor.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { if (ev.preventDefault) ev.preventDefault(); if (list) close(); else open(); } });
  el._aihudCloseList = close;
  if (reopen) open();
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

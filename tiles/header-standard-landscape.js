// Standard · header · landscape (first column, above time): session id + the viewer's clock, the last skill below.
// Click on the session id opens a plain list of sessions (data.hud, handed in by the HUD);
// picking one dispatches `aihud:select-session` on the tile element.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'header-standard-landscape',
  contentBlock: 'header',
  style: 'standard',
  orientation: 'landscape',
  sizes: [{ cols: 8, rows: 2 }],
  contractVersion: '1.1',
};

const PAD = '2px 14px';

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data"), plus `hud` from the HUD
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const d = data || {};
  const doc = el.ownerDocument;
  const inner = frame(el, size, PAD);

  const id = d.session && typeof d.session.id === 'string' && d.session.id ? d.session.id : null;
  const hud = d.hud && Array.isArray(d.hud.sessions) ? d.hud : null;
  const row = h(doc, 'div', 'display:flex;justify-content:space-between;align-items:baseline;gap:6px');
  const sid = h(doc, hud ? 'button' : 'span',
    'font:inherit;font-family:var(--aihud-font-mono);padding:0;margin:0;border:0;background:none;'
    + `color:var(${id ? '--aihud-text' : '--aihud-faint'})${hud ? ';cursor:pointer' : ''}`,
    id ? id.slice(0, 8) : '–');
  if (id) sid.setAttribute('data-field', 'session.id');
  const clock = h(doc, 'span', 'color:var(--aihud-dim)', hhmm(new Date()));
  clock.setAttribute('data-clock', '');   // the viewer's own clock (value #13), not a reader value
  row.append(sid, clock);

  const last = lastSkill(d);
  const line = h(doc, 'div',
    'color:var(--aihud-dim);font-size:11.5px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis',
    'last skill ');
  const skA = !last && notRecorded(d, 'turn', 'skills');
  const lastEl = h(doc, 'b', `font-weight:500;color:var(${last ? '--aihud-text' : skA ? '--aihud-absent' : '--aihud-faint'})`, last ? `/${last}` : '–');
  if (last || skA) lastEl.setAttribute('data-field', 'turn.turns[].skills[].name');
  line.append(lastEl);
  inner.append(row, line);

  tick(el, clock);
  if (hud) sessionSwitch(el, sid, hud, size.unit / 20);
}

// ── session switch ───────────────────────────────────────────────────────────

function sessionSwitch(el, sid, hud, zoom) {
  const doc = el.ownerDocument;
  const list = h(doc, 'div', [
    'position:fixed', 'inset:auto', 'margin:0', 'padding:4px 0', 'box-sizing:border-box',
    `min-width:${170 * zoom}px`, `max-width:${280 * zoom}px`, 'overflow:auto',
    'background:var(--aihud-panel)', 'color:var(--aihud-text)', 'border:1px solid var(--aihud-line)',
    'border-radius:var(--aihud-radius)', 'box-shadow:0 8px 24px color-mix(in srgb, var(--aihud-bg) 70%, transparent)',
    `font:${11.5 * zoom}px/1.35 var(--aihud-font)`, 'font-variant-numeric:tabular-nums',
  ].join(';'));
  list.setAttribute('role', 'listbox');
  sid.setAttribute('aria-haspopup', 'listbox');
  sid.setAttribute('aria-label', 'switch session');

  const canPop = typeof list.showPopover === 'function';
  const close = () => { if (canPop) { try { list.hidePopover(); } catch { /* already closed */ } } else list.style.display = 'none'; };
  const pick = (sessionId) => {
    close();
    el.dispatchEvent(new CustomEvent('aihud:select-session', { bubbles: true, detail: { session_id: sessionId } }));
  };
  const place = () => {
    if (typeof sid.getBoundingClientRect !== 'function') return;
    const r = sid.getBoundingClientRect();
    const view = doc.defaultView;
    list.style.left = `${Math.max(0, r.left)}px`;
    list.style.top = `${r.bottom + 4 * zoom}px`;
    if (view && view.innerHeight) list.style.maxHeight = `${Math.max(60, view.innerHeight - r.bottom - 8 * zoom)}px`;
  };

  const pad = `${4 * zoom}px ${10 * zoom}px`;
  const entry = (sessionId, strong, cells) => {
    const b = h(doc, 'button', [
      'display:flex', 'justify-content:space-between', 'align-items:baseline', `gap:${12 * zoom}px`, 'width:100%',
      'box-sizing:border-box', `padding:${pad}`, 'margin:0', 'border:0', 'background:none', 'font:inherit',
      'color:inherit', 'text-align:left', 'cursor:pointer',
    ].join(';'));
    b.setAttribute('role', 'option');
    b.setAttribute('aria-selected', String(strong));
    b.setAttribute('data-session-id', sessionId == null ? '' : sessionId);
    for (const c of cells) b.append(c);
    b.addEventListener('pointerenter', () => { b.style.background = 'var(--aihud-line-2)'; });
    b.addEventListener('pointerleave', () => { b.style.background = 'none'; });
    b.addEventListener('click', (ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); pick(sessionId); });
    return b;
  };

  const following = !hud.pinned;
  list.append(entry(null, following, [
    h(doc, 'span', `font-weight:${following ? 600 : 400};color:var(${following ? '--aihud-text' : '--aihud-dim'})`, 'follow newest'),
  ]));
  const nowMs = Date.now();
  for (const s of hud.sessions) {
    if (!s || typeof s.session_id !== 'string') continue;
    const current = s.session_id === hud.current;
    const label = typeof s.title === 'string' && s.title ? s.title : typeof s.project_slug === 'string' ? s.project_slug : '';
    list.append(entry(s.session_id, current, [
      h(doc, 'span', `font-family:var(--aihud-font-mono);flex:none;font-weight:${current ? 600 : 400};color:var(${current ? '--aihud-text' : '--aihud-dim'})`,
        s.session_id.slice(0, 8)),
      h(doc, 'span', 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--aihud-faint)', label),
      h(doc, 'span', 'flex:none;color:var(--aihud-dim)', lastSeen(s.age_seconds, nowMs)),
    ]));
  }

  if (canPop) {
    list.setAttribute('popover', 'auto');
    sid.popoverTargetElement = list;
    sid.popoverTargetAction = 'toggle';
    list.addEventListener('beforetoggle', (ev) => { if (ev.newState === 'open') place(); });
  } else {
    list.style.display = 'none';
    sid.addEventListener('click', () => {
      const open = list.style.display !== 'none';
      if (!open) place();
      list.style.display = open ? 'none' : 'block';
    });
  }
  el.append(list);
}

/** Clock time of the last sign of life for the last day, else whole days ago; `–` when unknown. */
function lastSeen(ageSeconds, nowMs) {
  if (typeof ageSeconds !== 'number' || !Number.isFinite(ageSeconds) || ageSeconds < 0) return '–';
  if (ageSeconds < 86400) return hhmm(new Date(nowMs - ageSeconds * 1000));
  return `${Math.floor(ageSeconds / 86400)}d`;
}

// ── data ─────────────────────────────────────────────────────────────────────

/** Name of the most recently started skill of the session, or null. */
function lastSkill(d) {
  const turns = d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : [];
  let best = null;
  let bestAt = -Infinity;
  for (const t of turns) {
    for (const s of (t && Array.isArray(t.skills) ? t.skills : [])) {
      if (!s || typeof s.name !== 'string' || !s.name) continue;
      const at = Date.parse(s.time);
      const key = Number.isFinite(at) ? at : bestAt;
      if (key >= bestAt) { best = s.name; bestAt = key; }
    }
  }
  return best;
}

// ── drawing ──────────────────────────────────────────────────────────────────

function hhmm(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** The viewer's clock keeps ticking between redraws; one timer per tile element (a redraw replaces
 * it), and it stops once the tile left the page. */
function tick(el, node) {
  if (el._aihudClock) clearInterval(el._aihudClock);
  const t = setInterval(() => {
    if (!node.isConnected) clearInterval(t);
    else node.textContent = hhmm(new Date());
  }, 10000);
  if (t && typeof t.unref === 'function') t.unref();
  el._aihudClock = t;
}

function h(doc, tag, css, text) {
  const n = doc.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}

/** The tile box at its exact pixel size; inside, the sketch at 20 px per unit, zoomed to the unit. */
function frame(el, size, pad) {
  const doc = el.ownerDocument;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
    + 'background:var(--aihud-panel);color:var(--aihud-text)');
  const inner = h(doc, 'div', `width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
    + `box-sizing:border-box;padding:${pad};display:grid;align-content:safe center;`
    + 'font:13px/1.35 var(--aihud-font);font-variant-numeric:tabular-nums');
  box.append(inner);
  el.replaceChildren(box);
  return inner;
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

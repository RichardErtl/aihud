// Splitflap (departure board) · header · landscape: session id + the viewer's clock on flaps, the last skill on its own flap row.
// Split-flap look: flaps, timetable rows, lamp from the heat scale. Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn at 20 px per unit, zoomed to the unit.

export const meta = {
  name: 'header-splitflap-landscape',
  contentBlock: 'header',
  style: 'splitflap',
  orientation: 'landscape',
  sizes: [{ cols: 18, rows: 2 }],
  contractVersion: '1.1',
};

const FB = (() => {
  const SVGNS = 'http://www.w3.org/2000/svg';

  // flap cell presets (sketch px): w, h, font size, gap
  const CELL = {
    L: { w: 12, h: 18, fs: 13.5, gap: 1.5 },
    M: { w: 10, h: 15, fs: 11, gap: 1 },
    S: { w: 8, h: 12, fs: 9.5, gap: 1 },
  };

  const LABEL = 'font:600 9.5px/11px var(--aihud-font);letter-spacing:.09em;text-transform:uppercase;white-space:nowrap';

  const MONO = 'font:500 9.5px/12px var(--aihud-font-mono);white-space:nowrap;overflow:hidden';

  function h(doc, tag, css, text) {
    const n = doc.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Tile box at its exact pixel size; inside, the board at 20 px per unit, zoomed to the unit. */
  function frame(el, size, pad) {
    const doc = el.ownerDocument;
    const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
      + 'background:var(--aihud-panel);color:var(--aihud-text)');
    const inner = h(doc, 'div', `width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
      + `box-sizing:border-box;padding:${pad};overflow:hidden;display:flex;flex-direction:column;justify-content:center;`
      + 'font:11px/1.2 var(--aihud-font);font-variant-numeric:tabular-nums');
    box.append(inner);
    const memo = el._fbMemo || {};
    el.replaceChildren(box);
    el._fbMemo = {};
    return { doc, inner, memo, next: el._fbMemo, w: size.cols * 20 };
  }

  const cellsWidth = (n, c) => n * c.w + Math.max(0, n - 1) * c.gap;

  const capacity = (width, c) => Math.max(1, Math.floor((width + c.gap) / (c.w + c.gap)));

  function motionOk(doc) {
    const v = doc.defaultView;
    try { return !(v && v.matchMedia && v.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return true; }
  }

  /**
   * A row of n flap cells holding `text` (upper-cased, cut to n, padded with blank flaps).
   * align 'right' pads on the left (numbers). key: changed characters against the last redraw flip.
   */
  function flaps(F, text, n, c, opt = {}) {
    const { doc } = F;
    let s = String(text == null ? '' : text).toUpperCase();
    if (s.length > n) s = s.slice(0, n - 1) + '…';
    s = opt.align === 'right' ? s.padStart(n, ' ') : s.padEnd(n, ' ');
    const row = h(doc, 'div', `display:flex;flex:none;gap:${c.gap}px;width:${cellsWidth(n, c)}px;height:${c.h}px`);
    const prev = opt.key && typeof F.memo[opt.key] === 'string' ? F.memo[opt.key] : null;
    if (opt.key) F.next[opt.key] = s;
    if (opt.field) row.setAttribute('data-field', opt.field);   // value mark (CONTRACT.md "Value marks")
    const color = opt.color || '--aihud-text';
    const move = opt.key && motionOk(doc);
    for (let i = 0; i < n; i++) {
      const ch = s[i];
      const cell = h(doc, 'div', [
        'flex:none', `width:${c.w}px`, `height:${c.h}px`, 'box-sizing:border-box',
        'display:flex', 'align-items:center', 'justify-content:center',
        `font:600 ${c.fs}px/1 var(--aihud-font-mono)`, `color:var(${color})`,
        'border-radius:var(--aihud-radius-small)', 'box-shadow:inset 0 0 0 0.5px var(--aihud-line)',
        'background:linear-gradient(to bottom,'
          + 'color-mix(in srgb, var(--aihud-text) 13%, var(--aihud-bg)) 0 calc(50% - 0.5px),'
          + 'var(--aihud-panel) calc(50% - 0.5px) calc(50% + 0.5px),'
          + 'color-mix(in srgb, var(--aihud-text) 5%, var(--aihud-bg)) calc(50% + 0.5px) 100%)',
      ].join(';'), ch === ' ' ? '' : ch);
      row.append(cell);
      if (move && (prev == null || prev[i] !== ch) && ch !== ' ' && typeof cell.animate === 'function') {
        cell.animate([{ transform: 'rotateX(88deg)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
          { duration: 260, delay: i * 28, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' });
      }
    }
    return row;
  }

  /** Signage label (warm yellow of heat-30) with an optional departure pictogram. */
  function sign(F, text, picto) {
    const { doc } = F;
    const s = h(doc, 'div', `${LABEL};display:flex;align-items:center;gap:3px;color:var(--aihud-heat-text-30);min-width:0;overflow:hidden`);
    if (picto) {
      const svg = doc.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '10'); svg.setAttribute('height', '10');
      svg.style.cssText = 'flex:none;display:block';
      const p = doc.createElementNS(SVGNS, 'path');
      p.setAttribute('d', 'M2.5 19h19v2h-19zM22.07 9.64c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85z');
      p.setAttribute('fill', 'currentColor');
      svg.append(p);
      s.append(svg);
    }
    s.append(h(doc, 'span', 'overflow:hidden;text-overflow:clip', text));
    return s;
  }

  const label = (F, text, extra = '') => h(F.doc, 'div', `${LABEL};color:var(--aihud-dim);overflow:hidden;${extra}`, text);

  const mono = (F, text, css = '') => h(F.doc, 'div', `${MONO};${css}`, text);

  const line = (F, css) => h(F.doc, 'div', `display:flex;align-items:center;flex:none;min-width:0;${css || ''}`);

  // ---- time formats (all '–' when unknown) ----
  const DASH = '–';

  const p2 = (n) => String(n).padStart(2, '0');

  function hhmm(date) { return `${p2(date.getHours())}:${p2(date.getMinutes())}`; }

  // ---- data readers ----
  const turnsOf = (d) => d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((t) => t && typeof t === 'object') : [];

  function lastSkill(d) {
    let best = null, at = -Infinity;
    for (const t of turnsOf(d)) for (const s of (Array.isArray(t.skills) ? t.skills : [])) {
      if (!s || typeof s.name !== 'string' || !s.name) continue;
      const k = Date.parse(s.time); const key = Number.isFinite(k) ? k : at;
      if (key >= at) { best = s.name; at = key; }
    }
    return best;
  }

  function sessionId(d) { return d && d.session && typeof d.session.id === 'string' && d.session.id ? d.session.id.slice(0, 8) : null; }

  function hasSession(d) { return !!(d && (d.session || d.live || d.turn)); }

  /** The viewer's clock keeps ticking between redraws; one timer per tile element. */
  function tick(el, node, F, n, c) {
    if (el._aihudClock) clearInterval(el._aihudClock);
    const t = setInterval(() => {
      if (!node.isConnected) { clearInterval(t); return; }
      F.memo = el._fbMemo || {};
      F.next = el._fbMemo = Object.assign({}, F.memo);
      const fresh = flaps(F, hhmm(new Date()), n, c, { key: 'clock', align: 'right', color: '--aihud-dim' });
      node.replaceWith(fresh); node = fresh;
    }, 10000);
    if (t && typeof t.unref === 'function') t.unref();
    el._aihudClock = t;
  }
  return { SVGNS, CELL, LABEL, MONO, h, frame, cellsWidth, capacity, motionOk, flaps, sign, label, mono, line, DASH, p2, hhmm, turnsOf, lastSkill, sessionId, hasSession, tick };
})();

export function render(el, data, size) {
  const d = data || {};
  const F = FB.frame(el, size, '4px 6px');
  const W = F.w - 12, M = FB.CELL.M;
  const id = FB.sessionId(d), live = FB.hasSession(d), skill = FB.lastSkill(d), skA = !skill && notRecorded(d, 'turn', 'skills');
  const hud = d.hud && Array.isArray(d.hud.sessions) ? d.hud : null;
  const idFlaps = FB.flaps(F, id || FB.DASH, 8, M, { key: 'id', field: id ? 'session.id' : null, color: id ? '--aihud-text' : '--aihud-faint' });
  let idNode = idFlaps;
  if (hud) {   // the flap row becomes the trigger of the session list (CONTRACT.md "Session switch")
    idNode = swNode(F.doc, 'button', 'display:block;font:inherit;padding:0;margin:0;border:0;background:none;color:inherit;cursor:pointer');
    idNode.append(idFlaps);
  }
  const idW = FB.cellsWidth(8, M), clW = FB.cellsWidth(5, M), GAP = 10;
  const skW = W - idW - clW - 2 * GAP, n = FB.capacity(skW, M);
  const col = (w, head, body, end) => {
    const c = FB.h(F.doc, 'div', `display:flex;flex-direction:column;flex:none;width:${w}px;gap:2px;align-items:${end ? 'flex-end' : 'flex-start'}`);
    c.append(head, body); return c;
  };
  const row = FB.line(F, `width:${W}px;gap:${GAP}px;align-items:flex-start`);
  const clock = FB.flaps(F, live ? FB.hhmm(new Date()) : FB.DASH, 5, M, { key: 'clock', align: 'right', color: live ? '--aihud-dim' : '--aihud-faint' });
  row.append(
    col(idW, FB.sign(F, 'Session', true), idNode),
    col(skW, FB.label(F, 'Last skill'), FB.flaps(F, skill || FB.DASH, n, M, { key: 'skill', field: skill || skA ? 'turn.turns[].skills[].name' : null, color: skill ? '--aihud-text' : skA ? '--aihud-absent' : '--aihud-faint' })),
    col(clW, FB.label(F, 'Local'), clock, true),
  );
  F.inner.append(row);
  if (live) FB.tick(el, clock, F, 5, M);
  if (hud) sessionSwitch(el, idNode, hud, size.unit / 20);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

// ── session switch (CONTRACT.md "Session switch (header tile)") ───────────────────────

const swNode = (doc, tag, css, text) => {
  const n = doc.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
};
const swHhmm = (date) => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

function sessionSwitch(el, sid, hud, zoom) {
  const doc = el.ownerDocument;
  const list = swNode(doc, 'div', [
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
    const b = swNode(doc, 'button', [
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
    swNode(doc, 'span', `font-weight:${following ? 600 : 400};color:var(${following ? '--aihud-text' : '--aihud-dim'})`, 'follow newest'),
  ]));
  const nowMs = Date.now();
  for (const s of hud.sessions) {
    if (!s || typeof s.session_id !== 'string') continue;
    const current = s.session_id === hud.current;
    const label = typeof s.title === 'string' && s.title ? s.title : typeof s.project_slug === 'string' ? s.project_slug : '';
    list.append(entry(s.session_id, current, [
      swNode(doc, 'span', `font-family:var(--aihud-font-mono);flex:none;font-weight:${current ? 600 : 400};color:var(${current ? '--aihud-text' : '--aihud-dim'})`,
        s.session_id.slice(0, 8)),
      swNode(doc, 'span', 'flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--aihud-faint)', label),
      swNode(doc, 'span', 'flex:none;color:var(--aihud-dim)', lastSeen(s.age_seconds, nowMs)),
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
  if (ageSeconds < 86400) return swHhmm(new Date(nowMs - ageSeconds * 1000));
  return `${Math.floor(ageSeconds / 86400)}d`;
}

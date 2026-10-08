// Context at a glance: #1 context fill, #2 tokens, #9 session time - each number on its own hairline. (portrait, 8 × 4)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'glance-hairline-portrait',
  contentBlock: 'glance',
  style: 'hairline',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 4 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, z, k } = card(el, size);
  k.style.justifyContent = 'space-between';
  for (const g of glance(data)) {
    const blk = h(doc, 'div', 'display:flex;flex-direction:column;flex:none');
    const r = row(doc);
    r.append(fig(doc, z, 15, 18, g.segs, g.color, g.field, g.absent), h(doc, 'div', LBL(z) + `;margin-bottom:${1 * z}px`, g.label));
    blk.append(r, h(doc, 'div', `height:${2 * z}px`), g.line(doc));
    k.append(blk);
  }
  sessionChip(el, data, size);   // session switch (CONTRACT.md "Session switch")
}

// ── drawing helpers (copied in so this tile stands alone) ──
const DASH = '–';

const HEAT_STOPS = [0, 30, 50, 75, 100];

const HEAT_FILL = ['var(--aihud-heat-0)', 'var(--aihud-heat-30)', 'var(--aihud-heat-50)', 'var(--aihud-heat-75)', 'var(--aihud-heat-100)'];

const HEAT_TEXT = ['var(--aihud-heat-text-0)', 'var(--aihud-heat-text-30)', 'var(--aihud-heat-text-50)', 'var(--aihud-heat-text-75)', 'var(--aihud-heat-text-100)'];

function heat(v, ramp = HEAT_FILL) {
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i]) i++;
  const p = ((HEAT_STOPS[i] - x) / (HEAT_STOPS[i] - HEAT_STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}

function h(doc, tag, css, text) {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = String(text);
  return e;
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;

const time = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

/** Box cols x unit by rows x unit, a 2 px inset card; returns the inner size in sketch px (unit 20). */
function card(el, size, padY = 5, padX = 6) {
  const doc = el.ownerDocument, z = size.unit / 20;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;padding:${2 * z}px;overflow:hidden;font-family:var(--aihud-font);color:var(--aihud-text)`);
  const k = h(doc, 'div', `height:100%;box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;padding:${padY * z}px ${padX * z}px;background:var(--aihud-panel);border-radius:var(--aihud-radius)`);
  box.append(k);
  el.replaceChildren(box);
  return { doc, z, box, k, W: size.cols * 20 - 4 - 2 * padX, H: size.rows * 20 - 4 - 2 * padY };
}

const LBL = (z) => `color:var(--aihud-faint);font-size:${9.5 * z}px;line-height:${12 * z}px;height:${12 * z}px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;overflow:hidden`;

/** 812 / 534k / 5.8M; missing -> null (the caller draws the dash). */
function compact(n) {
  if (num(n) == null) return null;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

// number segments: [{t, small}] — digits heavy, units / decimals at .55 em
const pctSeg = (v) => { if (num(v) == null) return null; const [a, b] = v.toFixed(1).split('.'); return [{ t: a }, { t: `.${b}%`, s: 1 }]; };

const tokSeg = (n) => { const c = compact(n); if (c == null) return null; const m = c.match(/^([\d.]+)([kM]?)$/); return m ? [{ t: m[1] }, { t: m[2], s: 1 }] : [{ t: c }]; };

function durSeg(ms) {
  if (num(ms) == null || ms < 0) return null;
  if (ms < 60000) return [{ t: String(Math.round(ms / 1000)) }, { t: 's', s: 1 }];
  const m = Math.round(ms / 60000), hh = Math.floor(m / 60), mm = m % 60;
  return hh ? [{ t: String(hh) }, { t: 'h ', s: 1 }, { t: String(mm) }, { t: 'm', s: 1 }] : [{ t: String(mm) }, { t: 'm', s: 1 }];
}

/** A heavy number line; null segments -> the faint dash. */
function fig(doc, z, px, lh, segs, color, df, absent) {
  const d = h(doc, 'div', `font-size:${px * z}px;line-height:${lh * z}px;height:${lh * z}px;font-weight:650;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;letter-spacing:-.01em;color:${segs ? color || 'var(--aihud-text)' : 'var(--aihud-faint)'}`);
  if (!segs) { d.textContent = DASH; if (absent) { d.style.color = 'var(--aihud-absent)'; d.setAttribute('data-field', df); } return d; }
  if (df) d.setAttribute('data-field', df);
  for (const g of segs) d.append(h(doc, 'span', g.s ? 'font-size:.55em;font-weight:500;letter-spacing:0' : '', g.t));
  return d;
}

/** THE hairline: 1 px track, coloured segments [{a, b, color, glow}] as fractions 0..1, an optional end tick. */
function hair(doc, segs, tick) {
  const line = h(doc, 'div', 'position:relative;height:1px;flex:none;background:var(--aihud-line)');
  for (const g of segs) {
    if (!(g.b > g.a)) continue;
    const gap = g.gapL ? ' + 2px' : '';
    line.append(h(doc, 'div', `position:absolute;top:0;height:1px;left:calc(${(g.a * 100).toFixed(2)}%${gap});width:calc(${((g.b - g.a) * 100).toFixed(2)}%${g.gapL ? ' - 2px' : ''});background:${g.color}${g.glow ? `;box-shadow:0 0 var(--aihud-glow) ${g.color}` : ''}`));
  }
  if (tick) line.append(h(doc, 'div', `position:absolute;top:-2px;height:5px;width:1px;left:calc(${(tick.at * 100).toFixed(2)}% - ${tick.at > 0.5 ? 1 : 0}px);background:${tick.color}`));
  return line;
}

const frac = (a, b) => (num(a) != null && num(b) != null && b > 0 ? Math.max(0, Math.min(1, a / b)) : null);

/** Context gauge: fill fraction in heat, tick at "now". */
function ctxHair(doc, pct) {
  if (num(pct) == null) return hair(doc, []);
  const f = Math.max(0, Math.min(1, pct / 100)), c = heat(pct);
  return hair(doc, [{ a: 0, b: f, color: c, glow: 1 }], { at: f, color: c });
}

/** A split line: part / total, the rest after a 2 px gap. */
function splitHair(doc, part, total, colA, colB) {
  const f = frac(part, total);
  if (f == null) return hair(doc, []);
  return hair(doc, [{ a: 0, b: f, color: colA }, { a: f, b: 1, color: colB, gapL: 1 }]);
}

function sessionMs(d) {
  const a = time(d && d.session && d.session.started_at), i = inst(d), b = time(i && i.last_activity);
  return a != null && b != null && b >= a ? b - a : null;
}

const row = (doc, css = '') => h(doc, 'div', `display:flex;justify-content:space-between;align-items:flex-end;gap:6px;flex:none;min-width:0;${css}`);

function glance(data) {
  const i = inst(data), s = data && data.session;
  const pct = num(i && i.context_percent), tot = num(i && i.tokens_total), main = num(i && i.tokens_main);
  const work = num(s && s.work_ms), wait = num(s && s.wait_ms);
  return [
    { label: 'context', field: 'live.instances[].context_percent', absent: pct == null && notRecorded(data, 'live', 'tokens'), segs: pctSeg(pct), color: pct == null ? null : heat(pct, HEAT_TEXT), line: (doc) => ctxHair(doc, pct) },
    { label: 'tokens', field: 'live.instances[].tokens_total', absent: tot == null && notRecorded(data, 'live', 'tokens'), segs: tokSeg(tot), line: (doc) => splitHair(doc, main, tot, 'var(--aihud-main)', 'var(--aihud-sub)') },
    { label: 'session', field: 'session.started_at live.instances[].last_activity', segs: durSeg(sessionMs(data)), line: (doc) => splitHair(doc, work, work != null && wait != null ? work + wait : null, 'var(--aihud-dim)', 'var(--aihud-faint)') },
  ];
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

/** Glance tiles show no session id of their own: a small id chip in the top right corner carries the switch.
 * No `data.hud` (an older HUD) = no chip, no list. */
function sessionChip(el, data, size) {
  const hud = data && data.hud && Array.isArray(data.hud.sessions) ? data.hud : null;
  if (!hud) return;
  const doc = el.ownerDocument;
  const sid = (typeof hud.current === 'string' && hud.current) || (data.session && typeof data.session.id === 'string' && data.session.id) || null;
  const chip = swNode(doc, 'button', [
    'position:absolute', 'top:0', 'right:0', 'z-index:2', 'margin:0', 'padding:0 3px', 'border:0', 'background:none',
    `font:${Math.max(8, 0.4 * size.unit)}px/${Math.max(9, 0.45 * size.unit)}px var(--aihud-font-mono)`,
    'color:var(--aihud-faint)', 'opacity:.8', 'cursor:pointer',
  ].join(';'), sid ? sid.slice(0, 8) : '–');
  chip.setAttribute('data-session-switch', '');
  if (!el.style.position || el.style.position === 'static') el.style.position = 'relative';   // keep a host's absolute
  el.append(chip);
  sessionSwitch(el, chip, hud, size.unit / 20);
}

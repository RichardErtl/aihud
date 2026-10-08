// Numeral · context at a glance · landscape
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = { name: 'glance-numeral-landscape', contentBlock: 'glance', style: 'numeral', orientation: 'landscape', sizes: [{ cols: 12, rows: 5 }], contractVersion: '1.1' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const DASH = '–';

/* value marks (CONTRACT.md "Value marks and the tip"): data-field = catalog path(s) a value was read from */
const fa = (f) => (f ? ` data-field="${f}"` : '');
const P = (...a) => [...new Set(a.filter(Boolean).join(' ').split(' ').filter(Boolean))].join(' ');

/* the contract's heat function: kind '' = surfaces, 'text-' = numbers and thin strokes */
function heat(v, kind) {
  const S = [0, 30, 50, 75, 100]; v = clamp(v, 0, 100);
  let a = 0, b = 30;
  for (let i = 0; i < 4; i++) if (v > S[i] && v <= S[i + 1]) { a = S[i]; b = S[i + 1]; }
  const p = ((b - v) / (b - a) * 100).toFixed(1);
  return `color-mix(in srgb, var(--aihud-heat-${kind}${a}) ${p}%, var(--aihud-heat-${kind}${b}))`;
}


function tok(n) {
  if (!isNum(n)) return DASH;
  if (n >= 999500) return (n / 1e6).toFixed(n >= 9.995e6 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
  if (n >= 99950) return Math.round(n / 1000) + 'k';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(Math.round(n));
}

function hms(sec) {               /* h:mm:ss above an hour, else m:ss */
  if (!isNum(sec)) return DASH;
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function pctSplit(v) {
  if (!isNum(v)) return [DASH, ''];
  const t = (Math.round(v * 10) / 10).toFixed(1).split('.');
  return [t[0], '.' + t[1] + '%'];
}


/* every value one sheet can give, read once; missing = null */
function vals(data) {
  const d = data && typeof data === 'object' ? data : {};
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const turns = d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter(Boolean) : [];
  const pts = d.context && Array.isArray(d.context.points) ? d.context.points.filter((p) => p && isNum(p.percent)) : [];
  const t0 = d.session ? Date.parse(d.session.started_at) : NaN;
  const t1 = inst ? Date.parse(inst.last_activity) : NaN;
  const last = turns.length ? turns[turns.length - 1] : null;
  const lastPt = pts.length ? pts[pts.length - 1] : null;
  const pct = inst && isNum(inst.context_percent) ? inst.context_percent : lastPt ? lastPt.percent : null;
  const pctPath = inst && isNum(inst.context_percent) ? 'live.instances[].context_percent' : lastPt ? 'context.points[].percent' : null;
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const okSpan = Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0;
  return {
    t0: okSpan ? t0 : null, t1: okSpan ? t1 : null, sessionS: okSpan ? (t1 - t0) / 1000 : null,
    sessionPath: okSpan ? 'session.started_at live.instances[].last_activity' : null,
    turns, turnNo: last && isNum(last.number) ? last.number : null, turnS: last && isNum(last.duration_s) ? last.duration_s : null,
    pct, pctPath, pts, peak: pts.length ? Math.max(...pts.map((p) => p.percent)) : null,
    inWindow: lastPt && isNum(lastPt.tokens_in_window) ? lastPt.tokens_in_window : null,
    window: inst && isNum(inst.context_window) ? inst.context_window : null,
    total, main: inst && isNum(inst.tokens_main) ? inst.tokens_main : null,
    pctAt(ms) { let p = null; for (const q of pts) { const t = Date.parse(q.time); if (t <= ms) p = q.percent; } return p; },
  };
}


/* layout: everything absolutely placed in unit multiples, so it can be measured to fit */
function tileBox(el, size, inner) {
  const W = size.cols * size.unit, H = size.rows * size.unit;
  el.innerHTML = `<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:var(--aihud-panel);`
    + `border-radius:var(--aihud-radius);color:var(--aihud-text);font-family:var(--aihud-font);font-variant-numeric:tabular-nums lining-nums">${inner}</div>`;
}

const AT = (u) => (x, y, w, h, css, html, f) =>
  `<div${fa(f)} style="position:absolute;left:${(x * u).toFixed(2)}px;top:${(y * u).toFixed(2)}px;width:${(w * u).toFixed(2)}px;height:${(h * u).toFixed(2)}px;`
  + `line-height:${(h * u).toFixed(2)}px;font-size:${(0.48 * u).toFixed(2)}px;white-space:nowrap;overflow:hidden;${css || ''}">${html}</div>`;

const LAB = (u) => `font-size:${(0.48 * u).toFixed(2)}px;letter-spacing:.09em;text-transform:uppercase;color:var(--aihud-dim);font-weight:500;`;

const VAL = (u, s) => `font-size:${(s * u).toFixed(2)}px;color:var(--aihud-text);font-weight:400;`;

const lab = (u, t) => `<span style="${LAB(u)}">${t}</span>`;

const val = (u, s, t, faintIfDash, f, abs) => `<span${fa(t === DASH ? (abs ? f : null) : f)} style="${VAL(u, s)}${abs && t === DASH ? 'color:var(--aihud-absent);' : faintIfDash && t === DASH ? 'color:var(--aihud-faint);' : ''}">${t}</span>`;

function glow(u, c) { return `text-shadow:0 0 calc(var(--aihud-glow) * ${(2.4 * u / 20).toFixed(2)}) ${c};`; }


/* the lead numeral: main figure ultra-thin, the remainder rides at the cap line */
function numeral(at, u, x, y, w, F, main, ride, color, align, fld, abs) {
  const f = Math.max(0.48, 0.3 * F), mt = Math.max(0, 0.1 * F - 0.205 * f);
  const c = main === DASH ? (abs ? 'var(--aihud-absent)' : 'var(--aihud-faint)') : color || 'var(--aihud-text)';
  const shadow = main !== DASH && color && color.startsWith('color-mix') ? glow(u, color) : '';
  return at(x, y, w, 0.8 * F, `display:flex;align-items:flex-start;overflow:visible;${align === 'right' ? 'justify-content:flex-end;' : ''}`,
    `<div${fa(main === DASH && !abs ? null : fld)} style="flex:0 1 auto;min-width:0;overflow:visible;font-size:${(F * u).toFixed(2)}px;line-height:${(0.8 * F * u).toFixed(2)}px;`
    + `font-weight:200;letter-spacing:-.02em;color:${c};${shadow}">${main}</div>`
    + (ride ? `<div${fa(fld)} style="flex:none;font-size:${(f * u).toFixed(2)}px;line-height:${(f * u).toFixed(2)}px;margin-top:${(mt * u).toFixed(2)}px;`
      + `margin-left:${(0.08 * u).toFixed(2)}px;font-weight:300;color:var(--aihud-dim)">${ride}</div>` : ''));
}


/* the context chapter ring, unrolled: 50 ticks = 2 % each, majors every 10 %, lit ticks take the heat of their position */
function chapterRing(v, u, w, h) {
  const s = Math.max(1, Math.round(u / 20)), W = w * u, H = h * u, n = 50;
  let g = '';
  for (let i = 0; i < n; i++) {
    const x = i * (W - s) / (n - 1), at = i * 2, maj = i % 5 === 0, hh = maj ? H : 0.55 * H;
    let c = 'var(--aihud-line)';
    if (isNum(v.pct) && at < v.pct) c = heat(at, '');
    else if (isNum(v.peak) && at < v.peak) c = 'var(--aihud-faint)';   /* high-water ghost: reached earlier, compacted since */
    g += `<rect x="${x.toFixed(2)}" y="${(H - hh).toFixed(2)}" width="${s}" height="${hh.toFixed(2)}" style="fill:${c}"/>`;
  }
  return `<svg width="${W.toFixed(2)}" height="${H.toFixed(2)}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" style="display:block;overflow:hidden">${g}</svg>`;
}

const svgAt = (at, x, y, w, h, svg, f) => at(x, y, w, h, 'line-height:0;', svg, f);

const vline = (at, u, x, y, h) => at(x, y, Math.max(1, Math.round(u / 20)) / u, h, 'background:var(--aihud-line);', '');

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const u = size.unit, v = vals(data), at = AT(u), [m, r] = pctSplit(v.pct);
  const absPct = !isNum(v.pct) && notRecorded(data, 'live', 'tokens'), absTot = v.total == null && notRecorded(data, 'live', 'tokens');
  const absPeak = !isNum(v.peak) && notRecorded(data, 'context', 'points'), absIn = v.inWindow == null && notRecorded(data, 'context', 'points'), absWin = v.window == null && notRecorded(data, 'live', 'tokens');
  const c = isNum(v.pct) ? heat(v.pct, 'text-') : null, sw = Math.max(1, Math.round(u / 20)) * 2 / u;
  const share = v.main != null && v.total ? clamp(v.main / v.total, 0, 1) : null;
  const row = (y, l, t, f, abs) => at(6.85, y, 4.65, 0.7, 'display:flex;justify-content:space-between;align-items:baseline;', lab(u, l) + (typeof t === 'string' && t.startsWith('<') ? t : val(u, 0.62, t, true, f, abs)));
  const TOT = 'live.instances[].tokens_total', MAIN = 'live.instances[].tokens_main';
  tileBox(el, size,
    at(0.5, 0.45, 5.6, 0.6, LAB(u), 'Context fill')
    + numeral(at, u, 0.5, 1.2, 5.7, 2.8, m, r, c, undefined, absPct ? 'live.instances[].context_percent' : v.pctPath, absPct)
    + svgAt(at, 0.5, 3.75, 5.7, 0.75, chapterRing(v, u, 5.7, 0.75), isNum(v.pct) || isNum(v.peak) ? P(isNum(v.pct) && v.pctPath, isNum(v.peak) && 'context.points[].percent') : null)
    + vline(at, u, 6.5, 0.55, 3.9)
    + row(0.4, 'Tokens', tok(v.total), TOT, absTot)
    + (share == null ? at(6.85, 1.12, 4.65, sw, 'background:var(--aihud-line-2);', '')
      : at(6.85, 1.12, 4.65 * share, sw, 'background:var(--aihud-main);', '', MAIN) + at(6.85 + 4.65 * share, 1.12, 4.65 * (1 - share), sw, 'background:var(--aihud-sub);', '', P(TOT, MAIN)))
    + at(6.85, 1.2, 4.65, 0.55, LAB(u) + 'color:var(--aihud-faint);display:flex;justify-content:space-between;', '<span>Main</span><span>Sub</span>')
    + row(1.9, 'Session', hms(v.sessionS), v.sessionPath)
    + (!absIn && !absWin ? row(2.85, 'Load', tok(v.inWindow) + ' / ' + tok(v.window), P(v.inWindow != null && 'context.points[].tokens_in_window', v.window != null && 'live.instances[].context_window')) : row(2.85, 'Load', val(u, 0.62, tok(v.inWindow), true, 'context.points[].tokens_in_window', absIn) + `<span style="${VAL(u, 0.62)}color:var(--aihud-faint);">&nbsp;/&nbsp;</span>` + val(u, 0.62, tok(v.window), true, 'live.instances[].context_window', absWin)))
    + row(3.8, 'Peak', isNum(v.peak) ? v.peak.toFixed(1) + '%' : DASH, 'context.points[].percent', absPeak));
  sessionChip(el, data, size);   // session switch (CONTRACT.md "Session switch")
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

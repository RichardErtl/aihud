// Backlight - context at a glance (portrait): the afterglow filament.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'glance-backlight-portrait',
  contentBlock: 'glance',
  style: 'backlight',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 5 }],
  contractVersion: '1.1',
};

const STOPS = [0, 30, 50, 75, 100];

const FILL = STOPS.map((s) => 'var(--aihud-heat-' + s + ')');

const TEXT = STOPS.map((s) => 'var(--aihud-heat-text-' + s + ')');

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const clamp = (v) => Math.max(0, Math.min(100, v));

/** CONTRACT.md heat function: straight srgb mix of the two neighbouring stops. */
function heat(v, ramp) {
  const r = ramp || FILL, x = clamp(v);
  let i = 1;
  while (i < STOPS.length - 1 && x > STOPS[i]) i++;
  const p = ((STOPS[i] - x) / (STOPS[i] - STOPS[i - 1])) * 100;
  return 'color-mix(in srgb, ' + r[i - 1] + ' ' + p.toFixed(1) + '%, ' + r[i] + ')';
}

const textHeat = (v) => heat(v, TEXT);

const fade = (c, pct) => 'color-mix(in srgb, ' + c + ' ' + pct.toFixed(1) + '%, transparent)';

/** The lit edge: above 55 % the deep stops sink into black - rim / core mixed toward the text colour. */
const hot = (v) => clamp(v) >= 55;

const edge = (v) => 'color-mix(in srgb, ' + heat(v) + ' ' + (80 - 40 * Math.max(0, (clamp(v) - 55) / 45)).toFixed(0) + '%, var(--aihud-text))';

/** Glow radius grows with the value; scaled off --aihud-glow (0px in light = no glow) and the zoom. */
const glow = (v, z, k) => 'calc(var(--aihud-glow) * ' + ((0.6 + 2.4 * clamp(v) / 100) * z * (k || 1)).toFixed(2) + ')';

function frame(el, size) {
  const u = size.unit, z = u / 20, doc = el.ownerDocument;
  const box = doc.createElement('div');
  box.style.cssText = 'position:relative;overflow:hidden;width:' + size.cols * u + 'px;height:' + size.rows * u + 'px;'
    + 'background:var(--aihud-bg);box-shadow:inset 0 0 0 1px var(--aihud-line-2);border-radius:var(--aihud-radius);'
    + 'font-family:var(--aihud-font);color:var(--aihud-text)';
  el.replaceChildren(box);
  return { box, u, z };
}

function add(box, css, text) {
  const n = box.ownerDocument.createElement('div');
  n.style.cssText = 'position:absolute;line-height:1;white-space:nowrap;' + css;
  if (text != null) n.textContent = text;
  box.append(n);
  return n;
}

function span(parent, css, text) {
  const n = parent.ownerDocument.createElement('span');
  n.style.cssText = css;
  n.textContent = text;
  parent.append(n);
  return n;
}

const pos = (o) => (o.right != null ? 'right:' + o.right + 'px;' : 'left:' + o.x + 'px;') + 'top:' + o.y + 'px;';

/** Caption: unlit, 10 px at unit 20. */
const label = (box, u, o, text) => add(box, pos(o) + 'font:500 ' + 0.5 * u + 'px var(--aihud-font);letter-spacing:.16em;color:var(--aihud-dim)', text);

/** A plain second value (unlit). */
const val = (box, u, o, size, text, has) => add(box, pos(o) + 'font:' + size + 'px var(--aihud-font-mono);font-variant-numeric:tabular-nums;color:var(--aihud-' + (has ? 'text' : 'faint') + ')', has ? text : '–');

function glowText(v, u, z) {
  const c = heat(v);
  let s = '0 0 ' + glow(v, z, 0.5) + ' ' + c + ', 0 0 ' + glow(v, z, 1.6) + ' ' + fade(c, 45);
  if (hot(v)) s = '0 0 ' + Math.max(0.6, 0.05 * u).toFixed(2) + 'px ' + edge(v) + ', ' + s;
  return s;
}

/** The one crisp number: thin weight, heat colour, glow growing with the value. */
function num(box, u, z, o) {
  const has = o.v != null;
  const n = add(box, pos(o) + (o.width != null ? 'width:' + o.width + 'px;text-align:center;' : '')
    + 'font:' + (o.weight || 300) + ' ' + o.size + 'px var(--aihud-font);letter-spacing:-.02em;font-variant-numeric:tabular-nums;'
    + 'color:' + (has ? textHeat(o.v) : 'var(--aihud-faint)') + ';' + (has ? 'text-shadow:' + glowText(o.v, u, z) : ''), has ? o.text : '–');
  if (has && o.unit) span(n, 'font-size:' + Math.max(0.45 * u, o.size * 0.4).toFixed(2) + 'px;opacity:.8;margin-left:.06em;letter-spacing:0', o.unit);
  return n;
}

/** Field: a halo behind the number, opacity = --aihud-glow-halo x value. */
function field(box, cx, cy, rx, ry, v) {
  const c = heat(v);
  add(box, 'left:0;top:0;width:100%;height:100%;pointer-events:none;'
    + 'background:radial-gradient(ellipse ' + rx.toFixed(1) + 'px ' + ry.toFixed(1) + 'px at ' + cx.toFixed(1) + 'px ' + cy.toFixed(1) + 'px, ' + c + ', ' + fade(c, 35) + ' 45%, transparent);'
    + 'opacity:calc(var(--aihud-glow-halo) * ' + (0.6 + 1.8 * clamp(v) / 100).toFixed(2) + ')');
}

/** Pulse: a bright point, white-hot core, coloured sheath, glow growing with the value. */
function pulse(box, cx, cy, r, v, z, a) {
  const c = heat(v);
  add(box, 'left:' + (cx - r).toFixed(2) + 'px;top:' + (cy - r).toFixed(2) + 'px;width:' + (2 * r).toFixed(2) + 'px;height:' + (2 * r).toFixed(2) + 'px;border-radius:50%;'
    + 'opacity:' + (a == null ? 1 : a).toFixed(2) + ';'
    + 'background:radial-gradient(circle, var(--aihud-heat-text-0) 0 30%, ' + c + ' 58%, ' + fade(c, 0) + ' 74%);'
    + 'box-shadow:0 0 ' + glow(v, z, 1.3) + ' ' + fade(c, 70) + (hot(v) ? ', 0 0 0 ' + Math.max(0.5, 0.03 * r).toFixed(2) + 'px ' + edge(v) : ''));
}

/** Afterglow filament: the session timeline, coloured by the context fill at each moment, brighter toward now. */
function afterglow(box, u, z, o) {
  const w = o.x1 - o.x0, th = Math.max(2, 0.12 * u);
  add(box, 'left:' + o.x0.toFixed(2) + 'px;top:' + (o.y - 0.5).toFixed(2) + 'px;width:' + w.toFixed(2) + 'px;height:1px;background:var(--aihud-line)');
  const pts = o.pts, t0 = o.t0, t1 = o.t1;
  if (!pts.length || !(t1 > t0)) return;
  const f0 = Math.max(0, Math.min(1, (pts[0].t - t0) / (t1 - t0)));
  const xs = o.x0 + f0 * w, ws = Math.max(th, w - f0 * w);
  const stops = pts.map((p) => {
    const f = Math.max(0, Math.min(1, (p.t - t0) / (t1 - t0)));
    const rel = ws > 0 ? Math.max(0, Math.min(1, (o.x0 + f * w - xs) / ws)) : 1;
    return fade(heat(p.pct), 24 + 76 * Math.pow(f, 1.5)) + ' ' + (rel * 100).toFixed(2) + '%';
  });
  if (stops.length === 1) stops.push(stops[0].replace(/ [\d.]+%$/, ' 100%'));
  const g = 'linear-gradient(90deg, ' + stops.join(', ') + ')';
  add(box, 'left:' + xs.toFixed(2) + 'px;top:' + (o.y - th * 1.5).toFixed(2) + 'px;width:' + ws.toFixed(2) + 'px;height:' + (th * 3).toFixed(2) + 'px;background:' + g + ';filter:blur(' + glow(o.v, z, 0.8) + ');opacity:.85');
  add(box, 'left:' + xs.toFixed(2) + 'px;top:' + (o.y - th / 2).toFixed(2) + 'px;width:' + ws.toFixed(2) + 'px;height:' + th.toFixed(2) + 'px;border-radius:' + th + 'px;background:' + g);
}

const iso = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

/** Context values, each null when missing. */
function ctx(data) {
  const d = data || {};
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const raw = d.context && Array.isArray(d.context.points) ? d.context.points : [];
  const pts = raw.filter((p) => p && isNum(p.percent) && iso(p.time) != null).map((p) => ({ t: iso(p.time), pct: p.percent }));
  let pct = inst && isNum(inst.context_percent) ? inst.context_percent : null;
  let pctPath = pct != null ? 'live.instances[].context_percent' : null;
  if (pct == null && pts.length) { pct = pts[pts.length - 1].pct; pctPath = 'context.points[].percent'; }
  let win = inst && isNum(inst.context_window) ? inst.context_window : null;
  const s = d.session || null;
  if (win == null && s && d.windows && d.windows[s.provider] && isNum(d.windows[s.provider][s.model])) win = d.windows[s.provider][s.model];
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const start = s ? iso(s.started_at) : null;
  let last = inst ? iso(inst.last_activity) : null;
  let lastPath = last != null ? 'live.instances[].last_activity' : null;
  if (last == null && pts.length) { last = pts[pts.length - 1].t; lastPath = 'context.points[].time'; }
  const dur = start != null && last != null && last >= start ? last - start : null;
  return { pct, win, total, pts, start, last, dur, pctPath, durPath: 'session.started_at ' + lastPath };
}

function tok(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 999500) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

const pct = (v) => (v >= 99.95 ? '100' : v.toFixed(1));

function dur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return m + 'm';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ' + String(m % 60).padStart(2, '0') + 'm';
  return Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
}

const KIT = { frame, ctx, clamp, field, label, val, tok, span, num, pct, afterglow, pulse, dur };

export function render(el, data, size) {
  const B = KIT, { box, u, z } = B.frame(el, size), v = B.ctx(data), has = v.pct != null, p = has ? B.clamp(v.pct) : null;
  const absent = !has && notRecorded(data, 'live', 'tokens'), absTok = v.total == null && notRecorded(data, 'live', 'tokens');
  if (has) B.field(box, 2.1 * u, 2.0 * u, 3.6 * u, 2.1 * u, p);
  B.label(box, u, { x: 0.5 * u, y: 0.45 * u }, 'CONTEXT');
  const t = B.val(box, u, { right: 0.5 * u, y: 0.4 * u }, 0.6 * u, v.total != null ? B.tok(v.total) : '', v.total != null);
  if (v.total != null) t.setAttribute('data-field', 'live.instances[].tokens_total');
  else if (absTok) { t.style.color = 'var(--aihud-absent)'; t.setAttribute('data-field', 'live.instances[].tokens_total'); }
  B.span(t, 'font:500 ' + 0.5 * u + 'px var(--aihud-font);letter-spacing:.14em;color:var(--aihud-dim);margin-left:' + 0.2 * u + 'px', 'TOK');
  const n = B.num(box, u, z, { x: 0.4 * u, y: 0.95 * u, size: 2.2 * u, v: p, text: has ? B.pct(v.pct) : '', unit: '%' });
  if (has) n.setAttribute('data-field', v.pctPath);
  if (absent) { n.style.color = 'var(--aihud-absent)'; n.setAttribute('data-field', 'live.instances[].context_percent'); }
  const x1 = 7.3 * u, y = 3.7 * u;
  B.afterglow(box, u, z, { x0: 0.5 * u, x1, y, pts: v.pts, t0: v.start != null ? v.start : v.pts.length ? v.pts[0].t : null, t1: v.last, v: has ? p : 0 });
  if (has) B.pulse(box, x1, y, 0.22 * u, p, z, 1);
  B.label(box, u, { x: 0.5 * u, y: 4.25 * u }, 'SESSION');
  const dv = B.val(box, u, { right: 0.5 * u, y: 4.2 * u }, 0.6 * u, v.dur != null ? B.dur(v.dur) : '', v.dur != null);
  if (v.dur != null) dv.setAttribute('data-field', v.durPath);
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

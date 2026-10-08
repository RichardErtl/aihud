// Relief - context at a glance (landscape): the relief profile of the context fill.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'glance-relief-landscape',
  contentBlock: 'glance',
  style: 'relief',
  orientation: 'landscape',
  sizes: [{ cols: 12, rows: 5 }],
  contractVersion: '1.1',
};

const NS = 'http://www.w3.org/2000/svg';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

let uid = 0;

// heat = CONTRACT.md §Heat, here read as the hypsometric tint (percent = altitude)
const STOPS = [0, 30, 50, 75, 100];

const FILL = STOPS.map((s) => `var(--aihud-heat-${s})`);

const TEXT = STOPS.map((s) => `var(--aihud-heat-text-${s})`);

function heat(v, ramp = FILL) {
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < STOPS.length - 1 && x > STOPS[i]) i++;
  const p = ((STOPS[i] - x) / (STOPS[i] - STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}

function read(data) {
  const d = data && typeof data === 'object' ? data : {};
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const s = d.session && typeof d.session === 'object' ? d.session : null;
  const pts = d.context && Array.isArray(d.context.points)
    ? d.context.points.filter((p) => p && isNum(p.percent) && Number.isFinite(Date.parse(p.time)))
      .map((p) => ({ t: Date.parse(p.time), pct: p.percent })).sort((a, b) => a.t - b.t)
    : [];
  const pct = inst && isNum(inst.context_percent) ? inst.context_percent : pts.length ? pts[pts.length - 1].pct : null;
  const pctPath = inst && isNum(inst.context_percent) ? 'live.instances[].context_percent' : 'context.points[].percent';
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const t0 = s ? Date.parse(s.started_at) : NaN;
  let t1 = inst ? Date.parse(inst.last_activity) : NaN;
  let lastPath = 'live.instances[].last_activity';
  if (!Number.isFinite(t1) && pts.length) { t1 = pts[pts.length - 1].t; lastPath = 'context.points[].time'; }
  const spanMs = Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0 ? t1 - t0 : null;
  const turns = d.turn && Array.isArray(d.turn.turns)
    ? d.turn.turns.filter((t) => t && isNum(t.number) && Number.isFinite(Date.parse(t.started_at)))
      .map((t) => ({ n: t.number, t: Date.parse(t.started_at) }))
    : [];
  return { pct, total, pts, t0, t1, spanMs, turns, pctPath, spanPath: 'session.started_at ' + lastPath };
}

function tok(n) {
  if (n == null) return '–';
  if (n >= 999500) return `${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

function dur(ms) {
  if (ms == null) return '–';
  if (ms < 60e3) return `${Math.round(ms / 1000)}s`;
  const m = Math.round(ms / 60e3);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

function timeStep(ms) {
  for (const s of [60e3, 300e3, 600e3, 900e3, 1800e3, 3600e3, 7200e3, 21600e3, 86400e3]) if (ms / s <= 4) return s;
  return 86400e3;
}

function sv(doc, tag, attrs, text) {
  const n = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}

const CAP = 'font-size:9px;font-weight:600;letter-spacing:.16em;fill:var(--aihud-dim)';

const ITAL = 'font-size:9px;font-style:italic;fill:var(--aihud-dim)';

const FAINT = 'font-size:9px;fill:var(--aihud-faint)';

const HALO = ';paint-order:stroke;stroke:var(--aihud-panel);stroke-width:2.6px;stroke-linejoin:round';

/** The map sheet: the tile box at its pixel size, one SVG drawn at 20 px per unit, neatline + graticule ticks per grid unit. */
function frame(el, size) {
  const doc = el.ownerDocument;
  const W = size.cols * 20, H = size.rows * 20;
  const box = doc.createElement('div');
  box.style.cssText = `position:relative;width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
    + 'background:var(--aihud-panel);color:var(--aihud-text)';
  const svg = sv(doc, 'svg', { viewBox: `0 0 ${W} ${H}`, width: size.cols * size.unit, height: size.rows * size.unit });
  svg.style.cssText = 'display:block;font-family:var(--aihud-font);font-variant-numeric:tabular-nums';
  box.append(svg);
  el.replaceChildren(box);
  const add = (tag, attrs, text) => { const n = sv(doc, tag, attrs, text); svg.append(n); return n; };
  const f = {
    doc, svg, W, H, add,
    t: (x, y, text, style, anchor) => add('text', { x: +x.toFixed(2), y: +y.toFixed(2), 'text-anchor': anchor || 'start', style }, text),
  };
  add('rect', { x: 0.5, y: 0.5, width: W - 1, height: H - 1, fill: 'none', style: 'stroke:var(--aihud-line);stroke-width:1' });
  let d = '';
  for (let x = 20; x < W; x += 20) d += `M${x} 1V3.5M${x} ${H - 1}V${H - 3.5}`;
  for (let y = 20; y < H; y += 20) d += `M1 ${y}H3.5M${W - 1} ${y}H${W - 3.5}`;
  add('path', { d, fill: 'none', style: 'stroke:var(--aihud-faint);stroke-width:.7' });
  return f;
}

function bigPct(f, x, y, fs, pct, anchor, absent) {
  const has = pct != null;
  const n = f.t(x, y, null, `font-size:${fs}px;font-weight:650;letter-spacing:-.01em;fill:${has ? heat(pct, TEXT) : absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)'}`, anchor);
  if (has) {
    const [w, d] = pct.toFixed(1).split('.');
    n.append(sv(f.doc, 'tspan', {}, w), sv(f.doc, 'tspan', { style: `font-size:${fs * 0.5}px` }, `.${d}%`));
  } else n.textContent = '–';
  return n;
}

/** The classic two-row checkered scale bar; cuts = segment edges (fractions), */
function scaleBar(f, x, y, w, cuts) {
  const h = 5;
  const edges = [0, ...cuts.filter((c) => c > 0 && c < 1), 1];
  edges.sort((a, b) => a - b);
  for (let i = 1; i < edges.length; i++) {
    const a = edges[i - 1], b = edges[i];
    if (b - a < 1e-6) continue;
    const mid = (a + b) / 2, seg = cuts.filter((c) => c <= mid).length;
    const ink = 'var(--aihud-dim)';
    f.add('rect', { x: +(x + a * w).toFixed(2), y: seg % 2 ? y + h / 2 : y, width: +((b - a) * w).toFixed(2), height: h / 2, style: `fill:${ink}` });
  }
  f.add('rect', { x, y, width: w, height: h, fill: 'none', style: 'stroke:var(--aihud-dim);stroke-width:.6' });
}

function glance(el, data, size, L) {
  const f = frame(el, size), v = read(data), P = L.prof;
  const absPct = v.pct == null && notRecorded(data, 'live', 'tokens'), absTot = v.total == null && notRecorded(data, 'live', 'tokens');
  f.t(L.cap[0], L.cap[1], 'CONTEXT', CAP);
  { const bp = bigPct(f, L.big.x, L.big.y, L.big.fs, v.pct, undefined, absPct); if (v.pct != null) bp.setAttribute('data-field', v.pctPath); else if (absPct) bp.setAttribute('data-field', 'live.instances[].context_percent'); }
  { const tn = f.t(L.tok.x, L.tok.y, tok(v.total), `font-family:var(--aihud-font-mono);font-size:12px;font-weight:600;fill:var(${v.total != null ? '--aihud-text' : absTot ? '--aihud-absent' : '--aihud-faint'})`, L.tok.anchor); if (v.total != null || absTot) tn.setAttribute('data-field', 'live.instances[].tokens_total'); }
  f.t(L.tok.x, L.tok.ly, 'tokens', FAINT, L.tok.anchor);
  const base = P.y + P.h;
  const pts = v.pts;
  const ta = Number.isFinite(v.t0) ? v.t0 : pts.length ? pts[0].t : NaN;
  let tb = Number.isFinite(v.t1) ? v.t1 : pts.length ? pts[pts.length - 1].t : NaN;
  if (tb <= ta) tb = ta + 1;
  const X = (t) => P.x + Math.max(0, Math.min(1, (t - ta) / (tb - ta))) * P.w;
  if (pts.length && Number.isFinite(ta)) {
    const top = Math.max(v.pct ?? 0, ...pts.map((p) => p.pct));
    const ceil = [30, 50, 75, 100].find((s) => s >= top) || 100;
    const Y = (p) => base - (Math.max(0, Math.min(ceil, p)) / ceil) * P.h;
    const id = `aihud-${meta.name}-clip${++uid}`;
    let line = '';
    pts.forEach((p, i) => { line += `${i ? 'L' : 'M'}${X(p.t).toFixed(2)} ${Y(p.pct).toFixed(2)}`; });
    const area = `M${X(pts[0].t).toFixed(2)} ${base}${line.replace(/^M/, 'L')}L${X(pts[pts.length - 1].t).toFixed(2)} ${base}Z`;
    const defs = f.add('defs');
    const cp = sv(f.doc, 'clipPath', { id });
    cp.append(sv(f.doc, 'path', { d: area }));
    defs.append(cp);
    for (let i = 0; i < STOPS.length - 1 && STOPS[i] < ceil; i++) {
      const a = STOPS[i], b = Math.min(ceil, STOPS[i + 1]);
      f.add('rect', { x: P.x, y: +Y(b).toFixed(2), width: P.w, height: +(Y(a) - Y(b)).toFixed(2), 'clip-path': `url(#${id})`,
        style: `fill:${heat((a + STOPS[i + 1]) / 2)};fill-opacity:.5` });
    }
    for (const s of [30, 50, 75, 100]) {
      if (s > ceil) break;
      const y = Y(s);
      f.add('path', { d: `M${P.x} ${y.toFixed(2)}H${P.x + P.w}`, style: 'stroke:var(--aihud-dim);stroke-width:.5;stroke-dasharray:1.5 2' });
      f.t(P.x + 1, y + 9, String(s), `${FAINT}${HALO}`);
    }
    f.t(P.x + P.w, P.y + 9, `relief ×${+(100 / ceil).toFixed(1)}`, `${FAINT};font-style:italic${HALO}`, 'end');
    const hot = heat(v.pct ?? pts[pts.length - 1].pct, TEXT);
    f.add('path', { d: line, fill: 'none', style: `stroke:${hot};stroke-width:1.2;stroke-linejoin:round` });
    for (const t of v.turns) {
      if (t.t < ta || t.t > tb) continue;
      const x = X(t.t);
      f.add('path', { d: `M${x.toFixed(2)} ${base + 0.5}V${base + 3.5}`, style: 'stroke:var(--aihud-text);stroke-width:.8' });
    }
    const last = pts[pts.length - 1];
    f.add('circle', { cx: X(last.t).toFixed(2), cy: Y(v.pct ?? last.pct).toFixed(2), r: 2.4,
      style: `fill:${heat(v.pct ?? last.pct)};stroke:var(--aihud-panel);stroke-width:.8;filter:drop-shadow(0 0 var(--aihud-glow) ${hot})` });
  } else {
    if (notRecorded(data, 'context', 'points')) f.t(P.x + P.w / 2, P.y + P.h / 2 + 8, '–', 'font-size:24px;font-weight:650;fill:var(--aihud-absent)', 'middle').setAttribute('data-field', 'context.points');
    else f.t(P.x + P.w / 2, P.y + P.h / 2 + 3, 'no survey', `${ITAL};fill:var(--aihud-faint)`, 'middle');
  }
  f.add('path', { d: `M${P.x} ${base}H${P.x + P.w}`, style: 'stroke:var(--aihud-line);stroke-width:1' });
  const B = L.bar;
  const cuts = [];
  if (v.spanMs > 0) { const st = timeStep(v.spanMs); for (let k = 1; k * st < v.spanMs; k++) cuts.push((k * st) / v.spanMs); }
  scaleBar(f, B.x, B.y, B.w, cuts);
  if (v.spanMs != null) f.t(B.x, B.y + 15, '0', FAINT);
  const dn = f.t(B.x + B.w, B.y + 15, dur(v.spanMs), `font-size:10px;font-weight:600;fill:var(${v.spanMs != null ? '--aihud-text' : '--aihud-faint'})`, 'end');
  if (v.spanMs != null) dn.setAttribute('data-field', v.spanPath);
  if (L.spanCap) f.t(B.x + B.w / 2, B.y + 15, 'session', FAINT, 'middle');
}

const LAYOUT = { cap: [8, 15], big: { x: 8, y: 46, fs: 24 }, tok: { x: 8, y: 68, ly: 80, anchor: 'start' },
  prof: { x: 88, y: 10, w: 144, h: 52 }, bar: { x: 88, y: 74, w: 144 }, spanCap: true };

export function render(el, data, size) {
  glance(el, data, size, LAYOUT);
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

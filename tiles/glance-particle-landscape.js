// Quantum Dust · context · landscape: the window as a 200-dot ring lit up to the fill, an orbit of dots = total tokens, a dot row = session runtime.
// Every dot is one printed quantum; positions are seeded from the session id, so a redraw is identical.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'glance-particle-landscape',
  contentBlock: 'glance',
  style: 'particle',
  orientation: 'landscape',
  sizes: [{ cols: 11, rows: 6 }],
  contractVersion: '1.1',
};

const PX = (() => {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;

  const turns = (d) => (d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((t) => t && typeof t === 'object') : []);

  const ms = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const f1 = (v) => Math.round(v * 10) / 10;

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  function rng(seedText) {
    let a = hash(seedText);
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  /** smallest quantum from the 1 / 2.5 / 5 ladder that keeps value / q at or under maxDots */
  function quantum(value, maxDots, ladder) {
    const steps = ladder || [1, 2.5, 5];
    for (let e = 0; e < 13; e++) for (const m of steps) { const q = m * Math.pow(10, e); if (value / q <= maxDots) return q; }
    return 1e13;
  }

  function tok(n) {
    if (!isNum(n)) return '–';
    if (n >= 999500) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'k';
    return String(Math.round(n));
  }

  const qtok = (q) => (q >= 1e6 ? String(f1(q / 1e6)) + 'M' : q >= 1000 ? String(f1(q / 1000)) + 'k' : String(q));

  function dur(m) {
    if (!isNum(m) || m < 0) return '–';
    const min = Math.round(m / 60000);
    if (min < 1) return '<1m';
    const h = Math.floor(min / 60), r = min % 60;
    return h ? h + 'h ' + String(r).padStart(2, '0') + 'm' : r + 'm';
  }

  const qmin = (q) => (q >= 60 ? (q / 60) + 'h' : q + 'm');

  const STOPS = [0, 30, 50, 75, 100];

  /** colour of the heat scale at p percent, interpolated between the gauge stops */
  function heat(p, text) {
    const pre = text ? '--aihud-heat-text-' : '--aihud-heat-';
    const v = Math.max(0, Math.min(100, p));
    for (let i = 0; i < STOPS.length - 1; i++) {
      const a = STOPS[i], b = STOPS[i + 1];
      if (v <= b) {
        const t = Math.round(((v - a) / (b - a)) * 100);
        return 'color-mix(in srgb, var(' + pre + b + ') ' + t + '%, var(' + pre + a + '))';
      }
    }
    return 'var(' + pre + '100)';
  }

  /** session span [t0, t1] in ms, or null */
  function span(d) {
    const T = turns(d), i = inst(d);
    let t0 = ms(d && d.session && d.session.started_at);
    let t1 = ms(i && i.last_activity);
    for (const t of T) {
      const s = ms(t.started_at); if (s == null) continue;
      if (t0 == null || s < t0) t0 = s;
      const e = s + (isNum(t.duration_s) ? t.duration_s * 1000 : 0);
      if (t1 == null || e > t1) t1 = e;
    }
    return t0 != null && t1 != null && t1 > t0 ? [t0, t1] : null;
  }

  /** a scene in sketch pixels (unit 20); finish() writes it into el, scaled by unit / 20 */
  function scene(el, size) {
    const z = size.unit / 20, W = size.cols * 20, H = size.rows * 20;
    const svg = [], html = [], pts = [], voids = [];
    const S = {
      W, H, z, pts, voids,
      group(style, list, r) {
        if (!list.length) return;
        svg.push('<g style="' + style + '">' + list.map((p) => '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="' + (p[2] || r) + '"/>').join('') + '</g>');
      },
      circle(x, y, r, style) { svg.push('<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r + '" style="' + style + '"/>'); },
      line(x1, y1, x2, y2, style) { svg.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke-width:0.6;' + style + '"/>'); },
      text(x, y, w, h, fs, str, css, align, df) {
        html.push('<div style="position:absolute;left:' + (x * z) + 'px;top:' + (y * z) + 'px;width:' + (w * z) + 'px;height:' + (h * z) + 'px;'
          + 'font-size:' + (fs * z) + 'px;line-height:' + (h * z) + 'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
          + 'text-align:' + (align || 'left') + ';' + (css || '') + '"' + (df ? ' data-field="' + df + '"' : '') + '>' + esc(str) + '</div>');
      },
      finish() {
        el.innerHTML = '<div style="position:relative;width:' + (W * z) + 'px;height:' + (H * z) + 'px;overflow:hidden;'
          + 'background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font);font-variant-numeric:tabular-nums;border-radius:var(--aihud-radius)">'
          + '<svg width="' + (W * z) + '" height="' + (H * z) + '" viewBox="0 0 ' + W + ' ' + H + '" style="position:absolute;left:0;top:0;display:block">'
          + svg.join('') + '</svg>' + html.join('') + '</div>';
      },
    };
    return S;
  }
  return { isNum, inst, turns, ms, esc, f1, hash, rng, quantum, tok, qtok, dur, qmin, STOPS, heat, span, scene };
})();

const CAP = 'color:var(--aihud-faint);text-transform:uppercase;letter-spacing:.14em;font-weight:600';
const LEG = 'color:var(--aihud-faint);font-family:var(--aihud-font-mono)';

function contextNebula(el, data, size, land) {
  const d = data || {}, S = PX.scene(el, size), W = S.W;
  const sid = (d.session && d.session.id) || '';
  const R = PX.rng('nebula|' + sid);
  const i0 = PX.inst(d), T = PX.turns(d), sp = PX.span(d);
  const pts = d.context && Array.isArray(d.context.points) ? d.context.points : [];
  let pct = i0 && PX.isNum(i0.context_percent) ? i0.context_percent : null;
  let pctPath = pct != null ? 'live.instances[].context_percent' : null;
  if (pct == null && pts.length && PX.isNum(pts[pts.length - 1].percent)) { pct = pts[pts.length - 1].percent; pctPath = 'context.points[].percent'; }
  const win = i0 && PX.isNum(i0.context_window) && i0.context_window > 0 ? i0.context_window : null;
  const total = i0 && PX.isNum(i0.tokens_total) ? i0.tokens_total : null;
  const main = i0 && PX.isNum(i0.tokens_main) ? i0.tokens_main : null;

  const cx = land ? 60 : 80, cy = land ? 60 : 64, r0 = land ? 27 : 28, r1 = land ? 42 : 45, ro = land ? 49 : 51;
  // the window: 200 dots on a sunflower annulus, lit from the inside out up to the fill
  const N = 200, GA = Math.PI * (3 - Math.sqrt(5)), rot = R() * Math.PI * 2;
  const lit = [], unlit = [];
  for (let i = 0; i < N; i++) {
    const f = (i + 0.5) / N, r = Math.sqrt(r0 * r0 + f * (r1 * r1 - r0 * r0)), a = rot + i * GA;
    const p = [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    (pct != null && f * 100 < pct ? lit : unlit).push([p[0], p[1], f * 100]);
  }
  for (const p of unlit) S.circle(p[0], p[1], 1.25, 'fill:' + PX.heat(p[2]) + ';opacity:var(--aihud-heat-rest)');
  for (const p of lit) { const c = PX.heat(p[2]); S.circle(p[0], p[1], 1.25, 'fill:' + c + ';filter:drop-shadow(0 0 var(--aihud-glow) ' + c + ')'); }
  // the orbit: one dot per token quantum, main first (bright), then subagents
  let qT = null;
  if (total != null && total > 0) {
    qT = PX.quantum(total, 90);
    const k = Math.max(1, Math.round(total / qT)), km = main != null ? Math.min(k, Math.round(main / qT)) : 0;
    const mainPts = [], subPts = [];
    for (let j = 0; j < k; j++) {
      const a = -Math.PI / 2 + (j / k) * Math.PI * 2, rr = ro + (R() - 0.5) * 3.2;
      (j < km ? mainPts : subPts).push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
    S.group('fill:var(--aihud-main)', mainPts, 1.15);
    S.group('fill:var(--aihud-sub)', subPts, 1.15);
  }
  // the anchor in the void
  const absPct = pct == null && notRecorded(d, 'live', 'tokens'), absTot = total == null && notRecorded(d, 'live', 'tokens');
  S.text(cx - 24, cy - 14, 48, 22, 18, pct != null ? pct.toFixed(1) : '–', 'font-weight:300;color:' + (pct != null ? PX.heat(pct, true) : absPct ? 'var(--aihud-absent)' : 'var(--aihud-faint)'), 'center', absPct ? 'live.instances[].context_percent' : pctPath);
  if (pct != null) S.text(cx - 10, cy + 7, 20, 10, 9, '%', 'color:var(--aihud-faint)', 'center');
  // runtime: one dot per time quantum, lit while a turn ran
  const runDots = (x0, y0, w, rowsMax) => {
    if (!sp) return null;
    const pitch = 4.4, perRow = Math.floor(w / pitch), minutes = (sp[1] - sp[0]) / 60000;
    const qm = PX.quantum(minutes, perRow * rowsMax, [1, 2, 5, 10, 15, 30, 60, 120, 240]);
    const n = Math.max(1, Math.ceil(minutes / qm));
    const iv = T.map((t) => { const s = PX.ms(t.started_at); return s != null && PX.isNum(t.duration_s) ? [s, s + t.duration_s * 1000] : null; }).filter(Boolean);
    const on = [], off = [];
    for (let k = 0; k < n; k++) {
      const a = sp[0] + k * qm * 60000, b = a + qm * 60000;
      const cover = iv.reduce((s, v) => s + Math.max(0, Math.min(b, v[1]) - Math.max(a, v[0])), 0);
      const p = [x0 + (k % perRow) * pitch + 1.5, y0 + Math.floor(k / perRow) * 5.6];
      (cover >= (b - a) / 2 ? on : off).push(p);
    }
    S.group('fill:var(--aihud-main)', on, 1.15);
    S.group('fill:var(--aihud-faint)', off, 1.15);
    return qm;
  };
  if (land) {
    S.text(120, 3, 92, 11, 9, 'Context', CAP);
    if (win) S.text(120, 14, 92, 10, 9, '• ' + PX.qtok(win / N) + ' of ' + PX.qtok(win), LEG, undefined, 'live.instances[].context_window');
    S.text(120, 29, 92, 17, 14, PX.tok(total), 'font-weight:300;color:var(' + (total != null ? '--aihud-text' : absTot ? '--aihud-absent' : '--aihud-faint') + ')', undefined, total != null || absTot ? 'live.instances[].tokens_total' : null);
    if (qT) S.text(120, 46, 92, 10, 9, 'tokens · ' + PX.qtok(qT) + ' per dot', 'color:var(--aihud-faint)');
    S.text(120, 60, 92, 17, 14, sp ? PX.dur(sp[1] - sp[0]) : '–', 'font-weight:300;color:var(' + (sp ? '--aihud-text' : '--aihud-faint') + ')', undefined, sp ? 'session.started_at live.instances[].last_activity' : null);
    const qm = runDots(120, 94, 92, 3);
    if (qm) S.text(120, 77, 92, 10, 9, 'session · ' + PX.qmin(qm) + ' per dot', 'color:var(--aihud-faint)');
  } else {
    S.text(8, 2, 70, 11, 9, 'Context', CAP);
    if (win) S.text(W - 82, 2, 74, 11, 9, '• ' + PX.qtok(win / N), LEG, 'right', 'live.instances[].context_window');
    S.text(8, 121, 72, 15, 12.5, PX.tok(total), 'font-weight:300;color:var(' + (total != null ? '--aihud-text' : absTot ? '--aihud-absent' : '--aihud-faint') + ')', undefined, total != null || absTot ? 'live.instances[].tokens_total' : null);
    S.text(W - 80, 121, 72, 15, 12.5, sp ? PX.dur(sp[1] - sp[0]) : '–', 'font-weight:300;color:var(' + (sp ? '--aihud-text' : '--aihud-faint') + ')', 'right', sp ? 'session.started_at live.instances[].last_activity' : null);
    if (qT) S.text(8, 136, 74, 10, 9, 'tokens · ' + PX.qtok(qT), 'color:var(--aihud-faint)');
    const qm = runDots(8, 152, W - 16, 1);
    if (qm) S.text(W - 82, 136, 74, 10, 9, 'session · ' + PX.qmin(qm), 'color:var(--aihud-faint)', 'right');
  }
  S.finish();
}
export function render(el, data, size) {
  contextNebula(el, data, size, true);
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

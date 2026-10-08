// Numeral · time · portrait
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = { name: 'time-numeral-portrait', contentBlock: 'time', style: 'numeral', orientation: 'portrait', sizes: [{ cols: 8, rows: 4 }], contractVersion: '1.1' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const DASH = '–';

/* value marks (CONTRACT.md "Value marks and the tip"): data-field = catalog path(s) a value was read from */
const fa = (f) => (f ? ` data-field="${f}"` : '');
const P = (...a) => [...new Set(a.filter(Boolean).join(' ').split(' ').filter(Boolean))].join(' ');
const SESSION = 'session.started_at live.instances[].last_activity';

/* the contract's heat function: kind '' = surfaces, 'text-' = numbers and thin strokes */
function heat(v, kind) {
  const S = [0, 30, 50, 75, 100]; v = clamp(v, 0, 100);
  let a = 0, b = 30;
  for (let i = 0; i < 4; i++) if (v > S[i] && v <= S[i + 1]) { a = S[i]; b = S[i + 1]; }
  const p = ((b - v) / (b - a) * 100).toFixed(1);
  return `color-mix(in srgb, var(--aihud-heat-${kind}${a}) ${p}%, var(--aihud-heat-${kind}${b}))`;
}

function hms(sec) {               /* h:mm:ss above an hour, else m:ss */
  if (!isNum(sec)) return DASH;
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

function hmSplit(sec) {           /* lead numeral: main "2:44", riding ":40"; below an hour main "44:12" */
  if (!isNum(sec)) return [DASH, ''];
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? [`${h}:${String(m).padStart(2, '0')}`, `:${r}`] : [`${m}:${r}`, ''];
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
  const skills = new Map();
  for (const t of turns) for (const s of (Array.isArray(t.skills) ? t.skills : [])) {
    if (!s || typeof s.name !== 'string' || !s.name) continue;
    const e = skills.get(s.name) || { name: s.name, count: 0, tin: 0, tout: 0, first: null, turn: null };
    e.count++;
    e.tin = e.tin != null && isNum(s.tokens_in) ? e.tin + s.tokens_in : null;
    e.tout = e.tout != null && isNum(s.tokens_out) ? e.tout + s.tokens_out : null;
    const at = Date.parse(s.time);
    if (Number.isFinite(at) && (e.first == null || at < e.first)) { e.first = at; e.turn = isNum(t.number) ? t.number : null; }
    skills.set(s.name, e);
  }
  const sk = [...skills.values()].map((e) => ({ ...e, tokens: e.tin != null && e.tout != null ? e.tin + e.tout : null }))
    .sort((a, b) => b.count - a.count || (b.tokens || 0) - (a.tokens || 0) || a.name.localeCompare(b.name));
  const skTok = sk.length && sk.every((s) => s.tokens != null) ? sk.reduce((a, s) => a + s.tokens, 0) : null;
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const okSpan = Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0;
  return {
    t0: okSpan ? t0 : null, t1: okSpan ? t1 : null, sessionS: okSpan ? (t1 - t0) / 1000 : null,
    turns, turnNo: last && isNum(last.number) ? last.number : null, turnS: last && isNum(last.duration_s) ? last.duration_s : null,
    pct, pctPath, pts, peak: pts.length ? Math.max(...pts.map((p) => p.percent)) : null,
    inWindow: lastPt && isNum(lastPt.tokens_in_window) ? lastPt.tokens_in_window : null,
    window: inst && isNum(inst.context_window) ? inst.context_window : null,
    total, main: inst && isNum(inst.tokens_main) ? inst.tokens_main : null,
    skills: sk, skTok, skShare: skTok != null && total ? skTok / total * 100 : null,
    skRuns: sk.reduce((a, s) => a + s.count, 0),
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

const val = (u, s, t, faintIfDash, f) => `<span${fa(t === DASH ? null : f)} style="${VAL(u, s)}${faintIfDash && t === DASH ? 'color:var(--aihud-faint);' : ''}">${t}</span>`;

function glow(u, c) { return `text-shadow:0 0 calc(var(--aihud-glow) * ${(2.4 * u / 20).toFixed(2)}) ${c};`; }


/* the lead numeral: main figure ultra-thin, the remainder rides at the cap line */
function numeral(at, u, x, y, w, F, main, ride, color, align, fld) {
  const f = Math.max(0.48, 0.3 * F), mt = Math.max(0, 0.1 * F - 0.205 * f);
  const c = main === DASH ? 'var(--aihud-faint)' : color || 'var(--aihud-text)';
  const shadow = main !== DASH && color && color.startsWith('color-mix') ? glow(u, color) : '';
  return at(x, y, w, 0.8 * F, `display:flex;align-items:flex-start;overflow:visible;${align === 'right' ? 'justify-content:flex-end;' : ''}`,
    `<div${fa(main === DASH ? null : fld)} style="flex:none;overflow:visible;font-size:${(F * u).toFixed(2)}px;line-height:${(0.8 * F * u).toFixed(2)}px;`
    + `font-weight:200;letter-spacing:-.02em;color:${c};${shadow}">${main}</div>`
    + (ride ? `<div${fa(fld)} style="flex:none;font-size:${(f * u).toFixed(2)}px;line-height:${(f * u).toFixed(2)}px;margin-top:${(mt * u).toFixed(2)}px;`
      + `margin-left:${(0.08 * u).toFixed(2)}px;font-weight:300;color:var(--aihud-dim)">${ride}</div>` : ''));
}


/* the session timeline track: axis, turn pips, work segments, running turn heavier, skill starts, one heat stamp */
function timeline(v, u, w, h, opt) {
  const s = Math.max(1, Math.round(u / 20)), W = w * u, H = h * u, r = 0.13 * u;
  const R = (x, y, ww, hh, c) => `<rect x="${clamp(x, 0, W - ww).toFixed(2)}" y="${y.toFixed(2)}" width="${ww.toFixed(2)}" height="${hh.toFixed(2)}" style="fill:${c}"/>`;
  let g = R(0, H - s, W, s, 'var(--aihud-line)');
  if (v.t0 != null && v.t1 > v.t0) {
    const X = (t) => clamp((t - v.t0) / (v.t1 - v.t0), 0, 1) * (W - s);
    v.turns.forEach((t, i) => {
      const st = Date.parse(t.started_at); if (!Number.isFinite(st)) return;
      const lastT = i === v.turns.length - 1, x = X(st);
      if (isNum(t.duration_s)) {
        const x2 = Math.max(x + s, X(st + t.duration_s * 1000));
        g += lastT ? R(x, H - 2 * s, x2 - x, 2 * s, 'var(--aihud-text)') : R(x, H - s, x2 - x, s, 'var(--aihud-dim)');
      }
      const ph = (lastT ? 0.6 : 0.35) * H;
      g += R(x, H - ph, s, ph, lastT ? 'var(--aihud-text)' : 'var(--aihud-sub)');
    });
    let stamp = null;
    if (opt.skills) for (const sk of v.skills) {
      if (sk.first == null) continue;
      const x = X(sk.first);
      g += R(x, 0.1 * H, s, 0.9 * H, 'var(--aihud-text)');
      if (!stamp) { const p = v.pctAt(sk.first); if (isNum(p)) stamp = [x + s / 2, p]; }
    }
    if (opt.now && isNum(v.pct)) stamp = [X(v.t1) + s / 2, v.pct];
    if (stamp) {
      const cx = clamp(stamp[0], r, W - r), cy = opt.skills ? 0.1 * H + r : H - 2 * s - r - 0.5 * s, c = heat(stamp[1], '');
      g += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" style="fill:${c};filter:drop-shadow(0 0 calc(var(--aihud-glow) * ${(u / 20).toFixed(2)}) ${c})"/>`;
    }
  }
  return `<svg width="${W.toFixed(2)}" height="${H.toFixed(2)}" viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}" style="display:block;overflow:hidden">${g}</svg>`;
}

const svgAt = (at, x, y, w, h, svg, f) => at(x, y, w, h, 'line-height:0;', svg, f);

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const u = size.unit, v = vals(data), at = AT(u), [m, r] = hmSplit(v.sessionS), turnS = hms(v.turnS);
  const tn = v.turnNo == null ? DASH : String(v.turnNo);
  // the track draws the turn starts/durations against the session span and the context stamp; nothing without a span
  const TLF = v.t0 == null ? null : P('turn.turns[].started_at', 'turn.turns[].duration_s');
  tileBox(el, size,
    at(0.5, 0.45, 3.5, 0.6, LAB(u), 'Session')
    + at(3.6, 0.45, 3.9, 0.6, 'text-align:right;', lab(u, 'Turn ') + val(u, 0.6, tn, true, 'turn.turns[].number'))
    + numeral(at, u, 0.5, 1.2, 4.9, m.length > 4 && r ? 2.1 * 0.8 : 2.1, m, r, undefined, undefined, v.sessionS == null ? null : SESSION)
    + at(4.9, 2.06, 2.6, 0.9, `text-align:right;${VAL(u, 0.78)}font-weight:300;${turnS === DASH ? 'color:var(--aihud-faint);' : ''}`, turnS, turnS === DASH ? null : 'turn.turns[].duration_s')
    + svgAt(at, 0.5, 3.1, 7, 0.4, timeline(v, u, 7, 0.4, { now: true }), TLF));
}

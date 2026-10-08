// Numeral · skills (extended) · landscape
// Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn in unit multiples, scaled by size.unit.

export const meta = { name: 'skills-numeral-landscape', contentBlock: 'skills', style: 'numeral', orientation: 'landscape', sizes: [{ cols: 12, rows: 6 }], contractVersion: '1.1' };

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DASH = '–';

/* value marks (CONTRACT.md "Value marks and the tip"): data-field = catalog path(s) a value was read from */
const fa = (f) => (f ? ` data-field="${f}"` : '');
const P = (...a) => [...new Set(a.filter(Boolean).join(' ').split(' ').filter(Boolean))].join(' ');
const STARTS = 'turn.turns[].skills', NAME = 'turn.turns[].skills[].name', TIN = 'turn.turns[].skills[].tokens_in', TOUT = 'turn.turns[].skills[].tokens_out';
const TOK = P(TIN, TOUT), SKT = 'turn.turns[].skills[].time';

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

function hmSplit(sec) {           /* lead numeral: main "2:44", riding ":40"; below an hour main "44:12" */
  if (!isNum(sec)) return [DASH, ''];
  const s = Math.floor(sec), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, r = String(s % 60).padStart(2, '0');
  return h ? [`${h}:${String(m).padStart(2, '0')}`, `:${r}`] : [`${m}:${r}`, ''];
}

function tokSplit(n) {
  const t = tok(n); const m = t.match(/^([\d.]+)([kM]?)$/);
  return m ? [m[1], m[2]] : [t, ''];
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
    pct, pts, peak: pts.length ? Math.max(...pts.map((p) => p.percent)) : null,
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

const val = (u, s, t, faintIfDash, f, ab) => `<span${fa(t === DASH ? ab || null : f)} style="${VAL(u, s)}${faintIfDash && t === DASH ? (ab ? 'color:var(--aihud-absent);' : 'color:var(--aihud-faint);') : ''}">${t}</span>`;

function glow(u, c) { return `text-shadow:0 0 calc(var(--aihud-glow) * ${(2.4 * u / 20).toFixed(2)}) ${c};`; }


/* the lead numeral: main figure ultra-thin, the remainder rides at the cap line */
function numeral(at, u, x, y, w, F, main, ride, color, align, fld, ab) {
  const f = Math.max(0.48, 0.3 * F), mt = Math.max(0, 0.1 * F - 0.205 * f);
  const c = main === DASH ? (ab ? 'var(--aihud-absent)' : 'var(--aihud-faint)') : color || 'var(--aihud-text)';
  const shadow = main !== DASH && color && color.startsWith('color-mix') ? glow(u, color) : '';
  return at(x, y, w, 0.8 * F, `display:flex;align-items:flex-start;overflow:visible;${align === 'right' ? 'justify-content:flex-end;' : ''}`,
    `<div${fa(main === DASH ? ab || null : fld)} style="flex:none;overflow:visible;font-size:${(F * u).toFixed(2)}px;line-height:${(0.8 * F * u).toFixed(2)}px;`
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

const vline = (at, u, x, y, h) => at(x, y, Math.max(1, Math.round(u / 20)) / u, h, 'background:var(--aihud-line);', '');

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const u = size.unit, v = vals(data), at = AT(u), [m, r] = tokSplit(v.skTok);
  const ROWS = 2, shown = v.skills.length > ROWS ? v.skills.slice(0, ROWS - 1) : v.skills;
  let rows = '';
  shown.forEach((s, i) => {
    const y = 0.4 + i * 2.1, off = s.first != null && v.t0 != null ? hmSplit((s.first - v.t0) / 1000)[0] : DASH;
    rows += at(5.1, y, 4.4, 0.75, `${VAL(u, 0.62)}text-overflow:ellipsis;`, esc(s.name), NAME)
      + at(9.5, y, 2.0, 0.75, `${VAL(u, 0.62)}text-align:right;${s.tokens == null ? 'color:var(--aihud-faint);' : ''}`, tok(s.tokens), s.tokens == null ? null : TOK)
      + at(5.1, y + 0.8, 2.3, 0.65, '', lab(u, 'Turn ') + val(u, 0.52, s.turn == null ? DASH : String(s.turn), true, P('turn.turns[].number', SKT)))
      + at(7.4, y + 0.8, 1.6, 0.65, 'text-align:center;', val(u, 0.52, '×' + s.count, false, STARTS))
      + at(9.0, y + 0.8, 2.5, 0.65, 'text-align:right;', lab(u, 'At ') + val(u, 0.52, off, true, P('session.started_at', SKT)))
      + at(5.1, y + 1.45, 3.1, 0.65, '', lab(u, 'In ') + val(u, 0.52, tok(s.tin), true, TIN))
      + at(8.3, y + 1.45, 3.2, 0.65, 'text-align:right;', lab(u, 'Out ') + val(u, 0.52, tok(s.tout), true, TOUT));
  });
  const TL = v.skills.some((s) => s.first != null) ? P(SKT, 'turn.turns[].started_at') : null;
  const delivered = !!(data && data.turn && Array.isArray(data.turn.turns));
  const A = !v.skills.length && notRecorded(data, 'turn', 'skills'), AT_ = 'turn.turns[].skills[].tokens_in';   // skills not recorded: violet dashes, no list text
  if (A) rows = '';
  else if (!v.skills.length) rows = at(5.1, 0.4, 6.4, 0.75, `${VAL(u, delivered ? 0.42 : 0.62)}color:var(--aihud-faint);`, delivered ? 'no skill calls this session' : DASH);
  if (shown.length < v.skills.length) rows += at(5.1, 2.5, 6.4, 0.6, LAB(u) + 'color:var(--aihud-faint);', `+${v.skills.length - shown.length} more`, NAME);
  tileBox(el, size,
    at(0.5, 0.45, 4.1, 0.6, LAB(u), 'Skill tokens')
    + numeral(at, u, 0.5, 1.2, 4.2, m.length > 4 && r ? 2.0 * 0.8 : 2.0, m, r, undefined, undefined, TOK, A ? AT_ : null)
    + at(0.5, 2.95, 4.1, 0.75, '', val(u, 0.65, v.skShare == null ? DASH : v.skShare.toFixed(1) + '%', true, P(TOK, 'live.instances[].tokens_total'), A ? AT_ : null) + ' ' + lab(u, 'share'))
    + at(0.5, 3.7, 4.1, 0.65, '', val(u, 0.6, v.skills.length ? String(v.skRuns) : DASH, true, STARTS, A ? STARTS : null) + ' ' + lab(u, v.skRuns === 1 ? 'run' : 'runs'))
    + vline(at, u, 4.8, 0.55, 3.8)
    + rows
    + svgAt(at, 0.5, 4.7, 11, 0.8, timeline(v, u, 11, 0.8, { skills: true }), TL));
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

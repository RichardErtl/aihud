// Quantum Dust · skills · portrait: the session as a time line, every skill start bursts as a cluster of dots (one dot per token quantum).
// Every dot is one printed quantum; positions are seeded from the session id, so a redraw is identical.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'skills-particle-portrait',
  contentBlock: 'skills',
  style: 'particle',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 4 }],
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

  const hm = (t) => { const D = new Date(t); return String(D.getHours()).padStart(2, '0') + ':' + String(D.getMinutes()).padStart(2, '0'); };

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
      group(style, list, r, field) {
        if (!list.length) return;
        svg.push('<g' + (field ? ' data-field="' + esc(field) + '"' : '') + ' style="' + style + '">' + list.map((p) => '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="' + (p[2] || r) + '"/>').join('') + '</g>');
      },
      circle(x, y, r, style, field) { svg.push('<circle' + (field ? ' data-field="' + esc(field) + '"' : '') + ' cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r + '" style="' + style + '"/>'); },
      line(x1, y1, x2, y2, style) { svg.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke-width:0.6;' + style + '"/>'); },
      text(x, y, w, h, fs, str, css, align, field) {
        html.push('<div' + (field ? ' data-field="' + esc(field) + '"' : '') + ' style="position:absolute;left:' + (x * z) + 'px;top:' + (y * z) + 'px;width:' + (w * z) + 'px;height:' + (h * z) + 'px;'
          + 'font-size:' + (fs * z) + 'px;line-height:' + (h * z) + 'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
          + 'text-align:' + (align || 'left') + ';' + (css || '') + '">' + esc(str) + '</div>');
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

  /** n dots around (cx, cy), gaussian spread sx/sy, inside box, outside the voids, keeping a gap */
  function scatter(S, R, n, o) {
    const out = [], [x0, y0, x1, y1] = o.box, r = o.r || 1.1, gap = o.gap || 2.6;
    const inBox = (x, y) => x >= x0 + r && x <= x1 - r && y >= y0 + r && y <= y1 - r;
    const free = (x, y, g) => !S.voids.some((v) => x > v[0] - r && x < v[2] + r && y > v[1] - r && y < v[3] + r)
      && S.pts.every((p) => (p[0] - x) * (p[0] - x) + (p[1] - y) * (p[1] - y) >= g * g);
    for (let i = 0; i < n; i++) {
      let p = null;
      for (let t = 0; t < 80 && !p; t++) {
        const g = gap * (t < 25 ? 1 : t < 50 ? 0.75 : 0.45), grow = 1 + t * 0.04;
        const u = Math.max(1e-9, R()), v = R(), m = Math.sqrt(-2 * Math.log(u));
        const x = o.cx + o.sx * grow * m * Math.cos(2 * Math.PI * v), y = o.cy + o.sy * grow * m * Math.sin(2 * Math.PI * v);
        if (inBox(x, y) && free(x, y, g)) p = [x, y];
      }
      for (let t = 0; t < 80 && !p; t++) {
        const x = x0 + r + R() * (x1 - x0 - 2 * r), y = y0 + r + R() * (y1 - y0 - 2 * r);
        if (free(x, y, t < 40 ? gap * 0.5 : 0)) p = [x, y];
      }
      if (!p) p = [Math.min(x1 - r, Math.max(x0 + r, o.cx)), Math.min(y1 - r, Math.max(y0 + r, o.cy))];
      S.pts.push(p); out.push(p);
    }
    return out;
  }
  return { isNum, inst, turns, ms, esc, f1, hash, rng, quantum, tok, qtok, hm, span, scene, scatter };
})();

const CAP = 'color:var(--aihud-faint);text-transform:uppercase;letter-spacing:.14em;font-weight:600';
const LEG = 'color:var(--aihud-faint);font-family:var(--aihud-font-mono)';
const ANCHOR = 'font-weight:300;letter-spacing:-.01em;color:var(--aihud-text)';
const SERIES = ['--aihud-series-1', '--aihud-series-2', '--aihud-series-3'];

function skillBursts(el, data, size, land) {
  const d = data || {}, S = PX.scene(el, size), W = S.W, H = S.H;
  const sid = (d.session && d.session.id) || '';
  const R = PX.rng('skills|' + sid);
  const T = PX.turns(d), sp = PX.span(d);
  // skills grouped by name, every start kept (time + tokens)
  const by = new Map();
  for (const t of T) for (const s of (Array.isArray(t.skills) ? t.skills : [])) {
    if (!s || typeof s.name !== 'string' || !s.name) continue;
    const e = by.get(s.name) || { name: s.name, count: 0, tokens: 0, starts: [] };
    const n = PX.isNum(s.tokens_in) && PX.isNum(s.tokens_out) ? s.tokens_in + s.tokens_out : null;
    e.count++; e.tokens = e.tokens != null && n != null ? e.tokens + n : null;
    e.starts.push({ t: PX.ms(s.time) != null ? PX.ms(s.time) : PX.ms(t.started_at), n });
    by.set(s.name, e);
  }
  const list = [...by.values()].sort((a, b) => b.count - a.count || (b.tokens || 0) - (a.tokens || 0) || a.name.localeCompare(b.name));
  const A = !list.length && notRecorded(d, 'turn', 'skills');   // skills not recorded by the provider: violet dash, no "none" text
  const known = list.length && list.every((g) => g.tokens != null);
  const total = known ? list.reduce((s, g) => s + g.tokens, 0) : null;
  const q = total ? PX.quantum(total, land ? 130 : 90) : null;

  const fieldBottom = land ? 76 : H - 14, lineY = land ? 81 : H - 6;
  const xOf = (t) => (sp && t != null ? 8 + ((t - sp[0]) / (sp[1] - sp[0])) * (W - 16) : W * 0.7);
  // caption, legend, anchor (the void)
  S.text(8, 2, 70, 11, 9, 'Skills', CAP);
  if (q) S.text(W - 72, 2, 64, 11, 9, '• ' + PX.qtok(q), LEG, 'right');
  S.text(8, 13, 78, land ? 26 : 23, land ? 22 : 20, total != null ? PX.tok(total) : '–', A ? ANCHOR + ';color:var(--aihud-absent)' : ANCHOR, null, total != null ? 'turn.turns[].skills[].tokens_in turn.turns[].skills[].tokens_out' : A ? 'turn.turns[].skills[].tokens_in' : null);
  S.voids.push(land ? [4, 12, 90, 52] : [4, 12, 88, 37]);
  if (land) S.text(8, 39, 144, 10, 9, list.length ? 'skill tokens' : (T.length ? 'no skill calls this session' : ''), 'color:var(--aihud-faint)');
  else if (list.length) {
    const g = list[0];
    S.circle(10.5, 43.5, 2, 'fill:var(' + SERIES[0] + ')');
    S.text(15, 38, 98, 11, 9.5, g.name + ' ×' + g.count + (list.length > 1 ? '  +' + (list.length - 1) : ''), 'color:var(--aihud-dim)', null, 'turn.turns[].skills[].name turn.turns[].skills');
    S.voids.push([4, 37, 116, 50]);
  } else if (T.length && !A) S.text(8, 38, 144, 11, 9.5, 'no skill calls this session', 'color:var(--aihud-faint)');
  // the bursts: one cluster per start, at its moment, one dot per quantum
  if (q) {
    const mid = (13 + fieldBottom) / 2;
    list.forEach((g, gi) => {
      const rows = Math.min(list.length, 3), cy = rows > 1 ? 13 + ((gi % rows) + 0.5) * ((fieldBottom - 13) / rows) : mid;
      const pts = [];
      for (const s of g.starts) {
        const n = s.n != null ? Math.max(1, Math.round(s.n / q)) : 0;
        const sx = Math.max(3, Math.min(land ? 26 : 22, Math.sqrt(n) * 1.55));
        // the burst keeps its shape at the edges: its centre stays 1.2 sigma inside the field (the turn dot below marks the exact moment)
        const cx = Math.max(6 + sx * 1.2, Math.min(W - 6 - sx * 1.2, xOf(s.t)));
        pts.push(...PX.scatter(S, R, n, { cx, cy, sx, sy: sx * 0.62, box: [6, 13, W - 6, fieldBottom], r: 1.1, gap: 2.5 }));
      }
      S.group('fill:var(' + SERIES[Math.min(gi, 2)] + ')', pts, 1.1, 'turn.turns[].skills[].tokens_in turn.turns[].skills[].tokens_out');
    });
  }
  // the time line: a hairline, one dot per turn at its start
  if (sp) {
    S.line(8, lineY, W - 8, lineY, 'stroke:var(--aihud-line)');
    const withSkill = new Set();
    for (const t of T) if (Array.isArray(t.skills) && t.skills.length) withSkill.add(t);
    for (const t of T) {
      const s = PX.ms(t.started_at); if (s == null) continue;
      S.circle(xOf(s), lineY, withSkill.has(t) ? 1.9 : 1.4, withSkill.has(t) ? 'fill:var(--aihud-dim)' : 'fill:var(--aihud-faint)', 'turn.turns[].started_at');
    }
    if (land) {
      S.text(8, 85, 50, 10, 9, PX.hm(sp[0]), LEG, null, 'session.started_at turn.turns[].started_at');
      S.text(W - 58, 85, 50, 10, 9, PX.hm(sp[1]), LEG, 'right', 'live.instances[].last_activity turn.turns[].started_at turn.turns[].duration_s');
    }
  }
  if (land) {
    const shown = list.length > 2 ? list.slice(0, 1) : list;
    shown.forEach((g, i) => {
      const y = 97 + i * 10.5;
      S.circle(10.5, y + 5.25, 2, 'fill:var(' + SERIES[Math.min(i, 2)] + ')');
      S.text(15, y, 82, 10.5, 9.5, g.name, 'color:var(--aihud-text)', null, 'turn.turns[].skills[].name');
      S.text(98, y, 20, 10.5, 9.5, '×' + g.count, 'color:var(--aihud-dim)', 'right', 'turn.turns[].skills');
      S.text(120, y, 32, 10.5, 9.5, PX.tok(g.tokens), 'color:var(--aihud-dim)', 'right', g.tokens != null ? 'turn.turns[].skills[].tokens_in turn.turns[].skills[].tokens_out' : null);
    });
    if (list.length > 2) S.text(15, 107.5, 100, 10.5, 9.5, '+' + (list.length - 1) + ' more', 'color:var(--aihud-faint)', null, 'turn.turns[].skills');
  }
  S.finish();
}
export function render(el, data, size) {
  skillBursts(el, data, size, false);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

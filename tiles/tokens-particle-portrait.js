// Quantum Dust · tokens · portrait: total, main / sub, models and roles as density strips, plus per-turn main tokens and one cluster per subagent.
// Every dot is one printed quantum; positions are seeded from the session id, so a redraw is identical.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'tokens-particle-portrait',
  contentBlock: 'tokens',
  style: 'particle',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 12 }],
  contractVersion: '1.1',
};

const PX = (() => {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;

  const turns = (d) => (d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((t) => t && typeof t === 'object') : []);

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

  /** a scene in sketch pixels (unit 20); finish() writes it into el, scaled by unit / 20 */
  function scene(el, size) {
    const z = size.unit / 20, W = size.cols * 20, H = size.rows * 20;
    const svg = [], html = [], pts = [], voids = [];
    const S = {
      W, H, z, pts, voids,
      group(style, list, r, fld) {
        if (!list.length) return;
        svg.push('<g' + (fld ? ' data-field="' + fld + '"' : '') + ' style="' + style + '">' + list.map((p) => '<circle cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="' + (p[2] || r) + '"/>').join('') + '</g>');
      },
      circle(x, y, r, style) { svg.push('<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r + '" style="' + style + '"/>'); },
      line(x1, y1, x2, y2, style) { svg.push('<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" style="stroke-width:0.6;' + style + '"/>'); },
      text(x, y, w, h, fs, str, css, align, fld) {
        html.push('<div style="position:absolute;left:' + (x * z) + 'px;top:' + (y * z) + 'px;width:' + (w * z) + 'px;height:' + (h * z) + 'px;'
          + 'font-size:' + (fs * z) + 'px;line-height:' + (h * z) + 'px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'
          + 'text-align:' + (align || 'left') + ';' + (css || '') + '"' + (fld ? ' data-field="' + fld + '"' : '') + '>' + esc(str) + '</div>');
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

  /** n dots spread evenly at random over a strip (density strip): same length for all, density = value */
  function strip(S, R, n, box, r) {
    const [x0, y0, x1, y1] = box, out = [];
    for (let i = 0; i < n; i++) {
      // stratified along x so the density reads evenly, jittered in both axes
      const x = x0 + r + ((i + R()) / Math.max(1, n)) * (x1 - x0 - 2 * r);
      const y = y0 + r + R() * (y1 - y0 - 2 * r);
      out.push([x, y]);
    }
    return out;
  }
  return { isNum, inst, turns, esc, f1, hash, rng, quantum, tok, qtok, scene, scatter, strip };
})();

const CAP = 'color:var(--aihud-faint);text-transform:uppercase;letter-spacing:.14em;font-weight:600';
const LEG = 'color:var(--aihud-faint);font-family:var(--aihud-font-mono)';
const ANCHOR = 'font-weight:300;letter-spacing:-.01em;color:var(--aihud-text)';
const SERIES = ['--aihud-series-1', '--aihud-series-2', '--aihud-series-3'];
const ROLES = ['--aihud-role-1', '--aihud-role-2', '--aihud-role-3'];

function tokenConstellation(el, data, size, land) {
  const d = data || {}, S = PX.scene(el, size), W = S.W;
  const sid = (d.session && d.session.id) || '';
  const R = PX.rng('tokens|' + sid);
  const i0 = PX.inst(d), T = PX.turns(d);
  const total = i0 && PX.isNum(i0.tokens_total) ? i0.tokens_total : null;
  const main = i0 && PX.isNum(i0.tokens_main) ? i0.tokens_main : null;
  const sub = total != null && main != null ? Math.max(0, total - main) : null;
  const entries = (o) => (o && typeof o === 'object' ? Object.entries(o).filter(([, n]) => PX.isNum(n) && n > 0).sort((a, b) => b[1] - a[1]) : []);
  const models = entries(i0 && i0.tokens_by_model).slice(0, 3);
  const rolesAll = entries(i0 && i0.tokens_by_agent_type);
  const others = rolesAll.filter(([k]) => k !== 'main');
  const roleRank = new Map(others.map(([k], i) => [k, Math.min(i, 2)]));
  const roleRows = [...rolesAll.filter(([k]) => k === 'main'), ...others.slice(0, 3)];
  const nodes = d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter((n) => n && n.parent_id != null && PX.isNum(n.tokens_self) && n.tokens_self > 0) : [];
  const q = total != null && total > 0 ? PX.quantum(total, land ? 200 : 220) : null;
  const roleColor = (k) => (k === 'main' ? '--aihud-main' : roleRank.has(k) ? ROLES[roleRank.get(k)] : '--aihud-sub');

  // geometry
  const G = land
    ? { fx0: 92, fx1: 196, mb: [6, 52], sb: [56, 102], ny: 103, rx: 204, ry: 6, my: 60, nw: 46, s0: 252, s1: 284, vx: 286 }
    : { fx0: 8, fx1: 152, mb: [48, 94], sb: [98, 144], ny: 145, rx: 8, ry: 158, my: 201, nw: 50, s0: 60, s1: 122, vx: 124 };
  // caption, legend, anchor + main / sub (base content)
  if (land) {
    S.text(8, 3, 78, 11, 9, 'Tokens', CAP);
    S.text(8, 15, 82, 28, 24, PX.tok(total), ANCHOR + (total == null ? ';color:var(--aihud-faint)' : ''), undefined, total != null ? 'live.instances[].tokens_total' : null);
    S.circle(10.5, 51.25, 2, 'fill:var(--aihud-main)'); S.text(15, 46, 70, 10.5, 9.5, 'main ' + PX.tok(main), 'color:var(--aihud-dim)', undefined, main != null ? 'live.instances[].tokens_main' : null);
    S.circle(10.5, 61.75, 2, 'fill:var(--aihud-sub)'); S.text(15, 56.5, 70, 10.5, 9.5, 'sub ' + PX.tok(sub), 'color:var(--aihud-dim)', undefined, sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : null);
    if (q) S.text(8, 72, 78, 10, 9, '• ' + PX.qtok(q) + ' per dot', LEG);
  } else {
    S.text(8, 2, 70, 11, 9, 'Tokens', CAP);
    if (q) S.text(W - 72, 2, 64, 11, 9, '• ' + PX.qtok(q), LEG, 'right');
    S.text(8, 14, 84, 30, 26, PX.tok(total), ANCHOR + (total == null ? ';color:var(--aihud-faint)' : ''), undefined, total != null ? 'live.instances[].tokens_total' : null);
    S.circle(97.5, 23.25, 2, 'fill:var(--aihud-main)'); S.text(102, 18, 52, 10.5, 9.5, 'main ' + PX.tok(main), 'color:var(--aihud-dim)', undefined, main != null ? 'live.instances[].tokens_main' : null);
    S.circle(97.5, 34.75, 2, 'fill:var(--aihud-sub)'); S.text(102, 29.5, 52, 10.5, 9.5, 'sub ' + PX.tok(sub), 'color:var(--aihud-dim)', undefined, sub != null ? 'live.instances[].tokens_total live.instances[].tokens_main' : null);
  }
  // the field: turn columns; upper band main agent per turn, lower band one cluster per subagent
  const nums = T.map((t) => (PX.isNum(t.number) ? t.number : null));
  const nT = T.length;
  if (nT) {
    const cw = (G.fx1 - G.fx0) / nT, colX = (k) => G.fx0 + (k + 0.5) * cw;
    S.line(G.fx0, (G.mb[1] + G.sb[0]) / 2, G.fx1, (G.mb[1] + G.sb[0]) / 2, 'stroke:var(--aihud-line-2)');
    S.text(G.fx0, G.mb[0], 30, 9, 9, 'main', 'color:var(--aihud-faint)');
    S.text(G.fx0, G.sb[0], 30, 9, 9, 'sub', 'color:var(--aihud-faint)');
    S.voids.push([G.fx0, G.mb[0], G.fx0 + 20, G.mb[0] + 9], [G.fx0, G.sb[0], G.fx0 + 14, G.sb[0] + 9]);
    const every = Math.max(1, Math.ceil(12 / cw));
    T.forEach((t, k) => { if (k % every === 0 || k === nT - 1) S.text(colX(k) - 8, G.ny, 16, 10, 9, nums[k] != null ? String(nums[k]) : '·', 'color:var(--aihud-faint)', 'center', nums[k] != null ? 'turn.turns[].number' : null); });
    if (q) {
      const mainPts = [];
      T.forEach((t, k) => {
        const n = PX.isNum(t.tokens_in) && PX.isNum(t.tokens_out) ? Math.round((t.tokens_in + t.tokens_out) / q) : 0;
        if (!n) return;
        const cyM = (G.mb[0] + G.mb[1]) / 2;
        mainPts.push(...PX.scatter(S, R, n, { cx: colX(k), cy: cyM, sx: Math.min(cw * 0.3, 1 + Math.sqrt(n) * 0.9), sy: Math.min(15, 1 + Math.sqrt(n) * 1.5),
          box: [G.fx0 + k * cw, G.mb[0], G.fx0 + (k + 1) * cw, G.mb[1]], r: 1.05, gap: 2.4 }));
      });
      S.group('fill:var(--aihud-main)', mainPts, 1.05, 'turn.turns[].tokens_in turn.turns[].tokens_out');
      const byRole = new Map();
      const inTurn = new Map();
      for (const n of nodes) {
        const k = nums.indexOf(PX.isNum(n.started_in_turn) ? n.started_in_turn : -1);
        const key = k < 0 ? 'x' : k; inTurn.set(key, (inTurn.get(key) || 0) + 1);
      }
      const seen = new Map();
      for (const n of nodes) {
        const k = nums.indexOf(PX.isNum(n.started_in_turn) ? n.started_in_turn : -1);
        const key = k < 0 ? 'x' : k, idx = seen.get(key) || 0; seen.set(key, idx + 1);
        const cnt = Math.max(1, Math.round(n.tokens_self / q)), many = inTurn.get(key);
        const cyS = G.sb[0] + 5 + ((idx + 0.5) / many) * (G.sb[1] - G.sb[0] - 5);
        const box = k < 0 ? [G.fx0, G.sb[0], G.fx1, G.sb[1]] : [G.fx0 + k * cw, G.sb[0], G.fx0 + (k + 1) * cw, G.sb[1]];
        const cxS = k < 0 ? G.fx1 - 6 : colX(k) + (R() - 0.5) * cw * 0.3;
        const p = PX.scatter(S, R, cnt, { cx: cxS, cy: cyS, sx: Math.min(cw * 0.26, 0.8 + Math.sqrt(cnt) * 0.8), sy: Math.min(9, 0.8 + Math.sqrt(cnt) * 0.8), box, r: 1.05, gap: 2.3 });
        const col = roleColor(n.agent_type);
        byRole.set(col, (byRole.get(col) || []).concat(p));
      }
      for (const [col, p] of byRole) S.group('fill:var(' + col + ')', p, 1.05, 'agents.nodes[].tokens_self');
    }
  } else if (!total) {
    S.text(G.fx0, (G.mb[0] + G.sb[1]) / 2 - 5, G.fx1 - G.fx0, 10, 9, '–', 'color:var(--aihud-faint)', 'center');
  }
  // density strips: one length for every row, the dot density is the share (same quantum)
  const row = (y, name, n, col, fld) => {
    S.text(G.rx, y, G.nw, 10.5, land ? 9 : 9.5, name, 'color:var(--aihud-dim)', undefined, fld);
    if (q) S.group('fill:var(' + col + ')', PX.strip(S, R, Math.round(n / q), [G.s0, y + 1.8, G.s1, y + 8.7], 0.9), 0.9);
    S.text(G.vx, y, G.rx + (land ? 108 : 144) - G.vx, 10.5, 9.5, PX.tok(n), 'color:var(--aihud-dim)', 'right', fld);
  };
  roleRows.forEach(([k, n], i) => row(G.ry + i * 10.5, k, n, roleColor(k), 'live.instances[].tokens_by_agent_type'));
  models.forEach(([k, n], i) => row(G.my + i * 10.5, k.replace(/^claude-/, ''), n, SERIES[i], 'live.instances[].tokens_by_model'));
  S.finish();
}
export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  tokenConstellation(el, data, size, false);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

// aihud:absent-only v1
const absentOnly = (node, caption, field, z) => {
  const doc = node.ownerDocument, part = (css, t) => { const e = doc.createElement('div'); e.style.cssText = css + ';line-height:1.25'; e.textContent = t; return e; };
  const dash = part('font-size:' + 22 * z + 'px;font-weight:650;color:var(--aihud-absent)', '–');
  dash.setAttribute('data-field', field);
  node.style.cssText += ';box-sizing:border-box;display:flex;flex-direction:column;align-content:center;justify-content:center;align-items:center;text-align:center;gap:' + 2 * z + 'px;padding:' + 4 * z + 'px';
  node.replaceChildren(part('font-size:' + 9 * z + 'px;letter-spacing:.06em;text-transform:uppercase;color:var(--aihud-faint);font-weight:400', caption), dash);
};

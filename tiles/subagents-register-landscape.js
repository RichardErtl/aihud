// Minimal (Hairline Register) subagents, re-interpreted: count, one dot per subagent, role share as ticks. (landscape, 9 × 5)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'subagents-register-landscape',
  contentBlock: 'subagents',
  style: 'register',
  orientation: 'landscape',
  sizes: [{ cols: 9, rows: 5 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, g, W } = plate(el, size);
  const s = subInfo(data);
  tx(doc, g, 0, 6, 'subagents', { up: true, fill: 'var(--aihud-faint)' });
  tx(doc, g, W, 7, s.count == null ? DASH : String(s.count), { px: 16, w: 650, field: s.count == null && !s.absent ? null : 'agents.subagents_started', a: 'end', fill: s.count == null ? (s.absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)') : 'var(--aihud-text)' });
  if (!s.absent) dotRow(doc, g, 0, 31, W, s.dots, s.dotField);
  const ceil = ceilOf(s.roles.map((r) => r && r.share), 10);
  (s.absent && !s.roles.some(Boolean) ? [] : s.roles).forEach((r, k) => {
    const y = 46 + k * 14;
    name(doc, g, 0, y, r ? r.name : DASH, 52, { field: r ? 'live.instances[].tokens_by_agent_type' : null, fill: r ? 'var(--aihud-dim)' : 'var(--aihud-faint)' });
    rail(doc, g, 56, y + 4, W - 114, r && r.share, ceil);
    tx(doc, g, W - 25, y, r ? compact(r.tokens) : DASH, { a: 'end', field: r ? 'live.instances[].tokens_by_agent_type' : null, fill: r ? 'var(--aihud-text)' : 'var(--aihud-faint)' });
    tx(doc, g, W, y, r ? pct(r.share) : DASH, { a: 'end', px: 9, field: r && num(r.share) != null ? s.pctField : null, fill: r && num(r.share) != null ? heat(r.share) : 'var(--aihud-faint)' });
  });
}

// ── drawing helpers (copied in so this tile stands alone) ──
const DASH = '–';

const NS = 'http://www.w3.org/2000/svg';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

const inst = (d) => (d && d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;

function h(doc, tag, css, text) {
  const e = doc.createElement(tag);
  if (css) e.style.cssText = css;
  if (text != null) e.textContent = String(text);
  return e;
}

function sv(doc, tag, attrs, text) {
  const e = doc.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text != null) e.textContent = String(text);
  return e;
}

/** Tile box + Minimal card + ONE svg plate (W x H sketch px). Everything is drawn into the plate. */
function plate(el, size, padY = 5, padX = 6) {
  const doc = el.ownerDocument, z = size.unit / 20;
  const box = h(doc, 'div', [
    `width:${size.cols * size.unit}px`, `height:${size.rows * size.unit}px`, 'box-sizing:border-box',
    `padding:${2 * z}px`, 'overflow:hidden', 'font-family:var(--aihud-font)', 'color:var(--aihud-text)',
  ].join(';'));
  const card = h(doc, 'div', [
    'height:100%', 'box-sizing:border-box', 'overflow:hidden', `padding:${padY * z}px ${padX * z}px`,
    'background:var(--aihud-panel)', 'border-radius:var(--aihud-radius)',
  ].join(';'));
  const W = size.cols * 20 - 4 - 2 * padX, H = size.rows * 20 - 4 - 2 * padY;
  const g = sv(doc, 'svg', { width: W * z, height: H * z, viewBox: `0 0 ${W} ${H}` });
  g.style.cssText = 'display:block;overflow:hidden';
  card.append(g); box.append(card); el.replaceChildren(box);
  return { doc, g, W, H, box };
}

/** Text in the plate, vertically centred on y. px >= 9 (legibility floor at unit 20). */
function tx(doc, g, x, y, str, o = {}) {
  const st = [`font-family:var(${o.mono ? '--aihud-font-mono' : '--aihud-font'})`, `font-size:${o.px || 9.5}px`,
    `fill:${o.fill || 'var(--aihud-dim)'}`, 'font-variant-numeric:tabular-nums'];
  if (o.w) st.push(`font-weight:${o.w}`);
  if (o.up) st.push('text-transform:uppercase', 'letter-spacing:.06em');
  const e = sv(doc, 'text', { x, y, 'text-anchor': o.a || 'start', 'dominant-baseline': 'central', style: st.join(';') }, str);
  if (o.field) e.setAttribute('data-field', o.field);
  g.append(e);
  return e;
}

const rect = (doc, g, x, y, w, hh, fill, op) => g.append(sv(doc, 'rect', { x, y, width: w, height: hh, style: `fill:${fill}${op != null ? `;opacity:${op}` : ''}` }));

/** A name cut to w sketch px; the full name goes on the hover title. */
function name(doc, g, x, y, str, w, o = {}) {
  const s = String(str), n = Math.max(1, Math.floor(w / ((o.px || 9.5) * 0.5)));
  const shown = s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
  const e = tx(doc, g, x, y, shown, o);
  if (shown !== s) e.append(sv(doc, 'title', {}, s));
  return e;
}

// heat: CONTRACT.md §Heat. Micro-marks are thin strokes -> the TEXT stops by default.
const HEAT_STOPS = [0, 30, 50, 75, 100];

const HEAT_TEXT = ['var(--aihud-heat-text-0)', 'var(--aihud-heat-text-30)', 'var(--aihud-heat-text-50)', 'var(--aihud-heat-text-75)', 'var(--aihud-heat-text-100)'];

function heat(v, ramp = HEAT_TEXT) {
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i]) i++;
  const p = ((HEAT_STOPS[i] - x) / (HEAT_STOPS[i] - HEAT_STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}

/** Tokens short: 812 · 534k · 5.8M; missing -> dash. */
function compact(n) {
  if (num(n) == null) return DASH;
  if (n < 1000) return String(Math.round(n));
  if (n < 999500) return `${(n / 1e3).toFixed(n < 9950 ? 1 : 0).replace(/\.0$/, '')}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
}

const pct = (v) => (num(v) == null ? DASH : `${v < 10 ? v.toFixed(1).replace(/\.0$/, '') : Math.round(v)}%`);

/**
 * The register rail: ticks of FIXED worth on a baseline. ceil = the rail's end in % of session
 * tokens; one tick = 1/2/5/10 % (the finest that keeps >= 2.4 px pitch); every 5th tick long.
 * Lit ticks take the heat colour of their own position.
 */
function rail(doc, g, x, yb, w, v, ceil) {
  const st = [1, 2, 5, 10, 20].find((q) => w / (ceil / q) >= 2.4) || 25;
  const n = Math.max(1, Math.round(ceil / st)), p = w / n;
  const lit = num(v) == null ? 0 : Math.min(n, Math.max(v > 0 ? 1 : 0, Math.round(v / st)));
  rect(doc, g, x, yb, w, 0.8, 'var(--aihud-line)');
  for (let i = 0; i < n; i++) {
    const val = (i + 1) * st, long = (i + 1) % 5 === 0, on = i < lit;
    const hh = long ? 7 : 4, tw = on ? 1.3 : 1;
    rect(doc, g, x + (i + 0.5) * p - tw / 2, yb - hh, tw, hh, on ? heat(val) : 'var(--aihud-faint)', on ? null : 0.45);
  }
}

/** The rail's end: the next multiple of `stepTo` above the largest share, at least 10 %. */
const ceilOf = (shares, stepTo) => Math.max(10, Math.ceil(Math.max(0, ...shares.filter((s) => num(s) != null)) / stepTo) * stepTo);

/** A dot of a share: radius and heat grow with the share (open ring = no own tokens measured). */
function dot(doc, g, cx, yb, share, field) {
  if (num(share) == null) {
    const r = 2;
    g.append(sv(doc, 'circle', { cx, cy: yb - 1.5 - r, r, style: 'fill:none;stroke:var(--aihud-faint);stroke-width:1' }));
    return;
  }
  const r = 1.3 + 2.7 * Math.sqrt(Math.min(share, 25) / 25);
  g.append(sv(doc, 'circle', { cx, cy: yb - 1.5 - r, r, ...(field ? { 'data-field': field } : {}), style: `fill:${heat(share)}` }));
}

function sessionTotal(d) {
  const nodes = d && d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const i = inst(d);
  return root && num(root.tokens_total) != null ? root.tokens_total : i && num(i.tokens_total) != null ? i.tokens_total : null;
}

/** #11 + #4: count = agents.subagents_started (read, never counted here), one dot per subagent node, the three heaviest roles. */
function subInfo(d) {
  const nodes = d && d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : null;
  const total = sessionTotal(d);
  const rootN = nodes ? nodes.find((n) => n.parent_id == null) : null;
  const tPath = rootN && num(rootN.tokens_total) != null ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const subs = nodes ? nodes.filter((n) => n.parent_id != null) : [];
  const started = d && d.agents ? d.agents.subagents_started : null;
  const count = Number.isInteger(started) && started >= 0 ? started : null;
  // one dot per non-root node; no own tokens -> open ring; a collapsed workflow node = one dot + label x n
  const dots = subs.map((n, k) => ({ k, turn: num(n.started_in_turn), w: num(n.agent_count) != null ? n.agent_count : 1, share: total > 0 && num(n.tokens_self) > 0 ? (n.tokens_self / total) * 100 : null }))
    .sort((a, b) => (a.turn == null) - (b.turn == null) || (a.turn || 0) - (b.turn || 0) || a.k - b.k);
  const i = inst(d);
  const roles = i && i.tokens_by_agent_type && typeof i.tokens_by_agent_type === 'object'
    ? Object.entries(i.tokens_by_agent_type).filter(([k, v]) => k !== 'main' && num(v) != null).sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([r, v]) => ({ name: r, tokens: v, share: total > 0 ? (v / total) * 100 : null })) : [];
  while (roles.length < 3) roles.push(null);
  return { count, absent: count == null && notRecorded(d, 'agents', 'subagents'), dots, roles, dotField: 'agents.nodes[].tokens_self ' + tPath, pctField: 'live.instances[].tokens_by_agent_type ' + tPath };
}

/** The dot row: one dot per subagent on the baseline, a notch under the line where the start turn changes. */
function dotRow(doc, g, x, yb, w, dots, dotField) {
  rect(doc, g, x, yb, w, 0.8, 'var(--aihud-line)');
  if (!dots.length) return;
  const big = dots.length > 40;   // more than ~40 dots: ONE mark on a container instead of one per dot
  const T = big ? sv(doc, 'g', { 'data-field': dotField }) : g;
  if (big) g.append(T);
  let GAP = 6;
  let gaps = 0;
  for (let k = 1; k < dots.length; k++) if (dots[k].turn !== dots[k - 1].turn) gaps++;
  GAP = Math.min(6, w * 0.3 / Math.max(1, gaps));
  const XW = (dd) => (dd.w === 1 ? 0 : 3 + 5 * (`×${dd.w}`.length));
  const extra = dots.reduce((a, dd) => a + XW(dd), 0);
  const pitch = Math.max(1, Math.min(12, (w - gaps * GAP - extra) / dots.length));
  let cx = x + pitch / 2;
  dots.forEach((dd, k) => {
    if (k && dd.turn !== dots[k - 1].turn) {
      rect(doc, T, cx - pitch / 2 + GAP / 2 - 0.5, yb + 1.5, 1, 3.5, 'var(--aihud-faint)');
      cx += GAP;
    }
    dot(doc, T, cx, yb, dd.share, big ? null : dotField);
    if (dd.w !== 1) tx(doc, T, cx + 5, yb - 5.5, `×${dd.w}`, { px: 9, fill: 'var(--aihud-dim)', field: 'agents.nodes[].agent_count' });
    cx += pitch + XW(dd);
  });
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

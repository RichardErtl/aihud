// Minimal (Hairline Register) top-three-subagents, reduced: rank, type, share as ticks. (portrait, 8 × 3)
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'top-three-subagents-register-portrait',
  contentBlock: 'top-three-subagents',
  style: 'register',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 3 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const { doc, g, W } = plate(el, size);
  const top = top3(data);
  const subAbs = !top[0] && notRecorded(data, 'agents', 'subagents');
  const ceil = ceilOf(top.map((t) => t && t.share), 5);
  top.forEach((t, k) => {
    const y = 7 + k * 16;
    dot(doc, g, 4, y + 5.5, t ? t.share : null);
    name(doc, g, 12, y, t ? t.name : DASH, 52, { field: t ? t.nameF : null, fill: t ? 'var(--aihud-dim)' : 'var(--aihud-faint)' });
    rail(doc, g, 67, y + 4, W - 95, t && t.share, ceil);
    tx(doc, g, W, y, t ? pct(t.share) : DASH, { px: 11, w: 600, field: t ? t.shareF : k === 0 && subAbs ? 'agents.subagents_started' : null, a: 'end', fill: t ? heat(t.share) : k === 0 && subAbs ? 'var(--aihud-absent)' : 'var(--aihud-faint)' });
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
function dot(doc, g, cx, yb, share) {
  if (num(share) == null) {
    const r = 2;
    g.append(sv(doc, 'circle', { cx, cy: yb - 1.5 - r, r, style: 'fill:none;stroke:var(--aihud-faint);stroke-width:1' }));
    return;
  }
  const r = 1.3 + 2.7 * Math.sqrt(Math.min(share, 25) / 25);
  g.append(sv(doc, 'circle', { cx, cy: yb - 1.5 - r, r, style: `fill:${heat(share)}` }));
}

function sessionTotal(d) {
  const nodes = d && d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const i = inst(d);
  return root && num(root.tokens_total) != null ? root.tokens_total : i && num(i.tokens_total) != null ? i.tokens_total : null;
}

/** #24: the three subagents with the most own tokens, each as its share of the session. */
function top3(d) {
  const nodes = d && d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const total = sessionTotal(d);
  const rootN = nodes.find((n) => n.parent_id == null);
  const tPath = rootN && num(rootN.tokens_total) != null ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const top = total > 0 ? nodes.filter((n) => n.parent_id != null && num(n.tokens_self) > 0)
    .sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3)
    .map((n) => ({ name: n.agent_type || DASH, nameF: n.agent_type ? 'agents.nodes[].agent_type' : null, share: (n.tokens_self / total) * 100, shareF: 'agents.nodes[].tokens_self ' + tPath })) : [];
  while (top.length < 3) top.push(null);
  return top;
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

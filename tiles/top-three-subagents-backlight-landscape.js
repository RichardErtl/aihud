// Backlight - top three subagents (landscape): three ring filaments.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'top-three-subagents-backlight-landscape',
  contentBlock: 'top-three-subagents',
  style: 'backlight',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 6 }],
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

/** Pulse: a bright point, white-hot core, coloured sheath, glow growing with the value. */
function pulse(box, cx, cy, r, v, z, a) {
  const c = heat(v);
  add(box, 'left:' + (cx - r).toFixed(2) + 'px;top:' + (cy - r).toFixed(2) + 'px;width:' + (2 * r).toFixed(2) + 'px;height:' + (2 * r).toFixed(2) + 'px;border-radius:50%;'
    + 'opacity:' + (a == null ? 1 : a).toFixed(2) + ';'
    + 'background:radial-gradient(circle, var(--aihud-heat-text-0) 0 30%, ' + c + ' 58%, ' + fade(c, 0) + ' 74%);'
    + 'box-shadow:0 0 ' + glow(v, z, 1.3) + ' ' + fade(c, 70) + (hot(v) ? ', 0 0 0 ' + Math.max(0.5, 0.03 * r).toFixed(2) + 'px ' + edge(v) : ''));
}

/** Ring filament (SVG): share as arc length, tip pulse with recency brightness. */
function ring(box, u, z, o) {
  const doc = box.ownerDocument, NS = 'http://www.w3.org/2000/svg', D = o.d, c = D / 2;
  const sw = Math.max(1.5, 0.1 * u), rt = 0.11 * u, r = c - Math.max(sw / 2, rt) - 0.5;
  const svg = doc.createElementNS(NS, 'svg');
  const at = (k, v) => { for (const [a, b] of Object.entries(v)) k.setAttribute(a, String(b)); return k; };
  at(svg, { width: D.toFixed(2), height: D.toFixed(2), viewBox: '0 0 ' + D.toFixed(2) + ' ' + D.toFixed(2) });
  svg.style.cssText = 'position:absolute;overflow:hidden;left:' + (o.cx - c).toFixed(2) + 'px;top:' + o.top.toFixed(2) + 'px';
  svg.append(at(doc.createElementNS(NS, 'circle'), { cx: c, cy: c, r: r.toFixed(2), style: 'fill:none;stroke:var(--aihud-line);stroke-width:' + (sw * 0.6).toFixed(2) }));
  const it = o.item;
  if (it && it.pct != null) {
    const v = Math.max(0.5, Math.min(100, it.pct)), C = 2 * Math.PI * r, L = (C * v) / 100, col = heat(it.pct);
    const arc = (width, stroke, extra) => at(doc.createElementNS(NS, 'circle'), { cx: c, cy: c, r: r.toFixed(2), transform: 'rotate(-90 ' + c + ' ' + c + ')',
      style: 'fill:none;stroke:' + stroke + ';stroke-width:' + width.toFixed(2) + ';stroke-linecap:round;stroke-dasharray:' + L.toFixed(2) + ' ' + C.toFixed(2) + ';' + (extra || '') });
    svg.append(arc(sw, col, 'filter:drop-shadow(0 0 ' + glow(it.pct, z, 0.9) + ' ' + col + ')'));
    if (hot(it.pct)) svg.append(arc(Math.max(0.6, sw * 0.35), edge(it.pct)));
    const th = ((-90 + 3.6 * v) * Math.PI) / 180;
    svg.append(at(doc.createElementNS(NS, 'circle'), { cx: (c + r * Math.cos(th)).toFixed(2), cy: (c + r * Math.sin(th)).toFixed(2), r: rt.toFixed(2),
      style: 'fill:var(--aihud-heat-text-0);opacity:' + it.rec.toFixed(2) + ';filter:drop-shadow(0 0 ' + glow(it.pct, z, 1.2) + ' ' + col + ')' }));
  }
  box.append(svg);
}

const iso = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

/** Three heaviest subagents + count + subagent share; slots null where none. */
function heavy(data) {
  const d = data || {};
  const nodes = d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null;
  const total = root && isNum(root.tokens_total) ? root.tokens_total : inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const totalPath = root && isNum(root.tokens_total) ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const subs = nodes.filter((n) => n.parent_id != null && isNum(n.tokens_self) && n.tokens_self > 0);
  const count = d.agents && Number.isInteger(d.agents.subagents_started) && d.agents.subagents_started >= 0 ? d.agents.subagents_started : null; // read from the reader (agents.subagents_started), never counted here
  const subTok = inst && isNum(inst.tokens_main) && isNum(inst.tokens_total) ? inst.tokens_total - inst.tokens_main : subs.reduce((s, n) => s + n.tokens_self, 0);
  const share = total > 0 && subs.length ? (subTok / total) * 100 : null;
  const sharePath = [...new Set(inst && isNum(inst.tokens_main) && isNum(inst.tokens_total) ? ['live.instances[].tokens_total', 'live.instances[].tokens_main', totalPath] : ['agents.nodes[].tokens_self', totalPath])].join(' ');
  const lastAll = nodes.reduce((m, n) => { const t = iso(n.last_activity); return t != null && t > m ? t : m; }, -Infinity);
  const top = subs.slice().sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3).map((n) => {
    const t = iso(n.last_activity), age = t != null && Number.isFinite(lastAll) ? (lastAll - t) / 60000 : null;
    return { name: typeof n.agent_type === 'string' ? n.agent_type : '–', nameMarked: typeof n.agent_type === 'string', pctPath: 'agents.nodes[].tokens_self ' + totalPath, tokens: n.tokens_self,
      pct: total > 0 ? (n.tokens_self / total) * 100 : null, turn: isNum(n.started_in_turn) ? n.started_in_turn : null,
      last: t, rec: age == null ? 0.55 : 0.3 + 0.7 * Math.exp(-Math.max(0, age) / 45) };
  });
  while (top.length < 3) top.push(null);
  return { top, count, share, sharePath, absent: count == null && notRecorded(d, 'agents', 'subagents') };
}

function tok(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 999500) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1000) return Math.round(n / 1000) + 'k';
  return String(Math.round(n));
}

const pct = (v) => (v >= 99.95 ? '100' : v.toFixed(1));

const clock = (t) => { const x = new Date(t); return String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0'); };

const KIT = { frame, heavy, ring, num, add, tok, clock, label, span };

function topHeader(B, box, u, h, long) {
  B.label(box, u, { x: 0.5 * u, y: 0.45 * u }, 'TOP 3');
  const n = B.add(box, 'right:' + 0.5 * u + 'px;top:' + 0.45 * u + 'px;font:' + 0.5 * u + 'px var(--aihud-font-mono);color:var(--aihud-dim)',
    h.absent ? null : (h.count != null ? h.count : '–') + ' SUB');
  if (h.absent) { B.span(n, 'color:var(--aihud-absent)', '–').setAttribute('data-field', 'agents.subagents_started'); B.span(n, '', ' SUB'); }
  else if (h.count != null) n.setAttribute('data-field', 'agents.subagents_started');
  if (h.share != null) {
    B.span(n, 'color:var(--aihud-faint)', ' · ');
    B.span(n, 'color:var(--aihud-text)', Math.round(h.share) + '%').setAttribute('data-field', h.sharePath);
    if (long) B.span(n, '', ' OF TOKENS');
  }
}

export function render(el, data, size) {
  const B = KIT, { box, u, z } = B.frame(el, size), h = B.heavy(data);
  topHeader(B, box, u, h, true);
  const cw = (10 * u - 0.6 * u) / 3, D = 2.5 * u, top = 1.1 * u;
  h.top.forEach((it, k) => {
    const cx = 0.3 * u + cw * (k + 0.5), L = (cx - cw / 2 + 1).toFixed(2), W = (cw - 2).toFixed(2);
    B.ring(box, u, z, { cx, top, d: D, item: it });
    const nn = B.num(box, u, z, { x: cx - D / 2, width: D, y: top + D / 2 - 0.37 * u, size: 0.75 * u, weight: 400, v: it && it.pct != null ? it.pct : null, text: it && it.pct != null ? it.pct.toFixed(1) : '', unit: '%' });
    if (it && it.pct != null) nn.setAttribute('data-field', it.pctPath);
    const nmEl = B.add(box, 'left:' + L + 'px;width:' + W + 'px;top:' + 3.85 * u + 'px;text-align:center;overflow:hidden;text-overflow:ellipsis;'
      + 'font:' + 0.55 * u + 'px var(--aihud-font);color:var(--aihud-dim)', it ? it.name : ' ');
    if (it && it.nameMarked) nmEl.setAttribute('data-field', 'agents.nodes[].agent_type');
    const tkEl = B.add(box, 'left:' + L + 'px;width:' + W + 'px;top:' + 4.5 * u + 'px;text-align:center;overflow:hidden;'
      + 'font:' + 0.6 * u + 'px var(--aihud-font-mono);color:var(--aihud-text)', it ? B.tok(it.tokens) : ' ');
    if (it) tkEl.setAttribute('data-field', 'agents.nodes[].tokens_self');
    const when = it ? (it.turn != null ? 'T' + it.turn : '') + (it.turn != null && it.last != null ? ' · ' : '') + (it.last != null ? B.clock(it.last) : '') : '';
    const whEl = B.add(box, 'left:' + L + 'px;width:' + W + 'px;top:' + 5.15 * u + 'px;text-align:center;overflow:hidden;'
      + 'font:' + 0.47 * u + 'px var(--aihud-font-mono);color:var(--aihud-dim)', when || ' ');
    const wp = [it && it.turn != null ? 'agents.nodes[].started_in_turn' : null, it && it.last != null ? 'agents.nodes[].last_activity' : null].filter(Boolean).join(' ');
    if (wp) whEl.setAttribute('data-field', wp);
  });
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

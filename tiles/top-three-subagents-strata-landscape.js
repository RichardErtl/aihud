// Strata, landscape: the three heaviest subagents reduced, the heaviest on the front plane and the next two stepping back; hovering the tile lifts the front plane so the layers behind show.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by unit / 20.

// ── shared layer kit ─────────────────────────────────────────────────────────
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const DASH = '–';
const HEAT_STOPS = [0, 30, 50, 75, 100];
const HEAT_FILL = ['var(--aihud-heat-0)', 'var(--aihud-heat-30)', 'var(--aihud-heat-50)', 'var(--aihud-heat-75)', 'var(--aihud-heat-100)'];
const HEAT_TEXT = ['var(--aihud-heat-text-0)', 'var(--aihud-heat-text-30)', 'var(--aihud-heat-text-50)', 'var(--aihud-heat-text-75)', 'var(--aihud-heat-text-100)'];
/** CONTRACT.md §Heat: straight srgb mix of the two neighbouring stops. */
function heat(v, ramp = HEAT_FILL) {
  const x = Math.max(0, Math.min(100, v));
  let i = 1;
  while (i < HEAT_STOPS.length - 1 && x > HEAT_STOPS[i]) i++;
  const p = ((HEAT_STOPS[i] - x) / (HEAT_STOPS[i] - HEAT_STOPS[i - 1])) * 100;
  return `color-mix(in srgb, ${ramp[i - 1]} ${p.toFixed(1)}%, ${ramp[i]})`;
}
function h(doc, tag, css, text) {
  const n = doc.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}
/** The tile box at its exact pixel size on the OLED ground; inside, the drawing at 20 px per unit, zoomed. */
function frame(el, size) {
  const doc = el.ownerDocument;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
    + 'background:var(--aihud-bg);color:var(--aihud-text)');
  const inner = h(doc, 'div', `position:relative;width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
    + 'font-family:var(--aihud-font);font-variant-numeric:tabular-nums');
  box.append(inner);
  el.replaceChildren(box);
  return inner;
}
/** Ink of depth k: the text colour sunk toward the ground, one step per plane (floor 42 %). */
const ink = (k) => `color-mix(in srgb, var(--aihud-text) ${Math.max(42, 90 - 12 * k)}%, var(--aihud-bg))`;
/** One plane at depth k (0 = front): translucent panel, hairline edge; deeper = thinner, more transparent. */
function plane(doc, x, y, w, ht, k) {
  const fill = k === 0 ? 90 : Math.max(22, 64 - 9 * k);
  const edge = k === 0 ? 30 : Math.max(8, 21 - 3 * k);
  return h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${ht}px;box-sizing:border-box;`
    + `border:1px solid color-mix(in srgb, var(--aihud-text) ${edge}%, transparent);border-radius:var(--aihud-radius);`
    + `background:color-mix(in srgb, var(--aihud-panel) ${fill}%, transparent);overflow:hidden`);
}
/** One line of text at an absolute spot; never wraps, ellipsis instead of overflow. */
function tx(doc, x, y, w, px, color, text, o = {}) {
  const lh = Math.ceil(px * 1.22);
  const n = h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${lh}px;line-height:${lh}px;`
    + `font-size:${px}px;color:${color};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;`
    + `text-align:${o.align || 'left'};font-weight:${o.weight || 400};${o.css || ''}`, text);
  if (o.field) n.setAttribute('data-field', o.field);
  return n;
}
/** A rail: a hairline bar (horizontal or vertical) carrying a value. */
function rail(doc, x, y, w, ht, color, alpha = 1) {
  return h(doc, 'div', `position:absolute;left:${x}px;top:${y}px;width:${Math.max(0, w)}px;height:${Math.max(0, ht)}px;`
    + `background:${color};opacity:${alpha};border-radius:1px`);
}
const glow = (c) => `filter:drop-shadow(0 0 var(--aihud-glow) color-mix(in srgb, ${c} 70%, transparent))`;

// ── data readers ─────────────────────────────────────────────────────────────
const inst0 = (d) => (d.live && Array.isArray(d.live.instances) && d.live.instances[0]) || null;
function heaviest(d) {
  const nodes = d.agents && Array.isArray(d.agents.nodes) ? d.agents.nodes.filter(Boolean) : [];
  const root = nodes.find((n) => n.parent_id == null);
  const inst = inst0(d);
  const total = root && isNum(root.tokens_total) ? root.tokens_total : inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const tPath = root && isNum(root.tokens_total) ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
  const subs = total > 0
    ? nodes.filter((n) => n.parent_id != null && isNum(n.tokens_self) && n.tokens_self > 0).sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3) : [];
  const out = subs.map((n) => ({ name: typeof n.agent_type === 'string' ? n.agent_type : DASH, percent: (n.tokens_self / total) * 100, pctF: 'agents.nodes[].tokens_self ' + tPath, nameF: typeof n.agent_type === 'string' ? 'agents.nodes[].agent_type' : null }));
  while (out.length < 3) out.push(null);
  return out;
}

/**
 * Hover over the tile lifts the front plane out of the way so the layers behind it show;
 * leaving puts it back. One pair of listeners per element, replaced on every redraw.
 */
function reveal(el, front) {
  front.style.transition = 'opacity .18s ease';
  const old = el.__aihudReveal;
  if (old) { el.removeEventListener('mouseenter', old.on); el.removeEventListener('mouseleave', old.off); }
  const on = () => { front.style.opacity = '0.14'; el.setAttribute('data-aihud-reveal', 'on'); };
  const off = () => { front.style.opacity = ''; el.removeAttribute('data-aihud-reveal'); };
  el.__aihudReveal = { on, off };
  el.addEventListener('mouseenter', on);
  el.addEventListener('mouseleave', off);
  if (el.matches(':hover')) on(); else off();
}

function drawTop(el, data, size, ori) {
  const doc = el.ownerDocument, root = frame(el, size), d = data || {};
  const W = size.cols * 20, H = size.rows * 20, top = heaviest(d);
  const portrait = ori === 'portrait';
  const L = portrait ? { N: 2, dx: 28, dy: 6, px: 8, py: 4 } : { N: 2, dx: 6, dy: 15, px: 8, py: 8 };
  const fw = W - 2 * L.px - L.N * L.dx, fy = L.py + L.N * L.dy, fh = H - L.py - fy, iw = fw - 2, ih = fh - 2;
  const lead = top[0] ? top[0].percent : null;
  for (let k = L.N; k >= 1; k--) {
    const pl = plane(doc, L.px + k * L.dx, fy - k * L.dy, fw, fh, k);
    const it = top[k];
    const rel = it && lead > 0 ? Math.min(1, it.percent / lead) : 0;
    if (portrait) {
      const cx = iw - L.dx + 3, y0 = 16, len = ih - y0 - 4;
      pl.append(tx(doc, cx, 2, L.dx - 5, 9.5, ink(k), it ? it.percent.toFixed(1) : DASH, { field: it ? it.pctF : null }));
      if (it) pl.append(rail(doc, cx + 1, y0, 1, len, 'var(--aihud-line)'),
        rail(doc, cx, y0 + len * (1 - rel), 3, len * rel, heat(it.percent), 1 - 0.12 * k));
    } else {
      if (it) pl.append(rail(doc, 0, 0, iw * rel, 2, heat(it.percent), 1 - 0.12 * k));
      pl.append(tx(doc, 6, 2, iw - 12, 9.5, ink(k), it ? `${it.percent.toFixed(1)}%` : DASH, { align: 'right', field: it ? it.pctF : null }));
    }
    root.append(pl);
  }
  const f = plane(doc, L.px, fy, fw, fh, 0);
  const it = top[0];
  const subAbs = !it && notRecorded(d, 'agents', 'subagents');
  const hot = it ? heat(it.percent, HEAT_TEXT) : subAbs ? 'var(--aihud-absent)' : 'var(--aihud-faint)';
  if (it) f.append(rail(doc, 0, 0, iw, 2, heat(it.percent)));
  const val = it ? `${it.percent.toFixed(1)}%` : DASH;
  if (portrait) {
    f.append(
      tx(doc, 8, 3, iw - 12, 18, hot, val, { weight: 650, css: it ? glow(hot) : '', field: it ? it.pctF : subAbs ? 'agents.subagents_started' : null }),
      tx(doc, 8, 24, iw - 12, 9.5, 'var(--aihud-dim)', it ? it.name : '', { field: it ? it.nameF : null }));
  } else {
    const y = Math.round((ih - 38) / 2);
    f.append(
      tx(doc, 4, y, iw - 8, 20, hot, val, { weight: 650, align: 'center', css: it ? glow(hot) : '', field: it ? it.pctF : subAbs ? 'agents.subagents_started' : null }),
      tx(doc, 4, y + 26, iw - 8, 9.5, 'var(--aihud-dim)', it ? it.name : '', { align: 'center', field: it ? it.nameF : null }));
  }
  root.append(f);
  reveal(el, f);
}

export const meta = { name: 'top-three-subagents-strata-landscape', contentBlock: 'top-three-subagents', style: 'strata', orientation: 'landscape', sizes: [{ cols: 5, rows: 6 }], contractVersion: '1.1' };

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  drawTop(el, data, size, 'landscape');
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

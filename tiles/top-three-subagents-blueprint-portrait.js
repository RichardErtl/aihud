// Blueprint, portrait: the three heaviest subagents, each a washer drawn like an engineering part, the share of the session tokens as the hatched sector.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by unit / 20.

const BP = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let seq = 0;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

  // heat: the contract's function - fill stops or text stops
  const STOPS = [0, 30, 50, 75, 100];
  function heat(v, text) {
    const k = text ? 'text-' : '';
    const x = clamp(v, 0, 100);
    let i = 1;
    while (i < STOPS.length - 1 && x > STOPS[i]) i++;
    const p = ((STOPS[i] - x) / (STOPS[i] - STOPS[i - 1])) * 100;
    return `color-mix(in srgb, var(--aihud-heat-${k}${STOPS[i - 1]}) ${p.toFixed(1)}%, var(--aihud-heat-${k}${STOPS[i]}))`;
  }
  const glow = (c) => `filter:drop-shadow(0 0 var(--aihud-glow) ${c})`;

  // number lettering
  function tok(n) {
    if (!isNum(n)) return '–';
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}G`;
    if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : 2)}M`;
    if (n >= 1e3) return n >= 1e4 ? `${Math.round(n / 1e3)}k` : `${(n / 1e3).toFixed(1)}k`;
    return String(Math.round(n));
  }
  function hms(ms) {
    if (!isNum(ms)) return '–';
    const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  const pct = (v) => (isNum(v) ? v.toFixed(1) : '–');
  // width estimate of lettering, in drawing px
  const tw = (str, fs, mono, caps) => String(str).length * fs * (mono ? 0.6 : caps ? 0.7 : 0.55);
  function fit(str, maxW, fs) {
    const s = String(str), n = Math.floor(maxW / (fs * 0.55));
    return s.length <= n ? s : `${s.slice(0, Math.max(1, n - 1))}…`;
  }

  /** The drawing surface: SVG of exactly cols*unit x rows*unit, inner space W x H at 20 px per unit. */
  function sheet(host, size) {
    const doc = host.ownerDocument;
    const W = size.cols * 20, H = size.rows * 20;
    const mk = (tag, a, txt) => {
      const n = doc.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(a || {})) n.setAttribute(k, String(v));
      if (txt != null) n.textContent = txt;
      return n;
    };
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: size.cols * size.unit, height: size.rows * size.unit,
      style: 'display:block;overflow:hidden', role: 'img' });
    const defs = mk('defs');
    svg.append(defs, mk('rect', { x: 0, y: 0, width: W, height: H, style: 'fill:var(--aihud-panel)' }));
    host.replaceChildren(svg);
    const add = (tag, a, txt) => { const n = mk(tag, a, txt); svg.append(n); return n; };

    const STROKE = {
      obj: 'stroke:var(--aihud-dim);stroke-width:1.1',
      thin: 'stroke:var(--aihud-dim);stroke-width:0.6',
      ext: 'stroke:var(--aihud-faint);stroke-width:0.6',
      hid: 'stroke:var(--aihud-faint);stroke-width:0.8;stroke-dasharray:2.4 1.6',
      ctr: 'stroke:var(--aihud-faint);stroke-width:0.55;stroke-dasharray:6 1.5 1.2 1.5',
    };
    const g = {
      W, H, add,
      line(x1, y1, x2, y2, kind = 'thin', extra = '') {
        return add('line', { x1, y1, x2, y2, style: `${STROKE[kind]};fill:none;${extra}` });
      },
      path(d, style) { return add('path', { d, style }); },
      rect(x, y, w, h, kind, fill) {
        return add('rect', { x, y, width: Math.max(0, w), height: h, style: `${kind ? STROKE[kind] : 'stroke:none'};fill:${fill || 'none'}` });
      },
      /** Section hatching in one colour: 45-degree lines over a faint tint of the same colour. */
      hatch(color, tint = 0.14) {
        const id = `aihud-${meta.name}-h${++seq}`;
        const p = mk('pattern', { id, patternUnits: 'userSpaceOnUse', width: 3.2, height: 3.2, patternTransform: 'rotate(45)' });
        p.append(mk('rect', { x: 0, y: 0, width: 3.2, height: 3.2, style: `fill:${color};opacity:${tint}` }),
          mk('line', { x1: 0.8, y1: 0, x2: 0.8, y2: 3.2, style: `stroke:${color};stroke-width:0.75` }));
        defs.append(p);
        return `url(#${id})`;
      },
      /** Lettering. o: fs, anchor, mono, caps, fill, weight. parts: string or [{t, mono, caps, fill, fs}]. */
      text(x, y, parts, o = {}) {
        const fs = o.fs || 9;
        const t = add('text', { x, y, 'text-anchor': o.anchor || 'start',
          style: `fill:${o.fill || 'var(--aihud-dim)'};font-size:${fs}px;font-family:${o.mono ? 'var(--aihud-font-mono)' : 'var(--aihud-font)'};`
            + `${o.weight ? `font-weight:${o.weight};` : ''}${o.caps ? 'letter-spacing:.05em;' : ''}font-variant-numeric:tabular-nums` });
        if (o.field) t.setAttribute('data-field', o.field);
        if (typeof parts === 'string') t.textContent = parts;
        else for (const p of parts) {
          const ta = {};
          if (p.dx != null) ta.dx = p.dx;
          if (p.dy != null) ta.dy = p.dy;
          const s = mk('tspan', { ...ta, style: `${p.fill ? `fill:${p.fill};` : ''}${p.fs ? `font-size:${p.fs}px;` : ''}`
            + `${p.mono ? 'font-family:var(--aihud-font-mono);letter-spacing:0;' : ''}${p.caps ? 'letter-spacing:.05em;' : ''}` }, p.t);
          t.append(s);
        }
        return t;
      },
      /** A closed slim arrowhead, tip at (x, y), pointing dir (+1 right, -1 left, +2 down, -2 up). */
      arrow(x, y, dir) {
        const L = 3.8, B = 1.25;
        const d = Math.abs(dir) === 1
          ? `M${x} ${y} L${x - dir * L} ${y - B} L${x - dir * L} ${y + B} Z`
          : `M${x} ${y} L${x - B} ${y - Math.sign(dir) * L} L${x + B} ${y - Math.sign(dir) * L} Z`;
        return add('path', { d, style: 'fill:var(--aihud-dim);stroke:none' });
      },
      ext(x, y1, y2) { return g.line(x, y1, x, y2, 'ext'); },
      /** Horizontal dimension x1..x2 at y, label in a gap of the line (or beside it if too short). */
      dim(x1, x2, y, label, o = {}) {
        const fs = o.fs || 9.5, len = x2 - x1;
        g.line(x1, y, x2, y, 'thin');
        if (len >= 9) { g.arrow(x1, y, -1); g.arrow(x2, y, 1); }
        else { g.arrow(x1, y, 1); g.arrow(x2, y, -1); }
        if (label == null) return;
        const w = tw(label, fs, true);
        let cx = (x1 + x2) / 2, anchor = 'middle';
        if (w + 6 > len) {
          if (x2 + 3 + w <= W - 2) { cx = x2 + 3; anchor = 'start'; }
          else { cx = x1 - 3; anchor = 'end'; }
        } else {
          g.rect(cx - w / 2 - 2, y - fs * 0.55, w + 4, fs * 1.1, null, 'var(--aihud-panel)');
        }
        g.text(cx, y + fs * 0.34, label, { fs, mono: true, anchor, fill: o.fill || 'var(--aihud-text)', field: o.field });
      },
      /** Item balloon: a circle with a one-digit item number. */
      balloon(cx, cy, n, r = 4.6) {
        add('circle', { cx, cy, r, style: 'fill:var(--aihud-panel);stroke:var(--aihud-dim);stroke-width:0.7' });
        g.text(cx, cy + 3.1, String(n), { fs: 9, anchor: 'middle', mono: true, fill: 'var(--aihud-text)' });
      },
    };
    return g;
  }

  // geometry: angle 0 = 12 o'clock, clockwise
  const pt = (cx, cy, r, a) => { const t = (a * Math.PI) / 180; return [+(cx + r * Math.sin(t)).toFixed(2), +(cy - r * Math.cos(t)).toFixed(2)]; };
  const arcD = (cx, cy, r, a0, a1) => {
    const [x0, y0] = pt(cx, cy, r, a0), [x1, y1] = pt(cx, cy, r, a1);
    return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
  };

  /** A washer in front view: hatched share sector, the rest as hidden lines, centre-line stubs. */
  function washer(g, cx, cy, R, r, share) {
    g.line(cx - R - 4, cy, cx - r + 2, cy, 'ctr'); g.line(cx + r - 2, cy, cx + R + 4, cy, 'ctr');
    g.line(cx, cy - R - 4, cx, cy - r + 2, 'ctr'); g.line(cx, cy + r - 2, cx, cy + R + 4, 'ctr');
    if (!isNum(share)) {
      g.add('circle', { cx, cy, r: R, style: 'fill:none;stroke:var(--aihud-faint);stroke-width:0.8;stroke-dasharray:2.4 1.6' });
      g.add('circle', { cx, cy, r, style: 'fill:none;stroke:var(--aihud-faint);stroke-width:0.8;stroke-dasharray:2.4 1.6' });
      return;
    }
    const a = clamp(share, 0.6, 100) * 3.6;
    const fill = heat(share), line = heat(share, true);
    if (a >= 359.9) {
      g.add('path', { d: `${arcD(cx, cy, R, 0, 180)} ${arcD(cx, cy, R, 180, 359.99).replace('M', 'L')} Z M${cx} ${cy - r} A${r} ${r} 0 1 0 ${cx + 0.01} ${cy - r} Z`,
        'fill-rule': 'evenodd', style: `fill:${g.hatch(fill)};stroke:${line};stroke-width:1;${glow(fill)}` });
      return;
    }
    const [ox, oy] = pt(cx, cy, R, a), [ix, iy] = pt(cx, cy, r, a);
    const big = a > 180 ? 1 : 0;
    g.add('path', { d: `M${cx} ${cy - R} A${R} ${R} 0 ${big} 1 ${ox} ${oy} L${ix} ${iy} A${r} ${r} 0 ${big} 0 ${cx} ${cy - r} Z`,
      style: `fill:${g.hatch(fill, 0.2)};stroke:${line};stroke-width:1;stroke-linejoin:round;${glow(fill)}` });
    g.path(arcD(cx, cy, R, a, 360), 'fill:none;stroke:var(--aihud-faint);stroke-width:0.8;stroke-dasharray:2.4 1.6');
    g.path(arcD(cx, cy, r, a, 360), 'fill:none;stroke:var(--aihud-faint);stroke-width:0.8;stroke-dasharray:2.4 1.6');
  }

  // ---- data readers (contract fields only) ----
  const inst0 = (d) => (d.live && Array.isArray(d.live.instances) ? d.live.instances[0] || null : null);

  /** The three heaviest subagents by own tokens, as a share of the session total; null slots where none. */
  function top3(d) {
    const nodes = arr(d.agents && d.agents.nodes);
    const root = nodes.find((n) => n.parent_id == null);
    const inst = inst0(d);
    const total = root && isNum(root.tokens_total) ? root.tokens_total : inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const totalPath = root && isNum(root.tokens_total) ? 'agents.nodes[].tokens_total' : 'live.instances[].tokens_total';
    const subs = total > 0
      ? nodes.filter((n) => n.parent_id != null && isNum(n.tokens_self) && n.tokens_self > 0).sort((a, b) => b.tokens_self - a.tokens_self).slice(0, 3) : [];
    const items = subs.map((n) => ({ name: typeof n.agent_type === 'string' ? n.agent_type : '–', tokens: n.tokens_self, pct: (n.tokens_self / total) * 100, pctPath: `agents.nodes[].tokens_self ${totalPath}`, nameMarked: typeof n.agent_type === 'string' }));
    const sum = items.length ? items.reduce((s, x) => s + x.tokens, 0) : null;
    while (items.length < 3) items.push(null);
    return { items, total, totalPath, sum, sumPct: sum != null ? (sum / total) * 100 : null, sumPath: 'agents.nodes[].tokens_self ' + totalPath };
  }

  return { sheet, heat, glow, tok, pct, fit, washer, top3 };
})();


export const meta = { name: 'top-three-subagents-blueprint-portrait', contentBlock: 'top-three-subagents', style: 'blueprint', orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }], contractVersion: '1.1' };

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const g = BP.sheet(el, size), t = BP.top3(data || {});
  const subAbs = !t.items[0] && notRecorded(data, 'agents', 'subagents'), tokAbs = t.total == null && notRecorded(data, 'live', 'tokens');
  const cx = [27, 80, 133], cy = 50, R = 20, r = 14;
  g.text(6, 11, 'TOP 3 SUBAGENTS', { caps: true });
  g.ext(7, 19, 47); g.ext(153, 19, 47);
  g.dim(7, 153, 24, t.sumPct != null ? `(${BP.pct(t.sumPct)}%)` : '–', { fill: t.sumPct == null && tokAbs ? 'var(--aihud-absent)' : 'var(--aihud-dim)', field: t.sumPct != null ? t.sumPath : tokAbs ? t.totalPath : null });
  t.items.forEach((it, i) => {
    BP.washer(g, cx[i], cy, R, r, it ? it.pct : null);
    if (it) g.balloon(cx[i] + 17.7, cy + 17.7, i + 1);
    g.text(cx[i], cy + 3.6, it ? BP.pct(it.pct) : '–', { fs: 10.5, mono: true, anchor: 'middle', weight: 600, field: it ? it.pctPath : i === 0 && subAbs ? 'agents.subagents_started' : null,
      fill: it ? BP.heat(it.pct, true) : i === 0 && subAbs ? 'var(--aihud-absent)' : 'var(--aihud-faint)' });
    g.text(cx[i], 87, it ? BP.fit(it.name, 50, 9) : '–', { anchor: 'middle', field: it && it.nameMarked ? 'agents.nodes[].agent_type' : null });
    g.text(cx[i], 99.5, it ? BP.tok(it.tokens) : '–', { field: it ? 'agents.nodes[].tokens_self' : null, fs: 9.5, mono: true, anchor: 'middle', fill: 'var(--aihud-text)' });
  });
  g.line(6, 105.5, 154, 105.5, 'ext');
  g.text(6, 116.5, 'SESSION TOKENS', { caps: true });
  if (tokAbs) g.text(154, 116.5, '–', { field: t.totalPath, fs: 9.5, mono: true, anchor: 'end', fill: 'var(--aihud-absent)' });
  else {
    g.text(154, 116.5, BP.tok(t.total), { field: t.total != null ? t.totalPath : null, fs: 9.5, mono: true, anchor: 'end', fill: 'var(--aihud-text)' });
  }
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

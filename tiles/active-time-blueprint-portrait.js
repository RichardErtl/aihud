// Blueprint, portrait: active time, working against waiting drawn as dimensioned bars, the turns hatched along real time.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by unit / 20.

const BP = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  let seq = 0;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const arr = (v) => (Array.isArray(v) ? v.filter(Boolean) : []);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const time = (s) => { const t = typeof s === 'string' ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : null; };

  function hms(ms) {
    if (!isNum(ms)) return '–';
    const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  }
  const pct = (v) => (isNum(v) ? v.toFixed(1) : '–');
  // width estimate of lettering, in drawing px
  const tw = (str, fs, mono, caps) => String(str).length * fs * (mono ? 0.6 : caps ? 0.7 : 0.55);
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
        if (o.field) t.setAttribute('data-field', o.field);   // value mark (CONTRACT.md "Value marks")
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

  // ---- data readers (contract fields only) ----

  /** Working vs waiting time (#10) plus the turn segments along real time (seconds from the start). */
  function active(d) {
    const s = d.session || {};
    const work = isNum(s.work_ms) ? s.work_ms : null, wait = isNum(s.wait_ms) ? s.wait_ms : null;
    const total = work != null && wait != null ? work + wait : null;
    const t0 = time(s.started_at);
    const turns = arr(d.turn && d.turn.turns);
    const segs = [], ticks = [];
    let longest = null;
    for (const t of turns) {
      const st = time(t.started_at);
      if (isNum(t.duration_s) && (!longest || t.duration_s > longest.s)) longest = { s: t.duration_s, n: t.number };
      if (t0 == null || st == null) continue;
      if (isNum(t.duration_s)) segs.push([(st - t0) / 1000, t.duration_s]);
      else ticks.push((st - t0) / 1000);
    }
    let span = total != null ? total / 1000 : null;
    if (span == null && segs.length) span = Math.max(...segs.map(([a, b]) => a + b));
    return { work, wait, total, share: total > 0 ? (work / total) * 100 : null, segs, ticks, span,
      turns: turns.length || null, longest };
  }

  return { sheet, hms, pct, tw, active, clamp };
})();


// shared drawing of the active-time views (used by both orientations)
function bpShaft(g, a, x0, x1, y, h) {
  const L = x1 - x0;
  g.line(x0 - 5, y + h / 2, x1 + 5, y + h / 2, 'ctr');
  g.rect(x0, y, L, h, 'hid');
  if (!a.span) return;
  const hat = g.hatch('var(--aihud-main)', 0.16);
  const segs = a.segs;
  for (const [s, dur] of segs) {
    const xa = x0 + (L * BP.clamp(s, 0, a.span)) / a.span;
    const xb = x0 + (L * BP.clamp(s + dur, 0, a.span)) / a.span;
    g.rect(xa, y, Math.max(0.9, xb - xa), h, null, hat).setAttribute('data-field', 'turn.turns[].started_at turn.turns[].duration_s');
    g.line(xa, y, xa, y + h, 'obj'); g.line(xa + Math.max(0.9, xb - xa), y, xa + Math.max(0.9, xb - xa), y + h, 'obj');
    g.line(xa, y, xa + Math.max(0.9, xb - xa), y, 'obj'); g.line(xa, y + h, xa + Math.max(0.9, xb - xa), y + h, 'obj');
  }
  for (const s of a.ticks) {
    const x = x0 + (L * BP.clamp(s, 0, a.span)) / a.span;
    g.line(x, y - 2, x, y + h + 2, 'thin').setAttribute('data-field', 'turn.turns[].started_at');
  }
}
function bpCollapsed(g, a, x0, x1, y, h) {
  const L = x1 - x0;
  if (a.share == null) { g.rect(x0, y, L, h, 'hid'); return x0 + L / 2; }
  const xs = x0 + (L * a.share) / 100;
  g.rect(x0, y, xs - x0, h, 'obj', g.hatch('var(--aihud-main)', 0.16)).setAttribute('data-field', 'session.work_ms session.wait_ms');
  g.rect(xs, y, x1 - xs, h, 'hid');
  return xs;
}
export const meta = { name: 'active-time-blueprint-portrait', contentBlock: 'active-time', style: 'blueprint', orientation: 'portrait', sizes: [{ cols: 8, rows: 5 }], contractVersion: '1.1' };

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const g = BP.sheet(el, size), a = BP.active(data || {});
  const x0 = 8, x1 = 152;
  g.text(6, 11, 'ACTIVE TIME', { caps: true });
  const tv = a.turns != null ? String(a.turns) : '–';
  g.text(154, 11, tv, { fs: 9.5, mono: true, anchor: 'end', fill: 'var(--aihud-text)', field: a.turns != null ? 'turn.turns' : undefined });
  g.text(154 - BP.tw(tv, 9.5, true) - 4, 11, 'TURNS', { caps: true, anchor: 'end' });
  g.ext(x0, 18, 28); g.ext(x1, 18, 28);
  g.dim(x0, x1, 22.5, a.total != null ? `(${BP.hms(a.total)})` : '–', { fill: 'var(--aihud-dim)', field: a.total != null ? 'session.work_ms session.wait_ms' : undefined });
  bpShaft(g, a, x0, x1, 30, 10);
  const xs = bpCollapsed(g, a, x0, x1, 52, 8);
  g.ext(x0, 62, 77); g.ext(x1, 62, 77);
  if (a.share != null) {
    g.ext(xs, 62, 77);
    g.dim(x0, xs, 72.5, BP.hms(a.work), { field: 'session.work_ms' });
    g.dim(xs, x1, 72.5, BP.hms(a.wait), { fill: 'var(--aihud-dim)', field: 'session.wait_ms' });
  } else g.dim(x0, x1, 72.5, '–', { fill: 'var(--aihud-faint)' });
  const lab = (cx, word, v, fill) => {
    const parts = [{ t: `${word} `, caps: true }, { t: v, mono: true, fill }];
    const w = BP.tw(`${word} `, 9, false, true) + BP.tw(v, 9.5, true);
    g.text(BP.clamp(cx, 5 + w / 2, 155 - w / 2), 89, parts, { anchor: 'middle', field: v === '–' ? undefined : 'session.work_ms session.wait_ms' });
  };
  if (a.share != null) {
    lab((x0 + xs) / 2, 'WORK', `${BP.pct(a.share)}%`, 'var(--aihud-text)');
    lab((xs + x1) / 2, 'WAIT', `${BP.pct(100 - a.share)}%`, 'var(--aihud-dim)');
  } else { lab(48, 'WORK', '–', 'var(--aihud-faint)'); lab(112, 'WAIT', '–', 'var(--aihud-faint)'); }
}

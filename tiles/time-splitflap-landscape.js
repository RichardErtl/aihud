// Splitflap (departure board) · time · landscape: turn + session runtime, air/ground split, one timetable row per turn.
// Split-flap look: flaps, timetable rows, lamp from the heat scale. Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn at 20 px per unit, zoomed to the unit.

export const meta = {
  name: 'time-splitflap-landscape',
  contentBlock: 'time',
  style: 'splitflap',
  orientation: 'landscape',
  sizes: [{ cols: 16, rows: 6 }],
  contractVersion: '1.1',
};

const FB = (() => {
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  const SVGNS = 'http://www.w3.org/2000/svg';

  // flap cell presets (sketch px): w, h, font size, gap
  const CELL = {
    L: { w: 12, h: 18, fs: 13.5, gap: 1.5 },
    M: { w: 10, h: 15, fs: 11, gap: 1 },
    S: { w: 8, h: 12, fs: 9.5, gap: 1 },
  };

  const LABEL = 'font:600 9.5px/11px var(--aihud-font);letter-spacing:.09em;text-transform:uppercase;white-space:nowrap';

  const MONO = 'font:500 9.5px/12px var(--aihud-font-mono);white-space:nowrap;overflow:hidden';

  function h(doc, tag, css, text) {
    const n = doc.createElement(tag);
    if (css) n.style.cssText = css;
    if (text != null) n.textContent = text;
    return n;
  }

  /** Tile box at its exact pixel size; inside, the board at 20 px per unit, zoomed to the unit. */
  function frame(el, size, pad) {
    const doc = el.ownerDocument;
    const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
      + 'background:var(--aihud-panel);color:var(--aihud-text)');
    const inner = h(doc, 'div', `width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
      + `box-sizing:border-box;padding:${pad};overflow:hidden;display:flex;flex-direction:column;justify-content:center;`
      + 'font:11px/1.2 var(--aihud-font);font-variant-numeric:tabular-nums');
    box.append(inner);
    const memo = el._fbMemo || {};
    el.replaceChildren(box);
    el._fbMemo = {};
    return { doc, inner, memo, next: el._fbMemo, w: size.cols * 20 };
  }

  const cellsWidth = (n, c) => n * c.w + Math.max(0, n - 1) * c.gap;

  function motionOk(doc) {
    const v = doc.defaultView;
    try { return !(v && v.matchMedia && v.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return true; }
  }

  /**
   * A row of n flap cells holding `text` (upper-cased, cut to n, padded with blank flaps).
   * align 'right' pads on the left (numbers). key: changed characters against the last redraw flip.
   */
  function flaps(F, text, n, c, opt = {}) {
    const { doc } = F;
    let s = String(text == null ? '' : text).toUpperCase();
    if (s.length > n) s = s.slice(0, n - 1) + '…';
    s = opt.align === 'right' ? s.padStart(n, ' ') : s.padEnd(n, ' ');
    const row = h(doc, 'div', `display:flex;flex:none;gap:${c.gap}px;width:${cellsWidth(n, c)}px;height:${c.h}px`);
    const prev = opt.key && typeof F.memo[opt.key] === 'string' ? F.memo[opt.key] : null;
    if (opt.key) F.next[opt.key] = s;
    if (opt.field) row.setAttribute('data-field', opt.field);   // value mark (CONTRACT.md "Value marks")
    const color = opt.color || '--aihud-text';
    const move = opt.key && motionOk(doc);
    for (let i = 0; i < n; i++) {
      const ch = s[i];
      const cell = h(doc, 'div', [
        'flex:none', `width:${c.w}px`, `height:${c.h}px`, 'box-sizing:border-box',
        'display:flex', 'align-items:center', 'justify-content:center',
        `font:600 ${c.fs}px/1 var(--aihud-font-mono)`, `color:var(${color})`,
        'border-radius:var(--aihud-radius-small)', 'box-shadow:inset 0 0 0 0.5px var(--aihud-line)',
        'background:linear-gradient(to bottom,'
          + 'color-mix(in srgb, var(--aihud-text) 13%, var(--aihud-bg)) 0 calc(50% - 0.5px),'
          + 'var(--aihud-panel) calc(50% - 0.5px) calc(50% + 0.5px),'
          + 'color-mix(in srgb, var(--aihud-text) 5%, var(--aihud-bg)) calc(50% + 0.5px) 100%)',
      ].join(';'), ch === ' ' ? '' : ch);
      row.append(cell);
      if (move && (prev == null || prev[i] !== ch) && ch !== ' ' && typeof cell.animate === 'function') {
        cell.animate([{ transform: 'rotateX(88deg)', opacity: 0.4 }, { transform: 'none', opacity: 1 }],
          { duration: 260, delay: i * 28, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'backwards' });
      }
    }
    return row;
  }

  /** Signage label (warm yellow of heat-30) with an optional departure pictogram. */
  function sign(F, text, picto) {
    const { doc } = F;
    const s = h(doc, 'div', `${LABEL};display:flex;align-items:center;gap:3px;color:var(--aihud-heat-text-30);min-width:0;overflow:hidden`);
    if (picto) {
      const svg = doc.createElementNS(SVGNS, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '10'); svg.setAttribute('height', '10');
      svg.style.cssText = 'flex:none;display:block';
      const p = doc.createElementNS(SVGNS, 'path');
      p.setAttribute('d', 'M2.5 19h19v2h-19zM22.07 9.64c-.21-.8-1.04-1.28-1.84-1.06L14.92 10l-6.9-6.43-1.93.51 4.14 7.17-4.97 1.33-1.97-1.54-1.45.39 2.59 4.49L21 11.49c.81-.23 1.28-1.05 1.07-1.85z');
      p.setAttribute('fill', 'currentColor');
      svg.append(p);
      s.append(svg);
    }
    s.append(h(doc, 'span', 'overflow:hidden;text-overflow:clip', text));
    return s;
  }

  const label = (F, text, extra = '', field) => { const n = h(F.doc, 'div', `${LABEL};color:var(--aihud-dim);overflow:hidden;${extra}`, text); if (field) n.setAttribute('data-field', field); return n; };

  const mono = (F, text, css = '', field) => { const n = h(F.doc, 'div', `${MONO};${css}`, text); if (field) n.setAttribute('data-field', field); return n; };

  const line = (F, css) => h(F.doc, 'div', `display:flex;align-items:center;flex:none;min-width:0;${css || ''}`);

  const heatTurn = (s) => !isNum(s) ? null : s < 120 ? 0 : s < 600 ? 30 : s < 1800 ? 50 : s < 3600 ? 75 : 100;

  function lamp(F, heat, field) {
    const on = heat != null;
    const c = on ? `var(--aihud-heat-${heat})` : 'var(--aihud-heat-0)';
    const n = h(F.doc, 'div', `flex:none;width:5px;height:5px;border-radius:1px;background:${c};`
      + (on ? `box-shadow:0 0 var(--aihud-glow) ${c}` : 'opacity:var(--aihud-heat-rest)'));
    if (on && field) n.setAttribute('data-field', field);
    return n;
  }

  const heatText = (heat) => heat == null ? 'color:var(--aihud-faint)'
    : `color:var(--aihud-heat-text-${heat});text-shadow:0 0 var(--aihud-glow) color-mix(in srgb, var(--aihud-heat-${heat}) 45%, transparent)`;

  // ---- time formats (all '–' when unknown) ----
  const DASH = '–';

  const p2 = (n) => String(n).padStart(2, '0');

  function hhmm(date) { return `${p2(date.getHours())}:${p2(date.getMinutes())}`; }

  function clockOf(iso, secs) {
    const t = Date.parse(iso);
    if (!Number.isFinite(t)) return DASH;
    const d = new Date(t);
    return secs ? `${hhmm(d)}:${p2(d.getSeconds())}` : hhmm(d);
  }

  /** m:ss under 100 minutes, else 1h40 */
  function mss(seconds) {
    if (!isNum(seconds) || seconds < 0) return DASH;
    const s = Math.floor(seconds);
    if (s < 6000) return `${Math.floor(s / 60)}:${p2(s % 60)}`;
    return `${Math.floor(s / 3600)}h${p2(Math.floor((s % 3600) / 60))}`;
  }

  function hms(seconds) {
    if (!isNum(seconds) || seconds < 0) return DASH;
    const s = Math.floor(seconds);
    return `${Math.floor(s / 3600)}:${p2(Math.floor((s % 3600) / 60))}:${p2(s % 60)}`;
  }

  // ---- data readers ----
  const turnsOf = (d) => d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((t) => t && typeof t === 'object') : [];

  const inst0 = (d) => d && d.live && Array.isArray(d.live.instances) && d.live.instances[0] && typeof d.live.instances[0] === 'object' ? d.live.instances[0] : null;

  function times(d) {
    const turns = turnsOf(d);
    const last = turns.length ? turns[turns.length - 1] : null;
    const inst = inst0(d);
    const start = d && d.session ? Date.parse(d.session.started_at) : NaN;
    const end = inst ? Date.parse(inst.last_activity) : NaN;
    const work = d && d.session && isNum(d.session.work_ms) ? d.session.work_ms : null;
    const wait = d && d.session && isNum(d.session.wait_ms) ? d.session.wait_ms : null;
    return {
      turns, last,
      turn: last && isNum(last.number) ? last.number : null,
      turnS: last && isNum(last.duration_s) ? last.duration_s : null,
      sessionS: Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null,
      work, wait,
      state: inst && typeof inst.state === 'string' && inst.state ? inst.state : null,
    };
  }

  /** Air (working) vs ground (waiting) split bar, #10. */
  function airBar(F, work, wait, width) {
    const { doc } = F;
    const box = h(doc, 'div', `display:flex;flex:none;width:${width}px;height:3px;gap:1px;border-radius:1px;overflow:hidden`);
    if (work != null && wait != null && work + wait > 0) {
      box.setAttribute('data-field', 'session.work_ms session.wait_ms');
      const a = Math.round((width - 1) * work / (work + wait));
      box.append(h(doc, 'div', `flex:none;width:${a}px;height:3px;background:var(--aihud-main)`),
        h(doc, 'div', `flex:none;width:${width - 1 - a}px;height:3px;background:var(--aihud-line)`));
    } else box.append(h(doc, 'div', `flex:none;width:${width}px;height:3px;background:var(--aihud-line-2)`));
    return box;
  }
  return { isNum, SVGNS, CELL, LABEL, MONO, h, frame, cellsWidth, motionOk, flaps, sign, label, mono, line, heatTurn, lamp, heatText, DASH, p2, hhmm, clockOf, mss, hms, turnsOf, inst0, times, airBar };
})();

function turnRow(F, T, t, cols, isLast) {
  const r = FB.line(F, `width:${cols.W}px;height:12px;gap:4px`);
  if (!t) {
    r.append(FB.mono(F, '', `flex:none;width:${cols.dep}px`), FB.flaps(F, '', 3, FB.CELL.S, { color: '--aihud-faint' }));
    return r;
  }
  const dur = FB.isNum(t.duration_s) ? t.duration_s : null, heat = FB.heatTurn(dur);
  r.append(
    FB.mono(F, FB.clockOf(t.started_at, false), `flex:none;width:${cols.dep}px;color:var(--aihud-dim)`, FB.clockOf(t.started_at, false) === FB.DASH ? null : 'turn.turns[].started_at'),
    FB.flaps(F, FB.isNum(t.number) ? (t.number >= 100 ? '' : 'T') + t.number : FB.DASH, 3, FB.CELL.S, { field: FB.isNum(t.number) ? 'turn.turns[].number' : null, color: isLast ? '--aihud-heat-text-30' : '--aihud-text' }),
    FB.mono(F, FB.mss(dur), `flex:none;width:${cols.dur}px;text-align:right;font-weight:700;font-size:10px;${FB.heatText(heat)}`, dur == null ? null : 'turn.turns[].duration_s'),
  );
  if (cols.remark) {
    const word = isLast && T.state ? T.state : (dur == null ? FB.DASH : 'landed');
    r.append(FB.mono(F, word.toUpperCase(), `flex:none;width:${cols.remark}px;letter-spacing:.04em;${isLast && T.state ? 'color:var(--aihud-heat-text-30)' : FB.heatText(heat)}`, isLast && T.state ? 'live.instances[].state' : dur == null ? null : 'turn.turns[].duration_s'));
  }
  r.append(FB.lamp(F, heat, 'turn.turns[].duration_s'));
  return r;
}
function timeHero(F, T, W) {
  const L = FB.CELL.L, S = FB.CELL.S;
  const out = [];
  const heads = FB.line(F, `justify-content:space-between;width:${W}px;height:11px`);
  heads.append(FB.sign(F, 'Turn', true), FB.label(F, 'Runtime'));
  const hero = FB.line(F, `justify-content:space-between;width:${W}px;margin-top:2px`);
  hero.append(
    FB.flaps(F, T.turn == null ? FB.DASH : String(T.turn), 3, L, { key: 'turn', field: T.turn == null ? null : 'turn.turns[].number', align: 'right', color: T.turn == null ? '--aihud-faint' : '--aihud-text' }),
    FB.flaps(F, FB.mss(T.turnS), 5, L, { key: 'turnS', field: T.turnS == null ? null : 'turn.turns[].duration_s', align: 'right', color: T.turnS == null ? '--aihud-faint' : '--aihud-text' }),
  );
  const ses = FB.line(F, `justify-content:space-between;width:${W}px;margin-top:5px`);
  ses.append(FB.label(F, 'Session'), FB.flaps(F, FB.hms(T.sessionS), 7, S, { key: 'ses', field: T.sessionS == null ? null : 'session.started_at live.instances[].last_activity', align: 'right', color: T.sessionS == null ? '--aihud-faint' : '--aihud-text' }));
  const air = FB.line(F, `justify-content:space-between;width:${W}px;margin-top:5px;height:12px`);
  const fmt = (ms) => ms == null ? FB.DASH : FB.hms(ms / 1000);
  air.append(FB.mono(F, `AIR ${fmt(T.work)}`, 'flex:none;color:var(--aihud-main)', T.work == null ? null : 'session.work_ms'), FB.mono(F, `GND ${fmt(T.wait)}`, 'flex:none;color:var(--aihud-dim)', T.wait == null ? null : 'session.wait_ms'));
  const bar = FB.line(F, `width:${W}px;margin-top:2px`);
  bar.append(FB.airBar(F, T.work, T.wait, W));
  out.push(heads, hero, ses, air, bar);
  return out;
}
function turnBoard(F, T, cols, rows, withSign) {
  const box = FB.h(F.doc, 'div', `display:flex;flex-direction:column;flex:none;width:${cols.W}px`);
  if (withSign) {
    const top = FB.line(F, `justify-content:space-between;width:${cols.W}px;height:11px`);
    top.append(FB.sign(F, 'Turns', false), FB.label(F, T.turns.length ? `${T.turns.length} posted` : FB.DASH, '', T.turns.length ? 'turn.turns' : null));
    box.append(top);
  }
  const heads = FB.line(F, `width:${cols.W}px;height:11px;gap:4px;margin-top:${withSign ? 3 : 6}px`);
  const L = (t, w, al) => FB.label(F, t, `flex:none;width:${w}px;font-size:9px;letter-spacing:.07em;color:var(--aihud-faint);text-align:${al || 'left'}`);
  heads.append(L('Dep', cols.dep), L('Turn', FB.cellsWidth(3, FB.CELL.S)), L('Dur', cols.dur, 'right'));
  if (cols.remark) heads.append(L('Remark', cols.remark));
  const body = FB.h(F.doc, 'div', 'display:flex;flex-direction:column;gap:2px;margin-top:3px;flex:none');
  const newest = T.turns.slice().reverse();
  for (let i = 0; i < rows; i++) body.append(turnRow(F, T, newest[i] || null, cols, i === 0 && !!newest[0]));
  box.append(heads, body);
  return box;
}
export function render(el, data, size) {
  const d = data || {};
  const F = FB.frame(el, size, '4px 6px');
  const W = F.w - 12, LEFT = 130, GAP = 10, RW = W - LEFT - GAP;
  const T = FB.times(d);
  const wrap = FB.line(F, `width:${W}px;gap:${GAP}px;align-items:center`);
  const left = FB.h(F.doc, 'div', `display:flex;flex-direction:column;flex:none;width:${LEFT}px`);
  left.append(...timeHero(F, T, LEFT));
  const rows = Math.max(1, Math.floor((size.rows * 20 - 8 - 11 - 14 + 2) / 14));
  wrap.append(left, turnBoard(F, T, { W: RW, dep: 30, dur: 40, remark: 48 }, rows, true));
  F.inner.append(wrap);
}
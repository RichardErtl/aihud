// Splitflap (departure board) · tools · landscape: per-call timetable, newest on top (reads turn.turns[].tool_calls), under the carrier sign (session.model).
// Split-flap look: flaps, timetable rows, lamp from the heat scale. Standalone: no imports, no network,
// colours only from the design variables (CONTRACT.md). Drawn at 20 px per unit, zoomed to the unit.

export const meta = {
  name: 'tools-splitflap-landscape',
  contentBlock: 'tools',
  style: 'splitflap',
  orientation: 'landscape',
  sizes: [{ cols: 18, rows: 6 }],
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

  const capacity = (width, c) => Math.max(1, Math.floor((width + c.gap) / (c.w + c.gap)));

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
    if (opt.f) row.setAttribute('data-field', opt.f);
    const prev = opt.key && typeof F.memo[opt.key] === 'string' ? F.memo[opt.key] : null;
    if (opt.key) F.next[opt.key] = s;
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

  const label = (F, text, extra = '', f = null) => { const n = h(F.doc, 'div', `${LABEL};color:var(--aihud-dim);overflow:hidden;${extra}`, text); if (f) n.setAttribute('data-field', f); return n; };

  const mono = (F, text, css = '', f = null) => { const n = h(F.doc, 'div', `${MONO};${css}`, text); if (f) n.setAttribute('data-field', f); return n; };

  const line = (F, css) => h(F.doc, 'div', `display:flex;align-items:center;flex:none;min-width:0;${css || ''}`);

  // heat buckets: longer = later = hotter
  const heatMs = (ms) => !isNum(ms) ? null : ms < 1000 ? 0 : ms < 5000 ? 30 : ms < 20000 ? 50 : ms < 60000 ? 75 : 100;

  const REMARK = { 0: 'ON TIME', 30: 'ON TIME', 50: 'SLOW', 75: 'DELAYED', 100: 'HELD' };

  function lamp(F, heat) {
    const on = heat != null;
    const c = on ? `var(--aihud-heat-${heat})` : 'var(--aihud-heat-0)';
    return h(F.doc, 'div', `flex:none;width:5px;height:5px;border-radius:1px;background:${c};`
      + (on ? `box-shadow:0 0 var(--aihud-glow) ${c}` : 'opacity:var(--aihud-heat-rest)'));
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

  /** call duration: 0.3s, 23s, 3m19, 1h04 */
  function callDur(ms) {
    if (!isNum(ms) || ms < 0) return DASH;
    if (SUB && ms === 0) return '<1s';
    const s = ms / 1000;
    if (SUB && s < 10) return `${Math.round(s)}s`;
    if (s < 10) return `${s.toFixed(1)}s`;
    if (s < 60) return `${Math.round(s)}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m${p2(Math.floor(s % 60))}`;
    return `${Math.floor(s / 3600)}h${p2(Math.floor((s % 3600) / 60))}`;
  }

  // ---- data readers ----
  const turnsOf = (d) => d && d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter((t) => t && typeof t === 'object') : [];

  const inst0 = (d) => d && d.live && Array.isArray(d.live.instances) && d.live.instances[0] && typeof d.live.instances[0] === 'object' ? d.live.instances[0] : null;

  function model(d) {
    const m = d && d.session && typeof d.session.model === 'string' && d.session.model ? d.session.model
      : (inst0(d) && typeof inst0(d).model === 'string' && inst0(d).model ? inst0(d).model : null);
    return m ? m.replace(/^claude-/, '') : null;
  }

  /** the catalog path the model name was read from */
  function modelSrc(d) {
    if (d && d.session && typeof d.session.model === 'string' && d.session.model) return 'session.model';
    return inst0(d) && typeof inst0(d).model === 'string' && inst0(d).model ? 'live.instances[].model' : null;
  }

  /** Tool calls from turn.turns[].tool_calls[] ({ tool, started_at, duration_s }), flattened over the turns, newest first; null when there are none. */
  function calls(d) {
    const out = [];
    for (const t of turnsOf(d)) {
      for (const c of (Array.isArray(t.tool_calls) ? t.tool_calls : [])) {
        if (!c || typeof c.tool !== 'string' || !c.tool) continue;
        out.push({ name: c.tool, start: c.started_at, t: Date.parse(c.started_at), ms: isNum(c.duration_s) && c.duration_s >= 0 ? c.duration_s * 1000 : null,
          gate: isNum(t.number) ? t.number : null, k: out.length });
      }
    }
    if (!out.length) return null;
    const key = (c) => (Number.isFinite(c.t) ? c.t : -Infinity);
    return out.sort((a, b) => (key(b) - key(a)) || (b.k - a.k));
  }

  /** turn (gate) a moment falls into, from turn.turns[].started_at */
  function gateOf(d, t) {
    if (!Number.isFinite(t)) return null;
    let g = null, at = -Infinity;
    for (const x of turnsOf(d)) {
      const s = Date.parse(x.started_at);
      if (Number.isFinite(s) && s <= t && s >= at && isNum(x.number)) { g = x.number; at = s; }
    }
    return g;
  }

  const ABBR = { POWERSHELL: 'PWSH', NOTEBOOKEDIT: 'NBEDIT', WEBSEARCH: 'WEBSRCH', WEBFETCH: 'WEBFETCH', TODOWRITE: 'TODO', MULTIEDIT: 'MLTEDIT', TOOLSEARCH: 'TOOLSRCH' };

  function toolName(name, n) {
    const u = String(name).toUpperCase().replace(/^MCP__[^_]+__/, '');
    return u.length > n && ABBR[u] ? ABBR[u] : u;
  }
  return { isNum, SVGNS, CELL, LABEL, MONO, h, frame, cellsWidth, capacity, motionOk, flaps, sign, label, mono, line, heatMs, REMARK, lamp, heatText, DASH, p2, hhmm, clockOf, callDur, turnsOf, inst0, model, modelSrc, calls, gateOf, ABBR, toolName };
})();

function toolRow(F, d, c, cols) {
  const r = FB.line(F, `width:${cols.W}px;height:13px;gap:4px`);
  if (!c) {
    r.append(FB.mono(F, '', `flex:none;width:${cols.dep}px`), FB.flaps(F, '', cols.n, FB.CELL.S, { color: '--aihud-faint' }));
    return r;
  }
  const heat = FB.heatMs(c.ms), g = c.gate != null ? c.gate : FB.gateOf(d, c.t);
  r.append(
    FB.mono(F, Number.isFinite(c.t) ? FB.clockOf(c.start, cols.secs) : FB.DASH, `flex:none;width:${cols.dep}px;color:var(--aihud-dim)`, Number.isFinite(c.t) ? 'turn.turns[].tool_calls[].started_at' : null),
    FB.flaps(F, FB.toolName(c.name, cols.n), cols.n, FB.CELL.S, { f: 'turn.turns[].tool_calls[].tool' }),
    FB.mono(F, g == null ? FB.DASH : (cols.gateWord ? 'T' + g : String(g)), `flex:none;width:${cols.gate}px;text-align:center;color:var(--aihud-dim)`, g == null ? null : c.gate != null ? 'turn.turns[].number' : 'turn.turns[].started_at turn.turns[].number'),
    FB.mono(F, FB.callDur(c.ms), `flex:none;width:${cols.dur}px;text-align:right;font-weight:700;font-size:10px;${FB.heatText(heat)}`, c.ms != null ? 'turn.turns[].tool_calls[].duration_s' : null),
  );
  if (cols.remark) r.append(FB.mono(F, heat == null ? FB.DASH : FB.REMARK[heat], `flex:none;width:${cols.remark}px;letter-spacing:.04em;${FB.heatText(heat)}`, heat == null ? null : 'turn.turns[].tool_calls[].duration_s'));
  r.append(FB.lamp(F, heat));
  return r;
}
function toolHeads(F, cols) {
  const r = FB.line(F, `width:${cols.W}px;height:11px;gap:4px;margin-top:3px`);
  const L = (t, w, al) => FB.label(F, t, `flex:none;width:${w}px;font-size:9px;letter-spacing:.07em;color:var(--aihud-faint);text-align:${al || 'left'}`);
  r.append(L('Dep', cols.dep), L('Tool', FB.cellsWidth(cols.n, FB.CELL.S)), L(cols.gateWord ? 'Gate' : 'T', cols.gate, 'center'), L('Dur', cols.dur, 'right'));
  if (cols.remark) r.append(L('Remark', cols.remark));
  return r;
}
// aihud:whole-seconds v1
const wholeSeconds = (d) => !!(d && Array.isArray(d.caveats) && d.caveats.some((c) => typeof c === 'string' && c.includes('_second_resolution')));
let SUB = false; // whole-second resolution: a 0 is "under 1 s" (tools draw it as <1s)

export function render(el, data, size) {
  SUB = wholeSeconds(data);
  const d = data || {};
  const F = FB.frame(el, size, '4px 6px');
  const W = F.w - 12, S = FB.CELL.S;
  const list = FB.calls(d), m = FB.model(d);
  const mAbs = m ? null : notRecorded(d, 'session', 'model') ? 'session.model' : notRecorded(d, 'live', 'tokens') ? 'live.instances[].model' : null;
  const SIDE = 92, GAP = 10, BW = W - SIDE - GAP;
  const wrap = FB.line(F, `width:${W}px;gap:${GAP}px;align-items:flex-start`);
  // board
  const board = FB.h(F.doc, 'div', `display:flex;flex-direction:column;flex:none;width:${BW}px`);
  const top = FB.line(F, `justify-content:space-between;width:${BW}px;height:11px`);
  top.append(FB.sign(F, 'Tools live - departures', true), FB.label(F, list && list.length ? `${list.length} calls` : FB.DASH, '', list && list.length ? 'turn.turns[].tool_calls' : null));
  const cols = { W: BW, dep: 46, n: 8, gate: 22, dur: 32, remark: 42, secs: true, gateWord: true };
  const rows = Math.max(1, Math.floor((size.rows * 20 - 8 - 11 - 14 + 2) / 15));
  const body = FB.h(F.doc, 'div', 'display:flex;flex-direction:column;gap:2px;margin-top:3px;flex:none');
  for (let i = 0; i < rows; i++) body.append(toolRow(F, d, list ? list[i] : null, cols));
  board.append(top, toolHeads(F, cols), body);
  // side: carrier + tally of the listed calls
  const side = FB.h(F.doc, 'div', `display:flex;flex-direction:column;flex:none;width:${SIDE}px;gap:3px`);
  side.append(FB.label(F, 'Model'), FB.flaps(F, m || FB.DASH, FB.capacity(SIDE, S), S, { key: 'model', color: m ? '--aihud-text' : mAbs ? '--aihud-absent' : '--aihud-faint', f: m ? FB.modelSrc(d) : mAbs }));
  side.append(FB.label(F, 'By tool', 'margin-top:4px'));
  const tally = new Map();
  for (const c of (list || [])) tally.set(c.name, (tally.get(c.name) || 0) + 1);
  const top4 = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const max = top4.length ? top4[0][1] : 1;
  if (!top4.length) side.append(FB.mono(F, FB.DASH, 'color:var(--aihud-faint)'));
  for (const [name, n] of top4) {
    const r = FB.line(F, `width:${SIDE}px;gap:4px;height:12px`);
    const bar = FB.h(F.doc, 'div', `flex:none;width:28px;height:3px;background:var(--aihud-line-2);border-radius:1px;overflow:hidden`);
    bar.append(FB.h(F.doc, 'div', `width:${Math.max(2, Math.round(28 * n / max))}px;height:3px;background:var(--aihud-main)`));
    r.append(FB.mono(F, FB.toolName(name, 8).slice(0, 8), 'flex:none;width:44px;color:var(--aihud-text)', 'turn.turns[].tool_calls[].tool'), bar,
      FB.mono(F, String(n), 'flex:none;width:12px;text-align:right;color:var(--aihud-dim)', 'turn.turns[].tool_calls[].tool'));
    side.append(r);
  }
  wrap.append(board, side);
  F.inner.append(wrap);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

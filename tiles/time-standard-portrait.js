// Standard · time · portrait: the current turn's number and runtime, below a line the session's
// runtime (first timestamp to the last sign of life), both as minutes:seconds.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'time-standard-portrait',
  contentBlock: 'time',
  style: 'standard',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 3 }],
  contractVersion: '1.1',
};

const PAD = '2px 10px';

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const d = data || {};
  const doc = el.ownerDocument;
  const inner = frame(el, size, PAD);
  const { turn, turnSeconds, sessionSeconds } = values(d);

  const big = 'font-size:17px;font-weight:600';
  const faint = 'color:var(--aihud-faint)';
  const top = h(doc, 'div', 'display:flex;justify-content:space-between;align-items:baseline;gap:6px');
  const label = h(doc, 'span', big, 'Turn ');
  const turnEl = h(doc, 'span', turn == null ? faint : '', turn == null ? '–' : String(turn));
  if (turn != null) turnEl.setAttribute('data-field', 'turn.turns[].number');
  label.append(turnEl);
  const turnTime = h(doc, 'span', big + (turnSeconds == null ? `;${faint}` : ''), duration(turnSeconds));
  if (turnSeconds != null) turnTime.setAttribute('data-field', 'turn.turns[].duration_s');
  top.append(label, turnTime);

  const bottom = h(doc, 'div', 'display:flex;justify-content:space-between;align-items:baseline;gap:6px;'
    + 'border-top:1px solid var(--aihud-line-2);margin-top:6px;padding-top:6px');
  const sessionEl = h(doc, 'span', `font-weight:700${sessionSeconds == null ? `;${faint}` : ''}`, duration(sessionSeconds));
  if (sessionSeconds != null) sessionEl.setAttribute('data-field', 'session.started_at live.instances[].last_activity');
  bottom.append(h(doc, 'span', 'color:var(--aihud-dim);font-size:11px', 'Session'), sessionEl);
  inner.append(top, bottom);
}

// ── data ─────────────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Turn number and runtime of the last turn; session runtime from session.started_at to live last_activity. */
function values(d) {
  const turns = d.turn && Array.isArray(d.turn.turns) ? d.turn.turns.filter(Boolean) : [];
  const last = turns.length ? turns[turns.length - 1] : null;
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] : null;
  const start = d.session ? Date.parse(d.session.started_at) : NaN;
  const end = inst ? Date.parse(inst.last_activity) : NaN;
  return {
    turn: last && isNum(last.number) ? last.number : null,
    turnSeconds: last && isNum(last.duration_s) ? last.duration_s : null,
    sessionSeconds: Number.isFinite(start) && Number.isFinite(end) && end >= start ? (end - start) / 1000 : null,
  };
}

/** Minutes:seconds, minutes unbounded (the sketch's "161:07"); `–` when unknown. */
function duration(seconds) {
  if (seconds == null) return '–';
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ── drawing ──────────────────────────────────────────────────────────────────

function h(doc, tag, css, text) {
  const n = doc.createElement(tag);
  if (css) n.style.cssText = css;
  if (text != null) n.textContent = text;
  return n;
}

/** The tile box at its exact pixel size; inside, the sketch at 20 px per unit, zoomed to the unit. */
function frame(el, size, pad) {
  const doc = el.ownerDocument;
  const box = h(doc, 'div', `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
    + 'background:var(--aihud-panel);color:var(--aihud-text)');
  const inner = h(doc, 'div', `width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${size.unit / 20};`
    + `box-sizing:border-box;padding:${pad};display:grid;align-content:safe center;`
    + 'font:13px/1.35 var(--aihud-font);font-variant-numeric:tabular-nums');
  box.append(inner);
  el.replaceChildren(box);
  return inner;
}

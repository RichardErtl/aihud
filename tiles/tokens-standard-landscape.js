// Standard · tokens · landscape: two columns — left the session's total tokens, main agent /
// subagents with a split bar; right, behind a line, "by model" one bar per model (the three
// largest), each against the total.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'tokens-standard-landscape',
  contentBlock: 'tokens',
  style: 'standard',
  orientation: 'landscape',
  sizes: [{ cols: 16, rows: 7 }],
  contractVersion: '1.1',
};

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  const doc = el.ownerDocument;
  const inner = frame(el, size, '4px 14px');
  const v = values(data || {});
  const grid = h(doc, 'div', 'display:grid;grid-template-columns:1fr 1fr;height:132px;align-items:center');
  const left = h(doc, 'div');
  left.append(totals(doc, v));
  const right = h(doc, 'div', 'border-left:1px solid var(--aihud-line);padding-left:14px;margin-left:14px');
  right.append(caption(doc, 'by model', '0 0 2px'), ...modelBars(doc, v));
  grid.append(left, right);
  inner.append(grid);
}

// ── data ─────────────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const SERIES = ['--aihud-series-1', '--aihud-series-2', '--aihud-series-3'];

/** Total, main, sub (= total − main) and the three largest models; null where the reader delivered nothing. */
function values(d) {
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] : null;
  const total = inst && isNum(inst.tokens_total) ? inst.tokens_total : null;
  const main = inst && isNum(inst.tokens_main) ? inst.tokens_main : null;
  const sub = total != null && main != null ? Math.max(0, total - main) : null;
  const byModel = inst && inst.tokens_by_model && typeof inst.tokens_by_model === 'object'
    ? Object.entries(inst.tokens_by_model).filter(([, n]) => isNum(n)).sort((a, b) => b[1] - a[1]).slice(0, SERIES.length)
    : null;
  return { total, main, sub, byModel };
}

function tokens(n) {
  if (n == null) return '–';
  if (n >= 999500) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}
const modelName = (id) => id.replace(/^claude-/, '');

// ── drawing ──────────────────────────────────────────────────────────────────

const FAINT = 'color:var(--aihud-faint)';

function caption(doc, text, margin) {
  return h(doc, 'div', `color:var(--aihud-faint);font-size:10px;text-transform:uppercase;letter-spacing:.06em;margin:${margin}`, text);
}

/** The centred block: caption, total, "main / sub", the split bar. */
function totals(doc, { total, main, sub }) {
  const block = h(doc, 'div', 'text-align:center');
  const parts = h(doc, 'div', 'font-size:13px;margin-top:2px');
  const mainEl = h(doc, 'span', `font-weight:600;color:var(${main == null ? '--aihud-faint' : '--aihud-text'})`, tokens(main));
  const subEl = h(doc, 'span', `font-weight:600;color:var(${sub == null ? '--aihud-faint' : '--aihud-dim'})`, tokens(sub));
  if (main != null) mainEl.setAttribute('data-field', 'live.instances[].tokens_main');
  if (sub != null) subEl.setAttribute('data-field', 'live.instances[].tokens_total live.instances[].tokens_main');   // sub = total − main
  parts.append(mainEl, doc.createTextNode(' / '), subEl);
  const split = h(doc, 'div', 'display:flex;height:7px;gap:3px;margin:5px 0 2px');
  if (main != null && sub != null && main + sub > 0) {
    split.append(
      h(doc, 'span', `flex:${main};background:var(--aihud-main);border-radius:var(--aihud-radius-small)`),
      h(doc, 'span', `flex:${sub};background:var(--aihud-sub);border-radius:var(--aihud-radius-small)`),
    );
  } else split.append(h(doc, 'span', 'flex:1;background:var(--aihud-line-2);border-radius:var(--aihud-radius-small)'));
  const totalEl = h(doc, 'div', `font-size:22px;font-weight:650;line-height:1.15${total == null ? `;${FAINT}` : ''}`, tokens(total));
  if (total != null) totalEl.setAttribute('data-field', 'live.instances[].tokens_total');
  block.append(caption(doc, 'tokens', '0 0 2px'), totalEl, parts, split);
  return block;
}

/** One bar per model, width = share of the total; `–` when the reader delivered no split. */
function modelBars(doc, { total, byModel }) {
  if (!byModel || !byModel.length || !(total > 0)) return [h(doc, 'div', `font-size:11.5px;${FAINT}`, '–')];
  return byModel.map(([id, n], i) => {
    const bar = h(doc, 'div', 'margin:4px 0 6px');
    const head = h(doc, 'div', 'display:flex;justify-content:space-between;gap:4px;font-size:11.5px;margin-bottom:2px');
    const nameEl = h(doc, 'span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', modelName(id));
    const tokEl = h(doc, 'span', 'color:var(--aihud-dim)', tokens(n));
    nameEl.setAttribute('data-field', 'live.instances[].tokens_by_model');
    tokEl.setAttribute('data-field', 'live.instances[].tokens_by_model');
    head.append(nameEl, tokEl);
    const track = h(doc, 'div', 'height:7px');
    track.append(h(doc, 'div', `height:100%;width:${Math.min(100, (n / total) * 100).toFixed(1)}%;`
      + `background:var(${SERIES[i]});border-radius:var(--aihud-radius-small)`));
    bar.append(head, track);
    return bar;
  });
}

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

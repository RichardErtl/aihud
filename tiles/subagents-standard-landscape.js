// Standard · subagents · landscape (one column of the band): how many subagents the session started, below one bar per agent
// type (the three largest), each against all subagent tokens.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'subagents-standard-landscape',
  contentBlock: 'subagents',
  style: 'standard',
  orientation: 'landscape',
  sizes: [{ cols: 8, rows: 7 }],
  contractVersion: '1.1',
};

const PAD = '4px 14px';

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const d = data || {};
  const doc = el.ownerDocument;
  const inner = frame(el, size, PAD);
  const count = subagentCount(d);
  const head = h(doc, 'div', 'display:flex;justify-content:space-between;align-items:baseline;gap:6px');
  const absent = count == null && notRecorded(d, 'agents', 'subagents');
  const countEl = h(doc, 'span', `font-size:17px;font-weight:600${count == null ? ';color:var(--aihud-' + (absent ? 'absent' : 'faint') + ')' : ''}`, count == null ? '–' : String(count));
  if (count != null || absent) countEl.setAttribute('data-field', 'agents.subagents_started');
  head.append(h(doc, 'span', 'color:var(--aihud-dim);font-size:11px', 'Subagents'), countEl);
  inner.append(head, ...roleBars(doc, d));
}

// ── data ─────────────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const SHOWN = 3;

/** Read from the reader (agents.subagents_started), never counted here. Null when not delivered. */
function subagentCount(d) {
  const v = d.agents ? d.agents.subagents_started : null;
  return Number.isInteger(v) && v >= 0 ? v : null;
}

function tokens(n) {
  if (n >= 999500) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

// ── drawing ──────────────────────────────────────────────────────────────────

/** Bars per agent type from live tokens_by_agent_type without `main`; `–` without the live type. */
function roleBars(doc, d) {
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] : null;
  const map = inst && inst.tokens_by_agent_type && typeof inst.tokens_by_agent_type === 'object' ? inst.tokens_by_agent_type : null;
  if (!map) return [noRoles(doc, notRecorded(d, 'live', 'tokens'))];
  const roles = Object.entries(map).filter(([k, n]) => k !== 'main' && isNum(n) && n > 0).sort((a, b) => b[1] - a[1]);
  if (!roles.length) return [noRoles(doc, false)];
  const all = roles.reduce((s, [, n]) => s + n, 0);
  return roles.slice(0, SHOWN).map(([name, n]) => {
    const bar = h(doc, 'div', 'margin:4px 0 6px');
    const top = h(doc, 'div', 'display:flex;justify-content:space-between;gap:4px;font-size:11.5px;margin-bottom:2px');
    const nameEl = h(doc, 'span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', name);
    const tokEl = h(doc, 'span', 'color:var(--aihud-dim)', tokens(n));
    nameEl.setAttribute('data-field', 'live.instances[].tokens_by_agent_type');
    tokEl.setAttribute('data-field', 'live.instances[].tokens_by_agent_type');
    top.append(nameEl, tokEl);
    const track = h(doc, 'div', 'height:7px');
    track.append(h(doc, 'div', `height:100%;width:${((n / all) * 100).toFixed(1)}%;background:var(--aihud-role);border-radius:var(--aihud-radius-small)`));
    bar.append(top, track);
    return bar;
  });
}

/** The faint dash for "no role tokens"; the violet marked one when the provider records no tokens at all. */
function noRoles(doc, absent) {
  const e = h(doc, 'div', `font-size:11.5px;color:${absent ? 'var(--aihud-absent)' : 'var(--aihud-faint)'};margin-top:4px`, '–');
  if (absent) e.setAttribute('data-field', 'live.instances[].tokens_by_agent_type');
  return e;
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

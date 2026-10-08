// Standard · skills · portrait: the skills started in this session — name, how often, tokens
// (in + out attributed to the skill); most used first. More than fit: the last row says how many more.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit after the accepted Standard sketch, scaled by zoom = unit / 20.

export const meta = {
  name: 'skills-standard-portrait',
  contentBlock: 'skills',
  style: 'standard',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 4 }],
  contractVersion: '1.1',
};

const PAD = '4px 10px';
const ROWS = 3;   // rows that fit the tile at the sketch's line height

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data")
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const inner = frame(el, size, PAD);
  const list = skills(data || {});
  if (!list.length && notRecorded(data, 'turn', 'skills')) return absentOnly(inner, 'Skills', 'turn.turns[].skills', 1);   // inner is zoomed already
  const rows = h(doc, 'div');
  const faint = 'color:var(--aihud-faint)';
  if (!list.length) rows.append(line(doc, [h(doc, 'span', faint, data && data.turn && Array.isArray(data.turn.turns) ? 'no skill calls this session' : '–')]));
  const shown = list.length > ROWS ? list.slice(0, ROWS - 1) : list;
  for (const s of shown) {
    rows.append(line(doc, [
      mark(h(doc, 'span', 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap', s.name), SKILL_NAME),
      mark(h(doc, 'span', 'text-align:right;color:var(--aihud-dim)', `×${s.count}`), SKILL_STARTS),
      mark(h(doc, 'span', `text-align:right;color:var(${s.tokens == null ? '--aihud-faint' : '--aihud-dim'})`, tokens(s.tokens)), s.tokens == null ? null : SKILL_TOKENS),
    ]));
  }
  if (shown.length < list.length) rows.append(line(doc, [mark(h(doc, 'span', faint, `+${list.length - shown.length} more`), SKILL_NAME)]));
  inner.append(
    h(doc, 'div', 'color:var(--aihud-faint);font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px', 'Skills'),
    rows,
  );
}

// ── data ─────────────────────────────────────────────────────────────────────

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Skills over all turns, grouped by name: `{name, count, tokens}` (tokens null if any start lacks them). */
function skills(d) {
  const turns = d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : [];
  const by = new Map();
  for (const t of turns) {
    for (const s of (t && Array.isArray(t.skills) ? t.skills : [])) {
      if (!s || typeof s.name !== 'string' || !s.name) continue;
      const e = by.get(s.name) || { name: s.name, count: 0, tokens: 0 };
      e.count++;
      e.tokens = e.tokens != null && isNum(s.tokens_in) && isNum(s.tokens_out) ? e.tokens + s.tokens_in + s.tokens_out : null;
      by.set(s.name, e);
    }
  }
  return [...by.values()].sort((a, b) => b.count - a.count || (b.tokens || 0) - (a.tokens || 0) || a.name.localeCompare(b.name));
}

function tokens(n) {
  if (n == null) return '–';
  if (n >= 999500) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

// ── drawing ──────────────────────────────────────────────────────────────────

// value marks (CONTRACT.md "Value marks and the tip"); the count is the number of start entries of that name
const SKILL_NAME = 'turn.turns[].skills[].name';
const SKILL_STARTS = 'turn.turns[].skills';
const SKILL_TOKENS = 'turn.turns[].skills[].tokens_in turn.turns[].skills[].tokens_out';
function mark(node, path) {
  if (path) node.setAttribute('data-field', path);
  return node;
}

function line(doc, cells) {
  const row = h(doc, 'div', 'display:grid;grid-template-columns:1fr 24px 30px;gap:4px;font-size:11.5px;margin:2px 0');
  row.append(...cells);
  return row;
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

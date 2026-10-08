// Column - tokens reduced (landscape): one total, one ratio.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'tokens-column-landscape',
  contentBlock: 'tokens',
  style: 'column',
  orientation: 'landscape',
  sizes: [{ cols: 11, rows: 6 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  draw(el, data, size);
  if (notRecorded(data, 'live', 'tokens')) absentOnly(el.firstElementChild, 'tokens', 'live.instances[].tokens_total', size.unit / 20);
}

function draw(el, data, size) {
  const d = data && typeof data === 'object' ? data : {};
  const U = size.unit;
  const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] : null;
  const total = inst && num(inst.tokens_total) ? inst.tokens_total : null;
  const main = inst && num(inst.tokens_main) ? inst.tokens_main : null;
  const sub = total != null && main != null ? Math.max(0, total - main) : null;
  const p = total && main != null ? Math.min(1, main / total) : null;
  const sm = '<small style="font-size:.34em;font-weight:400;letter-spacing:0;color:var(--aihud-dim);margin-left:.06em">';
  const tok = (n, f) => n >= 999500 ? (n / 1e6).toFixed(1) + (f ? sm + 'M</small>' : 'M') : n >= 1000 ? Math.round(n / 1000) + (f ? sm + 'k</small>' : 'k') : String(Math.round(n));
  const ink = 'background:var(--aihud-main);box-shadow:0 0 var(--aihud-glow) var(--aihud-main)';
  const say = p == null ? 'No tokens<br>counted<br>yet.'
    : p >= 0.95 ? 'Nearly all,<br>the main<br>agent\'s own.'
    : p >= 0.6 ? 'Most of it,<br>the main<br>agent\'s own.'
    : p >= 0.4 ? 'About half,<br>the main<br>agent\'s own.'
    : 'Mostly the<br>subagents\'<br>work.';
  const b = (s, f) => `<span${f ? ` data-field="${f}"` : ''} style="font-style:normal;font-weight:500;color:var(--aihud-text)">${s}</span>`;
  el.innerHTML = `<div style="width:${size.cols * U}px;height:${size.rows * U}px;overflow:hidden;background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)"><div style="position:relative;width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${U / 20};font:10px/1.2 var(--aihud-font);font-variant-numeric:tabular-nums lining-nums">`
    + `<div style="position:absolute;left:10px;right:10px;top:6px;display:flex;justify-content:space-between;font-size:9px;line-height:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:600;color:var(--aihud-dim);white-space:nowrap"><span>Tokens</span><span${p != null ? ' data-field="live.instances[].tokens_total live.instances[].tokens_main"' : ''} style="color:var(--aihud-faint)">${p != null ? Math.round(p * 100) + '% main' : '–'}</span></div>`
    + `<div style="position:absolute;left:7px;top:22px;font-size:60px;line-height:60px;font-weight:200;letter-spacing:-.05em;white-space:nowrap;color:var(${total != null ? '--aihud-text' : '--aihud-faint'})"${total != null ? ' data-field="live.instances[].tokens_total"' : ''}>${total != null ? tok(total, true) : '–'}</div>`
    + `<div style="position:absolute;left:138px;right:8px;top:30px;font-size:11px;line-height:14px;font-style:italic;font-weight:300;color:var(--aihud-main);white-space:nowrap;overflow:hidden">${say}</div>`
    + `<div style="position:absolute;left:10px;width:200px;top:94px;height:1px;background:var(--aihud-line)">${p != null ? `<div style="position:absolute;left:0;top:0;height:1px;width:${(p * 100).toFixed(2)}%;${ink}"></div>` : ''}</div>`
    + `<div style="position:absolute;left:10px;width:200px;top:98px;display:flex;justify-content:space-between;font-size:9.5px;line-height:12px;font-style:italic;font-weight:300;color:var(--aihud-dim);white-space:nowrap">`
    + `<span>${main != null ? b(tok(main), 'live.instances[].tokens_main') + ' main agent' : '–'}</span><span>${sub != null ? 'subagents ' + b(tok(sub), 'live.instances[].tokens_total live.instances[].tokens_main') : '–'}</span></div>`
    + `</div></div>`;
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

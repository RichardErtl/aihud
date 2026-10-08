// Column - active time (portrait): ink only where a turn was running.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'active-time-column-portrait',
  contentBlock: 'active-time',
  style: 'column',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 4 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const d = data && typeof data === 'object' ? data : {};
  const U = size.unit;
  const num = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  const S = d.session && typeof d.session === 'object' ? d.session : {};
  const inst = d.live && Array.isArray(d.live.instances) ? d.live.instances[0] : null;
  const work = num(S.work_ms) ? S.work_ms : null, wait = num(S.wait_ms) ? S.wait_ms : null;
  const sm = '<small style="font-size:.34em;font-weight:400;letter-spacing:0;color:var(--aihud-dim);margin:0 .14em 0 .06em">';
  const fig = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m}${sm}min</small>` : `${Math.floor(m / 60)}${sm}h</small>${String(m % 60).padStart(2, '0')}`; };
  const txt = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
  // the rule: the session from first prompt to last sign of life, inked where a turn worked
  const t0 = Date.parse(S.started_at), t1 = inst ? Date.parse(inst.last_activity) : NaN, span = t1 - t0;
  let segs = [];
  if (Number.isFinite(span) && span > 0)
    for (const t of (d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : [])) {
      const a = t ? Date.parse(t.started_at) : NaN;
      if (!Number.isFinite(a) || !num(t.duration_s)) continue;
      const x = Math.max(0, Math.min(1, (a - t0) / span)), w = Math.max(0, Math.min(1 - x, t.duration_s * 1000 / span));
      segs.push([x, w]);
    }
  const whole = work != null && wait != null ? work + wait : (Number.isFinite(span) && span > 0 ? span : null);
  const share = work != null && whole ? Math.round(work / whole * 100) : null;
  const ink = 'background:var(--aihud-main);box-shadow:0 0 var(--aihud-glow) var(--aihud-main)';
  el.innerHTML = `<div style="width:${size.cols * U}px;height:${size.rows * U}px;overflow:hidden;background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)"><div style="position:relative;width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${U / 20};font:10px/1.2 var(--aihud-font);font-variant-numeric:tabular-nums lining-nums">`
    + `<div style="position:absolute;left:10px;right:10px;top:6px;display:flex;justify-content:space-between;font-size:9px;line-height:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:var(--aihud-dim);white-space:nowrap"><span>Active time</span><span${whole != null ? ' data-field="' + (work != null && wait != null ? 'session.work_ms session.wait_ms' : 'session.started_at live.instances[].last_activity') + '"' : ''} style="color:var(--aihud-faint)">${whole != null ? 'of ' + txt(whole) : '–'}</span></div>`
    + `<div${work != null ? ' data-field="session.work_ms"' : ''} style="position:absolute;left:8px;top:17px;font-size:40px;line-height:40px;font-weight:200;letter-spacing:-.045em;white-space:nowrap;color:var(${work != null ? '--aihud-text' : '--aihud-faint'})">${work != null ? fig(work) : '–'}</div>`
    + `<div${share != null ? ' data-field="session.work_ms session.wait_ms"' : ''} style="position:absolute;right:10px;width:46px;top:22px;text-align:right;font-size:17px;line-height:17px;font-weight:300;letter-spacing:-.02em;white-space:nowrap;color:var(${share != null ? '--aihud-text' : '--aihud-faint'})">${share != null ? share + sm.replace('margin:0 .14em 0 .06em', 'margin-left:.04em') + '%</small>' : '–'}</div>`
    + `<div style="position:absolute;right:10px;width:46px;top:41px;text-align:right;font-size:9.5px;line-height:11px;font-style:italic;font-weight:300;color:var(--aihud-main);white-space:nowrap">at work</div>`
    + `<div style="position:absolute;left:10px;width:140px;top:61px;height:1px;background:var(--aihud-line)">${segs.map(([x, w]) => `<div data-field="turn.turns[].started_at turn.turns[].duration_s" style="position:absolute;top:0;height:1px;left:${(x * 100).toFixed(2)}%;width:${(w * 100).toFixed(2)}%;${ink}"></div>`).join('')}</div>`
    + `<div style="position:absolute;left:10px;width:140px;top:65px;font-size:9.5px;line-height:11px;font-style:italic;font-weight:300;color:var(--aihud-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${wait != null ? `<span data-field="session.wait_ms" style="font-style:normal;font-weight:500;color:var(--aihud-text)">${txt(wait)}</span> waiting on you.` : 'Nothing measured yet.'}</div>`
    + `</div></div>`;
}

// Column - active time (landscape): ink only where a turn was running.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'active-time-column-landscape',
  contentBlock: 'active-time',
  style: 'column',
  orientation: 'landscape',
  sizes: [{ cols: 12, rows: 6 }],
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
  const hhmm = (ms) => { const t = new Date(ms); return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0'); };
  const t0 = Date.parse(S.started_at), t1 = inst ? Date.parse(inst.last_activity) : NaN, span = t1 - t0, okSpan = Number.isFinite(span) && span > 0;
  let segs = [], longest = null;
  for (const t of (d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : [])) {
    if (!t || !num(t.duration_s)) continue;
    if (!longest || t.duration_s > longest.duration_s) longest = t;
    const a = Date.parse(t.started_at);
    if (!okSpan || !Number.isFinite(a)) continue;
    const x = Math.max(0, Math.min(1, (a - t0) / span)), w = Math.max(0, Math.min(1 - x, t.duration_s * 1000 / span));
    segs.push([x, w]);
  }
  const whole = work != null && wait != null ? work + wait : (okSpan ? span : null);
  const share = work != null && whole ? Math.round(work / whole * 100) : null;
  const ink = 'background:var(--aihud-main);box-shadow:0 0 var(--aihud-glow) var(--aihud-main)';
  const b = (s, f) => `<span${f ? ` data-field="${f}"` : ''} style="font-style:normal;font-weight:500;color:var(--aihud-text)">${s}</span>`;
  const say = work == null ? 'No working time<br>measured yet.'
    : `of real work${share != null ? ` — ${b(share + '%', 'session.work_ms session.wait_ms')}` : ''}.${wait != null ? `<br>The other ${b(txt(wait), 'session.wait_ms')},<br>it waited on you.` : ''}`;
  const lg = longest && Number.isInteger(longest.number) ? `longest stretch, turn ${longest.number}: ${b(txt(longest.duration_s * 1000))}` : '';
  el.innerHTML = `<div style="width:${size.cols * U}px;height:${size.rows * U}px;overflow:hidden;background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)"><div style="position:relative;width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${U / 20};font:10px/1.2 var(--aihud-font);font-variant-numeric:tabular-nums lining-nums">`
    + `<div style="position:absolute;left:10px;right:10px;top:6px;display:flex;justify-content:space-between;font-size:9px;line-height:11px;letter-spacing:.2em;text-transform:uppercase;font-weight:600;color:var(--aihud-dim);white-space:nowrap"><span>Active time</span><span${whole != null ? ' data-field="' + (work != null && wait != null ? 'session.work_ms session.wait_ms' : 'session.started_at live.instances[].last_activity') + '"' : ''} style="color:var(--aihud-faint)">${whole != null ? 'session ' + txt(whole) : '–'}</span></div>`
    + `<div${work != null ? ' data-field="session.work_ms"' : ''} style="position:absolute;left:7px;top:22px;font-size:64px;line-height:64px;font-weight:200;letter-spacing:-.05em;white-space:nowrap;color:var(${work != null ? '--aihud-text' : '--aihud-faint'})">${work != null ? fig(work) : '–'}</div>`
    + `<div style="position:absolute;left:134px;right:8px;top:27px;font-size:11px;line-height:14px;font-style:italic;font-weight:300;color:var(--aihud-main);white-space:nowrap;overflow:hidden">${say}</div>`
    + `<div style="position:absolute;left:10px;width:220px;top:94px;height:1px;background:var(--aihud-line)">${segs.map(([x, w]) => `<div data-field="turn.turns[].started_at turn.turns[].duration_s" style="position:absolute;top:0;height:1px;left:${(x * 100).toFixed(2)}%;width:${(w * 100).toFixed(2)}%;${ink}"></div>`).join('')}</div>`
    + `<div style="position:absolute;left:10px;width:220px;top:98px;display:flex;justify-content:space-between;gap:6px;font-size:9.5px;line-height:12px;color:var(--aihud-dim);white-space:nowrap">`
    + `<span${okSpan ? ' data-field="session.started_at"' : ''} style="letter-spacing:.06em">${okSpan ? hhmm(t0) : '–'}</span><span${lg ? ' data-field="turn.turns[].number turn.turns[].duration_s"' : ''} style="font-style:italic;font-weight:300;overflow:hidden;text-overflow:ellipsis">${lg}</span><span${okSpan ? ' data-field="live.instances[].last_activity"' : ''} style="letter-spacing:.06em">${okSpan ? hhmm(t1) : '–'}</span></div>`
    + `</div></div>`;
}

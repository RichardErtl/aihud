// Column - header (portrait): the masthead nameplate.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn at 20 px per unit, scaled by zoom = unit / 20.

export const meta = {
  name: 'header-column-portrait',
  contentBlock: 'header',
  style: 'column',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 2 }],
  contractVersion: '1.1',
};

export function render(el, data, size) {
  const d = data && typeof data === 'object' ? data : {};
  const U = size.unit, doc = el.ownerDocument;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hhmm = (t) => String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  const dayPart = (t) => ((t.getHours() * 60 + t.getMinutes()) / 1440 * 100).toFixed(2) + '%';
  const id = d.session && typeof d.session.id === 'string' && d.session.id ? d.session.id : null;
  let skill = null, at = -Infinity;
  for (const t of (d.turn && Array.isArray(d.turn.turns) ? d.turn.turns : []))
    for (const s of (t && Array.isArray(t.skills) ? t.skills : [])) {
      if (!s || typeof s.name !== 'string' || !s.name) continue;
      const k = Date.parse(s.time);
      if (!(k < at)) { skill = s.name; if (Number.isFinite(k)) at = k; }
    }
  const skA = !skill && notRecorded(d, 'turn', 'skills');
  const hud = d.hud && Array.isArray(d.hud.sessions) ? d.hud : null;
  const now = new Date(), tag = hud ? 'button' : 'div';
  el.innerHTML = `<div style="width:${size.cols * U}px;height:${size.rows * U}px;overflow:hidden;background:var(--aihud-panel);border-radius:var(--aihud-radius);color:var(--aihud-text)"><div style="position:relative;width:${size.cols * 20}px;height:${size.rows * 20}px;zoom:${U / 20};font:10px/1.2 var(--aihud-font);font-variant-numeric:tabular-nums lining-nums">`
    + `<${tag} data-plate${id ? ' data-field="session.id"' : ''}${hud ? ' aria-label="switch session"' : ''} style="position:absolute;left:9px;top:3px;margin:0;padding:0;border:0;background:none;font:inherit;font-size:21px;line-height:21px;font-weight:200;letter-spacing:-.02em;white-space:nowrap;color:var(${id ? '--aihud-text' : '--aihud-faint'})${hud ? ';cursor:pointer' : ''}">${id ? esc(id.slice(0, 8)) : '–'}</${tag}>`
    + `<div style="position:absolute;left:10px;width:140px;top:26px;height:1px;background:var(--aihud-line)"><div data-day style="position:absolute;left:0;top:0;height:1px;width:${id ? dayPart(now) : '0%'};background:var(--aihud-main);box-shadow:0 0 var(--aihud-glow) var(--aihud-main)"></div></div>`
    + `<div style="position:absolute;left:10px;width:104px;top:28px;font-size:9.5px;line-height:11px;font-style:italic;font-weight:300;color:var(--aihud-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">last <span${skill || skA ? ' data-field="turn.turns[].skills[].name"' : ''} style="font-style:normal;font-weight:500;color:var(${skill ? '--aihud-text' : skA ? '--aihud-absent' : '--aihud-faint'})">${skill ? '/' + esc(skill) : '–'}</span></div>`
    + `<div data-clock style="position:absolute;right:10px;top:28px;font-size:9.5px;line-height:11px;letter-spacing:.12em;font-weight:600;color:var(--aihud-dim)">${id ? hhmm(now) : '–'}</div>`
    + `</div></div>`;
  if (el._columnClock) clearInterval(el._columnClock);
  if (id) {
    const c = el.querySelector('[data-clock]'), bar = el.querySelector('[data-day]');
    const t = setInterval(() => { if (!c.isConnected) { clearInterval(t); return; } const n = new Date(); c.textContent = hhmm(n); bar.style.width = dayPart(n); }, 10000);
    el._columnClock = t;
  }
  if (hud) {
    const plate = el.querySelector('[data-plate]'), z = U / 20, list = doc.createElement('div');
    list.setAttribute('popover', 'auto');
    list.style.cssText = `position:fixed;inset:auto;margin:0;padding:${4 * z}px 0;min-width:${150 * z}px;background:var(--aihud-panel);color:var(--aihud-text);border:1px solid var(--aihud-line);border-radius:var(--aihud-radius);font:${10.5 * z}px/1.4 var(--aihud-font);font-variant-numeric:tabular-nums`;
    const row = (sid, label, on) => {
      const b = doc.createElement('button');
      b.style.cssText = `display:block;width:100%;text-align:left;padding:${3 * z}px ${10 * z}px;border:0;background:none;font:inherit;cursor:pointer;color:var(${on ? '--aihud-text' : '--aihud-dim'});font-weight:${on ? 600 : 300}`;
      b.textContent = label;
      b.addEventListener('click', () => { try { list.hidePopover(); } catch (e) { /* closed */ } el.dispatchEvent(new CustomEvent('aihud:select-session', { bubbles: true, detail: { session_id: sid } })); });
      return b;
    };
    list.append(row(null, 'follow the newest', !hud.pinned));
    for (const s of hud.sessions) if (s && typeof s.session_id === 'string') list.append(row(s.session_id, s.session_id.slice(0, 8), s.session_id === hud.current));
    plate.popoverTargetElement = list; plate.popoverTargetAction = 'toggle';
    list.addEventListener('beforetoggle', (ev) => { if (ev.newState === 'open') { const r = plate.getBoundingClientRect(); list.style.left = r.left + 'px'; list.style.top = (r.bottom + 4 * z) + 'px'; } });
    el.append(list);
  }
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

// Bauhaus · header · landscape: triangle + session id + the viewer's clock as a square dial.
// Click on the session id opens a plain list of sessions (data.hud, handed in by the HUD);
// picking one dispatches `aihud:select-session` on the tile element.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).
// Drawn in a 20 px grid inside one svg, scaled to the unit.

export const meta = {
  name: 'header-bauhaus-landscape',
  contentBlock: 'header',
  style: 'bauhaus',
  orientation: 'landscape',
  sizes: [{ cols: 8, rows: 1 }],
  contractVersion: '1.1',
};

const K = (() => {
  const NS = 'http://www.w3.org/2000/svg';

  /** The tile box at its exact pixel size; inside one svg drawn in the 20 px grid, scaled to the unit. */
  function svg(el, size) {
    const doc = el.ownerDocument, W = size.cols * 20, H = size.rows * 20;
    const box = doc.createElement('div');
    box.style.cssText = `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;overflow:hidden;`
      + 'background:var(--aihud-panel);color:var(--aihud-text)';
    const s = doc.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${W} ${H}`);
    s.setAttribute('width', '100%'); s.setAttribute('height', '100%');
    s.style.cssText = 'display:block;font-family:var(--aihud-font);font-variant-numeric:tabular-nums';
    box.append(s); el.replaceChildren(box);
    return { s, W, H, doc };
  }

  function el(parent, tag, attrs, css) {
    const n = parent.ownerDocument.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, String(v));
    if (css) n.style.cssText = css;
    parent.append(n);
    return n;
  }

  /** Text at baseline (x, y). */
  function text(parent, x, y, str, o = {}) {
    let size = o.size || 9.5;
    const t = el(parent, 'text', { x, y, 'font-size': size, 'text-anchor': o.anchor || 'start' },
      `fill:${o.fill || 'var(--aihud-text)'};font-weight:${o.weight || 400}`
      + (o.mono ? ';font-family:var(--aihud-font-mono)' : ''));
    t.textContent = str;
    return t;
  }

  const tri = (cx, cy, w, h, dir) => {   // isosceles triangle, apex in `dir` (up/down/right)
    if (dir === 'down') return `${cx - w / 2},${cy - h / 2} ${cx + w / 2},${cy - h / 2} ${cx},${cy + h / 2}`;
    if (dir === 'right') return `${cx - h / 2},${cy - w / 2} ${cx + h / 2},${cy} ${cx - h / 2},${cy + w / 2}`;
    return `${cx},${cy - h / 2} ${cx + w / 2},${cy + h / 2} ${cx - w / 2},${cy + h / 2}`;
  };
  return { NS, svg, el, text, tri };
})();

const HDR = {
  id(d) { return d.session && typeof d.session.id === 'string' && d.session.id ? d.session.id : null; },
  hud(d) { return d.hud && Array.isArray(d.hud.sessions) ? d.hud : null; },
  ident(s, d, x, cy) {
    const id = HDR.id(d), hud = HDR.hud(d);
    const g = K.el(s, 'g', {}, hud ? 'cursor:pointer' : '');
    K.el(g, 'polygon', { points: K.tri(x + 3, cy, 6, 5.2, hud ? 'down' : 'right') }, `fill:var(${id ? '--aihud-dim' : '--aihud-faint'})`);
    const idT = K.text(g, x + 10, cy + 3.8, id ? id.slice(0, 8) : '–', { size: 11, mono: true, fill: id ? 'var(--aihud-text)' : 'var(--aihud-faint)' });
    if (id) idT.setAttribute('data-field', 'session.id');
    return g;
  },
  clock(s, el, x, y, side) {
    K.el(s, 'rect', { x: x + 0.5, y: y + 0.5, width: side - 1, height: side - 1 }, 'fill:none;stroke:var(--aihud-dim);stroke-width:1');
    const cx = x + side / 2, cy = y + side / 2;
    const hr = K.el(s, 'polygon', { points: `${cx - 1.7},${cy} ${cx + 1.7},${cy} ${cx},${cy - side * 0.32}` }, 'fill:var(--aihud-text)');
    const mn = K.el(s, 'polygon', { points: `${cx - 1.1},${cy} ${cx + 1.1},${cy} ${cx},${cy - side * 0.44}` }, 'fill:var(--aihud-dim)');
    const set = () => {
      const now = new Date(), m = now.getMinutes() + now.getSeconds() / 60, h = (now.getHours() % 12) + m / 60;
      hr.setAttribute('transform', `rotate(${(h * 30).toFixed(1)} ${cx} ${cy})`);
      mn.setAttribute('transform', `rotate(${(m * 6).toFixed(1)} ${cx} ${cy})`);
    };
    set();
    if (el._aihudClock) clearInterval(el._aihudClock);
    const t = setInterval(() => { if (!hr.isConnected) clearInterval(t); else set(); }, 10000);
    el._aihudClock = t;
  },
  /** Session switch on click (data.hud, set by the HUD): a plain list, picking one dispatches the event. */
  switcher(el, hit, hud, zoom) {
    const doc = el.ownerDocument;
    const list = doc.createElement('div');
    list.setAttribute('popover', 'auto'); list.setAttribute('role', 'listbox');
    list.style.cssText = `position:fixed;inset:auto;margin:0;padding:${4 * zoom}px 0;min-width:${160 * zoom}px;`
      + 'background:var(--aihud-panel);color:var(--aihud-text);border:1px solid var(--aihud-line);'
      + `font:${11 * zoom}px/1.4 var(--aihud-font-mono)`;
    const pick = (sid) => {
      try { list.hidePopover(); } catch { /* closed */ }
      el.dispatchEvent(new CustomEvent('aihud:select-session', { bubbles: true, detail: { session_id: sid } }));
    };
    const row = (sid, label, on) => {
      const b = doc.createElement('button');
      b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(on));
      b.style.cssText = `display:block;width:100%;text-align:left;border:0;background:none;font:inherit;cursor:pointer;`
        + `padding:${3 * zoom}px ${10 * zoom}px;color:var(${on ? '--aihud-text' : '--aihud-dim'})`;
      b.textContent = `${on ? '▸ ' : '  '}${label}`;
      b.addEventListener('click', () => pick(sid));
      list.append(b);
    };
    row(null, 'follow newest', !hud.pinned);
    for (const x of hud.sessions) if (x && typeof x.session_id === 'string') row(x.session_id, x.session_id.slice(0, 8), x.session_id === hud.current);
    hit.addEventListener('click', () => {
      if (typeof list.showPopover !== 'function') return;
      const r = hit.getBoundingClientRect();
      list.style.left = `${Math.max(0, r.left)}px`; list.style.top = `${r.bottom + 4 * zoom}px`;
      list.togglePopover();
    });
    el.append(list);
  },
};

export function render(el, data, size) {
    const d = data || {}, { s } = K.svg(el, size);
    HDR.clock(s, el, 10, 3, 14);
    const hit = HDR.ident(s, d, 32, 10);
    const hud = HDR.hud(d);
    if (hud) HDR.switcher(el, hit, hud, size.unit / 20);
}

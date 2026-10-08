// Fancy A · header · portrait (8×2). Session id and the viewer's clock on top, the last skill below.
// A click on the session id opens a plain list of the sessions the HUD knows (`data.hud`); a pick
// dispatches `aihud:select-session` on the tile element. Without `data.hud` the id is plain text.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'header-fancy-a-portrait',
  contentBlock: 'header',
  style: 'fancy-a',
  orientation: 'portrait',
  sizes: [{ cols: 8, rows: 2 }],
  contractVersion: '1.1',
};

const NS = 'http://www.w3.org/2000/svg';
const SVG = new Set(['svg', 'g', 'path', 'circle', 'text', 'tspan']);
/** One element. `text` sets textContent (never innerHTML: names come from the transcript). */
function h(doc, tag, props = {}, ...kids) {
  const n = SVG.has(tag) ? doc.createElementNS(NS, tag) : doc.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null) continue;
    if (k === 'style') n.style.cssText = v;
    else if (k === 'text') n.textContent = String(v);
    else n.setAttribute(k, String(v));
  }
  for (const c of kids.flat(Infinity)) if (c) n.append(c);
  return n;
}
/** What the reader said about the types this tile needs: the not_delivered names and the caveats. */
function why(data, types) {
  const nd = data && Array.isArray(data.not_delivered) ? data.not_delivered : [];
  const out = types.filter((t) => !(data && data[t])).map((t) => {
    const named = nd.filter((n) => String(n).startsWith(`${t}:`));
    return `${t} not delivered${named.length ? `: ${named.join(', ')}` : ''}`;
  });
  if (data && Array.isArray(data.caveats) && data.caveats.length) out.push(`caveats: ${data.caveats.join(', ')}`);
  return out.join('\n') || null;
}

/** The last skill started in the session: its name, `null` when none started, `undefined` without turns. */
function lastSkill(data) {
  const turns = data && data.turn && Array.isArray(data.turn.turns) ? data.turn.turns : null;
  if (!turns) return undefined;
  let last = null;
  for (const t of turns) {
    for (const s of (t && Array.isArray(t.skills) ? t.skills : [])) {
      if (s && s.name && (!last || String(s.time) > String(last.time))) last = s;
    }
  }
  return last ? last.name : null;
}

const pad = (n) => String(n).padStart(2, '0');
const age = (s) => (typeof s !== 'number' || !Number.isFinite(s) ? '–'
  : s < 60 ? `${Math.round(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`);

/**
 * The session id — a button that opens the session list when the HUD delivers `data.hud`
 * (`{sessions: [{session_id, project_slug, age_seconds, title}], current, pinned}`), plain text otherwise.
 */
function sessionId(doc, el, data, z) {
  const id = data && data.session && data.session.id ? String(data.session.id) : null;
  const look = `font-family:var(--aihud-font-mono);color:var(--aihud-${id ? 'dim' : 'faint'});font-size:${11 * z}px;`
    + 'white-space:nowrap;overflow:hidden;min-width:0';
  const text = id ? id.slice(0, 8) : '–';
  const tip = [id, data && data.session && data.session.title].filter(Boolean).join(' · ') || null;
  const hud = data && data.hud && typeof data.hud === 'object' && Array.isArray(data.hud.sessions) ? data.hud : null;
  if (!hud) return h(doc, 'span', { 'data-role': 'sid', title: tip, 'data-field': id ? 'session.id' : null, style: look, text });

  const btn = h(doc, 'button', {
    type: 'button', 'data-role': 'sid', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: tip, 'aria-label': 'switch session', 'data-field': id ? 'session.id' : null,
    style: `${look};background:none;border:0;padding:0;margin:0;cursor:pointer;letter-spacing:inherit;text-align:left`, text,
  });
  let list = null;
  let backdrop = null;
  const close = () => {
    if (list) list.remove();
    list = null;
    btn.setAttribute('aria-expanded', 'false');
    if (backdrop) backdrop.remove();
    backdrop = null;
  };
  const pick = (sessionIdOrNull) => {
    close();
    const Custom = (doc.defaultView && doc.defaultView.CustomEvent) || globalThis.CustomEvent;
    el.dispatchEvent(new Custom('aihud:select-session', { bubbles: true, detail: { session_id: sessionIdOrNull } }));
  };
  const cell = (text, css) => h(doc, 'span', { text, style: css });
  const row = (sid, cells, active) => {
    const r = h(doc, 'button', {
      type: 'button', role: 'option', 'data-session': sid == null ? '' : sid, 'aria-selected': String(active),
      style: 'display:flex;gap:10px;align-items:baseline;width:100%;box-sizing:border-box;background:none;border:0;'
        + `margin:0;padding:${3 * z}px 10px;cursor:pointer;font:inherit;text-align:left;`
        + `color:var(--aihud-${active ? 'text' : 'dim'});font-weight:${active ? 600 : 400}`,
    }, cells);
    r.addEventListener('click', () => pick(sid));
    return r;
  };
  btn.addEventListener('click', () => {
    if (list) { close(); return; }
    const sessions = hud.sessions;
    list = h(doc, 'div', {
      role: 'listbox', 'data-role': 'session-list',
      style: 'position:fixed;z-index:10;box-sizing:border-box;min-width:150px;max-width:calc(100vw - 8px);overflow:auto;'
        + 'background:var(--aihud-panel);color:var(--aihud-text);border:1px solid var(--aihud-line);'
        + `border-radius:var(--aihud-radius);padding:4px 0;font-family:var(--aihud-font);font-size:${11 * z}px;`
        + 'font-variant-numeric:tabular-nums;box-shadow:0 8px 24px color-mix(in srgb, var(--aihud-bg) 70%, transparent)',
    },
    row(null, [cell('follow newest', 'flex:1')], !hud.pinned),
    sessions.map((s) => row(String(s.session_id), [
      cell(String(s.session_id).slice(0, 8), 'font-family:var(--aihud-font-mono)'),
      cell(s.title ? String(s.title) : '', 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--aihud-dim);font-weight:400'),
      cell(age(s.age_seconds), 'color:var(--aihud-dim);font-weight:400'),
    ], s.session_id === hud.current)));
    // a transparent full-window layer behind the list: a click anywhere else closes it; it dies with `el`
    backdrop = h(doc, 'div', { 'data-role': 'session-backdrop', style: 'position:fixed;inset:0;z-index:9' });
    backdrop.addEventListener('click', close);
    el.append(backdrop, list);
    btn.setAttribute('aria-expanded', 'true');
    // placed under the id, kept inside the window
    const b = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
    const win = doc.defaultView;
    if (b && win) {
      const w = list.offsetWidth || 0;
      list.style.left = `${Math.max(4, Math.min(b.left, win.innerWidth - w - 4))}px`;
      list.style.top = `${b.bottom + 4}px`;
      list.style.maxHeight = `${Math.max(60, win.innerHeight - b.bottom - 8)}px`;
    }
  });
  return btn;
}

/**
 * @param {HTMLElement} el  the tile's element; redrawn completely on every call
 * @param {object} data     one session's data sheet (CONTRACT.md "The data"), plus `data.hud` from the HUD
 * @param {{cols: number, rows: number, unit: number}} size
 */
export function render(el, data, size) {
  const doc = el.ownerDocument;
  const z = size.unit / 20;
  const now = new Date();
  const skill = lastSkill(data), skA = !skill && notRecorded(data, 'turn', 'skills');
  const box = h(doc, 'div', {
    title: why(data, ['session', 'turn']),
    style: `width:${size.cols * size.unit}px;height:${size.rows * size.unit}px;box-sizing:border-box;overflow:hidden;`
      + `display:flex;flex-direction:column;justify-content:center;padding:${4 * z}px ${10 * z}px;`
      + 'background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font)',
  },
  h(doc, 'div', { style: `display:flex;justify-content:space-between;gap:${8 * z}px;font-size:${11 * z}px;letter-spacing:.04em` },
    sessionId(doc, el, data, z),
    h(doc, 'span', { 'data-role': 'clock', style: 'color:var(--aihud-dim);font-variant-numeric:tabular-nums', text: `${pad(now.getHours())}:${pad(now.getMinutes())}` })),
  h(doc, 'div', { style: `font-size:${11 * z}px;color:var(--aihud-dim);margin-top:${2 * z}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis` },
    h(doc, 'span', { text: 'last skill ' }),
    h(doc, 'b', { 'data-field': skill || skA ? 'turn.turns[].skills[].name' : null, style: `font-weight:500;color:var(--aihud-${skill ? 'text' : skA ? 'absent' : 'faint'})`, text: skill ? `/${skill}` : '–' })));
  el.replaceChildren(box);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

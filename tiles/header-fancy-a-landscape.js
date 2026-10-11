// Fancy A · header · landscape (10×2). One line: session id, the viewer's clock, the last skill on the right.
// A click on the session id opens a plain list of the sessions the HUD knows (`data.hud`); a pick
// dispatches `aihud:select-session` on the tile element. Without `data.hud` the id is plain text.
// Standalone: no imports, no network, colours only from the design variables (CONTRACT.md).

export const meta = {
  name: 'header-fancy-a-landscape',
  contentBlock: 'header',
  style: 'fancy-a',
  orientation: 'landscape',
  sizes: [{ cols: 10, rows: 2 }],
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
    style: `${look};background:none;border:0;padding:${3 * z}px ${6 * z}px;margin:${-3 * z}px ${-6 * z}px;cursor:pointer;letter-spacing:inherit;text-align:left`, text,
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
  // row = line 1 (id left, last activity right, never cut) + line 2 (label over the full width, cut at the START with
  // "…": the outer span runs rtl so the ellipsis sits left, the inner span isolates the text as ltr; full text in title=)
  const row = (sid, lines, active) => {
    const r = h(doc, 'button', {
      type: 'button', role: 'option', 'data-session': sid == null ? '' : sid, 'aria-selected': String(active),
      style: 'display:block;width:100%;box-sizing:border-box;background:none;border:0;'
        + `margin:0;padding:${3.5 * z}px 10px;cursor:pointer;font:inherit;text-align:left;`
        + `color:var(--aihud-${active ? 'text' : 'dim'});font-weight:${active ? 600 : 400}`,
    }, lines);
    r.addEventListener('click', () => pick(sid));
    return r;
  };
  const twoLines = (s, active) => {
    const label = s.title ? String(s.title) : s.project_slug ? String(s.project_slug) : '';
    return [
      h(doc, 'span', { style: `display:flex;justify-content:space-between;align-items:baseline;gap:${12 * z}px;line-height:${15 * z}px` },
        cell(String(s.session_id).slice(0, 8), `font-family:var(--aihud-font-mono);flex:none;font-weight:${active ? 700 : 400}`),
        cell(age(s.age_seconds), 'flex:none;color:var(--aihud-dim);font-weight:400')),
      h(doc, 'span', { 'data-label': '', title: label, style: `display:block;direction:rtl;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:${10.5 * z}px;line-height:${14 * z}px;color:var(--aihud-dim);font-weight:400` },
        h(doc, 'span', { text: label, style: 'direction:ltr;unicode-bidi:isolate' })),
    ];
  };
  btn.addEventListener('click', () => {
    if (list) { close(); return; }
    const sessions = hud.sessions;
    list = h(doc, 'div', {
      role: 'listbox', 'data-role': 'session-list',
      style: `position:fixed;z-index:10;box-sizing:border-box;width:${280 * z}px;max-width:calc(100vw - ${8 * z}px);overflow:auto;`
        + 'background:var(--aihud-panel);color:var(--aihud-text);border:1px solid var(--aihud-line);'
        + `border-radius:var(--aihud-radius);padding:4px 0;font-family:var(--aihud-font);font-size:${11 * z}px;`
        + 'font-variant-numeric:tabular-nums;box-shadow:0 8px 24px color-mix(in srgb, var(--aihud-bg) 70%, transparent)',
    },
    row(null, [cell('follow newest', 'display:block')], !hud.pinned),
    sessions.map((s) => row(String(s.session_id), twoLines(s, s.session_id === hud.current), s.session_id === hud.current)));
    // a transparent full-window layer behind the list: a click anywhere else closes it; it dies with `el`
    backdrop = h(doc, 'div', { 'data-role': 'session-backdrop', style: 'position:fixed;inset:0;z-index:9' });
    backdrop.addEventListener('click', close);
    el.append(backdrop, list);
    btn.setAttribute('aria-expanded', 'true');
    // placed under the id, kept inside the window
    const b = btn.getBoundingClientRect ? btn.getBoundingClientRect() : null;
    const win = doc.defaultView;
    if (b && win) {
      const vw = win.innerWidth || 0;
      const w = vw ? Math.min(280 * z, vw - 8 * z) : 280 * z;   // never wider than the window
      list.style.width = `${w}px`;
      list.style.left = `${vw ? Math.min(Math.max(b.left, 4 * z), Math.max(4 * z, vw - w - 4 * z)) : Math.max(4, b.left)}px`;
      list.style.top = `${b.bottom + 4 * z}px`;
      list.style.maxHeight = `${Math.max(60, win.innerHeight - b.bottom - 8 * z)}px`;
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
      + `display:flex;align-items:center;gap:${10 * z}px;padding:${4 * z}px ${10 * z}px;font-size:${11 * z}px;letter-spacing:.04em;`
      + 'background:var(--aihud-panel);color:var(--aihud-text);font-family:var(--aihud-font)',
  },
  sessionId(doc, el, data, z),
  h(doc, 'span', { 'data-role': 'clock', style: 'color:var(--aihud-dim);font-variant-numeric:tabular-nums', text: `${pad(now.getHours())}:${pad(now.getMinutes())}` }),
  h(doc, 'span', { style: 'flex:1;min-width:0;text-align:right;color:var(--aihud-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis' },
    h(doc, 'span', { text: 'last ' }),
    h(doc, 'b', { 'data-field': skill || skA ? 'turn.turns[].skills[].name' : null, style: `font-weight:500;color:var(--aihud-${skill ? 'text' : skA ? 'absent' : 'faint'})`, text: skill ? `/${skill}` : '–' })));
  el.replaceChildren(box);
}

// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));

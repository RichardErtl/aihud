// Every header-position tile carries the session switch (CONTRACT.md "Session switch (header tile)").
// 26 tiles = 13 styles x 2 orientations: the 8 header styles and the 5 glance styles. For each: with `data.hud` the tile
// holds a listbox (follow newest + one option per session) and a trigger button outside it; a pick dispatches a
// bubbling `aihud:select-session` on the tile element; without `data.hud` there is no list and no error.
// Data: the reader's own sheets over `reader/fixtures`. DOM: a minimal stand-in (enough for the click path).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const INV = inventory({ root: join(HERE, '..', 'reader', 'fixtures', 'projects'), nowMs: NOW });
const SESSIONS = INV.projects.flatMap((p) => p.sessions);
const SHEET = contractSheet(buildSheet(loadSession(findSession(INV, SESSIONS[0].session_id)), { nowMs: NOW }), { device: 'laptop', state: 'awake' });
const HUD = {
  current: SHEET.session.id,
  pinned: null,
  sessions: SESSIONS.map((s) => ({ session_id: s.session_id, project_slug: s.project_slug, age_seconds: s.age_seconds })),
};

const STYLES = [
  ...['standard', 'minimal', 'fancy-a', 'cellwork', 'column', 'bauhaus', 'splitflap', 'essentials'].map((s) => ['header', s]),
  ...['backlight', 'hairline', 'numeral', 'particle', 'relief'].map((s) => ['glance', s]),
];
const NAMES = STYLES.flatMap(([b, s]) => ['portrait', 'landscape'].map((o) => `${b}-${s}-${o}`));
// Behaviour is probed here for the 14 tiles that gained the switch with this change plus the three styles whose
// own tests do not drive a pick (bauhaus, cellwork, column): 20 tiles. standard/minimal/fancy-a have their own tests.
const NEW = NAMES.filter((n) => /^(header-(splitflap|essentials)|glance-)/.test(n));
const PROBED = NAMES.filter((n) => NEW.includes(n) || /^header-(bauhaus|cellwork|column)/.test(n));

// some tiles start a clock timer; it must not keep the test process alive
const realSetInterval = globalThis.setInterval;
globalThis.setInterval = (...args) => { const t = realSetInterval(...args); if (t && t.unref) t.unref(); return t; };

class Node extends EventTarget {
  constructor(doc, tag) {
    super();
    Object.assign(this, { ownerDocument: doc, tagName: tag, children: [], attributes: {}, dataset: {}, style: { cssText: '' }, own: '' });
  }
  get textContent() { return this.own + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.own = String(v); this.children = []; }
  append(...nodes) { this.children.push(...nodes); }
  appendChild(n) { this.children.push(n); return n; }
  querySelectorAll() { return []; }
  querySelector(sel) { this.stubs ??= {}; return (this.stubs[sel] ??= Object.assign(new Node(this.ownerDocument, 'stub'), { isConnected: true, getBoundingClientRect: () => ({ left: 0, bottom: 0 }) })); }
  replaceChildren(...nodes) { this.own = ''; this.children = [...nodes]; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
}
function makeElement() {
  const doc = {
    createElement: (tag) => new Node(doc, tag),
    createElementNS: (_ns, tag) => new Node(doc, tag),
    createTextNode: (t) => { const n = new Node(doc, '#text'); n.own = String(t); return n; },
  };
  return doc.createElement('div');
}
// the list: role=listbox, or (column, whose rows carry no roles) the popover element
const isList = (n) => !!n.getAttribute && (n.getAttribute('role') === 'listbox' || n.getAttribute('popover') != null);
const walk = (n, out = []) => { out.push(n); for (const c of n.children || []) walk(c, out); return out; };

test('all 26 header-position tiles carry the event: each file dispatches a bubbling aihud:select-session', () => {
  assert.equal(NAMES.length, 26);
  const missing = NAMES.filter((n) => {
    const f = join(HERE, `${n}.js`);
    if (!existsSync(f)) return true;
    const src = readFileSync(f, 'utf8');
    return !(src.includes("'aihud:select-session'") && src.includes('bubbles: true'));
  });
  assert.deepEqual(missing, []);
});

test('20 tiles: list, pick event, no list without data.hud; trigger button for the 14 new ones', async () => {
  assert.equal(NEW.length, 14);
  assert.equal(PROBED.length, 20);
  assert.ok(SESSIONS.length >= 2, 'fixtures give at least two sessions');
  const failures = [];
  for (const name of PROBED) {
    try {
      assert.ok(existsSync(join(HERE, `${name}.js`)), 'file exists');
      const { meta, render } = await import(`./${name}.js`);
      const size = { ...meta.sizes[0], unit: 20 };
      const el = makeElement();
      const events = [];
      el.addEventListener('aihud:select-session', (e) => events.push(e));
      render(el, { ...SHEET, hud: HUD }, size);
      const all = walk(el);
      const list = all.find((n) => n.getAttribute && isList(n));
      assert.ok(list, 'a listbox is drawn');
      const inList = new Set(walk(list));
      if (NEW.includes(name)) assert.ok(all.some((n) => n.tagName === 'button' && !inList.has(n)), 'a trigger button outside the list');
      const opts = list.children.filter((n) => n.tagName === 'button');
      assert.equal(opts.length, 1 + HUD.sessions.length, 'follow newest + one option per session');
      const other = HUD.sessions.find((s) => s.session_id !== HUD.current);
      opts[1 + HUD.sessions.findIndex((s) => s.session_id === other.session_id)].dispatchEvent(new Event('click'));
      opts[0].dispatchEvent(new Event('click'));
      assert.equal(events.length, 2, 'two picks, two events');
      assert.deepEqual(events.map((e) => e.detail.session_id), [other.session_id, null]);
      assert.ok(events.every((e) => e.type === 'aihud:select-session' && e.bubbles));
      for (const hud of [undefined, null, {}, { sessions: 'x' }]) {
        const e2 = makeElement();
        render(e2, { ...SHEET, hud }, size);
        assert.equal(walk(e2).some((n) => n.getAttribute && isList(n)), false, 'no list without data.hud');
      }
    } catch (e) {
      failures.push(`${name}: ${e.message}`);
    }
  }
  assert.deepEqual(failures, []);
});

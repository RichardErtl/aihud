// The window: the pure catalog functions, the page routes, `boot()` as the page calls it, and the
// HUD's click-through, the Settings form and the welcome dialog — against a real node on test ports 4371–4375 and 4416 (one per test: a pooled socket of a closed node is never reused) (temp copy of the reader
// fixtures, temp aihud home), with a minimal DOM stand-in and a small EventSource over node:http.
// Never the real transcript folder, never the real ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TABS, FALLBACK_TAB, START_TAB, START_STEPS, initialTab, GAP, DEFAULTS, ANTIGRAVITY_WINDOW_DEFAULT, WELCOME_NOTE, sessionParam, tabOf, resolvePath, formatValue, catalogRows, filterRows,
  showWelcome, layoutChoices, composerEditUrl, designValue, settingsPatch, boot, AUTOSAVE_MS, landscapeFrameHeight,
} from './window.js';
import { boot as bootHud, sessionOverride, windowHref } from '../hud/hud.js';
import { createNode } from '../node/server.js';
import { ASSUMED_WINDOW_DEFAULT } from '../reader/parser-antigravity.js';
import { DEFAULT_SETTINGS, LAST_TAB_NAMES, catalog } from '../node/store.js';
import { createServer as netServer } from 'node:net';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed 43xx/44xx port, so parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const CONTRACT = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const PORT = await freePort();
const PORT_2 = await freePort();
const PORT_3 = await freePort();
const PORT_4 = await freePort();
const PORT_5 = await freePort();
const PORT_6 = await freePort();
const PORT_7 = await freePort();
const PORT_8 = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function sandbox(port, settings, startDir = 'C:\\dev\\sample-app') {
  const base = mkdtempSync(join(tmpdir(), 'aihud-window-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  if (settings) writeFileSync(join(home, 'settings.json'), JSON.stringify(settings));
  const node = await createNode({ port, projects, home, startDir });
  const url = `http://127.0.0.1:${port}`;
  const sessions = (await (await fetch(`${url}/sessions`)).json());
  return {
    node, url, sessions,
    done: async () => { await node.close(); for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await sleep(100); } } },
  };
}

/** Just enough DOM for window.js, hud.js and the example tile. */
function fakeDocument(rootIds) {
  const doc = { byId: new Map() };
  doc.createElement = (tag) => ({
    tagName: tag.toUpperCase(), ownerDocument: doc, className: '', dataset: {}, style: {}, children: [], _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v); this.children = []; },
    append(...c) { this.children.push(...c); for (const k of c) k.parentNode = this; },
    setAttribute(k, v) { (this.attrs ||= {})[k] = v; },
    replaceChildren(...c) { this._text = ''; this.children = c; for (const k of c) k.parentNode = this; },
    addEventListener(type, fn) { (this.listeners ||= {})[type] = [...((this.listeners || {})[type] || []), fn]; },
    focus() { doc.activeElement = this; },
    dispatchEvent(ev) {
      for (let n = this; n; n = ev.bubbles ? n.parentNode : null) for (const fn of (n.listeners || {})[ev.type] || []) fn(ev);
      return true;
    },
  });
  doc.documentElement = Object.assign(doc.createElement('html'), { clientWidth: 0 });
  for (const id of rootIds) doc.byId.set(id, doc.createElement('main'));
  doc.getElementById = (id) => doc.byId.get(id) || null;
  return doc;
}

/** EventSource over node:http, enough for `addEventListener(type, fn)`. */
class NodeEventSource {
  constructor(url) {
    this.handlers = {};
    this.req = http.get(url, { agent: false }, (res) => {
      res.setEncoding('utf8');
      let buf = '';
      res.on('data', (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          let type = 'message';
          let data = '';
          for (const line of frame.split('\n')) {
            if (line.startsWith('event: ')) type = line.slice(7);
            if (line.startsWith('data: ')) data = line.slice(6);
          }
          for (const fn of this.handlers[type] || []) fn({ type, data });
        }
      });
    });
    this.req.on('error', () => {});
  }
  addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }
  close() { this.req.destroy(); }
}

function fakeWindow({ search = '', hash = '', width = 162, height = 900, ids = ['window'] } = {}) {
  const doc = fakeDocument(ids);
  doc.documentElement.clientWidth = width;
  return {
    document: doc, location: { search, hash }, innerWidth: width, innerHeight: height,
    fetch: (u, o) => fetch(u, o), EventSource: NodeEventSource,
    matchMedia: () => ({ matches: false }), addEventListener: () => {}, requestAnimationFrame: (fn) => setTimeout(fn, 0),
    setInterval: () => 0, clearInterval: () => {},
    opened: [], open(u, name) { this.opened.push({ u, name }); },
  };
}

async function importOverHttp(url) {
  const res = await fetch(url);
  assert.equal(res.status, 200, url);
  return import(`data:text/javascript;base64,${Buffer.from(await res.text()).toString('base64')}`);
}

const settle = async (app) => { await sleep(20); await app.ready(); };
const parts = (win) => {
  const root = win.document.getElementById('window');
  const [tabs, status, ...panes] = root.children;
  // the panes by NAME (their class is `pane <name>`), never by position: the tab order may change
  const pane = Object.fromEntries(panes.map((p) => [String(p.className).split(' ')[1], p]));
  // Layouts and Settings together: one form (one autosave), two tabs
  const form = { children: [pane.layouts, pane.settings] };
  const table = pane.analysis.children[2];
  return { root, tabs, status, panes, pane, form, rows: table.children[1].children };
};
const cells = (tr) => Object.fromEntries(tr.children.map((td) => [td.className, td]));

// ── pure functions ─────────────────────────────────────────────────────────

test('address: ?session= and the tab hash', () => {
  assert.equal(sessionParam('?session=abc'), 'abc');
  assert.equal(sessionParam('?session=%20'), null);
  assert.equal(sessionParam(''), null);
  assert.deepEqual(TABS, ['live', 'layouts', 'settings', 'analysis']);
  assert.deepEqual([...LAST_TAB_NAMES], [...TABS], 'the node accepts exactly the window tabs as last_tab');
  assert.equal(tabOf('#analysis'), 'analysis');
  assert.equal(tabOf('#layouts'), 'layouts');
  assert.equal(tabOf('#nonsense'), 'live');
  assert.equal(tabOf(''), 'live');
  assert.equal(FALLBACK_TAB, 'live');
});

test('initialTab: hash > last_tab > live; a vanished name falls back to live by NAME, never to the first tab', () => {
  assert.equal(initialTab('#settings', { last_tab: 'analysis' }), 'settings', 'the hash wins');
  assert.equal(initialTab('', { last_tab: 'analysis' }), 'analysis', 'no hash: the memory');
  assert.equal(initialTab('#nonsense', { last_tab: 'layouts' }), 'layouts', 'a hash that is no tab does not count');
  assert.equal(initialTab('', {}), 'live');
  assert.equal(initialTab('', null), 'live');
  assert.equal(initialTab(undefined, undefined), 'live');
  assert.equal(initialTab('', { last_tab: 'gone' }), 'live', 'a vanished remembered tab');
  assert.equal(initialTab('#gone', { last_tab: 'gone' }), 'live', 'both vanished');
  assert.equal(initialTab('', { last_tab: 42 }), 'live', 'not a string');
  // a tab list with Start in front: while the intro is due Start wins over the memory, a valid hash wins over Start;
  // the fallback stays Live (by name), not tabs[0]
  const withStart = [START_TAB, ...TABS];
  assert.equal(START_TAB, 'start');
  assert.ok(!TABS.includes(START_TAB) && ![...LAST_TAB_NAMES].includes(START_TAB), 'Start is no storable tab');
  assert.equal(initialTab('', { last_tab: 'settings' }, withStart), 'start', 'intro due (no marker): Start beats last_tab');
  assert.equal(initialTab('', { welcome_seen: false, last_tab: 'settings' }, withStart), 'start');
  assert.equal(initialTab('', null, withStart), 'start', 'fresh install');
  assert.equal(initialTab('#analysis', { last_tab: 'settings' }, withStart), 'analysis', 'a valid hash beats Start');
  assert.equal(initialTab('', { welcome_seen: true, last_tab: 'settings' }, withStart), 'settings', 'intro done: the memory');
  assert.equal(initialTab('', { welcome_seen: true, last_tab: 'gone' }, withStart), 'live', 'vanished: live by name');
  assert.equal(initialTab('', { welcome_seen: true, last_tab: 'start' }, withStart), 'live', 'a hand-stored last_tab "start" is ignored');
  assert.equal(initialTab('', { welcome_seen: false, last_tab: 'start' }, ['live', 'settings']), 'live', 'Start not listed: the remembered tab left the list');
  assert.equal(initialTab('#start', {}, TABS), 'live', 'Start not listed (intro done): the hash does not open it');
  assert.equal(tabOf('#start'), 'live');
  assert.equal(tabOf('#start', withStart), 'start');
});

test('address: the window href and the session override', () => {
  assert.equal(windowHref('a b'), '/window?session=a%20b');
  assert.equal(windowHref(null), '/window');
  assert.equal(sessionOverride('?layout=x&session=s1'), 's1');
});

test('resolvePath: plain paths, lists take the first element with a value, <key> walks keys, a gap stays undefined', () => {
  const sheet = {
    version: '1', session: { git: { dirty: null } },
    live: { instances: [{ tokens_total: 42 }] },
    turn: { turns: [{ tool_stats: [] }, { tool_stats: [{ tool: 'Read' }, { tool: 'Edit' }] }] },
    windows: { 'claude-code': { 'model-a': 200000 } },
  };
  assert.deepEqual(resolvePath(sheet, 'version'), { value: '1', at: null });
  assert.deepEqual(resolvePath(sheet, 'session.git.dirty'), { value: null, at: null }, 'null is a delivered value, not a gap');
  assert.deepEqual(resolvePath(sheet, 'live.instances[].tokens_total'), { value: 42, at: 'live.instances[0 of 1].tokens_total' });
  assert.deepEqual(resolvePath(sheet, 'turn.turns[].tool_stats[].tool'), { value: 'Read', at: 'turn.turns[1 of 2].tool_stats[0 of 2].tool' });
  assert.deepEqual(resolvePath(sheet, 'windows.<key>.<key>'), { value: 200000, at: 'windows.claude-code.model-a' });
  assert.equal(resolvePath(sheet, 'session.note').value, undefined);
  assert.equal(resolvePath(sheet, 'agents.nodes[].id').value, undefined);
  assert.equal(resolvePath(sheet, 'version.x').value, undefined, 'a path through a string is a gap');
  assert.equal(formatValue(undefined), GAP);
  assert.equal(formatValue(null), 'null');
  assert.equal(formatValue([{ a: 1 }, { a: 2 }]), 'n=2');
  assert.equal(formatValue(['x', 'y']), '["x","y"]');
  assert.equal(formatValue('z'.repeat(400)).length, 161);
});

test('catalogRows: one row per contract field, in contract order; filter by path or meaning', () => {
  const rows = catalogRows(CONTRACT.fields, {});
  assert.ok(CONTRACT.fields.length >= 1);
  assert.equal(rows.length, CONTRACT.fields.length);
  assert.deepEqual(rows.map((r) => r.path), CONTRACT.fields.map((f) => f.path));
  assert.ok(rows.every((r) => r.missing && r.value === GAP), 'an empty sheet is all gaps');
  const hits = filterRows(rows, 'TOKENS_TOTAL');
  assert.ok(hits.length >= 1 && hits.every((r) => /tokens_total/i.test(`${r.path} ${r.meaning}`)));
  assert.equal(filterRows(rows, '  ').length, rows.length);
});

// ── the node serves the page ───────────────────────────────────────────────

test('routes: /window, its two files and /contract.json are served; the endpoint list names them', async () => {
  const s = await sandbox(PORT);
  try {
    const page = await fetch(`${s.url}/window`);
    assert.equal(page.status, 200);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.match(await page.text(), /<main id="window">/);
    assert.match((await fetch(`${s.url}/window/window.js`)).headers.get('content-type'), /^text\/javascript/);
    assert.match((await fetch(`${s.url}/window/window.css`)).headers.get('content-type'), /^text\/css/);
    assert.deepEqual(await (await fetch(`${s.url}/contract.json`)).json(), CONTRACT);
    assert.equal((await fetch(`${s.url}/window/other.js`)).status, 404, 'a fixed list, nothing else under /window/');
    const { endpoints } = await (await fetch(`${s.url}/`)).json();
    assert.ok(endpoints.includes('GET /window') && endpoints.includes('GET /contract.json'));
  } finally { await s.done(); }
});

// ── boot() against a real node ─────────────────────────────────────────────

test('Analysis: the catalog has exactly as many rows as contract.json has fields, with the live values of the default session', async () => {
  const s = await sandbox(PORT_2);
  const win = fakeWindow({ hash: '#analysis' });
  let app = { close() {} };
  try {
    app = boot(win, { base: s.url });
    await settle(app);
    const { root, status, rows, pane } = parts(win);
    assert.equal(status.textContent, '', `status line: ${status.textContent}`);
    assert.equal(root.dataset.tab, 'analysis');
    assert.deepEqual(Object.fromEntries(Object.entries(pane).map(([n, p]) => [n, p.hidden])), { live: true, layouts: true, settings: true, analysis: false, start: true });
    assert.ok(CONTRACT.fields.length >= 1, 'the contract has fields at all');
    assert.equal(rows.length, CONTRACT.fields.length, 'one table row per contract field');
    assert.equal(root.dataset.rows, String(CONTRACT.fields.length));
    assert.deepEqual(rows.map((tr) => tr.dataset.path), CONTRACT.fields.map((f) => f.path));
    // the default session is the HUD's default: the node's `current`
    assert.ok(s.sessions.current, 'the fixture folder has a current session');
    assert.equal(app.state.current, s.sessions.current);
    const idRow = rows.find((tr) => tr.dataset.path === 'session.id');
    assert.equal(cells(idRow).value.textContent, s.sessions.current, 'a live value of that session');
    const estimated = rows.filter((tr) => CONTRACT.fields.find((f) => f.path === tr.dataset.path).source === 'estimated');
    assert.ok(estimated.length >= 1);
    assert.ok(estimated.every((tr) => tr.className.split(' ').includes('estimated') && cells(tr).source.textContent === 'estimated *'), 'estimated rows are marked');
    assert.equal(rows.filter((tr) => tr.className.split(' ').includes('estimated')).length, estimated.length, 'only those');
  } finally { app.close(); await s.done(); }
});

test('Analysis: a field without a live value shows the gap —, a delivered one never does', async () => {
  const s = await sandbox(PORT_3);
  const win = fakeWindow({ hash: '#analysis' });
  let app = { close() {} };
  try {
    app = boot(win, { base: s.url });
    await settle(app);
    const { root, rows } = parts(win);
    const sheet = app.state.sheet;
    const gaps = rows.filter((tr) => resolvePath(sheet, tr.dataset.path).value === undefined);
    const filled = rows.filter((tr) => resolvePath(sheet, tr.dataset.path).value !== undefined);
    assert.ok(gaps.length >= 1, 'the fixture session leaves at least one field undelivered');
    assert.ok(filled.length >= 1, 'and delivers at least one');
    assert.ok(gaps.every((tr) => cells(tr).value.textContent === GAP && tr.className.split(' ').includes('missing')));
    assert.ok(filled.every((tr) => cells(tr).value.textContent !== GAP && !tr.className.split(' ').includes('missing')));
    assert.equal(root.dataset.gaps, String(gaps.length));
    const search = parts(win).pane.analysis.children[1];
    search.value = 'session.id';
    search.dispatchEvent({ type: 'input' });
    assert.ok(Number(root.dataset.shown) >= 1 && Number(root.dataset.shown) < rows.length, `filter: ${root.dataset.shown} of ${root.dataset.rows}`);
  } finally { app.close(); await s.done(); }
});

test('/window?session=<id> picks that session (not the default one); Live frames the HUD on it, Settings links the composer', async () => {
  const s = await sandbox(PORT_4, { welcome_seen: true });
  let app = { close() {} };
  try {
    const other = s.sessions.sessions.map((e) => e.session_id).find((id) => id !== s.sessions.current);
    assert.ok(other, 'the fixtures hold a second session');
    const win = fakeWindow({ search: `?session=${encodeURIComponent(other)}` });
    app = boot(win, { base: s.url });
    await settle(app);
    const { root, rows, pane, status } = parts(win);
    assert.equal(status.textContent, '', `status line: ${status.textContent}`);
    assert.equal(root.dataset.tab, 'live');
    assert.equal(app.state.current, other);
    assert.equal(app.state.sheet.session.id, other);
    assert.equal(cells(rows.find((tr) => tr.dataset.path === 'session.id')).value.textContent, other);
    const frame = findAll(pane.live, (c) => c.tagName === 'IFRAME')[0];
    assert.equal(frame.tagName, 'IFRAME');
    assert.equal(frame.src, `/hud?layout=essentials-landscape&session=${encodeURIComponent(other)}`);
    assert.equal(findAll(pane.layouts, (c) => /(^| )composer-link( |$)/.test(c.className || ''))[0].href, '/composer');
    // an unknown id is said out loud, the table stays all gaps
    const win2 = fakeWindow({ search: '?session=no-such-session', hash: '#analysis' });
    const app2 = boot(win2, { base: s.url });
    await settle(app2);
    app2.close();
    assert.match(parts(win2).status.textContent, /^session no-such-session: .*404 · Live shows the HUD default session$/);
    assert.equal(findAll(parts(win2).pane.live, (c) => c.tagName === 'IFRAME')[0].src, '/hud?layout=essentials-landscape', 'an unloaded session never reaches the Live HUD');
    assert.equal(parts(win2).root.dataset.gaps, String(CONTRACT.fields.length));
  } finally { app.close(); await s.done(); }
});

test('HUD click-through: a click on a tile opens /window with the HUD session; ?session= pins the HUD; a control click and a framed HUD open nothing', async () => {
  const s = await sandbox(PORT_5, { layout_portrait: 'probe-portrait', layout_landscape: 'probe-landscape' });
  let hud = { close() {} };
  let hud2 = { close() {} };
  try {
    const win = fakeWindow({ ids: ['hud'] });
    hud = bootHud(win, { base: s.url, importModule: importOverHttp });
    await settle(hud);
    const grid = win.document.getElementById('hud').children[0];
    assert.ok(grid.children.length >= 1, 'the HUD drew tiles');
    assert.ok((grid.listeners.click || []).length >= 1, 'the HUD listens for clicks');
    assert.equal(hud.state.current, s.sessions.current);
    grid.children[0].dispatchEvent({ type: 'click', bubbles: true, target: grid.children[0] });
    assert.deepEqual(win.opened, [{ u: windowHref(s.sessions.current), name: 'aihud-window' }]);
    assert.equal(win.opened[0].u, `/window?session=${encodeURIComponent(s.sessions.current)}`);
    // a tile's own control keeps its click
    const button = { closest: (sel) => (sel.includes('button') ? button : null) };
    grid.children[0].dispatchEvent({ type: 'click', bubbles: true, target: button });
    assert.equal(win.opened.length, 1, 'still the one open from above');
    // a HUD framed inside another page (the window's Live tab) opens nothing
    win.top = {};
    grid.children[0].dispatchEvent({ type: 'click', bubbles: true, target: grid.children[0] });
    assert.equal(win.opened.length, 1, 'framed: no second open');
    delete win.top;

    const other = s.sessions.sessions.map((e) => e.session_id).find((id) => id !== s.sessions.current);
    assert.ok(other);
    const win2 = fakeWindow({ ids: ['hud'], search: `?session=${encodeURIComponent(other)}` });
    hud2 = bootHud(win2, { base: s.url, importModule: importOverHttp });
    await settle(hud2);
    assert.equal(hud2.state.current, other);
    assert.equal(hud2.state.pinned, true);
    const grid2 = win2.document.getElementById('hud').children[0];
    grid2.children[0].dispatchEvent({ type: 'click', bubbles: true, target: grid2.children[0] });
    assert.deepEqual(win2.opened.map((o) => o.u), [`/window?session=${encodeURIComponent(other)}`]);
  } finally { hud.close(); hud2.close(); await s.done(); }
});

// ── Settings + welcome (A5.4 / A5.5) ───────────────────────────────────────

test('composerEditUrl: a layout card opens the composer on that layout, the name encoded', () => {
  assert.equal(composerEditUrl('standard-portrait'), '/composer?layout=standard-portrait');
  assert.equal(composerEditUrl('my layout&x=1'), '/composer?layout=my%20layout%26x%3D1');
  assert.equal(new URLSearchParams(composerEditUrl('a/b?c#d').split('?').slice(1).join('?')).get('layout'), 'a/b?c#d', 'the composer reads back the exact name');
});

test('Settings, pure: defaults match the node, layout choices own first then shipped in style order, the patch carries only changes, the welcome until its marker', () => {
  assert.deepEqual(DEFAULTS, DEFAULT_SETTINGS, 'window.js DEFAULTS = node/store.js DEFAULT_SETTINGS');
  const entries = [
    { kind: 'layout', name: 'zeta-landscape', own: false, loadable: true, meta: { orientation: 'landscape' } },
    { kind: 'layout', name: 'mine-b', own: true, loadable: true, meta: { orientation: 'landscape' } },
    { kind: 'layout', name: 'mine-a', own: true, loadable: true, meta: { orientation: 'landscape' } },
    { kind: 'layout', name: 'alpha-landscape', own: false, loadable: true, meta: { orientation: 'landscape' } },
    { kind: 'layout', name: 'tall', own: true, loadable: true, meta: { orientation: 'portrait' } },
    { kind: 'layout', name: 'broken', own: true, loadable: false },
    { kind: 'tile', name: 'gauge', own: false, loadable: true, meta: {} },
  ];
  assert.deepEqual(layoutChoices(entries, 'landscape').map((c) => `${c.name}${c.own ? '*' : ''}`), ['mine-a*', 'mine-b*', 'alpha-landscape', 'zeta-landscape']);
  assert.deepEqual(layoutChoices(entries, 'portrait').map((c) => c.name), ['tall']);
  const loaded = { ...DEFAULTS };
  const unchanged = { layout_portrait: 'essentials-portrait', layout_landscape: 'essentials-landscape', landscape_ratio: 1, unit_max: 22.5, port: 4747, projects: '', theme: 'system', design_variables: { dark: {}, light: {} } };
  assert.deepEqual(settingsPatch(loaded, unchanged), {}, 'nothing changed → nothing sent');
  assert.deepEqual(settingsPatch(loaded, { ...unchanged, unit_max: 20, design_variables: { dark: { '--aihud-bg': '#000000' }, light: {} } }),
    { unit_max: 20, design_variables: { dark: { '--aihud-bg': '#000000' }, light: {} } });
  assert.deepEqual(settingsPatch({ ...loaded, projects: '/x' }, unchanged), { projects: null }, 'an emptied folder removes the key');
  assert.deepEqual(settingsPatch({ ...loaded, design_variables: { light: {}, dark: { '--aihud-bg': '#000000' } } },
    { ...unchanged, design_variables: { dark: { '--aihud-bg': '#000000' }, light: {} } }), {}, 'key order does not count as a change');
  // Antigravity window: the shipped default untouched sends nothing; a number writes `windows`; empty deletes it
  const ag = (before, v) => settingsPatch(before, { ...unchanged, antigravity_window: v });
  assert.equal(ANTIGRAVITY_WINDOW_DEFAULT, ASSUMED_WINDOW_DEFAULT, 'window.js default = the reader default');
  assert.deepEqual(ag(loaded, ANTIGRAVITY_WINDOW_DEFAULT), {});
  assert.deepEqual(ag(loaded, null), {});
  assert.deepEqual(ag(loaded, 200000), { windows: { antigravity: { default: 200000 } } });
  assert.deepEqual(ag({ ...loaded, windows: { antigravity: { default: 200000 } } }, null), { windows: null }, 'emptied = back to the shipped default');
  assert.deepEqual(ag({ ...loaded, windows: { antigravity: { default: 200000 } } }, 200000), {});
  const bg = CONTRACT.designVariables.find((v) => v.name === '--aihud-bg');
  assert.equal(designValue({}, bg, 'dark'), bg.dark);
  assert.equal(designValue({ design_variables: { dark: { '--aihud-bg': '#000000' } } }, bg, 'dark'), '#000000');
  assert.equal(designValue({ design_variables: { dark: { '--aihud-bg': '#000000' } } }, bg, 'light'), bg.light);
  assert.equal(showWelcome({}), true);
  assert.equal(showWelcome({ welcome_seen: false }), true);
  assert.equal(showWelcome({ welcome_seen: true }), false);
  assert.equal(WELCOME_NOTE.join(''), 'Claude Code deletes sessions after 30 days (cleanupPeriodDays) — raise it if you want history.');
});

/** Depth-first: every element under `node` that `pred` accepts. */
const findAll = (node, pred, out = []) => { for (const c of node.children || []) { if (pred(c)) out.push(c); findAll(c, pred, out); } return out; };

test('Settings + welcome, boot against a real node: the welcome shows once and sets its marker; the form saves only changes through POST /settings into settings.json', async () => {
  const s = await sandbox(PORT_6, { welcome_seen: true });   // the intro is done: no Start tab (the Start tab has its own test below)
  const withBody = (opts) => { const w = fakeWindow(opts); w.document.body = w.document.createElement('body'); return w; };
  const apps = [];
  try {
    const file = join(s.node.home, 'settings.json');
    // the pane drew (trip-wire), no Start tab, no dialog anywhere
    const win2 = withBody({ hash: '#settings' });
    const app2 = boot(win2, { base: s.url });
    apps.push(app2);
    await settle(app2);
    assert.equal(win2.document.getElementById('window').dataset.settings, 'ready', 'the open did draw');
    assert.equal(win2.document.body.children.length, 0, 'no welcome dialog any more');
    assert.equal(app2.state.welcome, null);
    assert.equal(app2.state.startOn, false);
    assert.deepEqual(findAll(parts(win2).tabs, (c) => c.tagName === 'BUTTON').map((b) => b.textContent), ['Live', 'Layouts', 'Settings', 'Analysis'], 'intro done: no Start tab');
    // the form: the composer entry in the Layouts head; edit three fields — one autosave carries them
    const pane = parts(win2).form;
    assert.equal(findAll(pane, (c) => /(^| )composer-link( |$)/.test(c.className || ''))[0].href, '/composer');
    const byName = (n) => findAll(pane, (c) => c.name === n)[0];
    assert.ok(byName('layout_portrait') && byName('layout_landscape') && byName('unit_max') && byName('port') && byName('projects') && byName('theme'));
    assert.deepEqual(findAll(pane, (c) => c.name === 'layout_landscape').map((o) => o.value).slice(0, 1), ['essentials-landscape'], 'shipped layouts in style order');
    const colourInputs = findAll(pane, (c) => c.dataset && c.dataset.var);
    assert.equal(colourInputs.length, CONTRACT.designVariables.length * 2, 'one field per design variable and theme');
    const change = (c) => c.dispatchEvent({ type: 'change', bubbles: true, target: c });
    const minimal = findAll(pane, (c) => c.name === 'layout_landscape' && c.value === 'minimal-landscape')[0];
    minimal.checked = true;
    change(minimal);
    byName('landscape_ratio').value = '1.5';
    change(byName('landscape_ratio'));
    const roleLight = colourInputs.find((i) => i.dataset.var === '--aihud-role-1' && i.dataset.theme === 'light');
    roleLight.value = '#010203';
    change(roleLight);
    await settle(app2);
    const stamp = () => findAll(win2.document.getElementById('window'), (c) => /(^| )settings-status( |$)/.test(c.className || ''))[0].textContent;
    assert.match(stamp(), /^saved \d\d:\d\d:\d\d$/);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), {
      welcome_seen: true, layout_landscape: 'minimal-landscape', landscape_ratio: 1.5,
      design_variables: { dark: {}, light: { '--aihud-role-1': '#010203' } },
    });
    assert.equal(findAll(parts(win2).pane.live, (c) => c.tagName === 'IFRAME')[0].src, `/hud?layout=minimal-landscape&session=${encodeURIComponent(s.sessions.current)}`, 'Live follows the saved layout');
    // the Antigravity window field: prefilled with the shipped default, a number autosaves into `windows`, empty deletes it
    assert.equal(byName('antigravity_window').value, String(ANTIGRAVITY_WINDOW_DEFAULT), 'prefilled with the shipped default');
    byName('antigravity_window').value = '200000';
    change(byName('antigravity_window'));
    await settle(app2);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).windows, { antigravity: { default: 200000 } });
    byName('antigravity_window').value = '';
    change(byName('antigravity_window'));
    await settle(app2);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).windows, undefined, 'emptied = key gone, shipped default applies');
    byName('antigravity_window').value = '12';
    change(byName('antigravity_window'));
    await settle(app2);
    assert.match(stamp(), /settings_invalid:windows:/);
    byName('antigravity_window').value = String(ANTIGRAVITY_WINDOW_DEFAULT);
    change(byName('antigravity_window'));
    await settle(app2);
    // a refused value is said with the node's reason, nothing written
    byName('unit_max').value = '99';
    change(byName('unit_max'));
    await settle(app2);
    assert.equal(stamp(), '/settings → 400 settings_invalid:unit_max:out_of_bounds_15_to_45');
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).unit_max, undefined);
    assert.equal(app2.state.counts.saves, 5, 'three quick changes, one post; three Antigravity-window posts (set, clear, refused); then the refused unit');
  } finally { for (const a of apps) a.close(); await s.done(); }
});

// ── the skin (design round 01.10) ─────────────────

test('Settings layout choice (Q1/Q5): own layouts newest saved first, shipped in style order essentials · standard · minimal · fancy-a · fancy-b, the probe pair hidden — kept only while it is the chosen one', async () => {
  const entries = [
    { kind: 'layout', name: 'probe-landscape', own: false, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 9 },
    { kind: 'layout', name: 'old-desk', own: true, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 1000 },
    { kind: 'layout', name: 'fancy-b-landscape', own: false, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 5 },
    { kind: 'layout', name: 'new-desk', own: true, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 3000 },
    { kind: 'layout', name: 'fancy-a-landscape', own: false, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 5 },
    { kind: 'layout', name: 'minimal-landscape', own: false, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 5 },
    { kind: 'layout', name: 'mid-desk', own: true, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 2000 },
    { kind: 'layout', name: 'standard-landscape', own: false, loadable: true, meta: { orientation: 'landscape' }, mtime_ms: 5 },
  ];
  assert.deepEqual(layoutChoices(entries, 'landscape').map((c) => `${c.name}${c.own ? '*' : ''}`),
    ['new-desk*', 'mid-desk*', 'old-desk*', 'standard-landscape', 'minimal-landscape', 'fancy-a-landscape', 'fancy-b-landscape']);
  assert.ok(entries.some((e) => e.name === 'probe-landscape'), 'trip-wire: the probe layout was offered to the choice');
  assert.equal(layoutChoices(entries, 'landscape', 'probe-landscape').at(-1).name, 'probe-landscape', 'the chosen probe layout stays visible, by name');
  // the real shipped catalog: the probe pair is in the catalog, never in the choice
  const base = mkdtempSync(join(tmpdir(), 'aihud-window-choice-'));
  try {
    const all = await catalog(base);
    for (const o of ['portrait', 'landscape']) {
      assert.ok(all.some((e) => e.kind === 'layout' && e.name === `probe-${o}`), `trip-wire: probe-${o} is shipped`);
      const names = layoutChoices(all, o).map((c) => c.name);
      assert.deepEqual(names, ['essentials', 'standard', 'minimal', 'fancy-a', 'fancy-b'].map((st) => `${st}-${o}`), `${o}: ${names}`);
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('Settings autosave (J4): every change posts only that key through POST /settings after a short pause — no Save button; the head says "saved hh:mm:ss"; a refused value says the node reason and writes nothing', async () => {
  const s = await sandbox(PORT_7, { welcome_seen: true });
  let app = { close() {} };
  try {
    const file = join(s.node.home, 'settings.json');
    const win = fakeWindow({ hash: '#settings' });
    win.document.body = win.document.createElement('body');
    app = boot(win, { base: s.url });
    await settle(app);
    const root = win.document.getElementById('window');
    assert.equal(root.dataset.settings, 'ready', 'trip-wire: the settings drew');
    const pane = parts(win).form;
    const named = (n, v) => findAll(pane, (c) => c.name === n && (v === undefined || c.value === v))[0];
    const change = (c) => c.dispatchEvent({ type: 'change', bubbles: true, target: c });
    const disk = () => JSON.parse(readFileSync(file, 'utf8'));
    // 1. one number field: written on its own, no click anywhere
    named('landscape_ratio').value = '1.5';
    change(named('landscape_ratio'));
    await settle(app);
    assert.deepEqual(disk(), { welcome_seen: true, landscape_ratio: 1.5 }, 'the change alone reached settings.json');
    assert.equal(findAll(root, (c) => /(^| )save( |$)/.test(c.className || '')).length, 0, 'no Save button');
    const stamp = findAll(root, (c) => /(^| )settings-status( |$)/.test(c.className || ''))[0];
    assert.match(stamp.textContent, /^saved \d\d:\d\d:\d\d$/);
    // 2. a layout card (a radio of its row) and one colour: each posts only itself
    const card = named('layout_landscape', 'minimal-landscape');
    assert.ok(card, 'the landscape row offers minimal-landscape');
    card.checked = true;
    change(card);
    await settle(app);
    const colour = findAll(pane, (c) => c.dataset && c.dataset.var === '--aihud-role-1' && c.dataset.theme === 'light')[0];
    colour.value = '#010203';
    change(colour);
    await settle(app);
    assert.deepEqual(disk(), {
      welcome_seen: true, landscape_ratio: 1.5, layout_landscape: 'minimal-landscape',
      design_variables: { dark: {}, light: { '--aihud-role-1': '#010203' } },
    });
    assert.equal(app.state.counts.saves, 3, 'one post per change');
    // typed fields save on change only: a pause mid-typing posts nothing, the change posts once
    const port = named('port');
    port.value = '4';
    port.dispatchEvent({ type: 'input', bubbles: true, target: port });
    await sleep(AUTOSAVE_MS + 200);
    await settle(app);
    assert.equal(app.state.counts.saves, 3, 'typing into port posts nothing');
    assert.equal(disk().port, undefined, 'no half port on disk');
    port.value = '4748';
    change(port);
    await settle(app);
    assert.equal(app.state.counts.saves, 4, 'the change event posts once');
    assert.equal(disk().port, 4748);
    // 3. refused: the node's reason in the head, nothing written
    named('unit_max').value = '99';
    change(named('unit_max'));
    await settle(app);
    assert.equal(stamp.textContent, '/settings → 400 settings_invalid:unit_max:out_of_bounds_15_to_45');
    assert.equal(disk().unit_max, undefined);
  } finally { app.close(); await s.done(); }
});

test('Settings opens collapsed, always: five section cards (Layouts in its own tab, five in Settings), every body hidden on every open; a header click opens and closes its card; the index opens its target', async () => {
  const s = await sandbox(PORT_8, { welcome_seen: true });
  const apps = [];
  try {
    const open = async () => {
      const win = fakeWindow({ hash: '#settings' });
      win.document.body = win.document.createElement('body');
      const app = boot(win, { base: s.url });
      apps.push(app);
      await settle(app);
      const pane = parts(win).form;
      assert.equal(win.document.getElementById('window').dataset.settings, 'ready', 'trip-wire: the settings drew');
      const secs = findAll(pane, (c) => /(^| )s-sec( |$)/.test(c.className || ''));
      // Layouts has its own tab: its card is not in the Settings pane, the Settings pane holds the other four
      const own = (n) => findAll(parts(win).pane[n], (c) => /(^| )s-sec( |$)/.test(c.className || '')).length;
      assert.deepEqual([own('layouts'), own('settings')], [1, 5], 'Layouts card in its own tab, five cards in Settings');
      return { pane, secs, app };
    };
    const bodyOf = (sec) => findAll(sec, (c) => /(^| )s-sec-body( |$)/.test(c.className || ''))[0];
    const toggleOf = (sec) => findAll(sec, (c) => /(^| )s-toggle( |$)/.test(c.className || ''))[0];
    const first = await open();
    assert.equal(first.secs.length, 6, 'trip-wire: six section cards');
    assert.deepEqual(first.secs.map((sec) => Boolean(bodyOf(sec)) && bodyOf(sec).hidden === true), [false, true, true, true, true, true], 'every Settings body hidden on boot, the Layouts card (own tab) open');
    assert.deepEqual(first.secs.map((sec) => toggleOf(sec).ariaExpanded), ['true', 'false', 'false', 'false', 'false', 'false']);
    // the controls are there, only folded away (the form still holds every field)
    assert.equal(findAll(first.pane, (c) => c.dataset && c.dataset.var).length, CONTRACT.designVariables.length * 2);
    // a header click opens its card, a second closes it
    toggleOf(first.secs[1]).dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(bodyOf(first.secs[1]).hidden, false, 'Colours open');
    assert.equal(toggleOf(first.secs[1]).ariaExpanded, 'true');
    assert.equal(bodyOf(first.secs[0]).hidden, false, 'the Layouts card stays open');
    toggleOf(first.secs[1]).dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(bodyOf(first.secs[1]).hidden, true, 'Colours closed again');
    // the index opens the card it points at
    const index = findAll(first.pane, (c) => /(^| )s-index( |$)/.test(c.className || ''))[0];
    assert.deepEqual(index.children.map((a) => a.textContent), ['Colours', 'Size', 'Folders & port', 'About', 'Guide'], 'the index no longer lists Layouts');
    index.children.find((a) => a.textContent === 'Size').dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(bodyOf(first.secs[2]).hidden, false, 'the index opened Size');
    // never remembered: the next open is collapsed again
    const second = await open();
    assert.deepEqual(second.secs.map((sec) => bodyOf(sec).hidden), [false, true, true, true, true, true], 'collapsed on the next open too');
  } finally { for (const a of apps) a.close(); await s.done(); }
});

// ── the polish round (bigger type, compact catalog, theme control, Live frames, layout previews) ──

const PORT_9 = await freePort();
const PORT_10 = await freePort();
const PORT_11 = await freePort();
const PORT_12 = await freePort();
const withBodyWindow = (opts) => { const w = fakeWindow(opts); w.document.body = w.document.createElement('body'); return w; };
const frames = (win) => findAll(win.document.getElementById('window'), (c) => c.tagName === 'IFRAME');
const waitFor = async (fn, what, ms = 3000) => { for (const end = Date.now() + ms; ; await sleep(20)) { if (fn()) return; if (Date.now() > end) assert.fail(`timed out waiting for ${what}`); } };
const postSettings = (url, body) => fetch(`${url}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('type scale: the window is one step larger everywhere (11 px floor, 13.5 px body); hud.css is untouched', () => {
  const css = readFileSync(join(HERE, 'window.css'), 'utf8');
  const sizes = [...css.matchAll(/font(?:-size)?:\s*(?:\d{3}\s+)?(\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
  assert.ok(sizes.length >= 30, `trip-wire: the sheet names its sizes (${sizes.length})`);
  assert.equal(Math.min(...sizes), 11, 'the smallest type was 10 px, now 11');
  assert.equal(Math.max(...sizes), 19, 'the largest was 18 px, now 19');
  assert.match(css, /body \{ font: 13\.5px\/1\.45/, 'the body type was 12.5 px');
  assert.deepEqual([...new Set(sizes)].sort((a, b) => a - b), [11, 11.5, 12, 12.5, 13, 13.5, 14, 15, 18, 19], 'the whole scale moved by one');
});

test('Settings theme control: Auto · Dark · Light at the top of the pane, not in the Colours card; a pick applies at once and saves `theme`', async () => {
  const s = await sandbox(PORT_9);
  let app = { close() {} };
  try {
    const win = withBodyWindow({ hash: '#settings' });
    app = boot(win, { base: s.url });
    await settle(app);
    const pane = parts(win).pane.settings;
    assert.equal(win.document.getElementById('window').dataset.settings, 'ready', 'trip-wire: the settings drew');
    const bar = pane.children[0];
    assert.match(bar.className, /(^| )theme-bar( |$)/, 'the control is the first thing of the pane');
    const radios = findAll(bar, (c) => c.name === 'theme');
    assert.deepEqual(radios.map((r) => r.value), ['system', 'dark', 'light'], 'Auto is the settings value `system`');
    assert.deepEqual(findAll(bar, (c) => c.tagName === 'LABEL').map((l) => l.textContent), ['Auto', 'Dark', 'Light']);
    assert.equal(findAll(pane, (c) => c.name === 'theme').length, 3, 'no theme radios left in the Colours card');
    assert.equal(radios[0].checked, true, 'starts on Auto');
    const light = radios[2];
    light.checked = true;
    light.dispatchEvent({ type: 'change', bubbles: true, target: light });
    assert.equal(win.document.documentElement.dataset.theme, 'light', 'applied at once, before the save');
    await settle(app);
    assert.equal(JSON.parse(readFileSync(join(s.node.home, 'settings.json'), 'utf8')).theme, 'light');
  } finally { app.close(); await s.done(); }
});

test('Live: landscape frame on top, portrait frame below, each with its caption; both follow a layout pick; a theme change made elsewhere reaches the window', async () => {
  const s = await sandbox(PORT_10);
  let app = { close() {} };
  try {
    const win = withBodyWindow({});
    app = boot(win, { base: s.url });
    await settle(app);
    const [land, port] = frames(win);
    assert.equal(frames(win).length, 2, 'two frames: landscape, then portrait');
    const sid = encodeURIComponent(s.sessions.current);
    assert.equal(land.src, `/hud?layout=essentials-landscape&session=${sid}`);
    assert.equal(port.src, `/hud?layout=essentials-portrait&session=${sid}`);
    const live = parts(win).pane.live;
    assert.deepEqual(findAll(live, (c) => c.tagName === 'FIGCAPTION').map((c) => c.textContent), ['Landscape', 'Portrait']);
    assert.equal(Number.parseFloat(port.style.width), 180, 'the portrait strip: 8 columns x the 22.5 px base unit');
    assert.ok(Number.parseFloat(port.style.height) > Number.parseFloat(port.style.width), 'taller than wide: the HUD in it picks portrait');
    // a layout pick through the form reaches the frame
    const pane = parts(win).form;
    const pick = findAll(pane, (c) => c.name === 'layout_portrait' && c.value === 'minimal-portrait')[0];
    pick.checked = true;
    pick.dispatchEvent({ type: 'change', bubbles: true, target: pick });
    await settle(app);
    assert.equal(port.src, `/hud?layout=minimal-portrait&session=${sid}`, 'the portrait frame follows the saved layout');
    assert.equal(land.src, `/hud?layout=essentials-landscape&session=${sid}`, 'the landscape frame stays');
    // a theme saved elsewhere (a second window, the CLI) reaches this window without a reload
    assert.equal(win.document.documentElement.dataset.theme, 'dark');
    await postSettings(s.url, { theme: 'light' });
    await waitFor(() => win.document.documentElement.dataset.theme === 'light', 'the window following settings-changed');
    const barRadios = findAll(parts(win).pane.settings.children[0], (c) => c.name === 'theme');
    assert.deepEqual(barRadios.map((r) => r.checked), [false, false, true], 'the theme bar shows Light too');
  } finally { app.close(); await s.done(); }
});

test('Auto follows the system: a change of the OS scheme re-themes the window and the HUD, theme `system` only', async () => {
  const s = await sandbox(PORT_11);
  let app = { close() {} };
  let hud = { close() {} };
  try {
    const scheme = { light: false, handlers: [] };
    const mm = () => ({ get matches() { return scheme.light; }, addEventListener: (t, fn) => { if (t === 'change') scheme.handlers.push(fn); } });
    const win = withBodyWindow({});
    win.matchMedia = mm;
    app = boot(win, { base: s.url });
    await settle(app);
    assert.equal(win.document.documentElement.dataset.theme, 'dark');
    assert.ok(scheme.handlers.length >= 1, 'trip-wire: the window listens');
    scheme.light = true;
    for (const fn of scheme.handlers) fn({ matches: true });
    assert.equal(win.document.documentElement.dataset.theme, 'light', 'the window follows the OS');
    // the HUD, same rule
    scheme.handlers.length = 0;
    scheme.light = false;
    const hwin = fakeWindow({ ids: ['hud'] });
    hwin.matchMedia = mm;
    hud = bootHud(hwin, { base: s.url, importModule: importOverHttp });
    await settle(hud);
    assert.equal(hwin.document.documentElement.dataset.theme, 'dark');
    assert.ok(scheme.handlers.length >= 1, 'trip-wire: the HUD listens');
    scheme.light = true;
    for (const fn of scheme.handlers) fn({ matches: true });
    assert.equal(hwin.document.documentElement.dataset.theme, 'light', 'the HUD follows the OS');
    // a fixed theme ignores the OS
    await postSettings(s.url, { theme: 'dark' });
    await waitFor(() => hud.state.settings.theme === 'dark', 'the HUD loading the fixed theme');
    scheme.light = true;
    for (const fn of scheme.handlers) fn({ matches: true });
    assert.equal(hwin.document.documentElement.dataset.theme, 'dark', 'a fixed theme stays');
  } finally { app.close(); hud.close(); await s.done(); }
});

test('Layout cards: each card draws its layout with the real tiles, mini-scaled; a layout whose tiles cannot load falls back to the grey blocks', async () => {
  const s = await sandbox(PORT_12, { layout_portrait: 'probe-portrait', layout_landscape: 'probe-landscape' });
  let app = { close() {} };
  let app2 = { close() {} };
  try {
    const win = withBodyWindow({ hash: '#settings' });
    app = boot(win, { base: s.url, importModule: importOverHttp });
    await settle(app);
    const root = win.document.getElementById('window');
    const probe = findAll(root, (c) => c.dataset && c.dataset.layout === 'probe-landscape')[0];
    const thumb = findAll(probe, (c) => /(^| )thumb( |$)/.test(c.className || ''))[0];
    assert.equal(thumb.dataset.drawn, 'tiles', 'the card drew real tiles');
    const placed = findAll(thumb, (c) => c.dataset && c.dataset.tile);
    assert.ok(placed.length >= 1 && placed.every((c) => c.dataset.tile.startsWith('example-')), `the layout's own tiles: ${placed.map((c) => c.dataset.tile)}`);
    assert.ok(Number(root.dataset.thumbs) >= 4, `the cards counted: ${root.dataset.thumbs}`);
    assert.ok(Number(root.dataset.thumbMs) >= 0, 'the render time is measured');
    // no module loader that works: the grey blocks stay, said by the card
    const win2 = withBodyWindow({ hash: '#settings' });
    app2 = boot(win2, { base: s.url });
    await settle(app2);
    const thumbs2 = findAll(win2.document.getElementById('window'), (c) => /(^| )thumb( |$)/.test(c.className || ''));
    assert.ok(thumbs2.length >= 4);
    assert.ok(thumbs2.every((t) => t.dataset.drawn === 'blocks'), 'fallback: every thumb keeps its blocks');
    assert.ok(thumbs2.some((t) => t.children.length >= 1), 'and the blocks are there');
  } finally { app.close(); app2.close(); await s.done(); }
});

test('Live landscape frame: capped so the HUD inside still picks landscape in a narrow pane', () => {
  assert.equal(landscapeFrameHeight(135, 1000, 1), 135, 'wide pane: the band');
  assert.equal(landscapeFrameHeight(135, 400, 4), 100, 'ratio 4 in a 400 px pane: width / ratio');
  assert.equal(landscapeFrameHeight(135, 0, 4), 135, 'unknown width: no cap');
  assert.equal(landscapeFrameHeight(135, 300, 0), 135, 'a bad ratio counts as 1');
});

// ── the Layouts tab and the tab memory (`last_tab`) ──

const PORT_TABS = await freePort();

test('Tabs: Live · Layouts · Settings · Analysis; a switch saves last_tab (without a Live redraw), a reopen lands on it; hash beats memory; a vanished value opens Live; #layouts opens Layouts', async () => {
  const s = await sandbox(PORT_TABS, { welcome_seen: true });
  const apps = [];
  const disk = () => JSON.parse(readFileSync(join(s.node.home, 'settings.json'), 'utf8'));
  const open = async (opts = {}) => {
    const win = withBodyWindow(opts);
    const app = boot(win, { base: s.url });
    apps.push(app);
    await settle(app);
    return { win, app, ...parts(win) };
  };
  const tabButton = (tabs, name) => findAll(tabs, (c) => c.tagName === 'BUTTON' && c.dataset.tab === name)[0];
  try {
    const a = await open();
    assert.deepEqual(findAll(a.tabs, (c) => c.tagName === 'BUTTON').map((b) => b.textContent), ['Live', 'Layouts', 'Settings', 'Analysis'], 'tab order');
    assert.equal(a.root.dataset.tab, 'live', 'nothing remembered: Live');
    assert.equal(disk().last_tab, undefined, 'opening saves nothing');
    assert.equal(a.app.state.counts.tabSaves, 0);
    // the Layouts tab holds the layout cards and the composer link; Settings no longer does
    assert.ok(findAll(a.pane.layouts, (c) => c.name === 'layout_portrait').length >= 4);
    assert.equal(findAll(a.pane.settings, (c) => c.name === 'layout_portrait').length, 0, 'no layout cards in Settings');
    assert.equal(findAll(a.pane.layouts, (c) => /(^| )composer-link( |$)/.test(c.className || ''))[0].href, '/composer');
    // V2: a tab switch is saved, and its settings-changed does not redraw Live
    const drawsBefore = a.app.state.counts.liveDraws;
    tabButton(a.tabs, 'layouts').dispatchEvent({ type: 'click', bubbles: true });
    assert.equal(a.root.dataset.tab, 'layouts');
    assert.deepEqual(a.panes.map((p) => p.hidden), [true, false, true, true]);
    await settle(a.app);
    await waitFor(() => disk().last_tab === 'layouts', 'last_tab on disk');
    await sleep(200);   // the settings-changed round trip
    await settle(a.app);
    assert.equal(a.app.state.counts.liveDraws, drawsBefore, 'a tab switch alone does not redraw Live');
    assert.equal(a.app.state.counts.saves, 0, 'and it is not the form autosave');
    // a change made elsewhere still redraws (the guard only skips last_tab alone)
    await postSettings(s.url, { theme: 'light' });
    await waitFor(() => a.app.state.counts.liveDraws > drawsBefore, 'Live redrawn by a real settings change');
    // reopen: lands on the remembered tab; the hash beats it; the opening pick is not a switch (no save)
    const b = await open();
    assert.equal(b.root.dataset.tab, 'layouts', 'last_tab > live');
    assert.equal(b.app.state.counts.tabSaves, 0);
    const c = await open({ hash: '#analysis' });
    assert.equal(c.root.dataset.tab, 'analysis', 'hash > last_tab');
    assert.equal(disk().last_tab, 'layouts', 'an opening via hash does not overwrite the memory');
    const d = await open({ hash: '#layouts' });
    assert.equal(d.root.dataset.tab, 'layouts', '#layouts opens Layouts');
    // another switch updates the memory
    tabButton(d.tabs, 'settings').dispatchEvent({ type: 'click', bubbles: true });
    await settle(d.app);
    await waitFor(() => disk().last_tab === 'settings', 'last_tab follows the switch');
    // a vanished value on disk: Live, by name
    writeFileSync(join(s.node.home, 'settings.json'), JSON.stringify({ welcome_seen: true, last_tab: 'gone' }));
    const e = await open();
    assert.equal(e.root.dataset.tab, 'live', 'a vanished remembered tab opens Live');
    // the node refuses a name that is no tab
    const bad = await postSettings(s.url, { last_tab: 'gone' });
    assert.equal(bad.status, 400);
  } finally { for (const x of apps) x.close(); await s.done(); }
});

// ── the Start tab (steps as one list), the Analysis badge, "Show introduction again" ──

const startHelpers = (s) => {
  const apps = [];
  const open = async (opts = {}) => {
    const win = fakeWindow(opts);
    const app = boot(win, { base: s.url });
    apps.push(app);
    await settle(app);
    return { win, app, ...parts(win) };
  };
  const btn = (node, cls) => findAll(node, (c) => c.tagName === 'BUTTON' && c.className === cls)[0];
  const click = (node) => node.dispatchEvent({ type: 'click', bubbles: true });
  const names = (tabs) => findAll(tabs, (c) => c.tagName === 'BUTTON').map((b) => b.textContent);
  const stepClasses = (p) => findAll(p, (c) => /^step /.test(c.className || '')).map((r) => r.className);
  return { apps, open, btn, click, names, stepClasses, file: join(s.node.home, 'settings.json') };
};

test('Start tab: a fresh install opens Start first (tab order, step 1); Next walks the list with focus + live region; Done stores marker + last_tab=layouts, Start is gone, Layouts shows; the badge sits in Analysis only', async () => {
  const s = await sandbox(await freePort());   // FRESH: no settings.json at all
  const { apps, open, btn, click, names, stepClasses, file } = startHelpers(s);
  try {
    assert.equal(existsSync(file), false, 'a fresh home');
    const a = await open();
    assert.deepEqual(names(a.tabs), ['Start', 'Live', 'Layouts', 'Settings', 'Analysis'], 'Start first');
    assert.equal(a.root.dataset.tab, 'start', 'fresh: Start opens');
    assert.equal(a.pane.start.hidden, false);
    assert.equal(a.app.state.startOn, true);
    assert.equal(existsSync(file), false, 'showing Start stores nothing (no marker, no last_tab)');
    // step 1: current open with its text verbatim, the others dimmed with their number
    assert.equal(findAll(a.pane.start, (c) => c.tagName === 'H2')[0].textContent, 'Getting started');
    assert.equal(btn(a.pane.start, 'start-skip').textContent, 'Skip introduction');
    assert.deepEqual(stepClasses(a.pane.start), ['step cur', 'step todo', 'step todo']);
    assert.deepEqual(findAll(a.pane.start, (c) => c.tagName === 'H3').map((h) => h.textContent), START_STEPS.map((x) => x[0]));
    assert.equal(findAll(a.pane.start, (c) => c.tagName === 'P' && c.className !== 'start-live')[0].textContent, START_STEPS[0][1]);
    assert.equal(findAll(a.pane.start, (c) => c.className === 'start-live')[0].textContent, '', 'nothing announced on the opening draw');
    const liveNode = findAll(a.pane.start, (c) => c.className === 'start-live')[0];
    assert.equal(btn(a.pane.start, 'start-next').textContent, 'Next');
    // the badge: in Analysis (first child, above search + table), not in Start, no close button
    const badges = (p) => findAll(p, (c) => c.className === 'note-badge');
    assert.equal(badges(a.pane.analysis).length, 1);
    assert.equal(badges(a.pane.analysis)[0].textContent, WELCOME_NOTE.join(''));
    assert.equal(a.pane.analysis.children[0].className, 'note-badge');
    assert.equal(findAll(a.pane.analysis.children[0], (c) => c.tagName === 'BUTTON').length, 0, 'no close button');
    assert.equal(badges(a.pane.start).length, 0, 'no badge in Start');
    // Next → step 2: step 1 ticked, step 2 open, live region says it, focus on the new heading (tabindex -1)
    click(btn(a.pane.start, 'start-next'));
    assert.deepEqual(stepClasses(a.pane.start), ['step done', 'step cur', 'step todo']);
    const rowsNow = findAll(a.pane.start, (c) => /^step /.test(c.className || ''));
    assert.equal(findAll(rowsNow[0], (c) => c.className === 'n')[0].textContent, '✓');
    assert.equal(findAll(rowsNow[1], (c) => c.tagName === 'P')[0].textContent, START_STEPS[1][1]);
    assert.equal(findAll(a.pane.start, (c) => c.className === 'start-live')[0].textContent, 'Step 2 of 3');
    assert.equal(findAll(a.pane.start, (c) => c.className === 'start-live')[0], liveNode, 'the live region is the same node on every step (built once, only its text changes)');
    assert.deepEqual(findAll(a.pane.start, (c) => c.className === 'sr-only').map((x) => x.textContent), [' (done)'], 'the done step says so in hidden text, no aria-label on the div');
    const focused = a.win.document.activeElement;
    assert.equal(focused.tagName, 'H3');
    assert.equal(focused.textContent, START_STEPS[1][0], 'focus moved to the new step heading');
    assert.equal(focused.attrs.tabindex, '-1');
    assert.equal(findAll(a.pane.start, (c) => c.className === 'start-live')[0].attrs['aria-live'], 'polite');
    assert.equal(a.root.dataset.tab, 'start', 'still Start');
    assert.equal(existsSync(file), false, 'mid-run nothing is stored');
    // Next → step 3: the button reads Done
    click(btn(a.pane.start, 'start-next'));
    assert.deepEqual(stepClasses(a.pane.start), ['step done', 'step done', 'step cur']);
    assert.equal(findAll(a.pane.start, (c) => c.className === 'start-live')[0].textContent, 'Step 3 of 3');
    assert.equal(a.win.document.activeElement.textContent, START_STEPS[2][0]);
    assert.equal(btn(a.pane.start, 'start-next').textContent, 'Done');
    click(btn(a.pane.start, 'start-next'));
    assert.equal(a.root.dataset.tab, 'layouts', 'Done shows Layouts');
    assert.equal(a.win.document.activeElement.dataset.tab, 'layouts', 'focus moved to the Layouts tab button after Done');
    assert.equal(a.win.document.activeElement.tagName, 'BUTTON');
    assert.equal(findAll(a.root, (c) => c.className === 'sr-only').length, 0, 'no hidden step text outside Start');
    assert.deepEqual(names(a.tabs), ['Live', 'Layouts', 'Settings', 'Analysis'], 'Start is gone');
    assert.equal(a.root.children.filter((c) => /(^| )start( |$)/.test(c.className || '')).length, 0, 'and its pane');
    await settle(a.app);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { welcome_seen: true, last_tab: 'layouts' }, 'marker + last_tab, no layout key');
    // reopen: no Start; the memory
    const b = await open();
    assert.deepEqual(names(b.tabs), ['Live', 'Layouts', 'Settings', 'Analysis']);
    assert.equal(b.root.dataset.tab, 'layouts');
  } finally { for (const x of apps) x.close(); await s.done(); }
});

test('Start tab: Skip from step 2 ends it like Done; closing mid-run stores nothing and the next open starts at step 1; a valid hash beats Start; a stored last_tab "start" is ignored', async () => {
  const s = await sandbox(await freePort());
  const { apps, open, btn, click, names, stepClasses, file } = startHelpers(s);
  try {
    const a = await open();
    click(btn(a.pane.start, 'start-next'));
    assert.deepEqual(stepClasses(a.pane.start), ['step done', 'step cur', 'step todo']);
    a.app.close();   // the window is closed mid-run
    assert.equal(existsSync(file), false, 'nothing stored by closing');
    const b = await open();
    assert.equal(b.root.dataset.tab, 'start');
    assert.deepEqual(stepClasses(b.pane.start), ['step cur', 'step todo', 'step todo'], 'back at step 1');
    // hash > Start: the hash tab shows, the Start tab stays in the bar
    const h = await open({ hash: '#analysis' });
    assert.equal(h.root.dataset.tab, 'analysis');
    assert.deepEqual(names(h.tabs), ['Start', 'Live', 'Layouts', 'Settings', 'Analysis']);
    assert.equal(existsSync(file), false, 'a hash open stores nothing');
    // Skip from step 2
    click(btn(b.pane.start, 'start-next'));
    click(btn(b.pane.start, 'start-skip'));
    assert.equal(b.root.dataset.tab, 'layouts');
    assert.deepEqual(names(b.tabs), ['Live', 'Layouts', 'Settings', 'Analysis']);
    await settle(b.app);
    assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')), { welcome_seen: true, last_tab: 'layouts' });
    // Start is never a stored tab: the node refuses it, and a hand-written one is ignored on open
    assert.equal((await postSettings(s.url, { last_tab: 'start' })).status, 400, 'the node accepts no last_tab "start"');
    writeFileSync(file, JSON.stringify({ welcome_seen: true, last_tab: 'start' }));
    const g = await open();
    assert.equal(g.root.dataset.tab, 'live', 'a stored last_tab "start" is ignored');
    assert.deepEqual(names(g.tabs), ['Live', 'Layouts', 'Settings', 'Analysis']);
  } finally { for (const x of apps) x.close(); await s.done(); }
});

test('Start tab: a marker that cannot be saved is said, Start still goes away (no loop); Settings "Show introduction again" brings Start back at step 1', async () => {
  const s = await sandbox(await freePort());
  const { apps, btn, click, names, stepClasses, file } = startHelpers(s);
  try {
    const win = fakeWindow();
    const realFetch = win.fetch;
    let failing = true;   // every POST /settings is refused
    win.fetch = (u, o) => (failing && o && o.method === 'POST'
      ? Promise.resolve({ ok: false, status: 500, json: async () => ({ error: 'disk_full' }) })
      : realFetch(u, o));
    const app = boot(win, { base: s.url });
    apps.push(app);
    await settle(app);
    const p = parts(win);
    click(btn(p.pane.start, 'start-skip'));
    await settle(app);
    assert.match(p.status.textContent, /^welcome marker not saved: .*500/, 'the failure is said');
    assert.equal(p.root.dataset.tab, 'layouts');
    assert.deepEqual(names(p.tabs), ['Live', 'Layouts', 'Settings', 'Analysis'], 'Start gone in this window anyway');
    assert.equal(existsSync(file), false, 'nothing reached the disk');
    // "Show introduction again", in the header of the last Settings section Guide (closed); the old About link is gone
    failing = false;
    p.status.textContent = '';
    const again = findAll(p.pane.settings, (c) => c.tagName === 'BUTTON' && c.textContent === 'Show introduction again')[0];
    assert.ok(again, 'the button sits in Settings');
    const secs = findAll(p.pane.settings, (c) => c.tagName === 'SECTION' && c.dataset && c.dataset.section);
    const guide = secs[secs.length - 1];
    assert.equal(guide.dataset.section, 'Guide', 'Guide is the last section');
    assert.equal(findAll(p.pane.settings, (c) => c.tagName === 'THEME-BAR' || c.className === 'theme-bar')
      .flatMap((b) => findAll(b, (c) => c === again)).length, 0, 'the button is not in the Theme bar');
    const hdr = findAll(guide, (c) => c.tagName === 'HEADER')[0];
    assert.equal(findAll(hdr, (c) => c === again).length, 1, 'the button sits in the Guide header');
    assert.equal(guide.className, 's-sec closed', 'Guide is closed, the button works anyway');
    const guideText = findAll(guide, (c) => c.tagName === 'P' || c.tagName === 'H4').map((c) => c.textContent).join('\n');
    for (const need of ['npx aihud new-tile', 'npx aihud install-skill', '＋ New', '~/.aihud/layouts/', 'npx aihud check', 'newest session of the folder', 'README']) {
      assert.ok(guideText.includes(need), `guide mentions ${need}`);
    }
    assert.equal(findAll(p.pane.settings, (c) => c.textContent === 'Show again').length, 0, 'the old About link is gone');
    click(again);
    assert.equal(p.root.dataset.tab, 'start', 'Start is open again');
    assert.deepEqual(names(p.tabs), ['Start', 'Live', 'Layouts', 'Settings', 'Analysis']);
    assert.deepEqual(stepClasses(p.pane.start), ['step cur', 'step todo', 'step todo'], 'at step 1');
    await settle(app);
    assert.equal(JSON.parse(readFileSync(file, 'utf8')).welcome_seen, false, 'the marker is off on disk');
    // a new window: Start again (marker false), at step 1
    const win2 = fakeWindow();
    const app2 = boot(win2, { base: s.url });
    apps.push(app2);
    await settle(app2);
    assert.equal(parts(win2).root.dataset.tab, 'start');
  } finally { for (const x of apps) x.close(); await s.done(); }
});

test('no ?session and no session in the start folder: the status says it follows the newest session (none in <folder>); a pin does not', async () => {
  const s = await sandbox(await freePort(), { welcome_seen: true }, join(tmpdir(), 'elsewhere'));   // a native path: basename() splits only at the platform's separator
  let app = { close() {} };
  let app2 = { close() {} };
  try {
    assert.equal(s.sessions.current_from, 'newest');
    const win = fakeWindow({});
    app = boot(win, { base: s.url });
    await settle(app);
    assert.equal(parts(win).status.textContent, '· newest session (none in elsewhere)');
    const win2 = fakeWindow({ search: `?session=${encodeURIComponent(s.sessions.current)}` });
    app2 = boot(win2, { base: s.url });
    await settle(app2);
    assert.equal(parts(win2).status.textContent, '', 'a pinned window needs no note');
  } finally { app.close(); app2.close(); await s.done(); }
});

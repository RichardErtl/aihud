// The HUD's click-through in a real browser: headless Chrome/Edge/Chromium (`node/launch.js
// findBrowser`) over the DevTools protocol, against a real node on test port 4376 (temp copy of the
// reader fixtures, temp aihud home), on the minimal landscape layout — whose header opens its
// session list from a plain div (role=button) and picks from div rows. Opening the list and picking
// a row must switch the session and open NO window; a click on a plain tile opens /window with the
// HUD's session. `window.open` is recorded in the page. Skipped when no such browser is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNode } from '../node/server.js';
import { findBrowser } from '../node/launch.js';
import { createServer as netServer } from 'node:net';

// FG-A4: the OS hands out the test port (port 0, read, release) - no fixed 43xx/44xx port, so parallel runs never collide.
// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The debugging port the browser names in its profile folder (the file may still be locked while written). */
async function devtoolsPort(profile) {
  const file = join(profile, 'DevToolsActivePort');
  for (const end = Date.now() + 45_000; Date.now() < end; await sleep(100)) {   // the first, cold Chrome start of a CI job took up to 17.1 s (Actions run 37862940551; warm starts < 4 s)
    try { const text = readFileSync(file, 'utf8'); if (text.includes('\n')) return text.split('\n')[0].trim(); } catch { /* not there or still locked */ }
  }
  throw new Error('the browser did not open its debugging port');
}

async function devtools(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('devtools socket failed')); });
  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.fail(new Error(msg.error.message)); else w.ok(msg.result);
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { id++; waiting.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.text} ${expression}`);
    return r.result.value;
  };
  const until = async (expression, what, ms = 10_000) => {
    for (const end = Date.now() + ms; ; await sleep(50)) {
      const v = await evaluate(expression);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    }
  };
  const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  const click = async (p) => { await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y, 1); await mouse('mouseReleased', p.x, p.y); };
  return { send, evaluate, until, click, mouse, close: () => ws.close() };
}

const centreOf = (selector) => `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;

test('HUD in a real browser (minimal landscape): opening the session list and picking a row switch the session and open no window; a plain tile click opens /window?session=', { timeout: 90_000 }, async (t) => {
  const browser = findBrowser();
  if (!browser || browser.noApp) { t.skip(`no Chrome, Edge or Chromium found${browser ? ` (${browser.noApp})` : ''}`); return; }

  const base = mkdtempSync(join(tmpdir(), 'aihud-window-browser-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ layout_landscape: 'minimal-landscape' }));
  const node = await createNode({ port: PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT}`;
  const chrome = spawn(browser.path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1400,160', 'about:blank',
  ], { stdio: 'ignore' });
  let dt = null;
  try {
    const list = await (await fetch(`${url}/sessions`)).json();
    const other = list.sessions.map((s) => s.session_id).find((id) => id !== list.current);
    assert.ok(list.current && other, 'the fixtures hold a current and a second session');
    const target = await (await fetch(`http://127.0.0.1:${await devtoolsPort(profile)}/json/new?about:blank`, { method: 'PUT' })).json();
    dt = await devtools(target.webSocketDebuggerUrl);
    await dt.send('Page.enable');
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 160, deviceScaleFactor: 1, mobile: false });
    // record window.open instead of opening anything
    await dt.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__opened = []; window.open = (u, n) => { window.__opened.push(String(u)); return null; };' });
    await dt.send('Page.navigate', { url: `${url}/hud` });
    const header = '#hud .tile[data-tile^="header-minimal"]';
    await dt.until(`document.getElementById('hud') && document.getElementById('hud').dataset.layout === 'minimal-landscape' && !!document.querySelector('${header} [role="button"]')`, 'the minimal HUD with its session opener');
    const opened = () => dt.evaluate('window.__opened.slice()');
    const current = () => dt.evaluate(`document.querySelector('${header} [role="button"]').textContent`);
    assert.ok((await current()).length >= 1);

    // 1. open the list from the div opener: no window
    await dt.click(await dt.evaluate(centreOf(`${header} [role="button"]`)));
    await dt.until(`!!document.querySelector('${header} [data-session="${other}"]')`, 'the open session list');
    assert.deepEqual(await opened(), [], 'opening the list opened no window');
    // 2. pick the other session from a div row: the session switches, still no window
    await dt.click(await dt.evaluate(centreOf(`${header} [data-session="${other}"]`)));
    await dt.until(`document.querySelector('${header} [role="button"]') && ${JSON.stringify(other)}.startsWith(document.querySelector('${header} [role="button"]').textContent.replace('…', ''))`, 'the switch to the picked session');
    assert.deepEqual(await opened(), [], 'picking a row opened no window');

    // 3. the trip-wire: a click on a plain tile (not the header) opens the window with the HUD session
    const plain = '#hud .tile:not([data-tile^="header"])';
    assert.ok(await dt.evaluate(`document.querySelectorAll('${plain}').length >= 1`));
    await dt.click(await dt.evaluate(centreOf(plain)));
    await dt.until('window.__opened.length >= 1', 'the window open');
    assert.deepEqual(await opened(), [`/window?session=${encodeURIComponent(other)}`]);
    t.diagnostic(`opened ${JSON.stringify(await opened())}`);
  } finally {
    if (dt) dt.close();
    // our own browser process and its children, by the PID we started — nothing else
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await node.close();
    for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await sleep(150); } }
  }
});

// The edit control on a layout card (an edit symbol top-right on hover): hidden at
// rest, shown on hover; a click opens the composer on that layout and leaves the card's selection
// as it was (no radio change, nothing saved). `AIHUD_SHOT=<file.png>` keeps the hover state.
test('Settings layout card in a real browser: the edit control shows on hover, opens /composer?layout=<name>, and leaves the selection alone', { timeout: 90_000 }, async (t) => {
  const browser = findBrowser();
  if (!browser || browser.noApp) { t.skip(`no Chrome, Edge or Chromium found${browser ? ` (${browser.noApp})` : ''}`); return; }

  const EDIT_PORT = await freePort();
  const base = mkdtempSync(join(tmpdir(), 'aihud-window-edit-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const settingsFile = join(home, 'settings.json');
  // the landscape choice names a layout that is gone: its card shows "not found" and gets no edit control
  const initial = JSON.stringify({ welcome_seen: true, layout_landscape: 'gone-layout' });
  writeFileSync(settingsFile, initial);
  const node = await createNode({ port: EDIT_PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${EDIT_PORT}`;
  const chrome = spawn(browser.path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1100,900', 'about:blank',
  ], { stdio: 'ignore' });
  let dt = null;
  try {
    const target = await (await fetch(`http://127.0.0.1:${await devtoolsPort(profile)}/json/new?about:blank`, { method: 'PUT' })).json();
    dt = await devtools(target.webSocketDebuggerUrl);
    await dt.send('Page.enable');
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await dt.send('Page.navigate', { url: `${url}/window#layouts` });
    await dt.until(`document.getElementById('window') && document.getElementById('window').dataset.settings === 'ready'`, 'the settings pane');
    await dt.until(`!document.querySelector('#window .pane.layouts .s-sec .s-sec-body').hidden`, 'Layouts open');

    // every layout card carries one edit control as its sibling (never inside the label), shipped and
    // own alike — except the card of a layout that is gone
    const counts = await dt.evaluate(`[document.querySelectorAll('#window .l-item[data-layout] > label.l-card').length, document.querySelectorAll('#window .l-item[data-layout] > button.edit[type="button"]').length, document.querySelectorAll('#window label.l-card button.edit').length]`);
    assert.ok(counts[0] >= 3 && counts[1] === counts[0] - 1 && counts[2] === 0, `one edit control per card but the gone one, none inside a label: ${counts}`);
    assert.equal(await dt.evaluate(`document.querySelector('#window .l-item[data-layout="gone-layout"] > label.l-card .m').textContent`), 'not found', 'the gone card is there');
    assert.equal(await dt.evaluate(`document.querySelectorAll('#window .l-item[data-layout="gone-layout"] button.edit').length`), 0, 'and has no edit control');

    const item = '#window .l-item[data-layout="minimal-landscape"]';
    const card = `${item} > label.l-card`;
    const edit = `${item} > button.edit`;
    const style = (sel, prop) => dt.evaluate(`getComputedStyle(document.querySelector('${sel}')).${prop}`);
    assert.equal(await dt.evaluate(`document.querySelector('${edit}').getAttribute('aria-label')`), 'Edit minimal-landscape in the composer');
    await dt.evaluate(`document.querySelector('${card}').scrollIntoView({ block: 'center' })`);
    // the button focused: it shows, and the card draws no second ring around it
    await dt.evaluate(`document.querySelector('${edit}').focus()`);
    await dt.until(`document.activeElement === document.querySelector('${edit}') && getComputedStyle(document.querySelector('${edit}')).opacity === '1'`, 'the focused edit control shown');
    assert.equal(await style(card, 'outlineStyle'), 'none', 'no card ring while the button has focus');
    await dt.evaluate(`document.activeElement.blur()`);
    await dt.mouse('mouseMoved', 2, 2);
    await dt.until(`getComputedStyle(document.querySelector('${edit}')).opacity === '0'`, 'the edit control hidden at rest');

    // the selection before the click, and a recorder that survives the navigation (same tab, same origin)
    const radios = `[...document.querySelectorAll('#window input.l-radio')].map((r) => r.name + '=' + r.value + ':' + r.checked)`;
    const before = await dt.evaluate(radios);
    await dt.evaluate(`(() => {
      sessionStorage.setItem('changes', '0');
      document.addEventListener('change', (e) => { if (e.target.classList && e.target.classList.contains('l-radio')) sessionStorage.setItem('changes', String(Number(sessionStorage.getItem('changes')) + 1)); }, true);
      addEventListener('pagehide', () => sessionStorage.setItem('radios', JSON.stringify(${radios})));
      return true;
    })()`);

    // hover the card: the control fades in at the card's top-right corner
    const c = await dt.evaluate(`(() => { const r = document.querySelector('${card}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await dt.mouse('mouseMoved', c.x, c.y);
    await dt.until(`getComputedStyle(document.querySelector('${edit}')).opacity === '1'`, 'the edit control shown on hover');
    assert.equal(await style(edit, 'backgroundColor'), 'rgba(0, 0, 0, 0)', 'transparent while only the card is hovered');
    const where = await dt.evaluate(`(() => { const k = document.querySelector('${card}').getBoundingClientRect(); const b = document.querySelector('${edit}').getBoundingClientRect(); return { right: k.right - b.right, top: b.top - k.top, w: b.width, mid: k.left + k.width / 2, left: b.left }; })()`);
    assert.ok(where.right >= 0 && where.right <= 8 && where.top >= 0 && where.top <= 8 && where.left > where.mid && where.w >= 16, `top-right inside the card: ${JSON.stringify(where)}`);
    const p = await dt.evaluate(`(() => { const r = document.querySelector('${edit}').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await dt.mouse('mouseMoved', p.x, p.y);
    await dt.until(`getComputedStyle(document.querySelector('${edit}')).backgroundColor !== 'rgba(0, 0, 0, 0)'`, 'the fill under the pointer');
    await sleep(250);
    if (process.env.AIHUD_SHOT) {
      const shot = await dt.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(process.env.AIHUD_SHOT, Buffer.from(shot.data, 'base64'));
      t.diagnostic(`screenshot ${process.env.AIHUD_SHOT}`);
    }

    // the click: the composer on that layout, the selection untouched, nothing saved
    await dt.mouse('mousePressed', p.x, p.y, 1);
    await dt.mouse('mouseReleased', p.x, p.y);
    await dt.until(`location.pathname === '/composer' && !!document.getElementById('composer') && document.getElementById('composer').dataset.loaded === 'minimal-landscape'`, 'the composer on minimal-landscape');
    assert.equal(await dt.evaluate('location.search'), '?layout=minimal-landscape');
    assert.equal(await dt.evaluate(`sessionStorage.getItem('changes')`), '0', 'no radio changed');
    assert.deepEqual(JSON.parse(await dt.evaluate(`sessionStorage.getItem('radios')`)), before, 'the selection is as it was');
    await sleep(400);   // past the autosave delay
    assert.equal(readFileSync(settingsFile, 'utf8'), initial, 'nothing saved');
  } finally {
    if (dt) dt.close();
    // our own browser process and its children, by the PID we started — nothing else
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await node.close();
    for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await sleep(150); } }
  }
});

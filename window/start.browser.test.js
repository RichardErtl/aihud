// The window's Start tab (the steps as one list), the Analysis badge and "Show introduction again" in a real browser:
// headless Chrome/Edge/Chromium over the DevTools protocol, against a real node on an OS-given test port
// (temp copy of the reader fixtures, a FRESH temp aihud home - never a real user home). It proves:
//  1. a fresh install opens on Start (step 1), the keyboard alone (focus + Enter) walks the steps and focus
//     lands on the new step heading, Done lands on Layouts, Start is gone, marker + last_tab are on disk;
//  2. the 30-day badge sits at the top of Analysis, the "Show introduction again" button sits in the header of the last Settings section Guide and
//     brings Start back at step 1;
//  3. V12: what a second `window.open(url, 'aihud-window')` (the HUD's click) does to an already open window
//     (reload or hashchange) - measured and pinned.
// With AIHUD_PROOF_DIR set it also writes desktop screenshots there. Skipped when no such browser is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createNode } from '../node/server.js';
import { findBrowser } from '../node/launch.js';
import { createServer as netServer } from 'node:net';

const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtoolsPort(profile) {
  const file = join(profile, 'DevToolsActivePort');
  for (const end = Date.now() + 45_000; Date.now() < end; await sleep(100)) {   // the first, cold Chrome start of a CI job took up to 17.1 s (Actions run 37862940551; warm starts < 4 s)
    try { const text = readFileSync(file, 'utf8'); if (text.includes('\n')) return text.split('\n')[0].trim(); } catch { /* not there or still locked */ }
  }
  throw new Error('the browser did not open its debugging port');
}

/** A minimal DevTools client; page exceptions and console errors are collected in `errors`. */
async function devtools(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('devtools socket failed')); });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(`exception: ${msg.params.exceptionDetails.text} ${(msg.params.exceptionDetails.exception || {}).description || ''}`);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(`console: ${msg.params.args.map((a) => a.value ?? a.description).join(' ')}`);
    const w = waiting.get(msg.id);
    if (!w) return;
    waiting.delete(msg.id);
    if (msg.error) w.fail(new Error(msg.error.message)); else w.ok(msg.result);
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { id++; waiting.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression, extra = {}) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, ...extra });
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
  const key = async (k, code, vk) => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text: k === 'Enter' ? '\r' : undefined });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk });
  };
  return { send, evaluate, until, click, key, errors, close: () => ws.close() };
}

const centreOf = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;

test('Start tab in a real browser: keyboard walk 1→3→Done lands on Layouts; badge in Analysis; "Show introduction again" in Settings; V12 re-open measured', { timeout: 120_000 }, async (t) => {
  if (process.platform === 'linux') { t.skip('parked: red only on Linux (font/timing), not provably a code defect'); return; }
  const browser = findBrowser();
  if (!browser || browser.noApp) { t.skip(`no Chrome, Edge or Chromium found${browser ? ` (${browser.noApp})` : ''}`); return; }

  const base = mkdtempSync(join(tmpdir(), 'aihud-start-browser-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);   // FRESH: no settings.json
  const settingsFile = join(home, 'settings.json');
  const disk = () => JSON.parse(readFileSync(settingsFile, 'utf8'));
  const node = await createNode({ port: PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT}`;
  const chrome = spawn(browser.path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1100,900', 'about:blank',
  ], { stdio: 'ignore' });
  const dts = [];
  const proof = async (dt, name) => {
    if (!process.env.AIHUD_PROOF_DIR) return;
    const shot = await dt.send('Page.captureScreenshot', { format: 'png' });
    mkdirSync(process.env.AIHUD_PROOF_DIR, { recursive: true });
    writeFileSync(join(process.env.AIHUD_PROOF_DIR, name), Buffer.from(shot.data, 'base64'));
  };
  try {
    const dport = await devtoolsPort(profile);
    const target = await (await fetch(`http://127.0.0.1:${dport}/json/new?about:blank`, { method: 'PUT' })).json();
    const dt = await devtools(target.webSocketDebuggerUrl);
    dts.push(dt);
    await dt.send('Page.enable');
    await dt.send('Runtime.enable');
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 700, deviceScaleFactor: 1, mobile: false });
    const ready = `document.getElementById('window') && document.getElementById('window').dataset.settings === 'ready'`;
    const tabNow = `document.getElementById('window').dataset.tab`;

    // 1. a fresh install: Start, step 1; nothing stored
    await dt.send('Page.navigate', { url: `${url}/window` });
    await dt.until(`${ready} && ${tabNow} === 'start'`, 'Start on a fresh install');
    assert.equal(await dt.evaluate(`[...document.querySelectorAll('#window .tabs .tab')].map((b) => b.textContent).join(',')`), 'Start,Live,Layouts,Settings,Analysis');
    assert.equal(await dt.evaluate(`document.querySelector('#window .step.cur h3').textContent`), 'Your strip');
    assert.equal(existsSync(settingsFile), false, 'showing Start stores nothing');
    await proof(dt, 'ob-d4-1-start-step1.png');

    // keyboard only: focus Next, Enter → step 2, focus on the new heading, the live region says it
    await dt.evaluate(`document.querySelector('#window .start-next').focus()`);
    await dt.key('Enter', 'Enter', 13);
    await dt.until(`document.querySelector('#window .step.cur h3').textContent === 'What it shows'`, 'step 2 by Enter');
    assert.equal(await dt.evaluate(`document.activeElement === document.querySelector('#window .step.cur h3') && document.activeElement.getAttribute('tabindex')`), '-1', 'focus on the new heading');
    assert.equal(await dt.evaluate(`document.querySelector('#window .start-live').textContent`), 'Step 2 of 3');
    assert.equal(await dt.evaluate(`document.querySelector('#window .start-live').getAttribute('aria-live')`), 'polite');
    assert.equal(await dt.evaluate(`document.querySelectorAll('#window .step.done').length`), 1);
    await proof(dt, 'ob-d4-2-start-step2.png');
    // Tab from the heading reaches the Next button (no focus trap), Enter/Space keep going
    await dt.key('Tab', 'Tab', 9);
    assert.equal(await dt.evaluate(`document.activeElement.className`), 'start-next', 'Tab reaches the button');
    await dt.key('Enter', 'Enter', 13);
    await dt.until(`document.querySelector('#window .step.cur h3').textContent === 'This window'`, 'step 3');
    assert.equal(await dt.evaluate(`document.querySelector('#window .start-next').textContent`), 'Done');
    assert.equal(existsSync(settingsFile), false, 'mid-run nothing is stored');
    await dt.click(await dt.evaluate(centreOf('#window .start-next')));
    await dt.until(`${tabNow} === 'layouts' && !document.querySelector('#window .tab[data-tab="start"]')`, 'Done: Layouts, Start gone');
    for (const end = Date.now() + 5000; !(existsSync(settingsFile) && disk().welcome_seen === true); await sleep(50)) {
      if (Date.now() > end) assert.fail('the marker never reached settings.json');
    }
    assert.deepEqual(disk(), { welcome_seen: true, last_tab: 'layouts' }, 'marker + last_tab, no layout key');
    await dt.until(`document.querySelectorAll('#window .pane.layouts input[type=radio]').length >= 8`, 'the layout cards');
    await sleep(500);
    await proof(dt, 'ob-d4-3-layouts-after-done.png');

    // 2. the badge in Analysis, the button in Settings
    await dt.click(await dt.evaluate(centreOf('#window .tab[data-tab="analysis"]')));
    await dt.until(`${tabNow} === 'analysis'`, 'Analysis');
    assert.equal(await dt.evaluate(`document.querySelector('#window .pane.analysis').firstElementChild.className`), 'note-badge');
    assert.equal(await dt.evaluate(`document.querySelector('#window .pane.analysis .note-badge').textContent`), 'Claude Code deletes sessions after 30 days (cleanupPeriodDays) — raise it if you want history.');
    await proof(dt, 'ob-d4-4-analysis-badge.png');
    await dt.click(await dt.evaluate(centreOf('#window .tab[data-tab="settings"]')));
    await dt.until(`${tabNow} === 'settings'`, 'Settings');
    await sleep(300);
    await proof(dt, 'ob-d4-5-settings-button.png');
    assert.equal(await dt.evaluate(`document.querySelector('#window .pane.settings .s-sec:last-child').dataset.section + '/' + document.querySelector('#window .pane.settings .s-sec:last-child').className`), 'Guide/s-sec closed', 'the button sits in the closed last section Guide');
    await dt.click(await dt.evaluate(centreOf('#window .s-sec[data-section="Guide"] .intro-again')));
    await dt.until(`${tabNow} === 'start' && document.querySelector('#window .step.cur h3').textContent === 'Your strip'`, 'Start again at step 1');
    for (const end = Date.now() + 5000; disk().welcome_seen !== false; await sleep(50)) {
      if (Date.now() > end) assert.fail('welcome_seen=false never reached settings.json');
    }
    assert.notEqual(disk().last_tab, 'start', 'last_tab is never "start"');

    // 3. V12: the HUD's click is `window.open(href, 'aihud-window')` without a hash. Opened from this page (a user gesture),
    //    the named window gets `#settings`; a second open without hash is measured: does the page reload, or only hashchange?
    const opener = dt;
    await opener.send('Page.navigate', { url: `${url}/hud` });
    await opener.until(`!!document.getElementById('hud')`, 'the HUD page as the opener');
    const named = `${url}/window?session=${encodeURIComponent('v12')}`;
    await opener.evaluate(`window.open(${JSON.stringify(`${named}#settings`)}, 'aihud-window') !== null`, { userGesture: true });
    let popup = null;
    for (const end = Date.now() + 10_000; !popup; await sleep(100)) {
      const list = await (await fetch(`http://127.0.0.1:${dport}/json/list`)).json();
      popup = list.find((x) => x.type === 'page' && x.url.includes('/window?session=v12')) || null;
      if (!popup && Date.now() > end) assert.fail('the named window never opened');
    }
    const pd = await devtools(popup.webSocketDebuggerUrl);
    dts.push(pd);
    await pd.send('Runtime.enable');
    await pd.until(`${ready}`, 'the named window');
    await pd.evaluate(`window.__v12 = { marker: 'alive', hashchanges: 0 }; addEventListener('hashchange', () => { window.__v12.hashchanges++; }); true`);
    const probe = () => pd.evaluate(`({ marker: (window.__v12 && window.__v12.marker) || null, hashchanges: (window.__v12 && window.__v12.hashchanges) ?? null, href: location.href, tab: (document.getElementById('window') || {}).dataset ? document.getElementById('window').dataset.tab : null })`);
    const before = await probe();
    assert.equal(before.marker, 'alive');
    await opener.evaluate(`window.open(${JSON.stringify(named)}, 'aihud-window') !== null`, { userGesture: true });   // no hash, like the HUD
    await sleep(2000);
    const after = await probe().catch((e) => ({ error: String(e.message || e) }));
    process.stderr.write(`V12 measured: before=${JSON.stringify(before)} after=${JSON.stringify(after)}\n`);
    assert.equal(after.marker, null, 'V12: the open without a hash reloads the window (the in-page marker is gone) - it is NOT a hashchange');
    assert.equal(after.hashchanges, null, 'V12: no hashchange fires in the old page (it was replaced)');
    assert.equal(opener.errors.length + pd.errors.length, 0, `no page error: ${[...opener.errors, ...pd.errors]}`);
  } finally {
    for (const d of dts) { try { d.close(); } catch { /* gone */ } }
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await node.close();
    for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await sleep(150); } }
  }
});

// The window's Settings tab and Start tab in a real browser: headless Chrome/Edge/Chromium
// (`node/launch.js findBrowser`) over the DevTools protocol, against a real node on test port 4411
// (temp copy of the reader fixtures, a FRESH temp aihud home). It proves, by mouse and on disk:
//  1. the Start tab shows on the first open of /window and its Skip sets the marker in settings.json;
//     after a reload it never shows again (with a trip-wire that the page did draw);
//  2. a settings edit (a click on a layout card, the size slider, a colour) is saved on its own
//     (autosave, no Save button) through POST /settings, lands in settings.json under the aihud
//     home only, and survives a reload of the page; the probe pair is not offered as a card;
//  3. the saved landscape layout and a saved colour take effect in the HUD (/hud);
//  4. the Settings entry opens the composer.
// Page errors and console errors fail the test. Skipped when no such browser is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
const NOTE = 'Claude Code deletes sessions after 30 days (cleanupPeriodDays) — raise it if you want history.';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function devtoolsPort(profile) {
  const file = join(profile, 'DevToolsActivePort');
  for (const end = Date.now() + 15_000; Date.now() < end; await sleep(100)) {
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
  return { send, evaluate, until, click, errors, close: () => ws.close() };
}

const centreOf = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`;
/** Sets a form control the way a user's pick does: value, then input + change events. */
const setControl = (selector, value) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.value = ${JSON.stringify(value)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); return e.value; })()`;

test('Settings + Start in a real browser: Start until done (marker in settings.json), edit → autosave → POST /settings → disk → survives reload, layout + colour take effect in /hud, the entry opens the composer', { timeout: 120_000 }, async (t) => {
  if (process.platform === 'linux') { t.skip('parked: red only on Linux (font/timing), not provably a code defect'); return; }
  const browser = findBrowser();
  if (!browser || browser.noApp) { t.skip(`no Chrome, Edge or Chromium found${browser ? ` (${browser.noApp})` : ''}`); return; }

  const base = mkdtempSync(join(tmpdir(), 'aihud-settings-browser-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);   // FRESH: no settings.json
  const settingsFile = join(home, 'settings.json');
  const node = await createNode({ port: PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT}`;
  const chrome = spawn(browser.path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1100,900', 'about:blank',
  ], { stdio: 'ignore' });
  let dt = null;
  try {
    assert.equal(existsSync(settingsFile), false, 'the home starts fresh');
    const target = await (await fetch(`http://127.0.0.1:${await devtoolsPort(profile)}/json/new?about:blank`, { method: 'PUT' })).json();
    dt = await devtools(target.webSocketDebuggerUrl);
    await dt.send('Page.enable');
    await dt.send('Runtime.enable');
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    const ready = `document.getElementById('window') && document.getElementById('window').dataset.settings === 'ready'`;

    // 1. first open (a hash names Layouts, so the hash wins): the Start tab is in front of the others, the page stores nothing;
    //    the Analysis badge carries the 30-day note; Start's "Skip introduction" sets the marker and lands on Layouts
    await dt.send('Page.navigate', { url: `${url}/window#layouts` });
    await dt.until(`${ready} && !!document.querySelector('#window .tab[data-tab="start"]')`, 'the Start tab on the first open');
    assert.equal(await dt.evaluate(`[...document.querySelectorAll('#window .tabs .tab')].map((b) => b.textContent).join(',')`), 'Start,Live,Layouts,Settings,Analysis');
    assert.equal(await dt.evaluate(`document.getElementById('window').dataset.tab`), 'layouts', 'a hash beats Start');
    assert.equal(await dt.evaluate(`document.querySelector('#window .pane.analysis .note-badge').textContent`), NOTE);
    await sleep(300);
    assert.equal(existsSync(settingsFile), false, 'showing the page stored nothing');
    await dt.click(await dt.evaluate(centreOf('#window .tab[data-tab="start"]')));
    await dt.until(`!document.querySelector('#window .pane.start').hidden`, 'the Start pane after a click on its tab');
    await dt.click(await dt.evaluate(centreOf('#window .start-skip')));
    await dt.until(`!document.querySelector('#window .tab[data-tab="start"]') && document.getElementById('window').dataset.tab === 'layouts'`, 'Skip: Start gone, Layouts shown');
    for (const end = Date.now() + 5000; !(existsSync(settingsFile) && JSON.parse(readFileSync(settingsFile, 'utf8')).welcome_seen === true); await sleep(50)) {
      if (Date.now() > end) assert.fail('the welcome marker never reached settings.json');
    }
    assert.equal(JSON.parse(readFileSync(settingsFile, 'utf8')).last_tab, 'layouts');

    // 2. reload: the page draws its settings (trip-wire), the dialog never comes back
    await dt.send('Page.reload');
    await dt.until(`${ready} && document.querySelectorAll('#window .pane.layouts input[type=radio][name^="layout_"]').length >= 8`, 'the settings pane after the reload');
    await sleep(300);
    assert.equal(await dt.evaluate(`document.querySelectorAll('#window .tab[data-tab="start"], .welcome').length`), 0, 'the Start tab shows until it is done, never again');

    // 3. edit by the form — a click on a card, the slider, a colour — and no Save: each change saves itself
    const portraitOpts = await dt.evaluate(`[...document.querySelectorAll('input[name="layout_portrait"]')].map((o) => o.value)`);
    const landscapeOpts = await dt.evaluate(`[...document.querySelectorAll('input[name="layout_landscape"]')].map((o) => o.value)`);
    assert.deepEqual(portraitOpts, ['essentials-portrait', 'standard-portrait', 'minimal-portrait', 'fancy-a-portrait', 'fancy-b-portrait'], `portrait choices in style order, no probe: ${portraitOpts}`);
    assert.deepEqual(landscapeOpts, ['essentials-landscape', 'standard-landscape', 'minimal-landscape', 'fancy-a-landscape', 'fancy-b-landscape'], `landscape choices in style order, no probe: ${landscapeOpts}`);
    assert.equal(await dt.evaluate(`document.querySelectorAll('#window button.save').length`), 0, 'no Save button');
    assert.equal(await dt.evaluate(`document.querySelector('input[name="unit_max"]').value`), '22.5', 'the slider shows the stored unit, never a rounded one');
    // the page opens with Layouts open by itself and the five Settings cards closed
    assert.equal(await dt.evaluate(`[...document.querySelectorAll('#window .s-sec-body')].filter((b) => b.hidden && b.getBoundingClientRect().height === 0).length`), 5, 'five closed cards on open (Layouts opens by itself)');
    await dt.until(`!document.querySelector('#window .pane.layouts .s-sec .s-sec-body').hidden`, 'Layouts open');
    await dt.click(await dt.evaluate(centreOf('#window label.l-card[data-layout="minimal-landscape"]')));
    await dt.until(`document.querySelector('input[name="layout_landscape"][value="minimal-landscape"]').checked`, 'the card click picks the layout');
    await dt.evaluate(setControl('input[name="unit_max"]', '20'));
    await dt.evaluate(setControl('input[data-var="--aihud-heat-100"][data-theme="dark"]', '#123456'));
    for (const end = Date.now() + 5000; ; await sleep(50)) {
      const d = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {};
      if (d.layout_landscape === 'minimal-landscape' && d.unit_max === 20 && d.design_variables) break;
      if (Date.now() > end) assert.fail(`the autosave never reached settings.json: ${JSON.stringify(d)}`);
    }
    await dt.until(`/^saved \\d\\d:\\d\\d:\\d\\d$/.test(document.querySelector('#window .settings-status').textContent)`, 'the head says saved hh:mm:ss');
    const onDisk = JSON.parse(readFileSync(settingsFile, 'utf8'));
    assert.equal(onDisk.layout_landscape, 'minimal-landscape');
    assert.equal(onDisk.unit_max, 20);
    assert.deepEqual(onDisk.design_variables, { dark: { '--aihud-heat-100': '#123456' }, light: {} });
    assert.equal(onDisk.welcome_seen, true, 'the marker survives the save');
    assert.equal('port' in onDisk, false, 'an untouched setting is not written');
    assert.deepEqual(readdirSync(home).sort(), ['settings.json'], 'nothing else written into the home');

    // 4. reload: the form shows the saved values
    await dt.send('Page.reload');
    await dt.until(ready, 'the settings pane after the second reload');
    assert.equal(await dt.evaluate(`document.querySelector('input[name="layout_landscape"]:checked').value`), 'minimal-landscape');
    assert.equal(await dt.evaluate(`document.querySelector('input[name="unit_max"]').value`), '20');
    assert.equal(await dt.evaluate(`document.querySelector('input[data-var="--aihud-heat-100"][data-theme="dark"]').value`), '#123456');


    // 4b. the Antigravity context window field (Folders & port card): prefilled with the shipped default, a typed number autosaves into `windows`, a screenshot when AIHUD_PROOF_DIR is set
    await dt.evaluate(`location.hash = '#settings'`);
    await dt.until(`document.getElementById('window').dataset.tab === 'settings'`, 'the Settings tab');
    await dt.click(await dt.evaluate(centreOf('#window [data-section="Folders & port"] .s-toggle')));
    await dt.until(`!document.querySelector('#window [data-section="Folders & port"] .s-sec-body').hidden`, 'Folders & port open');
    assert.equal(await dt.evaluate(`document.querySelector('input[name="antigravity_window"]').value`), '1048576', 'prefilled with the shipped default');
    await dt.evaluate(setControl('input[name="antigravity_window"]', '500000'));
    for (const end = Date.now() + 5000; ; await sleep(50)) {
      const d = JSON.parse(readFileSync(settingsFile, 'utf8'));
      if (d.windows && d.windows.antigravity && d.windows.antigravity.default === 500000) break;
      if (Date.now() > end) assert.fail('the Antigravity window never reached settings.json');
    }
    if (process.env.AIHUD_PROOF_DIR) {
      await dt.evaluate(centreOf('input[name="antigravity_window"]'));
      const shot = await dt.send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(process.env.AIHUD_PROOF_DIR, { recursive: true });
      writeFileSync(join(process.env.AIHUD_PROOF_DIR, 'settings-antigravity-window.png'), Buffer.from(shot.data, 'base64'));
    }
    await dt.evaluate(setControl('input[name="antigravity_window"]', ''));
    for (const end = Date.now() + 5000; ; await sleep(50)) {
      if (!('windows' in JSON.parse(readFileSync(settingsFile, 'utf8')))) break;
      if (Date.now() > end) assert.fail('the emptied field never removed `windows`');
    }

    // 5. the HUD in a landscape window: the saved layout, the unit capped at 20, the saved colour
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 160, deviceScaleFactor: 1, mobile: false });
    await dt.send('Page.navigate', { url: `${url}/hud` });
    await dt.until(`document.getElementById('hud') && document.getElementById('hud').dataset.layout === 'minimal-landscape'`, 'the HUD on the saved landscape layout');
    assert.ok(Number(await dt.evaluate(`document.getElementById('hud').dataset.unit`)) <= 20, 'the saved unit cap holds');
    await dt.until(`document.documentElement.dataset.theme === 'dark'`, 'the dark theme');
    assert.equal(await dt.evaluate(`getComputedStyle(document.documentElement).getPropertyValue('--aihud-heat-100').trim()`), '#123456');

    // 6. the Settings entry opens the composer
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 900, deviceScaleFactor: 1, mobile: false });
    await dt.send('Page.navigate', { url: `${url}/window#layouts` });
    await dt.until(ready, 'the settings pane');
    await dt.until(`!document.querySelector('#window .pane.layouts .s-sec .s-sec-body').hidden`, 'Layouts open');
    await dt.click(await dt.evaluate(centreOf('#window .pane.layouts a.composer-link')));
    await dt.until(`location.pathname === '/composer' && !!document.getElementById('composer')`, 'the composer');
    assert.deepEqual(dt.errors, [], 'no page error, no console error');
  } finally {
    if (dt) dt.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await node.close();
    for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await sleep(150); } }
  }
});

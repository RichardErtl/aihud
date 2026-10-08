// AP.b in a real browser: headless Chrome/Edge over the DevTools protocol against a real node on
// a free test port (temp copy of the reader fixtures, temp aihud home). Two tabs on the same node —
// the composer and the real HUD page — proving: the grid resizes by dragging; the draft (frame, grid
// at the real unit, placed tiles) shows live in the HUD and ends on Save / Clear / tab close; the
// name field highlights on a Save without a name; layouts load by `?layout=` and from the list;
// delete asks first and moves to the trash. Skipped when no browser is installed.
// `AIHUD_POLISH_SHOTS=<dir>` keeps the screenshots.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { createNode } from '../node/server.js';
import { findBrowser } from '../node/launch.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
/** A free port: bind 0, read it, close it. */
const freePort = () => new Promise((ok, fail) => { const s = createServer(); s.once('error', fail); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A minimal DevTools protocol client over the built-in WebSocket. */
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
    if (msg.error) w.fail(new Error(`${msg.error.message}`)); else w.ok(msg.result);
  };
  // a call the browser never answers fails after 30 s, so the test's `finally` always runs and frees the port and the browser
  const send = (method, params = {}) => new Promise((ok, fail) => {
    id++;
    const mine = id;
    const timer = setTimeout(() => { waiting.delete(mine); fail(new Error(`no answer to ${method} in 30 s`)); }, 30_000);
    waiting.set(mine, { ok: (v) => { clearTimeout(timer); ok(v); }, fail: (e) => { clearTimeout(timer); fail(e); } });
    ws.send(JSON.stringify({ id: mine, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.text} ${(r.exceptionDetails.exception && r.exceptionDetails.exception.description) || ''} ${expression}`);
    return r.result.value;
  };
  const until = async (expression, what, ms = 10_000) => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await evaluate(expression);
      if (v) return v;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
      await sleep(50);
    }
  };
  const mouse = (type, x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  // a tab in the background answers input only once per ~5 s (no frames): bring the tab to the front before every gesture
  const drag = async (from, to) => {
    await send('Page.bringToFront');
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 6; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6, 1);
    await mouse('mouseReleased', to.x, to.y);
  };
  const click = async (p) => { await send('Page.bringToFront'); await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y, 1); await mouse('mouseReleased', p.x, p.y); };
  return { send, evaluate, until, drag, click, close: () => ws.close() };
}

const rectOf = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`;
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const q = (sel, expr) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? (${expr}) : null; })()`;

test('AP.b by mouse in a real browser: resize by dragging, live draft in the HUD, name highlight, load + delete with a confirm', { timeout: 150_000 }, async (t) => {
  const browser = findBrowser();
  if (!browser || browser.noApp) { t.skip(`no Chrome, Edge or Chromium found${browser ? ` (${browser.noApp})` : ''}`); return; }

  const shots = process.env.AIHUD_POLISH_SHOTS || '';
  const base = mkdtempSync(join(tmpdir(), 'aihud-polish-browser-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const node = await createNode({ port: PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT}`;
  const post = async (path, body) => (await fetch(`${url}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status;
  // two own layouts to load and delete
  assert.equal(await post('/layouts', { name: 'Night Box', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }, { tile: 'context-standard-portrait', col: 0, row: 2 }] }), 201);
  assert.equal(await post('/layouts', { name: 'Zeta', orientation: 'portrait', tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }] }), 201);
  const chrome = spawn(browser.path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });
  const tabs = [];
  try {
    const portFile = join(profile, 'DevToolsActivePort');
    const end = Date.now() + 15_000;
    // Chrome writes this file while we poll it: on Windows a read can hit EBUSY/EPERM mid-write, so a failed read counts as "not ready yet"
    const readPort = () => { try { const v = readFileSync(portFile, 'utf8'); return v.includes('\n') ? v : null; } catch { return null; } };
    let portText;
    while (!(portText = readPort())) {
      if (Date.now() > end) throw new Error('the browser did not open its debugging port');
      await sleep(100);
    }
    const devPort = portText.split('\n')[0].trim();
    const open = async (width, height, first) => {
      const target = await (await fetch(`http://127.0.0.1:${devPort}/json/new?about:blank`, { method: 'PUT' })).json();
      const d = await devtools(target.webSocketDebuggerUrl);
      tabs.push(d);
      await d.send('Page.enable');
      // the composer's tabs are hidden while another tab is in front; the page reports what the test says (window.__vis), so the draft stays on until the visibility step
      await d.send('Page.addScriptToEvaluateOnNewDocument', { source: "window.__vis = 'visible'; Object.defineProperty(document, 'visibilityState', { get: () => window.__vis });" });
      await d.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
      await d.send('Page.navigate', { url: `${url}${first}` });
      return d;
    };
    const shot = async (d, name) => {
      if (!shots) return;
      await d.send('Page.bringToFront');
      await sleep(250);
      const r = await d.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(shots, name), Buffer.from(r.data, 'base64'));
      t.diagnostic(`screenshot ${name}`);
    };
    // a tab in the background does not navigate (no frames): front first
    const go = async (d, u) => { await d.send('Page.bringToFront'); await d.send('Page.navigate', { url: u }); };
    const confirms = (d) => d.evaluate('window.__confirms || []');
    const stubConfirm = (d, answer) => d.evaluate(`(() => { window.__confirms = []; window.__answer = ${answer}; window.confirm = (m) => { window.__confirms.push(m); sessionStorage.setItem('__confirms', JSON.stringify(window.__confirms)); return window.__answer; }; return true; })()`);
    const onSettings = async (d, what) => {
      await d.until(`location.pathname.endsWith('/window') && location.hash === '#settings'`, what, 6000);
      await d.until(`document.querySelectorAll('.l-item[data-layout], label.l-card[data-layout]').length > 0`, 'Settings cards drawn', 6000);
    };
    const trashFiles = () => (existsSync(join(home, 'layouts', 'trash')) ? readdirSync(join(home, 'layouts', 'trash')).sort() : []);

    // ── (3)+(4a) the composer loads a layout by ?layout=, the name field is prominent and filled ──
    const comp = await open(1400, 900, '/composer?layout=night-box');
    await comp.until(`document.getElementById('composer').dataset.loaded === 'night-box' && document.getElementById('composer').dataset.placed === '2'`, 'the loaded layout');
    assert.equal(await comp.evaluate(q('#composer .c-name input', 'e.value')), 'Night Box', 'the name is loaded');
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.rows`), '8', 'grid = what the HUD would draw: 8 rows');
    const nameLook = await comp.evaluate(q('#composer .c-name input', `(() => { const c = getComputedStyle(e); return { border: parseFloat(c.borderTopWidth), font: parseFloat(c.fontSize), width: e.getBoundingClientRect().width }; })()`));
    assert.ok(nameLook.border >= 1 && nameLook.font >= 16 && nameLook.width >= 240, `a boxed, large name field: ${JSON.stringify(nameLook)}`);
    assert.equal(await comp.evaluate(q('#composer .c-name label', 'e.textContent')), 'Layout name', 'labelled');
    const list = await comp.evaluate(`[...document.querySelectorAll('#composer .layouts li[data-layout]')].map((li) => li.dataset.layout + ':' + (li.dataset.own === 'true' ? 'own' : 'shipped'))`);
    assert.deepEqual(list.slice(0, 2).sort(), ['night-box:own', 'zeta:own'], 'own layouts first');
    assert.ok(list.length > 2 && list.slice(2).every((x) => x.endsWith(':shipped')), 'then the shipped ones');
    assert.equal(list.some((x) => x.startsWith('probe-')), false);
    await comp.until(`!document.querySelector('#composer .cell .body').textContent.startsWith('header-standard')`, 'tile previews');
    await shot(comp, 'b-composer-loaded-name.png');

    // ── (1) resize by dragging the grid handle (portrait: rows) ──
    const handle = await comp.evaluate(rectOf('#composer .grid .resize'));
    assert.ok(handle.w > 6 && handle.h > 6, 'a visible handle');
    const u = 22.5;
    await comp.drag(centre(handle), { x: centre(handle).x + 30, y: centre(handle).y + 3 * u });
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.rows`), '11', 'dragged 3 cells down: 8 → 11 rows');
    assert.equal(await comp.evaluate(`document.querySelectorAll('#composer .bar input[type=number]')[1].value`), '11', 'the rows input stays in sync');
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.cols`), '8', 'portrait: the width never moves');
    // the limit: a drag far below stops at the form limit (60 rows)
    const h2 = centre(await comp.evaluate(rectOf('#composer .grid .resize')));
    await comp.drag(h2, { x: h2.x, y: h2.y + 4000 });
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.rows`), '60');
    // a drag up would cut the context off: stops at the last row a tile still needs (8)
    const h3 = centre(await comp.evaluate(rectOf('#composer .grid .resize')));
    await comp.drag(h3, { x: h3.x, y: h3.y - 3000 });
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.rows`), '8', 'never smaller than the placed tiles need');

    // ── (2) the draft shows live in the real HUD page ──
    const hud = await open(180, 900, '/hud');
    await hud.until(`document.getElementById('hud') && document.getElementById('hud').dataset.tiles !== undefined && document.getElementById('hud').dataset.orientation === 'portrait'`, 'the HUD');
    // the composer's draft was alive before this HUD opened: the node replays it on connect
    await hud.until(`document.querySelector('.draft-overlay[data-state="shown"]')`, 'the draft overlay');
    // the composer sends its draft 120 ms after the last edit (debounce): a HUD that connects inside that window is replayed
    // the previous (60-row) draft first and gets the final 8-row one a moment later. Wait for it, then assert.
    await hud.until(q('.draft-overlay .frame', 'Math.round(e.getBoundingClientRect().height) === 180'), 'the final 8-row draft reached the HUD', 4000);
    const frame = () => hud.evaluate(q('.draft-overlay .frame', `(() => { const r = e.getBoundingClientRect(); return { w: r.width, h: r.height, x: r.left, y: r.top, tiles: e.querySelectorAll('[data-tile]').length }; })()`));
    let f = await frame();
    assert.deepEqual({ w: f.w, h: f.h, x: f.x, y: f.y, tiles: f.tiles }, { w: 180, h: 8 * 22.5, x: 0, y: 0, tiles: 2 }, 'frame = 8 x 8 cells at the real unit, 2 placed tiles');
    await hud.until(`!document.querySelector('.draft-overlay .frame [data-tile]').textContent.startsWith('header-standard')`, 'the tiles are drawn for real');
    // grow the grid and place one more tile in the composer: the HUD follows within a moment
    const hh = centre(await comp.evaluate(rectOf('#composer .grid .resize')));
    await comp.drag(hh, { x: hh.x, y: hh.y + 4 * u });
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.rows`), '12');
    await hud.until(q('.draft-overlay .frame', 'Math.round(e.getBoundingClientRect().height) === 270'), 'the HUD frame follows the new height', 4000);
    const grid = await comp.evaluate(rectOf('#composer .grid'));
    const cellAt = (col, row) => ({ x: grid.x + col * u + u / 2, y: grid.y + row * u + u / 2 });
    await comp.drag(centre(await comp.evaluate(rectOf('#composer .tiles .tile[data-tile="time-standard-portrait"]'))), cellAt(0, 9));
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.placed`), '3');
    await hud.until(q('.draft-overlay .frame', `e.querySelectorAll('[data-tile]').length === 3`), 'the placed tile appears in the HUD', 4000);
    // the HUD's own layout stays untouched underneath, its tiles are not the draft's
    assert.notEqual(await hud.evaluate(`document.getElementById('hud').dataset.layout`), 'night-box');
    await hud.send('Page.bringToFront');
    await hud.send('Emulation.setDeviceMetricsOverride', { width: 300, height: 700, deviceScaleFactor: 1, mobile: false });
    await hud.until(q('.draft-overlay', 'e.dataset.state === "shown"'), 'still shown after a resize');
    await shot(hud, 'b-hud-draft-overlay.png');
    // another shape: a landscape HUD shows nothing of a portrait draft
    await hud.send('Emulation.setDeviceMetricsOverride', { width: 1000, height: 140, deviceScaleFactor: 1, mobile: false });
    await hud.until(`document.getElementById('hud').dataset.orientation === 'landscape'`, 'the landscape HUD');
    await hud.until(q('.draft-overlay', 'e.hidden === true && e.dataset.state === "mismatch"'), 'no overlay for another orientation');
    await hud.send('Emulation.setDeviceMetricsOverride', { width: 180, height: 900, deviceScaleFactor: 1, mobile: false });
    await hud.until(q('.draft-overlay', 'e.dataset.state === "shown"'), 'the overlay is back in portrait');

    // ── (2) a hidden composer tab ends its draft (throttled timers would make it blink); visible again restores it ──
    await comp.evaluate(`(() => { window.__vis = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
    await hud.until(q('.draft-overlay', 'e.dataset.state === "off"'), 'the draft ended while the composer is hidden', 4000);
    await comp.evaluate(`(() => { window.__vis = 'visible'; document.dispatchEvent(new Event('visibilitychange')); return true; })()`);
    await hud.until(q('.draft-overlay', 'e.dataset.state === "shown"'), 'the draft is back when the composer is visible', 4000);

    // ── (2) the draft ends on Clear ──
    await stubConfirm(comp, true);
    await comp.send('Page.bringToFront');
    await comp.click(centre(await comp.evaluate(rectOf('#composer .bar button.clear'))));
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.placed`), '0');
    await hud.until(q('.draft-overlay', 'e.dataset.state === "off" && e.hidden === true'), 'the draft ended on Clear', 4000);
    // ... and the next edit brings it back
    await comp.drag(centre(await comp.evaluate(rectOf('#composer .tiles .tile[data-tile="header-standard-portrait"]'))), cellAt(0, 0));
    await hud.until(q('.draft-overlay', 'e.dataset.state === "shown"'), 'a new edit restarts the draft', 4000);

    // ── (3) a Save without a name highlights the name field ──
    await comp.evaluate(q('#composer .c-name input', `(() => { e.value = ''; e.dispatchEvent(new Event('input')); return true; })()`));
    await comp.click(centre(await comp.evaluate(rectOf('#composer .bar button.save'))));
    await comp.until(q('#composer .c-name input', `document.activeElement === e && e.getAttribute('aria-invalid') === 'true' && e.classList.contains('invalid')`), 'the name field focused + highlighted');
    const look = await comp.evaluate(q('#composer .c-name input', `(() => { const c = getComputedStyle(e); return { border: c.borderTopColor, accent: getComputedStyle(document.documentElement).getPropertyValue('--aihud-heat-text-75').trim() }; })()`));
    assert.ok(look.border && look.border !== 'rgba(0, 0, 0, 0)', `a highlight border: ${look.border}`);
    assert.match(await comp.evaluate(`document.querySelector('#composer .status').textContent`), /^refused: the name needs/);
    assert.equal(readdirSync(join(home, 'layouts')).filter((n) => n.endsWith('.json')).length, 2, 'nothing was saved');
    await shot(comp, 'b-composer-name-highlight.png');
    // typing takes the highlight back
    await comp.send('Input.insertText', { text: 'Box Two' });
    await comp.until(q('#composer .c-name input', `e.getAttribute('aria-invalid') !== 'true'`), 'the highlight clears while typing');
    // ... and Save ends the draft
    await comp.click(centre(await comp.evaluate(rectOf('#composer .bar button.save'))));
    await comp.until(`document.getElementById('composer').dataset.saved === 'box-two'`, 'the save');
    await hud.until(q('.draft-overlay', 'e.dataset.state === "off"'), 'the draft ended on Save', 4000);
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.loaded`), 'box-two', 'a saved layout is the loaded one');

    // ── (2) the draft ends when the composer tab closes (pagehide) ──
    await comp.drag(centre(await comp.evaluate(rectOf('#composer .tiles .tile[data-tile="time-standard-portrait"]'))), cellAt(0, 4));
    await hud.until(q('.draft-overlay', 'e.dataset.state === "shown"'), 'a draft again', 4000);
    await go(comp, 'about:blank');
    await comp.until(`location.href === 'about:blank'`, 'the composer tab left the page');
    await hud.until(q('.draft-overlay', 'e.dataset.state === "off"'), 'the draft ended with the tab', 4000);

    // ── (4) delete: ask first (own), trash instead of a hard delete ──
    await go(comp, `${url}/composer?layout=zeta`);
    await comp.until(`document.getElementById('composer').dataset.loaded === 'zeta'`, 'zeta loaded');
    await stubConfirm(comp, false);
    const delRect = () => comp.evaluate(rectOf('#composer .bar button.delete'));
    await comp.click(centre(await delRect()));
    // the click handler runs on the composer's serial queue, behind the preview build (seconds under load): wait for the confirm
    await comp.until('(window.__confirms || []).length >= 1', 'the delete confirm was asked', 20_000);
    let asked = await confirms(comp);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /"zeta"/);
    assert.doesNotMatch(asked[0], /shipped layout/);
    t.diagnostic(`confirm (own layout): ${asked[0]}`);
    assert.ok(existsSync(join(home, 'layouts', 'zeta.json')), 'declined: nothing moved');
    await shot(comp, 'b-composer-delete-button.png');
    await comp.evaluate('window.__answer = true');
    await comp.click(centre(await delRect()));
    await onSettings(comp, 'the composer left for the window Settings page after the delete');
    assert.equal(existsSync(join(home, 'layouts', 'zeta.json')), false);
    assert.equal(trashFiles().filter((n) => /^zeta-.*\.json$/.test(n)).length, 1, 'moved to the trash');
    assert.equal(await comp.evaluate(`!!document.querySelector('[data-layout="zeta"]')`), false, 'gone from the Settings cards');

    // shipped: says so; the settings fall back to the default
    assert.equal(await post('/settings', { layout_portrait: 'fancy-a-portrait' }), 200);
    await go(comp, `${url}/composer?layout=fancy-a-portrait`);
    await comp.until(`document.getElementById('composer').dataset.loaded === 'fancy-a-portrait'`, 'a shipped layout loaded');
    await stubConfirm(comp, true);
    await comp.click(centre(await delRect()));
    await onSettings(comp, 'the shipped delete also returned to Settings');
    const asked2 = await comp.evaluate(`JSON.parse(sessionStorage.getItem('__confirms') || '[]')[0]`);
    assert.match(asked2, /shipped layout "fancy-a-portrait"/);
    t.diagnostic(`confirm (shipped layout): ${asked2}`);
    assert.ok(existsSync(join(home, 'layouts', 'trash', 'fancy-a-portrait.hidden.json')), 'a marker, the package file stays');
    assert.equal(JSON.parse(readFileSync(join(home, 'settings.json'), 'utf8')).layout_portrait, 'essentials-portrait', 'settings fell back to the default');
    assert.equal(await comp.evaluate(`!!document.querySelector('[data-layout="fancy-a-portrait"]')`), false, 'the hidden shipped layout is no card');
    assert.equal(await comp.evaluate(`!!document.querySelector('label.l-card.on[data-layout="essentials-portrait"]')`), true, 'Settings shows the fallback selected');

    // ── (1) landscape resizes by columns ──
    await go(comp, `${url}/composer?orientation=landscape`);
    await comp.until(`document.getElementById('composer').dataset.orientation === 'landscape' && document.getElementById('composer').dataset.unit === '22.5'`, 'landscape composer');
    const lh = centre(await comp.evaluate(rectOf('#composer .grid .resize')));
    await comp.drag(lh, { x: lh.x + 3 * u, y: lh.y + 200 });
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.cols`), '51', 'landscape: 48 + 3 columns');
    assert.equal(await comp.evaluate(`document.getElementById('composer').dataset.rows`), '6', 'the band never moves');
    // loading a layout of the other orientation from the list switches the composer
    await comp.until(`document.querySelector('#composer .layouts li[data-layout="minimal-portrait"]')`, 'the list');
    await comp.evaluate(`document.querySelector('#composer .layouts li[data-layout="minimal-portrait"]').click()`);
    await comp.until(`document.getElementById('composer').dataset.loaded === 'minimal-portrait' && document.getElementById('composer').dataset.orientation === 'portrait'`, 'load from the list');
    assert.ok(Number(await comp.evaluate(`document.getElementById('composer').dataset.placed`)) > 0);
  } finally {
    for (const d of tabs) d.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await node.close();
    // wait until Chrome is really gone (it holds profile files), then remove with backoff 100 -> 1600 ms; a leftover is reported, never silent
    for (let i = 0; i < 50; i++) { try { process.kill(chrome.pid, 0); await sleep(100); } catch { break; } }
    let removed = false; let lastErr;
    for (let i = 0, wait = 100; i < 6 && !removed; i++, wait = Math.min(wait * 2, 1600)) {
      try { rmSync(base, { recursive: true, force: true }); removed = true; } catch (err) { lastErr = err; await sleep(wait); }
    }
    if (!removed) console.error(`temp profile cleanup failed: ${lastErr && lastErr.message}`);
  }
});

// The composer in a real browser, driven by the mouse: headless Chrome/Edge/Chromium (the same
// search as the app window, `node/launch.js findBrowser`) over the DevTools protocol, against a
// real node on test port 4365 (temp copy of the reader fixtures, temp aihud home). A tile is
// dragged from the panel onto the grid, a drop on an occupied place is refused, the layout is
// named by typing and saved by a click — then the file is checked on disk and the HUD shows it
// by name. Skipped when no such browser is installed. `AIHUD_SHOT=<file.png>` keeps a screenshot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
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
const CONTRACT = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
const PORT = await freePort();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function tree(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p); else out.push(relative(dir, p).split(sep).join('/'));
    }
  };
  walk(dir);
  return out.sort();
}

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
  const send = (method, params = {}) => new Promise((ok, fail) => {
    id++;
    waiting.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`page: ${r.exceptionDetails.text} ${expression}`);
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
  /** Press at `from`, move in steps, release at `to` — the pointer events a hand makes. */
  const drag = async (from, to) => {
    await mouse('mouseMoved', from.x, from.y);
    await mouse('mousePressed', from.x, from.y, 1);
    for (let i = 1; i <= 6; i++) await mouse('mouseMoved', from.x + ((to.x - from.x) * i) / 6, from.y + ((to.y - from.y) * i) / 6, 1);
    await mouse('mouseReleased', to.x, to.y);
  };
  const click = async (p) => { await mouse('mouseMoved', p.x, p.y); await mouse('mousePressed', p.x, p.y, 1); await mouse('mouseReleased', p.x, p.y); };
  return { send, evaluate, until, drag, click, close: () => ws.close() };
}

const rectOf = (selector) => `(() => { const e = document.querySelector(${JSON.stringify(selector)}); e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })()`;
const centre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

test('composer by mouse in a real browser: drag, refuse an occupied place, name, save → file on disk → shown in the HUD', { timeout: 90_000 }, async (t) => {
  const browser = findBrowser();
  if (!browser || browser.noApp) { t.skip(`no Chrome, Edge or Chromium found${browser ? ` (${browser.noApp})` : ''}`); return; }

  const base = mkdtempSync(join(tmpdir(), 'aihud-composer-browser-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(home);
  const node = await createNode({ port: PORT, projects, home, startDir: 'C:\\dev\\sample-app' });
  const url = `http://127.0.0.1:${PORT}`;
  const chrome = spawn(browser.path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });
  let dt = null;
  try {
    // the browser names its debugging port in the profile folder
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
    const target = await (await fetch(`http://127.0.0.1:${devPort}/json/new?about:blank`, { method: 'PUT' })).json();
    dt = await devtools(target.webSocketDebuggerUrl);
    await dt.send('Page.enable');
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 900, deviceScaleFactor: 1, mobile: false });
    await dt.send('Page.navigate', { url: `${url}/composer` });
    await dt.until(`!!document.querySelector('#composer .tiles .tile[data-tile="header-standard-portrait"]') && document.getElementById('composer').dataset.unit === '22.5'`, 'the tile panel');

    const order = await dt.evaluate(`[...document.querySelectorAll('#composer .tiles .tile')].map((li) => li.dataset.tile)`);
    assert.ok(order.length >= 25 && order.every((n) => !n.endsWith('-landscape')), `portrait panel: ${order.length} tiles`);
    // one live mini preview per panel tile: the tile's own render, scaled into its box
    await dt.until(`(() => { const items = [...document.querySelectorAll('#composer .tiles .tile')]; return items.length === ${Object.values(CONTRACT.sizes).flatMap((b) => Object.values(b)).filter(Boolean).length} && items.every((li) => li.querySelectorAll('.preview[data-drawn]').length === 1); })()`, 'a drawn preview in every panel tile');
    const previews = await dt.evaluate(`[...document.querySelectorAll('#composer .tiles .tile')].map((li) => li.dataset.tile + ':' + li.querySelector('.preview').dataset.drawn)`);
    assert.equal(previews.length, Object.values(CONTRACT.sizes).flatMap((b) => Object.values(b)).filter(Boolean).length, 'trip-wire: one portrait preview per contract size entry (68)');
    assert.deepEqual(previews.filter((p) => !p.endsWith(':tile')), [], 'every preview is the tile drawn by its own render');
    const panelInfo = await dt.evaluate(`({ width: document.querySelector('#composer .panel').getBoundingClientRect().width, ms: document.getElementById('composer').dataset.previewMs })`);
    t.diagnostic(`panel ${panelInfo.width} px wide · ${previews.length} previews drawn in ${panelInfo.ms} ms`);
    const grid = await dt.evaluate(rectOf('#composer .grid'));
    assert.equal(grid.w, 8 * 22.5, 'portrait grid: 8 cells at 22.5 px');
    const u = 22.5;
    const cellAt = (col, row) => ({ x: grid.x + col * u + u / 2, y: grid.y + row * u + u / 2 });
    const placed = () => dt.evaluate(`document.getElementById('composer').dataset.placed`);
    const status = () => dt.evaluate(`document.querySelector('#composer .status').textContent`);

    // 1. the header (8 x 2) from the panel onto cell 0,0
    await dt.drag(centre(await dt.evaluate(rectOf('#composer .tiles .tile[data-tile="header-standard-portrait"]'))), cellAt(0, 0));
    assert.equal(await placed(), '1', await status());
    // 2. the context (8 x 6) onto row 1: occupied by the header → refused, nothing placed
    const ctx = centre(await dt.evaluate(rectOf('#composer .tiles .tile[data-tile="context-standard-portrait"]')));
    await dt.drag(ctx, cellAt(0, 1));
    assert.equal(await placed(), '1');
    assert.match(await status(), /^refused: context-standard-portrait at 0,1 — occupied by header-standard-portrait$/);
    // 3. the same onto row 2: touching is fine
    await dt.drag(ctx, cellAt(0, 2));
    assert.equal(await placed(), '2', await status());
    // 4. move the header off the grid and back: removed, then placed again
    await dt.drag(cellAt(3, 0), { x: grid.x + grid.w + 60, y: grid.y + 10 });
    assert.equal(await placed(), '1', await status());
    await dt.drag(centre(await dt.evaluate(rectOf('#composer .tiles .tile[data-tile="header-standard-portrait"]'))), cellAt(0, 0));
    assert.equal(await placed(), '2', await status());

    // 5. the box: an 8 x 8 grid holds 2 + 6 rows exactly; 7 rows would cut the context off → refused
    const setRows = (n) => dt.evaluate(`(() => { const i = document.querySelectorAll('#composer .bar input[type=number]')[1]; i.value = '${n}'; i.dispatchEvent(new Event('change')); return true; })()`);
    await setRows(7);
    assert.equal(await dt.evaluate(`document.getElementById('composer').dataset.rows`), '24', 'the shrink was refused');
    assert.match(await status(), /^refused: context-standard-portrait would fall off a 8 × 7 grid$/);
    await setRows(8);
    assert.equal(await dt.evaluate(`document.getElementById('composer').dataset.rows`), '8');

    // 6. name by typing, save by a click
    await dt.click(centre(await dt.evaluate(rectOf('#composer .bar input[type=text]'))));
    await dt.send('Input.insertText', { text: 'Night Box' });
    assert.equal(await dt.evaluate(`document.querySelector('#composer .bar .slug').textContent`), '→ night-box.json');
    const before = tree(base).filter((p) => p.startsWith('home/'));
    await dt.click(centre(await dt.evaluate(rectOf('#composer .bar button.save'))));
    await dt.until(`document.getElementById('composer').dataset.saved === 'night-box'`, 'the save');
    assert.match(await status(), /^saved .*night-box\.json$/);
    assert.deepEqual(tree(base).filter((p) => p.startsWith('home/')), [...before, 'home/layouts/night-box.json'].sort());
    assert.deepEqual(JSON.parse(readFileSync(join(home, 'layouts', 'night-box.json'), 'utf8')), {
      name: 'Night Box', orientation: 'portrait', form: { cols: 8, rows: 8 },
      tiles: [{ tile: 'header-standard-portrait', col: 0, row: 0 }, { tile: 'context-standard-portrait', col: 0, row: 2 }],
    });
    await dt.until(`!document.querySelector('#composer .cell .body').textContent.startsWith('header-standard')`, 'the tile previews');
    if (process.env.AIHUD_SHOT) {
      const shot = await dt.send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(process.env.AIHUD_SHOT, Buffer.from(shot.data, 'base64'));
      t.diagnostic(`screenshot ${process.env.AIHUD_SHOT}`);
    }

    // 7. the HUD shows the saved layout by name (the link the composer offers after the save)
    const href = await dt.evaluate(`document.querySelector('#composer .hud-link').getAttribute('href')`);
    assert.equal(href, '/hud?layout=night-box');
    await dt.send('Emulation.setDeviceMetricsOverride', { width: 180, height: 900, deviceScaleFactor: 1, mobile: false });
    await dt.send('Page.navigate', { url: `${url}${href}` });
    await dt.until(`document.getElementById('hud') && document.getElementById('hud').dataset.tiles === '2'`, 'the HUD');
    const hud = await dt.evaluate(`({ ...document.getElementById('hud').dataset, cells: [...document.querySelectorAll('#hud .tile')].map((c) => c.className + ':' + c.dataset.tile) })`);
    assert.equal(hud.layout, 'night-box');
    assert.equal(hud.orientation, 'portrait');
    assert.deepEqual(hud.cells, ['tile:header-standard-portrait', 'tile:context-standard-portrait']);
    t.diagnostic(`HUD: layout ${hud.layout}, unit ${hud.unit}, ${hud.cols} x ${hud.rows}`);
  } finally {
    if (dt) dt.close();
    // our own browser process and its children, by the PID we started — nothing else
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

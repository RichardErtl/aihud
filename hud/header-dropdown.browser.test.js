// The session-switch list of the pilot pair header-standard-{portrait,landscape} in a real browser (headless
// Chrome/Edge/Chromium over the DevTools protocol, a real node on a free test port, the fixture sessions plus one
// session with a long folder name and one with a long sidecar title). Per window width (240 and 340 px, portrait,
// dark): a click 3 px to the left of the session id (inside the trigger's padding) opens the list; every session
// row has two lines (id left + time right, label below) and is about 36 px * zoom tall; the long label is cut at
// the START ("…" visible, end of the text readable) and keeps its full text in title=; the list sits inside the
// window (left >= 4*zoom, right <= width - 4*zoom, never wider than width - 8*zoom).
// AIHUD_PROOF_DIR=<folder> additionally writes a screenshot with the list open. Skipped when no browser is installed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, setPriority, constants } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as netServer } from 'node:net';
import { createNode } from '../node/server.js';
import { findBrowser } from '../node/launch.js';

// Inline on purpose: the aihud package imports nothing from outside (fence test).
const freePort = () => new Promise((ok, no) => {
  const s = netServer();
  s.on('error', no);
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); });
});
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROOF = process.env.AIHUD_PROOF_DIR || '';
const noBrowser = () => { const b = findBrowser(); return !b || b.noApp ? `no Chrome, Edge or Chromium found${b ? ` (${b.noApp})` : ''}` : ''; };
const LONG_DIR = 'C--dev-work-trees-agent-ad063d45dc5960406-aihud-tiles-header';   // slug that cannot fit one row
const LONG_TITLE = 'Dropdown umbauen: zweizeilige Liste, Label am Anfang gekuerzt, Pfadende bleibt sichtbar';
const COPY_ID = 'b7e1c4d9-3a52-4f60-8d17-9c2e5a0b6f41';

async function devtoolsPort(profile) {
  for (const end = Date.now() + 45_000; Date.now() < end; await sleep(100)) {
    try { const text = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8'); if (text.includes('\n')) return text.split('\n')[0].trim(); } catch { /* not there yet */ }
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
      if (await evaluate(expression)) return;
      if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    }
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
  };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); };
  return { send, evaluate, until, click, shot, close: () => ws.close() };
}

async function startKit({ port, width, height, tiles }) {
  const base = mkdtempSync(join(tmpdir(), 'aihud-dd-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  // a copy of a fixture session under a long folder name, and a sidecar title with a long text for the other one
  const sample = join(projects, 'c--dev-sample-app');
  mkdirSync(join(projects, LONG_DIR));
  cpSync(join(sample, '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10.jsonl'), join(projects, LONG_DIR, `${COPY_ID}.jsonl`));
  mkdirSync(join(home, 'layouts'), { recursive: true });
  mkdirSync(join(home, 'sessions'));
  writeFileSync(join(home, 'sessions', 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36.json'), JSON.stringify({ title: LONG_TITLE }));
  // one one-tile layout per tile, picked per run by /hud?layout=<name> (a named layout stands for both window shapes)
  for (const tile of tiles) writeFileSync(join(home, 'layouts', `dd-${tile}.json`), JSON.stringify({ name: `dd ${tile}`, orientation: 'portrait', tiles: [{ tile, col: 0, row: 0 }] }));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ welcome_seen: true, theme: 'dark', layout_portrait: `dd-${tiles[0]}`, layout_landscape: `dd-${tiles[0]}` }));
  const node = await createNode({ port, projects, home, startDir: 'C:\\dev\\sample-app' });
  const chrome = spawn(findBrowser().path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-gpu', '--disable-software-rasterizer', '--window-position=-30000,-30000', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
  // low priority for this file's own processes (Chrome and the in-process node): the other browser tests of the suite keep their timing
  for (const pid of [chrome.pid, process.pid]) { try { setPriority(pid, constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* not allowed: keep the default */ } }
  let dt = null;
  const stop = async () => {
    if (dt) dt.close();
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    else chrome.kill('SIGKILL');
    await node.close();
    for (let i = 0; i < 20; i++) { try { rmSync(base, { recursive: true, force: true }); break; } catch { await sleep(150); } }
  };
  try {
    const target = await (await fetch(`http://127.0.0.1:${await devtoolsPort(profile)}/json/new?about:blank`, { method: 'PUT' })).json();
    dt = await devtools(target.webSocketDebuggerUrl);
    await dt.send('Page.enable');
    await dt.send('Runtime.enable');
    await dt.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  } catch (e) { await stop(); throw e; }
  return { dt, url: `http://127.0.0.1:${port}`, stop };
}

const MEASURE = `(() => {
  const list = document.querySelector('[role=listbox]');
  const idOf = (b) => (b.hasAttribute('data-session-id') ? b.getAttribute('data-session-id') : b.getAttribute('data-session'));
  const r = list.getBoundingClientRect();
  const rows = [...list.querySelectorAll('[role=option]')].map((b) => {
    const br = b.getBoundingClientRect(), lab = b.querySelector('[data-label]');
    const spans = [...b.children];
    return { id: idOf(b), h: br.height, lines: spans.length, l1: spans[0] ? spans[0].textContent : '',
      label: lab ? lab.getAttribute('title') : null, shown: lab ? lab.firstChild.textContent : null,
      cut: lab ? lab.scrollWidth > lab.clientWidth : null,
      // the inner text's right edge sits at the label box's right edge when cut at the start, its left edge is clipped
      innerL: lab ? lab.firstChild.getBoundingClientRect().left - lab.getBoundingClientRect().left : null,
      innerR: lab ? lab.getBoundingClientRect().right - lab.firstChild.getBoundingClientRect().right : null,
      l1Cut: spans[0] ? [...spans[0].children].some((c) => c.scrollWidth > c.clientWidth) : null,
      bw: br.width };
  });
  return { l: r.left, r: r.right, w: r.width, t: r.top, b: r.bottom, vw: document.documentElement.clientWidth, vh: innerHeight, rows,
    open: list.matches(':popover-open') || list.isConnected };
})()`;

// the trigger of every session-switch tile: a button with aria-haspopup, the glance chip, or (minimal) a span with role=button
const TRIGGER = '[aria-haspopup=listbox],[data-session-switch],[role=button][tabindex]';
// all 20 tiles that carry the list: the pilot pair at 240 and 340 px, the other 18 at 240 px
const TILES = ['header-standard-portrait', 'header-standard-landscape', 'header-minimal-portrait', 'header-minimal-landscape',
  'header-fancy-a-portrait', 'header-fancy-a-landscape', 'header-essentials-portrait', 'header-essentials-landscape',
  'header-splitflap-portrait', 'header-splitflap-landscape',
  ...['backlight', 'hairline', 'numeral', 'particle', 'relief'].flatMap((n) => [`glance-${n}-portrait`, `glance-${n}-landscape`])];
const RUNS = TILES.flatMap((tile) => (tile.startsWith('header-standard') ? [[240, tile], [340, tile]] : [[240, tile]]));
test('trip-wire: 20 session-switch tiles in the table', () => { assert.equal(TILES.length, 20); });
// ONE node and ONE Chrome for the whole file (22 fresh pairs made the concurrently running composer browser test time out)
let kitPromise = null;
const sharedKit = async () => (kitPromise ||= startKit({ port: await freePort(), width: 340, height: 520, tiles: TILES }));
after(async () => { if (kitPromise) { const k = await kitPromise.catch(() => null); if (k) await k.stop(); } });
for (const [width, tile] of RUNS) {
  test(`${tile}, window ${width}px: two-line rows, label cut at the start, list clamped into the window, real hit area`, { timeout: 90_000 }, async (t) => {
    const skip = noBrowser();
    if (skip) { t.skip(skip); return; }
    const { dt, url } = await sharedKit();
    {
      await dt.send('Emulation.setDeviceMetricsOverride', { width, height: 520, deviceScaleFactor: 1, mobile: false });
      await dt.send('Page.navigate', { url: `${url}/hud?layout=dd-${tile}` });
      await dt.until(`!!document.querySelector(${JSON.stringify(TRIGGER)})`, 'the tile with its trigger');
      await sleep(200);
      // the hit area: a click 3 px left of the id text (inside the trigger's padding) must open the list
      const spot = await dt.evaluate(`(() => { const b = document.querySelector(${JSON.stringify(TRIGGER)}), r = b.getBoundingClientRect();
        const range = document.createRange(); range.selectNodeContents(b); const tr = range.getBoundingClientRect();
        return { x: tr.left - 3, y: r.top + r.height / 2, textL: tr.left, trigL: r.left, trigW: r.width, textW: tr.width, trigH: r.height, textH: tr.height }; })()`);
      assert.ok(spot.trigW > spot.textW + 8 && spot.trigH > spot.textH + 4, `the trigger is bigger than its text: ${JSON.stringify(spot)}`);
      assert.ok(spot.x > spot.trigL, 'the probe point lies inside the trigger');
      await dt.click(spot.x, spot.y);
      await dt.until(`(() => { const l = document.querySelector('[role=listbox]'); return !!l && (l.matches(':popover-open') || (!l.hasAttribute('popover') && getComputedStyle(l).display !== 'none')); })()`, 'the list opened by a click in the padding');
      const m = await dt.evaluate(MEASURE);
      const zoom = 1.125;   // window >= 180 px: unit 22.5 (the HUD's maximum), zoom = unit / 20
      // the clamp
      assert.ok(m.l >= 4 * zoom - 0.5, `left >= 4*zoom: ${m.l}`);
      assert.ok(m.r <= m.vw - 4 * zoom + 0.5, `right <= innerWidth - 4*zoom: ${m.r} of ${m.vw}`);
      assert.ok(m.w <= m.vw - 8 * zoom + 0.5, `width <= innerWidth - 8*zoom: ${m.w} of ${m.vw}`);
      // rows
      const sessions = m.rows.filter((x) => x.id);
      assert.equal(sessions.length, 3, 'three sessions');
      assert.equal(m.rows[0].id, '', 'follow newest stays first');
      assert.equal(m.rows[0].lines, 1, 'follow newest: a single line');
      for (const s of sessions) {
        assert.equal(s.lines, 2, `${s.id}: two lines`);
        assert.ok(Math.abs(s.h - 36 * zoom) <= 3, `${s.id}: about 36*zoom tall (${s.h})`);
        assert.equal(s.l1Cut, false, `${s.id}: id and time are never cut`);
        assert.match(s.l1, /^[0-9a-f]{8}(\d\d:\d\d|\d+[smhd]|–)$/, `${s.id}: id then time (${s.l1})`);
      }
      const long = sessions.find((s) => s.label === LONG_TITLE);
      const folder = sessions.find((s) => s.label === LONG_DIR.toLowerCase() || s.label === LONG_DIR);
      assert.ok(long, 'the sidecar title is the label of its session');
      assert.ok(folder, `the project slug is the label without a title (${sessions.map((s) => s.label)})`);
      for (const s of [long, folder]) {
        assert.equal(s.cut, true, `${s.label}: too long, cut`);
        // cut at the START: the text's left part is clipped away (negative offset), its end sits flush at the right edge
        assert.ok(s.innerL < -4, `${s.label}: the beginning is clipped (${s.innerL})`);
        assert.ok(Math.abs(s.innerR) <= 1.5, `${s.label}: the end stays visible (${s.innerR})`);
        assert.equal(s.label, s.shown, 'title= carries the full label');
      }
      assert.ok(m.rows.every((x) => x.bw <= m.w), 'no row wider than the list');
      if (PROOF) { mkdirSync(PROOF, { recursive: true }); await dt.shot(join(PROOF, `dropdown-${tile}-${width}.png`)); }
    }
  });
}

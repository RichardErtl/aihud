// The HUD's tip layer in a real browser (headless Chrome/Edge/Chromium over the DevTools protocol),
// a real node on a free test port, a temp home with a PROBE tile that only carries `data-field`
// (HTML and SVG, one focusable, one unknown path, one two-path value). Four runs: dark/light x
// portrait strip (162 px wide) / landscape band (130 px high). Per run: hover shows the catalog's
// `hint` (≈ for estimated), the two-path value shows two entries, an unknown path shows none, the
// bubble stays inside the window, keyboard focus shows it, blur / Escape / leaving / a re-render
// take it away. AIHUD_PROOF_DIR=<folder> additionally writes screenshots with the tip open.
// Skipped when no browser is installed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const CATALOG = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
const row = (p) => CATALOG.fields.find((f) => f.path === p);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PROOF = process.env.AIHUD_PROOF_DIR || '';
const noBrowser = () => { const b = findBrowser(); return !b || b.noApp ? `no Chrome, Edge or Chromium found${b ? ` (${b.noApp})` : ''}` : ''; };

async function devtoolsPort(profile) {
  for (const end = Date.now() + 15_000; Date.now() < end; await sleep(100)) {
    try { const text = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8'); if (text.includes('\n')) return text.split('\n')[0].trim(); } catch { /* not there yet */ }
  }
  throw new Error('the browser did not open its debugging port');
}

async function devtools(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('devtools socket failed')); });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.method === 'Runtime.exceptionThrown') errors.push(`exception: ${msg.params.exceptionDetails.text} ${(msg.params.exceptionDetails.exception || {}).description || ''}`);
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
  const move = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
  const key = async (k) => { for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: 27 }); };
  const shot = async (file) => { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(file, Buffer.from(r.data, 'base64')); };
  return { send, evaluate, until, move, key, shot, errors, close: () => ws.close() };
}

// The probe tile: every value is a plain element with `data-field`; nothing else knows the catalog.
const PROBE_TILE = `
export const meta = { name: 'tip-probe', contentBlock: 'context', style: 'standard', orientation: 'portrait', sizes: [{ cols: 8, rows: 6 }], contractVersion: '1.1' };
export function render(el, data, size) {
  const u = size.unit;
  el.innerHTML = '<div style="position:relative;width:' + size.cols * u + 'px;height:' + size.rows * u + 'px;background:var(--aihud-panel);color:var(--aihud-text);font:13px system-ui">'
    + '<span id="est" data-field="live.instances[].context_percent" style="position:absolute;left:8px;top:8px">42%</span>'
    + '<svg width="50" height="16" style="position:absolute;left:90px;top:8px"><text id="svg" data-field="agents.subagents_started" y="13" fill="currentColor">12</text></svg>'
    + '<span id="two" data-field="session.started_at live.instances[].last_activity" style="position:absolute;left:8px;top:44px">2:05</span>'
    + '<span id="three" data-field="session.started_at live.instances[].last_activity live.instances[].tokens_total" style="position:absolute;left:8px;top:62px">3x</span>'
    + '<span id="unknown" data-field="no.such.field" style="position:absolute;left:90px;top:44px">??</span>'
    + '<span id="focus" tabindex="0" data-field="live.instances[].tokens_total" style="position:absolute;left:8px;top:80px">412k</span>'
    + '<span id="dur" data-field="turn.turns[].duration_s" style="position:absolute;right:8px;bottom:6px">3:41</span></div>';
}
`;
const layout = (orientation, n) => JSON.stringify({ name: `tip ${orientation}`, orientation, tiles: Array.from({ length: n }, (_, i) => ({ tile: 'tip-probe', col: i * 8, row: 0 })) });

async function startKit({ port, theme, width, height }) {
  const base = mkdtempSync(join(tmpdir(), 'aihud-tip-'));
  const projects = join(base, 'projects');
  const home = join(base, 'home');
  const profile = join(base, 'profile');
  cpSync(FIXTURES, projects, { recursive: true });
  mkdirSync(join(home, 'tiles'), { recursive: true });
  mkdirSync(join(home, 'layouts'));
  writeFileSync(join(home, 'tiles', 'tip-probe.js'), PROBE_TILE);
  writeFileSync(join(home, 'layouts', 'tip-portrait.json'), layout('portrait', 1));
  writeFileSync(join(home, 'layouts', 'tip-landscape.json'), layout('landscape', 3));
  writeFileSync(join(home, 'settings.json'), JSON.stringify({ welcome_seen: true, theme, layout_portrait: 'tip-portrait', layout_landscape: 'tip-landscape' }));
  const node = await createNode({ port, projects, home, startDir: 'C:\\dev\\sample-app' });
  const chrome = spawn(findBrowser().path, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore' });
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
    await dt.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await dt.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  } catch (e) { await stop(); throw e; }
  return { dt, url: `http://127.0.0.1:${port}`, stop };
}

const centre = (dt, selector, nth = 0) => dt.evaluate(`(() => { const r = document.querySelectorAll(${JSON.stringify(selector)})[${nth}].getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
const tipNow = `(() => { const t = document.querySelector('.aihud-tip'); if (!t || t.hidden) return null; const r = t.getBoundingClientRect();
  return { l: r.left, t: r.top, r: r.right, b: r.bottom, vw: document.documentElement.clientWidth, vh: innerHeight, color: getComputedStyle(t).color, bg: getComputedStyle(t).backgroundColor,
    clipped: (() => { const b = t.querySelector('.tip-body'); return b.scrollHeight > b.clientHeight; })(),
    entries: [...t.querySelectorAll('.tip-entry')].map((e) => [e.querySelector('.tip-text').textContent, e.querySelector('.tip-src').textContent, e.querySelector('.tip-unit').textContent]) }; })()`;
const hover = async (dt, selector, nth = 0) => { const p = await centre(dt, selector, nth); await dt.move(1, 1); await sleep(30); await dt.move(p.x, p.y); };
const showsTip = (dt, what) => dt.until(`(${tipNow}) !== null`, what);
const noTip = async (dt) => { await sleep(150); assert.equal(await dt.evaluate(tipNow), null, 'no tip is open'); };

const RUNS = [
  { name: 'portrait dark', theme: 'dark', width: 162, height: 420, orientation: 'portrait', text: 'rgb(230, 232, 235)' },
  { name: 'portrait light', theme: 'light', width: 162, height: 420, orientation: 'portrait', text: 'rgb(26, 29, 33)' },
  { name: 'landscape dark', theme: 'dark', width: 520, height: 130, orientation: 'landscape', text: 'rgb(230, 232, 235)' },
  { name: 'landscape short', theme: 'dark', width: 520, height: 90, orientation: 'landscape', text: 'rgb(230, 232, 235)' },
  { name: 'landscape light', theme: 'light', width: 520, height: 130, orientation: 'landscape', text: 'rgb(26, 29, 33)' },
];

for (const run of RUNS) {
  test(`tip layer, ${run.name}: hint text, ≈, two paths, unknown path, inside the window, focus, Escape, leave, re-render`, { timeout: 90_000 }, async (t) => {
    const skip = noBrowser();
    if (skip) { t.skip(skip); return; }
    const kit = await startKit({ port: await freePort(), theme: run.theme, width: run.width, height: run.height });
    const { dt, url } = kit;
    const inside = (m, what) => {
      assert.equal(m.clipped, false, `${what}: nothing is cut off inside the bubble`);
      assert.ok(m.l >= 0 && m.t >= 0 && m.r <= m.vw && m.b <= m.vh, `${what}: bubble inside the window ${JSON.stringify(m)}`);
      if (run.orientation === 'portrait') assert.ok(m.r - m.l <= m.vw, `${what}: not wider than the strip`);
      else assert.ok(m.b - m.t <= m.vh, `${what}: not higher than the band`);
    };
    const shot = async (name) => { if (PROOF) { mkdirSync(PROOF, { recursive: true }); await dt.shot(join(PROOF, `tip-${run.name.replace(' ', '-')}-${name}.png`)); } };
    try {
      await dt.send('Page.navigate', { url: `${url}/hud` });
      await dt.until(`document.getElementById('hud') && document.getElementById('hud').dataset.orientation === '${run.orientation}' && document.querySelector('#est')`, 'the probe tile');
      await sleep(200);
      const last = run.orientation === 'landscape' ? 2 : 0;   // the third tile sits at the right edge of the band

      // estimated value: the catalog hint, ≈ estimated, the data unit
      await hover(dt, '#est');
      await showsTip(dt, 'the tip on the estimated value');
      let m = await dt.evaluate(tipNow);
      const pct = row('live.instances[].context_percent');
      assert.deepEqual(m.entries, [[pct.hint, '≈ estimated', pct.unit]]);
      assert.equal(m.color, run.text, 'the tip text wears the theme\'s --aihud-text');
      inside(m, 'estimated');
      const caret = await dt.evaluate(`(() => { const c = document.querySelector('.aihud-tip .tip-caret'), t = document.querySelector('.aihud-tip').getBoundingClientRect(), r = c.getBoundingClientRect(); return { side: c.dataset.side, w: r.width, l: r.left - t.left, r: t.right - r.right, t: r.top - t.top, b: t.bottom - r.bottom }; })()`);
      assert.ok(run.orientation === 'portrait' ? ['top', 'bottom'].includes(caret.side) : ['left', 'right'].includes(caret.side), `the pointer sits on the right side: ${JSON.stringify(caret)}`);
      assert.ok(caret.w > 0 && caret[caret.side[0]] < 8 && caret[caret.side[0]] > -8, `the pointer touches the bubble edge: ${JSON.stringify(caret)}`);
      await shot('estimated');

      // exact value at the far edge (bottom-right of the last tile): `exact`, still inside
      await hover(dt, '#dur', last);
      await dt.until(`(${tipNow}) !== null && (${tipNow}).entries[0][0] === ${JSON.stringify(row('turn.turns[].duration_s').hint)}`, 'the tip on the duration');
      m = await dt.evaluate(tipNow);
      assert.deepEqual(m.entries[0].slice(1), ['exact', 'seconds']);
      inside(m, 'duration at the edge');
      await shot('edge');

      // an SVG <text> value
      await hover(dt, '#svg', last);
      await dt.until(`(${tipNow}) !== null && (${tipNow}).entries[0][0] === ${JSON.stringify(row('agents.subagents_started').hint)}`, 'the tip on the SVG value');
      inside(await dt.evaluate(tipNow), 'svg');

      // two paths, one value: two entries, in the order written
      await hover(dt, '#two', last);
      await dt.until(`(${tipNow}) !== null && (${tipNow}).entries.length === 2`, 'two entries');
      m = await dt.evaluate(tipNow);
      assert.deepEqual(m.entries.map((e) => e[0]), [row('session.started_at').hint, row('live.instances[].last_activity').hint]);
      inside(m, 'two paths');
      await shot('two');

      // three paths, one value: three entries, none cut off (the landscape band widens the bubble instead)
      await hover(dt, '#three', last);
      await dt.until(`(${tipNow}) !== null && (${tipNow}).entries.length === 3`, 'three entries');
      m = await dt.evaluate(tipNow);
      inside(m, 'three paths');
      await shot('three');

      // an unknown path shows no tip (and takes an open one away)
      await hover(dt, '#unknown', last);
      await noTip(dt);

      // Escape closes it; leaving the strip closes it
      await hover(dt, '#est');
      await showsTip(dt, 'the tip again');
      await dt.key('Escape');
      await noTip(dt);
      await hover(dt, '#est');
      await showsTip(dt, 'the tip once more');
      await dt.move(run.width - 1, run.height - 1);
      await sleep(100);
      await dt.evaluate(`document.querySelector('#hud .grid').dispatchEvent(new MouseEvent('mouseleave'))`);
      await noTip(dt);

      // keyboard focus shows it, blur takes it away
      await dt.move(1, 1);
      await dt.evaluate(`document.querySelector('#focus').focus()`);
      await showsTip(dt, 'the tip on focus');
      assert.equal((await dt.evaluate(tipNow)).entries[0][0], row('live.instances[].tokens_total').hint);
      inside(await dt.evaluate(tipNow), 'focus');
      await dt.evaluate(`document.activeElement.blur()`);
      await noTip(dt);

      // a re-render (a resize redraws the tiles) takes the open tip away; the pointer still rests on the
      // new element afterwards, so the browser may draw the tip anew - what counts is that it was hidden at the redraw
      await hover(dt, '#est');
      await showsTip(dt, 'the tip before the re-render');
      await dt.evaluate(`window.__hid = 0; new MutationObserver(() => { const t = document.querySelector('.aihud-tip'); if (t.hidden) window.__hid++; }).observe(document.querySelector('.aihud-tip'), { attributes: true, attributeFilter: ['hidden'] }); true`);
      await dt.send('Emulation.setDeviceMetricsOverride', { width: run.width + (run.orientation === 'portrait' ? 6 : 0), height: run.height + (run.orientation === 'portrait' ? 0 : 6), deviceScaleFactor: 1, mobile: false });
      await dt.until('window.__hid >= 1', 'the tip hidden by the re-render');
      assert.deepEqual(dt.errors, []);
    } finally { await kit.stop(); }
  });
}

// The window launcher with a fake file system and a fake spawn: no real browser starts here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { candidates, findBrowser, openWindow, WINDOW_SIZE } from './launch.js';

const WIN_ENV = { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)' };
const CHROME_WIN = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const EDGE_WIN = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const CHROMIUM_WIN = 'C:\\Users\\u\\AppData\\Local\\Chromium\\Application\\chrome.exe';
const MAC = {
  chrome: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  edge: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  chromium: '/Applications/Chromium.app/Contents/MacOS/Chromium',
};
const LINUX_ENV = { PATH: '/usr/local/bin:/usr/bin', DISPLAY: ':0' };

const fakeFs = (...present) => ({ existsSync: (p) => present.includes(p) });

/** A fake spawn: records every call; `behave(child, call)` decides what the child does. */
function fakeSpawn(behave = () => {}) {
  const calls = [];
  const spawn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.unrefs = 0;
    child.unref = () => { child.unrefs += 1; };
    const call = { cmd, args, opts, child };
    calls.push(call);
    queueMicrotask(() => behave(child, call));
    return child;
  };
  return { spawn, calls };
}

function capture() {
  const out = [];
  return { out, log: (s) => out.push(String(s)) };
}

const URL_HUD = 'http://localhost:4747/hud';

test('finder: search order Chrome → Edge → Chromium on Windows, Edge found under Program Files (x86)', () => {
  const list = candidates('win32', WIN_ENV);
  assert.ok(list.indexOf(CHROME_WIN) < list.indexOf(EDGE_WIN) && list.indexOf(EDGE_WIN) < list.indexOf(CHROMIUM_WIN), list.join('\n'));
  assert.equal(findBrowser('win32', fakeFs(CHROMIUM_WIN, EDGE_WIN, CHROME_WIN), WIN_ENV).path, CHROME_WIN);
  assert.equal(findBrowser('win32', fakeFs(CHROMIUM_WIN, EDGE_WIN), WIN_ENV).path, EDGE_WIN, 'Windows without Chrome but with Edge');
  assert.equal(findBrowser('win32', fakeFs(CHROMIUM_WIN), WIN_ENV).path, CHROMIUM_WIN);
  assert.equal(findBrowser('win32', fakeFs(), WIN_ENV), null);
});

test('finder: search order on macOS and Linux', () => {
  assert.equal(findBrowser('darwin', fakeFs(MAC.chromium, MAC.edge, MAC.chrome), {}).path, MAC.chrome);
  assert.equal(findBrowser('darwin', fakeFs(MAC.chromium, MAC.edge), {}).path, MAC.edge);
  assert.equal(findBrowser('darwin', fakeFs(MAC.chromium), {}).path, MAC.chromium);
  assert.equal(findBrowser('linux', fakeFs('/usr/bin/chromium', '/usr/bin/microsoft-edge', '/usr/bin/google-chrome'), LINUX_ENV).path, '/usr/bin/google-chrome');
  assert.equal(findBrowser('linux', fakeFs('/usr/bin/chromium', '/usr/bin/microsoft-edge'), LINUX_ENV).path, '/usr/bin/microsoft-edge');
  assert.equal(findBrowser('linux', fakeFs('/usr/bin/chromium'), LINUX_ENV).path, '/usr/bin/chromium');
  const snap = findBrowser('linux', fakeFs('/snap/bin/chromium'), { PATH: '/snap/bin' });
  assert.match(snap.noApp, /Snap\/Flatpak/);
});

test('finder: AIHUD_BROWSER beats the search', () => {
  const own = 'D:\\tools\\browser\\chrome.exe';
  const hit = findBrowser('win32', fakeFs(CHROME_WIN, EDGE_WIN), { ...WIN_ENV, AIHUD_BROWSER: own });
  assert.deepEqual(hit, { path: own, from: 'AIHUD_BROWSER', noApp: null });
  assert.match(findBrowser('linux', fakeFs(), { AIHUD_BROWSER: '/usr/bin/firefox' }).noApp, /Firefox/);
});

test('app window: detached spawn, own profile under the aihud home, fixed 200x900, unref', async () => {
  const s = fakeSpawn();   // the browser keeps running: no exit within the grace window
  const c = capture();
  const r = await openWindow(URL_HUD, { home: 'C:\\Users\\u\\.aihud', platform: 'win32', env: WIN_ENV, fs: fakeFs(EDGE_WIN), spawn: s.spawn, log: c.log, graceMs: 30 });
  assert.equal(s.calls.length, 1, 'spawn was called exactly once');
  const [call] = s.calls;
  assert.equal(call.cmd, EDGE_WIN);
  assert.deepEqual(call.args, [`--app=${URL_HUD}`, `--window-size=${WINDOW_SIZE}`, '--user-data-dir=C:\\Users\\u\\.aihud\\browser', '--no-first-run', '--no-default-browser-check']);
  assert.equal(WINDOW_SIZE, '200,900');
  assert.equal(call.opts.detached, true);
  assert.equal(call.opts.stdio, 'ignore');
  assert.ok(call.child.unrefs >= 1, 'the browser was not unref\'d');
  assert.deepEqual(r, { mode: 'app', browser: EDGE_WIN });
});

test('app window: a browser handing off to its running instance (exit 0) counts as opened', async () => {
  const s = fakeSpawn((child) => child.emit('exit', 0));
  const r = await openWindow(URL_HUD, { home: '/h/.aihud', platform: 'linux', env: LINUX_ENV, fs: fakeFs('/usr/bin/google-chrome'), spawn: s.spawn, log: capture().log, graceMs: 5000 });
  assert.equal(r.mode, 'app');
  assert.equal(s.calls[0].args[2], '--user-data-dir=/h/.aihud/browser');
});

test('AIHUD_BROWSER is the binary that gets spawned', async () => {
  const own = '/opt/own/chrome';
  const s = fakeSpawn();
  await openWindow(URL_HUD, { home: '/h', platform: 'linux', env: { ...LINUX_ENV, AIHUD_BROWSER: own }, fs: fakeFs('/usr/bin/google-chrome'), spawn: s.spawn, log: capture().log, graceMs: 10 });
  assert.ok(s.calls.length >= 1, 'spawn was never called');
  assert.equal(s.calls[0].cmd, own);
});

function assertTab(s, c, r, platform, why) {
  assert.equal(r.mode, 'tab');
  assert.match(r.why, why);
  assert.ok(s.calls.length >= 1, 'spawn was never called');
  const last = s.calls.at(-1);
  const opener = { win32: 'cmd', darwin: 'open', linux: 'xdg-open' }[platform];
  assert.equal(last.cmd, opener);
  assert.ok(last.args.includes(URL_HUD), last.args.join(' '));
  assert.equal(last.opts.detached, true);
  assert.ok(last.child.unrefs >= 1);
  assert.match(c.out.join('\n'), /never gets narrower than 500 px/);
}

test('--tab opens a tab via the OS opener and never looks for the app window', async () => {
  for (const platform of ['win32', 'darwin', 'linux']) {
    const s = fakeSpawn();
    const c = capture();
    const r = await openWindow(URL_HUD, { home: '/h', tab: true, platform, env: { ...WIN_ENV, DISPLAY: ':0' }, fs: fakeFs(CHROME_WIN, MAC.chrome), spawn: s.spawn, log: c.log });
    assert.equal(s.calls.length, 1);
    assertTab(s, c, r, platform, /--tab/);
  }
});

test('nothing found → tab with the hint', async () => {
  const s = fakeSpawn();
  const c = capture();
  const r = await openWindow(URL_HUD, { home: '/h', platform: 'linux', env: LINUX_ENV, fs: fakeFs(), spawn: s.spawn, log: c.log });
  assert.equal(s.calls.length, 1);
  assertTab(s, c, r, 'linux', /no Chrome, Edge or Chromium found/);
});

test('Firefox via AIHUD_BROWSER → tab', async () => {
  const s = fakeSpawn();
  const c = capture();
  const r = await openWindow(URL_HUD, { home: '/h', platform: 'darwin', env: { AIHUD_BROWSER: '/Applications/Firefox.app/Contents/MacOS/firefox' }, fs: fakeFs(), spawn: s.spawn, log: c.log });
  assertTab(s, c, r, 'darwin', /Firefox/);
});

test('spawn exits ≠ 0 within the grace window → tab fallback', async () => {
  const s = fakeSpawn((child, call) => { if (call.cmd === EDGE_WIN) child.emit('exit', 13); });
  const c = capture();
  const r = await openWindow(URL_HUD, { home: 'C:\\h', platform: 'win32', env: WIN_ENV, fs: fakeFs(EDGE_WIN), spawn: s.spawn, log: c.log, graceMs: 2000 });
  assert.equal(s.calls.length, 2, 'browser, then the opener');
  assert.equal(s.calls[0].cmd, EDGE_WIN);
  assertTab(s, c, r, 'win32', /exited with 13/);
});

test('spawn error (binary missing) → tab fallback', async () => {
  const s = fakeSpawn((child, call) => { if (call.cmd !== 'xdg-open') child.emit('error', new Error('spawn ENOENT')); });
  const c = capture();
  const r = await openWindow(URL_HUD, { home: '/h', platform: 'linux', env: { AIHUD_BROWSER: '/nope/chrome', DISPLAY: ':0' }, fs: fakeFs(), spawn: s.spawn, log: c.log, graceMs: 2000 });
  assertTab(s, c, r, 'linux', /ENOENT/);
});

test('a missing OS opener (async spawn error) prints "open <url> yourself"', async () => {
  const s = fakeSpawn((child) => setTimeout(() => child.emit('error', new Error('spawn xdg-open ENOENT')), 5));
  const c = capture();
  const r = await openWindow(URL_HUD, { home: '/h', tab: true, platform: 'linux', env: LINUX_ENV, fs: fakeFs(), spawn: s.spawn, log: c.log });
  assert.equal(r.mode, 'tab');
  assert.ok(s.calls.length >= 1, 'spawn was never called');
  await new Promise((ok) => setTimeout(ok, 30));
  assert.match(c.out.join('\n'), /could not open a browser - open http:\/\/localhost:4747\/hud yourself/);
});

test('no display: only Linux with neither DISPLAY nor WAYLAND_DISPLAY counts as "no display"', async () => {
  const { noDisplay } = await import('./launch.js');
  assert.equal(noDisplay('linux', {}), true);
  assert.equal(noDisplay('linux', { DISPLAY: '', WAYLAND_DISPLAY: '' }), true);
  assert.equal(noDisplay('linux', { DISPLAY: ':0' }), false);
  assert.equal(noDisplay('linux', { WAYLAND_DISPLAY: 'wayland-0' }), false);
  assert.equal(noDisplay('win32', {}), false);
  assert.equal(noDisplay('darwin', {}), false);
});

test('no display on Linux (SSH, headless): one line naming the cause, no browser, no tab', async () => {
  for (const tab of [false, true]) {
    const s = fakeSpawn();
    const c = capture();
    const r = await openWindow(URL_HUD, { home: '/h', tab, platform: 'linux', env: { PATH: '/usr/bin' }, fs: fakeFs('/usr/bin/google-chrome'), spawn: s.spawn, log: c.log, graceMs: 10 });
    assert.equal(s.calls.length, 0, 'something was spawned without a display');
    assert.equal(c.out.length, 1, c.out.join('\n'));
    assert.match(c.out[0], /no display found \(SSH or headless session\) - the node runs at http:\/\/localhost:4747\/hud; use `aihud serve` and an ssh port forward/);
    assert.doesNotMatch(c.out[0], /install Chrome/);
    assert.deepEqual(r, { mode: 'none', why: 'no display' });
  }
});

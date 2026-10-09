// ─────────────────────────────────────────────────────────────────────────────
//  THE WINDOW · finding a browser and opening the HUD
//
//  The only file of the node that starts a process. `aihud serve` never reaches it.
//  App window: Chrome → Edge → Chromium (first hit wins), or the binary named in AIHUD_BROWSER:
//      <browser> --app=<url> --window-size=200,900 --user-data-dir=<aihud home>/browser --no-first-run --no-default-browser-check
//  Own profile = own process, no extensions. Spawned detached and unref'd: the window neither
//  keeps the node alive nor dies with it.
//  Tab (the OS opener: start / open / xdg-open) when `--tab` is set, no browser is found, the
//  browser cannot do `--app` (Firefox, Snap/Flatpak builds until measured), or the start fails
//  (error, or exit ≠ 0 within the grace window). A tab never gets narrower than 500 px.
//  Linux without DISPLAY and WAYLAND_DISPLAY (SSH, headless): neither window nor tab, one line naming the cause.
// ─────────────────────────────────────────────────────────────────────────────

import { spawn as nodeSpawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix, win32 } from 'node:path';

export const WINDOW_SIZE = '200,900';
export const TAB_HINT = 'a browser tab never gets narrower than 500 px - for the narrow app window install Chrome, Edge or Chromium, or set AIHUD_BROWSER to its binary';

/** Candidate binaries per platform, in search order Chrome → Edge → Chromium. */
export function candidates(platform, env = {}) {
  if (platform === 'win32') {
    const local = env.LOCALAPPDATA;
    const pf = env.PROGRAMFILES ?? env.ProgramFiles;
    const pf86 = env['PROGRAMFILES(X86)'] ?? env['ProgramFiles(x86)'];
    const at = (base, ...rest) => (base ? [win32.join(base, ...rest)] : []);
    return [
      ...at(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...at(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...at(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ...at(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ...at(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ...at(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ...at(local, 'Chromium', 'Application', 'chrome.exe'),
    ];
  }
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  // Linux and the rest: names on PATH, then the known install folders.
  const dirs = String(env.PATH || '').split(':').filter(Boolean);
  const onPath = (name) => dirs.map((d) => posix.join(d, name));
  return [
    ...onPath('google-chrome-stable'), ...onPath('google-chrome'), '/opt/google/chrome/chrome',
    ...onPath('microsoft-edge-stable'), ...onPath('microsoft-edge'), '/opt/microsoft/msedge/msedge',
    ...onPath('chromium'), ...onPath('chromium-browser'),
  ];
}

/** Linux with neither DISPLAY nor WAYLAND_DISPLAY set: no window and no tab can show up. */
export function noDisplay(platform, env = {}) {
  return platform === 'linux' && !env.DISPLAY && !env.WAYLAND_DISPLAY;
}

/** Why this binary gets a tab instead of an app window, or null when `--app` is expected to work. */
function noAppReason(path) {
  if (/firefox/i.test(path)) return 'Firefox has no --app window';
  if (/^\/snap\/|flatpak/i.test(path)) return 'Snap/Flatpak browsers are not supported until measured';
  return null;
}

/**
 * The browser for the app window: AIHUD_BROWSER beats the search, else the first existing
 * candidate. `{path, from: 'AIHUD_BROWSER' | 'search', noApp: reason | null}`, or null.
 */
export function findBrowser(platform = process.platform, fs = { existsSync }, env = process.env) {
  if (env.AIHUD_BROWSER) return { path: env.AIHUD_BROWSER, from: 'AIHUD_BROWSER', noApp: noAppReason(env.AIHUD_BROWSER) };
  const hit = candidates(platform, env).find((p) => fs.existsSync(p));
  return hit ? { path: hit, from: 'search', noApp: noAppReason(hit) } : null;
}

function detach(child) {
  child.on('error', () => {});
  child.unref();
}

function openTab(url, { platform, spawn, log }, why) {
  const [cmd, args, extra] = platform === 'win32' ? ['cmd', ['/c', 'start', '""', url], { windowsVerbatimArguments: true }]
    : platform === 'darwin' ? ['open', [url], {}] : ['xdg-open', [url], {}];
  log(`aihud: opening a normal browser tab (${why}) - ${TAB_HINT}`);
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore', ...extra });
    child.once('error', () => log(`aihud: could not open a browser - open ${url} yourself`));
    detach(child);
  } catch {
    log(`aihud: could not open a browser - open ${url} yourself`);
  }
  return { mode: 'tab', why };
}

/**
 * Opens `url` as the narrow app window, or as a tab (see the head of this file).
 * Resolves `{mode: 'app', browser}` or `{mode: 'tab', why}` once the grace window has passed or
 * the browser handed off (exit 0).
 */
export async function openWindow(url, {
  home, tab = false, platform = process.platform, env = process.env, fs = { existsSync },
  spawn = nodeSpawn, log = console.log, graceMs = 2000,
} = {}) {
  const io = { platform, spawn, log };
  if (noDisplay(platform, env)) {
    const port = new URL(url).port;
    log(`aihud: no display found (SSH or headless session) - the node runs at ${url}; to view it from another machine, forward the same port: ssh -L ${port}:127.0.0.1:${port} <host>`);
    return { mode: 'none', why: 'no display' };
  }
  if (tab) return openTab(url, io, '--tab');
  const browser = findBrowser(platform, fs, env);
  if (!browser) return openTab(url, io, 'no Chrome, Edge or Chromium found');
  if (browser.noApp) return openTab(url, io, browser.noApp);
  const sep = platform === 'win32' ? win32 : posix;
  const args = [`--app=${url}`, `--window-size=${WINDOW_SIZE}`, `--user-data-dir=${sep.join(home, 'browser')}`, '--no-first-run', '--no-default-browser-check'];
  const failed = await new Promise((done) => {
    let child;
    try {
      child = spawn(browser.path, args, { detached: true, stdio: 'ignore' });
    } catch (e) { done(e.message); return; }
    const timer = setTimeout(() => { detach(child); done(null); }, graceMs);
    child.once('error', (e) => { clearTimeout(timer); done(e.message); });
    child.once('exit', (code) => { clearTimeout(timer); detach(child); done(code === 0 ? null : `${browser.path} exited with ${code}`); });
  });
  if (failed) return openTab(url, io, `the app window did not start: ${failed}`);
  log(`aihud: app window ${url} (${browser.path})`);
  return { mode: 'app', browser: browser.path };
}

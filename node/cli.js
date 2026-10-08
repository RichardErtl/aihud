// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · COMMANDS
//
//  `aihud [--tab] [--port N] [--projects <dir>] [--home <dir>] [--poll <ms>]`
//      starts the node AND opens the HUD window (launch.js). A node already answering on the
//      port as aihud is reused: then only the window opens.
//  `aihud serve [--port N] [--projects <dir>] [--home <dir>] [--poll <ms>]`
//      starts the node on http://localhost:<port> and keeps running. Opens no browser.
//  `aihud close <sessionId> [--title …] [--note …] [--port N] [--home <dir>]`
//      one POST to the running node: `closed: true` + `closed_at: now` (+ title/note).
//  anything else prints the help.
// ─────────────────────────────────────────────────────────────────────────────

import { parseArgs } from 'node:util';
import { aihudHome, readSettings } from './store.js';
import { createNode } from './server.js';
import { openWindow } from './launch.js';
import { addTile } from './add-tile.js';

export const HELP = `usage:
  aihud [--tab] [--port N] [--projects <dir>] [--home <dir>] [--poll <ms>]
      start the local node and open the HUD as a narrow app window (Chrome, Edge or Chromium);
      if a node already runs on the port, only open the window
  aihud serve [--port N] [--projects <dir>] [--home <dir>] [--poll <ms>]
      start the local node (JSON + live events on http://localhost:<port>)
  aihud close <sessionId> [--title <text>] [--note <text>] [--port N] [--home <dir>]
      mark a session as closed (needs a running node)
  aihud check [--home <dir>]
      check tiles, own layouts and the settings' layout names; one line per problem, exit 1 on any
  aihud layout show <slug> [--home <dir>]
      list what travels with one of your layouts: its file, whether it is active, its own tiles, tiles missing here
  aihud new-tile [--home <dir>]
      print the tile contract, the value list and how to build a tile with Claude Code
  aihud add-tile <id> [--orientation portrait|landscape|both] [--home <dir>]
      place a tile in the active portrait and/or landscape layout (a shipped layout is copied first)
  aihud install-skill [--force] [--home <dir>]
      copy the /new-tile skill to ~/.claude/skills/new-tile/

  --projects   transcript folder (default ~/.claude/projects, env AIHUD_PROJECTS)
  --home       aihud folder for settings, sidecars, own tiles and layouts (default ~/.aihud, env AIHUD_HOME)
  --port       default: "port" in <home>/settings.json, else 4747
  --poll       switch the file watch off and scan every <ms> instead (env AIHUD_POLL_MS)
  --tab        open a normal browser tab instead of the app window
  AIHUD_BROWSER  path of the browser binary for the app window (beats the search)`;

const OPTIONS = {
  port: { type: 'string' }, projects: { type: 'string' }, home: { type: 'string' }, poll: { type: 'string' },
  title: { type: 'string' }, note: { type: 'string' }, help: { type: 'boolean', short: 'h' }, tab: { type: 'boolean' }, orientation: { type: 'string' },
};

function portOf(value, home) {
  if (value == null) return readSettings(aihudHome(home)).port;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 65535) throw new Error(`invalid --port: ${value}`);
  return n;
}

async function serve(values, log, onServe) {
  const node = await createNode({
    port: portOf(values.port, values.home), projects: values.projects, home: values.home,
    pollMs: values.poll == null ? undefined : Number(values.poll),
  });
  const s = node.stats();
  log(`aihud node on ${node.url}  (${s.sessions} sessions, freshness: ${s.freshness})`);
  log(`transcripts: ${node.projects}`);
  log(`aihud home:  ${node.home}`);
  const stop = () => { node.close().then(() => process.exit(0)); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  onServe?.(node);
  return node;
}

/** Does an aihud node answer on this port? */
async function nodeAnswers(port, fetchFn) {
  try {
    const res = await fetchFn(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok && (await res.json())?.name === 'aihud';
  } catch { return false; }
}

/** The bare `aihud`: node + window, or only the window when the node already runs. */
async function start(values, log, { open, fetchFn, onServe }) {
  const port = portOf(values.port, values.home);
  const home = aihudHome(values.home);
  let url = `http://localhost:${port}`;
  if (await nodeAnswers(port, fetchFn)) log(`aihud node already runs on ${url} - opening the window only`);
  else url = (await serve(values, log, onServe)).url;
  await open(`${url}/hud`, { home, tab: values.tab === true, log });
  return 0;
}

async function close(sessionId, values, log) {
  const port = portOf(values.port, values.home);
  const body = { closed: true, closed_at: new Date().toISOString() };
  if (values.title != null) body.title = values.title;
  if (values.note != null) body.note = values.note;
  let res;
  try {
    res = await fetch(`http://127.0.0.1:${port}/sessions/${encodeURIComponent(sessionId)}/sidecar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    log(`no aihud node answers on localhost:${port} - start it with: npx aihud serve`);
    return 1;
  }
  const text = await res.text();
  log(text.trimEnd());
  return res.ok ? 0 : 1;
}

/**
 * Entry point of `bin/aihud.js`. Returns the exit code; `serve` and the bare start resolve once the node listens
 * and leaves the process running.
 */
export async function main(argv, {
  version = '', log = console.log, err = console.error, open = openWindow, fetchFn = fetch, onServe,
} = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (e) {
    err(String(e.message));
    err(HELP);
    return 2;
  }
  const { values, positionals } = parsed;
  const [command, ...rest] = positionals;
  try {
    if (command === undefined && !values.help) return await start(values, log, { open, fetchFn, onServe });
    if (command === 'serve' && !values.help) { await serve(values, log, onServe); return 0; }
    if (command === 'check' && !values.help) {
      if (rest.length) { err('check takes no argument'); return 2; }
      return await (await import('./check.js')).runCheck(values.home, log);
    }
    if (command === 'close' && !values.help) {
      if (rest.length !== 1) { err('close needs exactly one <sessionId>'); return 2; }
      return await close(rest[0], values, log);
    }
    if (command === 'layout' && !values.help) {
      if (rest[0] !== 'show' || rest.length !== 2) { err('usage: aihud layout show <slug> [--home <dir>]'); return 2; }
      return await (await import('./layout-show.js')).layoutShow(rest[1], values, log, err);
    }
    if (command === 'add-tile' && !values.help) {
      if (rest.length !== 1) { err('add-tile needs exactly one <id>'); return 2; }
      return await addTile(rest[0], values, log, err);
    }
  } catch (e) {
    const why = e.code === 'EADDRINUSE' ? 'port already in use'
      : String(e.reason || '').startsWith('aihud_home_inside') ? `refused - the aihud home must not lie inside Claude Code's folders (${e.reason})`
        : String(e.reason || '').startsWith('settings_json') ? `refused - ${e.reason}: fix or remove settings.json in ${aihudHome(values.home)}`
          : e.message;
    err(`aihud${command ? ` ${command}` : ''}: ${why}`);
    return 1;
  }
  log(`aihud ${version} - early work.`);   // the help line tiles/contract.test.js expects
  log(HELP);
  return command && !['help'].includes(command) && !values.help ? 2 : 0;
}

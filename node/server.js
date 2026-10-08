// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · SERVER
//
//  One process, `node:http` only, bound to 127.0.0.1. It serves the reader's contract per
//  session, the session list, `settings.json`, the SVG folder and the tile/layout catalog as
//  JSON, and pushes live updates over Server-Sent Events (`GET /events`).
//
//  FRESHNESS, two ways into ONE diff:
//   · the watch: `fs.watch(projects, {recursive: true})`. An event on a KNOWN session is handled
//     targeted (stat of its main file + the touched file) → `session-updated`. Anything else
//     (new project folder, new session file) triggers a full scan.
//   · the mtime scan: a full inventory, diffed against what is known → `session-updated` per
//     changed session, `sessions-changed` when sessions appear or vanish. It runs as a backstop
//     every BACKSTOP_MS while the watch lives, every FALLBACK_POLL_MS when the watch failed, or
//     every `pollMs` when the watch is switched off (`pollMs` option / `AIHUD_POLL_MS`).
//
//  CODEX: next to the Claude projects the node reads `<codex>/sessions/**/rollout-*.jsonl` and
//  the title index `<codex>/session_index.jsonl`. The `.codex` folder is the explicit option / `AIHUD_CODEX`,
//  else the sibling of a default-shaped projects root (`<home>/.claude/projects` -> `<home>/.codex`), so a
//  test or a custom projects folder never reads the real `~/.codex`. A missing folder is the normal case
//  and costs one `existsSync` per scan. A second watcher runs on `<codex>/sessions` while it exists; it
//  is armed at the start or by the first scan that finds the folder. Entries carry `main_file`: the
//  targeted flush stats that, never `<root>/<slug>/<id>.jsonl`.
//
//  ANTIGRAVITY: the same way for `<ag>/brain/<id>/.system_generated/logs/transcript.jsonl`. The `<ag>`
//  folder (`.gemini/antigravity-cli`) is the option / `AIHUD_ANTIGRAVITY`, else the sibling of a default-shaped
//  projects root. A third watcher runs on `<ag>/brain`; only `transcript.jsonl` counts (the id is the folder name),
//  `transcript_full.jsonl` and `chunks/` are ignored. Its sheet has no tokens: the node passes the reader's
//  `not_delivered` through and invents nothing.
//
//  NO PATH FROM THE REQUEST: a session id from outside is only ever resolved against the
//  inventory (unknown = 404). Write ways go through `store.js`, which writes only inside the
//  aihud home.
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import { watch, statSync, readFileSync, existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { inventory, projectsRoot, codexIndexFile } from '../reader/inventory.js';
import { loadSession, buildSheet, ACTIVE_SECONDS } from '../reader/derive.js';
import { contractSheet } from '../reader/contract.js';
import { checkLeaks } from '../reader/leak-check.js';
import { readExtras, readSidecar } from '../reader/extras.js';
import {
  Refusal, aihudHome, checkHome, readSettings, writeSettings, writeSidecar, writeLayout, deleteLayout, layoutFallback, validateDraft,
  catalog, svgList, svgFile, PACKAGE_DIR,
} from './store.js';

// Mirror of the reader's CODEX_FILE (reader/inventory.js): `rollout-...-<uuid>.jsonl`, the id in group 1.
const CODEX_FILE = /^rollout-.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
// Mirror of the reader's AG_ID (reader/inventory.js): a brain folder name is the session id (a uuid).
const AG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const BACKSTOP_MS = 10_000;
export const FALLBACK_POLL_MS = 2_000;
const FLUSH_MS = 100;
const HEARTBEAT_MS = 20_000;
/** A composer draft nobody renewed for this long is dropped (the composer renews about every 5 s). */
export const DRAFT_TTL_MS = 15_000;
const MAX_BODY = 1024 * 1024;
const JS = 'text/javascript; charset=utf-8';
const HTML = 'text/html; charset=utf-8';
const CSS = 'text/css; charset=utf-8';
/**
 * The pages and their files, a fixed map — no path from the request: the HUD (`aihud/hud/`),
 * the composer (`aihud/composer/`), the one place where tiles are arranged into a layout, and the
 * window (`aihud/window/`, Live · Analysis · Settings — Settings writes through `POST /settings`), which builds its value catalog
 * out of the shipped `aihud/tiles/contract.json`, served as the `/contract.json` route.
 */
const PAGE_FILES = Object.freeze({
  '/hud': ['hud/index.html', HTML],
  '/hud/hud.js': ['hud/hud.js', JS],
  '/hud/hud.css': ['hud/hud.css', CSS],
  '/hud/draft-overlay.js': ['hud/draft-overlay.js', JS],
  '/composer': ['composer/index.html', HTML],
  '/composer/composer.js': ['composer/composer.js', JS],
  '/composer/composer.css': ['composer/composer.css', CSS],
  '/window': ['window/index.html', HTML],
  '/window/window.js': ['window/window.js', JS],
  '/window/window.css': ['window/window.css', CSS],
  '/contract.json': ['tiles/contract.json', 'application/json; charset=utf-8'],
});

/** Claude Code's folder slug of a directory: every non-alphanumeric character becomes `-`. */
export function slugOf(dir) {
  return String(dir || '').replace(/[^A-Za-z0-9]/g, '-');
}

/** Slug comparison with the drive letter case-insensitive (`C--x` and `c--x` are one folder). */
export function sameSlug(a, b) {
  const norm = (s) => String(s || '').replace(/^[A-Za-z](?=--)/, (c) => c.toLowerCase());
  return norm(a) === norm(b);
}

/** The projects root: explicit option → `AIHUD_PROJECTS` → `projects` of the settings → `~/.claude/projects`. */
export function projectsDir(explicit, fromSettings) {
  const set = String(explicit || process.env.AIHUD_PROJECTS || fromSettings || '').trim();
  return set || projectsRoot();
}

/** The `.codex` folder of the node: option -> `AIHUD_CODEX` -> sibling of `<home>/.claude/projects` -> none. */
export function codexDir(explicit, projectsRootDir) {
  const set = String(explicit ?? process.env.AIHUD_CODEX ?? '').trim();
  if (set) return set;
  const r = String(projectsRootDir || '').replace(/[\/]+$/, '');
  const dot = dirname(r);
  return basename(r) === 'projects' && basename(dot) === '.claude' ? join(dirname(dot), '.codex') : null;
}

/** The Antigravity CLI folder: option -> `AIHUD_ANTIGRAVITY` -> `<home>/.gemini/antigravity-cli` beside a default-shaped root -> none. */
export function antigravityDir(explicit, projectsRootDir) {
  const set = String(explicit ?? process.env.AIHUD_ANTIGRAVITY ?? '').trim();
  if (set) return set;
  const r = String(projectsRootDir || '').replace(/[\/]+$/, '');
  const dot = dirname(r);
  return basename(r) === 'projects' && basename(dot) === '.claude' ? join(dirname(dot), '.gemini', 'antigravity-cli') : null;
}

function deviceName() {
  return (String(hostname() || 'local').replace(/[^A-Za-z0-9._-]/g, '_').toLowerCase().slice(0, 40)) || 'local';
}

/**
 * Starts the node. Resolves once it listens.
 * @returns {Promise<{url: string, port: number, home: string, projects: string,
 *                    close: () => Promise<void>, stats: () => object}>}
 */
export async function createNode({
  projects, home, codex, antigravity, port, host = '127.0.0.1', startDir = process.cwd(), pollMs, packageDir = PACKAGE_DIR, draftTtlMs = DRAFT_TTL_MS,
} = {}) {
  const aihud = aihudHome(home);
  // settings.json is read for the folder only when neither the option nor the env names one
  const root = projectsDir(projects, projects || process.env.AIHUD_PROJECTS ? null : readSettings(aihud).projects);
  checkHome(aihud, { projects: root });   // never inside Claude Code's own folders
  const codexHome = codexDir(codex, root);
  const codexSessions = codexHome ? join(codexHome, 'sessions') : null;
  const codexIndex = codexSessions ? codexIndexFile(codexSessions) : null;
  const agHome = antigravityDir(antigravity, root);
  const agBrain = agHome ? join(agHome, 'brain') : null;
  const forcedPoll = Number(pollMs ?? process.env.AIHUD_POLL_MS ?? 0) || 0;
  const startSlug = slugOf(startDir);
  const device = deviceName();

  const known = new Map();          // session id -> { slug, mtime_ms, bytes, main_file }
  const clients = new Set();        // SSE responses
  const contracts = new Map();      // session id -> { sig, body }
  const touched = new Map();        // session id -> absolute path of the touched file
  const counters = { watchEvents: 0, scans: 0, emitted: 0 };
  let draft = null;                 // the composer's live draft (memory only), or null
  let draftTimer = null;
  let inv = null;
  let invDirty = true;
  let watcher = null;
  let codexWatcher = null;
  let agWatcher = null;
  let watchError = null;
  let scanTimer = null;
  let flushTimer = null;
  let fullPending = false;
  let closed = false;

  // ── events ──
  function emit(event, data) {
    counters.emitted++;
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) res.write(frame);
  }
  // the composer's draft: one transient grid + placed tiles, renewed by the composer's heartbeat;
  // gone by `{end:true}` or when nobody renews it within the TTL — broadcast as `layout-draft`
  function endDraft() {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = null; }
    if (!draft) return false;
    draft = null;
    emit('layout-draft', { end: true });
    return true;
  }
  function setDraft(next) {
    if (draftTimer) clearTimeout(draftTimer);
    draft = next;
    draftTimer = setTimeout(endDraft, draftTtlMs);
    draftTimer.unref();
    emit('layout-draft', draft);
  }
  const updated = (id, ms) => emit('session-updated', { id, mtime: new Date(ms).toISOString(), mtime_ms: ms });

  // ── the mtime scan (one diff for every path) ──
  function scanAll() {
    counters.scans++;
    const next = inventory({ root, title: false, codexRoot: codexSessions, codexIndex, antigravityRoot: agHome });
    armCodexWatch();
    armAgWatch();
    const seen = new Set();
    let changed = false;
    for (const p of next.projects) {
      for (const s of p.sessions) {
        seen.add(s.session_id);
        const k = known.get(s.session_id);
        if (!k) changed = true;
        known.set(s.session_id, { slug: p.slug, mtime_ms: s.mtime_ms, bytes: s.bytes, main_file: s.main_file });
        if (k && (k.mtime_ms !== s.mtime_ms || k.bytes !== s.bytes)) updated(s.session_id, s.mtime_ms);
      }
    }
    for (const id of [...known.keys()]) if (!seen.has(id)) { known.delete(id); contracts.delete(id); changed = true; }
    if (changed && inv) emit('sessions-changed', { count: known.size });
    inv = next;
    invDirty = false;
    return inv;
  }
  const currentInventory = () => (invDirty || !inv ? scanAll() : inv);

  // ── the watch (targeted, falls back to the scan) ──
  function flush() {
    flushTimer = null;
    if (fullPending) { fullPending = false; touched.clear(); scanAll(); return; }
    for (const [id, file] of touched) {
      const k = known.get(id);
      let ms;
      let bytes;
      try {
        const main = statSync((k.slug === 'codex' || k.slug === 'antigravity') && k.main_file ? k.main_file : join(root, k.slug, `${id}.jsonl`));
        ms = main.mtimeMs;
        bytes = main.size;
        if (file.endsWith('.jsonl')) { try { ms = Math.max(ms, statSync(file).mtimeMs); } catch { /* gone */ } }
      } catch { touched.clear(); scanAll(); return; }
      ms = Math.max(ms, k.mtime_ms);
      if (ms !== k.mtime_ms || bytes !== k.bytes) {
        known.set(id, { ...k, mtime_ms: ms, bytes });
        updated(id, ms);
      }
    }
    touched.clear();
  }
  function onWatch(_type, name) {
    counters.watchEvents++;
    invDirty = true;
    const parts = String(name || '').split(/[\\/]/).filter(Boolean);
    const id = (parts[1] || '').replace(/\.jsonl$/, '');
    if (parts.length >= 2 && known.has(id)) touched.set(id, join(root, ...parts));
    else fullPending = true;
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  }
  // the Codex watcher: names are `YYYY/MM/DD/rollout-...-<uuid>.jsonl` below `<codex>/sessions`
  function onCodexWatch(_type, name) {
    counters.watchEvents++;
    invDirty = true;
    const parts = String(name || '').split(/[\\/]/).filter(Boolean);
    const file = parts[parts.length - 1] || '';
    const id = (file.match(CODEX_FILE) || [])[1];
    const k = id && known.get(id);
    if (k && k.slug === 'codex') touched.set(id, join(codexSessions, ...parts));
    else fullPending = true;
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  }
  // the Antigravity watcher: names are `<id>/.system_generated/logs/transcript.jsonl` below `<ag>/brain`
  function onAgWatch(_type, name) {
    counters.watchEvents++;
    const parts = String(name || '').split(/[\\/]/).filter(Boolean);
    if (!parts.length) { invDirty = true; fullPending = true; if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS); return; }   // no name: cannot tell, scan
    const id = parts[0];
    if (!AG_ID.test(id)) return;
    const isTranscript = parts.length === 4 && parts[1] === '.system_generated' && parts[2] === 'logs' && parts[3] === 'transcript.jsonl';
    if (parts.length > 1 && !isTranscript) return;   // transcript_full.jsonl, chunks/, other files: not this session's main file
    const k = known.get(id);
    // an event on `<id>` alone (Windows reports it for any file created directly in the folder): a scan only if the transcript is gone
    if (parts.length === 1 && k && k.slug === 'antigravity' && k.main_file && existsSync(k.main_file)) return;
    invDirty = true;
    if (isTranscript && k && k.slug === 'antigravity') touched.set(id, join(agBrain, ...parts));
    else fullPending = true;   // a new brain folder / a first transcript
    if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
  }
  function armAgWatch() {
    if (forcedPoll || agWatcher || closed || !agBrain || !existsSync(agBrain)) return;
    try {
      const w = watch(agBrain, { recursive: true, persistent: false }, onAgWatch);
      w.on('error', () => { try { w.close(); } catch { /* closed */ } if (agWatcher === w) agWatcher = null; });
      agWatcher = w;
    } catch { agWatcher = null; }   // the periodic scan still covers it
  }
  function armCodexWatch() {
    if (forcedPoll || codexWatcher || closed || !codexSessions || !existsSync(codexSessions)) return;
    try {
      const w = watch(codexSessions, { recursive: true, persistent: false }, onCodexWatch);
      w.on('error', () => { try { w.close(); } catch { /* closed */ } if (codexWatcher === w) codexWatcher = null; });
      codexWatcher = w;
    } catch { codexWatcher = null; }   // the periodic scan still covers it
  }
  function schedule(ms) {
    if (scanTimer) clearInterval(scanTimer);
    scanTimer = setInterval(() => { try { scanAll(); } catch (e) { watchError = watchError || String((e && e.message) || e); } }, ms);
    scanTimer.unref();
  }
  function startWatch() {
    if (forcedPoll) { schedule(forcedPoll); return; }
    try {
      watcher = watch(root, { recursive: true, persistent: false }, onWatch);
      watcher.on('error', (e) => {
        watchError = String((e && e.message) || e);
        try { watcher.close(); } catch { /* closed */ }
        watcher = null;
        schedule(FALLBACK_POLL_MS);
      });
      schedule(BACKSTOP_MS);
    } catch (e) {
      watchError = String((e && e.message) || e);
      schedule(FALLBACK_POLL_MS);
    }
  }
  const freshness = () => (forcedPoll ? 'poll' : watcher ? 'watch' : 'poll_after_watch_error');

  // ── contract per session ──
  function stateOf(entry, sidecar) {
    if (sidecar && sidecar.closed === true) return 'closed';
    return entry.age_seconds <= ACTIVE_SECONDS ? 'awake' : 'quiet';
  }
  // The node is a LOCAL display of the user's own words: sidecar title/note, the ai-title and commit
  // first lines travel (`withText`), and the leak check exempts exactly those keys — nothing else.
  const WITH_TEXT = true;
  function contractOf(entry) {
    // cache key: the transcript files + the sidecar (read by the reader, the one sidecar reader)
    const sidecarNow = readSidecar(entry.session_id, { aihudHome: aihud, withText: WITH_TEXT });
    const subs = (entry.subagents || []).map((a) => `${a.agent_id}:${a.mtime_ms}:${a.bytes}`).join(',');
    // a Codex title lives in the index file: its mtime/size belong to the key
    let idx = '';
    if (entry.provider === 'codex' && entry.index_file) { try { const st = statSync(entry.index_file); idx = `${st.mtimeMs}:${st.size}`; } catch { idx = 'none'; } }
    // the assumed Antigravity window (settings.windows) shapes the sheet: a changed value is a new key
    let windows = null;
    try { windows = readSettings(aihud).windows ?? null; } catch { windows = null; }
    const sig = `${entry.mtime_ms}:${entry.bytes}:${stateOf(entry, sidecarNow)}:${subs}:${JSON.stringify(sidecarNow)}:${idx}:${JSON.stringify(windows)}`;
    const hit = contracts.get(entry.session_id);
    if (hit && hit.sig === sig) return { status: 200, body: hit.body };
    const loaded = loadSession(entry, { windows });
    const extras = readExtras(loaded, { aihudHome: aihud, withText: WITH_TEXT });
    const state = stateOf(entry, extras.sidecar);
    const body = contractSheet(buildSheet(loaded), { device, state, extras, withText: WITH_TEXT });
    const leaks = checkLeaks(body, { withText: WITH_TEXT });
    if (!leaks.clean) {
      // Held back, loudly: the paths and reasons, never the leaked sample itself.
      return { status: 500, body: { error: 'leak_check_failed', violations: leaks.violations.map((v) => ({ path: v.path, reason: v.reason })) } };
    }
    contracts.set(entry.session_id, { sig, body });
    return { status: 200, body };
  }
  function findEntry(id) {
    for (const p of currentInventory().projects) for (const s of p.sessions) if (s.session_id === id) return s;
    return null;
  }

  // ── session list ──
  function sessionList() {
    const now = Date.now();
    const list = [];
    for (const p of currentInventory().projects) {
      for (const s of p.sessions) {
        const e = {
          session_id: s.session_id, project_slug: p.slug, mtime: s.mtime, mtime_ms: s.mtime_ms,
          age_seconds: Math.max(0, Math.round((now - s.mtime_ms) / 1000)), bytes: s.bytes, subagent_count: s.subagent_count,
        };
        if (s.provider) e.provider = s.provider;
        // local list, not leak-checked: the sidecar travels with the user's own title/note text
        const sc = readSidecar(s.session_id, { aihudHome: aihud, withText: true });
        if (sc) e.sidecar = sc;
        list.push(e);
      }
    }
    list.sort((a, b) => b.mtime_ms - a.mtime_ms);
    // current: the youngest session of the start folder; with none there, the youngest overall (never an empty HUD
    // while sessions exist). current_from names the rule: 'start_folder' | 'newest' | null (no session at all).
    // start_dir_name is the start folder's plain basename (local user data in a local-only response, like start_slug).
    const inStart = list.find((e) => sameSlug(e.project_slug, startSlug));
    const current = inStart || list[0] || null;
    const currentFrom = inStart ? 'start_folder' : current ? 'newest' : null;
    return { as_of: new Date(now).toISOString(), start_slug: startSlug, start_dir_name: basename(startDir) || null, current: current ? current.session_id : null, current_from: currentFrom, sessions: list };
  }

  // ── http ──
  let boundPort = port;
  // DNS-rebinding guard: only requests addressed to this machine by a loopback name.
  const allowedHost = (h) => ['127.0.0.1', 'localhost', '[::1]'].some((n) => h === `${n}:${boundPort}`);
  // Cross-site guard for writes: a browser always names the page's origin; only our own may write.
  const allowedOrigin = (o) => o === undefined || ['127.0.0.1', 'localhost', '[::1]'].some((n) => o === `http://${n}:${boundPort}`);
  function send(res, status, body, type = 'application/json; charset=utf-8') {
    const data = type.startsWith('application/json') && !Buffer.isBuffer(body) ? JSON.stringify(body, null, 2) + '\n' : body;
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  }
  function readBody(req) {
    return new Promise((ok, fail) => {
      const chunks = [];
      let size = 0;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BODY) { fail(new Refusal(413, 'body_too_large')); req.destroy(); } else chunks.push(c);
      });
      req.on('end', () => {
        try { ok(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { fail(new Refusal(400, 'invalid_json')); }
      });
      req.on('error', fail);
    });
  }
  function openEvents(req, res) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ sessions: known.size, freshness: freshness() })}\n\n`);
    if (draft) res.write(`event: layout-draft\ndata: ${JSON.stringify(draft)}\n\n`);   // a HUD opened later sees it too
    clients.add(res);
    req.on('close', () => clients.delete(res));
  }

  async function route(req, res) {
    if (!allowedHost(req.headers.host)) throw new Refusal(403, 'host_not_allowed');
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const m = path.match(/^\/sessions\/([^/]+)(\/sidecar)?$/);
    if (req.method === 'POST') {
      if (!allowedOrigin(req.headers.origin)) throw new Refusal(403, 'origin_not_allowed');
      // A JSON content type forces a CORS preflight on cross-site pages, which this node never answers.
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new Refusal(415, 'content_type_must_be_application_json');
      if (m && m[2]) {
        const id = decodeURIComponent(m[1]);
        const body = await readBody(req);
        if (!findEntry(id)) throw new Refusal(404, 'unknown_session');
        const merged = writeSidecar(aihud, id, body);
        emit('sessions-changed', { count: known.size });
        return send(res, 200, { session_id: id, ...merged });
      }
      if (path === '/settings') {
        const body = await readBody(req);
        const settings = writeSettings(aihud, body, await catalog(aihud, { packageDir }));
        emit('settings-changed', { keys: Object.keys(body).sort() });
        return send(res, 200, settings);
      }
      if (path === '/layouts/draft') {
        const body = await readBody(req);
        if (body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).length === 1 && body.end === true) {
          return send(res, 200, { alive: false, ended: endDraft() });
        }
        setDraft(validateDraft(body, await catalog(aihud, { packageDir })));
        return send(res, 200, { alive: true, ttl_ms: draftTtlMs });
      }
      if (path === '/layouts') {
        const body = await readBody(req);
        const saved = writeLayout(aihud, body, await catalog(aihud, { packageDir }));
        emit('catalog-changed', { slug: saved.slug });
        return send(res, 201, saved);
      }
      throw new Refusal(404, 'not_found');
    }
    if (req.method === 'DELETE') {
      // a layout goes to the trash folder, never a hard delete; the fences of POST /layouts
      if (!allowedOrigin(req.headers.origin)) throw new Refusal(403, 'origin_not_allowed');
      const del = path.match(/^\/layouts\/([^/]+)$/);
      if (!del) throw new Refusal(404, 'not_found');
      const name = decodeURIComponent(del[1]);
      const gone = deleteLayout(aihud, name, await catalog(aihud, { packageDir }));
      // a settings key that names a layout that no longer resolves falls back to the default
      const after = await catalog(aihud, { packageDir });
      const settings = readSettings(aihud);
      const reset = {};
      for (const [key, orientation] of [['layout_portrait', 'portrait'], ['layout_landscape', 'landscape']]) {
        if (settings[key] === name && !after.some((e) => e.kind === 'layout' && e.name === name && e.loadable !== false)) reset[key] = layoutFallback(after, orientation);
      }
      if (Object.keys(reset).length) {
        writeSettings(aihud, reset, after);
        emit('settings-changed', { keys: Object.keys(reset).sort() });
      }
      emit('catalog-changed', { slug: name });
      return send(res, 200, { ...gone, settings_reset: Object.keys(reset).length ? reset : null });
    }
    if (req.method !== 'GET') throw new Refusal(405, 'method_not_allowed');
    if (path === '/') {
      return send(res, 200, {
        name: 'aihud', freshness: freshness(),
        // the node's folders, read-only, for the window's Settings tab (this answer never leaves 127.0.0.1)
        paths: { home: aihud, projects: root, svg: join(aihud, 'svg') },
        endpoints: ['GET /sessions', 'GET /sessions/<id>', 'POST /sessions/<id>/sidecar', 'GET /settings', 'POST /settings',
          'GET /catalog', 'POST /layouts', 'POST /layouts/draft', 'GET /layouts/<name>', 'DELETE /layouts/<name>', 'GET /tiles/<name>.js', 'GET /svg', 'GET /svg/<name>.svg',
          'GET /events', 'GET /hud', 'GET /composer', 'GET /window', 'GET /contract.json'],
      });
    }
    if (path === '/events') return openEvents(req, res);
    if (path === '/sessions') return send(res, 200, sessionList());
    if (m && !m[2]) {
      const entry = findEntry(decodeURIComponent(m[1]));
      if (!entry) throw new Refusal(404, 'unknown_session');
      const { status, body } = contractOf(entry);
      return send(res, status, body);
    }
    if (path === '/settings') return send(res, 200, readSettings(aihud));
    if (path === '/catalog') return send(res, 200, { entries: await catalog(aihud, { packageDir }) });
    if (Object.hasOwn(PAGE_FILES, path)) {
      const [file, type] = PAGE_FILES[path];
      return send(res, 200, readFileSync(join(PACKAGE_DIR, file)), type);
    }
    // A tile module or a layout file by its catalog name: looked up in the catalog (own first), the
    // name is never joined into a path.
    const byName = path.match(/^\/(tiles|layouts)\/([^/]+?)(\.js)?$/);
    if (byName && (byName[1] === 'tiles') === Boolean(byName[3])) {
      const kind = byName[1] === 'tiles' ? 'tile' : 'layout';
      const name = decodeURIComponent(byName[2]);
      const hit = (await catalog(aihud, { packageDir })).find((e) => e.kind === kind && e.name === name);
      if (!hit) throw new Refusal(404, `unknown_${kind}`);
      if (hit.loadable === false) throw new Refusal(500, `${kind}_not_loadable`);
      return send(res, 200, readFileSync(hit.path), kind === 'tile' ? JS : 'application/json; charset=utf-8');
    }
    if (path === '/svg') return send(res, 200, svgList(aihud, { packageDir }).map(({ path: _p, ...s }) => s));
    const svg = path.match(/^\/svg\/([^/]+)$/);
    if (svg) {
      const file = svgFile(aihud, decodeURIComponent(svg[1]), { packageDir });
      if (!file) throw new Refusal(404, 'unknown_svg');
      return send(res, 200, file, 'image/svg+xml');
    }
    throw new Refusal(404, 'not_found');
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((e) => {
      if (res.headersSent) { res.end(); return; }
      if (e instanceof Refusal) send(res, e.status, { error: e.reason });
      else send(res, 500, { error: 'internal_error', detail: String((e && e.message) || e).slice(0, 200) });
    });
  });

  scanAll();
  startWatch();
  armCodexWatch();
  armAgWatch();
  try {
    await new Promise((ok, fail) => {
      server.once('error', fail);
      server.listen(port ?? readSettings(aihud).port, host, () => { server.off('error', fail); ok(); });
    });
  } catch (e) {
    if (scanTimer) clearInterval(scanTimer);
    if (watcher) { try { watcher.close(); } catch { /* closed */ } }
    if (codexWatcher) { try { codexWatcher.close(); } catch { /* closed */ } }
    if (agWatcher) { try { agWatcher.close(); } catch { /* closed */ } }
    throw e;
  }
  boundPort = server.address().port;
  const heartbeat = setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    url: `http://localhost:${boundPort}`,
    port: boundPort,
    home: aihud,
    projects: root,
    stats: () => ({ ...counters, freshness: freshness(), watchError, clients: clients.size, sessions: known.size }),
    close: () => new Promise((ok) => {
      closed = true;
      clearInterval(heartbeat);
      if (codexWatcher) { try { codexWatcher.close(); } catch { /* closed */ } codexWatcher = null; }
      if (agWatcher) { try { agWatcher.close(); } catch { /* closed */ } agWatcher = null; }
      if (draftTimer) clearTimeout(draftTimer);
      if (scanTimer) clearInterval(scanTimer);
      if (flushTimer) clearTimeout(flushTimer);
      if (watcher) { try { watcher.close(); } catch { /* closed */ } }
      for (const res of clients) res.end();
      clients.clear();
      server.close(() => ok());
      server.closeAllConnections();
    }),
  };
}

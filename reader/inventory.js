// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · INVENTORY
//
//  WHAT IT DOES: it looks up WHICH transcripts exist. It does not read them.
//  `~/.claude/projects/<project-slug>/<session-uuid>.jsonl` (main) + next to it the folder
//  `<session-uuid>/subagents/agent-<id>.jsonl` + `agent-<id>.meta.json`.
//
//  A PURE FUNCTION: no network, no UI. Only `readdir`/`stat`, the tiny `meta.json` files and —
//  if asked — a tail piece of the main file for the mere PRESENCE mark of an `ai-title`
//  (never its text).
//
//  THE LEAK RULE: the reader reads only STRUCTURE, never content. That is why the inventory
//  carries
//   · `has_ai_title` + `ai_title_chars` instead of the title text,
//   · `agent_type`/`spawn_depth`/`tool_use_id` from `meta.json`, but NEVER its `description`
//     (free, user-near text) and NEVER `worktreePath` (it betrays paths).
//  A session list could name the `ai-title` as a field; the leak rule is the stronger rule —
//  hence the mark instead of the text. A deliberate deviation, not a silent reading.
// ─────────────────────────────────────────────────────────────────────────────

import { readdirSync, statSync, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ID_ALLOWED } from './parser.js';

/** Version of this raw object (not the contract version — `contract.js` hands that out). */
export const INVENTORY_VERSION = '1.3';   // subagent entries carry workflow_id · 1.2 codex entries (opt-in) · 1.3 antigravity entries (opt-in)

/** How far from the end of the file the title presence test reads. `ai-title` is scattered, but dense. */
export const TITLE_TAIL_BYTES = 256 * 1024;

/** The default place of the transcripts. Without a home directory there is no place — then `null`. */
export function projectsRoot(home) {
  const h = home || process.env.USERPROFILE || process.env.HOME || '';
  return h ? join(h, '.claude', 'projects') : null;
}

/** `2026-09-10T12:00:00.000Z` from milliseconds. A misstep ⇒ `null`, never a throw. */
function isoFrom(ms) {
  try { return new Date(ms).toISOString(); } catch { return null; }
}

/**
 * Presence mark of an `ai-title` — WITHOUT the title text.
 * Only the tail of the file is read; a 10 MB JSONL is never opened in full for it.
 * @returns {{present: boolean, chars: number|null}}
 */
export function titleMark(path, maxBytes = TITLE_TAIL_BYTES) {
  let fd = null;
  try {
    const size = statSync(path).size;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    fd = openSync(path, 'r');
    readSync(fd, buffer, 0, length, Math.max(0, size - length));
    const text = buffer.toString('utf8');
    // Deliberately a regex on the RAW byte window: the title is never parsed, only MEASURED.
    const hit = /"aiTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(text);
    if (!hit) return { present: false, chars: null };
    return { present: true, chars: hit[1].length };
  } catch {
    return { present: false, chars: null };
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

/**
 * The TEXT of the youngest `ai-title` in the tail window — the one deliberate exception to the
 * leak rule, and only on request: the contract carries it as `session.title` ONLY when its
 * caller opts in (`contractSheet(..., { withText: true })`, a local display). Never called by
 * `inventory()`. Missing, unreadable or not decodable ⇒ `null`, never a throw.
 */
export function titleText(path, maxBytes = TITLE_TAIL_BYTES) {
  let fd = null;
  try {
    const size = statSync(path).size;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    fd = openSync(path, 'r');
    readSync(fd, buffer, 0, length, Math.max(0, size - length));
    const hits = [...buffer.toString('utf8').matchAll(/"aiTitle"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
    if (!hits.length) return null;
    const text = JSON.parse(`"${hits[hits.length - 1][1]}"`);
    return typeof text === 'string' && text.trim() ? text : null;
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

/**
 * The meta file of ONE subagent, cut down to structure.
 * `description` and `worktreePath` are expressly NOT taken over (leak rule).
 * Every misstep (missing, broken, empty) ⇒ empty fields, never a throw.
 */
export function readMeta(path) {
  try {
    const o = JSON.parse(readFileSync(path, 'utf8'));
    return {
      agent_type: clean(o && o.agentType) || null,
      spawn_depth: Number.isFinite(Number(o && o.spawnDepth)) ? Number(o.spawnDepth) : null,
      tool_use_id: clean(o && o.toolUseId) || null,
      model: clean(o && o.model) || null,
    };
  } catch {
    return { agent_type: null, spawn_depth: null, tool_use_id: null, model: null };
  }
}

/**
 * REFUSE instead of trim — twin of `ident()` (`parser.js`), same reason: a trimmed prompt looks
 * like an identifier and would pass the leak check. What is not an identifier becomes `null`;
 * `<`/`>` stay allowed so the mask marker of the fixtures survives up to the leak check.
 */
export function clean(value, max = 64) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > max) return null;
  return ID_ALLOWED.test(raw) ? raw : null;
}

/**
 * The subagent files of ONE session (`<session>/subagents/`) PLUS the workflow agents
 * (`<session>/subagents/workflows/<wf>/agent-*.jsonl`). Recognised only by the directory:
 * `workflow_id` = folder name, `null` for classic ones. No folder ⇒ empty list.
 */
export function readSubagents(sessionDir, nowMs) {
  const dir = join(sessionDir, 'subagents');
  const out = [];
  const read = (d, workflowId) => {
    let files;
    try { files = readdirSync(d); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.jsonl') || (workflowId !== null && !f.startsWith('agent-'))) continue;
      const path = join(d, f);
      let st;
      try { st = statSync(path); } catch { continue; }
      const agentId = f.replace(/^agent-/, '').replace(/\.jsonl$/, '');
      out.push({
        agent_id: clean(agentId),
        workflow_id: workflowId,
        file: path,
        bytes: st.size,
        mtime: isoFrom(st.mtimeMs),
        mtime_ms: st.mtimeMs,
        age_seconds: Math.max(0, Math.round((nowMs - st.mtimeMs) / 1000)),
        ...readMeta(join(d, `agent-${agentId}.meta.json`)),
      });
    }
  };
  read(dir, null);
  let runs = [];
  try { runs = readdirSync(join(dir, 'workflows')); } catch { /* no folder, or a file */ }
  for (const wf of runs) {
    const wfId = clean(wf);
    if (wfId !== null) read(join(dir, 'workflows', wf), wfId);
  }
  out.sort((a, b) => (a.agent_id || '').localeCompare(b.agent_id || ''));
  return out;
}

/**
 * The inventory of ONE project folder.
 * @param {string} dir  e.g. `<root>/c--dev-sample-app`
 */
export function projectInventory(dir, { nowMs = Date.now(), title = true } = {}) {
  const slug = dir.split(/[\\/]/).filter(Boolean).pop() || '';
  let files;
  try { files = readdirSync(dir); } catch { return { slug, sessions: [] }; }
  const sessions = [];
  for (const f of files) {
    if (!f.endsWith('.jsonl')) continue;
    const path = join(dir, f);
    let st;
    try { st = statSync(path); } catch { continue; }
    if (!st.isFile()) continue;
    const id = f.replace(/\.jsonl$/, '');
    const mark = title ? titleMark(path) : { present: false, chars: null };
    const subs = readSubagents(join(dir, id), nowMs);
    // Edge 1: the activity of a session is the YOUNGEST of the main file AND its subagent
    // files — otherwise a session counts as quiet while it waits for a running background agent.
    const youngestMs = subs.reduce((m, s) => Math.max(m, s.mtime_ms), st.mtimeMs);
    sessions.push({
      session_id: clean(id, 80),
      project_slug: slug,
      main_file: path,
      bytes: st.size,
      mtime: isoFrom(youngestMs),
      mtime_ms: youngestMs,
      age_seconds: Math.max(0, Math.round((nowMs - youngestMs) / 1000)),
      has_ai_title: mark.present,
      ai_title_chars: mark.chars,
      subagents: subs,
      subagent_count: subs.length,
    });
  }
  sessions.sort((a, b) => b.mtime_ms - a.mtime_ms);
  return { slug, sessions };
}

// ── Codex ─────────────────────────────────────────────────────────────────────────────
//  `~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<uuid>.jsonl` + the title index
//  `~/.codex/session_index.jsonl` (one line per rename: id · thread_name · updated_at).
//  An entry has the Claude shape plus `provider: 'codex'` and `index_file` (the title text is
//  looked up later, only on request, by `codexTitleText` — the inventory carries a MARK).

/** The default place of the Codex rollouts. Without a home directory there is no place — then `null`. */
export function codexRoot(home) {
  const h = home || process.env.USERPROFILE || process.env.HOME || '';
  return h ? join(h, '.codex', 'sessions') : null;
}

/** The title index next to the sessions folder (`~/.codex/session_index.jsonl`). */
export function codexIndexFile(root) {
  return root ? join(dirname(root), 'session_index.jsonl') : null;
}

const CODEX_FILE = /^rollout-.*?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/** id → `thread_name` of the index, the youngest `updated_at` winning. Missing/broken ⇒ empty map. */
function codexTitles(indexFile) {
  const out = new Map();
  let text;
  try { text = readFileSync(indexFile, 'utf8'); } catch { return out; }
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const id = clean(o && o.id, 80);
    if (!id || typeof o.thread_name !== 'string' || !o.thread_name.trim()) continue;
    const at = Date.parse(o.updated_at) || 0;
    const had = out.get(id);
    if (!had || at >= had.at) out.set(id, { at, name: o.thread_name });
  }
  return out;
}

/**
 * The TEXT of a Codex session's title (`thread_name`) — like `titleText`, only on request.
 * Missing, unreadable ⇒ `null`, never a throw.
 */
export function codexTitleText(indexFile, sessionId) {
  const hit = indexFile ? codexTitles(indexFile).get(clean(sessionId, 80)) : null;
  return hit ? hit.name : null;
}

function walkCodex(dir, depth, out) {
  let names;
  try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of names) {
    const path = join(dir, e.name);
    if (e.isDirectory()) { if (depth < 5) walkCodex(path, depth + 1, out); continue; }
    if (e.isFile() && CODEX_FILE.test(e.name)) out.push(path);
  }
}

/** The Codex sessions under one root, in the entry shape of `projectInventory`. */
export function codexInventory(root, { indexFile = codexIndexFile(root), nowMs = Date.now(), title = true } = {}) {
  const files = [];
  if (root) walkCodex(root, 0, files);
  const titles = title && indexFile ? codexTitles(indexFile) : new Map();
  const sessions = [];
  for (const path of files) {
    let st;
    try { st = statSync(path); } catch { continue; }
    const id = clean(CODEX_FILE.exec(path.split(/[\\/]/).pop())[1], 80);
    const t = titles.get(id);
    sessions.push({
      session_id: id,
      project_slug: 'codex',
      main_file: path,
      bytes: st.size,
      mtime: isoFrom(st.mtimeMs),
      mtime_ms: st.mtimeMs,
      age_seconds: Math.max(0, Math.round((nowMs - st.mtimeMs) / 1000)),
      has_ai_title: !!t,
      ai_title_chars: t ? t.name.length : null,
      subagents: [],
      subagent_count: 0,
      provider: 'codex',
      index_file: indexFile,
    });
  }
  sessions.sort((a, b) => b.mtime_ms - a.mtime_ms);
  return sessions;
}

// ── Antigravity ───────────────────────────────────────────────────────────────────────
//  `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl` (the shortened file;
//  see parser-antigravity.js) + `cache/last_conversations.json` (workspace path → conversation id).
//  An entry has the Claude shape plus `provider: 'antigravity'` and `workspace_slug` (the workspace path
//  slugged like a Claude project folder, `null` without a cache hit; the raw path never travels).
//  No title source exists: `has_ai_title` stays false. `conversations/<id>.db` is NOT read (deferred).

/** The default place of the Antigravity CLI data. Without a home directory there is no place — then `null`. */
export function antigravityRoot(home) {
  const h = home || process.env.USERPROFILE || process.env.HOME || '';
  return h ? join(h, '.gemini', 'antigravity-cli') : null;
}

const AG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** conversation id → workspace slug of `cache/last_conversations.json`. Missing/broken ⇒ empty map. */
function antigravityWorkspaces(root) {
  const out = new Map();
  let o;
  try { o = JSON.parse(readFileSync(join(root, 'cache', 'last_conversations.json'), 'utf8')); } catch { return out; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return out;
  for (const [workspace, id] of Object.entries(o)) {
    if (typeof id !== 'string' || out.has(id)) continue;
    out.set(id, clean(String(workspace).replace(/[^A-Za-z0-9]/g, '-'), 120));
  }
  return out;
}

/** The Antigravity sessions under one root, in the entry shape of `projectInventory`. */
export function antigravityInventory(root, { nowMs = Date.now() } = {}) {
  const sessions = [];
  if (!root) return sessions;
  let ids;
  try { ids = readdirSync(join(root, 'brain')); } catch { return sessions; }
  const workspaces = antigravityWorkspaces(root);
  for (const folder of ids) {
    if (!AG_ID.test(folder)) continue;
    const path = join(root, 'brain', folder, '.system_generated', 'logs', 'transcript.jsonl');
    let st;
    try { st = statSync(path); } catch { continue; }
    if (!st.isFile()) continue;
    sessions.push({
      session_id: clean(folder, 80),
      project_slug: 'antigravity',
      main_file: path,
      bytes: st.size,
      mtime: isoFrom(st.mtimeMs),
      mtime_ms: st.mtimeMs,
      age_seconds: Math.max(0, Math.round((nowMs - st.mtimeMs) / 1000)),
      has_ai_title: false,
      ai_title_chars: null,
      subagents: [],
      subagent_count: 0,
      provider: 'antigravity',
      workspace_slug: workspaces.get(folder) ?? null,
    });
  }
  sessions.sort((a, b) => b.mtime_ms - a.mtime_ms);
  return sessions;
}

/**
 * The whole inventory under one root (`~/.claude/projects` or a fixture root).
 * Order: sessions per project by mtime descending (the freshest first) — the order a
 * "top 3 active" view needs, and it costs nothing here.
 */
export function inventory({ root, nowMs = Date.now(), title = true, codexRoot: codex = null, codexIndex = undefined, antigravityRoot: antigravity = null } = {}) {
  const as_of = isoFrom(nowMs);
  const projects = [];
  let entries = [];
  if (root) { try { entries = readdirSync(root); } catch { entries = []; } }
  for (const e of entries) {
    const path = join(root, e);
    try { if (!statSync(path).isDirectory()) continue; } catch { continue; }
    const p = projectInventory(path, { nowMs, title });
    if (p.sessions.length) projects.push(p);
  }
  // Codex is opt-in: only a given root is read, so a test or a host that does not ask never sees ~/.codex.
  if (codex) {
    const sessions = codexInventory(codex, { indexFile: codexIndex, nowMs, title });
    if (sessions.length) projects.push({ slug: 'codex', sessions });
  }
  // Antigravity is opt-in as well: only a given root is read, never ~/.gemini on its own.
  if (antigravity) {
    const sessions = antigravityInventory(antigravity, { nowMs });
    if (sessions.length) projects.push({ slug: 'antigravity', sessions });
  }
  projects.sort((a, b) => a.slug.localeCompare(b.slug));
  const sessions_total = projects.reduce((n, p) => n + p.sessions.length, 0);
  const subagents_total = projects.reduce((n, p) => n + p.sessions.reduce((m, s) => m + s.subagent_count, 0), 0);
  return { version: INVENTORY_VERSION, as_of, root: root || null, projects, sessions_total, subagents_total };
}

/** Find a session in the inventory — the entry point for `parser.js`/`derive.js`. */
export function findSession(inv, sessionId) {
  for (const p of (inv && inv.projects) || []) {
    for (const s of p.sessions) if (s.session_id === sessionId) return s;
  }
  return null;
}

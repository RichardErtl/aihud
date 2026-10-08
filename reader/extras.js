// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · SESSION EXTRAS (sidecar, title text, git state)
//
//  Everything the contract carries about a session that is NOT counted from the transcript
//  lines: what the user wrote about it (the SIDECAR), the `ai-title` text (only on request) and
//  the git state (`git.js`). File access lives here; `contract.js` only maps what this returns.
//
//  THE SIDECAR: `<aihud home>/sessions/<sessionId>.json`, written by the aihud node (never by
//  this reader). Its shape is SHARED with the writer and fixed:
//      { "title"?: string, "note"?: string, "closed"?: boolean, "closed_at"?: ISO-8601 string }
//  A field of the wrong type is dropped, an unknown field is ignored, a missing or broken file
//  means "no override" — never an error.
//
//  THE AIHUD HOME (where `sessions/` lies), first hit wins:
//    1. the option `aihudHome` (tests, hosts)
//    2. the environment variable `AIHUD_HOME`
//    3. `<user home>/.aihud`
//  The reader never writes there and never reads anything under it except `sessions/<id>.json`.
//
//  TEXT: `title` and `note` are plain text. They are read ONLY with `withText: true` (a local
//  display that shows the user his own words). Without it this file returns structure only —
//  the leak rule of the reader stays the default.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { clean, titleText, codexTitleText } from './inventory.js';
import { readGit } from './git.js';

/** ISO-8601 with date AND time, e.g. `2026-09-30T21:04:00Z` / `...T21:04:00.123+02:00`. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/** The directory that holds `sessions/`. Without any home there is no place — then `null`. */
export function aihudHome({ aihudHome: explicit = null, env = process.env } = {}) {
  if (explicit) return explicit;
  if (env.AIHUD_HOME) return env.AIHUD_HOME;
  const h = env.USERPROFILE || env.HOME || '';
  return h ? join(h, '.aihud') : null;
}

/**
 * The sidecar of ONE session, checked field by field.
 * @returns {{title?: string, note?: string, closed?: boolean, closed_at?: string} | null}
 *          `null` = no file / not readable / not an object.
 */
export function readSidecar(sessionId, { aihudHome: explicit = null, env = process.env, withText = false } = {}) {
  const id = clean(sessionId, 80);
  const home = aihudHome({ aihudHome: explicit, env });
  // Only an identifier becomes a file name — `../` or a separator can never reach the path.
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id) || !home) return null;
  let o;
  try { o = JSON.parse(readFileSync(join(home, 'sessions', `${id}.json`), 'utf8')); } catch { return null; }
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const out = {};
  if (withText && typeof o.title === 'string' && o.title.trim()) out.title = o.title;
  if (withText && typeof o.note === 'string' && o.note.trim()) out.note = o.note;
  if (typeof o.closed === 'boolean') out.closed = o.closed;
  if (typeof o.closed_at === 'string' && ISO.test(o.closed_at) && Number.isFinite(Date.parse(o.closed_at))) {
    out.closed_at = o.closed_at;
  }
  return out;
}

/**
 * All extras of ONE loaded session (`derive.js loadSession()`), ready for `contractSheet`.
 * @param {object} loaded  `{ entry, main, fleet }`
 * @param {object} [opt]   `aihudHome`, `env`, `nowMs`, `withText`
 * @returns {{sidecar: object|null, ai_title: string|null, git: object|null}}
 */
export function readExtras(loaded, { aihudHome: explicit = null, env = process.env, nowMs = Date.now(), withText = false } = {}) {
  const entry = (loaded && loaded.entry) || {};
  const id = (loaded && loaded.main && loaded.main.session_id) || entry.session_id;
  const codex = entry.provider === 'codex';
  const antigravity = entry.provider === 'antigravity';   // no title, no repository in the transcript
  return {
    sidecar: readSidecar(id, { aihudHome: explicit, env, withText }),
    // Codex: the `thread_name` of `session_index.jsonl`; Claude: the `aiTitle` in the file's tail.
    ai_title: !withText || antigravity ? null : codex ? codexTitleText(entry.index_file, entry.session_id)
      : entry.main_file ? titleText(entry.main_file) : null,
    // A rollout carries `cwd` only inside payloads the reader never opens: no repository is claimed.
    git: codex || antigravity ? null : readGit(loaded, { nowMs, withText }),
  };
}

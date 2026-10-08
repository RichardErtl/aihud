// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · GIT STATE OF A SESSION
//
//  Plain file reads, NO git process and NO network: `.git/HEAD`, the ref files, `packed-refs`
//  and the reflog `logs/HEAD`. What comes out:
//   · `start_head` — the commit HEAD pointed at when the session began. From the reflog: the
//     `old` side of the first HEAD move AFTER the session start; no move since then ⇒ the current
//     HEAD. No reflog, or a start older than the reflog window ⇒ `null` (never guessed).
//   · `commits[]` — `{sha, at, first_line?, source}`:
//       `transcript` = `toolUseResult.gitOperation.commit.sha` of the session's own lines
//         (surely THIS session; `sha` is abbreviated there and widened to the full hash when the
//         reflog knows it),
//       `reflog`     = `commit…` entries of `logs/HEAD` inside the session's time window
//         (maybe ANOTHER session in the same checkout — hence the source travels along).
//     `first_line` is commit text: only with `withText: true`.
//   · `dirty` — always `null` here ("not determined"). Telling a dirty tree needs `git status`,
//     i.e. a process start, and the reader core starts no process (network probe). A host that
//     may start processes can fill it; an ABSENT flag would read as "clean", `null` does not.
//
//  WHERE: the `cwd` of the first transcript line whose path matches the transcript FOLDER slug
//  (the slug is the key; drive letter case varies, so the match is case-insensitive). From there
//  upwards to the first `.git`. A worktree (`.git` is a file `gitdir: …`) is followed for HEAD;
//  its commits come from the transcript only (source `reflog` stays with the main checkout).
//
//  REFLOG WINDOW: entries older than 90 days are not read (git's default expiry — older gaps
//  are unprovable).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';

export const REFLOG_DAYS = 90;
/** How far into the main file the `cwd` search reads. */
export const CWD_HEAD_BYTES = 4 * 1024 * 1024;

const SHA = /^[0-9a-f]{40}$/;
const ZERO = /^0{40}$/;

/** The folder slug Claude Code gives a working directory: every non-alphanumeric ⇒ `-`. */
export function slugOf(path) {
  return String(path || '').replace(/[^A-Za-z0-9]/g, '-');
}

/** Bytes `sessionCwd` has read so far — lets a probe prove the cache (a hit reads 0 bytes). */
export const cwdReads = { bytes: 0 };
const cwdCache = new Map();

/**
 * The first `cwd` of the main file whose slug matches the folder slug (case-insensitive).
 * Only the head of the file is read. Nothing found ⇒ `null`.
 * Cached per file + slug: a found `cwd` for good (a transcript only grows at its end, the head
 * never changes); a miss only while size and mtime stay the same.
 */
export function sessionCwd(mainFile, slug, maxBytes = CWD_HEAD_BYTES) {
  if (!mainFile || !slug) return null;
  let fd = null;
  try {
    const st = statSync(mainFile);
    const key = `${mainFile}|${slug}`;
    const hit = cwdCache.get(key);
    if (hit && (hit.cwd || (hit.size === st.size && hit.mtimeMs === st.mtimeMs))) return hit.cwd;
    const length = Math.min(st.size, maxBytes);
    const buffer = Buffer.alloc(length);
    fd = openSync(mainFile, 'r');
    cwdReads.bytes += readSync(fd, buffer, 0, length, 0);
    const remember = (cwd) => { cwdCache.set(key, { cwd, size: st.size, mtimeMs: st.mtimeMs }); return cwd; };
    const want = String(slug).toLowerCase();
    const lines = buffer.toString('utf8').split('\n');
    if (length === maxBytes) lines.pop();          // the last piece may be cut
    for (const raw of lines) {
      if (!raw.includes('"cwd"')) continue;
      let o;
      try { o = JSON.parse(raw); } catch { continue; }
      if (o && typeof o.cwd === 'string' && slugOf(o.cwd).toLowerCase() === want) return remember(o.cwd);
    }
    return remember(null);
  } catch {
    return null;
  } finally {
    if (fd !== null) { try { closeSync(fd); } catch { /* ignore */ } }
  }
}

const readText = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

/**
 * The repository a directory belongs to: walk up to the first `.git`.
 * @returns {{gitdir: string, commondir: string, worktree: boolean} | null}
 */
export function findRepo(dir) {
  let d = dir ? resolve(dir) : null;
  while (d) {
    const dot = join(d, '.git');
    if (isDir(dot)) return { gitdir: dot, commondir: dot, worktree: false };
    if (isFile(dot)) {
      const m = /^gitdir:\s*(.+?)\s*$/m.exec(readText(dot) || '');
      if (!m) return null;
      const gitdir = isAbsolute(m[1]) ? m[1] : resolve(d, m[1]);
      const common = (readText(join(gitdir, 'commondir')) || '').trim();
      const commondir = common ? (isAbsolute(common) ? common : resolve(gitdir, common)) : gitdir;
      return { gitdir, commondir, worktree: true };
    }
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
  return null;
}

/** The commit HEAD points at NOW: detached sha, loose ref (worktree, then common) or packed-refs. */
export function resolveHead(repo) {
  const head = (readText(join(repo.gitdir, 'HEAD')) || '').trim();
  if (SHA.test(head)) return head;
  const m = /^ref:\s*(refs\/\S+)$/.exec(head);
  if (!m) return null;
  for (const base of [repo.gitdir, repo.commondir]) {
    const loose = (readText(join(base, ...m[1].split('/'))) || '').trim();
    if (SHA.test(loose)) return loose;
  }
  for (const line of (readText(join(repo.commondir, 'packed-refs')) || '').split(/\r?\n/)) {
    const p = /^([0-9a-f]{40}) (\S+)$/.exec(line);
    if (p && p[2] === m[1]) return p[1];
  }
  return null;
}

const reflogCache = new Map();

/**
 * `logs/HEAD` as entries `{old, new, at_ms, message}`, oldest first. Name and e-mail of the
 * line are never taken over. No file ⇒ `null` (not the same as "no entries").
 */
export function readReflog(gitdir) {
  const path = join(gitdir, 'logs', 'HEAD');
  let st;
  try { st = statSync(path); } catch { return null; }
  const hit = reflogCache.get(path);
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.entries;
  const entries = [];
  for (const line of (readText(path) || '').split(/\r?\n/)) {
    const m = /^([0-9a-f]{40}) ([0-9a-f]{40}) [^\t]*> (\d+) [+-]\d{4}(?:\t(.*))?$/.exec(line);
    if (m) entries.push({ old: m[1], new: m[2], at_ms: Number(m[3]) * 1000, message: m[4] || '' });
  }
  entries.sort((a, b) => a.at_ms - b.at_ms);
  reflogCache.set(path, { mtimeMs: st.mtimeMs, size: st.size, entries });
  return entries;
}

/** `commit: x` · `commit (amend): x` · `commit (initial): x` · `commit (merge): x` ⇒ `x`. */
function commitLine(message) {
  const m = /^commit(?: \([a-z-]+\))?: (.*)$/.exec(message || '');
  return m ? m[1] : null;
}

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

/**
 * The git state of ONE loaded session (`derive.js loadSession()`).
 * @returns {{start_head: string|null, commits: object[], dirty: null} | null}
 *          `null` = neither a repository found nor a commit in the transcript.
 */
export function readGit(loaded, { nowMs = Date.now(), withText = false } = {}) {
  const entry = (loaded && loaded.entry) || {};
  const main = (loaded && loaded.main) || {};
  const series = [main, ...((loaded && loaded.fleet) || []).map((f) => f.series || {})];
  const start = main.first_time;
  const end = Math.max(main.last_time || 0, entry.mtime_ms || 0) || null;
  const cutoff = nowMs - REFLOG_DAYS * 86_400_000;

  const cwd = sessionCwd(entry.main_file, entry.project_slug);
  const repo = cwd ? findRepo(cwd) : null;
  const log = repo ? readReflog(repo.gitdir) : null;
  const recent = (log || []).filter((e) => e.at_ms >= cutoff);

  let start_head = null;
  if (repo && log && start != null && start >= cutoff) {
    const after = recent.find((e) => e.at_ms > start);
    start_head = after ? (ZERO.test(after.old) ? null : after.old) : resolveHead(repo);
  }

  // Commit entries of the main checkout's reflog (a worktree: none — its source is the transcript).
  const logged = repo && !repo.worktree
    ? recent.filter((e) => commitLine(e.message) != null)
    : [];
  const commits = [];
  const taken = new Set();
  const seen = new Set();
  for (const s of series) {
    for (const c of s.git_commits || []) {
      if (seen.has(c.sha)) continue;
      seen.add(c.sha);
      const match = logged.filter((e) => e.new.startsWith(c.sha));
      const full = match.length === 1 ? match[0] : null;
      if (full) taken.add(full.new);
      commits.push({
        sha: full ? full.new : c.sha,
        at_ms: c.time,
        first_line: full ? commitLine(full.message) : null,
        source: 'transcript',
      });
    }
  }
  if (start != null && end != null) {
    for (const e of logged) {
      if (e.at_ms < start || e.at_ms > end || taken.has(e.new)) continue;
      taken.add(e.new);
      commits.push({ sha: e.new, at_ms: e.at_ms, first_line: commitLine(e.message), source: 'reflog' });
    }
  }
  commits.sort((a, b) => (a.at_ms ?? 0) - (b.at_ms ?? 0));
  if (!repo && !commits.length) return null;
  return {
    start_head,
    commits: commits.map((c) => {
      const out = { sha: c.sha };
      if (c.at_ms != null) out.at = iso(c.at_ms);
      if (withText && c.first_line) out.first_line = c.first_line;
      out.source = c.source;
      return out;
    }),
    dirty: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE FIXTURE MASKER
//
//  It turns a REAL transcript of a machine into a fixture that may go into the repository.
//  Two jobs, both irreversible in the direction of "less":
//   1. SHORTEN — the noise lines (`attachment`, `bridge-session`, `queue-operation`,
//      `atis-latch`, `file-history-*`) drop out, the rest is cut at the N-th human line.
//      What stays is a coherent series of real turns.
//   2. MASK — EVERY string whose key is not in STRUCTURE is replaced by the marker `<<TEXT>>`.
//      Not shortened, not anonymised: replaced. The marker is at the same time the proof in the
//      leak check (`leak-check.js`): if `<<TEXT>>` shows up anywhere in the reader output,
//      plain text has leaked.
//
//  THE ONLY EXCEPTION, named explicitly: the `task-notification` line. Its content is structure
//  INSIDE the plain-text field (`<tool-use-id>` + `<status>` = the only end signal of a subagent).
//  Of it exactly these two marks stay; `<summary>`, `<note>`, `<result>`, `<output-file>` (the
//  whole worker report!) fall as `<<TEXT>>`.
//
//  The shipped fixtures were additionally anonymised after masking (same replacement everywhere, so
//  every count and every token number stays as measured):
//   - the two session ids, the project folder name, the agent type names and the skill name
//     (`cleanup` instead of the original) were replaced once, by hand;
//   - `remapIds()` (run: `node reader/fixtures/mask.js --remap <projects-dir>`) replaces EVERY
//     per-line id with ONE deterministic, format-preserving mapping: sha256(seed + original id)
//     with seed `aihud-fixtures-v1`. Fields / id shapes covered (by value shape, so every key that
//     carries them is hit: uuid, parentUuid, leafUuid, promptId, toolUseID, sourceToolUseID,
//     sourceToolAssistantUUID, tool_use_id, toolUseId, id, requestId, agentId, resumedAgentId,
//     <task-id>, <tool-use-id>):
//       v4 UUIDs (except the two already synthetic session ids) · agent ids `a` + 16 hex ·
//       `toolu_*` · `msg_*` · `req_*`.
//     Parent / leaf / tool links stay consistent (same input = same output); agent transcript file
//     names (`agent-<id>.jsonl` / `.meta.json`) are renamed accordingly.
//   - Timestamps stay as recorded (no identity in them; the derived durations depend on them).
//
//  The run is manual, not automatic — the fixtures lie finished in the repository:
//    node reader/fixtures/mask.js <source-jsonl> <target-directory> [human-limit]
//  No test calls it. It stands here so the origin of the fixtures stays traceable.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, basename, dirname } from 'node:path';

export const MARKER = '<<TEXT>>';

/** Line types that drop out as pure noise (measured: 347 of 992 lines). */
const NOISE_TYPES = new Set([
  'attachment', 'bridge-session', 'queue-operation', 'atis-latch',
  'file-history-snapshot', 'file-history-delta', 'mode',
]);

/**
 * Keys whose string value is STRUCTURE and therefore stays verbatim.
 * Every entry is a deliberate decision — the list never grows "for convenience".
 */
const STRUCTURE = new Set([
  // line frame
  'type', 'subtype', 'uuid', 'parentUuid', 'leafUuid', 'promptId', 'sessionId', 'requestId',
  'timestamp', 'version', 'gitBranch', 'entrypoint', 'permissionMode', 'promptSource',
  'userType', 'agentId', 'attributionSkill', 'attributionAgent', 'effort', 'kind', 'level',
  'toolUseID', 'sourceToolUseID', 'sourceToolAssistantUUID',
  // message frame
  'role', 'model', 'id', 'stop_reason', 'service_tier', 'speed',
  // block frame
  'name', 'tool_use_id', 'status', 'resolvedModel', 'resumedAgentId', 'is_error',
  // tool inputs that are STRUCTURE (never prose)
  'skill', 'subagent_type', 'isolation', 'run_in_background',
  // meta.json
  'agentType', 'toolUseId', 'spawnDepth',
  // ai-title carries NO structure key: `aiTitle` is plain text and gets masked.
]);

/** Keys that drop out completely (ballast or path betrayal). */
const DROP = new Set([
  'iterations', 'cache_creation', 'server_tool_use', 'output_tokens_details',
  'inference_geo', 'diagnostics', 'stop_details', 'cwd', 'worktreePath',
  'hookInfos', 'hookAdditionalContext', 'classifierMetaLines', 'outputFile',
]);

/** Of a `task-notification` payload exactly two marks stay. */
export function shortenTaskNotification(text) {
  const id = /<tool-use-id>([^<]*)<\/tool-use-id>/.exec(text);
  const st = /<status>([^<]*)<\/status>/.exec(text);
  const task = /<task-id>([^<]*)<\/task-id>/.exec(text);
  if (!id && !st) return MARKER;
  return '<task-notification>'
    + (task ? `<task-id>${task[1]}</task-id>` : '')
    + (id ? `<tool-use-id>${id[1]}</tool-use-id>` : '')
    + (st ? `<status>${st[1]}</status>` : '')
    + `<summary>${MARKER}</summary></task-notification>`;
}

/** Deep walk: everything that is not a structure key and is a string becomes the marker. */
export function mask(value, key, structure = STRUCTURE) {
  if (typeof value === 'string') {
    if (structure.has(key)) return value;
    if (value.startsWith('<task-notification>')) return shortenTaskNotification(value);
    return MARKER;
  }
  if (Array.isArray(value)) return value.map((w) => mask(w, key, structure));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROP.has(k)) continue;
      out[k] = mask(v, k, structure);
    }
    return out;
  }
  return value;
}

/**
 * Shorten + mask a JSONL.
 * `humanLimit` = after which human line it stops (0 = no cut).
 * `lineLimit` = hard upper bound of kept lines (0 = none) — for subagent files.
 */
export function maskJsonl(text, humanLimit = 0, lineLimit = 0) {
  const out = [];
  let human = 0;
  let title = 0;
  let lastPrompt = 0;
  for (const line of text.split('\n')) {
    if (lineLimit && out.length >= lineLimit) break;
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    if (NOISE_TYPES.has(o.type)) continue;
    if (o.type === 'ai-title' && title++ > 0) continue;
    if (o.type === 'last-prompt' && lastPrompt++ > 0) continue;
    if (o.type === 'user' && o.origin && o.origin.kind === 'human') {
      human++;
      if (humanLimit && human > humanLimit) break;
    }
    out.push(JSON.stringify(mask(o, '')));
  }
  return out.join('\n') + '\n';
}

// ── Id remapping ─────────────────────────────────────────────────────────────────────────────
export const ID_SEED = 'aihud-fixtures-v1';
/** Session ids that are already synthetic and are referenced by the tests — never remapped. */
const KEEP = new Set(['5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10', 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36']);
const ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}|\ba[0-9a-f]{16}\b|\b(?:toolu|msg|req)_[A-Za-z0-9]+/g;
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

function fakeId(old) {
  const h = createHash('sha256').update(ID_SEED + '\0' + old).digest();
  const hex = h.toString('hex');
  if (old.includes('-')) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${'89ab'[h[16] % 4]}${hex.slice(18, 21)}-${hex.slice(21, 33)}`;
  }
  if (/^a[0-9a-f]{16}$/.test(old)) return 'a' + hex.slice(0, 16);
  const cut = old.indexOf('_') + 1;
  let body = '';
  for (let i = 0; i < old.length - cut; i++) body += ALNUM[h[i % h.length] % ALNUM.length];
  return old.slice(0, cut) + body;
}

/** Replace every per-line id in a text by its deterministic fake (same id → same fake, everywhere). */
export function remapIds(text) {
  return text.replace(ID_RE, (id) => (KEEP.has(id) ? id : fakeId(id)));
}

/** Remap all files under a projects directory in place; file names that carry an id are renamed. */
export function remapTree(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { remapTree(p); continue; }
    writeFileSync(p, remapIds(readFileSync(p, 'utf8')));
    const nn = remapIds(e.name);
    if (nn !== e.name) renameSync(p, join(dir, nn));
  }
}

// ── Codex rollouts (AX.1) ────────────────────────────────────────────────────────────────────
//  Same rule as above - every string that is not structure becomes `<<TEXT>>` - with the Codex
//  structure keys. The 248 KB command-output lines shrink by themselves: `stdout`, `stderr`,
//  `aggregated_output`, `formatted_output`, `command`, `base_instructions.text` are strings and fall to the
//  marker. Every number (tokens, started_at_ms, completed_at_ms, durations) stays as recorded.
export const CODEX_STRUCTURE = new Set([
  'type', 'timestamp', 'model', 'status', 'role', 'phase', 'kind', 'name',
  'id', 'turn_id', 'root_turn_id', 'thread_id', 'session_id', 'response_id', 'call_id', 'client_id',
  'cli_version', 'model_provider',
]);
const CODEX_ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\b[a-z]{2,6}_[A-Za-z0-9]{16,}\b/g;
/** Remap the ids inside string VALUES only (never a key: `call_id` must stay `call_id`). */
function remapValues(value, keep) {
  if (typeof value === 'string') return value.replace(CODEX_ID_RE, (id) => keep[id] || fakeId(id));
  if (Array.isArray(value)) return value.map((w) => remapValues(w, keep));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remapValues(v, keep)]));
  return value;
}
/** Mask a Codex rollout and remap every id (format-preserving, deterministic; `keep` maps fixed ids). */
export function maskCodexJsonl(text, keep = {}) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    out.push(JSON.stringify(remapValues(mask(o, '', CODEX_STRUCTURE), keep)));
  }
  return out.join('\n') + '\n';
}

/** The synthetic session id the shipped Codex fixture carries instead of the real one. */
export const CODEX_FIXTURE_ID = 'c0dec0de-5a17-4c0d-9e5e-1000000000a1';


// ── Antigravity transcripts (AX.2) ───────────────────────────────────────────────────────────
//  `brain/<id>/.system_generated/logs/transcript.jsonl` of the Antigravity CLI. Same rule - every
//  string that is not structure becomes `<<TEXT>>` (prompt, thinking, error text, every tool argument
//  VALUE; the argument KEYS and all numbers stay). The ONE exception, named: the head of a tool result
//  `Created At: <iso>` / `Completed At: <iso>` is structure inside the text field (the only place
//  Antigravity records a duration); of a result exactly these two lines stay, the rest falls.
//  No id travels inside a line (the conversation id is the folder name), so nothing is remapped.
export const ANTIGRAVITY_STRUCTURE = new Set(['source', 'type', 'status', 'created_at', 'name', 'truncated_fields']);
const AG_PROSE_HEAD = /^Created At: (\S+)\r?\nCompleted At: (\S+)/;
/** Mask an Antigravity transcript (deterministic; the same input is the same output, byte for byte). */
export function maskAntigravityJsonl(text) {
  const out = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const m = mask(o, '', ANTIGRAVITY_STRUCTURE);
    const head = typeof o.content === 'string' ? AG_PROSE_HEAD.exec(o.content) : null;
    if (head) m.content = `Created At: ${head[1]}\nCompleted At: ${head[2]}\n${MARKER}`;
    out.push(JSON.stringify(m));
  }
  return out.join('\n') + '\n';
}

/** The synthetic conversation id the shipped Antigravity fixture carries (the folder name). */
export const ANTIGRAVITY_FIXTURE_ID = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000b2';

// ── Manual run ───────────────────────────────────────────────────────────────────────────────
if (process.argv[1] && process.argv[1].endsWith('mask.js') && process.argv[2] === '--remap') {
  remapTree(process.argv[3]);
  console.log('remapped:', process.argv[3]);
} else if (process.argv[1] && process.argv[1].endsWith('mask.js') && process.argv[2] === '--codex') {
  // node reader/fixtures/mask.js --codex <rollout.jsonl> <out.jsonl>  (how fixtures/codex/ was made)
  const [, , , src, out] = process.argv;
  if (!src || !out) { console.error('Usage: node mask.js --codex <rollout-jsonl> <out-jsonl>'); process.exit(2); }
  const text = readFileSync(src, 'utf8');
  const meta = JSON.parse(text.split(String.fromCharCode(10)).find((l) => l.trim()));
  const realId = meta && meta.payload && meta.payload.id;
  writeFileSync(out, maskCodexJsonl(text, realId ? { [realId]: CODEX_FIXTURE_ID } : {}));
  console.log('codex fixture:', out);
} else if (process.argv[1] && process.argv[1].endsWith('mask.js') && process.argv[2] === '--antigravity') {
  // node reader/fixtures/mask.js --antigravity <transcript.jsonl> <out.jsonl>  (how fixtures/antigravity/ was made)
  const [, , , src, out] = process.argv;
  if (!src || !out) { console.error('Usage: node mask.js --antigravity <transcript-jsonl> <out-jsonl>'); process.exit(2); }
  writeFileSync(out, maskAntigravityJsonl(readFileSync(src, 'utf8')));
  console.log('antigravity fixture:', out);
} else if (process.argv[1] && process.argv[1].endsWith('mask.js')) {
  const [source, target, limit] = process.argv.slice(2);
  if (!source || !target) {
    console.error('Usage: node mask.js <source-jsonl> <target-directory> [human-limit]');
    process.exit(2);
  }
  const g = Number(limit) || 0;
  const name = basename(source);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, name), maskJsonl(readFileSync(source, 'utf8'), g));
  console.log('main:', name);

  const subSource = join(dirname(source), name.replace(/\.jsonl$/, ''), 'subagents');
  if (existsSync(subSource)) {
    const subTarget = join(target, name.replace(/\.jsonl$/, ''), 'subagents');
    mkdirSync(subTarget, { recursive: true });
    const keep = (process.env.READER_SUBS || '').split(',').filter(Boolean);
    for (const f of readdirSync(subSource)) {
      const id = f.replace(/^agent-/, '').replace(/\.(jsonl|meta\.json)$/, '');
      if (keep.length && !keep.includes(id)) continue;
      if (f.endsWith('.meta.json')) {
        writeFileSync(join(subTarget, f), JSON.stringify(mask(JSON.parse(readFileSync(join(subSource, f), 'utf8')), '')));
      } else if (f.endsWith('.jsonl')) {
        const cap = Number(process.env.READER_SUB_LINES) || 0;
        writeFileSync(join(subTarget, f), maskJsonl(readFileSync(join(subSource, f), 'utf8'), 0, cap));
      }
      console.log('sub:', f);
    }
  }
}

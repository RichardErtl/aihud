// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · CODEX ADAPTER
//
//  One OpenAI Codex CLI rollout (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`) in, the SAME
//  neutral event series `parser.js` delivers out. Everything above the seam (`derive.js`,
//  `contract.js`, the tiles) sees only `{kind, time, model, window, in/out/cache_*}`.
//
//  MEASURED (Codex 0.160.0, the rollout of 2026-10-01, 35 lines; `results/aihud-leser-annahmen-…`):
//   · every line `{timestamp, ordinal, type, payload}`; the top-level `type` is `session_meta`,
//     `event_msg` (payload.type: task_started · item_completed · token_count · task_complete),
//     `response_item`, `turn_context`, `world_state`, `token_usage_record`.
//   · USAGE per answer = the top-level line `token_usage_record` (`payload.usage`, keyed by
//     `payload.response_id`). `event_msg token_count` repeats it cumulatively — NOT counted again.
//   · `input_tokens` INCLUDES `cached_input_tokens` (total_tokens = input + output, measured on all
//     4 answers). The neutral event splits it like Claude's: in = input − cached, cache_read = cached.
//     `cache_write_input_tokens` was 0 on all 4 answers: treated as part of `input_tokens` as well
//     (UNVERIFIED — no sample with a value ≠ 0). `window_used` = input_tokens, what sat in the window.
//     `reasoning_output_tokens` travels as `reasoning`; it is NOT added to `out` (0 in the sample;
//     whether `output_tokens` already contains it is UNVERIFIED).
//   · MODEL per turn = `turn_context.payload.model` (the usage lines carry none).
//   · TURN BOUNDARY = `task_started` (→ `human`) … `task_complete` (→ `turn_end`). The
//     `response_item message` lines (3× role developer = instructions, role user) are NOT turns:
//     no message line is ever read, which is the whole filter.
//   · TOOL DURATION = `event_msg item_completed` with `started_at_ms`/`completed_at_ms` (both ends
//     measured by Codex itself); `item.type` UserMessage/AgentMessage/Reasoning are no tools.
//   · WINDOW = `model_context_window` in `task_started` / `token_count` — in the file. Fallback
//     only when the file names none: `CODEX_WINDOWS[model]`. Unknown ⇒ `null`, never a guess.
//
//  THE LEAK RULE holds as in `parser.js`: no `stdout`/`stderr`/`command`/`cwd`/message text and no
//  `base_instructions` is ever copied into an event; identifiers pass `ident()` (refused, not
//  scrubbed). THE FILE IS STREAMED: single lines reach 248 KB (full command output), the file is
//  never held whole — one line at a time, parsed, read for its numbers, dropped.
// ─────────────────────────────────────────────────────────────────────────────

import { openSync, readSync, closeSync } from 'node:fs';
import { PARSER_VERSION, ident, timeMs } from './parser.js';

export const CODEX_PROVIDER = 'codex';

/**
 * Fallback window table (kept by hand, ONLY for a rollout that names no `model_context_window`).
 * Only measured entries stand here; the file's own number always wins.
 */
export const CODEX_WINDOWS = {
  'gpt-6.1-sol': 258_400,   // measured 2026-10-01: `model_context_window` of Codex 0.160.0
};

/** Window size per Codex model id from the fallback table. Unknown ⇒ `null`. */
export function windowForCodexModel(model) {
  const id = String(model || '').trim();
  return Object.prototype.hasOwnProperty.call(CODEX_WINDOWS, id) ? CODEX_WINDOWS[id] : null;
}

/** `item.type`s of `item_completed` that are conversation, not tools. */
const NOT_A_TOOL = new Set(['UserMessage', 'AgentMessage', 'Reasoning']);

/**
 * Caveats of a Codex series, whitespace-free marks like the Claude ones in `derive.js`. Each names an
 * assumption no sample could check yet; they replace the two Claude-only marks on a Codex sheet.
 */
export const CODEX_UNCHECKED = [
  'codex_cache_write_inside_input_unchecked',
  'codex_reasoning_inside_output_unchecked',
  'codex_unknown_item_types_as_tools_unchecked',
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The neutral token kinds of a `token_usage_record.usage`; any field unreadable ⇒ `null`. */
export function codexUsageFrom(u) {
  if (!u || typeof u !== 'object') return null;
  const input = num(u.input_tokens);
  const cached = num(u.cached_input_tokens);
  const write = num(u.cache_write_input_tokens) ?? 0;
  const output = num(u.output_tokens);
  if (input == null || cached == null || output == null) return null;
  const fresh = input - cached - write;
  if (fresh < 0) return null;                     // the split does not add up: not delivered, not repaired
  return {
    in: fresh, out: output, cache_read: cached, cache_write: write,
    total: fresh + output + cached + write,
    window_used: input,
    reasoning: num(u.reasoning_output_tokens),
  };
}

/** The lines of a file, one at a time (sync, 64 KB chunks); only ONE line is ever held. */
export function* fileLines(path) {
  let fd = null;
  try { fd = openSync(path, 'r'); } catch { return; }
  try {
    const buf = Buffer.allocUnsafe(1 << 16);
    let parts = [];
    for (;;) {
      const n = readSync(fd, buf, 0, buf.length, null);
      if (!n) break;
      const chunk = buf.subarray(0, n);
      let from = 0;
      for (let at = chunk.indexOf(10, from); at !== -1; at = chunk.indexOf(10, from)) {
        parts.push(Buffer.from(chunk.subarray(from, at)));
        yield Buffer.concat(parts).toString('utf8');
        parts = [];
        from = at + 1;
      }
      if (from < n) parts.push(Buffer.from(chunk.subarray(from, n)));
    }
    if (parts.length) yield Buffer.concat(parts).toString('utf8');
  } finally {
    try { closeSync(fd); } catch { /* ignore */ }
  }
}

/**
 * Translate a Codex rollout (an iterable of lines) into an event series of the `parser.js` shape.
 * @param {Iterable<string>} lines
 * @param {object} opt
 * @param {'main'|'subagent'} opt.source
 * @param {Set<string>} opt.seen  duplicate guard (key = `response_id`), shared like in `parser.js`
 */
export function readCodexLines(lines, { source = 'main', seen = new Set() } = {}) {
  const events = [];
  const type_counts = Object.create(null);
  const models = new Set();
  const versions = new Set();
  let lines_total = 0;
  let lines_broken = 0;
  let lines_without_time = 0;
  let duplicates = 0;
  let usage_unsplit = 0;       // answers whose token split does not add up: counted, never repaired
  let records_seen = 0;        // token_usage_record lines; the token_count fallback only lives without them
  let session_id = null;
  let first_time = null;
  let last_time = null;
  let model = null;            // `turn_context.model` of the turn that is running
  let window = null;           // `model_context_window` of the file, as last seen
  let turn_id = null;

  for (const raw of lines) {
    if (!raw.trim()) continue;
    lines_total++;
    let o;
    try { o = JSON.parse(raw); } catch { lines_broken++; continue; }
    if (!o || typeof o !== 'object') { lines_broken++; continue; }
    const type = typeof o.type === 'string' ? o.type : '(none)';
    type_counts[type] = (type_counts[type] || 0) + 1;
    const p = o.payload && typeof o.payload === 'object' ? o.payload : {};

    const time = timeMs(o.timestamp);
    if (time == null) lines_without_time++;
    else {
      if (first_time == null || time < first_time) first_time = time;
      if (last_time == null || time > last_time) last_time = time;
    }

    if (type === 'session_meta') {
      if (!session_id) session_id = ident(p.id);
      if (p.cli_version) versions.add(ident(p.cli_version, 20));
    } else if (type === 'turn_context') {
      model = ident(p.model, 60);
      if (model) models.add(model);
    } else if (type === 'token_usage_record') {
      records_seen++;
      const u = codexUsageFrom(p.usage);
      if (!u) { usage_unsplit++; continue; }
      const key = ident(p.response_id, 80);
      if (key && seen.has(`codex:${key}`)) { duplicates++; continue; }
      if (key) seen.add(`codex:${key}`);
      const fromTable = window == null ? windowForCodexModel(model) : null;
      events.push({
        kind: 'usage', time, source, model, key,
        agent_id: null, skill: null, attributed_agent: null,
        ...u,
        window: window ?? fromTable,
        window_source: window != null ? 'file' : (fromTable != null ? 'table' : null),
      });
    } else if (type === 'event_msg') {
      if (p.type === 'task_started') {
        const w = num(p.model_context_window);
        if (w && w > 0) window = w;
        turn_id = ident(p.turn_id);
        events.push({
          kind: 'human', time, source, uuid: turn_id,
          prompt_source: null, entrypoint: null, user_type: null, permission_mode: null,
        });
      } else if (p.type === 'token_count') {
        const w = num(p.info && p.info.model_context_window);
        if (w && w > 0) window = w;
        // Fallback usage: ONLY used when the file holds no token_usage_record at all (decided at the
        // end, never both). No response_id here: the cumulative total_tokens is the key.
        const last = codexUsageFrom(p.info && p.info.last_token_usage);
        const cum = num(p.info && p.info.total_token_usage && p.info.total_token_usage.total_tokens);
        if (last && cum != null) {
          const key = `tc:${cum}`;
          if (!seen.has(`codex:${key}`)) {
            seen.add(`codex:${key}`);
            const fromTable = window == null ? windowForCodexModel(model) : null;
            events.push({
              kind: 'usage', time, source, model, key, fallback: true,
              agent_id: null, skill: null, attributed_agent: null,
              ...last,
              window: window ?? fromTable,
              window_source: window != null ? 'file' : (fromTable != null ? 'table' : null),
            });
          }
        }
      } else if (p.type === 'task_complete') {
        events.push({ kind: 'turn_end', time, source, uuid: ident(p.turn_id), duration_ms: num(p.duration_ms) });
      } else if (p.type === 'item_completed') {
        const item = p.item && typeof p.item === 'object' ? p.item : {};
        const name = ident(item.type, 60);
        const start = num(p.started_at_ms);
        const end = num(p.completed_at_ms);
        if (!name || NOT_A_TOOL.has(name) || start == null || end == null) continue;
        const id = ident(item.id);
        events.push({
          kind: 'tool_start', time: start, source, name,
          tool_use_id: id, message_uuid: id, line_model: model,
          skill: null, subagent_type: null, model: null, isolation: null, background: null,
        });
        events.push({
          kind: 'tool_end', time: end, source, tool_use_id: id,
          is_error: item.status === 'failed' || (num(item.exit_code) != null && item.exit_code !== 0),
        });
      }
    }
  }

  // The token_count fallback stands only for a file without any token_usage_record.
  const kept = records_seen > 0 ? events.filter((e) => !e.fallback) : events;
  for (const e of kept) delete e.fallback;

  return {
    version: PARSER_VERSION,
    provider: CODEX_PROVIDER,
    source,
    session_id,
    agent_id: null,
    lines_total,
    lines_broken,
    lines_without_time,
    duplicates,
    usage_unsplit,
    unchecked: [...CODEX_UNCHECKED],
    type_counts: { ...type_counts },
    first_time,
    last_time,
    models: [...models].sort(),
    versions: [...versions].sort(),
    entrypoints: [],
    prompt_sources: [],
    branches: [],
    branch_last: null,
    git_commits: [],
    events: kept,
  };
}

/** A rollout as text (tests, small inputs). */
export function readCodexTranscript(text, opt) {
  return readCodexLines(String(text || '').split(/\r?\n/), opt);
}

/** A rollout from disk, streamed. A missing or unreadable file is an empty series. */
export function readCodexFile(path, opt) {
  return readCodexLines(fileLines(path), opt);
}

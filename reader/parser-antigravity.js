// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · ANTIGRAVITY ADAPTER (reduced and honest)
//
//  One Google Antigravity CLI transcript
//  (`~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl`) in, the neutral
//  event series of `parser.js` out. It delivers what Antigravity really records — turns, tools,
//  errors, durations, and (CLI >= 1.2.17) token numbers per model step — and NOTHING else: no model,
//  no window, no title. A value the file does not carry stays null/absent; the HUD says "Antigravity
//  does not deliver it".
//
//  WHICH FILE: `transcript.jsonl` (the shortened one), not `transcript_full.jsonl`. The reader only
//  needs the line frame and the first two lines of a tool result, both of which the shortened file
//  keeps (measured: lines up to 4.8 KB against 9.6 KB, the cut — `truncated_fields: ["content"]` —
//  falls at the TAIL of the result text, the `Created At`/`Completed At` head survives on all 4
//  cut lines). Streamed line by line either way: one line is held, parsed, read, dropped.
//
//  MEASURED (Antigravity CLI 1.2.14, one session of 2026-10-01, 28 lines; re-measured):
//   · line = `{step_index, source USER_EXPLICIT|MODEL, type USER_INPUT|PLANNER_RESPONSE|GENERIC,
//     status DONE|ERROR, created_at, content | tool_calls[{name,args}] | thinking | error,
//     truncated_fields?}`. DEVIATION FROM THE PLAN CATALOGUE: `created_at` is an ISO string
//     (`2026-10-01T21:02:34Z`, whole seconds, UTC), not "seconds" as a number.
//   · USER_INPUT = a turn (`human`). PLANNER_RESPONSE = a model response; with `tool_calls` it
//     announces tool calls, without it (the last step carries `thinking` + `content`) it is the answer.
//     GENERIC = the RESULT of a tool call. ERROR = a failed step (`error` text + the result head).
//   · A result carries NO link to its call (no id). Calls and results are paired BY ORDER: every
//     tool_call is queued, every GENERIC step takes the oldest one (UNVERIFIED beyond this sample:
//     1 call per step, strictly alternating).
//   · DURATION only as prose at the head of a result: `Created At: <iso+offset>` /
//     `Completed At: <iso+offset>` (whole seconds, local offset). tool_start = Created At,
//     tool_end = Completed At. A result without the two lines: tool_start stays at the call's own
//     `created_at`, no tool_end, so no duration — never an invented one.
//   · THE END OF A TURN is not recorded either: the last step only has its START (`created_at`), so a turn (and
//     `session.work_ms`) runs to the start of the last step - a lower bound, marked `antigravity_turn_end_is_start_of_last_step`.
//     The file mtime is deliberately NOT used as a stand-in.
//   · TOKENS (CLI 1.2.17, measured 2026-10-06, 60 lines, 30 model steps): every `PLANNER_RESPONSE` with
//     `source:"MODEL"` carries `input_tokens` · `cache_read_tokens` · `output_tokens` (input EXCLUDES the
//     cache share). Each such step is one `usage` event; the context fill at a step = input + cache_read.
//     A transcript of CLI 1.2.14 has no such fields: no usage event, `records_usage: false`, as before.
//   · NOT RECORDED: model, context window, title, version. `session_id` is the folder name
//     (the inventory's entry), not a line field.
//
//  THE LEAK RULE as in `parser.js`: no prompt, thinking, error text, result text or tool argument is
//  ever copied; only the two timestamps and identifiers that pass `ident()` leave a line.
// ─────────────────────────────────────────────────────────────────────────────

import { PARSER_VERSION, ident, timeMs } from './parser.js';
import { fileLines } from './parser-codex.js';

export const ANTIGRAVITY_PROVIDER = 'antigravity';

/**
 * Caveats of an Antigravity series, whitespace-free marks. Each names a thing one transcript could not
 * check; they replace the two Claude-only marks on an Antigravity sheet.
 */
export const ANTIGRAVITY_UNCHECKED = [
  'antigravity_result_paired_to_call_by_order_unchecked',
  'antigravity_several_calls_per_step_unchecked',
  'antigravity_follow_up_user_turns_unchecked',
  'antigravity_error_step_shape_unchecked',
  'antigravity_prose_timestamps_second_resolution_unchecked',
  'antigravity_turn_end_is_start_of_last_step',
];

const PROSE_HEAD = /^Created At: (\S+)\r?\nCompleted At: (\S+)/;
// A prose timestamp counts only with an explicit UTC mark or offset; without one `Date.parse` would take host-local time.
const WITH_OFFSET = /(Z|[+-]\d\d:\d\d)$/;

/** `{created, completed}` in ms from the head of a result text; anything unreadable ⇒ `null`. */
export function proseTimes(content) {
  if (typeof content !== 'string') return null;
  const m = PROSE_HEAD.exec(content.length > 200 ? content.slice(0, 200) : content);
  if (!m) return null;
  if (!WITH_OFFSET.test(m[1]) || !WITH_OFFSET.test(m[2])) return null;
  const created = timeMs(m[1]);
  const completed = timeMs(m[2]);
  return created != null && completed != null && completed >= created ? { created, completed } : null;
}

/** Translate a transcript (an iterable of lines) into an event series of the `parser.js` shape. */
/** The accepted size of an assumed window, in tokens; the settings check (`node/store.js`) uses the same bounds. */
export const ASSUMED_WINDOW_BOUNDS = Object.freeze([1000, 100_000_000]);
/**
 * The window assumed for Antigravity when neither the transcript nor the user's settings name one: 1,048,576 tokens,
 * taken from Google's model documentation for antigravity-preview
 * (https://ai.google.dev/gemini-api/docs/models/antigravity-preview-09-2026). An ASSUMPTION, never read from a
 * transcript: it travels as `window_source: 'default'` and is changeable in Settings (`windows.antigravity.default`).
 */
export const ASSUMED_WINDOW_DEFAULT = 1_048_576;
const validWindow = (v) => Number.isInteger(v) && v >= ASSUMED_WINDOW_BOUNDS[0] && v <= ASSUMED_WINDOW_BOUNDS[1];
const tokenNum = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * `assumedWindow`: the context window size the USER assumed in settings (`windows.antigravity.default`); the
 * transcript names none today, so a number here is marked `window_source: 'settings'`. Precedence: a window the
 * transcript line itself records (`window_source: 'file'`) > settings > the shipped `ASSUMED_WINDOW_DEFAULT`
 * (`window_source: 'default'`). An invalid settings value counts as unset.
 */
export function readAntigravityLines(lines, { source = 'main', assumedWindow = null } = {}) {
  const fromSettings = validWindow(assumedWindow);
  const assumed = fromSettings ? assumedWindow : ASSUMED_WINDOW_DEFAULT;
  const events = [];
  const type_counts = Object.create(null);
  let lines_total = 0;
  let lines_broken = 0;
  let lines_without_time = 0;
  let lines_truncated = 0;
  let first_time = null;
  let last_time = null;
  let usage_steps = 0;
  const pending = [];          // calls without a result yet, oldest first

  for (const raw of lines) {
    if (!raw.trim()) continue;
    lines_total++;
    let o;
    try { o = JSON.parse(raw); } catch { lines_broken++; continue; }
    if (!o || typeof o !== 'object') { lines_broken++; continue; }
    const type = typeof o.type === 'string' ? (ident(o.type, 40) || '(other)') : '(none)';
    type_counts[type] = (type_counts[type] || 0) + 1;
    if (Array.isArray(o.truncated_fields) && o.truncated_fields.length) lines_truncated++;

    const time = timeMs(o.created_at);
    if (time == null) lines_without_time++;
    else {
      if (first_time == null || time < first_time) first_time = time;
      if (last_time == null || time > last_time) last_time = time;
    }
    const step = Number.isInteger(o.step_index) ? o.step_index : null;
    const uuid = step == null ? null : `step-${step}`;

    // A new user turn or a new model step closes the books on every call still waiting for a result: a missing
    // result must not shift all later pairs (those calls keep no tool_end, so no duration).
    if (o.type === 'USER_INPUT' || o.type === 'PLANNER_RESPONSE') pending.length = 0;
    if (o.type === 'USER_INPUT') {
      events.push({
        kind: 'human', time, source, uuid,
        prompt_source: null, entrypoint: null, user_type: null, permission_mode: null,
      });
    } else if (o.type === 'PLANNER_RESPONSE') {
      const calls = Array.isArray(o.tool_calls) ? o.tool_calls : [];
      events.push({ kind: 'model_response', time, source, uuid, tool_calls: calls.length });
      const tin = tokenNum(o.input_tokens);
      const tout = tokenNum(o.output_tokens);
      if (o.source === 'MODEL' && tin != null && tout != null) {
        const cache = tokenNum(o.cache_read_tokens) ?? 0;
        // ASSUMPTION: should Antigravity ever record a window it would be a `context_window` field on the step line;
        // today's transcripts carry none. A valid number there beats settings and the shipped default.
        const recorded = validWindow(o.context_window) ? o.context_window : null;
        events.push({
          kind: 'usage', time, source, model: null, key: null,
          agent_id: null, skill: null, attributed_agent: null,
          in: tin, out: tout, cache_read: cache, cache_write: 0,
          total: tin + tout + cache,
          window_used: tin + cache,
          reasoning: null,
          window: recorded ?? assumed, window_source: recorded != null ? 'file' : fromSettings ? 'settings' : 'default',
        });
        usage_steps++;
      }
      calls.forEach((c, n) => {
        const name = ident(c && c.name, 60);
        const id = step == null ? null : `step-${step}-${n}`;
        const ev = {
          kind: 'tool_start', time, source, name,
          tool_use_id: id, message_uuid: uuid, line_model: null,
          skill: null, subagent_type: null, model: null, isolation: null, background: null,
        };
        events.push(ev);
        pending.push(ev);
      });
    } else if (o.type === 'GENERIC') {
      const call = pending.shift() || null;
      const t = proseTimes(o.content);
      if (call && t) {
        call.time = t.created;                       // the tool began when its result says so, not when it was queued
        events.push({ kind: 'tool_end', time: t.completed, source, tool_use_id: call.tool_use_id, is_error: o.status === 'ERROR' });
      }
    }
    if (o.status === 'ERROR') events.push({ kind: 'error', time, source, uuid });
  }

  return {
    version: PARSER_VERSION,
    provider: ANTIGRAVITY_PROVIDER,
    source,
    session_id: null,
    agent_id: null,
    lines_total,
    lines_broken,
    lines_without_time,
    lines_truncated,
    duplicates: 0,
    records_subagents: false,    // Antigravity writes no subagent record: "0 started" would be a claim, so the contract leaves the counter out
    records_skills: false,       // ... and no skill record: `skill: null` on a tool call means "unknown", never "no skill"
    records_usage: usage_steps > 0,   // CLI >= 1.2.17 writes tokens per model step; an older transcript has none: the contract then drops them instead of showing zeros
    unchecked: [...ANTIGRAVITY_UNCHECKED],
    type_counts: { ...type_counts },
    first_time,
    last_time,
    models: [],
    versions: [],
    entrypoints: [],
    prompt_sources: [],
    branches: [],
    branch_last: null,
    git_commits: [],
    events,
  };
}

/** A transcript as text (tests, small inputs). */
export function readAntigravityTranscript(text, opt) {
  return readAntigravityLines(String(text || '').split(/\r?\n/), opt);
}

/** A transcript from disk, streamed. A missing or unreadable file is an empty series. */
export function readAntigravityFile(path, opt) {
  return readAntigravityLines(fileLines(path), opt);
}

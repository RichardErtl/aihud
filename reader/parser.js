// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · LINE PARSER
//
//  One transcript JSONL in, ONE flat event series out. A pure function: no network, no file
//  access (the text comes from outside), no side effect.
//
//  FOUR RULES, each measured against real transcript files:
//
//  1. TURN BOUNDARIES ONLY VIA `origin.kind:"human"`. Tool results are `user` lines TOO
//     (measured: 24 of 25 `user` lines are tool results) and `task-notification` is a third
//     `user` value. Counting `type:"user"` without a filter counts nonsense.
//  2. DEDUP IS MANDATORY. An answer with several blocks is written as SEVERAL lines, each with
//     the SAME `message.usage`. Summed raw, that gave factor 2.46 on a real session.
//     The key is `message.id` → `requestId` → `uuid`.
//  3. THE WINDOW SIZE IS IN NO LINE. Only the model name is. The table below is kept BY HAND
//     (model catalogue as of 2026-06-24). A hand-kept table is a maintenance debt — it is named
//     here instead of staying invisible.
//  4. THE LEAK RULE. From `tool_use.input` ONLY structural sub-fields travel
//     (`skill`, `subagent_type`, `model`, `isolation`, `run_in_background`). `command`,
//     `prompt`, `args`, `description` stay where they are. `message.content` is touched as text
//     in exactly TWO places: (a) the `task-notification` line, from which a narrow regex cuts
//     `<tool-use-id>` and `<status>` — the only end signal of a subagent; everything else in
//     that line stays behind. (b) the isMeta skill-format line of a typed slash skill
//     (`slashSkill()`), from which a narrow regex cuts only `<command-name>` — only the
//     identifier travels; `<command-args>` is never read.
// ─────────────────────────────────────────────────────────────────────────────

export const PARSER_VERSION = '1.0';

// ── Window table (kept by hand) ──────────────────────────────────────────────────────────────
export const MODEL_WINDOWS = [
  [/haiku/i, 200_000],
  [/opus-?5|opus-?4[._-]?[678]/i, 1_000_000],
  [/sonnet-?5|sonnet-?4[._-]?6/i, 1_000_000],
  [/fable-?5/i, 1_000_000],
  [/mythos-?5/i, 1_000_000],
];
export const WINDOW_FALLBACK = 200_000;

/** Window size per model id. Unknown ⇒ fallback, never an invented million. */
export function windowForModel(model) {
  const id = String(model || '').trim();
  if (!id) return WINDOW_FALLBACK;
  for (const [re, window] of MODEL_WINDOWS) if (re.test(id)) return window;
  return WINDOW_FALLBACK;
}

// ── Line recognition ─────────────────────────────────────────────────────────────────────────

/** The dedup key of ONE line: `message.id` → `requestId` → `uuid`. */
export function dedupKey(o) {
  return (o && o.message && o.message.id) || (o && o.requestId) || (o && o.uuid) || null;
}

/** A real user line — the only turn boundary. */
export function isHumanLine(o) {
  return !!(o && o.type === 'user' && o.origin && o.origin.kind === 'human');
}

/** A subagent status message (`origin.kind:"task-notification"`), not a human. */
export function isNotification(o) {
  return !!(o && o.type === 'user' && o.origin && o.origin.kind === 'task-notification');
}

/** A tool result line: `user` WITHOUT `origin` — carries `toolUseResult`. */
export function isToolResult(o) {
  return !!(o && o.type === 'user' && !o.origin);
}

/** The four token kinds of a `message.usage`. Missing ⇒ `null`. */
export function usageFrom(o) {
  const u = o && o.message && o.message.usage;
  if (!u) return null;
  const input = Number(u.input_tokens) || 0;
  const output = Number(u.output_tokens) || 0;
  const cache_read = Number(u.cache_read_input_tokens) || 0;
  const cache_write = Number(u.cache_creation_input_tokens) || 0;
  return {
    in: input, out: output, cache_read, cache_write,
    total: input + output + cache_read + cache_write,
    // What sat IN the window at measuring time — without the output.
    window_used: input + cache_read + cache_write,
  };
}

/** Timestamp as milliseconds. Unreadable ⇒ `null`, never 0 (0 would be 1970, hence a lie). */
export function timeMs(value) {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/**
 * Identifiers are REFUSED, not scrubbed.
 *
 * Scrubbing foreign characters out would stand IN FRONT of the leak check: `<<TEXT>>` would
 * become `TEXT`, a user prompt a short harmless-looking word without whitespace. Both would
 * pass the leak check on exactly the path EVERY reader field takes. Scrubbing IS interpreting:
 * it turns content into something that looks like structure.
 *
 * So: what is not an identifier becomes `null` — the same meaning as everywhere in the reader
 * ("not readable"), never a trimmed remainder. `<` and `>` are in the character class ON
 * PURPOSE: only then does the mask marker of the fixtures survive up to the leak check, and
 * only a surviving marker can betray a leak.
 */
export const ID_ALLOWED = /^[A-Za-z0-9_.:\-[\]\/<>]+$/;
export function ident(value, max = 80) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw || raw.length > max) return null;
  return ID_ALLOWED.test(raw) ? raw : null;
}

/**
 * One of TWO places where plain text is touched (the other is `slashSkill()` below, which reads
 * only `<command-name>` of the isMeta skill-format line, never `<command-args>`):
 * `<tool-use-id>` + `<status>` from the `task-notification`. Nothing else leaves this function —
 * `<summary>`, `<note>`, `<result>` and `<output-file>` are not even read.
 */
export function readNotification(content) {
  const text = typeof content === 'string' ? content : '';
  if (!text.startsWith('<task-notification>')) return null;
  const id = /<tool-use-id>([^<]{0,80})<\/tool-use-id>/.exec(text);
  const status = /<status>([^<]{0,40})<\/status>/.exec(text);
  const task = /<task-id>([^<]{0,80})<\/task-id>/.exec(text);
  return {
    tool_use_id: id ? ident(id[1]) : null,
    task_id: task ? ident(task[1]) : null,
    status: status ? ident(status[1], 40) : null,
  };
}

/** Skill name of a typed slash skill start line, else null (only the name travels). */
export function slashSkill(o) {
  if (!o || o.type !== 'user' || o.isMeta !== true) return null;
  const c = o.message && o.message.content;
  if (typeof c !== 'string' || !c.includes('<skill-format>true</skill-format>')) return null;
  const m = /<command-name>\/?([^<]{1,60})<\/command-name>/.exec(c);
  return m ? ident(m[1], 60) : null;
}

/** From `tool_use.input` only these sub-fields travel (leak rule). */
function toolInput(name, input) {
  const i = input && typeof input === 'object' ? input : {};
  return {
    skill: name === 'Skill' ? ident(i.skill, 60) : null,
    subagent_type: name === 'Agent' ? ident(i.subagent_type, 40) : null,
    model: name === 'Agent' ? ident(i.model, 40) : null,
    isolation: name === 'Agent' ? ident(i.isolation, 20) : null,
    background: name === 'Agent' ? i.run_in_background === true : null,
  };
}

/**
 * Translate a whole transcript JSONL into an event series.
 *
 * @param {string} text        The file content.
 * @param {object} opt
 * @param {'main'|'subagent'} opt.source
 * @param {Set<string>} opt.seen  SHARED duplicate guard across file boundaries
 *                                (main + all subagents in ONE set — otherwise a line that
 *                                stands in two files counts twice).
 */
export function readTranscript(text, { source = 'main', seen = new Set() } = {}) {
  const events = [];
  const type_counts = Object.create(null);
  const models = new Set();
  const versions = new Set();
  const entrypoints = new Set();
  const prompt_sources = new Set();
  const branches = new Set();
  // The LAST seen branch — the sorted set above no longer tells which branch the session is on
  // now. Structure (an identifier), not content.
  let branch_last = null;
  let lines_total = 0;
  let lines_broken = 0;
  let lines_without_time = 0;
  let duplicates = 0;
  let session_id = null;
  let agent_id = null;
  let first_time = null;
  let last_time = null;
  // Commits THIS session made (`toolUseResult.gitOperation.commit`, measured shape
  // `{sha, kind, branch?}`, `sha` abbreviated). Only hex travels; the branch as identifier.
  const git_commits = [];

  for (const raw of String(text || '').split(/\r?\n/)) {
    if (!raw.trim()) continue;
    lines_total++;
    let o;
    try { o = JSON.parse(raw); } catch { lines_broken++; continue; }
    const type = typeof o.type === 'string' ? o.type : '(none)';
    type_counts[type] = (type_counts[type] || 0) + 1;

    if (!session_id && o.sessionId) session_id = ident(o.sessionId);
    if (!agent_id && o.agentId) agent_id = ident(o.agentId, 40);
    if (o.version) versions.add(ident(o.version, 20));
    if (o.entrypoint) entrypoints.add(ident(o.entrypoint, 40));
    if (o.promptSource) prompt_sources.add(ident(o.promptSource, 40));
    if (o.gitBranch) branches.add(ident(o.gitBranch, 60));
    if (o.gitBranch && ident(o.gitBranch, 60)) branch_last = ident(o.gitBranch, 60);

    const time = timeMs(o.timestamp);
    if (time == null) { if (type === 'user' || type === 'assistant') lines_without_time++; }
    else {
      if (first_time == null || time < first_time) first_time = time;
      if (last_time == null || time > last_time) last_time = time;
    }

    // ── Human line: the turn boundary ───────────────────────────────────────────────────────
    if (isHumanLine(o)) {
      events.push({
        kind: 'human', time, source,
        uuid: ident(o.uuid),
        prompt_source: ident(o.promptSource, 40),
        entrypoint: ident(o.entrypoint, 40),
        user_type: ident(o.userType, 40),
        permission_mode: ident(o.permissionMode, 40),
      });
    }

    // ── Typed slash skill start: isMeta user line, string content with <skill-format>true ──
    // Bare `<command-name>` without skill-format (built-ins like /model) is NEVER a skill.
    const slash = slashSkill(o);
    if (slash) events.push({ kind: 'skill_slash', time, source, skill: slash, uuid: ident(o.uuid) });

    // ── Subagent notification: the only end signal ──────────────────────────────────────────
    if (isNotification(o)) {
      const m = readNotification(o.message && o.message.content);
      if (m) events.push({ kind: 'notification', time, source, ...m });
    }

    // ── Tool result: end of a tool, possibly the start of an agent ──────────────────────────
    if (isToolResult(o)) {
      const blocks = Array.isArray(o.message && o.message.content) ? o.message.content : [];
      for (const b of blocks) {
        if (b && b.type === 'tool_result') {
          events.push({
            kind: 'tool_end', time, source,
            tool_use_id: ident(b.tool_use_id),
            is_error: b.is_error === true,
          });
        }
      }
      const r = o.toolUseResult;
      const c = r && typeof r === 'object' && r.gitOperation && r.gitOperation.commit;
      if (c && typeof c.sha === 'string' && /^[0-9a-f]{7,40}$/i.test(c.sha)) {
        git_commits.push({ sha: c.sha.toLowerCase(), time, branch: ident(c.branch, 60) });
      }
      if (r && typeof r === 'object' && (r.agentId || r.resumedAgentId)) {
        events.push({
          kind: 'agent_result', time, source,
          tool_use_id: blocks.length && blocks[0] ? ident(blocks[0].tool_use_id) : null,
          agent_id: ident(r.agentId, 40),
          resolved_model: ident(r.resolvedModel, 40),
          status: ident(r.status, 40),
          resumed_agent_id: ident(r.resumedAgentId, 40),
        });
      }
    }

    // ── Assistant line: usage + tool starts ─────────────────────────────────────────────────
    if (o.type === 'assistant') {
      const model = ident(o.message && o.message.model, 60);
      if (model) models.add(model);
      const u = usageFrom(o);
      if (u) {
        const key = dedupKey(o);
        if (key && seen.has(key)) duplicates++;
        else {
          if (key) seen.add(key);
          events.push({
            kind: 'usage', time, source, model,
            key: ident(key),
            agent_id: ident(o.agentId, 40),
            skill: ident(o.attributionSkill, 60),
            attributed_agent: ident(o.attributionAgent, 60),
            ...u,
            window: windowForModel(model),
          });
        }
      }
      const blocks = Array.isArray(o.message && o.message.content) ? o.message.content : [];
      for (const b of blocks) {
        if (!b || b.type !== 'tool_use') continue;
        const name = ident(b.name, 60);
        events.push({
          kind: 'tool_start', time, source, name,
          tool_use_id: ident(b.id),
          message_uuid: ident(o.uuid),
          line_model: model,
          ...toolInput(name, b.input),
        });
      }
    }
  }

  return {
    version: PARSER_VERSION,
    source,
    session_id,
    agent_id,
    lines_total,
    lines_broken,
    lines_without_time,
    duplicates,
    type_counts: { ...type_counts },
    first_time,
    last_time,
    models: [...models].sort(),
    versions: [...versions].sort(),
    entrypoints: [...entrypoints].sort(),
    prompt_sources: [...prompt_sources].sort(),
    branches: [...branches].sort(),
    branch_last,
    git_commits,
    events,
  };
}

/** All events of one kind, in file order. */
export function eventsOfKind(series, kind) {
  return (series && series.events ? series.events : []).filter((e) => e.kind === kind);
}

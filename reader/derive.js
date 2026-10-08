// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · DERIVATIONS (block A)
//
//  From the parser's event series come NUMBERS. Pure arithmetic, no network.
//  The only file access is `loadSession()` — text in, everything else computes.
//
//  BLOCK A = the 17 elements a live pulse or telemetry source can also report, kept as a
//  COUNTER-CHECK ("never a fallback onto each other — two sources, two truths; a deviation is
//  SHOWN, not averaged"). Numbers in brackets = the element list of the value catalogue.
//   #1 fill level · #2 total tokens · #3 tokens per kind · #4 per agent type ·
//   #6 turn duration · #7 turn number · #9 session runtime · #10 work time without wait time ·
//   #11 subagent count · #12 session id · #13 clock (`as_of`) · #15/#26 turn list ·
//   #16 heap (tokens per model) · #19 half rings (per model/agent type/subagent) ·
//   #20 model · #21 context window per model · #22 one instance per device (one machine).
//
//  THREE HONESTY RULES that hold everywhere:
//   · Not measurable ⇒ `null`, never 0 and never an estimate (0 would mean "measured: nothing").
//   · The vocabulary is taken over, not interpreted: `agentType` travels through verbatim.
//   · No path, no plain text leaves this file (leak rule) — paths stay in the inventory.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { readTranscript, eventsOfKind, windowForModel } from './parser.js';
import { readCodexFile } from './parser-codex.js';
import { readAntigravityFile } from './parser-antigravity.js';

export const DERIVE_VERSION = '1.1';   // mainAndFleet.workflow_agents, raw node workflow_id

/** The bucket of the main transcript (the agent the user talks to). */
export const ACTOR_MAIN = 'main';
/** A subagent transcript with tokens whose role is not readable — named instead of dropped. */
export const ACTOR_NO_ROLE = 'no_role';
/** Time span T for "active" (180 s). */
export const ACTIVE_SECONDS = 180;

//  THE THREE MARKS — caveats travel as a whitespace-free identifier, not as a sentence.
//  Reason: the leak check (`leak-check.js`) forbids EVERY string with whitespace in the output.
//  An exception list for "our own sentences" would be a hole in the check; a mark is none.
//  Plain text for them:
//   · MARK_RESUMABLE — a `completed` is resumable, hence not a hard end (measured; fixture B
//     reports done twice).
//   · MARK_DEPTH_UNCHECKED — `task-notification completed` at `spawnDepth > 1`: no sample in the
//     stock (393 meta.json, all depth 1).
//   · MARK_PROMPT_SOURCE_UNCHECKED — `promptSource` outside VS Code: never observed
//     (84 files, all `claude-vscode`/`sdk`).
export const MARK_RESUMABLE = 'completed_is_resumable_not_a_hard_end';
export const MARK_DEPTH_UNCHECKED = 'task_notification_at_spawn_depth_above_1_unchecked';
export const MARK_PROMPT_SOURCE_UNCHECKED = 'prompt_source_outside_vscode_unchecked';

const iso = (ms) => (ms == null ? null : new Date(ms).toISOString());

/**
 * Read the main transcript + fleet of ONE session — with ONE shared duplicate guard.
 * THE SEAM: the adapter is chosen per session file by `entry.provider`; everything above
 * this function sees only the neutral event series. No `provider` ⇒ Claude Code, unchanged.
 * @param {object} entry  a session entry from `inventory.js`
 * @param {object} [opt]  `windows` = the settings table `{[provider]: {default|model: tokens}}`; only Antigravity reads it (`antigravity.default`, an ASSUMED window)
 */
export function loadSession(entry, { windows = null } = {}) {
  const seen = new Set();
  if (entry.provider === 'codex') {
    // One rollout, no subagent files; streamed line by line (single lines reach 248 KB).
    return { entry, main: readCodexFile(entry.main_file, { source: 'main', seen }), fleet: [] };
  }
  if (entry.provider === 'antigravity') {
    // One transcript (the shortened file), no subagent files; streamed line by line (reduced: no usage series).
    return { entry, main: readAntigravityFile(entry.main_file, { source: 'main', assumedWindow: windows && windows.antigravity ? windows.antigravity.default : null }), fleet: [] };
  }
  const read = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };
  const main = readTranscript(read(entry.main_file), { source: 'main', seen });
  const fleet = (entry.subagents || []).map((a) => ({
    entry: a,
    series: readTranscript(read(a.file), { source: 'subagent', seen }),
  }));
  return { entry, main, fleet };
}

// ── Building blocks ──────────────────────────────────────────────────────────────────────────

/** The four token kinds of an event series (#3). */
export function tokensByKind(series) {
  const s = { in: 0, out: 0, cache_read: 0, cache_write: 0 };
  for (const n of eventsOfKind(series, 'usage')) {
    s.in += n.in; s.out += n.out; s.cache_read += n.cache_read; s.cache_write += n.cache_write;
  }
  return { ...s, total: s.in + s.out + s.cache_read + s.cache_write };
}

/** Tokens per model (#16/#20) — keys verbatim from `message.model`, never interpreted. */
export function tokensByModel(seriesList) {
  const out = Object.create(null);
  for (const r of seriesList) {
    for (const n of eventsOfKind(r, 'usage')) {
      const k = n.model || '(no_model)';
      out[k] = (out[k] || 0) + n.total;
    }
  }
  return { ...out };   // flat object: null prototype inside (guard against `__proto__`), normal outside
}

/** The fill level (#1/#21): last usage of the main series against the window table. */
export function fillLevel(main) {
  const n = eventsOfKind(main, 'usage');
  if (!n.length) return { model: null, window: null, used_tokens: null, percent: null, measured_at: null };
  const last = n[n.length - 1];
  // A usage event that carries its own `window` key (Codex: from the file or null) is believed as it
  // is — a Claude table must never fill the gap of another provider. Claude events always carry one.
  const window = 'window_source' in last ? last.window : (last.window || windowForModel(last.model));
  const percent = window ? Math.round((last.window_used / window) * 1000) / 10 : null;
  return {
    model: last.model,
    window,
    used_tokens: last.window_used,
    percent,
    measured_at: iso(last.time),
    // Claude: the window size is in NO line — it comes from the hand table; the field says so.
    // Codex: `file` (model_context_window in the rollout), `table` (fallback) or `null` (unknown).
    window_source: 'window_source' in last ? last.window_source : 'model_window_table',
  };
}

/**
 * The turns of a session (#6/#7/#15/#26/#27).
 * Turn 0 = preamble (everything before the first human line) and is NOT counted as a turn,
 * but shown separately — otherwise every turn number would shift by one.
 */
export function buildTurns(main) {
  const events = (main.events || []).filter((e) => e.time != null);
  const turns = [];
  let preamble = newTurn(0, null);
  let current = preamble;
  for (const e of events) {
    if (e.kind === 'human') {
      current = newTurn(turns.length + 1, e.time);
      turns.push(current);
      current.user_mark = { time: iso(e.time), prompt_source: e.prompt_source, entrypoint: e.entrypoint };
      continue;
    }
    takeIntoTurn(current, e);
  }
  for (const z of [preamble, ...turns]) finish(z, main);
  return { preamble, turns };
}

function newTurn(number, start) {
  return {
    number, start_ms: start, start: iso(start), end_ms: null, end: null, duration_ms: null,
    tokens_in: 0, tokens_out: 0, tokens_cache_read: 0, tokens_cache_write: 0, tokens_total: 0,
    usages: 0, models: Object.create(null), model: null,
    tool_starts: [], tool_ends: Object.create(null),
    tools: [], tools_counted: [], tool_calls: [], user_mark: null,
    skill_starts: [], skill_tokens: Object.create(null), skills: [], agent_starts: [],
  };
}

function takeIntoTurn(z, e) {
  if (z.start_ms == null) z.start_ms = e.time;
  if (z.end_ms == null || e.time > z.end_ms) z.end_ms = e.time;
  if (e.kind === 'usage') {
    z.tokens_in += e.in; z.tokens_out += e.out;
    z.tokens_cache_read += e.cache_read; z.tokens_cache_write += e.cache_write;
    z.tokens_total += e.total; z.usages++;
    if (e.model) {
      const m = z.models[e.model] || (z.models[e.model] = { in: 0, out: 0, total: 0 });
      m.in += e.in + e.cache_read + e.cache_write;   // "in" = everything that went into the window
      m.out += e.out;
      m.total += e.total;
    }
    // Tokens PER SKILL and PER TURN (`turn.turns[].skills[]`). `attributionSkill` marks a
    // SPAN — every line after a start carries the name until the next start; if the span lands
    // in a later turn, its tokens count there. That is measured, not interpreted.
    if (e.skill) {
      const k = z.skill_tokens[e.skill] || (z.skill_tokens[e.skill] = { in: 0, out: 0 });
      k.in += e.in + e.cache_read + e.cache_write;
      k.out += e.out;
    }
  } else if (e.kind === 'tool_start') {
    z.tool_starts.push(e);
    if (e.name === 'Skill' && e.skill) {
      const i = z.skill_starts.findIndex((s) => s.skill === e.skill && s.slash);
      if (i >= 0) z.skill_starts[i] = { skill: e.skill, time: iso(e.time) };   // slash start came first: one invocation, one count
      else z.skill_starts.push({ skill: e.skill, time: iso(e.time) });
    }
    if (e.name === 'Agent') {
      z.agent_starts.push({
        tool_use_id: e.tool_use_id, agent_type: e.subagent_type,
        model: e.model, isolation: e.isolation, background: e.background, time: iso(e.time),
      });
    }
  } else if (e.kind === 'skill_slash') {
    // A typed slash start counts once — not if the same turn already has a Skill tool_use of that name.
    if (e.skill && !z.skill_starts.some((s) => s.skill === e.skill)) {
      z.skill_starts.push({ skill: e.skill, time: iso(e.time), slash: true });
    }
  } else if (e.kind === 'tool_end') {
    if (e.tool_use_id) z.tool_ends[e.tool_use_id] = e.time;
  } else if (e.kind === 'turn_end') {
    // Codex measured the turn itself (`task_complete.duration_ms`): that number wins over start..last event.
    if (e.duration_ms != null) z.native_duration_ms = e.duration_ms;
  }
}

/**
 * Tool duration: start = timestamp of the `assistant` line with the `tool_use`,
 * end = timestamp of the `user` line with the matching `tool_result`.
 * SEVERAL `tool_use` blocks of the same message share the start — then the duration is only
 * MESSAGE-precise, not tool-precise. The field `precision` says so per entry, instead of
 * delivering a number that looks more precise than it is.
 */
function finish(z, main) {
  z.skill_starts = z.skill_starts.map(({ skill, time }) => ({ skill, time }));   // the internal `slash` marker never leaves derive
  z.start = iso(z.start_ms);
  z.end = iso(z.end_ms);
  z.duration_ms = z.native_duration_ms ?? ((z.start_ms != null && z.end_ms != null) ? z.end_ms - z.start_ms : null);
  delete z.native_duration_ms;
  const perMessage = Object.create(null);
  for (const s of z.tool_starts) perMessage[s.message_uuid] = (perMessage[s.message_uuid] || 0) + 1;
  const counted = Object.create(null);
  for (const s of z.tool_starts) {
    const end = z.tool_ends[s.tool_use_id];
    const duration = end != null && s.time != null ? end - s.time : null;
    const precise = perMessage[s.message_uuid] > 1 ? 'message' : 'tool';
    const k = s.name || '(no_name)';
    // The per-call tuple (`turn.turns[].tool_calls[]`), ascending by start via the stable sort below.
    z.tool_calls.push({ tool: k, start_ms: s.time, duration_ms: duration });
    const e = counted[k] || (counted[k] = { tool: k, count: 0, duration_ms_sum: 0, measured_durations: 0, precision: 'tool' });
    e.count++;
    if (duration != null) { e.duration_ms_sum += duration; e.measured_durations++; }
    if (precise === 'message') e.precision = 'message';
  }
  z.tool_calls.sort((a, b) => (a.start_ms ?? Infinity) - (b.start_ms ?? Infinity));
  z.tools_counted = Object.values(counted).sort((a, b) => b.count - a.count);
  z.tools = z.tools_counted.map((e) => e.tool);
  const modelPairs = Object.entries(z.models).sort((a, b) => b[1].total - a[1].total);
  z.model = modelPairs.length ? modelPairs[0][0] : null;
  z.tokens_by_model = modelPairs.length
    ? modelPairs.map(([model, m]) => ({ model, tokens_in: m.in, tokens_out: m.out, tokens_total: m.total }))
    : null;
  // The skills of THIS turn: union of "started here" and "tokens attributed here".
  // A skill that started in the previous turn and reaches into this one carries tokens here but
  // no start time — then `time` is missing instead of carrying an invented one.
  const skillNames = new Set([
    ...z.skill_starts.map((s) => s.skill),
    ...Object.keys(z.skill_tokens),
  ]);
  z.skills = [...skillNames].map((name) => {
    const start = z.skill_starts.find((s) => s.skill === name);
    const t = z.skill_tokens[name] || { in: 0, out: 0 };
    return {
      skill: name,
      time: start ? start.time : null,
      tokens_in: t.in,
      tokens_out: t.out,
      tokens_total: t.in + t.out,
    };
  }).sort((a, b) => b.tokens_total - a.tokens_total);
  delete z.skill_tokens;
  delete z.tool_starts;
  delete z.tool_ends;
  delete z.models;
  void main;
}

/**
 * Session runtime (#9), wait time and work time (#10).
 * Wait time = the sum of the measured pauses between preamble/turns (before every turn with a
 * preceding end — if the preamble carries events, the pause before turn 1 counts too; the user
 * thinks/sleeps).
 * Work time = wall clock minus wait time. Pure arithmetic, no extra field needed.
 */
export function timing(main, turns, preamble) {
  const start = main.first_time;
  const end = main.last_time;
  const runtime_ms = (start != null && end != null) ? end - start : null;
  let wait_ms = 0;
  let measured_pauses = 0;
  // The preamble counts if it carried events — otherwise the pause before turn 1 would drop.
  const before = [preamble, ...turns].filter((z) => z && z.start_ms != null);
  for (let i = 1; i < before.length; i++) {
    const previousEnd = before[i - 1].end_ms;
    const start_i = before[i].start_ms;
    if (previousEnd != null && start_i != null && start_i > previousEnd) {
      wait_ms += start_i - previousEnd;
      measured_pauses++;
    }
  }
  return {
    start: iso(start), end: iso(end), runtime_ms,
    wait_ms: runtime_ms == null ? null : wait_ms,
    work_ms: runtime_ms == null ? null : Math.max(0, runtime_ms - wait_ms),
    measured_pauses,
  };
}

/**
 * Tokens per agent type (#4/#19). The main bucket = everything from the MAIN transcript
 * (`main`), every further bucket = a measured `agentType` from `meta.json`.
 * Adds up exactly to `tokens.total` — exactly that is the promise.
 */
export function tokensByAgentType(main, fleet) {
  const out = Object.create(null);
  const own = tokensByKind(main).total;
  if (own > 0) out[ACTOR_MAIN] = own;
  for (const f of fleet) {
    const sum = tokensByKind(f.series).total;
    if (!sum) continue;
    const k = (f.entry && f.entry.agent_type) || ACTOR_NO_ROLE;
    out[k] = (out[k] || 0) + sum;
  }
  return { ...out };
}

/** Tokens per subagent (#19, the third half ring) — one bucket per agent file. */
export function tokensBySubagent(fleet) {
  return fleet.map((f) => ({
    agent_id: f.entry.agent_id,
    agent_type: f.entry.agent_type || ACTOR_NO_ROLE,
    spawn_depth: f.entry.spawn_depth,
    models: f.series.models,
    tokens_total: tokensByKind(f.series).total,
    usages: eventsOfKind(f.series, 'usage').length,
    mtime: f.entry.mtime,
    mtime_ms: f.entry.mtime_ms,
  })).sort((a, b) => b.tokens_total - a.tokens_total);
}

// ── Block A, assembled ───────────────────────────────────────────────────────────────────────

/**
 * The raw sheet block A of a session.
 * @param {ReturnType<typeof loadSession>} loaded
 */
export function blockA(loaded, { nowMs = Date.now() } = {}) {
  const { entry, main, fleet } = loaded;
  const { preamble, turns } = buildTurns(main);
  const own = tokensByKind(main);
  const fleetKinds = fleet.map((f) => tokensByKind(f.series));
  const fleetSum = fleetKinds.reduce((n, a) => n + a.total, 0);
  return {
    version: DERIVE_VERSION,
    as_of: iso(nowMs),                                              // #13 clock
    identity: {                                                     // #12 session id
      session_id: main.session_id || entry.session_id,
      // Only a session that NAMES its provider carries it (Codex); a Claude sheet stays byte-identical
      // and the contract reads "no provider" as Claude Code.
      ...(entry.provider ? { provider: entry.provider } : {}),
      // A provider that records no usage at all (Antigravity) says so; the contract then drops every token number.
      ...(main.records_usage === false ? { records_usage: false } : {}),
      // Likewise for subagents and skills: the provider writes no such record, the contract leaves the fields out (never 0).
      ...(main.records_subagents === false ? { records_subagents: false } : {}),
      ...(main.records_skills === false ? { records_skills: false } : {}),
      project_slug: entry.project_slug,
      git_branches: main.branches,
      git_branch_last: main.branch_last,                            // branch chip
      harness_versions: main.versions,
      entrypoints: main.entrypoints,
      prompt_sources: main.prompt_sources,                          // must be measured, see MARK_PROMPT_SOURCE_UNCHECKED
      has_ai_title: entry.has_ai_title,                             // leak rule: mark, never text
      ai_title_chars: entry.ai_title_chars,
    },
    tokens: {                                                       // #2 #3 #16 #20
      own_total: own.total,
      fleet_total: fleetSum,
      total: own.total + fleetSum,
      by_kind: { in: own.in, out: own.out, cache_read: own.cache_read, cache_write: own.cache_write },
      by_model: tokensByModel([main, ...fleet.map((f) => f.series)]),
      by_agent_type: tokensByAgentType(main, fleet),                // #4
      by_subagent: tokensBySubagent(fleet),                         // #19 third half ring
    },
    context: fillLevel(main),                                       // #1 #21
    time: timing(main, turns, preamble),                            // #9 #10
    turns,                                                          // #6 #7 #15 #26 #27
    preamble,
    fleet_count: fleet.length,                                      // #11
    measurement: {
      lines_total: main.lines_total,
      lines_broken: main.lines_broken,
      lines_without_time: main.lines_without_time,
      duplicates_dropped: main.duplicates + fleet.reduce((n, f) => n + f.series.duplicates, 0),
      type_counts: main.type_counts,
      turns_counted: turns.length,
      fleet_lines: fleet.reduce((n, f) => n + f.series.lines_total, 0),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  BLOCK B — THE NEW ONES
//
//  Six elements no live pulse reports:
//   #5 main/fleet count · #17 time series (time axis) · #18 turn series (turn axis) ·
//   #23 skills (marker, count, tokens per skill) · #24 top 3 active subagents ·
//   #25 user marks — plus the tree (`Agent` blocks in order of creation, `spawnDepth`).
//
//  TWO ITEMS STAY `unchecked` (by name, never hidden as an assumption):
//   #2 `promptSource` outside VS Code — in the whole stock only `sdk`/`claude-vscode`.
//      The reader MEASURES the field and passes it on (`identity.prompt_sources`), it does not
//      rely on it.
//   #3 `task-notification completed` at `spawnDepth > 1` — no sample in the stock
//      (393 meta.json, all depth 1). The active logic does NOT depend on it: it asks mtime and
//      the notification line, both independent of depth. The sheet carries the caveat as a field.
// ─────────────────────────────────────────────────────────────────────────────

/** Assigns every event of the main series its turn number (0 = preamble). */
export function turnNumberPerEvent(main) {
  const out = new Map();
  let number = 0;
  for (const e of (main.events || [])) {
    if (e.kind === 'human') number++;
    out.set(e, number);
  }
  return out;
}

/**
 * #5 Main agent and fleet. The numbers are shown SIDE BY SIDE, never netted:
 * `Agent` blocks in the main transcript and files in `subagents/` drift apart as soon as a
 * resume is involved (measured fixture B: 3 blocks, 2 files, 2 resumes).
 */
export function mainAndFleet(loaded) {
  const { main } = loaded;
  // Workflow agents have no `Agent` block in the main transcript — they stand apart.
  const fleet = loaded.fleet.filter((f) => f.entry.workflow_id == null);
  const workflowAgents = loaded.fleet.length - fleet.length;
  const blocks = eventsOfKind(main, 'tool_start').filter((e) => e.name === 'Agent');
  const results = eventsOfKind(main, 'agent_result');
  const fresh = results.filter((e) => e.agent_id);
  const resumed = results.filter((e) => e.resumed_agent_id);
  return {
    main: 1,                          // the main file — always exactly one
    fleet_files: fleet.length,
    workflow_agents: workflowAgents,
    agent_blocks: blocks.length,
    new_starts: fresh.length,
    resumes: resumed.length,
    deviation: blocks.length - fleet.length,
    // No balancing, no interpretation: the difference stands there and names its known reasons.
    deviation_reasons: [
      resumed.length ? 'resume' : null,
      blocks.length > fresh.length + resumed.length ? 'not_yet_resolved' : null,
    ].filter(Boolean),
    agent_types: blocks.map((e) => e.subagent_type).filter(Boolean),
  };
}

/**
 * #17/#18 The ONE series for BOTH axes: one point per usage with time AND turn number.
 * The view decides later which axis it draws — the reader delivers both from the same
 * source, so the two charts can never drift apart.
 */
export function buildTimeSeries(loaded) {
  const { main, fleet } = loaded;
  const turnOf = turnNumberPerEvent(main);
  const points = [];
  let cumulative = 0;
  for (const e of (main.events || [])) {
    if (e.kind !== 'usage' || e.time == null) continue;
    cumulative += e.total;
    points.push({
      time: iso(e.time), time_ms: e.time, turn_number: turnOf.get(e) || 0,
      source: 'main', agent_id: null, agent_type: ACTOR_MAIN,
      model: e.model, tokens: e.total, tokens_cumulative: cumulative,
      window_used: e.window_used, window: e.window,
      percent: e.window ? Math.round((e.window_used / e.window) * 1000) / 10 : null,
      skill: e.skill,
    });
  }
  // The fleet hangs on the turn its `Agent` block stood in — not on its own clock.
  const turnPerAgent = agentTurnMap(loaded, turnOf);
  for (const f of fleet) {
    let cum = 0;
    for (const e of (f.series.events || [])) {
      if (e.kind !== 'usage' || e.time == null) continue;
      cum += e.total;
      points.push({
        time: iso(e.time), time_ms: e.time,
        turn_number: turnPerAgent.get(f.entry.agent_id) ?? null,
        source: 'subagent', agent_id: f.entry.agent_id,
        agent_type: f.entry.agent_type || ACTOR_NO_ROLE,
        model: e.model, tokens: e.total, tokens_cumulative: cum,
        window_used: e.window_used, window: e.window,
        percent: e.window ? Math.round((e.window_used / e.window) * 1000) / 10 : null,
        skill: e.skill,
      });
    }
  }
  points.sort((a, b) => a.time_ms - b.time_ms);
  return points;
}

/** agent_id → turn number its `Agent` block or its resume stood in. */
function agentTurnMap(loaded, turnOf) {
  const { main } = loaded;
  const callToTurn = new Map();
  for (const e of (main.events || [])) {
    if (e.kind === 'tool_start' && e.tool_use_id) callToTurn.set(e.tool_use_id, turnOf.get(e) || 0);
  }
  const out = new Map();
  for (const e of eventsOfKind(main, 'agent_result')) {
    const id = e.agent_id || e.resumed_agent_id;
    if (!id) continue;
    const turn = callToTurn.get(e.tool_use_id);
    if (turn != null && !out.has(id)) out.set(id, turn);
  }
  for (const a of (loaded.entry.subagents || [])) {
    if (!out.has(a.agent_id) && a.tool_use_id && callToTurn.has(a.tool_use_id)) {
      out.set(a.agent_id, callToTurn.get(a.tool_use_id));
    }
  }
  return out;
}

/**
 * #18 The same points, bundled per turn — one source, two axes.
 * Points WITHOUT an assignable turn (a subagent whose `Agent` block lies outside the read
 * excerpt) get their own bucket `turn_number: null` and do NOT drop out: otherwise the sum of
 * the turn series would be smaller than the total, without anyone seeing it.
 */
export function buildTurnSeries(points) {
  const buckets = new Map();
  for (const p of points) {
    const k = p.turn_number == null ? null : p.turn_number;
    const e = buckets.get(k) || { turn_number: k, tokens: 0, points: 0, tokens_main: 0, tokens_fleet: 0, first_time: null, last_time: null };
    e.tokens += p.tokens;
    e.points++;
    if (p.source === 'main') e.tokens_main += p.tokens; else e.tokens_fleet += p.tokens;
    if (e.first_time == null || p.time_ms < e.first_time) e.first_time = p.time_ms;
    if (e.last_time == null || p.time_ms > e.last_time) e.last_time = p.time_ms;
    buckets.set(k, e);
  }
  return [...buckets.values()]
    .sort((a, b) => (a.turn_number == null ? Infinity : a.turn_number) - (b.turn_number == null ? Infinity : b.turn_number))
    .map((e) => ({ ...e, first_time: iso(e.first_time), last_time: iso(e.last_time) }));
}

/**
 * #23 Skills. Start = `"name":"Skill"` tool_use block with field `skill`, OR a typed slash start:
 * an `isMeta` user line carrying `<skill-format>true</skill-format>` (+ `<command-name>`), counted in
 * the turn of the human line before it and not again if that turn has a Skill tool_use of that name.
 * A bare `<command-name>` without skill-format (built-ins like /model) is never a skill. Tokens per skill = sum of the usage blocks with
 * `attributionSkill`; the attribution is a SPAN (every line after a start carries the name
 * until the next start), not a 1:1 share per call.
 */
export function buildSkills(loaded) {
  const { main } = loaded;
  const turnOf = turnNumberPerEvent(main);
  const starts = [];
  const perSkill = new Map();
  const bucket = (name) => {
    if (!perSkill.has(name)) perSkill.set(name, { skill: name, starts: 0, usages: 0, tokens: 0 });
    return perSkill.get(name);
  };
  const toolKeys = new Set();
  for (const e of (main.events || [])) {
    if (e.kind === 'tool_start' && e.name === 'Skill' && e.skill) toolKeys.add((turnOf.get(e) || 0) + '|' + e.skill);
  }
  for (const e of (main.events || [])) {
    if (e.kind === 'skill_slash' && e.skill && !toolKeys.has((turnOf.get(e) || 0) + '|' + e.skill)) {
      starts.push({ skill: e.skill, time: iso(e.time), time_ms: e.time, turn_number: turnOf.get(e) || 0 });
      bucket(e.skill).starts++;
    }
    if (e.kind === 'tool_start' && e.name === 'Skill' && e.skill) {
      starts.push({ skill: e.skill, time: iso(e.time), time_ms: e.time, turn_number: turnOf.get(e) || 0 });
      bucket(e.skill).starts++;
    }
    if (e.kind === 'usage' && e.skill) {
      const b = bucket(e.skill);
      b.usages++;
      b.tokens += e.total;
    }
  }
  const without = eventsOfKind(main, 'usage').filter((n) => !n.skill);
  return {
    starts,
    start_count: starts.length,
    distinct: [...perSkill.keys()].sort(),
    by_skill: [...perSkill.values()].sort((a, b) => b.tokens - a.tokens),
    tokens_without_skill: without.reduce((n, x) => n + x.total, 0),
  };
}

/**
 * #24 The heaviest ACTIVE subagents.
 * "active" = file changed within the last T seconds (T = 180 s) AND no
 * `task-notification completed` AFTER that change. Both are an APPROXIMATION and are named as
 * such: a `completed` is resumable, hence not a hard end (measured; in fixture B the same
 * task-id reports done twice).
 */
export function topActive(loaded, { nowMs = Date.now(), activeSeconds = ACTIVE_SECONDS, max = 3 } = {}) {
  const { main, fleet } = loaded;
  const notifications = eventsOfKind(main, 'notification').filter((m) => m.status === 'completed');
  const rows = fleet.map((f) => {
    const usages = eventsOfKind(f.series, 'usage');
    const last = usages.length ? usages[usages.length - 1] : null;
    const mtime_ms = f.entry.mtime_ms;
    const age_seconds = mtime_ms == null ? null : Math.max(0, Math.round((nowMs - mtime_ms) / 1000));
    const done = notifications.filter((m) => m.task_id === f.entry.agent_id);
    const doneAfterMtime = done.some((m) => m.time != null && mtime_ms != null && m.time >= mtime_ms);
    const fresh = age_seconds != null && age_seconds <= activeSeconds;
    return {
      agent_id: f.entry.agent_id,
      agent_type: f.entry.agent_type || ACTOR_NO_ROLE,
      spawn_depth: f.entry.spawn_depth,
      tokens_total: usages.reduce((n, x) => n + x.total, 0),
      model: last ? last.model : null,
      window: last ? last.window : null,
      window_used: last ? last.window_used : null,
      percent: last && last.window ? Math.round((last.window_used / last.window) * 1000) / 10 : null,
      mtime: f.entry.mtime,
      age_seconds,
      fresh,
      completed_notifications: done.length,
      completed_after_change: doneAfterMtime,
      active: fresh && !doneAfterMtime,
    };
  });
  const active = rows.filter((z) => z.active).sort((a, b) => b.tokens_total - a.tokens_total);
  return {
    window_seconds: activeSeconds,
    measured_against: iso(nowMs),
    all: rows.sort((a, b) => b.tokens_total - a.tokens_total),
    active: active.slice(0, max),
    active_total: active.length,
    approximation: true,
    // Marks instead of sentences: EVERY string of the output stays whitespace-free, so the
    // leak check (`leak-check.js`) can bite without an exception list. Plain text above.
    caveat: MARK_RESUMABLE,
    unchecked: [MARK_DEPTH_UNCHECKED],
  };
}

/**
 * The tree: `Agent` blocks in ORDER OF CREATION, `spawn_depth` from `meta.json`.
 * A block without a resolvable file does NOT drop out — it appears with its call id as `id`
 * and `resolved:false`. A dropped node would be a silent lie about the fleet.
 */
export function buildTree(loaded) {
  const { entry, main } = loaded;
  const turnOf = turnNumberPerEvent(main);
  const callToAgent = new Map();
  for (const e of eventsOfKind(main, 'agent_result')) {
    const id = e.agent_id || e.resumed_agent_id;
    if (e.tool_use_id && id) callToAgent.set(e.tool_use_id, id);
  }
  for (const a of (entry.subagents || [])) {
    if (a.tool_use_id && !callToAgent.has(a.tool_use_id)) callToAgent.set(a.tool_use_id, a.agent_id);
  }
  const metaPerAgent = new Map((entry.subagents || []).map((a) => [a.agent_id, a]));
  const root = {
    id: entry.session_id, parent: null, role: ACTOR_MAIN, spawn_depth: 0,
    turn_number: null, resolved: true, created: null,
  };
  const nodes = [root];
  const seen = new Set();
  for (const e of (main.events || [])) {
    if (e.kind !== 'tool_start' || e.name !== 'Agent') continue;
    const agentId = callToAgent.get(e.tool_use_id) || null;
    const meta = agentId ? metaPerAgent.get(agentId) : null;
    const id = agentId || e.tool_use_id;
    if (seen.has(id)) continue;             // resume: the same node, not a second one
    seen.add(id);
    nodes.push({
      id,
      parent: entry.session_id,
      role: (meta && meta.agent_type) || e.subagent_type || ACTOR_NO_ROLE,
      spawn_depth: meta && meta.spawn_depth != null ? meta.spawn_depth : null,
      turn_number: turnOf.get(e) || 0,
      resolved: !!meta,
      created: iso(e.time),
      tool_use_id: e.tool_use_id,
      model_requested: e.model,
      isolation: e.isolation,
      background: e.background,
      ...(meta && meta.workflow_id ? { workflow_id: meta.workflow_id } : {}),   // only when set
    });
  }
  // Files without a visible block (e.g. started before the excerpt) would otherwise be missing silently.
  for (const a of (entry.subagents || [])) {
    if (seen.has(a.agent_id)) continue;
    seen.add(a.agent_id);
    nodes.push({
      id: a.agent_id, parent: entry.session_id, role: a.agent_type || ACTOR_NO_ROLE,
      spawn_depth: a.spawn_depth, turn_number: null, resolved: true, created: null,
      tool_use_id: a.tool_use_id, model_requested: a.model, isolation: null, background: null,
      file_only: true,
      ...(a.workflow_id ? { workflow_id: a.workflow_id } : {}),                 // only when set
    });
  }
  const depths = nodes.map((k) => k.spawn_depth).filter((t) => t != null);
  return {
    nodes,
    node_count: nodes.length,
    max_depth: depths.length ? Math.max(...depths) : null,
    unresolved: nodes.filter((k) => !k.resolved).length,
    unchecked: depths.some((t) => t > 1) ? [] : [MARK_DEPTH_UNCHECKED],
  };
}

/** #25 The user marks for all charts: point in time + turn number, never the prompt. */
export function userMarks(main) {
  const turnOf = turnNumberPerEvent(main);
  return eventsOfKind(main, 'human').map((e) => ({
    time: iso(e.time), time_ms: e.time, turn_number: turnOf.get(e),
    prompt_source: e.prompt_source, entrypoint: e.entrypoint, user_type: e.user_type,
  }));
}

/** The raw sheet block B of a session. */
export function blockB(loaded, { nowMs = Date.now(), activeSeconds = ACTIVE_SECONDS } = {}) {
  const points = buildTimeSeries(loaded);
  return {
    version: DERIVE_VERSION,
    as_of: iso(nowMs),
    main_fleet: mainAndFleet(loaded),                // #5
    time_series: points,                             // #17
    turn_series: buildTurnSeries(points),            // #18
    skills: buildSkills(loaded),                     // #23
    top_active: topActive(loaded, { nowMs, activeSeconds }), // #24
    user_marks: userMarks(loaded.main),              // #25
    tree: buildTree(loaded),
    // A provider that names its own caveats (Codex, Antigravity) replaces the Claude marks; Claude stays as it was.
    unchecked: loaded.main.unchecked || [MARK_PROMPT_SOURCE_UNCHECKED, MARK_DEPTH_UNCHECKED],
  };
}

/** Both blocks in one run — the entry point for `contract.js`. */
export function buildSheet(loaded, opt = {}) {
  return { ...blockA(loaded, opt), block_b: blockB(loaded, opt) };
}

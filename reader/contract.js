// ─────────────────────────────────────────────────────────────────────────────
//  THE READER · CONTRACT FORM
//
//  THE MAPPING LAYER, deliberately its OWN file: raw object with clearly named fields first,
//  then a mapping layer that can later be pulled to other field names without touching the
//  derivations. It MEASURES NOTHING and COMPUTES NOTHING; it ONLY RENAMES. One exception, pure
//  unit conversion, because the contract fixes it that way: milliseconds → seconds
//  (`turn.turns[].duration_s`).
//
//  THE IRON RULE OF THIS FILE: **never an invented value.** A REQUIRED field whose value the
//  reader cannot measure means the TYPE is NOT delivered — rather "no `session` at all" than an
//  invented key. What is missing stands in `not_delivered`, by name.
//
//  WHAT THE READER DELIBERATELY DOES NOT FILL (each field with a reason):
//   · `session.display_name` / `session.short_info` — both would be plain text (`ai-title`,
//     `last-prompt`). LEAK RULE. They stay empty although the contract knows them.
//   · `session.end` — the JSONL has no end marker. Missing means "still running"; that is the
//     contract-conforming normal case, not a gap.
//   · `turn.turns[].label` — there is NO turn label in the JSONL (60/60 `ai-title` measured
//     identical); a later version, not this one.
//   · `live.instances[].device` / `state` — REQUIRED, but both are statements of the HOST
//     about itself, not of the file. The caller hands them in; without them this file delivers
//     NO `live`.
//
//  FIELD NAMES of the later contract additions:
//   · `turn.turns[].started_at`                        (one field; the user mark rides on it:
//     the start of a turn IS the user moment)
//   · `turn.turns[].skills[]` per entry `name` (required) · `time` · `tokens_in`/`tokens_out`
//     — PER TURN, not on the type
//   · `turn.turns[].tool_stats[].duration` (number, seconds, sum over `count`)
//   · `turn.turns[].tool_calls[]` per call `tool` · `started_at` (ISO-8601 Z) · `duration_s`
//     (seconds; missing without a measured call/result pair), ascending by start
//   · `agents.nodes[].last_activity` (point in time, ISO-8601 Z)
//   · `live.instances[].tokens_by_kind` with the keys
//     `input` · `output` · `cache_read` · `cache_write`
//
//  WHAT FALLS OUT OF THE CONTRACT FORM (no loss — it stays in the RAW SHEET, where a consumer
//  finds it; the contract simply has no name for it):
//   · `precision` of the raw `turns[].tools_counted[]` (tool- vs. message-precise)
//   · `agents.nodes[].age_seconds` and `.active` — age and active are DERIVATIONS OF THE HOST from
//     `last_activity` against its own clock (T = 180 s), not a field. Same rule as with any
//     countdown: a remaining time sent along ages in flight.
//   · `turn.skill_starts[]`/`turn.tokens_per_skill[]` on the type (now per turn)
//   · `turns[].tokens_by_model[].tokens_total` (the contract names only `tokens_in`/`tokens_out`)
//
//  PROVIDER-NEUTRAL: every `session` names its `provider` (`claude-code`, `codex`, `antigravity`); the window
//  sizes travel as a table `windows[provider][model]` next to the types. What only Claude Code
//  has is OPTIONAL for a consumer — listed in `OPTIONAL_PROVIDER_FIELDS` (ai-title, subagents,
//  spawn depth): another provider may leave them out without breaking the contract.
//
//  SESSION EXTRAS (session 1.2 — read by `extras.js`/`git.js`, only MAPPED here):
//   · `provider` · `started_at` (the first timestamp) — always.
//   · `closed` · `closed_at` — from the sidecar, structure, always when present.
//   · `git` `{start_head?, commits[] {sha, at?, first_line?, source}, dirty}` — `dirty` is `null`
//     ("not determined") and stays in the object ON PURPOSE: a missing flag would read "clean".
//   · `title` · `note` · `git.commits[].first_line` are PLAIN TEXT: they travel only with
//     `withText: true` (a local display of the user's own words). `title` = sidecar title, else
//     the `ai-title` text, else missing. Default is off: the leak rule stays the default.
//
//  WHAT THE READER CANNOT FILL: `live.subscription_7d_fable_usage` and
//  `subscription_7d_fable_reset` — subscription numbers are NOT in the transcript JSONL
//  (measured: no native subscription/quota field). They are named in `not_delivered`,
//  instead of staying silent; their source is a subscription endpoint, not this reader.
// ─────────────────────────────────────────────────────────────────────────────

import { windowForModel } from './parser.js';

export const CONTRACT_VERSION = '1.0';

/** The provider this reader reads. Every `session` names it. */
export const PROVIDER = 'claude-code';

/**
 * Contract parts only Claude Code fills — a consumer must treat them as OPTIONAL.
 * `field` = where it shows in the contract (or `null`: raw sheet only, not in the contract).
 */
export const OPTIONAL_PROVIDER_FIELDS = [
  // Codex has its own title source: `thread_name` of `session_index.jsonl` (read by `extras.js`), same field.
  { name: 'aiTitle', provider: PROVIDER, optional: true, field: 'session.title', role: 'title_fallback_after_sidecar' },
  { name: 'subagents', provider: PROVIDER, optional: true, field: 'agents.nodes[]', role: 'every_node_below_the_root' },
  { name: 'spawnDepth', provider: PROVIDER, optional: true, field: null, role: 'raw_sheet_only_block_b_tree' },
];

/**
 * The minor version PER TYPE: `turn` 1.3 (1.3 `skills` may be absent, named as a gap) · `live` 1.6 · `agents` 1.4 (1.2 optional
 * `agent_count` on workflow summary nodes, 1.3 `subagents_started`, 1.4 it may be absent, named as a gap) · `session` 2.0 (1.1 `work_ms`/`wait_ms`, 1.2
 * provider/sidecar/git, 2.0 the naming pass before the first release) ·
 * `context` 1.0. A flat 1.0 over all five would be a false statement about the delivered
 * version. The live fields of 1.3–1.5 (pin/close/reader-key metadata of a host) are
 * OPTIONAL — the reader does not deliver them, their absence is contract-conforming.
 */
export const VERSION_BY_TYPE = {
  session: '2.2', live: '1.6', turn: '1.3', context: '1.0', agents: '1.4',
};
// turn 1.3: `skills` may be absent because the provider records no skill (Antigravity), named by
//   `turn:skills_not_recorded_by_<provider>`; agents 1.4: `subagents_started` may be absent likewise
//   (`agents:subagents_not_recorded_by_<provider>`). Additive, the shape is unchanged.
// session 1.1: `work_ms` · `wait_ms` (#10), additive.
// session 1.2: `provider` · `title` · `note` · `closed` · `git` + the start and close times, additive.
// session 2.1: `provider` is the provider OF THIS SESSION (`claude-code` or `codex`), no longer the one
//   constant of the reader; the shape is unchanged, additive.
// session 2.2: `provider` may be `antigravity`; a provider that records no usage (Antigravity) is a valid session:
//   `model`, `title`, `git` and the sheet's `windows` table are absent, the live token fields carry the zeros of
//   an empty series or are absent. `contractSession` returns `null` only for a missing id/start, never for a
//   missing usage series (a test holds that). Additive, the shape is unchanged.
// session 2.0: the naming pass of 30.09. (design decision) renamed fields in ALL five
//   types before the first release; only `session` was bumped, as the carrier of the pass — live 1.6,
//   turn 1.2, context 1.0, agents 1.2 (then 1.3) keep their numbers. From the first npm release on, every
//   breaking rename bumps the type it touches.

/**
 * The field names that were added to the contract document later. Currently unused by the
 * package; the field-name gate needs the machine-readable contract document (the tile data
 * contract), which does not exist in the reader — it follows once that document lands.
 */
export const LATER_ADDITIONS = ['last_activity', 'skills', 'tokens_by_kind', 'subagents_started'];

/** The two contract fields that exist but do NOT come from the JSONL (source: subscription endpoint). */
export const NOT_FROM_TRANSCRIPT = ['subscription_7d_fable_usage', 'subscription_7d_fable_reset'];

/** Renaming the raw token kinds to the contract's words. */
const KIND_NAMES = { in: 'input', out: 'output', cache_read: 'cache_read', cache_write: 'cache_write' };

const header = (type, asOf) => ({ version: VERSION_BY_TYPE[type] || CONTRACT_VERSION, as_of: asOf ?? null });
const sec = (ms) => (ms == null ? null : Math.round(ms / 1000));
/** Leave out instead of writing `null`: an OPTIONAL field is MISSING when it is not measurable. */
function withoutEmpty(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v != null) out[k] = v;
  return out;
}

/**
 * The window table of ONE sheet: `{ [provider]: { [model]: tokens } }` for every model the
 * session used (hand table of `parser.js`, the same numbers the fill level uses). No model ⇒ `null`.
 */
export function windowsOf(sheet, provider = PROVIDER) {
  const models = new Set(Object.keys((sheet && sheet.tokens && sheet.tokens.by_model) || {}));
  if (sheet && sheet.context && sheet.context.model) models.add(sheet.context.model);
  models.delete('(no_model)');
  if (!models.size) return null;
  // Claude: the hand table of `parser.js`. Any other provider: the size its OWN file named for the
  // model (the series carries it per point), the fallback table already inside that number; a model
  // without a known window stays OUT of the table — never a Claude number for a foreign model.
  const own = new Map();
  if (provider !== PROVIDER) {
    for (const p of (sheet.block_b && sheet.block_b.time_series) || []) if (p.model && p.window != null) own.set(p.model, p.window);
    if (sheet.context && sheet.context.model && sheet.context.window != null) own.set(sheet.context.model, sheet.context.window);
  }
  const table = {};
  for (const m of [...models].sort()) {
    const w = provider === PROVIDER ? windowForModel(m) : own.get(m);
    if (w != null) table[m] = w;
  }
  return Object.keys(table).length ? { [provider]: table } : null;
}

/** The provider of the session the sheet describes; a sheet that names none is a Claude Code sheet. */
const providerOf = (sheet) => (sheet && sheet.identity && sheet.identity.provider) || PROVIDER;

/** A provider that records NO usage at all (Antigravity) says so; every token number is then absent, never a zero. */
const noUsage = (sheet) => !!(sheet && sheet.identity && sheet.identity.records_usage === false);

/** The window size the user assumed in settings for a provider that names none (Antigravity); else `null`. */
const assumedWindow = (sheet) => (sheet && sheet.context && (sheet.context.window_source === 'settings' || sheet.context.window_source === 'default') ? sheet.context.window : null);

/** A provider that records no subagent / no skill (Antigravity) says so; the counters are then absent, never 0. */
const noSubagents = (sheet) => !!(sheet && sheet.identity && sheet.identity.records_subagents === false);
const noSkills = (sheet) => !!(sheet && sheet.identity && sheet.identity.records_skills === false);

/** `git` of the extras, mapped. `dirty` stays even when `null` (see the file head). */
function contractGit(git, withText) {
  if (!git) return null;
  return {
    ...withoutEmpty({ start_head: git.start_head }),
    commits: (git.commits || []).map((c) => withoutEmpty({
      sha: c.sha, at: c.at, first_line: withText ? c.first_line : null, source: c.source,
    })),
    dirty: typeof git.dirty === 'boolean' ? git.dirty : null,
  };
}

/**
 * `session` — the session card.
 * @param {object} [opt]  `extras` from `extras.js readExtras()`, `withText` (default off)
 */
export function contractSession(sheet, { extras = null, withText = false } = {}) {
  const id = sheet.identity && sheet.identity.session_id;
  const started_at = sheet.time && sheet.time.start;
  if (!id || !started_at) return null;      // two REQUIRED fields — no substitute, no inventing
  return {
    ...header('session', sheet.as_of),
    id,
    started_at,
    // `role` is MISSING on purpose: it used to be hard-set to one fixed name — an invented
    // value against the iron rule of this file. The JSONL says nothing about the role of ONE
    // session; the contract makes the field OPTIONAL, so it stays empty. (The main-bucket name
    // lives on where it is MEASURED: as a bucket of `tokens_by_agent_type`, naming the main
    // transcript's share — an attribution, not a statement about the session.)
    ...withoutEmpty({
      model: sheet.context ? sheet.context.model : null,
      // session 1.1 (#10 "work time without wait time"): measured in derive.js timing() —
      // only PASSED THROUGH here, unchanged in ms. Without a measurement (no timestamp) the
      // field is missing; a measured 0 stays 0.
      work_ms: sheet.time ? sheet.time.work_ms : null,
      wait_ms: sheet.time ? sheet.time.wait_ms : null,
    }),
    // session 1.2.
    provider: providerOf(sheet),
    ...withoutEmpty(sessionExtras(extras, withText)),
  };
}

/** The sidecar + title + git part of `session`. Text only with `withText`. */
function sessionExtras(extras, withText) {
  const e = extras || {};
  const side = e.sidecar || {};
  return {
    title: withText ? (side.title || e.ai_title || null) : null,
    note: withText ? side.note : null,
    closed: typeof side.closed === 'boolean' ? side.closed : null,
    closed_at: side.closed_at,
    git: contractGit(e.git, withText),
  };
}

/**
 * `live` — who is alive now.
 * `device` and `state` are REQUIRED and are NOT in the file: the host says them.
 * If one of the two is missing, there is no instance — rather than an invented one.
 */
export function contractLive(sheet, { device = null, state = null } = {}) {
  if (!device || !state) return null;
  const k = sheet.context || {};
  const instance = {
    device,
    state,
    ...withoutEmpty({
      session_id: sheet.identity ? sheet.identity.session_id : null,
      context_percent: k.percent,
      context_window: k.window,
      model: k.model,
      // The last seen `gitBranch` of the main transcript — an identifier, renaming not computing.
      git_branch: sheet.identity ? sheet.identity.git_branch_last : null,
      last_activity: sheet.time ? sheet.time.end : null,
      tokens_main: sheet.tokens ? sheet.tokens.own_total || null : null,
      tokens_total: sheet.tokens ? sheet.tokens.total || null : null,
      tokens_by_model: !noUsage(sheet) && sheet.tokens ? sheet.tokens.by_model : null,
      tokens_by_agent_type: !noUsage(sheet) && sheet.tokens ? sheet.tokens.by_agent_type : null,
      // (#3): the third twin — the same one number, broken down per KIND.
      // The keys are `input`/`output`/`cache_read`/`cache_write`;
      // that is renaming, not computing.
      tokens_by_kind: !noUsage(sheet) && sheet.tokens && sheet.tokens.by_kind
        ? Object.fromEntries(Object.entries(sheet.tokens.by_kind).map(([k, v]) => [KIND_NAMES[k] || k, v]))
        : null,
    }),
  };
  return { ...header('live', sheet.as_of), instances: [instance] };
}

/** `turn` — the turns of a session. */
export function contractTurn(sheet) {
  const id = sheet.identity && sheet.identity.session_id;
  if (!id) return null;
  const b = sheet.block_b || {};
  const turns = (sheet.turns || []).map((z) => ({
    number: z.number,
    ...withoutEmpty({
      tokens_in: noUsage(sheet) ? null : z.tokens_in + z.tokens_cache_read + z.tokens_cache_write,
      tokens_out: noUsage(sheet) ? null : z.tokens_out,
      model: z.model,
      duration_s: sec(z.duration_ms),
      tool_names: z.tools.length ? z.tools : null,
      tool_stats: z.tools_counted.length
        ? z.tools_counted.map((w) => withoutEmpty({
          tool: w.tool,
          count: w.count,
          // `duration` = sum over all `count` calls, in seconds. Never an invented 0 —
          // without measured pairs the field is missing. (`precision` has no name in the
          // contract and stays in the raw sheet.)
          duration: w.measured_durations ? sec(w.duration_ms_sum) : null,
        }))
        : null,
      // One entry per tool call, ascending by start. `started_at` is required (a call without a
      // timestamp is left out); `duration_s` is missing when no call/result pair was measured.
      tool_calls: (z.tool_calls || []).filter((c) => c.start_ms != null).length
        ? z.tool_calls.filter((c) => c.start_ms != null).map((c) => withoutEmpty({
          tool: c.tool,
          started_at: new Date(c.start_ms).toISOString(),
          duration_s: sec(c.duration_ms),
        }))
        : null,
      tokens_by_model: z.tokens_by_model
        ? z.tokens_by_model.map((m) => ({ model: m.model, tokens_in: m.tokens_in, tokens_out: m.tokens_out }))
        : null,
      // (#10 AND #25): ONE field. The user mark rides on it — the start of a turn IS the
      // user moment, a second marker field would be one too many.
      started_at: z.start,
      // (#23): the skills PER TURN. Empty list = "measured, none started";
      // missing field = "not recorded" — so it is missing when the turn saw no skill.
      skills: !noSkills(sheet) && z.skills && z.skills.length
        ? z.skills.map((k) => withoutEmpty({
          name: k.skill, time: k.time, tokens_in: k.tokens_in, tokens_out: k.tokens_out,
        }))
        : null,
    }),
  }));
  return {
    ...header('turn', sheet.as_of),
    session_id: id,
    turns,
  };
}

/**
 * `context` — the fill level over time.
 * ONLY the points of the MAIN transcript: a subagent has its OWN window, mixing its points into
 * the same curve would be an invented curve.
 */
export function contractContext(sheet) {
  const id = sheet.identity && sheet.identity.session_id;
  if (!id) return null;
  const series = (sheet.block_b && sheet.block_b.time_series) || [];
  const points = series.filter((p) => p.source === 'main').map((p) => withoutEmpty({
    time: p.time,
    percent: p.percent,
    tokens_in_window: p.window_used,
    turn_number: p.turn_number,
  }));
  return { ...header('context', sheet.as_of), session_id: id, points };
}

/**
 * If the sheet exceeds the cap, ONE workflow run at a time (largest first, ties by
 * `workflow_id`) collapses into ONE summary node, until it fits. Pure and deterministic.
 * Classic subagents (`wfIds[i] == null`) never collapse; a run whose members have different
 * parents or carry children from outside stays open.
 * `fits(nodes)` measures the whole sheet in bytes.
 */
export function collapseRuns(nodes, wfIds, fits) {
  let ks = nodes, ws = wfIds;
  const open = new Set(ws.filter((w) => w != null));
  while (open.size && !fits(ks)) {
    const count = new Map();
    for (const w of ws) if (w != null && open.has(w)) count.set(w, (count.get(w) || 0) + 1);
    const run = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    if (!run) break;
    const [wf, n] = run;
    open.delete(wf);
    const members = ks.filter((_, i) => ws[i] === wf);
    const ids = new Set(members.map((k) => k.id));
    const parent_id = members[0].parent_id;
    if (members.some((k) => k.parent_id !== parent_id)) continue;
    if (ks.some((k, i) => ws[i] !== wf && k.id === wf)) continue;   // collision: the summary would inherit a foreign id
    if (ks.some((k, i) => ws[i] !== wf && k.parent_id != null && ids.has(k.parent_id))) continue;
    const numbers = members.map((k) => k.tokens_total).filter((t) => typeof t === 'number');
    const activities = members.map((k) => k.last_activity).filter(Boolean).sort();
    const sum = numbers.length ? numbers.reduce((x, y) => x + y, 0) : null;
    const summary = {
      id: wf,
      ...withoutEmpty({
        parent_id, agent_type: 'workflow', tokens_self: sum, tokens_total: sum,
        last_activity: activities.length ? activities[activities.length - 1] : null,
      }),
      agent_count: n,
    };
    const nks = [], nws = [];
    let placed = false;
    ks.forEach((k, i) => {
      if (ws[i] !== wf) { nks.push(k); nws.push(ws[i]); }
      else if (!placed) { nks.push(summary); nws.push(null); placed = true; }
    });
    ks = nks; ws = nws;
  }
  return ks;
}

/**
 * `agents` — who started whom.
 * @param {{fits?: (nodes: object[]) => boolean}} [opt]  only for collapsing workflow runs
 */
export function contractAgents(sheet, { fits = null } = {}) {
  const id = sheet.identity && sheet.identity.session_id;
  if (!id) return null;
  const b = sheet.block_b || {};
  const perSubagent = new Map(((sheet.tokens && sheet.tokens.by_subagent) || []).map((s) => [s.agent_id, s]));
  const perActive = new Map((((b.top_active || {}).all) || []).map((z) => [z.agent_id, z]));
  const raw = (b.tree && b.tree.nodes) || [];
  let nodes = raw.map((k) => {
    const t = perSubagent.get(k.id);
    const a = perActive.get(k.id);
    const isRoot = k.parent == null;
    return {
      id: k.id,
      ...withoutEmpty({
        parent_id: k.parent,
        agent_type: k.role,
        tokens_self: isRoot
          ? (sheet.tokens ? sheet.tokens.own_total || null : null)
          : (t ? t.tokens_total : null),
        tokens_total: isRoot ? (sheet.tokens ? sheet.tokens.total || null : null) : (t ? t.tokens_total : null),
        started_in_turn: k.turn_number,
        // (#24): ONE measured point in time — the youngest sign of life of the node.
        // Age and "active" (T = 180 s) are computed by the HOST against its own clock; an age
        // sent along ages in flight. For the root it is the last timestamp of the session,
        // for a subagent the mtime of its file — both measured.
        last_activity: isRoot
          ? (sheet.time ? sheet.time.end : null)
          : (a ? a.mtime : (t ? t.mtime : null)),
      }),
    };
  });
  if (fits) nodes = collapseRuns(nodes, raw.map((k) => k.workflow_id || null), fits);
  // Rule A: every node with a parent counts 1, counted on the FULL uncollapsed list, so the value is
  // identical with and without a cap (a collapsed workflow node stands for its `agent_count`).
  const subagents_started = raw.filter((k) => k.parent != null).length;
  // A provider without a subagent record: the counter is absent (not 0); the root node stays, it is known.
  return {
    ...header('agents', sheet.as_of), session_id: id,
    ...(noSubagents(sheet) ? {} : { subagents_started }),
    nodes,
  };
}

/**
 * All five contract types from ONE raw sheet.
 * `not_delivered` names every type that was not delivered, with the missing REQUIRED fields —
 * a silent `null` would be the same lie as an invented number.
 */
export function contractSheet(sheet, {
  device = null, state = null, capBytes = null, extras = null, withText = false,
} = {}) {
  const session = contractSession(sheet, { extras, withText });
  const live = contractLive(sheet, { device, state });
  const turn = contractTurn(sheet);
  const context = contractContext(sheet);
  // Measure only with a cap; without one the output stays byte-identical to before.
  const agents = contractAgents(sheet, capBytes == null ? {} : {
    fits: (nodes) => Buffer.byteLength(JSON.stringify({
      live, turn, context, session, agents: { ...header('agents', sheet.as_of), nodes },
    })) <= capBytes,
  });
  const missing = [];
  if (!session) missing.push('session:id_or_started_at');
  if (!live) missing.push(`live:${!device ? 'device' : 'state'}_comes_from_host`);
  if (!turn) missing.push('turn:session_id');
  if (!context) missing.push('context:session_id');
  if (!agents) missing.push('agents:session_id');
  // Two contract fields the reader can NEVER fill: subscription numbers are not in the
  // transcript JSONL. They are named instead of staying silent — otherwise a consumer would take
  // the absence for "not measured right now" instead of "never from this source".
  // A provider without a usage record names what it does not deliver, instead of zeros that look measured.
  if (noUsage(sheet)) {
    const p = providerOf(sheet);
    if (live) missing.push(`live:tokens_not_recorded_by_${p}`);
    if (turn) missing.push(`turn:tokens_not_recorded_by_${p}`);
    if (context) missing.push(`context:points_not_recorded_by_${p}`);
    if (session) missing.push(`session:model_not_recorded_by_${p}`);
  } else if (providerOf(sheet) === 'antigravity') {
    // Antigravity CLI >= 1.2.17 records tokens, still no model and no window: the model stays named, the window
    // is an ASSUMPTION — the user's (`windows.antigravity.default`, `_by_settings`) or the shipped default
    // (`_by_default`); a window the transcript itself records (`window_source: 'file'`) needs no marker.
    const p = providerOf(sheet);
    if (session) missing.push(`session:model_not_recorded_by_${p}`);
    if (live && !(sheet.context && sheet.context.window_source === 'file')) missing.push(assumedWindow(sheet) != null ? (sheet.context.window_source === 'default' ? 'live:window_assumed_by_default' : 'live:window_assumed_by_settings') : `live:window_not_recorded_by_${p}`);
  }
  if (noSubagents(sheet) && agents) missing.push(`agents:subagents_not_recorded_by_${providerOf(sheet)}`);
  if (noSkills(sheet) && turn) missing.push(`turn:skills_not_recorded_by_${providerOf(sheet)}`);
  if (live) for (const f of NOT_FROM_TRANSCRIPT) missing.push(`live:${f}_not_in_transcript`);
  return {
    version: CONTRACT_VERSION,
    ...withoutEmpty({ session, live, turn, context, agents }),
    // The window table, keyed by provider, then model. Missing when no model was seen.
    ...withoutEmpty({ windows: session ? (assumedWindow(sheet) != null ? { antigravity: { default: assumedWindow(sheet) } } : windowsOf(sheet, providerOf(sheet))) : null }),
    not_delivered: missing,
    // The caveats (unchecked items) used to stand only in the raw sheet. Whoever gets ONLY the
    // contract form never saw it and would have taken the numbers as checked. It travels now;
    // without block B the field is missing entirely, instead of claiming "all checked" by silence.
    ...withoutEmpty({ caveats: sheet && sheet.block_b ? sheet.block_b.unchecked : null }),
  };
}

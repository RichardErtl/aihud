// AX.2 — the Antigravity adapter (reduced, honest). Every expected value is MEASURED on the fixture
// `fixtures/antigravity/` = the real transcript of 2026-10-01 (Antigravity CLI 1.2.14, 28 lines),
// masked through `fixtures/mask.js maskAntigravityJsonl` (strings -> marker, numbers/enums/times as recorded).
// What Antigravity does not record (tokens, model per step, title, context window) stays null/absent.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as INV from './inventory.js';
const { inventory, findSession } = INV;
import { loadSession, buildSheet } from './derive.js';
import { contractSheet, contractSession, VERSION_BY_TYPE } from './contract.js';
import { readExtras } from './extras.js';
import { eventsOfKind } from './parser.js';
import { checkLeaks } from './leak-check.js';
import { maskAntigravityJsonl, ANTIGRAVITY_FIXTURE_ID } from './fixtures/mask.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLAUDE_ROOT = join(HERE, 'fixtures', 'projects');
const CODEX_DIR = join(HERE, 'fixtures', 'codex');
const AG_ROOT = join(HERE, 'fixtures', 'antigravity');
const ID = 'a9a9a9a9-7e57-4a9b-9a9a-2000000000b2';
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const FIXTURE = join(AG_ROOT, 'brain', ID, '.system_generated', 'logs', 'transcript.jsonl');

const agInv = () => inventory({ root: CLAUDE_ROOT, antigravityRoot: AG_ROOT, nowMs: NOW });
const entry = () => findSession(agInv(), ID);
const sheet = () => buildSheet(loadSession(entry()), { nowMs: NOW });
const parserAg = () => import('./parser-antigravity.js');
const fixtureSeries = async () => (await parserAg()).readAntigravityTranscript(readFileSync(FIXTURE, 'utf8'));

// ── Inventory ────────────────────────────────────────────────────────────────────────────────
test('inventory: finds brain/<id>/.system_generated/logs/transcript.jsonl and joins the workspace from last_conversations.json', () => {
  const e = entry();
  assert.ok(e, 'the antigravity session is in the inventory');
  assert.equal(e.provider, 'antigravity');
  assert.equal(e.session_id, ID);
  assert.equal(e.project_slug, 'antigravity');
  assert.equal(e.main_file, FIXTURE);
  assert.equal(e.workspace_slug, '-sample-workspace', 'workspace path of the cache, slugged like a Claude project folder');
  assert.equal(e.has_ai_title, false, 'Antigravity records no title');
  assert.equal(e.ai_title_chars, null);
  assert.deepEqual(e.subagents, []);
  assert.equal(e.subagent_count, 0);
  assert.equal(JSON.stringify(e).includes('sample/workspace'), false, 'the raw workspace path never travels');
});

test('inventory: Claude and Codex entries are untouched, antigravity is opt-in', () => {
  const inv = inventory({ root: CLAUDE_ROOT, codexRoot: join(CODEX_DIR, 'sessions'), codexIndex: join(CODEX_DIR, 'session_index.jsonl'), antigravityRoot: AG_ROOT, nowMs: NOW });
  const plain = inventory({ root: CLAUDE_ROOT, nowMs: NOW });
  assert.equal(plain.projects.some((p) => p.slug === 'antigravity'), false, 'no antigravityRoot, no antigravity');
  assert.equal(inv.sessions_total, plain.sessions_total + 2, 'one codex + one antigravity session');
  for (const s of inv.projects.filter((p) => p.slug !== 'codex' && p.slug !== 'antigravity').flatMap((p) => p.sessions)) {
    assert.equal('provider' in s, false, 'Claude entries stay byte-identical');
  }
  assert.equal(inv.subagents_total, plain.subagents_total);
});

test('antigravityRoot(home): injectable home, never the real one in a test', () => {
  assert.equal(INV.antigravityRoot('/h'), join('/h', '.gemini', 'antigravity-cli'));
  assert.equal(INV.antigravityRoot(''), INV.antigravityRoot(process.env.USERPROFILE || process.env.HOME || ''));
});

test('inventory: a missing root, a missing cache or a folder without transcript is quiet, not an error', () => {
  const none = inventory({ root: CLAUDE_ROOT, antigravityRoot: join(HERE, 'no-such-dir'), nowMs: NOW });
  assert.equal(none.projects.some((p) => p.slug === 'antigravity'), false);
  const dir = mkdtempSync(join(tmpdir(), 'aihud-ax2-'));
  try {
    const id = 'b1b1b1b1-7e57-4a9b-9a9a-3000000000c3';
    mkdirSync(join(dir, 'brain', id, '.system_generated', 'logs'), { recursive: true });
    mkdirSync(join(dir, 'brain', 'a9a9a9a9-7e57-4a9b-9a9a-4000000000d4'), { recursive: true });   // no logs at all
    writeFileSync(join(dir, 'brain', id, '.system_generated', 'logs', 'transcript.jsonl'), '{"step_index":0}\n');
    const e = findSession(inventory({ root: CLAUDE_ROOT, antigravityRoot: dir, nowMs: NOW }), id);
    assert.ok(e, 'no cache file: the session is still listed');
    assert.equal(e.workspace_slug, null);
    assert.equal(inventory({ root: CLAUDE_ROOT, antigravityRoot: dir, nowMs: NOW }).projects.find((p) => p.slug === 'antigravity').sessions.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── The adapter: neutral events ──────────────────────────────────────────────────────────────
test('parser-antigravity: turn, model responses, tool calls and the error of the fixture', async () => {
  const s = await fixtureSeries();
  assert.equal(s.provider, 'antigravity');
  assert.equal(s.session_id, null, 'no id inside a line - the folder name is the id');
  assert.equal(s.lines_total, 28);
  assert.equal(s.lines_broken, 0);
  assert.equal(s.lines_without_time, 0);
  assert.equal(s.lines_truncated, 4, 'four lines carry truncated_fields (transcript.jsonl is the shortened file)');
  assert.equal(eventsOfKind(s, 'human').length, 1, 'one USER_INPUT = one turn');
  assert.equal(eventsOfKind(s, 'model_response').length, 14, 'PLANNER_RESPONSE steps');
  assert.equal(eventsOfKind(s, 'tool_start').length, 13);
  assert.equal(eventsOfKind(s, 'tool_end').length, 13);
  assert.equal(eventsOfKind(s, 'error').length, 1);
  assert.equal(eventsOfKind(s, 'usage').length, 0, 'no usage series - and nothing invented in its place');
  const names = {};
  for (const e of eventsOfKind(s, 'tool_start')) names[e.name] = (names[e.name] || 0) + 1;
  assert.deepEqual(names, { run_command: 5, view_file: 8 });
  assert.deepEqual(s.models, []);
  assert.deepEqual(s.versions, []);
  assert.equal(s.first_time, Date.parse('2026-10-01T21:02:34Z'));
  assert.equal(s.last_time, Date.parse('2026-10-01T21:03:58Z'));
});

test('parser-antigravity: tool duration from the prose Created At / Completed At, paired by order', async () => {
  const s = await fixtureSeries();
  const starts = eventsOfKind(s, 'tool_start');
  const ends = new Map(eventsOfKind(s, 'tool_end').map((e) => [e.tool_use_id, e]));
  assert.deepEqual(starts.map((e) => ends.get(e.tool_use_id).time - e.time), [4000, 0, 0, 0, 0, 7000, 11000, 6000, 0, 0, 0, 17000, 0]);
  assert.deepEqual(starts.map((e) => ends.get(e.tool_use_id).is_error), [false, false, false, false, false, false, false, false, false, false, true, false, false]);
  assert.equal(new Set(starts.map((e) => e.message_uuid)).size, 13, 'one call per step: duration is tool-precise');
  assert.equal(eventsOfKind(s, 'error')[0].time, Date.parse('2026-10-01T21:03:34Z'));
});

test('parser-antigravity: no prose timestamps = no duration (a tool_start without a tool_end), never an invented one', async () => {
  const { readAntigravityTranscript } = await parserAg();
  const L = (o) => JSON.stringify(o);
  const s = readAntigravityTranscript([
    L({ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-10-01T10:00:00Z', content: 'x' }),
    L({ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-01T10:00:01Z', tool_calls: [{ name: 'view_file', args: {} }] }),
    L({ step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: '2026-10-01T10:00:03Z', content: 'no timestamps here' }),
  ].join('\n'));
  assert.equal(eventsOfKind(s, 'tool_start').length, 1);
  assert.equal(eventsOfKind(s, 'tool_end').length, 0);
  assert.equal(eventsOfKind(s, 'tool_start')[0].time, Date.parse('2026-10-01T10:00:01Z'));
});

test('parser-antigravity: neither prompt, thinking, error text nor tool arguments ever travel (leak rule)', async () => {
  const s = await fixtureSeries();
  const text = JSON.stringify(s);
  assert.equal(text.includes('<<TEXT>>'), false, 'no masked string reached the series');
  const { readAntigravityTranscript } = await parserAg();
  const probe = readAntigravityTranscript(JSON.stringify({ step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: '2026-10-01T10:00:00Z', content: 'SECRET-PROMPT', thinking: 'SECRET-THOUGHT', error: 'SECRET-ERROR' }));
  assert.equal(JSON.stringify(probe).includes('SECRET'), false);
});

test('parser-antigravity: dedup is not needed (no response id), the shared seen-set stays untouched', async () => {
  const { readAntigravityTranscript } = await parserAg();
  const seen = new Set();
  const a = readAntigravityTranscript(readFileSync(FIXTURE, 'utf8'), { seen });
  assert.equal(seen.size, 0);
  assert.equal(a.duplicates, 0);
});

test('parser-antigravity: huge lines are streamed from the file - a 3 MB line, a broken line, a missing file', async () => {
  const { readAntigravityFile } = await parserAg();
  const dir = mkdtempSync(join(tmpdir(), 'aihud-ax2-'));
  try {
    const big = JSON.stringify({ step_index: 2, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: '2026-10-01T10:00:03Z', content: 'Created At: 2026-10-01T12:00:01+02:00\nCompleted At: 2026-10-01T12:00:03+02:00\n' + 'x'.repeat(3_000_000) });
    const call = JSON.stringify({ step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: '2026-10-01T10:00:01Z', tool_calls: [{ name: 'run_command', args: {} }] });
    const file = join(dir, 'transcript.jsonl');
    writeFileSync(file, ['{"broken', call, big].join('\r\n') + '\r\n');
    const s = readAntigravityFile(file);
    assert.equal(s.lines_total, 3);
    assert.equal(s.lines_broken, 1);
    assert.equal(eventsOfKind(s, 'tool_start').length, 1);
    assert.equal(eventsOfKind(s, 'tool_end')[0].time - eventsOfKind(s, 'tool_start')[0].time, 2000);
    assert.equal(JSON.stringify(s).length < 5000, true, 'the 3 MB result is not held in the series');
    assert.equal(readAntigravityFile(join(dir, 'missing.jsonl')).lines_total, 0, 'a missing file is an empty series');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Through the seam: derive + contract ──────────────────────────────────────────────────────
test('seam: loadSession switches the adapter per session file; Claude and Codex path unchanged', () => {
  const loaded = loadSession(entry());
  assert.deepEqual(loaded.fleet, []);
  assert.equal(loaded.main.provider, 'antigravity');
  const claude = findSession(inventory({ root: CLAUDE_ROOT, nowMs: NOW }), '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10');
  assert.equal('provider' in loadSession(claude).main, false, 'the Claude series gains no field');
});

test('raw sheet: turn, tools and durations measured; tokens, model, window null/empty', () => {
  const sh = sheet();
  assert.equal(sh.identity.provider, 'antigravity');
  assert.equal(sh.identity.session_id, ID, 'the id of the entry (folder name)');
  assert.equal(sh.identity.records_usage, false, 'the sheet says: this provider records no usage at all');
  assert.deepEqual(sh.tokens.by_kind, { in: 0, out: 0, cache_read: 0, cache_write: 0 }, 'raw sheet zeros are internal; the contract drops them');
  assert.equal(sh.tokens.total, 0);
  assert.deepEqual(sh.tokens.by_model, {});
  assert.deepEqual(sh.context, { model: null, window: null, used_tokens: null, percent: null, measured_at: null });
  assert.equal(sh.turns.length, 1);
  // 84 s = first event to the START of the last step (the end of the final answer is recorded nowhere): a lower bound,
  // named by the caveat `antigravity_turn_end_is_start_of_last_step`. The file mtime is deliberately not used.
  assert.equal(sh.turns[0].duration_ms, 84_000, 'no native turn duration: first event to start of the last step');
  assert.equal(sh.turns[0].tool_calls.length, 13);
  assert.deepEqual(sh.turns[0].tool_calls.map((c) => c.duration_ms), [4000, 0, 0, 0, 0, 7000, 11000, 6000, 0, 0, 0, 17000, 0]);
  assert.equal(sh.turns[0].model, null);
  assert.equal(sh.block_b.time_series.length, 0);
  assert.equal(sh.fleet_count, 0);
});

test('contract: provider antigravity, an EMPTY usage series is valid - session is delivered, model/window/tokens/title absent', () => {
  const v = contractSheet(sheet(), { device: 'dev1', state: 'quiet' });
  assert.ok(v.session, 'contractSession must not be null for a session without usage');
  assert.equal(v.session.provider, 'antigravity');
  assert.equal(v.session.id, ID);
  assert.equal(v.session.started_at, '2026-10-01T21:02:34.000Z');
  for (const k of ['model', 'title', 'git', 'note']) assert.equal(k in v.session, false, `session.${k} absent`);
  assert.equal(v.session.work_ms, 84_000);
  assert.equal('windows' in v, false, 'no model, no window table');
  const inst = v.live.instances[0];
  for (const k of ['context_percent', 'context_window', 'model', 'tokens_main', 'tokens_total']) {
    assert.equal(k in inst, false, `live.${k} absent`);
  }
  for (const k of ['tokens_by_model', 'tokens_by_agent_type', 'tokens_by_kind']) assert.equal(k in inst, false, `live.${k} absent, no invented zero`);
  assert.equal(v.turn.turns.length, 1);
  const t = v.turn.turns[0];
  assert.equal(t.duration_s, 84);
  assert.equal(t.tool_calls.length, 13);
  assert.deepEqual(t.tool_stats, [
    { tool: 'view_file', count: 8, duration: 0 },
    { tool: 'run_command', count: 5, duration: 45 },
  ]);
  for (const k of ['model', 'tokens_by_model']) assert.equal(k in t, false, `turn.${k} absent`);
  for (const k of ['tokens_in', 'tokens_out']) assert.equal(k in t, false, `turn.${k} absent, no invented zero`);
  assert.deepEqual(v.context.points, []);
  assert.equal(v.agents.nodes.length, 1);
  // AX.4: subagents and skills are NOT RECORDED, not zero: the counters are absent, no empty list that reads as "none".
  assert.equal('subagents_started' in v.agents, false, 'agents.subagents_started absent, never 0');
  assert.equal(v.agents.version, '1.4');
  assert.equal(v.turn.version, '1.3');
  for (const z of v.turn.turns) assert.equal('skills' in z, false, 'turn.skills absent, never []');
  assert.deepEqual(v.not_delivered.filter((x) => !x.endsWith('_not_in_transcript')), [
    'live:tokens_not_recorded_by_antigravity',
    'turn:tokens_not_recorded_by_antigravity',
    'context:points_not_recorded_by_antigravity',
    'session:model_not_recorded_by_antigravity',
    'agents:subagents_not_recorded_by_antigravity',
    'turn:skills_not_recorded_by_antigravity',
  ]);
});

test('contractSession: a sheet with an id and a start but no usage at all is a session, never null', () => {
  const s = contractSession({ identity: { session_id: 'x-1', provider: 'antigravity' }, time: { start: '2026-10-01T21:02:34.000Z' }, tokens: { by_model: {} }, context: { model: null }, block_b: { time_series: [] } });
  assert.ok(s);
  assert.equal(s.provider, 'antigravity');
  assert.equal('model' in s, false);
  assert.equal(contractSession({ identity: { session_id: 'x-1' }, time: {} }), null, 'the two REQUIRED fields still gate');
});

test('title and git: Antigravity names none, even when text is asked for', () => {
  const loaded = loadSession(entry());
  const ex = readExtras(loaded, { aihudHome: join(HERE, 'no-home'), withText: true });
  assert.equal(ex.ai_title, null);
  assert.equal(ex.git, null);
  const v = contractSheet(sheet(), { extras: ex, withText: true });
  assert.equal('title' in v.session, false);
  assert.equal('git' in v.session, false);
});

test('leak check passes over the antigravity contract', () => {
  const v = contractSheet(sheet(), { device: 'dev1', state: 'quiet' });
  const r = checkLeaks(v);
  assert.deepEqual(r.violations, [], 'no plain text, no marker, no path');
  assert.equal(r.clean, true);
});

test('caveats: an Antigravity sheet carries its own unchecked marks, no Claude or Codex mark', async () => {
  const { ANTIGRAVITY_UNCHECKED } = await parserAg();
  assert.deepEqual(ANTIGRAVITY_UNCHECKED, [
    'antigravity_result_paired_to_call_by_order_unchecked',
    'antigravity_several_calls_per_step_unchecked',
    'antigravity_follow_up_user_turns_unchecked',
    'antigravity_error_step_shape_unchecked',
    'antigravity_prose_timestamps_second_resolution_unchecked',
    'antigravity_turn_end_is_start_of_last_step',
  ]);
  const sh = sheet();
  assert.deepEqual(sh.block_b.unchecked, ANTIGRAVITY_UNCHECKED);
  const v = contractSheet(sh);
  assert.deepEqual(v.caveats, ANTIGRAVITY_UNCHECKED);
  const text = JSON.stringify(v.caveats);
  for (const foreign of ['vscode', 'spawn_depth', 'codex']) assert.equal(text.includes(foreign), false, foreign);
});

// ── Fixture hygiene + reproducible mask ──────────────────────────────────────────────────────
test('fixture hygiene: no real id, no home path, no mail, no key, no prompt text - only the masked structure', () => {
  const text = readFileSync(FIXTURE, 'utf8') + readFileSync(join(AG_ROOT, 'cache', 'last_conversations.json'), 'utf8');
  const PRIVATE_IDS = new Set(['768caf73ec3bcacb']);   // sha256 prefix of the real conversation id, never spelled here
  for (const [id] of text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) {
    assert.equal(PRIVATE_IDS.has(createHash('sha256').update(id.toLowerCase()).digest('hex').slice(0, 16)), false, 'the real conversation id');
  }
  for (const bad of ['c:\\\\dev', 'C:\\\\dev', 'c:/dev', '@', 'AIza', 'sk-']) {
    assert.equal(text.includes(bad), false, bad);
  }
  // A real prompt fragment: only its sha256 prefix is spelled here (same scheme as PRIVATE_IDS); every window of that length is hashed.
  for (let i = 0; i + 12 <= text.length; i++) {
    assert.equal(createHash('sha256').update(text.slice(i, i + 12)).digest('hex').slice(0, 16) === '21af11c7f86d43f6', false, 'a private fragment at offset ' + i);
  }
  // A private folder name: only its sha256 prefix is spelled here; every window of that length is hashed.
  for (let i = 0; i + 6 <= text.length; i++) {
    assert.equal(createHash('sha256').update(text.slice(i, i + 6)).digest('hex').slice(0, 16) === '522e5549af01c747', false, 'a private fragment at offset ' + i);
  }
  // Home path of the real user (slash form, escaped-backslash form): only sha256 prefixes are spelled here.
  for (let i = 0; i + 10 <= text.length; i++) {
    assert.equal(createHash('sha256').update(text.slice(i, i + 10)).digest('hex').slice(0, 16) === '552a41abe53508b0', false, 'a home path of the real user at offset ' + i);
  }
  for (let i = 0; i + 11 <= text.length; i++) {
    assert.equal(createHash('sha256').update(text.slice(i, i + 11)).digest('hex').slice(0, 16) === 'ed9460cd6f74742f', false, 'a home path of the real user at offset ' + i);
  }
  assert.equal(readdirSync(join(AG_ROOT, 'brain')).length, 1);
  assert.equal(ID, ANTIGRAVITY_FIXTURE_ID);
  const lines = readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.equal(lines.length, 28);
  for (const o of lines) {
    for (const k of ['content', 'thinking', 'error']) if (typeof o[k] === 'string') assert.match(o[k], /<<TEXT>>$/, `${k} of step ${o.step_index} is masked`);
    for (const c of o.tool_calls || []) for (const v of Object.values(c.args)) assert.ok(v === '<<TEXT>>' || typeof v === 'number', 'tool argument values are masked');
  }
  assert.equal(lines.filter((o) => /^Created At: \S+\nCompleted At: \S+\n<<TEXT>>$/.test(o.content || '')).length, 13, 'the prose timestamp head survives');
});

test('mask: reproducible - masking the shipped fixture again is byte-identical (idempotent, deterministic)', () => {
  const text = readFileSync(FIXTURE, 'utf8');
  assert.equal(maskAntigravityJsonl(text), text);
  assert.equal(maskAntigravityJsonl(maskAntigravityJsonl(text)), text);
});

// ── Versions and documents ───────────────────────────────────────────────────────────────────
test('versions: session 2.2 (provider may be antigravity, optional fields may be absent), the rest untouched', () => {
  assert.deepEqual(VERSION_BY_TYPE, { session: '2.2', live: '1.6', turn: '1.3', context: '1.0', agents: '1.4' });
  const v = contractSheet(sheet());
  assert.equal(v.session.version, '2.2');
  const c = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
  const md = readFileSync(join(HERE, '..', 'tiles', 'CONTRACT.md'), 'utf8');
  assert.equal(c.readerAlsoMeasuredAgainstAntigravity, 'Antigravity CLI 1.2.17');
  assert.equal(c.readerVersion, '1.0');
  assert.equal(c.contractVersion, '1.1');
  assert.match(md, /readerAlsoMeasuredAgainstAntigravity/);
  assert.match(md, /antigravity/);
  assert.match(JSON.stringify(c), /antigravity/);
  assert.match(md, /`session` 2\.2 /, 'CONTRACT.md names the version the reader emits');
});

// ── Rework round (review of AX.2) ────────────────────────────────────────────────────────────
const AGL = (o) => JSON.stringify(o);
const user = (i, t) => AGL({ step_index: i, source: 'USER_EXPLICIT', type: 'USER_INPUT', status: 'DONE', created_at: t, content: 'x' });
const plan = (i, t, names) => AGL({ step_index: i, source: 'MODEL', type: 'PLANNER_RESPONSE', status: 'DONE', created_at: t, tool_calls: names.map((name) => ({ name, args: {} })) });
const res = (i, t, head) => AGL({ step_index: i, source: 'MODEL', type: 'GENERIC', status: 'DONE', created_at: t, content: head + '\nrest' });

test('pairing: one missing result must not shift the later pairs (left-over calls keep no tool_end)', async () => {
  const { readAntigravityTranscript } = await parserAg();
  const s = readAntigravityTranscript([
    user(0, '2026-10-01T10:00:00Z'),
    plan(1, '2026-10-01T10:00:01Z', ['run_command']),            // its result never arrives
    plan(2, '2026-10-01T10:00:05Z', ['view_file']),
    res(3, '2026-10-01T10:00:09Z', 'Created At: 2026-10-01T10:00:06Z\nCompleted At: 2026-10-01T10:00:09Z'),
  ].join('\n'));
  const starts = eventsOfKind(s, 'tool_start');
  const ends = eventsOfKind(s, 'tool_end');
  assert.equal(ends.length, 1);
  assert.equal(ends[0].tool_use_id, 'step-2-0', 'the result belongs to the view_file call, not to the stale run_command');
  assert.equal(starts.find((e) => e.name === 'view_file').time, Date.parse('2026-10-01T10:00:06Z'));
  assert.equal(starts.find((e) => e.name === 'run_command').time, Date.parse('2026-10-01T10:00:01Z'), 'untouched, no duration');
});

test('prose timestamps without an offset or Z give no duration (host-local time is never assumed)', async () => {
  const { readAntigravityTranscript, proseTimes } = await parserAg();
  assert.equal(proseTimes('Created At: 2026-10-01T10:00:06\nCompleted At: 2026-10-01T10:00:09\nx'), null);
  assert.equal(proseTimes('Created At: 2026-10-01T10:00:06Z\nCompleted At: 2026-10-01T12:00:09+02:00\nx').completed, Date.parse('2026-10-01T10:00:09Z'));
  const s = readAntigravityTranscript([
    user(0, '2026-10-01T10:00:00Z'), plan(1, '2026-10-01T10:00:01Z', ['view_file']),
    res(2, '2026-10-01T10:00:09Z', 'Created At: 2026-10-01T10:00:06\nCompleted At: 2026-10-01T10:00:09'),
  ].join('\n'));
  assert.equal(eventsOfKind(s, 'tool_end').length, 0);
});

test('no invented tokens: Claude and Codex sheets do not carry records_usage, the Antigravity sheet says false', () => {
  assert.equal(sheet().identity.records_usage, false);
  const claude = buildSheet(loadSession(findSession(inventory({ root: CLAUDE_ROOT, nowMs: NOW }), '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10')), { nowMs: NOW });
  assert.equal('records_usage' in claude.identity, false);
  const cv = contractSheet(claude, { device: 'd', state: 'quiet' });
  assert.equal(cv.not_delivered.some((x) => x.includes('not_recorded_by')), false);
  assert.ok('tokens_by_kind' in cv.live.instances[0]);
  assert.ok('tokens_in' in cv.turn.turns[0]);
});

test('AX.4: Claude and Codex keep subagents_started and the not_delivered list without subagent/skill gaps', () => {
  const claude = buildSheet(loadSession(findSession(inventory({ root: CLAUDE_ROOT, nowMs: NOW }), '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10')), { nowMs: NOW });
  for (const k of ['records_subagents', 'records_skills']) assert.equal(k in claude.identity, false, k);
  const cv = contractSheet(claude, { device: 'd', state: 'quiet' });
  assert.equal(Number.isInteger(cv.agents.subagents_started), true);
  assert.equal(cv.not_delivered.some((x) => /subagents_not_recorded|skills_not_recorded/.test(x)), false);
});

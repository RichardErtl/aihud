// AX.1 — the Codex adapter. Every expected value is MEASURED on the fixture
// `fixtures/codex/` = the real rollout of 2026-10-01 (Codex 0.160.0), masked through
// `fixtures/mask.js maskCodexJsonl` (strings -> marker, ids remapped, every number as recorded).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as INV from './inventory.js';
const { inventory, findSession } = INV;
import { loadSession, buildSheet } from './derive.js';
import { contractSheet } from './contract.js';
import { readExtras } from './extras.js';
import { eventsOfKind } from './parser.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLAUDE_ROOT = join(HERE, 'fixtures', 'projects');
const CODEX_DIR = join(HERE, 'fixtures', 'codex');
const CODEX_ROOT = join(CODEX_DIR, 'sessions');
const CODEX_INDEX = join(CODEX_DIR, 'session_index.jsonl');
const ID = 'c0dec0de-5a17-4c0d-9e5e-1000000000a1';
const NOW = Date.parse('2026-10-05T12:00:00.000Z');
const FIXTURE = join(CODEX_ROOT, '2026', '10', '01', `rollout-2026-10-01T22-46-14-${ID}.jsonl`);

const codexInv = () => inventory({ root: CLAUDE_ROOT, codexRoot: CODEX_ROOT, codexIndex: CODEX_INDEX, nowMs: NOW });
const entry = () => findSession(codexInv(), ID);
const sheet = () => buildSheet(loadSession(entry()), { nowMs: NOW });
const parserCodex = () => import('./parser-codex.js');

// ── Inventory ────────────────────────────────────────────────────────────────────────────────
test('inventory: finds ~/.codex/sessions/**/rollout-*.jsonl and joins the title mark from session_index', () => {
  const e = entry();
  assert.ok(e, 'the codex session is in the inventory');
  assert.equal(e.provider, 'codex');
  assert.equal(e.main_file, FIXTURE);
  assert.equal(e.has_ai_title, true);
  assert.equal(e.ai_title_chars, 'Sample codex session'.length, 'a mark, never the title text');
  assert.deepEqual(e.subagents, []);
  assert.equal(e.subagent_count, 0);
  assert.equal(JSON.stringify(e).includes('Sample codex'), false, 'inventory carries no title text');
});

test('inventory: Claude entries are untouched (no provider key), and codex is opt-in', () => {
  const inv = codexInv();
  const claude = inv.projects.filter((p) => p.slug !== 'codex').flatMap((p) => p.sessions);
  assert.equal(claude.length, 2);
  for (const s of claude) assert.equal('provider' in s, false, 'Claude entries stay byte-identical');
  const plain = inventory({ root: CLAUDE_ROOT, nowMs: NOW });
  assert.equal(plain.projects.some((p) => p.slug === 'codex'), false, 'no codexRoot, no codex');
  assert.equal(inv.sessions_total, plain.sessions_total + 1);
  assert.equal(inv.subagents_total, plain.subagents_total);
});

test('codexRoot(home): injectable home, never the real one in a test', () => {
  assert.equal(INV.codexRoot('/h'), join('/h', '.codex', 'sessions'));
  assert.equal(INV.codexRoot(''), INV.codexRoot(process.env.USERPROFILE || process.env.HOME || ''));
});

test('inventory: a missing codex root or index is quiet, not an error', () => {
  const inv = inventory({ root: CLAUDE_ROOT, codexRoot: join(HERE, 'no-such-dir'), nowMs: NOW });
  assert.equal(inv.projects.some((p) => p.slug === 'codex'), false);
  const noIdx = inventory({ root: CLAUDE_ROOT, codexRoot: CODEX_ROOT, codexIndex: join(HERE, 'no-such.jsonl'), nowMs: NOW });
  const e = findSession(noIdx, ID);
  assert.equal(e.has_ai_title, false);
  assert.equal(e.ai_title_chars, null);
});

// ── The adapter: neutral events ──────────────────────────────────────────────────────────────
test('parser-codex: one usage event per answer, neutral shape, window from the file', async () => {
  const { readCodexTranscript } = await parserCodex();
  const s = readCodexTranscript(readFileSync(FIXTURE, 'utf8'));
  assert.equal(s.provider, 'codex');
  assert.equal(s.session_id, ID);
  assert.equal(s.lines_total, 35);
  assert.equal(s.lines_broken, 0);
  const u = eventsOfKind(s, 'usage');
  assert.equal(u.length, 4, 'four answers (token_usage_record), the four token_count lines are not counted again');
  // input_tokens INCLUDES the cached part (total = input + output, measured) - in = input - cached
  assert.deepEqual(u.map((e) => [e.in, e.cache_read, e.cache_write, e.out, e.total, e.window_used]), [
    [2564, 12288, 0, 156, 15008, 14852],
    [9351, 12288, 0, 222, 21861, 21639],
    [12348, 21504, 0, 123, 33975, 33852],
    [3210, 33664, 0, 466, 37340, 36874],
  ]);
  for (const e of u) {
    assert.equal(e.model, 'gpt-6.1-sol');
    assert.equal(e.window, 258_400);
    assert.equal(e.window_source, 'file');
    assert.equal(typeof e.time, 'number');
  }
  assert.deepEqual(s.models, ['gpt-6.1-sol']);
  assert.deepEqual(s.versions, ['0.160.0']);
});

test('parser-codex: turn boundary = task_started, developer and user messages are no turns', async () => {
  const { readCodexTranscript } = await parserCodex();
  const s = readCodexTranscript(readFileSync(FIXTURE, 'utf8'));
  const lines = readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const messages = lines.filter((o) => o.type === 'response_item' && o.payload.type === 'message');
  assert.equal(messages.filter((o) => o.payload.role === 'developer').length, 3, 'trip-wire: the fixture carries the 3 developer messages');
  assert.equal(messages.filter((o) => o.payload.role === 'user').length, 2);
  assert.equal(eventsOfKind(s, 'human').length, 1, 'one task_started = one turn');
  assert.equal(eventsOfKind(s, 'turn_end').length, 1);
});

test('parser-codex: tool durations from item_completed started_at_ms/completed_at_ms', async () => {
  const { readCodexTranscript } = await parserCodex();
  const s = readCodexTranscript(readFileSync(FIXTURE, 'utf8'));
  const starts = eventsOfKind(s, 'tool_start');
  const ends = new Map(eventsOfKind(s, 'tool_end').map((e) => [e.tool_use_id, e]));
  assert.equal(starts.length, 6, 'six CommandExecution items; UserMessage/AgentMessage are no tools');
  assert.ok(starts.every((e) => e.name === 'CommandExecution'));
  assert.deepEqual(starts.map((e) => ends.get(e.tool_use_id).time - e.time), [331, 318, 310, 415, 326, 697]);
  assert.ok(starts.every((e) => ends.get(e.tool_use_id).is_error === false));
  assert.equal(new Set(starts.map((e) => e.message_uuid)).size, 6, 'every call its own start: duration is tool-precise');
});

test('parser-codex: the output of a command never travels (leak rule)', async () => {
  const { readCodexTranscript } = await parserCodex();
  const s = readCodexTranscript(readFileSync(FIXTURE, 'utf8'));
  const text = JSON.stringify(s);
  assert.equal(text.includes('<<TEXT>>'), false, 'no masked string reached the series');
});

test('parser-codex: dedup by response_id across a shared seen-set', async () => {
  const { readCodexTranscript } = await parserCodex();
  const text = readFileSync(FIXTURE, 'utf8');
  const seen = new Set();
  const a = readCodexTranscript(text, { seen });
  const b = readCodexTranscript(text, { seen });
  assert.equal(eventsOfKind(a, 'usage').length, 4);
  assert.equal(eventsOfKind(b, 'usage').length, 0);
  assert.equal(b.duplicates, 4);
});

test('parser-codex: window fallback table windows.codex[model] when the file names none; unknown stays null', async () => {
  const { readCodexTranscript, windowForCodexModel } = await parserCodex();
  const rec = (model) => [
    { timestamp: '2026-10-01T10:00:00.000Z', type: 'turn_context', payload: { model } },
    { timestamp: '2026-10-01T10:00:01.000Z', type: 'token_usage_record', payload: { response_id: 'resp_x' + model, usage: { input_tokens: 100, cached_input_tokens: 40, cache_write_input_tokens: 0, output_tokens: 10, reasoning_output_tokens: 0, total_tokens: 110 } } },
  ].map((o) => JSON.stringify(o)).join('\n');
  const known = eventsOfKind(readCodexTranscript(rec('gpt-6.1-sol')), 'usage')[0];
  assert.equal(known.window, 258_400);
  assert.equal(known.window_source, 'table');
  assert.equal(windowForCodexModel('gpt-6.1-sol'), 258_400);
  const unknown = eventsOfKind(readCodexTranscript(rec('gpt-unknown-9')), 'usage')[0];
  assert.equal(unknown.window, null, 'never an invented window');
  assert.equal(unknown.window_source, null);
  assert.equal(windowForCodexModel('gpt-unknown-9'), null);
});

test('parser-codex: a value Codex does not deliver stays absent (no usage fields = no usage event)', async () => {
  const { readCodexTranscript } = await parserCodex();
  const text = JSON.stringify({ timestamp: '2026-10-01T10:00:01.000Z', type: 'token_usage_record', payload: { response_id: 'resp_a', usage: { input_tokens: 'x' } } });
  assert.equal(eventsOfKind(readCodexTranscript(text), 'usage').length, 0);
});

test('parser-codex: huge lines are streamed from the file - a 3 MB line, a broken line, no whole-file read', async () => {
  const { readCodexFile } = await parserCodex();
  const dir = mkdtempSync(join(tmpdir(), 'aihud-ax1-'));
  try {
    const big = JSON.stringify({ timestamp: '2026-10-01T10:00:02.000Z', type: 'event_msg', payload: { type: 'item_completed', item: { type: 'CommandExecution', id: 'exec-1', stdout: 'x'.repeat(3_000_000), status: 'completed', exit_code: 0 }, started_at_ms: 1000, completed_at_ms: 2500 } });
    const usage = JSON.stringify({ timestamp: '2026-10-01T10:00:03.000Z', type: 'token_usage_record', payload: { response_id: 'resp_big', usage: { input_tokens: 10, cached_input_tokens: 4, cache_write_input_tokens: 0, output_tokens: 2, reasoning_output_tokens: 0, total_tokens: 12 } } });
    const file = join(dir, 'rollout-x.jsonl');
    writeFileSync(file, ['{"broken', big, usage].join('\r\n') + '\r\n');
    const s = readCodexFile(file);
    assert.equal(s.lines_total, 3);
    assert.equal(s.lines_broken, 1);
    assert.equal(eventsOfKind(s, 'tool_start').length, 1);
    assert.equal(eventsOfKind(s, 'tool_end')[0].time - eventsOfKind(s, 'tool_start')[0].time, 1500);
    assert.equal(eventsOfKind(s, 'usage')[0].total, 12);
    assert.equal(JSON.stringify(s).length < 5000, true, 'the 3 MB stdout is not held in the series');
    assert.equal(readCodexFile(join(dir, 'missing.jsonl')).lines_total, 0, 'a missing file is an empty series');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ── Through the seam: derive + contract ──────────────────────────────────────────────────────
test('seam: loadSession switches the adapter per session file; Claude path unchanged', () => {
  const loaded = loadSession(entry());
  assert.deepEqual(loaded.fleet, []);
  assert.equal(loaded.main.provider, 'codex');
  const claude = findSession(inventory({ root: CLAUDE_ROOT, nowMs: NOW }), '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10');
  assert.equal('provider' in loadSession(claude).main, false, 'the Claude series gains no field');
});

test('raw sheet: tokens, fill level, turn and tool durations of the codex session', () => {
  const sh = sheet();
  assert.equal(sh.identity.provider, 'codex');
  assert.equal(sh.identity.session_id, ID);
  assert.deepEqual(sh.tokens.by_kind, { in: 27473, out: 967, cache_read: 79744, cache_write: 0 });
  assert.equal(sh.tokens.total, 108_184, 'equals the thread_token_usage total of the last record');
  assert.deepEqual(sh.tokens.by_model, { 'gpt-6.1-sol': 108_184 });
  assert.equal(sh.context.model, 'gpt-6.1-sol');
  assert.equal(sh.context.window, 258_400);
  assert.equal(sh.context.used_tokens, 36_874);
  assert.equal(sh.context.percent, 14.3);
  assert.equal(sh.context.window_source, 'file');
  assert.equal(sh.turns.length, 1);
  assert.equal(sh.turns[0].duration_ms, 92_830, 'Codex own number: task_complete.duration_ms');
  assert.equal('native_duration_ms' in sh.turns[0], false, 'no internal field leaves derive');
  assert.equal(sh.turns[0].tool_calls.length, 6);
  assert.deepEqual(sh.turns[0].tool_calls.map((c) => c.duration_ms), [331, 318, 310, 415, 326, 697]);
  assert.equal(sh.block_b.time_series.length, 4);
  assert.equal(sh.fleet_count, 0);
});

test('contract: provider per session, model, window, tokens, turn and tool durations', () => {
  const sh = sheet();
  const v = contractSheet(sh, { device: 'dev1', state: 'quiet' });
  assert.equal(v.session.provider, 'codex');
  assert.equal(v.session.id, ID);
  assert.equal(v.session.started_at, '2026-10-01T20:46:36.695Z');
  assert.equal(v.session.model, 'gpt-6.1-sol');
  assert.deepEqual(v.windows, { codex: { 'gpt-6.1-sol': 258_400 } });
  assert.equal(v.live.instances[0].context_window, 258_400);
  assert.equal(v.live.instances[0].context_percent, 14.3);
  assert.deepEqual(v.live.instances[0].tokens_by_kind, { input: 27473, output: 967, cache_read: 79744, cache_write: 0 });
  assert.equal(v.live.instances[0].tokens_total, 108_184);
  assert.equal(v.turn.turns.length, 1);
  const t = v.turn.turns[0];
  assert.equal(t.duration_s, 93);
  assert.equal(t.model, 'gpt-6.1-sol');
  assert.equal(t.tool_calls.length, 6);
  assert.deepEqual(t.tool_calls.map((c) => c.duration_s), [0, 0, 0, 0, 0, 1]);
  assert.deepEqual(t.tool_stats, [{ tool: 'CommandExecution', count: 6, duration: 2 }]);
  assert.equal(v.context.points.length, 4);
  assert.equal(v.context.points[3].percent, 14.3);
  assert.equal(v.agents.nodes.length, 1);
  assert.deepEqual(v.not_delivered.filter((x) => !x.startsWith('live:')), []);
});

test('title: the thread_name of session_index.jsonl, only with text, never in the structure sheet', () => {
  const loaded = loadSession(entry());
  assert.equal(readExtras(loaded, { aihudHome: join(HERE, 'no-home'), withText: false }).ai_title, null);
  const ex = readExtras(loaded, { aihudHome: join(HERE, 'no-home'), withText: true });
  assert.equal(ex.ai_title, 'Sample codex session');
  assert.equal(ex.git, null, 'no git claim from a codex rollout (cwd stays out)');
  const withText = contractSheet(sheet(), { extras: ex, withText: true });
  assert.equal(withText.session.title, 'Sample codex session');
  assert.equal('title' in contractSheet(sheet()).session, false);
});

test('leak check passes over the codex contract', () => {
  const v = contractSheet(sheet(), { device: 'dev1', state: 'quiet' });
  const r = checkLeaks(v);
  assert.deepEqual(r.violations, [], 'no plain text, no marker, no path');
  assert.equal(r.clean, true);
});

test('fixture hygiene: no marker of a real id, no home path, nothing but the masked structure', () => {
  const text = readFileSync(FIXTURE, 'utf8') + readFileSync(CODEX_INDEX, 'utf8');
  // The real session id is never spelled here: only its sha256 prefix is compared (same scheme as fence.test.js).
  const PRIVATE_IDS = new Set(['d09824c154d86977']);
  for (const [id] of text.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi)) {
    assert.equal(PRIVATE_IDS.has(createHash('sha256').update(id.toLowerCase()).digest('hex').slice(0, 16)), false, 'the real session id');
  }
  for (const bad of ['c:\\\\dev', 'c:/dev', '@', 'base_instructions":{"text":"You']) {
    assert.equal(text.includes(bad), false, bad);
  }
  // A private folder name: only its sha256 prefix is spelled here (same scheme as PRIVATE_IDS); every window of that length is hashed.
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
  assert.equal(readdirSync(join(CODEX_ROOT, '2026', '10', '01')).length, 1);
  for (const l of readFileSync(FIXTURE, 'utf8').split('\n').filter(Boolean)) assert.ok(l.length < 8000, 'the 248 KB lines are shrunk');
});

// ── Rework round (review of AX.1) ────────────────────────────────────────────────────────────
const U = (i, c, o) => ({ input_tokens: i, cached_input_tokens: c, cache_write_input_tokens: 0, output_tokens: o, reasoning_output_tokens: 0, total_tokens: i + o });
const jl = (...ls) => ls.map((o) => JSON.stringify(o)).join('\n');
const rec = (id, usage) => ({ timestamp: '2026-10-01T10:00:01.000Z', type: 'token_usage_record', payload: { response_id: id, usage } });
const tc = (cum, last) => ({ timestamp: '2026-10-01T10:00:02.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: U(cum, 0, 0), last_token_usage: last, model_context_window: 1000 } } });

test('caveats: a Codex sheet carries its own unchecked marks, not the two Claude ones', async () => {
  const { CODEX_UNCHECKED } = await parserCodex();
  assert.deepEqual(CODEX_UNCHECKED, [
    'codex_cache_write_inside_input_unchecked', 'codex_reasoning_inside_output_unchecked', 'codex_unknown_item_types_as_tools_unchecked',
  ]);
  const sh = sheet();
  assert.deepEqual(sh.block_b.unchecked, CODEX_UNCHECKED);
  const v = contractSheet(sh);
  assert.deepEqual(v.caveats, CODEX_UNCHECKED);
  assert.equal(JSON.stringify(v.caveats).includes('vscode'), false);
  assert.equal(JSON.stringify(v.caveats).includes('spawn_depth'), false);
  const claude = buildSheet(loadSession(findSession(inventory({ root: CLAUDE_ROOT, nowMs: NOW }), '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10')), { nowMs: NOW });
  assert.deepEqual(claude.block_b.unchecked, ['prompt_source_outside_vscode_unchecked', 'task_notification_at_spawn_depth_above_1_unchecked']);
});

test('an answer whose split does not add up is counted, not dropped silently', async () => {
  const { readCodexTranscript } = await parserCodex();
  const s = readCodexTranscript(jl(rec('resp_ok', U(100, 40, 10)), rec('resp_bad', U(100, 140, 10)), rec('resp_bad2', { input_tokens: 'x' })));
  assert.equal(eventsOfKind(s, 'usage').length, 1);
  assert.equal(s.usage_unsplit, 2);
  assert.equal(readCodexTranscript(readFileSync(FIXTURE, 'utf8')).usage_unsplit, 0);
});

test('turn_end carries Codex own duration_ms (92830 in the fixture)', async () => {
  const { readCodexTranscript } = await parserCodex();
  const s = readCodexTranscript(readFileSync(FIXTURE, 'utf8'));
  assert.equal(eventsOfKind(s, 'turn_end')[0].duration_ms, 92_830);
});

test('token_count.last_token_usage is the fallback ONLY for a file without any token_usage_record', async () => {
  const { readCodexTranscript } = await parserCodex();
  const only = readCodexTranscript(jl(tc(110, U(100, 40, 10)), tc(110, U(100, 40, 10)), tc(250, U(120, 60, 20))));
  const u = eventsOfKind(only, 'usage');
  assert.equal(u.length, 2, 'a repeated cumulative total is one answer');
  assert.deepEqual(u.map((e) => [e.in, e.cache_read, e.out, e.window]), [[60, 40, 10, 1000], [60, 60, 20, 1000]]);
  assert.equal(u.every((e) => !('fallback' in e)), true, 'the internal marker never leaves the parser');
  const both = readCodexTranscript(jl(tc(110, U(100, 40, 10)), rec('resp_1', U(100, 40, 10))));
  assert.equal(eventsOfKind(both, 'usage').length, 1, 'never both');
  assert.equal(eventsOfKind(both, 'usage')[0].key, 'resp_1');
  assert.equal(eventsOfKind(readCodexTranscript(readFileSync(FIXTURE, 'utf8')), 'usage').length, 4, 'the fixture stays on its records');
});

test('contract texts name Codex next to Claude Code, versions of the reader untouched', () => {
  const c = JSON.parse(readFileSync(join(HERE, '..', 'tiles', 'contract.json'), 'utf8'));
  const md = readFileSync(join(HERE, '..', 'tiles', 'CONTRACT.md'), 'utf8');
  assert.equal(c.readerAlsoMeasuredAgainst, 'Codex 0.160.1');
  assert.equal(c.readerVersion, '1.0');
  assert.equal(c.contractVersion, '1.1');
  assert.match(md, /readerAlsoMeasuredAgainst/);
  assert.match(JSON.stringify(c), /thread_name/);
  assert.match(md, /thread_name/);
});

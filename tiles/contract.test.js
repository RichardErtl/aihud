// Probes for the tile contract (CONTRACT.md + contract.json), the example tile and the two tile
// commands. Run: `npm test`
// The two field-name probes check the documented field list against what the reader really
// delivers, in both directions: no delivered field without a documented meaning, no documented
// field the reader does not deliver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inventory, findSession } from '../reader/inventory.js';
import { loadSession, buildSheet } from '../reader/derive.js';
import { contractSheet, collapseRuns, LATER_ADDITIONS } from '../reader/contract.js';
import { readExtras } from '../reader/extras.js';
import { meta, render } from './example-number.js';
import { meta as twinMeta } from './example-number-landscape.js';
import { main, SKILL_SOURCE } from './cli.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'aihud.js');
const C = JSON.parse(readFileSync(join(HERE, 'contract.json'), 'utf8'));
const DOC = readFileSync(join(HERE, 'CONTRACT.md'), 'utf8');
const FIXTURES = join(HERE, '..', 'reader', 'fixtures', 'projects');
const A = '5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10';
const B = 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36';
const NOW = Date.parse('2026-09-10T12:00:00.000Z');
const HOST = { device: 'laptop', state: 'awake' };

function sheetOf(id) {
  const inv = inventory({ root: FIXTURES, nowMs: NOW });
  return contractSheet(buildSheet(loadSession(findSession(inv, id)), { nowMs: NOW }), HOST);
}

// Maps carry the source's words as keys (model ids, agent types, token kinds): values, not field
// names. contract.json marks them by unit "map …"; the walk does not descend into them.
const MAPS = new Set(C.fields.filter((f) => f.unit.startsWith('map')).map((f) => f.path));
// Path grammar: a documented `<key>` segment stands for ANY key of that object (data-driven
// keys that are walked, e.g. `windows.<key>.<key>` = provider, then model).
const KEYED = new Set(C.fields.flatMap((f) => [...f.path.matchAll(/\.<key>/g)].map((m) => f.path.slice(0, m.index))));
function fieldPaths(value, prefix = '', out = new Set()) {
  if (Array.isArray(value)) { for (const v of value) fieldPaths(v, `${prefix}[]`, out); return out; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const p = prefix ? `${prefix}.${KEYED.has(prefix) ? '<key>' : k}` : k;
      out.add(p);
      if (!MAPS.has(p)) fieldPaths(v, p, out);
    }
  }
  return out;
}

/** Everything the reader delivers over both fixtures, plus a collapsed workflow node. */
function deliveredPaths() {
  const out = new Set();
  for (const id of [A, B]) fieldPaths(sheetOf(id), '', out);
  // Session extras: a real sidecar in a temp home (read by the reader) plus a stubbed git
  // state (no fixture repo), so title/note/closed/closed_at/git are walked at least once.
  const home = mkdtempSync(join(tmpdir(), 'aihud-contract-'));
  try {
    mkdirSync(join(home, 'sessions'));
    writeFileSync(join(home, 'sessions', `${A}.json`),
      JSON.stringify({ title: 't', note: 'n', closed: true, closed_at: '2026-09-10T11:59:00Z' }));
    const loaded = loadSession(findSession(inventory({ root: FIXTURES, nowMs: NOW }), A));
    const extras = readExtras(loaded, { aihudHome: home, env: {}, nowMs: NOW, withText: true });
    extras.git = {
      start_head: 'a'.repeat(40),
      commits: [{ sha: 'b'.repeat(40), at: '2026-09-10T11:00:00.000Z', first_line: 'x', source: 'transcript' }],
      dirty: null,
    };
    fieldPaths(contractSheet(buildSheet(loaded, { nowMs: NOW }), { ...HOST, extras, withText: true }), '', out);
  } finally { rmSync(home, { recursive: true, force: true }); }
  // `agent_count` exists only on a collapsed workflow run — made by the reader's own collapse.
  const nodes = collapseRuns(
    [{ id: 'root' }, { id: 'x1', parent_id: 'root', tokens_total: 5 }, { id: 'x2', parent_id: 'root', tokens_total: 7 }],
    [null, 'wf', 'wf'],
    () => false,
  );
  fieldPaths({ agents: { nodes } }, '', out);
  return out;
}

test('field names: every field the reader delivers has a documented meaning', () => {
  const delivered = [...deliveredPaths()].sort();
  const documented = new Set(C.fields.map((f) => f.path));
  assert.ok(delivered.length >= 20, `trip-wire: ${delivered.length} delivered field paths`);
  assert.ok(delivered.includes('agents.nodes[].agent_count'), 'the collapsed node was really walked');
  assert.deepEqual(delivered.filter((p) => !documented.has(p)), [], 'delivered but not documented');
});

test('field names: no documented field the reader does not deliver', () => {
  const delivered = deliveredPaths();
  const documented = C.fields.map((f) => f.path);
  assert.ok(documented.length >= 20, `trip-wire: ${documented.length} documented fields`);
  assert.deepEqual(documented.filter((p) => !delivered.has(p)), [], 'documented but never delivered');
});

test('three-part rule: the later field additions stand in contract.json AND in CONTRACT.md', () => {
  const names = [...LATER_ADDITIONS, 'git_branch'];
  assert.ok(names.length >= 4, `trip-wire: ${names.length} names checked`);
  for (const n of names) {
    const hits = C.fields.filter((f) => f.path === n || f.path.endsWith(`.${n}`) || f.path.endsWith(`.${n}[]`));
    assert.ok(hits.length >= 1, `${n} is documented in contract.json`);
    for (const f of hits) assert.ok(DOC.includes(`\`${f.path}\``), `${f.path} is listed in CONTRACT.md`);
  }
});

test('every documented field has meaning, unit and source, and is listed in CONTRACT.md', () => {
  const seen = new Set();
  for (const f of C.fields) {
    assert.equal(seen.has(f.path), false, `${f.path} documented once`);
    seen.add(f.path);
    assert.ok(f.meaning && f.unit, `${f.path} has meaning and unit`);
    assert.ok(['exact', 'estimated'].includes(f.source), `${f.path} source is exact or estimated`);
    assert.ok(DOC.includes(`| \`${f.path}\` |`), `${f.path} has a row in CONTRACT.md`);
  }
  assert.equal(seen.size, C.fields.length);
});

test('the value list: 25 values, every field exists, every home is known', () => {
  const paths = new Set(C.fields.map((f) => f.path));
  const homes = new Set([...C.contentBlocks, ...C.homes]);
  assert.equal(C.values.length, 25);
  assert.equal(new Set(C.values.map((v) => v.n)).size, 25, 'numbers unique');
  for (const v of C.values) {
    for (const p of v.fields) assert.ok(paths.has(p), `#${v.n} names documented field ${p}`);
    assert.ok(v.fields.length || v.note, `#${v.n} has fields or says why not`);
    assert.ok(v.home.length && v.home.every((h) => homes.has(h)), `#${v.n} home ${v.home}`);
  }
});

// The four first styles (the 50 first tiles) and the release styles (19 more styles, 4 more blocks, 96 more tiles).
const FIRST_STYLES = C.styles.slice(0, 4);
const RELEASE_STYLES = C.styles.slice(4);
const CLASSIC = C.contentBlocks.filter((b) => C.sizes[b].standard);   // the blocks of the four first styles

test('50 tiles: one size per content block x style x orientation; a style leaves a block to its twin where it draws the same (null)', () => {
  assert.equal(CLASSIC.length, 7);
  assert.deepEqual(FIRST_STYLES, ['standard', 'minimal', 'fancy-a', 'fancy-b']);
  assert.deepEqual(C.orientations, ['portrait', 'landscape']);
  let n = 0;
  const twins = [];
  for (const b of CLASSIC) {
    for (const s of FIRST_STYLES) {
      if (C.sizes[b][s] === null) {
        // a null entry: the block ships no tile of that style, its layouts use the twin style's tile
        assert.ok(s === 'fancy-a' || s === 'fancy-b', `${b} ${s}: only fancy-a/fancy-b leave a block to their twin`);
        assert.ok(C.sizes[b][s === 'fancy-a' ? 'fancy-b' : 'fancy-a'], `${b}: the twin of ${s} exists`);
        twins.push(`${b}:${s}`);
        continue;
      }
      for (const o of C.orientations) {
        const z = C.sizes[b][s][o];
        assert.ok(Number.isInteger(z.cols) && z.cols > 0 && Number.isInteger(z.rows) && z.rows > 0, `${b} ${s} ${o}`);
        if (o === 'portrait') assert.equal(z.cols, C.grid.portraitColumns, `${b} ${s} portrait fills the width`);
        n++;
      }
    }
  }
  assert.deepEqual(twins, ['header:fancy-b', 'tokens:fancy-b', 'skills:fancy-a'], 'fancy-b header and tokens drew the same as fancy-a (measured 02.10); skills fancy-a left');
  assert.equal(n, 50);
  assert.ok(n >= 48, `trip-wire: ${n} sizes counted`);
});

test('146 tiles: 11 blocks, 23 styles, 96 release tiles; every tile file on disk is one size entry, one block x style x orientation, no two alike', async () => {
  assert.equal(C.contentBlocks.length, 11);
  assert.equal(C.styles.length, 23);
  assert.equal(RELEASE_STYLES.length, 19);
  // contract side: every non-null size entry as a block/style/orientation triple (the table is sparse: a missing entry = no such tile)
  const want = new Set();
  let release = 0;
  for (const b of C.contentBlocks) {
    for (const s of C.styles) {
      const e = C.sizes[b][s];
      if (e === undefined || e === null) { if (e === null) assert.ok(FIRST_STYLES.includes(s), `${b} ${s}: null (twin) only in the first four styles`); continue; }   // undefined = no tile of that block x style
      for (const o of C.orientations) {
        const z = e[o];
        assert.ok(Number.isInteger(z.cols) && z.cols > 0 && Number.isInteger(z.rows) && z.rows > 0, `${b} ${s} ${o}`);
        // the grid is 8 wide; a release portrait tile may be narrower (subagents x ledger is 6), never wider
        if (o === 'portrait') assert.ok(FIRST_STYLES.includes(s) ? z.cols === C.grid.portraitColumns : z.cols <= C.grid.portraitColumns, `${b} ${s} portrait width`);
        want.add(`${b}/${s}/${o}`);
        if (RELEASE_STYLES.includes(s)) release++;
      }
    }
  }
  assert.equal(release, 96);
  assert.equal(want.size, 146);
  // disk side: every shipped tile file (not the examples, the tests or the cli) names its triple in its meta
  const files = readdirSync(HERE).filter((f) => /[.]js$/.test(f) && !/[.]test[.]js$/.test(f) && f !== 'cli.js' && !f.startsWith('example-'));
  const got = new Map();
  for (const f of files) {
    const m = (await import(`./${f}`)).meta;
    const key = `${m.contentBlock}/${m.style}/${m.orientation}`;
    assert.equal(got.has(key), false, `${f}: ${key} is shipped once (also ${got.get(key)})`);
    got.set(key, f);
    assert.equal(m.name, f.replace(/[.]js$/, ''), `${f}: meta.name = file name`);
    assert.equal(m.sizes.length, 1, `${f}: exactly one size`);
    assert.deepEqual(checkMeta(m), [], f);
  }
  assert.deepEqual([...got.keys()].sort(), [...want].sort(), 'the tile files on disk are exactly the non-null size entries');
  assert.equal(files.length, 146);
  // the twins of the first grid stay gone
  for (const t of ['header/fancy-b', 'tokens/fancy-b', 'skills/fancy-a']) for (const o of C.orientations) assert.ok(!got.has(`${t}/${o}`), `${t}/${o} is gone`);
});

test('the sizes add up to the shipped layouts (transcription check)', () => {
  for (const s of FIRST_STYLES) {   // the layouts are transcribed from the four first styles; the release styles carry none
    const z = (b, o) => (C.sizes[b][s === 'standard' && b === 'context' ? 'backlight' : s] || C.sizes[b][s === 'fancy-a' ? 'fancy-b' : 'fancy-a'])[o];   // null: the layout uses the twin style's tile
    const rows = CLASSIC.reduce((sum, b) => sum + z(b, 'portrait').rows, 0);
    assert.deepEqual(C.layouts[s].portrait, { cols: 8, rows }, `${s} portrait`);
    // Landscape: header over time in the first column, the other five side by side.
    const first = Math.max(z('header', 'landscape').cols, z('time', 'landscape').cols);
    const rest = CLASSIC.filter((b) => b !== 'header' && b !== 'time');
    const cols = first + rest.reduce((sum, b) => sum + z(b, 'landscape').cols, 0);
    const band = Math.max(z('header', 'landscape').rows + z('time', 'landscape').rows, ...rest.map((b) => z(b, 'landscape').rows));
    assert.deepEqual(C.layouts[s].landscape, { cols, rows: band }, `${s} landscape`);
  }
});


test('design variables: named, documented, a value for dark and for light', () => {
  assert.ok(C.designVariables.length >= 10, `trip-wire: ${C.designVariables.length} variables`);
  for (const d of C.designVariables) {
    assert.match(d.name, /^--aihud-[a-z0-9-]+$/);
    assert.ok(d.meaning && d.dark && d.light, d.name);
    assert.ok(DOC.includes(`\`${d.name}\``), `${d.name} in CONTRACT.md`);
  }
});

const GAP_PAIRS = ['live:tokens', 'live:window', 'turn:tokens', 'context:points', 'session:model', 'agents:subagents', 'turn:skills'];

test('catalog gap: every gap value (a pair or a list of pairs) is one of the seven pairs, every pair covers a row, the doc names the pairs and the absent variable', () => {
  const gaps = C.fields.filter((f) => 'gap' in f);
  assert.ok(gaps.length >= 29, `trip-wire: ${gaps.length} rows with a gap`);
  const listed = (f) => (Array.isArray(f.gap) ? f.gap : [f.gap]);
  for (const f of gaps) for (const g of listed(f)) assert.ok(GAP_PAIRS.includes(g), `${f.path}: gap ${g}`);
  for (const p of GAP_PAIRS) {
    assert.ok(gaps.some((f) => listed(f).includes(p)), `pair ${p} covers at least one row`);
    assert.ok(DOC.includes(`| \`${p}\` |`), `${p} in the CONTRACT.md table`);
  }
  const absent = C.designVariables.find((d) => d.name === '--aihud-absent');
  assert.ok(absent && /^#[0-9a-f]{6}$/.test(absent.dark) && /^#[0-9a-f]{6}$/.test(absent.light));
});

test('two version numbers, kept apart; the measured Claude Code version matches the README', () => {
  assert.equal(C.contractVersion, '1.1');
  assert.match(C.readerVersion, /^\d+\.\d+$/);
  assert.equal(C.readerVersion, sheetOf(A).version, 'readerVersion == data.version of the reader');
  const readme = readFileSync(join(HERE, '..', 'README.md'), 'utf8');
  const measured = readme.match(/measured against \*\*(Claude Code [\d.]+)\*\*/);
  assert.ok(measured, 'README names the measured Claude Code version');
  assert.equal(C.readerMeasuredAgainst, measured[1]);
  assert.equal(meta.contractVersion, C.contractVersion, 'the example tile names its contract version');
});

/** The metadata check a shipped tile has to pass. Returns the list of problems. */
function checkMeta(m) {
  const errors = [];
  for (const k of C.meta.keys) if (!(k in m)) errors.push(`missing ${k}`);
  if (!C.contentBlocks.includes(m.contentBlock)) errors.push(`contentBlock ${m.contentBlock}`);
  if (!C.styles.includes(m.style)) errors.push(`style ${m.style}`);
  if (!C.orientations.includes(m.orientation)) errors.push(`orientation ${m.orientation}`);
  if (!Array.isArray(m.sizes) || m.sizes.length !== 1) errors.push('shipped tiles have exactly one size');
  else {
    const want = C.sizes[m.contentBlock]?.[m.style]?.[m.orientation];
    if (!want || m.sizes[0].cols !== want.cols || m.sizes[0].rows !== want.rows) errors.push('size is not the table size');
  }
  if (m.contractVersion !== C.contractVersion) errors.push(`contractVersion ${m.contractVersion}`);
  return errors;
}

test('the example tile carries valid metadata; the check bites on a broken one', () => {
  assert.deepEqual(checkMeta(meta), []);
  assert.deepEqual(checkMeta(twinMeta), [], 'the landscape twin carries valid metadata too');
  const broken = { ...meta, style: 'fancy-c', sizes: [{ cols: 8, rows: 6 }, { cols: 8, rows: 7 }], contractVersion: '0.9' };
  assert.deepEqual(checkMeta(broken), ['style fancy-c', 'shipped tiles have exactly one size', 'contractVersion 0.9']);
  const { name, ...nameless } = meta;
  assert.ok(name);
  assert.deepEqual(checkMeta(nameless), ['missing name']);
});

// A minimal element: enough of the DOM for a tile that only builds divs and sets text.
function fakeElement() {
  const make = (tag) => ({
    tag, style: { cssText: '' }, textContent: '', children: [],
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; },
    setAttribute(k, v) { (this.attrs ||= {})[k] = v; },
  });
  const el = make('div');
  el.ownerDocument = { createElement: make };
  return el;
}
const texts = (n) => [n.textContent, ...n.children.flatMap(texts)].filter(Boolean);

test('the example tile draws the reader data and an empty state, sized from size', () => {
  const el = fakeElement();
  render(el, sheetOf(B), { cols: 8, rows: 6, unit: 20 });
  assert.deepEqual(texts(el), ['context', '17.0 %', 'of 1000k'], 'fixture B: 17 % of a 1M window');
  assert.match(el.children[0].style.cssText, /width:160px;height:120px/);
  assert.equal(el.children[0].children[1].attrs['data-field'], 'live.instances[].context_percent', 'the number carries its value mark');
  render(el, { version: '1.0', not_delivered: ['live:device_comes_from_host'] }, { cols: 8, rows: 6, unit: 22.5 });
  assert.deepEqual(texts(el), ['context', '–'], 'no live: a dash, no invented number');
  assert.equal(el.children.length, 1, 'redrawn completely, not appended');
  assert.match(el.children[0].style.cssText, /width:180px;height:135px/);
});

// AIHUD_HOME would override the injected home — these tests pin the default, so it is cleared here
function capture(args, home) {
  let out = '';
  const before = process.env.AIHUD_HOME;
  delete process.env.AIHUD_HOME;
  try {
    const code = main(args, { home, write: (s) => { out += s; } });
    return { code, out };
  } finally {
    if (before != null) process.env.AIHUD_HOME = before;
  }
}

test('new-tile prints instructions, contract and value list', () => {
  const { code, out } = capture(['new-tile'], join(tmpdir(), 'x'));
  assert.equal(code, 0);
  for (const marker of ['=== INSTRUCTIONS ===', '=== TILE CONTRACT ===', '=== VALUE LIST ===']) assert.ok(out.includes(marker), marker);
  assert.ok(out.includes('# The tile contract'), 'the contract text itself');
  assert.ok(out.includes('# /new-tile'), 'the skill text itself');
  assert.equal(out.includes('name: new-tile'), false, 'without the skill frontmatter');
  for (const v of C.values) assert.ok(out.includes(`#${v.n} ${v.name}`), `value #${v.n}`);
  assert.ok(out.includes(join('x', '.aihud', 'tiles')), 'names the user tile folder');
  assert.equal(capture(['new-tile', '--nope'], 'x').code, 2, 'unknown argument');
});

test('install-skill copies the skill, refuses to overwrite without --force, keeps user files', () => {
  const home = mkdtempSync(join(tmpdir(), 'aihud-skill-'));
  try {
    const target = join(home, '.claude', 'skills', 'new-tile');
    const source = readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8');
    const first = capture(['install-skill'], home);
    assert.equal(first.code, 0, first.out);
    assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), source);
    assert.ok(first.out.includes(`copied ${join(target, 'SKILL.md')}`), 'says what it did');

    writeFileSync(join(target, 'SKILL.md'), 'edited by the user');
    writeFileSync(join(target, 'notes.md'), 'own file');
    const second = capture(['install-skill'], home);
    assert.equal(second.code, 1);
    assert.ok(second.out.includes('--force'));
    assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), 'edited by the user', 'untouched without --force');

    const third = capture(['install-skill', '--force'], home);
    assert.equal(third.code, 0);
    assert.equal(readFileSync(join(target, 'SKILL.md'), 'utf8'), source, 'overwritten with --force');
    assert.equal(readFileSync(join(target, 'notes.md'), 'utf8'), 'own file', 'a user file stays');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('bin/aihud.js routes both commands to the tile commands (end to end)', () => {
  const home = mkdtempSync(join(tmpdir(), 'aihud-bin-'));
  try {
    const env = { ...process.env, HOME: home, USERPROFILE: home };
    const nt = spawnSync(process.execPath, [BIN, 'new-tile'], { env, encoding: 'utf8' });
    assert.equal(nt.status, 0, nt.stderr);
    assert.ok(nt.stdout.includes('=== VALUE LIST ==='));
    const is = spawnSync(process.execPath, [BIN, 'install-skill'], { env, encoding: 'utf8' });
    assert.equal(is.status, 0, is.stderr);
    assert.ok(existsSync(join(home, '.claude', 'skills', 'new-tile', 'SKILL.md')), 'installed into the given home');
    const plain = spawnSync(process.execPath, [BIN, 'help'], { env, encoding: 'utf8' });
    assert.match(plain.stdout, /early work[\s\S]*aihud serve/, 'help routes to the node commands (bare aihud starts the node now)');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ── the heat scale (decision of 30.09.2026: exactly the accepted sketch's gauge scale) ──
const HEAT_NAMES = ['--aihud-heat-rest', '--aihud-glow', '--aihud-glow-core', '--aihud-glow-mid', '--aihud-glow-halo',
  '--aihud-role-1', '--aihud-role-2', '--aihud-role-3', '--aihud-absent',
  ...[0, 30, 50, 75, 100].flatMap((p) => [`--aihud-heat-${p}`, `--aihud-heat-text-${p}`])];

test('heat: the contract carries the scale, the glow and the role shades, each with dark and light', () => {
  const vars = new Map(C.designVariables.map((d) => [d.name, d]));
  for (const n of HEAT_NAMES) {
    const d = vars.get(n);
    assert.ok(d, `${n} is a design variable`);
    assert.ok(d.dark && d.light, `${n}: dark and light`);
    assert.ok(DOC.includes(`| \`${n}\` |`), `${n} in the CONTRACT.md table`);
  }
  assert.deepEqual(C.heat.stops, [0, 30, 50, 75, 100]);
  assert.deepEqual(C.heat.fill, C.heat.stops.map((p) => `--aihud-heat-${p}`));
  assert.deepEqual(C.heat.text, C.heat.stops.map((p) => `--aihud-heat-text-${p}`));
  for (const n of [...C.heat.fill, ...C.heat.text]) for (const t of ['dark', 'light']) assert.match(vars.get(n)[t], /^#[0-9a-f]{6}$/, `${n} ${t}`);
  assert.match(C.heat.function, /color-mix\(in srgb/);
  assert.ok(DOC.includes('**The heat function**') && DOC.includes('color-mix(in srgb, var(--aihud-heat-<a>) p%, var(--aihud-heat-<b>))'), 'CONTRACT.md states THE heat function');
});

test('heat: hud.css defines every heat, glow and role variable in dark and in light, with the contract value', () => {
  const css = readFileSync(join(HERE, '..', 'hud', 'hud.css'), 'utf8');
  const block = (sel) => { const i = css.indexOf(sel); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf('}', i)); };
  const themes = { dark: block(':root, :root[data-theme="dark"] {'), light: block(':root[data-theme="light"] {') };
  const vars = new Map(C.designVariables.map((d) => [d.name, d]));
  let defined = 0;
  for (const n of HEAT_NAMES) {
    for (const [t, body] of Object.entries(themes)) {
      const m = body.match(new RegExp(`${n}:\\s*([^;]+);`));
      assert.ok(m, `hud.css ${t} defines ${n}`);
      assert.equal(m[1].trim(), vars.get(n)[t], `hud.css ${t} ${n}`);
      defined++;
    }
  }
  assert.equal(defined, HEAT_NAMES.length * 2, `trip-wire: ${defined} definitions`);
});

test('heat: every tile that was drawn neutral for want of the scale now draws with it', () => {
  const RETOUCHED = [
    'context-standard', 'top-three-subagents-standard', 'context-minimal', 'top-three-subagents-minimal',
    'context-fancy-a', 'top-three-subagents-fancy-a', 'subagents-fancy-a', 'context-fancy-b', 'top-three-subagents-fancy-b',
  ].flatMap((n) => [`${n}-portrait`, `${n}-landscape`]);
  let using = 0;
  for (const name of RETOUCHED) {
    const src = readFileSync(join(HERE, `${name}.js`), 'utf8');
    assert.match(src, /var\(--aihud-(heat|glow|role)-?[a-z0-9-]*\)/, `${name} uses a heat, glow or role variable`);
    using++;
  }
  assert.ok(using >= 18, `trip-wire: ${using} tiles`);
});

test('style families: every style sits in exactly one family, every family style exists, the file name rule holds', async () => {
  assert.ok(C.families && typeof C.families === 'object' && !Array.isArray(C.families));
  const seen = new Map();
  for (const [fam, list] of Object.entries(C.families)) {
    assert.ok(Array.isArray(list) && list.length > 0, `family ${fam} is a non-empty list`);
    for (const s of list) {
      assert.ok(C.styles.includes(s), `family ${fam}: style ${s} exists in contract styles`);
      assert.ok(!seen.has(s), `style ${s} is in two families (${seen.get(s)} and ${fam})`);
      seen.set(s, fam);
    }
  }
  for (const s of C.styles) assert.ok(seen.has(s), `style ${s} belongs to a family`);
  assert.deepEqual(Object.keys(C.families), ['quiet', 'instrument', 'drafting', 'material', 'classic']);
  assert.ok(DOC.includes('Style families'), 'CONTRACT.md mirrors the families');
  for (const [fam, list] of Object.entries(C.families)) for (const s of list) assert.ok(DOC.includes(`\`${s}\``), `${s} in CONTRACT.md`);
  for (const f of readdirSync(HERE).filter((n) => /-(portrait|landscape)\.js$/.test(n) && !n.startsWith('example-'))) {
    const m = (await import(pathToFileURL(join(HERE, f)).href)).meta;
    assert.equal(m.name, f.replace(/\.js$/, ''), `${f}: meta.name is the file name`);
    assert.ok(f.startsWith(`${m.contentBlock}-${m.style}-${m.orientation}.js`), `${f}: <block>-<style>-<orientation>`);
  }
});

// A DOM stub for the cellwork tiles: their cells build child elements through ownerDocument.
function cellDoc() {
  const doc = { createElement: (tag) => mk(tag) };
  const mk = (tag) => ({
    tag, ownerDocument: doc, style: { cssText: '' }, dataset: {}, textContent: '', children: [],
    appendChild(c) { this.children.push(c); return c; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; },
    setAttribute(k, v) { (this.attrs ||= {})[k] = v; },
  });
  return mk('div');
}

test('cellwork skills: the empty-state text stays inside the frame — every word whole, the right frame cell of every row untouched', async () => {
  const data = { turn: { turns: [{ number: 1, started_at: '2026-09-10T09:00:00.000Z', duration_s: 10 }] } };   // turns delivered, no skill
  for (const o of ['landscape', 'portrait']) {
    const m = await import(pathToFileURL(join(HERE, `skills-cellwork-${o}.js`)).href);
    const [size] = m.meta.sizes, c = size.cols * 2;
    const el = cellDoc();
    m.render(el, data, { ...size, unit: 20 });
    const cells = el.children[0].children;
    assert.equal(cells.length, c * size.rows, `${o}: one div per cell`);
    const rowText = (y) => cells.slice(y * c, (y + 1) * c).map((d) => d.textContent || ' ').join('');
    const words = [];
    for (let y = 1; y < size.rows - 1; y++) {
      const right = cells[y * c + c - 1];
      assert.equal(right.textContent, '', `${o} row ${y}: the right frame cell carries no text`);
      assert.ok(right.children.length > 0, `${o} row ${y}: the right frame cell is still drawn as a frame`);
      words.push(...rowText(y).split(/\s+/).filter((w) => /[a-z]/.test(w)));
    }
    assert.deepEqual(words, ['no', 'skill', 'calls', 'this', 'session'], `${o}: every word of "no skill calls this session" whole, in order`);
  }
});

test('hint: the optional short text of a catalog row is one plain phrase of at most 60 characters', () => {
  const hinted = C.fields;
  for (const f of hinted) {
    assert.ok(typeof f.hint === 'string' && f.hint.trim() !== '', `${f.path} carries a non-empty hint`);
    assert.equal(typeof f.hint, 'string', `${f.path} hint is a string`);
    assert.ok(f.hint.trim() === f.hint && f.hint.length >= 3 && f.hint.length <= 60, `${f.path} hint is 3-60 characters: "${f.hint}"`);
    assert.ok(!/[`<>\/]|\bGET\b|\brule\b/i.test(f.hint), `${f.path} hint names no rule, route or markup: "${f.hint}"`);
  }
  for (const p of ['live.instances[].context_percent', 'turn.turns[].duration_s', 'agents.subagents_started']) {
    assert.ok(C.fields.find((f) => f.path === p).hint, `${p} has a hint`);
  }
  assert.ok(DOC.includes('`hint`'), 'CONTRACT.md documents the hint key');
});

test('data-field guard: every mark in a tile source names catalog paths only, at most 3 per mark', () => {
  const known = new Set(C.fields.map((f) => f.path));
  const tops = new Set(C.fields.map((f) => f.path.split(/[.\[]/)[0]));
  const isMark = (s) => s.split(' ').every((p) => tops.has(p.split(/[.\[]/)[0]) && /^[\w.\[\]]+$/.test(p));
  const sources = readdirSync(HERE).filter((n) => n.endsWith('.js') && !n.endsWith('.test.js') && n !== 'cli.js')
    .map((n) => [n, readFileSync(join(HERE, n), 'utf8')]);
  const marks = [];   // [file, "path path"]
  for (const [n, src] of sources) {
    for (const m of src.matchAll(/data-field="([\w.\[\] ]+)"/g)) marks.push([n, m[1]]);   // dynamic values (${…}, + …) have other characters and are skipped
    for (const m of src.matchAll(/(['"`])([\w.\[\] ]+)\1/g)) if (isMark(m[2])) marks.push([n, m[2]]);
  }
  const unknown = [], tooMany = [];
  let total = 0;
  for (const [n, mark] of marks) {
    const paths = mark.split(' ');
    if (paths.length > 3) tooMany.push(`${n}: ${mark}`);
    for (const p of paths) { total++; if (!known.has(p)) unknown.push(`${n}: ${p}`); }
  }
  assert.ok(total > 300, `trip-wire: the scan found ${total} path strings`);
  assert.deepEqual(unknown, [], 'paths outside the catalog');
  assert.deepEqual(tooMany, [], 'marks with more than 3 paths');
});

// `aihud layout show <slug>`: temp homes only, never ~/.aihud. Read-only: the home listing must not change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from './cli.js';

const TILE = 'export const meta = { orientation: "portrait", size: { cols: 8, rows: 3 } };\nexport function render() { return ""; }\n';

/** A temp home with layout `mine` (shipped tile + own tile `my-own` + missing `ghost-tile`) and an own tile file. */
function home(settings) {
  const base = mkdtempSync(join(tmpdir(), 'aihud-layoutshow-'));
  const h = join(base, 'home');
  mkdirSync(join(h, 'layouts'), { recursive: true });
  mkdirSync(join(h, 'tiles'));
  writeFileSync(join(h, 'tiles', 'my-own.js'), TILE);
  const layout = { name: 'mine', orientation: 'portrait', tiles: [
    { tile: 'header-standard-portrait', col: 0, row: 0 }, { tile: 'my-own', col: 0, row: 2 }, { tile: 'ghost-tile', col: 0, row: 5 },
  ] };
  writeFileSync(join(h, 'layouts', 'mine.json'), JSON.stringify(layout));
  writeFileSync(join(h, 'layouts', 'other.json'), JSON.stringify({ name: 'other', orientation: 'portrait', tiles: [] }));
  if (settings) writeFileSync(join(h, 'settings.json'), JSON.stringify(settings));
  return { h, done: () => rmSync(base, { recursive: true, force: true }) };
}
async function run(args) {
  const out = []; const err = [];
  const code = await main(['layout', ...args], { log: (s) => out.push(String(s)), err: (s) => err.push(String(s)) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}
const listing = (dir) => readdirSync(dir, { recursive: true }).sort().join('|');
/** Names + content hash + mtime for every file: a rewrite of an existing file shows up too. */
const snapshot = (dir) => readdirSync(dir, { recursive: true }).sort().map((f) => {
  const p = join(dir, f); const st = statSync(p);
  return st.isDirectory() ? `${f}/` : `${f}:${createHash('sha256').update(readFileSync(p)).digest('hex')}:${st.mtimeMs}`;
}).join('|');

test('names the file, the active state, the own tile present and the tile missing here', async () => {
  const s = home({ layout_portrait: 'mine' });
  try {
    const r = await run(['show', 'mine', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.ok(r.out.includes(join(s.h, 'layouts', 'mine.json')), r.out);
    assert.match(r.out, /active:\s+yes/);
    assert.match(r.out, /own tiles[^\n]*\n\s+my-own\b/);
    assert.ok(r.out.includes(join(s.h, 'tiles', 'my-own.js')), r.out);
    assert.match(r.out, /missing here[^\n]*\n\s+ghost-tile\b/);
    assert.doesNotMatch(r.out, /header-standard-portrait/, 'a shipped tile travels with the package');
  } finally { s.done(); }
});

test('not the active layout: active: no', async () => {
  const s = home({ layout_portrait: 'other' });
  try {
    const r = await run(['show', 'mine', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /active:\s+no/);
  } finally { s.done(); }
});

test('unknown slug: non-zero exit, message and the existing slugs', async () => {
  const s = home();
  try {
    const r = await run(['show', 'nope', '--home', s.h]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /nope/);
    assert.match(r.err, /mine/);
    assert.match(r.err, /other/);
  } finally { s.done(); }
});

test('missing slug: usage line, non-zero exit', async () => {
  const s = home();
  try {
    const r = await run(['show', '--home', s.h]);
    assert.notEqual(r.code, 0);
    assert.match(r.err, /usage: aihud layout show <slug>/);
  } finally { s.done(); }
});

test('writes nothing: names, content hashes and mtimes are identical before and after', async () => {
  const s = home({ layout_portrait: 'mine' });
  try {
    const before = snapshot(s.h);
    assert.match(before, /settings\.json:/, 'trip-wire: the snapshot covers the existing settings file');
    await run(['show', 'mine', '--home', s.h]);
    await run(['show', 'nope', '--home', s.h]);
    await run(['show', 'standard-portrait', '--home', s.h]);
    assert.equal(snapshot(s.h), before);
  } finally { s.done(); }
});

test('writes nothing: a home without settings.json stays without it', async () => {
  const s = home();
  try {
    assert.equal(existsSync(join(s.h, 'settings.json')), false);
    const before = snapshot(s.h);
    const r = await run(['show', 'mine', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    await run(['show', 'nope', '--home', s.h]);
    assert.equal(existsSync(join(s.h, 'settings.json')), false);
    assert.equal(snapshot(s.h), before);
  } finally { s.done(); }
});

test('active: a portrait layout named only by layout_landscape is active, with that key', async () => {
  const s = home({ layout_landscape: 'mine' });
  try {
    const r = await run(['show', 'mine', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /active:\s+yes \(layout_landscape in /);
    assert.doesNotMatch(r.out, /layout_portrait/);
  } finally { s.done(); }
});

test('active: a layout without orientation named by a key is active', async () => {
  const s = home({ layout_portrait: 'free' });
  try {
    writeFileSync(join(s.h, 'layouts', 'free.json'), JSON.stringify({ name: 'free', tiles: [] }));
    const r = await run(['show', 'free', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /active:\s+yes \(layout_portrait in /);
  } finally { s.done(); }
});

test('active: named by neither key prints a plain no', async () => {
  const s = home({ layout_portrait: 'other', layout_landscape: 'other' });
  try {
    const r = await run(['show', 'mine', '--home', s.h]);
    assert.match(r.out, /active:\s+no\n/);
  } finally { s.done(); }
});

test('an own tile that does not load is flagged, and the missing heading is truthful', async () => {
  const s = home({ layout_portrait: 'mine' });
  try {
    writeFileSync(join(s.h, 'tiles', 'my-own.js'), 'export const meta = ;;; broken\n');
    const r = await run(['show', 'mine', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /my-own\.js \(does not load\)/);
    assert.match(r.out, /missing here \(no loadable tile of that name\):/);
    assert.doesNotMatch(r.out, /neither shipped/);
  } finally { s.done(); }
});

test('a shipped layout slug: says it travels with the package, exit 0', async () => {
  const s = home();
  try {
    const r = await run(['show', 'standard-portrait', '--home', s.h]);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /"standard-portrait" is a shipped layout - it travels with the package, nothing to copy/);
    assert.doesNotMatch(r.err, /no layout/);
  } finally { s.done(); }
});

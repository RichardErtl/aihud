// `aihud check`: a clean home, and a broken one (broken tile, the overlap case (8x3 at row 0 + a tile at row 2), a missing layout in the
// settings). Fixtures live in temp folders created here, never in ~/.aihud.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './cli.js';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aihud.js');

const tileSrc = (name, cols, rows) => `export const meta = { name: '${name}', contentBlock: 'context', style: 'standard', orientation: 'portrait', sizes: [{ cols: ${cols}, rows: ${rows} }], contractVersion: '1.0' };\nexport function render() {}\n`;

function home({ broken }) {
  const h = mkdtempSync(join(tmpdir(), 'aihud-check-'));
  mkdirSync(join(h, 'tiles')); mkdirSync(join(h, 'layouts'));
  writeFileSync(join(h, 'tiles', 'wide-own.js'), tileSrc('wide-own', 8, 3));
  writeFileSync(join(h, 'tiles', 'small-own.js'), tileSrc('small-own', 8, 2));
  const layout = (second) => JSON.stringify({ name: 'mine', orientation: 'portrait', tiles: [
    { tile: 'wide-own', col: 0, row: 0 }, { tile: 'small-own', col: 0, row: second }] });
  writeFileSync(join(h, 'layouts', 'mine.json'), layout(broken ? 2 : 3));
  if (broken) {
    writeFileSync(join(h, 'tiles', 'broken-own.js'), 'export const meta = {;\n');
    writeFileSync(join(h, 'settings.json'), JSON.stringify({ layout_portrait: 'no-such-layout' }));
  }
  return { h, done: () => rmSync(h, { recursive: true, force: true }) };
}

async function run(h) {
  const out = [];
  const code = await main(['check', '--home', h], { log: (s) => out.push(String(s)), err: (s) => out.push(String(s)) });
  return { code, out };
}

test('check: a clean home prints ok and exits 0', async () => {
  const f = home({ broken: false });
  try {
    const r = await run(f.h);
    assert.deepEqual(r.out, ['ok']);
    assert.equal(r.code, 0);
  } finally { f.done(); }
});

test('check: broken tile, overlap (8x3 at row 0 + tile at row 2) and a missing settings layout', async () => {
  const f = home({ broken: true });
  try {
    const r = await run(f.h);
    assert.equal(r.code, 1);
    const text = r.out.join('\n');
    assert.match(text, /tiles[\\/]broken-own\.js: /);
    assert.match(text, /layouts[\\/]mine\.json: tiles\[1\]:overlaps_tiles\[0\]/);
    assert.match(text, /settings\.json: layout_portrait "no-such-layout" is not an existing layout/);
    assert.equal(r.out.at(-1), '3 problems');
  } finally { f.done(); }
});

test('check: the real binary exits 0 on clean, 1 on broken', () => {
  const clean = home({ broken: false });
  const bad = home({ broken: true });
  try {
    assert.equal(spawnSync(process.execPath, [BIN, 'check', '--home', clean.h], { encoding: 'utf8' }).status, 0);
    const r = spawnSync(process.execPath, [BIN, 'check', '--home', bad.h], { encoding: 'utf8' });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /3 problems/);
  } finally { clean.done(); bad.done(); }
});

test('check: a portrait setting naming a landscape layout is a finding', async () => {
  const h = mkdtempSync(join(tmpdir(), 'aihud-check-'));
  try {
    writeFileSync(join(h, 'settings.json'), JSON.stringify({ layout_portrait: 'standard-landscape' }));
    const r = await run(h);
    assert.equal(r.code, 1);
    assert.match(r.out.join('\n'), /layout_portrait.*not_a_portrait_layout/);
  } finally { rmSync(h, { recursive: true, force: true }); }
});

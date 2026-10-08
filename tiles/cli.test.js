// new-tile / install-skill honor the aihud home like `aihud serve`: --home <dir> -> AIHUD_HOME -> ~/.aihud
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, SKILL_SOURCE } from './cli.js';

const run = (args, opts = {}) => {
  let out = '';
  const code = main(args, { write: (s) => { out += s; }, ...opts });
  return { code, out };
};
const withEnv = (value, fn) => {
  const before = process.env.AIHUD_HOME;
  try {
    if (value == null) delete process.env.AIHUD_HOME; else process.env.AIHUD_HOME = value;
    return fn();
  } finally {
    if (before == null) delete process.env.AIHUD_HOME; else process.env.AIHUD_HOME = before;
  }
};
// the embedded SKILL text only
const skillPart = (out) => out.slice(out.indexOf('=== INSTRUCTIONS ==='), out.indexOf('=== TILE CONTRACT ==='));
const fwd = (p) => p.replaceAll('\\', '/'); // the texts name the folder with forward slashes
const tmp = () => mkdtempSync(join(tmpdir(), 'aihud-cli-test-'));

test('new-tile --home X names X/tiles, also inside the skill text', () => {
  const x = tmp();
  try {
    const { code, out } = withEnv(null, () => run(['new-tile', '--home', x]));
    assert.equal(code, 0);
    assert.ok(out.includes(`Write your tile to: ${join(x, 'tiles')}`));
    assert.ok(skillPart(out).includes(`${fwd(join(x, 'tiles'))}/<name>.js`));
    assert.ok(!skillPart(out).includes('~/.aihud/tiles'));
    assert.ok(!out.includes('~/.aihud/'), 'the contract names the real tiles/layouts folders too');
    assert.ok(out.includes(fwd(join(x, 'layouts'))));
  } finally { rmSync(x, { recursive: true, force: true }); }
});

test('new-tile honors AIHUD_HOME without a flag', () => {
  const x = tmp();
  try {
    const { out } = withEnv(x, () => run(['new-tile']));
    assert.ok(out.includes(`Write your tile to: ${join(x, 'tiles')}`));
    assert.ok(!skillPart(out).includes('~/.aihud/tiles'));
  } finally { rmSync(x, { recursive: true, force: true }); }
});

test('new-tile default output is unchanged (~/.aihud/tiles kept in the skill text)', () => {
  const { code, out } = withEnv(null, () => run(['new-tile']));
  assert.equal(code, 0);
  assert.ok(out.includes(`Write your tile to: ${join(homedir(), '.aihud', 'tiles')}`));
  assert.ok(skillPart(out).includes('~/.aihud/tiles'));
  const lines = out.split('\n');
  assert.ok(lines[2].startsWith(`This output is long (${lines.length - 1} lines): do not cut it`) && lines[2].includes('CONTRACT.md'), 'F2: says its length, names the file');
  assert.ok(skillPart(out).includes('`npx aihud check`') && skillPart(out).includes('reload the HUD page'), 'F5: check step and the way to see the tile');
});

test('install-skill --home X writes a SKILL.md naming X/tiles; source untouched', () => {
  const x = tmp();
  const user = tmp();
  try {
    const { code, out } = withEnv(null, () => run(['install-skill', '--home', x], { home: user }));
    assert.equal(code, 0);
    const copied = readFileSync(join(user, '.claude', 'skills', 'new-tile', 'SKILL.md'), 'utf8');
    assert.ok(copied.includes(fwd(join(x, 'tiles'))));
    assert.ok(!copied.includes('~/.aihud/tiles'));
    assert.ok(out.includes(join(x, 'tiles')));
    assert.ok(readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8').includes('~/.aihud/tiles'));
  } finally {
    rmSync(x, { recursive: true, force: true });
    rmSync(user, { recursive: true, force: true });
  }
});

test('install-skill default copies SKILL.md verbatim', () => {
  const user = tmp();
  try {
    withEnv(null, () => run(['install-skill'], { home: user }));
    assert.equal(readFileSync(join(user, '.claude', 'skills', 'new-tile', 'SKILL.md'), 'utf8'),
      readFileSync(join(SKILL_SOURCE, 'SKILL.md'), 'utf8'));
  } finally { rmSync(user, { recursive: true, force: true }); }
});

test('unknown arguments exit 2', () => {
  assert.equal(run(['new-tile', '--bogus']).code, 2);
  assert.equal(run(['new-tile', '--force']).code, 2);
  assert.equal(run(['install-skill', '--home']).code, 2);
  assert.equal(run(['install-skill', '--home', '--force']).code, 2, '--force is no home');
  assert.equal(run(['new-tile', '--home', '']).code, 2, 'an empty home is no home');
  assert.match(run(['install-skill', '--help']).out, /always copies the skill to ~\/\.claude\/skills\/new-tile\/; --home only changes the tiles folder/, 'F7');
});

test('--help prints usage, exit 0', () => {
  for (const cmd of ['new-tile', 'install-skill']) {
    for (const flag of ['--help', '-h']) {
      const r = run([cmd, flag]);
      assert.equal(r.code, 0, `${cmd} ${flag}`);
      assert.ok(r.out.startsWith('usage: aihud new-tile'));
      assert.ok(!r.out.includes('unknown argument'));
    }
  }
});

test('a closed stdout pipe (| head) ends quietly: exit 0, no EPIPE', async () => {
  const bin = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'aihud.js');
  const child = spawn(process.execPath, [bin, 'new-tile'], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  child.stdout.once('data', () => child.stdout.destroy());
  const code = await new Promise((res) => child.on('close', res));
  assert.equal(code, 0);
  assert.ok(!err.includes('EPIPE'), err);
});

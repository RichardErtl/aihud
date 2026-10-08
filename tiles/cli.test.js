// new-tile / install-skill honor the aihud home like `aihud serve`: --home <dir> -> AIHUD_HOME -> ~/.aihud
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
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
});

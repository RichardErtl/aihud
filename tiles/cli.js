// The two tile commands of `npx aihud`:
//   new-tile       prints the instructions, the tile contract and the value list as text
//   install-skill  copies the /new-tile skill to ~/.claude/skills/new-tile/ (overwrite: --force)
// Local files only; nothing here opens a connection.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aihudHome } from '../node/store.js';

const HERE = dirname(fileURLToPath(import.meta.url));
export const SKILL_SOURCE = join(HERE, '..', '.claude', 'skills', 'new-tile');
const read = (p) => readFileSync(p, 'utf8');

/** --home option -> AIHUD_HOME -> `<user home>/.aihud` (the user home is injectable; with the real one this is `aihudHome()`). */
const resolveHome = (opt, home) => (opt || process.env.AIHUD_HOME ? aihudHome(opt) : join(home, '.aihud'));
/** Skill and contract name `~/.aihud/tiles` and `~/.aihud/layouts`; for a non-default aihud home they name the real folders. */
export function skillFor(text, aihud, home = homedir()) {
  if (aihud === join(home, '.aihud')) return text;
  return text.replace(/~\/\.aihud\/(tiles|layouts)/g, (_, dir) => join(aihud, dir).replaceAll('\\', '/'));
}

/** The value list: every numbered value with its fields, unit and source. */
export function valueList(contract) {
  const byPath = new Map(contract.fields.map((f) => [f.path, f]));
  const lines = [];
  for (const v of contract.values) {
    lines.push(`#${v.n} ${v.name}  (home: ${v.home.join(', ')})`);
    if (!v.fields.length) lines.push(`    ${v.note}`);
    for (const p of v.fields) {
      const f = byPath.get(p);
      lines.push(`    ${p} - ${f.meaning} [${f.unit}, ${f.source}]`);
    }
  }
  return lines.join('\n');
}

/** Everything `npx aihud new-tile` prints. */
export function newTileText({ home = homedir(), aihud = resolveHome(null, home) } = {}) {
  const contract = JSON.parse(read(join(HERE, 'contract.json')));
  const skill = skillFor(read(join(SKILL_SOURCE, 'SKILL.md')), aihud, home).replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  const head = [
    `aihud tile contract ${contract.contractVersion} - reader ${contract.readerVersion} (${contract.readerMeasuredAgainst})`,
    `Write your tile to: ${join(aihud, 'tiles')}`,
  ];
  const body = [
    '=== INSTRUCTIONS ===',
    skill.trim(),
    '',
    '=== TILE CONTRACT ===',
    skillFor(read(join(HERE, 'CONTRACT.md')), aihud, home).trim(),
    '',
    '=== VALUE LIST ===',
    valueList(contract),
    '',
  ].join('\n');
  const lines = head.length + 2 + body.split('\n').length - 1;   // as `wc -l` counts them
  return [...head,
    `This output is long (${lines} lines): do not cut it with head or tail. The full contract is also the file ${join(HERE, 'CONTRACT.md')} (value list: ${join(HERE, 'contract.json')}).`,
    '', body].join('\n');
}

/**
 * Copy the skill folder to `<home>/.claude/skills/new-tile/`.
 * An existing copy is overwritten only with `force`; files the user added there are kept.
 */
export function installSkill({ home = homedir(), aihud = resolveHome(null, home), force = false } = {}) {
  const target = join(home, '.claude', 'skills', 'new-tile');
  if (existsSync(target) && !force) return { target, copied: [], refused: true };
  mkdirSync(target, { recursive: true });
  const copied = [];
  for (const name of readdirSync(SKILL_SOURCE)) {
    if (name === 'SKILL.md') writeFileSync(join(target, name), skillFor(read(join(SKILL_SOURCE, name)), aihud, home));
    else copyFileSync(join(SKILL_SOURCE, name), join(target, name));
    copied.push(join(target, name));
  }
  return { target, copied, refused: false };
}

const USAGE = 'usage: aihud new-tile [--home <dir>] | aihud install-skill [--force] [--home <dir>]\n'
  + '  install-skill always copies the skill to ~/.claude/skills/new-tile/; --home only changes the tiles folder the skill names';

/** Entry from bin/aihud.js. Returns the exit code. */
export function main(args, { home = homedir(), write = (s) => process.stdout.write(s) } = {}) {
  const [command, ...rest] = args;
  let homeOpt = null;
  let force = false;
  const unknown = [];
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--home' && rest[i + 1] && !rest[i + 1].startsWith('--')) homeOpt = rest[++i];
    else if (rest[i] === '--force' && command === 'install-skill') force = true;
    else unknown.push(rest[i]);
  }
  const aihud = resolveHome(homeOpt, home);
  if (unknown.length) { write(`unknown argument: ${unknown.join(' ')}\n${USAGE}\n`); return 2; }
  if (command === 'new-tile') { write(newTileText({ home, aihud })); return 0; }
  if (command === 'install-skill') {
    const r = installSkill({ home, aihud, force });
    if (r.refused) {
      write(`${r.target} already exists - nothing copied. Run again with --force to overwrite it.\n`);
      return 1;
    }
    for (const f of r.copied) write(`copied ${f}\n`);
    write(`Installed the /new-tile skill to ${r.target}.\n`
      + 'Claude Code loads skills from ~/.claude/skills/, not from inside an npm package; start a new session to use it.\n'
      + (aihud === join(home, '.aihud') ? '' : `Tiles go to ${join(aihud, 'tiles')}.\n`));
    return 0;
  }
  write(`${USAGE}\n`);
  return 2;
}

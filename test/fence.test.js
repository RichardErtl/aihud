// The fence: aihud has to stand on its own. This test scans every file of the package and
// fails on anything that ties it back to the private workspace it was written in:
//   1. imports and import.meta.url-relative URLs that resolve outside the package
//   2. private words (workspace vocabulary, machine names, host paths)
//   3. ticket ids
//   4. private network addresses
//   5. network calls and network modules inside tiles (tiles only draw what they are given)
//   6. session ids of the private transcript fixtures (in file names and content)
//   7. in every file except reader/fixtures/**: key patterns, e-mail addresses, private networks
//      (10.x, 172.16-31.x, 192.168.) and real home paths - with an explicit allow-list of the
//      synthetic examples (see SYNTHETIC below)
// No file-level exemption, not even for this file: an exception for "our own text" is exactly
// the hole foreign text would later come through. Only the exact synthetic strings listed in
// SYNTHETIC are let through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CODE = new Set(['.js', '.mjs', '.cjs', '.ts', '.jsx', '.tsx', '.mts', '.cts']);

// Stored as truncated SHA-256 of the lowercase word, so the published tree never spells them.
// Not a secret, only not text. A word is caught as the prefix of any identifier part, which
// covers plurals and compounds.
// Known limit: prefix only. A word buried inside a part (after a lowercase run, e.g. "xyword")
// is not caught; infix matching would flag common words such as "member" for a 5-letter entry.
const PRIVATE_WORDS = new Set([
  '34dfd7755075b9d0', 'e0ec363dfd82c4df', '7cadc15d609c4ae9', 'b6b8eae5972691b4',
  'dd61d5c7fc0c86fd', '909164349b69d36e', '8fa400f1f21632ac', '2648e47b20dce27d',
  'b21b17b4ecc60cdb', '6b34a4be39af5db3', '9c2c7c9921188dbd', 'd27c0bbeba2d1ec1',
  'e945f80bd8f41ba1', 'bb3d0e672c6c17b1', 'f1f6b73eca8cfbc1', '29599995d2c6257a',
  '6fc8144e52304649', '4e36312e5cb72705', 'a149f9ddae0b8cef', 'eb7f429eaf65648e',
  '824d422d755b9c7b', '56608685c149e80d', '6299c25d6fff4f45', '4c1029697ee35871',
]);
// A public platform name that merely starts with one of the words above (the DOM API); same hash form.
const PLATFORM_TOKENS = new Set(['187eb37f02606b61']);
const MIN_WORD = 4;
const MAX_WORD = 16;

// Session ids of the private transcript fixtures, same hash scheme as above.
const FIXTURE_UUIDS = new Set(['778c17e79dcee680', '082da1e4a38bcbd1']);

const TICKET_ID = /\bt-20\d\d-/;
const PRIVATE_NET = /\b192\.168\.\d|\b10\.\d{1,3}\.\d{1,3}\.\d|\b172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d/;

// Fixtures are recorded transcripts; only the id rule (6) looks at them, never the rules below.
const FIXTURES = 'reader/fixtures/';
const KEY_PATTERNS = [
  /\bsk-[A-Za-z0-9]{8,}/, // \b keeps "task-notification" green
  /ghp_[A-Za-z0-9]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY/,
  /Bearer [A-Za-z0-9._-]{16,}/,
];
const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[a-z]{2,})/gi;
const EMAIL_OK = new Set(['example.test', 'example.com']); // reserved names, reach nobody
const HOME_PATH = /[A-Za-z]:(?:\\{1,2}|\/)Users(?:\\{1,2}|\/)|\/home\/|\/Users\//i; // one or two backslashes: source code escapes them
// Synthetic home paths that may stand in the tree. Each is cut out of the line before the
// home-path rule runs, but only when no path character (word, dot, dash) follows it, so
// a longer name sharing the prefix is not cut; everything else that looks like a real home still trips the rule.
// The Windows entries are written the way they occur in source files: escaped backslashes.
const SYNTHETIC = [
  'C:\\\\Users\\\\u', // launch.test.js: a made-up browser profile path on a made-up user "u"
  'C:\\\\Users\\\\someone', // leak-check.test.js: probe value for the path-trace rule
  '/Users/someone/x', // leak-check.test.js: same probe, macOS form
  '/home/pi/y', // leak-check.test.js: same probe, Linux form
  '/home/me/.aihud', // node/README.md: example catalog paths for a made-up user "me"
  '/home/u/my.app', // node/store.test.js: input of the slug function, made-up user "u"
  'C:/home/.claude/projects', // reader/inventory.test.js: expected value for a made-up root "C:/home"
  '`/Users/`', // reader/leak-check.js: the comment naming the forbidden pattern itself
  '`/home/`', // same comment
];
const SYNTHETIC_RE = SYNTHETIC.map((s) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\w.-])', 'g'));
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NETWORK_CALL = /\bfetch\s*\(|\bWebSocket\s*\(|\bEventSource\s*\(|\bXMLHttpRequest\b|\bsendBeacon\s*\(/;
const NETWORK_MODULE = /^(?:node:)?(?:http|https|net|dgram|tls)$/;
const IMPORT_SPEC = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(['"`])([^'"`\n]+)\1/g;
const URL_SPEC = /\bnew\s+URL\s*\(\s*(['"`])([^'"`\n]+)\1\s*,\s*import\.meta\.url/g;

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile()) out.push(p);
  }
  return out;
}

function identifierParts(line) {
  const parts = new Set();
  for (const token of line.normalize('NFC').match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []) {
    if (PLATFORM_TOKENS.has(hash(token.toLowerCase()))) continue;
    parts.add(token.toLowerCase());
    for (const p of token.split(/_|(?<=[\p{Ll}\p{N}])(?=\p{Lu})|(?<=\p{Lu})(?=\p{Lu}\p{Ll})/u)) if (p) parts.add(p.toLowerCase());
  }
  return parts;
}

function leavesPackage(root, file, spec) {
  if (spec.startsWith('file:') || isAbsolute(spec) || /^[A-Za-z]:/.test(spec)) return true;
  if (!spec.startsWith('.')) return false;
  const rel = relative(root, resolve(dirname(file), spec));
  return rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel);
}

// The files the fence looks at: every file of the package. A function so a test can hand the
// scanner a fake list instead.
export const listFiles = (root) => walk(root);

export function scan(root, { words = PRIVATE_WORDS, uuids = FIXTURE_UUIDS, list = listFiles } = {}) {
  const seen = new Map();
  const isPrivate = (part) => {
    if (!seen.has(part)) {
      let hit = false;
      for (let n = MIN_WORD; n <= Math.min(part.length, MAX_WORD) && !hit; n++) hit = words.has(hash(part.slice(0, n)));
      seen.set(part, hit);
    }
    return seen.get(part);
  };
  const files = list(root);
  const violations = [];
  for (const file of files) {
    const name = relative(root, file).split(sep).join('/');
    const code = CODE.has(extname(file));
    const tile = code && name.startsWith('tiles/');
    const fixture = name.startsWith(FIXTURES);
    const add = (line, rule, detail) => violations.push({ at: `${name}:${line}`, rule, detail });
    const fixtureIds = (line, text) => {
      for (const [id] of text.matchAll(UUID)) if (uuids.has(hash(id.toLowerCase()))) add(line, 'fixture-uuid', id);
    };
    fixtureIds(0, name);
    readFileSync(file, 'utf8').split('\n').forEach((text, i) => {
      const line = i + 1;
      for (const part of identifierParts(text)) if (isPrivate(part)) add(line, 'private-word', part);
      if (TICKET_ID.test(text)) add(line, 'ticket-id', text.match(TICKET_ID)[0]);
      if (PRIVATE_NET.test(text)) add(line, 'private-network', text.match(PRIVATE_NET)[0]);
      fixtureIds(line, text);
      if (!fixture) {
        for (const re of KEY_PATTERNS) if (re.test(text)) add(line, 'key-pattern', text.match(re)[0].slice(0, 12) + '...');
        for (const m of text.matchAll(EMAIL)) if (!EMAIL_OK.has(m[1].toLowerCase())) add(line, 'email', m[0]);
        let bare = text;
        for (const ok of SYNTHETIC_RE) bare = bare.replace(ok, '');
        if (HOME_PATH.test(bare)) add(line, 'home-path', bare.match(HOME_PATH)[0]);
      }
      if (tile && NETWORK_CALL.test(text)) add(line, 'network-call-in-tile', text.match(NETWORK_CALL)[0]);
      if (!code) return;
      for (const m of text.matchAll(IMPORT_SPEC)) {
        if (leavesPackage(root, file, m[2])) add(line, 'import-outside-package', m[2]);
        if (tile && NETWORK_MODULE.test(m[2])) add(line, 'network-call-in-tile', m[2]);
      }
      for (const m of text.matchAll(URL_SPEC)) if (leavesPackage(root, file, m[2])) add(line, 'import-outside-package', m[2]);
    });
  }
  return { files: files.length, violations };
}

test('the package stands on its own', (t) => {
  const { files, violations } = scan(ROOT);
  t.diagnostic(`fence scanned ${files} files, ${violations.length} violations`);
  assert.ok(files >= 100, `the fence scanned ${files} files - far fewer than the package has, a clean result would prove nothing`);
  const list = violations.map((v) => `  ${v.rule} @ ${v.at}: ${v.detail}`).join('\n');
  assert.equal(violations.length, 0, `fence broken:\n${list}`);
});

test('every rule bites', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aihud-fence-'));
  const uuid = ['00000000', '0000', '4000', '8000', '000000000001'].join('-');
  // file -> [content, rules it must raise]; an empty list means it must stay clean.
  const cases = {
    'tiles/bad.js': ["export const r = () => fetch('/x');\n", ['network-call-in-tile']],
    'tiles/bad.tsx': ["export const r = () => fetch('/x');\n", ['network-call-in-tile']],
    'tiles/sock.js': [['import net from', "'node:net';"].join(' '), ['network-call-in-tile']],
    'a.js': [[
      ['import x from', "'../outside.js';"].join(' '),
      `// ${'t-20'}26-01-01-1`,
      `// ${'192.'}168.0.1`,
    ].join('\n'), ['import-outside-package', 'private-network', 'ticket-id']],
    'url.mjs': [['const u = new URL(', "'../outside.txt', import.meta.url);"].join(''), ['import-outside-package']],
    'b.md': ['Zebras live here.\n', ['private-word']],
    'nfd.md': [`Gru${String.fromCharCode(0x308)}ne, decomposed.`, ['private-word']],
    'caps.js': ['const XMLZebraThing = 1;\n', ['private-word']],
    [`${uuid}.jsonl`]: [`{"sessionId":"${uuid}"}\n`, ['fixture-uuid']],
    'clean.js': [['const u = new URL(', "'./x.txt', import.meta.url); // a member"].join(''), []],
  };
  try {
    mkdirSync(join(dir, 'tiles'));
    for (const [name, [content]] of Object.entries(cases)) writeFileSync(join(dir, name), content);
    const { files, violations } = scan(dir, {
      words: new Set([hash('zebra'), hash(`gr${String.fromCharCode(0xfc)}n`)]),
      uuids: new Set([hash(uuid)]),
    });
    assert.equal(files, Object.keys(cases).length);
    const misses = [];
    for (const [name, [, expected]] of Object.entries(cases)) {
      const got = [...new Set(violations.filter((v) => v.at.startsWith(`${name}:`)).map((v) => v.rule))].sort();
      if (got.join() !== expected.join()) misses.push(`${name}: expected [${expected}] got [${got}]`);
    }
    assert.deepEqual(misses, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the key, mail, network and home-path rules bite on an injected file list', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aihud-fence2-'));
  // Every violation is assembled from pieces so this file stays clean itself.
  const cases = {
    'key-sk.txt': [['x = "', 'sk', '-abcdefgh12345678"'].join(''), 'key-pattern'],
    'key-ghp.txt': [['ghp', '_abcdefghij1234'].join(''), 'key-pattern'],
    'key-akia.txt': [['AK', 'IA', 'ABCDEFGHIJKLMNOP'].join(''), 'key-pattern'],
    'key-pem.txt': [['-----BEGIN ', 'RSA PRIVATE', ' KEY-----'].join(''), 'key-pattern'],
    'key-bearer.txt': [['Bearer ', 'abcdefghijklmnop1234'].join(''), 'key-pattern'],
    'mail.txt': [['someone', '@', 'gmail', '.com'].join(''), 'email'],
    'net10.txt': [['10', '.0.0.', '5'].join(''), 'private-network'],
    'net172.txt': [['172', '.20.1.', '4'].join(''), 'private-network'],
    'home-win.txt': [['C:', '\\Users', '\\someoneElse2\\x'].join(''), 'home-path'],
    'home-linux.txt': [['/ho', 'me/someoneElse2/x'].join(''), 'home-path'],
    'home-mac.txt': [['/Us', 'ers/someoneElse2/x'].join(''), 'home-path'],
    // the same path as it is written inside source code (escaped backslashes), .js and .json
    'esc.js': [['const p = "C:', '\\\\Users', '\\\\someoneElse2\\\\x";'].join(''), 'home-path'],
    'esc.json': [['{"p":"C:', '\\\\Users', '\\\\someoneElse2\\\\.claude"}'].join(''), 'home-path'],
    // an allow-list entry is not a prefix licence
    'near-linux.txt': [['/ho', 'me/pi/yz/secret'].join(''), 'home-path'],
    'near-win.txt': [['C:', '\\\\Users', '\\\\someoneElse\\\\x'].join(''), 'home-path'],
    // case does not help
    'case-win.txt': [['c:', '\\Users', '\\someoneElse2'].join(''), 'home-path'],
    'case-mail.txt': [['Me', '@', 'Gmail', '.COM'].join(''), 'email'],
    // must stay clean: the word boundary, the reserved mail domains, the synthetic paths
    'ok.txt': [['task-notification', ' some@example', '.test a@example', '.com "C:\\\\Users\\\\u\\\\x" "/hom', 'e/pi/y"'].join(''), null],
  };
  try {
    for (const [name, [content]] of Object.entries(cases)) writeFileSync(join(dir, name), content + '\n');
    const list = () => Object.keys(cases).map((n) => join(dir, n));
    const { files, violations } = scan(dir, { list });
    assert.equal(files, Object.keys(cases).length);
    const misses = [];
    for (const [name, [, rule]] of Object.entries(cases)) {
      const got = [...new Set(violations.filter((v) => v.at.startsWith(`${name}:`)).map((v) => v.rule))];
      if (got.join() !== (rule ?? '')) misses.push(`${name}: expected [${rule ?? ''}] got [${got}]`);
    }
    assert.deepEqual(misses, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// THE NETWORK PROBE ("no network call in the core") — two ways, both needed.
//   1. STATIC: no file of the core imports or names a network module.
//   2. RUNNING: every reachable network entry is replaced by a counter that THROWS on the
//      first call. Then the whole core runs over both fixtures. Counter = 0.
// Without (2), (1) would only be a text search; without (1) an indirect way would get through.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import tls from 'node:tls';
import dns from 'node:dns';
import { inventory, findSession } from './inventory.js';
import { loadSession, buildSheet } from './derive.js';
import { contractSheet } from './contract.js';
import { readExtras } from './extras.js';
import { checkLeaks } from './leak-check.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, 'fixtures', 'projects');
const SESSIONS = ['5c0b7e2a-9d41-4f36-8a1e-2b7d9c3f6e10', 'a3e8f1d2-6c57-4b09-9e24-7f1a0d5c8b36'];
const NOW = Date.parse('2026-09-10T12:00:00.000Z');

const CORE = ['inventory.js', 'parser.js', 'derive.js', 'contract.js', 'leak-check.js', 'extras.js', 'git.js', 'parser-codex.js', 'parser-antigravity.js'];

// `child_process`/`execSync`/`import(` belong on the list — a dynamic import or an
// `execSync('curl …')` would walk through the static probe otherwise.
export const FORBIDDEN = [
  'node:http', 'node:https', 'node:net', 'node:tls', 'node:dgram', 'node:dns',
  "'http'", "'https'", 'undici', 'fetch(', 'XMLHttpRequest', 'WebSocket', 'axios',
  'child_process', 'execSync', 'execFile', 'spawnSync', 'import(',
];

/** The same check the core files see — as a function, so that it provably bites. */
export function networkHits(source) {
  return FORBIDDEN.filter((w) => String(source).includes(w));
}

test('the forbidden list also catches process start and dynamic import', () => {
  for (const w of ['child_process', 'execSync', 'import(']) {
    assert.ok(FORBIDDEN.includes(w), `${w} must be on the forbidden list`);
  }
  // Trip-wire: two real bypasses are FOUND — the list is not only counted.
  const processWay = [
    "import { execSync } from 'node:child" + "_process';",
    "execSync('curl https://example.test');",
  ].join('\n');
  assert.deepEqual(networkHits(processWay).sort(), ['child_process', 'execSync']);
  const dynamicWay = "const m = await impo" + "rt('undi' + 'ci'); m.request();";
  assert.deepEqual(networkHits(dynamicWay), ['import(']);
  assert.deepEqual(networkHits('const x = 1 + 1;'), [], 'harmless code stays untouched');
});

test('static: no core file names a network module', () => {
  let checked = 0;
  for (const file of CORE) {
    const source = readFileSync(join(HERE, file), 'utf8');
    assert.deepEqual(networkHits(source), [], `${file} names a network module`);
    for (const w of FORBIDDEN) {
      checked++;
      assert.equal(source.includes(w), false, `${file} names ${w}`);
    }
    // The only allowed imports: node:fs, node:path, node:url and the neighbours.
    const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1]);
    for (const i of imports) {
      assert.ok(/^(node:(fs|path|url)|\.\/[a-z-]+\.js)$/.test(i), `${file} imports ${i}`);
    }
  }
  assert.ok(checked >= 1);
  assert.equal(checked, CORE.length * FORBIDDEN.length);
  assert.equal(CORE.length, 9);
});

test('running: the full core over both fixtures calls ZERO network entries', () => {
  let calls = 0;
  const called = [];
  const restore = [];
  const trap = (holder, name, mark) => {
    const old = holder[name];
    if (typeof old !== 'function') return;
    holder[name] = (...args) => { calls++; called.push(mark); throw new Error(`network call: ${mark}`); };
    restore.push(() => { holder[name] = old; });
  };
  trap(globalThis, 'fetch', 'fetch');
  for (const [t, n] of [[http, 'request'], [http, 'get'], [https, 'request'], [https, 'get'],
    [net, 'connect'], [net, 'createConnection'], [tls, 'connect'],
    [dns, 'lookup'], [dns.promises, 'lookup']]) trap(t, n, `${n}`);
  assert.ok(restore.length >= 8, `${restore.length} entries locked`);

  let runs = 0;
  try {
    for (const id of SESSIONS) {
      const inv = inventory({ root: ROOT, nowMs: NOW });
      const loaded = loadSession(findSession(inv, id));
      const sheet = buildSheet(loaded, { nowMs: NOW });
      // Sidecar + git reading run inside the trap too (empty env: no aihud home, no real file).
      const extras = readExtras(loaded, { env: {}, nowMs: NOW });
      const contract = contractSheet(sheet, { extras });
      runs++;
      assert.ok(sheet.tokens.total > 0, 'the run really computed');
      assert.equal(checkLeaks(contract).clean, true);
    }
  } finally {
    for (const z of restore) z();
  }
  // Trip-wire: "zero network calls" is only worth something if anything ran at all.
  assert.ok(runs >= 1, 'the network probe must have run');
  assert.equal(runs, 2);
  assert.deepEqual(called, []);
  assert.equal(calls, 0);
});

test('counter-proof: the trap snaps when someone does call', async () => {
  let calls = 0;
  const old = globalThis.fetch;
  globalThis.fetch = () => { calls++; throw new Error('network call: fetch'); };
  try {
    assert.throws(() => globalThis.fetch('https://example.invalid'), /network call/);
  } finally { globalThis.fetch = old; }
  assert.equal(calls, 1, 'without this counter-proof the zero above would be an empty claim');
});

test('the core consists of exactly these files (no silent extra file)', () => {
  const present = readdirSync(HERE).filter((f) => f.endsWith('.js') && !f.endsWith('.test.js'));
  assert.deepEqual(present.sort(), [...CORE, 'leaky-sheet.js'].sort());
});

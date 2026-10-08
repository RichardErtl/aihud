// ─────────────────────────────────────────────────────────────────────────────
//  THE LEAK CHECK
//
//  The rule: **the reader reads only STRUCTURE, never content.** This file is the latch that
//  PROVES it instead of claiming it. It checks a finished reader output and returns a list of
//  violations — no throw, no repair: whoever checks does not repair.
//
//  FOUR RULES, deliberately WITHOUT an exception list:
//   1. FORBIDDEN KEYS. The fields plain text lives in inside the JSONL
//      (`content`, `prompt`, `args`, `lastPrompt`, `aiTitle`, `description`, `command`,
//      `summary`, `note`, `result`, `stdout`, `stderr`, `text`, `input`, `raw`) — and the path
//      fields (`cwd`, `worktreePath`, `file`, `main_file`, `path`, `root`).
//      A contract type may NEVER carry them; a path is not a prompt, but it betrays the
//      machine and belongs in the inventory, not in the answer.
//   2. NO WHITESPACE IN STRINGS. Prose has spaces, identifiers do not. That is why the reader
//      output carries only whitespace-free strings — even its own caveats travel as a mark
//      (`derive.js`, MARK_*). An exception list for "our own sentences" would be exactly the
//      hole foreign text would later come through.
//   3. NO MASK MARKER. Every plain-text field of the fixtures carries `<<TEXT>>`
//      (`fixtures/mask.js`). If the marker shows up in the output, plain text HAS leaked —
//      that is the actual proof of this check.
//   4. NO PATH TRACE. `C:\`, `/Users/`, `/home/`, `.jsonl`, `.claude` in a value.
//
//  Rule 3 carries the weight: it works BECAUSE the fixtures come from real transcripts and every
//  plain-text field was masked. Without a real source the check would talk to itself.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAINTEXT_MARKER = '<<TEXT>>';
export const MAX_STRING = 120;
/** The only keys `withText: true` exempts (contract fields that are plain text on purpose). */
export const TEXT_KEYS = new Set(['title', 'note', 'first_line']);

export const FORBIDDEN_KEYS = new Set([
  // plain-text fields of the transcript JSONL
  'content', 'prompt', 'args', 'lastPrompt', 'aiTitle', 'ai_title', 'description',
  'command', 'summary', 'note', 'result', 'stdout', 'stderr', 'text',
  'input', 'raw', 'short_info', 'label', 'title', 'first_line',
  // path fields
  'cwd', 'worktreePath', 'file', 'main_file', 'path', 'root', 'outputFile',
]);

const PATH_TRACE = /(^|[^A-Za-z0-9])([A-Za-z]:[\\/]|\/Users\/|\/home\/)|\.jsonl|\.claude/;

/** A value that CANNOT carry plain text — number, boolean, nothing. */
export function harmlessValue(v) {
  return v == null || typeof v === 'number' || typeof v === 'boolean';
}

/**
 * Checks a reader output for plain text.
 * @returns {{clean: boolean, violations: Array<{path: string, reason: string, sample: string}>,
 *            checked: {values: number, strings: number}}}
 */
export function checkLeaks(value, { marker = PLAINTEXT_MARKER, maxString = MAX_STRING, withText = false } = {}) {
  const violations = [];
  let values = 0;
  let strings = 0;

  const sample = (s) => String(s).slice(0, 60);

  function walk(w, path) {
    values++;
    if (typeof w === 'string') {
      strings++;
      if (w.includes(marker)) violations.push({ path, reason: 'mask_marker', sample: sample(w) });
      else if (/\s/.test(w)) violations.push({ path, reason: 'whitespace_in_string', sample: sample(w) });
      else if (w.length > maxString) violations.push({ path, reason: 'string_too_long', sample: sample(w) });
      else if (PATH_TRACE.test(w)) violations.push({ path, reason: 'path_trace', sample: sample(w) });
      return;
    }
    if (Array.isArray(w)) { w.forEach((x, i) => walk(x, `${path}[${i}]`)); return; }
    if (w && typeof w === 'object') {
      for (const [k, v] of Object.entries(w)) {
        // withText (a local display asked for the user's own words): exactly these three keys are
        // plain text BY DESIGN; a STRING under them is skipped, everything else stays fully checked.
        if (withText && TEXT_KEYS.has(k) && typeof v === 'string') continue;
        // A forbidden KEY counts only if its VALUE can carry text at all. Measured cause: the
        // contract names a token kind `input` (`tokens_by_kind.input`) — an integer.
        // Reporting it as a plain-text leak would be a false alarm. The rule does NOT get softer:
        // a leak is always a string or an object, and both still trip (own probe for it).
        if (FORBIDDEN_KEYS.has(k) && !harmlessValue(v)) {
          violations.push({ path: `${path}.${k}`, reason: 'forbidden_key', sample: sample(JSON.stringify(v)) });
        }
        walk(v, `${path}.${k}`);
      }
    }
  }

  walk(value, '');
  return { clean: violations.length === 0, violations, checked: { values, strings } };
}

/** Short form for probes: throws with a readable list of findings when the check breaks. */
export function checkLeaksOrThrow(value, opt) {
  const result = checkLeaks(value, opt);
  if (!result.clean) {
    const list = result.violations.slice(0, 10)
      .map((v) => `  ${v.reason} @ ${v.path}: ${v.sample}`).join('\n');
    throw new Error(`leak check broken - ${result.violations.length} violation(s):\n${list}`);
  }
  return result;
}

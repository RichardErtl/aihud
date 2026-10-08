// ─────────────────────────────────────────────────────────────────────────────
//  THE LEAKY COUNTER-VERSION
//
//  DO NOT USE. This file is leaky ON PURPOSE and exists for exactly one reason: the RED
//  counter-proof of the leak check (`leak-check.js`). A green latch that was never red proves
//  nothing — it might simply check nothing (vacuously true probes can seal a dead feature).
//
//  It builds the normal reader sheet and attaches exactly the fields a naive build WOULD
//  attach, because the contract knows them:
//   · `identity.short_info`   ← `last-prompt.lastPrompt` (the last user prompt, plain text)
//   · `turns[].label`         ← `user.message.content` (the reason of the turn, plain text)
//   · `tree.nodes[].description` ← `meta.json.description` (user-near task text)
//   · `identity.memo`         ← `ai-title` THROUGH `ident()`: a leak on the path every real
//     field takes, and under a key name no rule 1 knows. Only the marker rule can catch it —
//     and it can only since `ident()` refuses instead of scrubbing.
//  In the masked fixtures all four carry the marker `<<TEXT>>` — so the leak check has to trip,
//  and for several reasons at once (key name, marker, whitespace).
//
//  Called in the test via the switch `READER_LEAKY=1` — in the normal run nobody touches it.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { buildSheet } from './derive.js';
import { ident } from './parser.js';

/** Reads the plain-text fields the real reader deliberately leaves behind. */
function plainTextFrom(entry) {
  let lastPrompt = null;
  let title = null;
  try {
    for (const z of readFileSync(entry.main_file, 'utf8').split(/\r?\n/)) {
      if (!z.trim()) continue;
      let o; try { o = JSON.parse(z); } catch { continue; }
      if (o.type === 'last-prompt' && lastPrompt == null) lastPrompt = o.lastPrompt;
      if (o.type === 'ai-title' && title == null) title = o.aiTitle;
      if (o.type === 'user' && o.origin && o.origin.kind === 'human') {
        const c = o.message && o.message.content;
        const block = Array.isArray(c) ? c.find((b) => b && b.type === 'text') : null;
        if (block && !lastPrompt) lastPrompt = block.text;
      }
    }
  } catch { /* whatever — the counter-version may be sloppy, it is the broken state */ }
  return { lastPrompt, title };
}

/** The reader sheet WITH the leaks. Only for the red proof. */
export function leakySheet(loaded, opt = {}) {
  const sheet = buildSheet(loaded, opt);
  const { lastPrompt, title } = plainTextFrom(loaded.entry);
  sheet.identity = {
    ...sheet.identity,
    short_info: lastPrompt,
    aiTitle: title,
    // THIS leak takes the PATH every real reader field takes — through the identifier guard
    // `ident()`, under a harmless key name. As long as `ident()` scrubbed instead of refusing,
    // it passed the leak check unseen.
    memo: ident(title, 200),
  };
  sheet.turns = sheet.turns.map((z) => ({ ...z, label: lastPrompt }));
  sheet.block_b = {
    ...sheet.block_b,
    tree: {
      ...sheet.block_b.tree,
      nodes: sheet.block_b.tree.nodes.map((k) => ({
        ...k,
        description: descriptionFrom(loaded, k.id),
      })),
    },
  };
  return sheet;
}

function descriptionFrom(loaded, agentId) {
  const a = (loaded.entry.subagents || []).find((x) => x.agent_id === agentId);
  if (!a) return null;
  try {
    const meta = JSON.parse(readFileSync(a.file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
    return meta.description || null;
  } catch { return null; }
}

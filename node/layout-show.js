// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · `aihud layout show <slug>`
//
//  Read only: prints what has to travel with one of your layouts (`<home>/layouts/<slug>.json`) to
//  another machine - the layout file, whether it is the active choice here, the own tiles it names
//  (`<home>/tiles/`, not shipped with the package) and the tiles it names that do not exist here.
//  Writes nothing.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, aihudHome, catalog, readSettings } from './store.js';

/** Returns the exit code; prints through `log`/`err`. */
export async function layoutShow(slug, values, log, err) {
  const home = aihudHome(values.home);
  const entries = await catalog(home);
  const own = entries.filter((e) => e.kind === 'layout' && e.own);
  const hit = own.find((e) => e.name === slug);
  if (!hit) {
    if (entries.some((e) => e.kind === 'layout' && !e.own && e.name === slug)) {
      log(`layout show: "${slug}" is a shipped layout - it travels with the package, nothing to copy`);
      return 0;
    }
    err(`layout show: no layout "${slug}" in ${home}`);
    err(own.length ? `existing layouts: ${own.map((e) => e.name).join(', ')}` : 'existing layouts: (none)');
    return 1;
  }
  let layout;
  try { layout = JSON.parse(readFileSync(hit.path, 'utf8')); } catch { err(`layout show: ${hit.path} is not readable JSON`); return 1; }
  const settings = readSettings(home);
  // The HUD picks by settings key regardless of the layout's own orientation (hud.js:191): check both keys.
  const keys = ['layout_portrait', 'layout_landscape'].filter((k) => (settings[k] || DEFAULT_SETTINGS[k]) === slug);
  const names = [...new Set((Array.isArray(layout.tiles) ? layout.tiles : []).map((p) => p && p.tile).filter(Boolean))];
  const tiles = new Map();
  for (const e of entries) if (e.kind === 'tile' && !tiles.has(e.name)) tiles.set(e.name, e);   // own tiles come first
  const ownTiles = names.filter((n) => tiles.get(n)?.own);
  const missing = names.filter((n) => !tiles.has(n));
  log(`layout:  ${hit.path}`);
  log(`active:  ${keys.length ? `yes (${keys.join(', ')} in ${home})` : 'no'}`);
  log(`own tiles (copy these from ${home}/tiles/ too):`);
  for (const n of ownTiles) log(`  ${n}  ${tiles.get(n).path}${tiles.get(n).loadable === false ? ' (does not load)' : ''}`);
  if (!ownTiles.length) log('  (none)');
  log('missing here (no loadable tile of that name):');
  for (const n of missing) log(`  ${n}`);
  if (!missing.length) log('  (none)');
  return 0;
}

// ─────────────────────────────────────────────────────────────────────────────
//  THE NODE · `aihud check`
//
//  Checks an aihud home without a server: every tile of the catalog loads, every own layout passes
//  `layoutViolation` (the same check `POST /layouts` runs), and the settings' two layout names
//  point at an existing layout. Hidden shipped layouts are not in the catalog (`store.catalog`
//  honours the trash markers), so "hidden" and "missing" are the same finding.
//  Findings are `{file, problem}`; `checkHome` never throws on a broken home, it reports it.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { aihudHome, catalog, readSettings, validateSettings } from './store.js';
import { layoutViolation } from './layout-schema.js';

export async function checkHome(explicitHome) {
  const home = aihudHome(explicitHome);
  const findings = [];
  const rel = (p) => relative(home, p).startsWith('..') ? p : relative(home, p);
  const entries = await catalog(home);

  for (const e of entries) {
    if (e.kind === 'tile' && e.loadable === false) findings.push({ file: rel(e.path), problem: `tile does not load: ${e.error}` });
  }
  for (const e of entries) {
    if (e.kind !== 'layout' || !e.own) continue;
    if (e.loadable === false) { findings.push({ file: rel(e.path), problem: e.error || 'layout unreadable' }); continue; }
    let body;
    try { body = JSON.parse(readFileSync(e.path, 'utf8')); } catch { findings.push({ file: rel(e.path), problem: 'layout_json_unreadable' }); continue; }
    const v = layoutViolation(body, entries);
    if (v) findings.push({ file: rel(e.path), problem: v });
  }

  const settingsFile = join('settings.json');
  let settings = null;
  try { settings = readSettings(home); } catch (e) { findings.push({ file: settingsFile, problem: e.reason || e.message }); }
  if (settings) {
    const layouts = new Set(entries.filter((e) => e.kind === 'layout').map((e) => e.name));
    for (const key of ['layout_portrait', 'layout_landscape']) {
      if (!layouts.has(settings[key])) { findings.push({ file: settingsFile, problem: `${key} "${settings[key]}" is not an existing layout (missing or hidden)` }); continue; }
      try { validateSettings({ [key]: settings[key] }, entries); } catch (e) { findings.push({ file: settingsFile, problem: `${key} "${settings[key]}": ${e.reason || e.message}` }); }
    }
  }
  return { home, findings };
}

/** The CLI side: one line per finding, a last `ok` / `N problems`; the exit code. */
export async function runCheck(explicitHome, log) {
  const { findings } = await checkHome(explicitHome);
  for (const f of findings) log(`${f.file}: ${f.problem}`);
  log(findings.length ? `${findings.length} problem${findings.length === 1 ? '' : 's'}` : 'ok');
  return findings.length ? 1 : 0;
}

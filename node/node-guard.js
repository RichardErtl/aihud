// The Node floor (package.json "engines": >=22). bin/aihud.js asks this BEFORE it loads the CLI:
// static imports are hoisted, so the CLI comes in by a dynamic import only after the check.
// Keep this file free of imports and of syntax an old Node cannot parse.

/** The message for a Node older than 22, or null when this Node is new enough. */
export function nodeTooOld(version) {
  const major = Number(String(version).replace(/^v/, '').split('.')[0]);
  return major >= 22 ? null : 'aihud needs Node 22 or newer (you have ' + version + '). https://nodejs.org';
}

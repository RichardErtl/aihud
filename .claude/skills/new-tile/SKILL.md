---
name: new-tile
description: Build a new aihud tile (one drawing for the aihud heads-up strip) after the aihud tile contract, and save it to ~/.aihud/tiles/. Use when the user wants a new tile, a changed tile, or one "full tile" that shows everything they need.
---

# /new-tile — build an aihud tile

You write ONE tile for aihud: a JavaScript module that draws one session's data into one cell of
the aihud strip. The user decides what it shows and how; you build it after the contract.

## 1. Get the contract

Run `npx aihud new-tile`. It prints three things: the tile contract (render signature, `meta`,
sizes, design variables, rules), the value list (every number the reader delivers, with meaning,
unit and whether it is exact or estimated), and these instructions. Read all of it before you
write code. If aihud is installed locally, the same files are `tiles/CONTRACT.md` and
`tiles/contract.json` inside the package.

## 2. Ask the user

- **What** should the tile show? Offer the values from the value list; a tile may combine several.
- **Content block** it belongs to (one of seven), **style** (`standard` · `minimal` · `fancy-a` ·
  `fancy-b`) and **orientation** (`portrait` · `landscape`).
- **Size** in grid units (`cols × rows`). The portrait strip is 8 units wide. Suggest the size the
  contract table gives for the chosen block × style × orientation; a `—` cell (fancy-b header/tokens,
  fancy-a skills): suggest the twin style's size of that block (CONTRACT.md §Sizes).

**Choosing the block:** pick the one of the seven content blocks that fits the new value best. For
an analysis value that has no block of its own, name the closest block; `analysis-view` is a home
for values in the contract, not a block a tile can declare.

**Twin rule:** one tile = one orientation (`meta.orientation`). A tile shows in a HUD shape only if
it is placed in that layout. For BOTH shapes write two files, `<id>` (portrait) and
`<id>-landscape` (same values, a landscape size), then run `aihud add-tile <id>`; with only one
file `add-tile` prints a `note:` that the other HUD will not show the tile.

A **full tile** is one tile that holds everything the user wants to see at once. Build it the
same way: one module, one `meta`, one size — just more inside.

## 3. Write the tile

- File: `~/.aihud/tiles/<name>.js` (create the folder if missing). Never write into the aihud
  package itself, and never into `~/.claude/`.
- Export `meta` (`name` · `contentBlock` · `style` · `orientation` · `sizes` · `contractVersion`)
  and `render(el, data, size)`. Set `contractVersion` to the version the contract prints.
- `render` redraws `el` completely on every call, fills `size.cols × size.unit` by
  `size.rows × size.unit` pixels, and draws `–` when a value is missing — never an invented number.
- Colours, fonts and radii only through the design variables (`var(--aihud-text)` …), so the tile
  works in dark and light.
- Set text with `textContent`, not `innerHTML`: the data contains names that come from the
  transcript.

## 4. Warn before you write — the user decides

The tiles shipped with aihud are checked by a test: no network calls, no imports from outside the
package. **Tiles in `~/.aihud/tiles/` are not checked by anything.** So before you write a tile
that does either of the following, stop, say it plainly, and let the user decide:

- **Network calls** — `fetch`, `WebSocket`, `EventSource`, `XMLHttpRequest`, `navigator.sendBeacon`,
  or Node's `http`/`https`/`net`/`dgram`/`tls` modules. A tile that sends data out can leak what
  the session contains.
- **Foreign imports** — any import that is not the tile file itself: npm packages, URLs, other
  files. aihud does not install anything for a tile; foreign code runs with the tile's rights.

If the user says yes, write it and name the call or import in a comment at the top of the file.
If the user says no, find a way without it or leave the value out.

## 5. Finish

Tell the user the file path and the tile's `meta`. aihud lists the user's own tiles first; the
aihud Composer places them.

## Where this skill has to live

Claude Code does **not reliably find** a skill that only sits inside an npm package
(`node_modules/aihud/.claude/skills/`). It loads skills from `~/.claude/skills/` (all projects on
this machine), from a project's `.claude/skills/`, or from a plugin. `npx aihud install-skill`
copies this skill to `~/.claude/skills/new-tile/` (it overwrites an existing copy only with
`--force`). Without installing it, `npx aihud new-tile` prints the same instructions as text.

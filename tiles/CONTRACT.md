# The tile contract

Contract version **1.1**. Machine-readable twin: [`contract.json`](contract.json) — same content,
the JSON is what code validates against. Every tile of aihud, shipped or your own, is built after
this one file.

## What a tile is

A tile is ONE drawing: one **content block** × one **style** × one **orientation**, standalone.
It does not know the other tiles and does not know the layout it sits in.

- **Content blocks (11):** `header` · `context` · `top-three-subagents` · `time` · `tokens` ·
  `subagents` · `skills` · `glance` · `trace` · `tools` · `active-time`
- **Styles (23):** `standard` · `minimal` · `fancy-a` · `fancy-b` · `hairline` · `ledger` · `slab` · `register` · `numeral` · `calibre` · `redline` · `seismograph` · `cellwork` · `column` · `backlight` · `relief` · `bauhaus` · `splitflap` · `particle` · `blueprint` · `mosaic` · `strata` · `essentials`
- **Style families (5, `families` in `contract.json`):** every style belongs to exactly one family; the composer's filter chips are the families.
  `quiet` = `hairline` · `ledger` · `register` · `slab` | `instrument` = `numeral` · `calibre` · `redline` · `splitflap` |
  `drafting` = `blueprint` · `seismograph` · `column` · `bauhaus` | `material` = `backlight` · `relief` · `particle` · `mosaic` · `strata` · `cellwork` |
  `classic` = `standard` · `minimal` · `fancy-a` · `fancy-b` · `essentials`
- **File and name rule:** a tile of the release styles lives in `tiles/<block>-<style>-<orientation>.js` and `meta.name` is the file name without `.js`.
- **Orientations (2):** `portrait` · `landscape`

Not every block × style exists. The first 7 blocks × 4 styles × 2 = 56 combinations, 50 tiles shipped before the
release styles; the release styles (§Sizes) add 48 × 2 = 96 tiles, 146 shipped tiles in all, one
per block × style × orientation (never two tiles with the same triple). Of the first 50: fancy-b ships no `header` and no `tokens` tile —
they drew the same as fancy-a, so the fancy-b layouts place the fancy-a ones; fancy-a ships no
`skills` tile, so the fancy-a layouts place the fancy-b one (§Sizes). The theme
(dark / light) is colour on top of a tile, not a tile of its own. A **layout** is a saved
arrangement of tiles with ONE orientation.

A **full tile** is one tile a user has built that holds everything they want to see. It follows
this contract like any other tile; there is no second contract and no second skill for it.

## The render signature

```js
export function render(el, data, size) { /* draw into el */ }
```

- `el` — the DOM element of the tile. The tile owns its content: each call redraws `el`
  completely. The tile fills its cell; gaps and separators between tiles belong to the grid.
- `data` — ONE session's data sheet, exactly as the reader delivers it (fields below). Any type
  (`session`, `live`, `turn`, `context`, `agents`) and any optional field may be missing: a tile
  draws an empty state (`–`), never an invented number.
- `size` — `{ cols, rows, unit }`: the tile's size in grid units and `unit` = pixels per grid
  unit (square cells). The tile's box is `cols × unit` by `rows × unit` pixels.

**Grid unit:** unit = inner width of the portrait strip ÷ 8. Floor 20 px (inner width 162–163 px),
base 22.5 px (inner width 180 px); below 15 px the strip clips on the right. The portrait strip is
8 units wide; the landscape band is 6 rows high (7 for `standard`).

## The tile's metadata (`meta`)

Every tile module exports `meta` next to `render`:

```js
export const meta = {
  name: 'example-number',          // unique, lowercase, dashes
  contentBlock: 'context',         // one of the 11 content blocks
  style: 'standard',               // one of the 23 styles
  orientation: 'portrait',         // 'portrait' | 'landscape'
  sizes: [{ cols: 8, rows: 6 }],   // allowed sizes in grid units
  contractVersion: '1.1',          // the contract version the tile was built against
};
```

A shipped tile has exactly ONE entry in `sizes`, and it is the size of its block × style ×
orientation in the table below. A tile of your own may pick any size. Resizing a tile is not part
of this version.

## Rules

- **Shipped tiles** (this package) make no network calls and import nothing from outside the
  package. A test (`test/fence.test.js`) enforces it on every commit.
- **Your own tiles** live in `~/.aihud/tiles/`, one `.js` file per tile. Nothing checks them for
  you: network calls or imports from elsewhere are possible, and they are your decision. The
  `/new-tile` skill warns you before it writes either.
- Colours, fonts and radii come from the design variables below (`var(--aihud-text)` …), never as
  fixed values — that is how one tile works in dark and in light.

## Layouts

A **layout** is a saved arrangement of tiles with ONE orientation — one JSON file
(`contract.json` → `layoutFile` is the machine twin of this section):

```json
{
  "name": "night strip",
  "orientation": "portrait",
  "tiles": [
    { "tile": "example-number", "col": 0, "row": 0 },
    { "tile": "example-number", "col": 0, "row": 6 }
  ]
}
```

- **Exactly these keys.** `name` — non-empty text, up to 64 characters, becomes the file name
  (`"Night Strip"` → `night-strip.json`). `orientation` — `portrait` or `landscape`. `tiles` — a
  list of placements, each exactly `{tile, col, row}`: `tile` is the catalog name of a tile (the
  file name without `.js`; your own tile shadows a shipped one of the same name), `col` and `row`
  are integers ≥ 0, the tile's top-left cell, counted from 0.
- **`form` (optional).** `"form": {"cols": 8, "rows": 16}` is the grid form the composer showed when
  it saved: free space at the end (bottom rows in portrait, right columns in landscape) stays instead
  of collapsing to the tiles' extent. Exactly `cols` and `rows`, integers ≥ 1; portrait `cols` = 8,
  landscape `rows` ≤ 7; every tile must fit inside it (`outside_form_…`). The HUD draws portrait rows =
  max(form.rows, extent), landscape cols = max(form.cols, extent) and rows = max(6, form.rows, extent);
  the composer writes it on Save and restores it on load; the window's layout cards use it. Landscape rows below 6 are drawn at 6 in the HUD but kept in the file. A file
  without `form` is drawn at the extent of its tiles, as before.
- **A placement carries no size.** The tile sits at its one size, `meta.sizes[0]`. There is no
  style override, no stretching and no edit mode: the HUD only shows a layout, arranging happens
  in the composer.
- **Fit.** Portrait: `col + cols ≤ 8` (the strip is 8 units wide), the height is free and scrolls.
  Landscape: `row + rows ≤ 7` (the band is 6 rows, 7 for `standard` and `essentials`), the width is free and a band
  wider than the window clips on the right.
- **One orientation.** Every tile of a layout has the layout's orientation (`meta.orientation`); a
  portrait tile never sits in a landscape layout, and a tile without `meta.orientation` is refused
  (`orientation_mismatch`). The shipped landscape probe uses
  `example-number-landscape`, the landscape twin of `example-number` (8×7, the standard landscape
  size of the context block).
- **No overlap.** Two placements may touch, never share a cell.
- **Where layouts live.** Shipped: `aihud/layouts/`. Your own: `~/.aihud/layouts/`. Whether a
  layout is your own is not written in the file — the node derives it from the folder, lists your
  own first, and your own layout shadows a shipped one of the same name. Every catalog entry
  (`GET /catalog`, tiles and layouts) carries `mtime_ms`, the file's modification time, read and
  never set: the window and the composer list your own layouts and tiles newest saved first.
  The probe pair (`probe-portrait`, `probe-landscape`) and its example tiles
  (`example-number`, `example-number-landscape`) are left out of the window's layout choice and the
  composer's tile panel. The probe pair is a development fixture of the source repository and is not
  in the npm package; in a source checkout it stays usable by name.
- **The check.** `POST /layouts` checks a layout against this section and the tile catalog before
  it stores it; the first violation is refused as `400 {"error": "layout_invalid:<path>:<reason>"}`,
  e.g. `layout_invalid:tiles[1]:overlaps_tiles[0]` · `layout_invalid:tiles[0].tile:unknown_tile_x`
  · `layout_invalid:tiles[0]:exceeds_width_1+8>8` · `layout_invalid:tiles[0]:exceeds_band_1+7>7`
  · `layout_invalid:tiles[0].tile:orientation_mismatch`.
  A file copied into the folder by hand is not checked; the HUD draws a tile it cannot load as a
  marked empty cell.

### The composer's draft and the delete

**The draft.** While the composer is open it mirrors its live grid into the HUD page, so you see
how big the grid will be in the real window and the placed tiles at once.

- **Channel.** The composer sends `POST /layouts/draft` with exactly
  `{"orientation": "portrait"|"landscape", "cols": n, "rows": n, "tiles": [{"tile", "col", "row"}]}`
  (portrait `cols` ≤ 8, landscape `rows` ≤ 7, `cols` ≤ 120, `rows` ≤ 60; the tiles pass the layout
  check against the catalog). Same guards as `POST /layouts` (host, Origin 403, JSON content type);
  a bad body is `400 {"error": "draft_invalid:<what>"}`. The draft lives in the node's memory only —
  no file is written — and the answer is `200 {"alive": true, "ttl_ms": 15000}`.
- **Event.** The node broadcasts the draft over the existing `GET /events` stream as
  `event: layout-draft` with the same JSON as `data`, and `{"end": true}` when it ends. A client that
  connects while a draft is alive receives it right after `hello`.
- **Life.** The composer renews the draft about every 5 s (and after every edit). It ends on
  `POST /layouts/draft` with `{"end": true}` (the composer sends it on Save, on Clear and on
  `pagehide`/`beforeunload`) or, when nobody renews it for 15 s, by the node's TTL — which broadcasts
  the end too.
- **HUD.** `/hud` lays a frame (cols × rows at the unit the HUD would use — portrait: inner width ÷ 8,
  landscape: inner height ÷ band rows, capped by `unit_max`), the grid lines and every placed tile
  rendered for real over its own grid, but only while a draft is alive **and** its orientation is the
  HUD's current one; otherwise nothing. The overlay ignores the pointer and never changes the HUD's
  own layout. Code: `hud/draft-overlay.js`.

**The delete.** `DELETE /layouts/<name>` (the composer's Delete button, after a confirm that names the
layout and says "shipped layout" for a shipped one). Same fences as `POST /layouts` (Origin 403, a
name without separators, every path inside the aihud home by real path), unknown → 404. Nothing is
hard-deleted:

- **own** layout → the file moves to `~/.aihud/layouts/trash/<name>-<iso timestamp>.json`;
- **shipped** layout (a package file, cannot move) → a marker `~/.aihud/layouts/trash/<name>.hidden.json`
  (the layout's body + `"hidden_shipped": true`); the catalog leaves a marked shipped layout out.
  Restoring = moving the file/marker out of `trash/` by hand;
- if `layout_portrait` / `layout_landscape` of the settings named a layout that no longer resolves,
  that key is reset through the settings write path to the default shipped layout of the
  orientation (`essentials-portrait` / `essentials-landscape`; if that one is gone too, the first remaining
  shipped layout of the orientation by name), `settings-changed` is broadcast, and the answer names it:
  `200 {"name", "own", "trashed", "settings_reset": {"layout_portrait": "essentials-portrait"} | null}`.
  `catalog-changed {slug}` is broadcast.

### Which layout the HUD shows

`settings.json` names two layouts by catalog name and one threshold:

| Key | Default | Meaning |
|---|---|---|
| `layout_portrait` | `essentials-portrait` | the layout shown when the window is portrait-shaped (in a source checkout the probe pair `probe-portrait`/`probe-landscape` is also available by name) |
| `layout_landscape` | `essentials-landscape` | the layout shown when the window is landscape-shaped |
| `landscape_ratio` | `1` | landscape once inner width ÷ inner height reaches this value |
| `unit_max` | `22.5` | the largest grid unit in px, in both orientations |

The HUD re-picks on every resize. It never mixes the two: one window shape, one layout. If a
setting names a layout of the other orientation, the HUD shows it with a notice, never silently.

The base size is derived from the window — width in portrait, height in landscape —
and capped by `unit_max`: a big or square window does not blow the tiles up. The default 22.5 px
is the base unit (180 px inner) and the largest unit the sketches were fit-checked at. Further
limits are left to the Settings tab.

### Settings: the other keys and the write way

Beyond the four keys above, `settings.json` carries `port` (default `4747`) and six optional keys —
absent means the stated default:

| Key | Absent means | Meaning |
|---|---|---|
| `theme` | the system preference | `system`, `dark` or `light`: which column of the design variables the HUD shows |
| `design_variables` | no override | `{"dark": {"--aihud-…": value}, "light": {…}}` — overrides of the design variables below, laid inline on `<html>` by the HUD for the shown theme |
| `welcome_seen` | not seen | the Start tab's marker: `true` once the intro was finished or skipped (the Start tab opens on `/window` until then; Settings > "Show introduction again" sets it `false`) |
| `projects` | `~/.claude/projects` | the transcript folder, used from the next start when neither `--projects` nor `AIHUD_PROJECTS` names one |
| `last_tab` | Live | the window tab last open: `live`, `layouts`, `settings` or `analysis` (`LAST_TAB_NAMES`); written by the window on every tab switch, read on open (address hash > Start while the intro is due > `last_tab` > Live; Start is never stored). Window-only: the HUD ignores a `settings-changed` that names only this key |
| `windows` | no window, no percent | `{"antigravity": {"default": <int>}}` — the context window size ASSUMED for Antigravity (its transcript names none); the percent is then shown as estimated |

The window's Settings tab writes them through `POST /settings` (the third write way of the node,
same fences as `POST /layouts`: own origin only, JSON only, written via `writeInside` into
`<aihud home>/settings.json`, nothing else). The body is a patch: only the named keys change,
`null` removes a key. Every key is checked; the first bad one is refused with `400
settings_invalid:<key>:<reason>` and nothing is written:

| Key | Accepted |
|---|---|
| `port` | an integer 1–65535 (used from the next start; `--port` wins) |
| `layout_portrait` / `layout_landscape` | the catalog name of a loadable layout of that orientation |
| `landscape_ratio` | a number 0.25–4 |
| `unit_max` | a number 15–45 in steps of 0.5 (15 = the grid's `minPx`) |
| `theme` | `system`, `dark`, `light` |
| `design_variables` | `dark` and `light` objects; names from the table below; a colour as `#rrggbb`, an opacity as 0–1, a blur as `<n>px`, a font as a plain font list |
| `welcome_seen` | `true` / `false` |
| `last_tab` | one of `LAST_TAB_NAMES` (`live`, `layouts`, `settings`, `analysis`) |
| `projects` | an absolute path |
| `windows` | `{"antigravity": {"default": <int>}}`, the default 1000–100000000 |

A save pushes `settings-changed` (`{keys}`) over `GET /events`; the HUD then reloads its settings
(theme, colours, layout pair, limits) without a page reload. A broken `settings.json` is never
overwritten (`500 settings_json_unreadable`).

### The unit in the HUD

- **Portrait:** unit = inner width ÷ 8.
- **Landscape:** unit = inner height ÷ band rows; the band is the layout's row extent, at least 6
  (so 6 rows, 7 for a `standard` landscape layout). Why the height: a landscape band has no
  portrait width to divide, and its height is the one measure fixed in units — a 120 px band gives
  the same 20 px unit as a 160 px strip.
- Both are rounded down to 0.5 px, never go above `unit_max` (22.5 px by default) and never below
  15 px. Inner width 162–163 px → 20 px, 180 px
  → 22.5 px; band height 120 px → 20 px, 135 px → 22.5 px, a 7-row band of 140 px → 20 px.

### Rules for the tiles that fill layouts

- A tile draws exactly `cols × unit` by `rows × unit` pixels and scales its drawing by
  `zoom = unit / 20` (the sketches are drawn at 20 px).
- Commits: only `session.git.commits[]` with `source: "transcript"` count as made in this session;
  `reflog` commits may belong to another session in the same checkout.
- `session.git.dirty` is `null` in this version (not determined). A tile that shows a commit hash
  shows it with that caveat and never claims a clean working tree.

## Versions

Two numbers, kept apart, both in `contract.json`:

- `contractVersion` — this contract. It changes when the render signature, `meta`, the content
  blocks or the field list change. Every tile names the version it was built against.
- `readerVersion` — the reader, which follows the transcript formats of Claude Code and Codex CLI.
  The formats are internal to those tools (Antigravity is read reduced, see `session.provider`); `readerMeasuredAgainst` names the Claude Code version it
  was measured against, `readerAlsoMeasuredAgainst` the Codex version (0.160.1), `readerAlsoMeasuredAgainstAntigravity` the Antigravity CLI version (1.2.17). A format change means a new reader version, not a new contract version.
  `readerVersion` is always equal to `data.version`, the version the reader writes into every
  data sheet; a test holds the two together.

Contract 1.0 covers the data sheet with type versions `session` 2.2 · `live` 1.6 · `turn` 1.3
· `context` 1.0 · `agents` 1.4 (1.3 added `subagents_started`, rule A; `turn` 1.3 and `agents` 1.4 add the explicit "not recorded" gap for subagents and skills, additive). Session 2.1 made `provider` the provider of each session (`claude-code` or `codex`; additive, the shape is unchanged). Session 2.2 adds `antigravity` (additive): a provider that records no usage is a valid session, its optional fields are absent, never estimated. Session 1.2 added `provider`, the start time, `title`, `note`,
`closed`, `closed_at`, `git` and the sheet-level `windows` table. The naming pass (a design
decision) renamed fields in all five types before the first release; only `session`
was bumped to 2.0 as the carrier of the pass, `live` 1.6 · `turn` 1.2 · `context` 1.0 · `agents` 1.2 (since then 1.3)
keep their numbers, and `contractVersion` stayed 1.0 until the style-name pass (below). From the first npm release on, every breaking
rename bumps the type it touches.

**1.1** (style-name pass): the release styles got their final names (`hairline` · `ledger` · `register` · `slab` · `relief` · `splitflap` · `strata`),
the content block `context-glance` became `glance`, the contract gained the `families` key (style family → ordered style list), and every
release tile file follows `<block>-<style>-<orientation>.js`. A shipped tile's `meta.contractVersion` must equal the contract version
(tests hold that), so all shipped tiles name 1.1. Own tiles at 1.0 still load; new own tiles use the new keys
(`glance`, the 1.1 style names).

The package version in `package.json` is the npm release number and is a third, independent number.

## The data

`data` is the reader's data sheet for one session. The table lists every field the reader
delivers: path · meaning · unit · source. **exact** = counted from the transcript (or handed in by
the host, where the meaning says so); **estimated** = depends on a table the transcript does not
carry (the context window size per model). Maps (`…_by_model`, `…_by_agent_type`, `…_by_kind`)
carry data-driven keys (model ids, agent types, token kinds) and grow with the source.

A catalog row may carry one more key, `hint` (optional, in `contract.json` only, not in the table
below): one plain English phrase, at most 60 characters, no rule or route names — the short text the
HUD tip shows instead of the long `meaning` (see "Value marks and the tip"). Every row has one; a row
without `hint` still works (the tip falls back to `meaning`). Adding it is additive: `contractVersion` stays 1.1: the field list, `meta` and the render signature are unchanged; tiles never read `hint`.

Path grammar: `.` steps into an object, `[]` into the entries of a list, and `<key>` stands for
any key of a data-driven object whose inner fields are documented (`windows.<key>.<key>` =
provider, then model id). Maps whose unit starts with `map` are not stepped into at all.
**(optional)** = the field may be missing; marked for the fields from session 1.2 on
(`contract.json` key `optional`). Plain-text fields (`session.title`, `session.note`,
`session.git.commits[].first_line`) are delivered only when the host asks the reader for text.

The values table groups the fields into the numbered values aihud shows and names their home: a
content block, the `analysis-view`, or `later` (not in this version).

### Fields

| Field | Meaning | Unit | Source |
|---|---|---|---|
| `version` | version of the data sheet as a whole | version string | exact |
| `not_delivered` | types or fields the reader could not deliver, by name; a missing value is named here instead of invented | list of names | exact |
| `caveats` | caveats the reader could not verify, as whitespace-free marks | list of marks | exact |
| `windows` | context window size per model the session used, keyed by provider, then model (optional) | object | estimated |
| `windows.<key>` | the models of one provider; key = provider (`claude-code` or `codex`; `antigravity` has no model: its entry `default` is the assumed window: `settings.json windows.antigravity.default`, else the shipped 1,048,576) | object | estimated |
| `windows.<key>.<key>` | window size of one model; key = model id as written; Claude Code: from a model table, it is in no transcript line; Codex: the size its own rollout names (`model_context_window`), a model without a known size is left out; Antigravity: key `default`, the ASSUMED size - the user's (`windows.antigravity.default`) else the shipped 1,048,576 (Google's antigravity-preview model documentation); the transcript names none | tokens | estimated |
| `session` | the session card; missing when the session has no id or no start | object | exact |
| `session.version` | minor version of this type | version string | exact |
| `session.as_of` | when the reader built this sheet | ISO-8601 UTC | exact |
| `session.id` | session id | id | exact |
| `session.model` | model of the main agent, last seen | model id | exact |
| `session.work_ms` | session runtime without the waiting time between turns | milliseconds | exact |
| `session.wait_ms` | sum of the gaps between the end of one turn and the start of the next | milliseconds | exact |
| `session.provider` | provider of this session: `claude-code`, `codex` or `antigravity`. Antigravity records no model, context window or title, and tokens only since CLI 1.2.17 (`input_tokens`/`cache_read_tokens`/`output_tokens` per model step; fill = input + cache_read of the last step; the window is only an assumed size (`settings.json windows.antigravity.default`, else the shipped 1,048,576 from Google's antigravity-preview model documentation, https://ai.google.dev/gemini-api/docs/models/antigravity-preview-09-2026; named `live:window_assumed_by_settings` / `live:window_assumed_by_default`; `live:window_not_recorded_by_antigravity` only if none applies)). For it `session.model`, `session.title`, `session.git` are absent, and for a transcript WITHOUT token fields (CLI 1.2.14) also `windows`, the model/token/context fields of `live` (`tokens_main`, `tokens_total`, `tokens_by_kind`, `tokens_by_model`, `tokens_by_agent_type`, `context_*`, `model`), `turn.turns[].tokens_in`/`tokens_out`/`model`/`tokens_by_model` are absent, never zero, and each gap is named in `not_delivered` (`live:tokens_not_recorded_by_antigravity`, `turn:tokens_not_recorded_by_antigravity`, `context:points_not_recorded_by_antigravity`, `session:model_not_recorded_by_antigravity`) and `context.points` is empty | id | exact |
| `session.started_at` | first timestamp of the session | ISO-8601 UTC | exact |
| `session.title` | sidecar title, else the ai-title Claude Code wrote, or the thread_name of the Codex session index; plain text, only when the host asks for text (optional) | text | exact |
| `session.note` | the user's note from the sidecar; plain text, only when the host asks for text (optional) | text | exact |
| `session.closed` | the user marked the session closed (sidecar) (optional) | boolean | exact |
| `session.closed_at` | when the session was marked closed (sidecar) (optional) | ISO-8601 | exact |
| `session.git` | git state of the session's working directory; missing when neither a repository nor a commit was found (optional) | object | exact |
| `session.git.start_head` | commit HEAD pointed at when the session started, from the reflog or .git/HEAD; missing when not provable (optional) | commit hash | exact |
| `session.git.commits` | commits made in the session's time window, ascending | list | exact |
| `session.git.commits[].sha` | commit hash; abbreviated when only the transcript knows it | commit hash | exact |
| `session.git.commits[].at` | time of the commit (transcript line or reflog entry) (optional) | ISO-8601 UTC | exact |
| `session.git.commits[].first_line` | first line of the commit message, from the reflog; plain text, only when the host asks for text (optional) | text | exact |
| `session.git.commits[].source` | `transcript` = made by this session for sure; `reflog` = in the time window, maybe another session in the same checkout | text | exact |
| `session.git.dirty` | working tree has uncommitted changes; `null` = not determined (the reader starts no git process) | boolean or null | exact |
| `live` | who is running right now; missing when the host did not name device and state | object | exact |
| `live.version` | minor version of this type | version string | exact |
| `live.as_of` | when the reader built this sheet | ISO-8601 UTC | exact |
| `live.instances` | running instances; one in this version | list | exact |
| `live.instances[].device` | name of the machine; given by the host, not read from the transcript | text | exact |
| `live.instances[].state` | state of the instance; given by the host, not read from the transcript | text | exact |
| `live.instances[].session_id` | session id | id | exact |
| `live.instances[].context_percent` | fill level of the main agent's context window at its last reply | percent 0-100, one decimal | estimated |
| `live.instances[].context_window` | size of the main agent's context window; from a model table, it is in no transcript line (Antigravity: only an ASSUMED size - shipped 1,048,576 from Google's antigravity-preview model documentation, https://ai.google.dev/gemini-api/docs/models/antigravity-preview-09-2026, named `live:window_assumed_by_default`, or the user's from settings, `live:window_assumed_by_settings`, in `not_delivered`; a window the transcript itself records (`window_source: file`, assumed field `context_window`) beats both) | tokens | estimated |
| `live.instances[].model` | model of the main agent, last seen | model id | exact |
| `live.instances[].git_branch` | last git branch seen in the session | text | exact |
| `live.instances[].last_activity` | last timestamp of the session | ISO-8601 UTC | exact |
| `live.instances[].tokens_main` | tokens of the main agent alone, all four kinds | tokens | exact |
| `live.instances[].tokens_total` | tokens of the whole session, main agent plus subagents, all four kinds | tokens | exact |
| `live.instances[].tokens_by_model` | tokens_total split by model; keys are the model ids as written | map model id -> tokens | exact |
| `live.instances[].tokens_by_agent_type` | tokens_total split by agent type; key `main` is the main agent | map agent type -> tokens | exact |
| `live.instances[].tokens_by_kind` | tokens_main (main agent only, not the fleet) split by kind: input, output, cache_read, cache_write | map kind -> tokens | exact |
| `turn` | the turns of the session | object | exact |
| `turn.version` | minor version of this type | version string | exact |
| `turn.as_of` | when the reader built this sheet | ISO-8601 UTC | exact |
| `turn.session_id` | session id | id | exact |
| `turn.turns` | one entry per user turn, ascending | list | exact |
| `turn.turns[].number` | turn number, starting at 1 | integer | exact |
| `turn.turns[].started_at` | start of the turn, which is the moment the user wrote | ISO-8601 UTC | exact |
| `turn.turns[].duration_s` | runtime of the turn | seconds | exact |
| `turn.turns[].model` | model of the main agent in this turn | model id | exact |
| `turn.turns[].tokens_in` | tokens that went into the window in this turn: input + cache read + cache write | tokens | exact |
| `turn.turns[].tokens_out` | output tokens of this turn | tokens | exact |
| `turn.turns[].tool_names` | names of the tools used in this turn | list of names | exact |
| `turn.turns[].tool_stats` | tools of this turn with call count and runtime | list | exact |
| `turn.turns[].tool_stats[].tool` | tool name | text | exact |
| `turn.turns[].tool_stats[].count` | number of calls | integer | exact |
| `turn.turns[].tool_stats[].duration` | summed runtime of all calls; missing when no call/result pair was measured | seconds | exact |
| `turn.turns[].tool_calls` | every single tool call of this turn, ascending by start; a call without a timestamp is left out | list | exact |
| `turn.turns[].tool_calls[].tool` | tool name of this call | text | exact |
| `turn.turns[].tool_calls[].started_at` | start of this call | ISO-8601 UTC | exact |
| `turn.turns[].tool_calls[].duration_s` | runtime of this call; missing when no call/result pair was measured | seconds | exact |
| `turn.turns[].tokens_by_model` | tokens of this turn split by model | list | exact |
| `turn.turns[].tokens_by_model[].model` | model id | model id | exact |
| `turn.turns[].tokens_by_model[].tokens_in` | tokens in for this model | tokens | exact |
| `turn.turns[].tokens_by_model[].tokens_out` | tokens out for this model | tokens | exact |
| `turn.turns[].skills` | skills started in this turn; missing when none started | list | exact |
| `turn.turns[].skills[].name` | skill name | text | exact |
| `turn.turns[].skills[].time` | start of the skill | ISO-8601 UTC | exact |
| `turn.turns[].skills[].tokens_in` | tokens in attributed to the skill | tokens | exact |
| `turn.turns[].skills[].tokens_out` | tokens out attributed to the skill | tokens | exact |
| `context` | fill level of the main agent's window over time | object | exact |
| `context.version` | minor version of this type | version string | exact |
| `context.as_of` | when the reader built this sheet | ISO-8601 UTC | exact |
| `context.session_id` | session id | id | exact |
| `context.points` | one point per main-agent reply, ascending by time; subagent points are not mixed in | list | exact |
| `context.points[].time` | time of the reply | ISO-8601 UTC | exact |
| `context.points[].tokens_in_window` | tokens in the window at that reply | tokens | exact |
| `context.points[].percent` | fill level at that reply, against the model table's window size | percent 0-100, one decimal | estimated |
| `context.points[].turn_number` | turn the reply belongs to | integer | exact |
| `agents` | who started whom | object | exact |
| `agents.version` | minor version of this type | version string | exact |
| `agents.as_of` | when the reader built this sheet | ISO-8601 UTC | exact |
| `agents.session_id` | session id | id | exact |
| `agents.subagents_started` | number of subagents started in this session (rule A: every node with a parent counts 1, a collapsed workflow node counts its agent_count); identical with and without a size cap; not the file count of GET /sessions (subagent_count) | integer | exact |
| `agents.nodes` | the main agent (root) and every subagent | list | exact |
| `agents.nodes[].id` | agent id; the root carries the session id | id | exact |
| `agents.nodes[].parent_id` | id of the agent that started this one; missing on the root | id | exact |
| `agents.nodes[].agent_type` | agent type as written in the transcript; `main` on the root, `workflow` on a collapsed run | text | exact |
| `agents.nodes[].tokens_self` | tokens of this agent alone | tokens | exact |
| `agents.nodes[].tokens_total` | tokens of this agent including everything it started | tokens | exact |
| `agents.nodes[].started_in_turn` | main-agent turn in which this agent was started | integer | exact |
| `agents.nodes[].last_activity` | youngest sign of life: last timestamp of the root, last file change of a subagent; the host compares it with its own clock | ISO-8601 UTC | exact |
| `agents.nodes[].agent_count` | number of agents collapsed into this workflow node; only on collapsed runs | integer | exact |

### Values

| # | Value | Fields | Home |
|---|---|---|---|
| 1 | context fill percent and gauge | `live.instances[].context_percent` · `context.points[].percent` | context |
| 2 | total tokens | `live.instances[].tokens_total` · `live.instances[].tokens_by_kind` | tokens · context |
| 3 | tokens per model | `live.instances[].tokens_by_model` | tokens |
| 4 | bars per role | `live.instances[].tokens_by_agent_type` · `agents.nodes[].agent_type` | subagents |
| 5 | main agent vs subagent tokens | `live.instances[].tokens_main` · `live.instances[].tokens_total` | tokens |
| 6 | turn runtime | `turn.turns[].duration_s` · `turn.turns[].started_at` | time |
| 7 | turn number | `turn.turns[].number` | time |
| 9 | session runtime | `session.started_at` · `live.instances[].last_activity` | time |
| 10 | working time without waiting time | `session.work_ms` · `session.wait_ms` | analysis-view |
| 11 | subagent count | `agents.subagents_started` | subagents |
| 12 | session id | `session.id` | header |
| 13 | clock | the viewer's own clock, not a reader field | header |
| 14 | subscription numbers 5 h / 7 days | not in the transcript; statusline only | later |
| 15 | turn detail | `turn.turns[].tokens_in` · `turn.turns[].tokens_out` · `turn.turns[].model` · `turn.turns[].tool_stats` | analysis-view |
| 16 | stacked tokens per model | `turn.turns[].tokens_by_model` · `live.instances[].tokens_by_model` | analysis-view |
| 17 | line over time (tokens / context window) | `context.points[].time` · `context.points[].tokens_in_window` · `context.points[].percent` | analysis-view |
| 18 | line over turns | `context.points[].turn_number` · `context.points[].percent` | analysis-view |
| 19 | half rings per model, role, subagent | `live.instances[].tokens_by_model` · `live.instances[].tokens_by_agent_type` · `agents.nodes[].tokens_self` | tokens · subagents · analysis-view |
| 20 | running model | `session.model` · `live.instances[].model` | analysis-view |
| 21 | context window per model | `live.instances[].context_window` | context · analysis-view |
| 23 | skills: name, count, start, tokens | `turn.turns[].skills[].name` · `turn.turns[].skills[].time` · `turn.turns[].skills[].tokens_in` · `turn.turns[].skills[].tokens_out` | skills · header · analysis-view |
| 24 | three heaviest subagents | `agents.nodes[].tokens_self` · `agents.nodes[].agent_type` · `agents.nodes[].last_activity` | top-three-subagents |
| 25 | user markers | `turn.turns[].started_at` | analysis-view |
| 26 | turn diagram | `turn.turns[].number` · `turn.turns[].tokens_in` · `turn.turns[].tokens_out` · `turn.turns[].duration_s` | analysis-view |
| 27 | tool names with duration | `turn.turns[].tool_stats[].tool` · `turn.turns[].tool_stats[].count` · `turn.turns[].tool_stats[].duration` | analysis-view |

### Value marks and the tip (`data-field`)

Every number a tile shows can be explained by hovering it. The explanation has ONE home: the
catalog above (`contract.json` key `fields`, served by the node at `/contract.json`). The tile
only says WHICH field a value comes from; the HUD window draws the tip.

- **The mark:** the element that shows a value carries `data-field="<path>"`, the `path` of its
  catalog row written exactly as in the table (`[]` and `<key>` included, e.g.
  `live.instances[].context_percent`, `windows.<key>.<key>`). It names the field the value was
  actually read from: a tile that fell back from `live.instances[].context_percent` to
  `context.points[].percent` marks the second. Any element may carry it (HTML or SVG `<text>`).
- **Two fields, one value:** a value computed from several fields (session runtime =
  `session.started_at` · `live.instances[].last_activity`) lists their paths separated by one
  space; the tip shows one entry per path. A value with no reader field (the clock) carries no
  mark.
- **The tip:** on hover or keyboard focus of a marked element, the HUD window (not the tile)
  shows, for each path, the catalog row's `hint` (a short phrase; a row without `hint` falls back to
  its `meaning`), then its `unit` and its `source` — `exact` as is, `estimated` with a leading `≈`.
  It shows the catalog's words as they are; it never rewrites them. The tip is a bubble at the value
  with a small pointer: in portrait above or below the value, in landscape beside it. It stays inside
  the window: in portrait it never gets wider than the strip, in landscape never higher than the
  band. It goes away when the pointer leaves, the focus leaves, Escape is pressed or the tile
  redraws. Keyboard focus reaches a value only if the tile makes it focusable (`tabindex`); the HUD
  adds none.
- **No tip text for values in the tile:** a tile sets no `title`, `aria-description` or own
  tooltip that explains a value — a second text would be a second truth. A path that is not in the
  catalog is a tile error (no tip is shown for it). A title that carries the value itself in full
  (a cut name, the name behind an icon, the full id) is not an explanation and stays, next to the
  mark. A count drawn from a list field marks the list path, whatever span the tile counts over.
- **A not-recorded field:** if the catalog row has a `gap` and the sheet names it in `not_delivered`, the tip shows `not provided by <Provider>` instead of the hint, without unit and source (see "Fields a provider does not record").
- **System hints stay in the tile:** what the tile itself knows and the catalog cannot —
  `not delivered: …` stays the tile's own `title`; control labels such as `switch session` go into `aria-label` (no native tooltip stacks on the tip).
- **Unit:** the catalog `unit` is the unit of the data field, not of the drawn form (a tile may draw
  `duration_s` as `3:41` or `total` tokens as `412k`); the tip names the data unit.

### Fields a provider does not record

Claude Code and Codex deliver every field. Antigravity records no tokens, model, context window or
title (see `session.provider`): the reader leaves those fields out and names each gap in
`not_delivered` as `<type>:<field>_not_recorded_by_<provider>`. Such a field is **not recorded**, which
is not the same as zero or "none yet": a tile never draws a number, an estimate or an empty chart for
it that could be read as "nothing happened", and it never draws the hint text either. **A not-recorded
field is drawn as a dash `–` (en dash) in `color:var(--aihud-absent)` (SVG: `fill:var(--aihud-absent)`),
and that dash keeps its `data-field` mark.** The tip says why: for a marked path whose catalog row has
a `gap` that the sheet names in `not_delivered`, the HUD shows `not provided by <Provider>` (display
name: `Antigravity`, `Codex`, `Claude Code`; an unknown provider id only if it is `[a-z0-9-]{1,40}`, else
`this provider`) instead of the catalog hint, without unit and source line. The tile does not know
the sentence and carries no provider text.

**One truth for which field belongs to which gap:** every catalog row that a gap covers has the
optional key `gap` (`contract.json` key `fields`, e.g. `"gap": "live:tokens"`; a row may list several, `"gap": ["live:tokens", "live:window"]`, one named gap is enough). The seven pairs:

| `gap` | What is not recorded |
|---|---|
| `live:tokens` | token totals, split, per model, per role, context fill and window, the live model |
| `live:window` | the context window size and fill percent (`context_window`, `context_percent`) when tokens are recorded but no window is known (Antigravity without a settings window) |
| `turn:tokens` | per-turn tokens, model and per-model tokens |
| `context:points` | the context series (`context.points` is empty) |
| `session:model` | `session.model` |
| `agents:subagents` | the subagent counter (`agents.subagents_started`); `agents.nodes` stays delivered (the root node) |
| `turn:skills` | the skill fields of the `turn` type |

Antigravity writes no record of subagents or skills, so the reader reports them as not recorded
instead of as zero. On an Antigravity session `agents.subagents_started` and `turn.turns[].skills` are
absent (never `0`, never an empty list), and `not_delivered` names
`agents:subagents_not_recorded_by_antigravity` and `turn:skills_not_recorded_by_antigravity`.
`agents.nodes` still carries the main agent. A tile reading these fields draws the violet dash (the
tip says "not provided by Antigravity"). The change is additive: `turn` is now 1.3 and `agents`
1.4; Claude Code and Codex sheets are unchanged.

A **delivered but limited** value stays a number and gets no `≥` or mark in the tile: Antigravity's
turn duration (a lower bound, `antigravity_turn_end_is_start_of_last_step`) and whole-second tool
durations (below) are drawn as they are.

Tiles are standalone and import nothing, so the helpers are snippets you paste into your tile as they
are. The shipped tiles carry exactly this text; a test holds every copy identical to this block.
The question "is it not recorded?" has one snippet (the pairs are the table above):

```js
// aihud:not-recorded v1
const notRecorded = (d, type, field) => !!(d && Array.isArray(d.not_delivered) && d.not_delivered.some((n) => typeof n === 'string' && n.startsWith(type + ':' + field + '_not_recorded_by_')));
```

`notRecorded(data, 'live', 'tokens')` is `true` when the provider does not record the field (and `false`
when it does, when `data` is empty, or when the reader delivered nothing at all: then the usual `–`
stays, in its usual faint colour).

**A place that shows one value** (a figure, a gauge number, a table cell): the element that would show
the value shows `–` instead, `color:var(--aihud-absent)` (SVG `<text fill="var(--aihud-absent)">`),
and keeps its `data-field="<path>"`. Example: `fig.textContent = '–'; fig.style.color = 'var(--aihud-absent)';
fig.setAttribute('data-field', 'live.instances[].tokens_total');`.

**A tile that has nothing left to show without these fields** (a context gauge, a token total) keeps its
frame and shows only its caption and one dash under it. `node` is the frame element whose content is
replaced (the element that carries the panel background), `field` the path(s) of the missing value
(the mark), `z` is `unit / 20`; the dash is 22 sketch px high, heavy, centred:

```js
// aihud:absent-only v1
const absentOnly = (node, caption, field, z) => {
  const doc = node.ownerDocument, part = (css, t) => { const e = doc.createElement('div'); e.style.cssText = css + ';line-height:1.25'; e.textContent = t; return e; };
  const dash = part('font-size:' + 22 * z + 'px;font-weight:650;color:var(--aihud-absent)', '–');
  dash.setAttribute('data-field', field);
  node.style.cssText += ';box-sizing:border-box;display:flex;flex-direction:column;align-content:center;justify-content:center;align-items:center;text-align:center;gap:' + 2 * z + 'px;padding:' + 4 * z + 'px';
  node.replaceChildren(part('font-size:' + 9 * z + 'px;letter-spacing:.06em;text-transform:uppercase;color:var(--aihud-faint);font-weight:400', caption), dash);
};
```

The two former snippets `// aihud:provider-hint v2` and `// aihud:hint-only v1` (hint text in the
tile, via `providerHint` / `hintOnly`) are **replaced** by the two above and no shipped tile carries
them any more; a tile uses `notRecorded` / `absentOnly` only, and draws no provider text.

Durations: a provider that measures whole seconds only says so in `caveats` (Antigravity:
`antigravity_prose_timestamps_second_resolution_unchecked`); there a `0` means "under one second", not
"zero". A tile that prints call durations shows it as `<1s` and only then; for every other provider `0`
stays what it is. Paste this snippet for it:

```js
// aihud:whole-seconds v1
const wholeSeconds = (d) => !!(d && Array.isArray(d.caveats) && d.caveats.some((c) => typeof c === 'string' && c.includes('_second_resolution')));
```

The turn duration of Antigravity is a lower bound (`antigravity_turn_end_is_start_of_last_step`): the
real turn ended later. Never claim more than the sheet says.

### Session switch (header tile)

The HUD shows ONE session. The header tile may offer a plain list to switch it; the list hangs on
the header tile (no tile of its own, no picker in the HUD).

**`data.hud`** is HUD-side data, not part of the reader contract (it is not in the fields table and
not in `contract.json`). The HUD sets it on the data object before every render:

```
data.hud = {
  current: '<session_id>' | null,   // the session shown now
  pinned: true | false,             // true: chosen by a click or from /hud?session=, false: following the youngest
  sessions: [{ session_id, project_slug, age_seconds, title }],   // title = sidecar title, else null
}
```

**Switching:** a tile dispatches a bubbling event on its own element; the HUD listens once on the grid.

```js
el.dispatchEvent(new CustomEvent('aihud:select-session', { bubbles: true, detail: { session_id } }));
```

- A `session_id` pins that session: the HUD loads its data and redraws every tile.
- `detail.session_id = null` (or `detail.follow = true`) unpins: back to following the youngest
  session of the start folder.
- While pinned, `sessions-changed` refreshes `data.hud.sessions` but keeps the pinned session; if
  the pinned session vanished from the list, the HUD unpins by itself. A session id that is not
  in the list counts as vanished.

### Sizes

| Content block | standard portrait | standard landscape | minimal portrait | minimal landscape | fancy-a portrait | fancy-a landscape | fancy-b portrait | fancy-b landscape |
|---|---|---|---|---|---|---|---|---|
| header | 8×2 | 8×2 | 8×2 | 10×2 | 8×2 | 10×2 | — | — |
| context | 8×6 | 8×7 | 8×7 | 7×6 | 8×7 | 6×6 | 8×7 | 6×6 |
| top-three-subagents | 8×4 | 7×7 | 8×5 | 6×6 | 8×4 | 11×6 | 8×4 | 10×6 |
| time | 8×3 | 8×5 | 8×3 | 10×4 | 8×5 | 10×4 | 8×5 | 10×4 |
| tokens | 8×11 | 16×7 | 8×7 | 10×6 | 8×7 | 14×6 | — | — |
| subagents | 8×7 | 8×7 | 8×6 | 9×6 | 8×7 | 14×6 | 8×7 | 14×6 |
| skills | 8×4 | 8×7 | 8×3 | 7×6 | — | — | 8×4 | 8×6 |
| *layout* | 8×37 | 57×7 | 8×33 | 49×6 | 8×36 | 63×6 | 8×36 | 62×6 |

fancy-b ships only context, top-three-subagents, subagents, time, skills; fancy-a ships everything
but skills. A `—` cell is `null` in `contract.json`; the layouts of that style place the twin
style's tile of that block at the same place (same size).
The standard layouts place the backlight context tile (`context-backlight-*`, 8×6 portrait, 10×6
landscape) in the context slot instead of `context-standard-*`.

### Sizes of the release styles

Each row is one block × style, with its portrait and its landscape tile (48 rows, 96 tiles).
The layouts above were transcribed from the first four styles only; the release styles carry no
layout row, except `essentials`: layouts `essentials-portrait` 8×28 and `essentials-landscape` 48×7. A portrait tile of a release style may be narrower than the 8-column grid
(`subagents` × `ledger`: 6 wide).
The subagent count of every tile is `agents.subagents_started` (rule A), read and never counted in
a tile. register and mosaic draw one glyph per node of `agents.nodes[]` that has a `parent_id`: a
node without own tokens is a quiet glyph (`--aihud-faint` outline), a collapsed workflow node is ONE
glyph labelled ×`agent_count`; ledger shows the number only. Known limit: register cuts its dot row
at roughly 110 subagents (landscape) / 100 (portrait) — above that the number stays right, the dots
do not all show.

| Content block | Style | portrait | landscape |
|---|---|---|---|
| header | cellwork | 8×3 | 16×2 |
| header | column | 8×2 | 13×2 |
| header | bauhaus | 8×1 | 8×1 |
| header | splitflap | 8×3 | 18×2 |
| header | essentials | 8×3 | 18×2 |
| context | slab | 8×2 | 3×5 |
| context | calibre | 8×3 | 5×5 |
| context | redline | 8×6 | 11×6 |
| context | backlight | 8×6 | 10×6 |
| context | mosaic | 8×6 | 12×6 |
| context | essentials | 8×7 | 10×6 |
| top-three-subagents | slab | 8×4 | 6×5 |
| top-three-subagents | register | 8×3 | 10×3 |
| top-three-subagents | calibre | 8×4 | 7×7 |
| top-three-subagents | backlight | 8×5 | 10×6 |
| top-three-subagents | blueprint | 8×6 | 13×4 |
| top-three-subagents | strata | 8×3 | 5×6 |
| time | numeral | 8×4 | 10×5 |
| time | splitflap | 8×9 | 16×6 |
| time | essentials | 8×4 | 18×5 |
| tokens | hairline | 8×3 | 11×2 |
| tokens | ledger | 8×6 | 10×5 |
| tokens | seismograph | 8×10 | 16×6 |
| tokens | column | 8×4 | 11×6 |
| tokens | particle | 8×12 | 16×6 |
| tokens | strata | 8×8 | 12×6 |
| tokens | essentials | 8×11 | 16×7 |
| subagents | ledger | 6×3 | 9×2 |
| subagents | register | 8×5 | 9×5 |
| subagents | mosaic | 8×3 | 4×6 |
| subagents | essentials | 8×3 | 4×6 |
| skills | numeral | 8×6 | 12×6 |
| skills | cellwork | 8×5 | 12×6 |
| skills | particle | 8×4 | 8×6 |
| glance | hairline | 8×4 | 11×3 |
| glance | numeral | 8×5 | 12×5 |
| glance | backlight | 8×5 | 10×5 |
| glance | relief | 8×6 | 12×5 |
| glance | particle | 8×8 | 11×6 |
| trace | seismograph | 8×8 | 16×6 |
| trace | mosaic | 8×7 | 16×6 |
| tools | slab | 8×5 | 11×5 |
| tools | redline | 8×8 | 15×6 |
| tools | cellwork | 8×7 | 18×6 |
| tools | splitflap | 8×9 | 18×6 |
| active-time | ledger | 8×5 | 10×3 |
| active-time | column | 8×4 | 12×6 |
| active-time | blueprint | 8×5 | 13×4 |

### Design variables

| Variable | Meaning | Dark | Light |
|---|---|---|---|
| `--aihud-bg` | strip background | `#0b0d10` | `#eef0f3` |
| `--aihud-panel` | tile surface | `#13161b` | `#ffffff` |
| `--aihud-line` | borders and separators | `#232830` | `#e1e4e8` |
| `--aihud-line-2` | faint separators, empty bar tracks | `#1c2027` | `#eceef1` |
| `--aihud-text` | main text and main numbers | `#e6e8eb` | `#1a1d21` |
| `--aihud-dim` | labels and secondary text | `#8a929c` | `#5f6873` |
| `--aihud-faint` | hints, empty states | `#4a525c` | `#a0a7b0` |
| `--aihud-main` | the main agent's share | `#cfd6df` | `#3b4350` |
| `--aihud-sub` | the subagents' share | `#6b7580` | `#9aa3ad` |
| `--aihud-role` | per-role bars | `#7d8896` | `#7d8896` |
| `--aihud-series-1` | first data series (e.g. largest model) | `#8fb3ff` | `#3d6fe0` |
| `--aihud-series-2` | second data series | `#5d7fd6` | `#6b8fe6` |
| `--aihud-series-3` | third data series | `#3a5596` | `#a9bff2` |
| `--aihud-font` | text font | `system-ui, -apple-system, Segoe UI, sans-serif` | `system-ui, -apple-system, Segoe UI, sans-serif` |
| `--aihud-font-mono` | ids and numbers in columns | `ui-monospace, Consolas, monospace` | `ui-monospace, Consolas, monospace` |
| `--aihud-radius` | corner radius of panels | `6px` | `6px` |
| `--aihud-radius-small` | corner radius of bars and chips | `2px` | `2px` |
| `--aihud-heat-0` | heat scale, stop 0 % (fill: gauge blocks, rings, columns, glow) | `#ffffff` | `#c9ced4` |
| `--aihud-heat-30` | heat scale, stop 30 % | `#ffd21f` | `#e0a800` |
| `--aihud-heat-50` | heat scale, stop 50 % | `#ff8c1a` | `#f07800` |
| `--aihud-heat-75` | heat scale, stop 75 % | `#e8301c` | `#d8261a` |
| `--aihud-heat-100` | heat scale, stop 100 % | `#a0001a` | `#8b0016` |
| `--aihud-heat-text-0` | heat scale for numbers, needles and thin strokes, stop 0 % | `#ffffff` | `#7d8590` |
| `--aihud-heat-text-30` | heat scale for numbers, stop 30 % | `#ffd21f` | `#a87d00` |
| `--aihud-heat-text-50` | heat scale for numbers, stop 50 % | `#ff8c1a` | `#d96500` |
| `--aihud-heat-text-75` | heat scale for numbers, stop 75 % | `#e8301c` | `#d8261a` |
| `--aihud-heat-text-100` | heat scale for numbers, stop 100 % | `#a0001a` | `#8b0016` |
| `--aihud-heat-rest` | opacity of a heat-coloured part not reached yet (the gauge's unlit blocks) | `0.13` | `0.18` |
| `--aihud-glow` | blur of the glow around a heat-coloured ring (drop-shadow; 0 = no glow) | `3px` | `0px` |
| `--aihud-glow-core` | opacity of the glow inside a ring at its centre | `0.45` | `0.38` |
| `--aihud-glow-mid` | opacity of the glow inside a ring at a third of its radius | `0.16` | `0.12` |
| `--aihud-glow-halo` | opacity of the blurred halo along a glowing rim | `0.22` | `0.12` |
| `--aihud-role-1` | largest role part (agent type) | `#c9b8ff` | `#6d4fd1` |
| `--aihud-role-2` | second role part | `#9d86f0` | `#9479e6` |
| `--aihud-role-3` | third role part (or the rest) | `#6f5bc4` | `#c2b2f2` |
| `--aihud-absent` | a value the provider does not record (drawn as a dash `–`; light measured against `#ffffff` 5.70:1 and `#eef0f3` 4.99:1) | `#a78bfa` | `#7c3aed` |

### Heat

The heat scale is the accepted sketch's gauge scale, taken over exactly:
every value in the table above is copied from the sketches, none is derived. Dark numbers use the
fill stops (the sketches do the same); light numbers have their own, darker stops so they read on
white. The glow exists in dark only (`--aihud-glow: 0px` in light), as in the sketches; the tip of a
glowing ring glows at 5/3 of it.

**The heat function** — the ONE way every style turns a value `v` (percent) into a colour, the
sketch's colour function in CSS terms, so every style draws the same colour for the same value:

1. clamp `v` to 0…100;
2. take the two neighbouring stops `a < b` of 0 · 30 · 50 · 75 · 100 with `a < v ≤ b` (`v = 0` → `a = 0`, `b = 30`);
3. colour = `color-mix(in srgb, var(--aihud-heat-<a>) p%, var(--aihud-heat-<b>))` with
   `p = (b − v) / (b − a) × 100`, written with one decimal.

`in srgb` mixes the stored channel values in a straight line, as the mockup's heat colour function does. Surfaces (gauge
blocks, rings, columns, the glow) use the `--aihud-heat-*` stops; numbers, needles and thin strokes
use the same function over the `--aihud-heat-text-*` stops. A tile carries the function as a small
local helper (tiles share no code). What a tile colours by is the value the sketch coloured by: the
context fill for the context gauge, tank, ring and glow; for the three heaviest subagents the value
each of them shows (its share of the session's tokens); a part drawn at a fixed position (a gauge
block, a ring piece) takes the colour of its position, as in the sketch. An empty value stays a dash in
`--aihud-faint`; heat colours stand only for delivered values.

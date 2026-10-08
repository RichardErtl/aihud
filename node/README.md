# aihud node

The small local server behind the HUD. One Node process, built-ins only, bound to `127.0.0.1`.
Start it with `npx aihud serve`; it opens no browser.

## The window — bare `npx aihud`

`npx aihud [--tab]` starts the node and opens `http://localhost:<port>/hud` (`launch.js`). If an
aihud node already answers on the port (`GET /` with `name: "aihud"`), it only opens the window and
exits 0. App window: the first of Chrome → Edge → Chromium found (per OS candidate list in
`launch.js`), or the binary in `AIHUD_BROWSER` (beats the search), started detached as
`<browser> --app=<url> --window-size=200,900 --user-data-dir=<aihud home>/browser --no-first-run --no-default-browser-check` (own profile,
no extensions; closing the node leaves the window alone). A normal tab via the OS opener
(`start` / `open` / `xdg-open`) instead, with a console hint that a tab never gets narrower than
500 px, when `--tab` is set, nothing is found, the browser is Firefox or a Snap/Flatpak build
(not supported until measured), or the browser fails (error, or exit ≠ 0 within 2 s).
On Linux with neither `DISPLAY` nor `WAYLAND_DISPLAY` (SSH, headless) neither window nor tab:
one line names the missing display and the node URL, the node keeps running.

## Folders

| What | Default | Override |
|---|---|---|
| transcripts (read only) | `~/.claude/projects` | `--projects <dir>` · `AIHUD_PROJECTS` |
| Codex sessions (read only) | `~/.codex` (`sessions/**/rollout-*.jsonl` + `session_index.jsonl`), read only when `--projects` is the default `<home>/.claude/projects` (its sibling) | `createNode({ codex })` · `AIHUD_CODEX` (a `.codex` folder); absent folder = nothing happens |
| Antigravity sessions (read only) | `~/.gemini/antigravity-cli` (`brain/<id>/.system_generated/logs/transcript.jsonl`), read only when `--projects` is the default `<home>/.claude/projects` (its sibling); `transcript_full.jsonl` and `chunks/` are ignored | `createNode({ antigravity })` · `AIHUD_ANTIGRAVITY` (the `antigravity-cli` folder); absent folder = nothing happens; sheets carry no tokens, `not_delivered` says so |
| aihud home (settings, sidecars, own tiles/layouts/svg) | `~/.aihud` | `--home <dir>` · `AIHUD_HOME` |

`AIHUD_HOME` names the aihud folder itself (it replaces `~/.aihud`, it is not a user home).
The node writes **only** inside the aihud home, never under `~/.claude/`: every write target is
checked by path and by real path (a link inside the home that points outside is refused), and
`serve` refuses to start (exit 1) when the aihud home lies inside a `.claude` folder or inside the
transcript folder.

## Endpoints (JSON unless noted)

| Route | Answer |
|---|---|
| `GET /` | name, freshness mode, `paths` (`home`, `projects`, `svg` — the node's folders, read-only, for the window's Settings), endpoint list |
| `GET /sessions` | `{as_of, start_slug, start_dir_name, current, current_from, sessions: [{session_id, project_slug, mtime, mtime_ms, age_seconds, bytes, subagent_count, sidecar?}]}` — youngest first; `start_slug` is the transcript folder slug of the directory the node was started in, `start_dir_name` that directory's plain basename (additive; local only, used for the HUD/window fallback hint), `current` the youngest session in that folder (drive letter compared case-insensitive); when that folder has none, the youngest session overall (fallback); `null` only when the list is empty. `current_from` names the rule that picked it: `"start_folder"`, `"newest"` (fallback; the HUD then shows `no session in <folder> — showing newest`), or `null` (no session at all). The list is recomputed per call, so `current` returns to the start folder as soon as it has a session; a HUD pin is unaffected. `sidecar` is the session's sidecar as the reader reads it, **with its title and note text** — this list is local only and is NOT leak-checked |
| `GET /sessions/<id>` | the reader's contract for that session (`reader/contract.js`), built with the reader's extras (`reader/extras.js readExtras`: sidecar, ai-title, git state) in `withText` mode, so `session.title` · `note` · `closed` · `closed_at` and commit first lines travel; `live.instances[0].state` is `awake` (written to within 180 s), `quiet`, or `closed` (sidecar says so). Unknown id → 404. The answer passes the reader's leak check first (`withText`: only strings under `title` · `note` · `first_line` are exempt); a failed check is a 500 with the violation paths, never a silent 200 |
| `POST /sessions/<id>/sidecar` | merges the body into the sidecar, answers the merged sidecar |
| `GET /settings` | `<home>/settings.json` merged over the defaults `{"port": 4747, "layout_portrait": "essentials-portrait", "layout_landscape": "essentials-landscape", "landscape_ratio": 1, "unit_max": 22.5}`; a broken file is a 500 — and the node refuses to START on a broken `settings.json` (`settings_json_unreadable`) whenever it reads the file at start: for `port` without `--port`, for `projects` without `--projects`/`AIHUD_PROJECTS` |
| `POST /settings` | merges a patch into `<home>/settings.json` (only the named keys; `null` removes one) and answers the settings as `GET /settings` reads them; every key is checked (`tiles/CONTRACT.md` §Settings), the first bad one → `400 settings_invalid:<key>:<reason>`, nothing written; a broken file is never overwritten (500); pushes `settings-changed` `{keys}`. Same fences as `POST /layouts` |
| `GET /catalog` | `{entries: [...]}` — see below |
| `POST /layouts` | stores a layout, answers `201 {slug, path, replaced}` |
| `GET /svg` | `[{name, own, url}]` — `aihud/svg/*.svg` and `<home>/svg/*.svg`, an own file shadows a shipped one of the same name |
| `GET /svg/<name>.svg` | the file (`image/svg+xml`) |
| `GET /events` | Server-Sent Events, see below |
| `GET /hud` | the HUD page (`aihud/hud/index.html`); `/hud/hud.js`, `/hud/draft-overlay.js` and `/hud/hud.css` are its files — a fixed list, nothing else under `/hud/`. `/hud?layout=<name>` shows that one layout (by catalog name) in both window shapes instead of the settings pair; `/hud?session=<id>` starts pinned on that session. A click on the HUD (not on a tile's own control) opens `/window?session=<current id>` |
| `GET /composer` | the composer page (`aihud/composer/index.html`), where a user arranges tiles into a layout and saves it through `POST /layouts`; `/composer/composer.js` and `/composer/composer.css` are its two files — a fixed list, nothing else under `/composer/` |
| `GET /window` | the window page (`aihud/window/index.html`), four tabs: Live · Layouts · Settings · Analysis, with Start in front until the intro is done. Live (the settings' landscape layout, drawn by the HUD itself in a frame, on the window's session) · Layouts (the layout pair as cards drawn to scale — own layouts first, newest saved first, then the shipped ones in style order; the probe pair is not offered — plus the composer link; saved with the other settings) · Analysis (the value catalog: one row per `fields` entry of `contract.json` — path · meaning · unit · source · live value of the session; `—` = not delivered, `estimated *` marks estimated fields; a `[]`/`<key>` path shows the first element that carries a value and names it under the value) · Settings (one page, five sections — Colours · Size · Folders & port · About · Guide —, every change saved on its own through `POST /settings`, only the changed keys: layout limits, port, transcript folder, theme, one field per design variable and theme with a dark + light preview; the role SVG folder `<home>/svg` shown read-only). Until the intro is finished a first tab Start (three steps; Skip or Done sets `welcome_seen` and `last_tab` = layouts; Start is never a stored `last_tab`) opens ahead of the memory, a valid hash still wins; Analysis wears a permanent 30-day badge; the last Settings section Guide holds "Show introduction again" in its header (sets `welcome_seen` false) plus short guide texts. `?session=<id>` picks the session, else the one the HUD shows by default (`current`); `#live`/`#layouts`/`#settings`/`#analysis` picks the tab, else the remembered `last_tab`, else Live. `/window/window.js` and `/window/window.css` are its two files — a fixed list |
| `GET /contract.json` | the shipped `aihud/tiles/contract.json` (the window builds its catalog out of it) |
| `GET /tiles/<name>.js` | the module of the tile with that catalog name (`text/javascript`), own before shipped; `?v=…` ignored; not a tile → 404, unloadable → 500 (details in §The HUD below) |
| `GET /layouts/<name>` | the layout file with that catalog name (JSON as stored), own before shipped; unknown → 404 |
| `POST /layouts/draft` | the composer's live draft: memory only, broadcast as `layout-draft`; `{end: true}` ends it, 15 s without a renewal ends it too (same guards as `POST /layouts`) |
| `DELETE /layouts/<name>` | moves an own layout to `<home>/layouts/trash/`, hides a shipped one with a marker there; settings that named it fall back to the default layout (same fences as `POST /layouts`, unknown → 404) |

POST bodies must be sent as `Content-Type: application/json` (415 otherwise). Requests whose
`Host` is not `localhost` / `127.0.0.1` / `[::1]` with the node's port are refused with 403. A
POST that carries an `Origin` header other than `http://localhost:<port>`,
`http://127.0.0.1:<port>` or `http://[::1]:<port>` is refused with 403 (no `Origin`, e.g. from
`aihud close`, is allowed).
Errors are `{"error": "<reason>"}` with a 4xx/5xx status.

## Sidecar — `<home>/sessions/<sessionId>.json`

```json
{ "title": "string", "note": "string", "closed": true, "closed_at": "2026-09-30T21:00:00.000Z" }
```

All four keys optional. A POST may carry only these keys (anything else → 400), `title`/`note`
strings up to 2000 characters, `closed` boolean, `closed_at` ISO-8601. The session must exist in
the transcript folder (404 otherwise). The node only WRITES the sidecar; reading it (also for the merge) is the reader's job (`reader/extras.js readSidecar`). A sidecar the reader cannot read is never overwritten (500); fields the reader drops (wrong type, unknown key) do not survive a write.

## Layouts — `<home>/layouts/<slug>.json`

Body `{name, orientation: "portrait" | "landscape", tiles: [...]}` — exactly these three keys.
`name` (1–64 characters, no `/`, `\`, `..`) becomes the file slug (`"Night Strip"` →
`night-strip.json`); saving the same name again replaces the file (`replaced: true`). The body is
checked against the layout schema before anything is written (see §Layout schema below; the first violation answers `400 layout_invalid:<path>:<reason>`).

## Catalog — `GET /catalog`

```json
{ "entries": [
  { "name": "mine", "path": "/home/me/.aihud/tiles/mine.js", "own": true, "kind": "tile",
    "loadable": true, "meta": { "name": "mine", "orientation": "portrait", "sizes": [{ "cols": 2, "rows": 1 }] } },
  { "name": "night-strip", "path": "/home/me/.aihud/layouts/night-strip.json", "own": true, "kind": "layout",
    "loadable": true, "meta": { "orientation": "landscape" } }
] }
```

Sources: `aihud/tiles/*.js|*.mjs` and `aihud/layouts/*.json` (shipped, `own: false`),
`<home>/tiles/*.js|*.mjs` and `<home>/layouts/*.json` (`own: true`). Test files (`*.test.js`) and
other file types are skipped. Order: own first, then tiles before layouts, then by name.

- `name` — the file name without extension · `path` — absolute path of the file · `mtime_ms` — the
  file's modification time in ms (read only; the window and the composer order own entries newest
  first by it)
- tiles: the file is **imported** — shipped tiles and your own tiles under `~/.aihud/tiles/`
  alike, so their top-level code runs inside the node when the catalog is built. A file counts as
  a tile only if it exports `render` (a function) and `meta` (a plain object), as
  `tiles/CONTRACT.md` requires; `meta` is copied as is. A module that imports fine but lacks
  that pair (for example `tiles/cli.js`) is **left out** of the catalog. A file that fails to
  import is listed with `loadable: false` and a one-line `error`, so a broken tile stays visible.
- layouts: `meta.orientation` from the JSON; unreadable JSON → `loadable: false`.

## Events — `GET /events`

| Event | Data | When |
|---|---|---|
| `hello` | `{sessions, freshness}` | on connect |
| `session-updated` | `{id, mtime, mtime_ms}` | a session's transcript (or one of its subagent files) changed |
| `sessions-changed` | `{count}` | a session appeared or vanished, or a sidecar was written |
| `catalog-changed` | `{slug}` | a layout was saved or deleted |
| `settings-changed` | `{keys}` | settings were written (a Save in the window, or a deleted layout the settings used) |
| `layout-draft` | `{orientation, cols, rows, tiles}` or `{end: true}` | the composer's live draft (memory only) changed, was renewed or ended; sent to a new client right after `hello` while one is alive — `tiles/CONTRACT.md` §"The composer's draft and the delete" |

A comment line (`: ping`) keeps the stream open every 20 s.

Freshness: `fs.watch` (recursive) on the transcript folder, events on a known session are
answered with a stat of that session only. A full mtime scan runs every 10 s as a backstop, every
2 s if the watch fails, or every `--poll <ms>` when the watch is switched off (`AIHUD_POLL_MS`).
Measured on Windows: `session-updated` arrives about 110 ms after a line is appended (watch) and
about 700 ms with `--poll 1000`.

## The HUD and the layout check

This section supersedes one sentence above: `POST /layouts` **does** check the layout schema now.

- **`POST /layouts`** — after the key and name checks above, the body is checked against the
  layout schema (`tiles/CONTRACT.md` §Layouts, `node/layout-schema.js`) and the tile catalog:
  placements are exactly `{tile, col, row}`, the tile must be in the catalog and loadable, it sits
  at its `meta.sizes[0]` and must have the layout's orientation, portrait placements fit 8
  columns, landscape placements fit the 7-row band, no two overlap; an optional `form: {cols, rows}` (portrait `cols` = 8, landscape `rows` ≤ 7, every tile inside it) is stored as sent. The first violation is `400 {"error": "layout_invalid:<path>:<reason>"}`;
  nothing is written. Host, Origin (403) and content type (415) guards run first, unchanged.
- **`GET /settings`** — the defaults are `{"port": 4747, "layout_portrait": "essentials-portrait",
  "layout_landscape": "essentials-landscape", "landscape_ratio": 1, "unit_max": 22.5}` (the HUD opens on the Essentials layouts; the probe pair stays available by name).

Routes the HUD needs (all `GET`, same guards as every route):

| Route | Answer |
|---|---|
| `GET /hud` | the HUD page (`aihud/hud/index.html`); `/hud/hud.js`, `/hud/draft-overlay.js` and `/hud/hud.css` are its files — a fixed list, nothing else under `/hud/`. `/hud?layout=<name>` shows that one layout (by catalog name) in both window shapes instead of the settings pair; `/hud?session=<id>` starts pinned on that session. A click on the HUD (not on a tile's own control) opens `/window?session=<current id>` |
| `GET /composer` | the composer page (`aihud/composer/index.html`), where a user arranges tiles into a layout and saves it through `POST /layouts`; `/composer/composer.js` and `/composer/composer.css` are its two files — a fixed list, nothing else under `/composer/` |
| `GET /window` | the window page (`aihud/window/index.html`), four tabs: Live · Layouts · Settings · Analysis, with Start in front until the intro is done. Live (the settings' landscape layout, drawn by the HUD itself in a frame, on the window's session) · Layouts (the layout pair as cards drawn to scale — own layouts first, newest saved first, then the shipped ones in style order; the probe pair is not offered — plus the composer link; saved with the other settings) · Analysis (the value catalog: one row per `fields` entry of `contract.json` — path · meaning · unit · source · live value of the session; `—` = not delivered, `estimated *` marks estimated fields; a `[]`/`<key>` path shows the first element that carries a value and names it under the value) · Settings (one page, five sections — Colours · Size · Folders & port · About · Guide —, every change saved on its own through `POST /settings`, only the changed keys: layout limits, port, transcript folder, theme, one field per design variable and theme with a dark + light preview; the role SVG folder `<home>/svg` shown read-only). Until the intro is finished a first tab Start (three steps; Skip or Done sets `welcome_seen` and `last_tab` = layouts; Start is never a stored `last_tab`) opens ahead of the memory, a valid hash still wins; Analysis wears a permanent 30-day badge; the last Settings section Guide holds "Show introduction again" in its header (sets `welcome_seen` false) plus short guide texts. `?session=<id>` picks the session, else the one the HUD shows by default (`current`); `#live`/`#layouts`/`#settings`/`#analysis` picks the tab, else the remembered `last_tab`, else Live. `/window/window.js` and `/window/window.css` are its two files — a fixed list |
| `GET /contract.json` | the shipped `aihud/tiles/contract.json` (the window builds its catalog out of it) |
| `GET /tiles/<name>.js` | the module of the tile with that catalog name (`text/javascript`), own before shipped; a query such as `?v=…` is ignored (the HUD adds it to reload a module after `catalog-changed`); a module that is not a tile (no `render` + `meta`) is not in the catalog → 404; unloadable → 500. The catalog's `path` is a file path the browser cannot import, so the HUD loads tiles here |
| `GET /layouts/<name>` | the layout file with that catalog name (JSON as stored), own before shipped; unknown → 404 |

Names are looked up in the catalog, never joined into a path.

## The composer

`GET /composer` is the one place where tiles are arranged; the HUD only shows. The page loads
nothing from the network, only its two files, `/hud/hud.css` (the design variables) and the
node's own routes.

- **Grid of any form:** portrait is 8 cells wide with a free height (a box such as 8 × 8 too),
  landscape is free wide within the 7-row band. It is drawn at the HUD's unit (portrait: inner
  width ÷ 8, landscape: inner height ÷ band rows; capped by `unit_max`); the size slider sets the
  inner width/height, and the portrait grid marks the inner width floor of 162 px.
- **Tile panel:** catalog tiles of the chosen orientation that load and have a size; own tiles first
  (an own tile shadows a shipped one of the same name), otherwise catalog order.
- **Placing:** drag a tile from the panel onto the grid, drag a placed tile to move it, drag it off
  the grid to remove it. A tile sits at its `meta.sizes[0]`; a place that is occupied or off the
  grid is refused (the same check as the node's layout schema), and so is shrinking the grid
  under a placed tile.
- **Saving:** the name (1–64 characters, no slash, backslash or `..`) becomes the file slug, shown before
  saving; replacing an own layout of the same slug asks first. The layout goes through
  `POST /layouts` — the node checks it again and writes only inside the aihud home (Host, Origin,
  content type and realpath guards unchanged). After a save the page links `/hud?layout=<slug>`.
- **Claude Code:** the page carries plain-text instructions — `npx aihud new-tile` (or `/new-tile`
  with the skill installed) to have a tile built, and what a layout file looks like.


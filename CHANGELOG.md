# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Before 1.0, any minor release may change behaviour.

## [0.1.0] — 2026-10-08

First public release.

### Added

- `npx aihud`: a local server plus the HUD as a narrow app window (Chrome, Edge or Chromium;
  `--tab` for a normal browser tab). The HUD follows the youngest session of the folder it was
  started in.
- The HUD strip in portrait and landscape, built from tiles; five style families
  (quiet · instrument · drafting · material · classic) with several styles each.
- The window, opened by a click on the strip: Live, Layouts, Analysis and Settings.
- The Composer (`/composer`): arrange tiles into your own layouts by drag and drop, with a
  style family filter.
- Your own tiles: the tile contract 1.1 (`tiles/CONTRACT.md`), `aihud new-tile`, and the
  `/new-tile` skill for Claude Code (`aihud install-skill`); a tile's `contractVersion` is not
  checked at load time in 0.x, tiles built against contract 1.0 still load.
- Commands: `serve`, `check`, `add-tile`, `layout show`, `close`.
- Readers for Claude Code (full), Codex (full) and Antigravity (reduced) transcripts, read only.

[0.1.0]: https://github.com/RichardErtl/aihud/releases/tag/v0.1.0

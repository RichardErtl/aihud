# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
Before 1.0, any minor release may change behaviour.

## [0.1.0] — 2026-10-09

First public release.

### Added

- `npx aihud`: a local server plus the HUD as a narrow app window (Chrome, Edge or Chromium;
  `--tab` for a normal browser tab). The HUD follows the youngest session of the folder it was
  started in.
- The HUD strip in portrait and landscape, built from tiles; five style families
  (quiet · instrument · drafting · material · classic) with several styles each.
- The window, opened by a click on the strip: Live, Layouts, Settings and Analysis.
- The Composer (`/composer`): arrange tiles into your own layouts by drag and drop, with a
  style family filter.
- Your own tiles: the tile contract 1.1 (`tiles/CONTRACT.md`), `aihud new-tile`, and the
  `/new-tile` skill for Claude Code (`aihud install-skill`); a tile's `contractVersion` is not
  checked at load time in 0.x, tiles built against contract 1.0 still load.
- Commands: `serve`, `check`, `add-tile`, `layout show`, `close`.
- `aihud --version` (also `-v` and `version`) prints the version.
- A clear message instead of a crash when Node.js is older than 22.
- On Linux without a display (SSH, headless), one line naming the cause and the URL instead of a failed browser start.
- The app window opens without Chrome's first-run and default-browser prompts.
- Readers for Claude Code (full), Codex (full) and Antigravity (reduced) transcripts, read only.

[0.1.0]: https://github.com/RichardErtl/aihud/releases/tag/v0.1.0

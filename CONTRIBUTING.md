# Contributing to aihud

Thank you for wanting to help. aihud is a small project with one maintainer, so a few notes
first.

## How contributions come in

1. Fork the repository and create a branch for your change.
2. Run the tests (see below) and make sure they pass.
3. Open a pull request with a short description: what changes, and why.

Every pull request is reviewed and integrated by hand by the maintainer. Nothing is merged
automatically. Integration can take a while, and a change may land in a slightly different form
than it was proposed — you will be credited either way.

For larger changes, please open an issue first, so we can agree on the direction before you
spend time on it.

## How pull requests land

The GitHub repository is a one-way mirror of a private origin repository. Pull requests are
welcome and are reviewed here. An accepted change is taken over by hand into the origin and
arrives with the next mirror commit; the pull request is then closed with a reference to that
commit. Your authorship is kept in the commit message (`Co-authored-by`).

## Tests

```sh
npm test
```

This runs the whole suite with `node --test` (Node.js 22 or newer). Some tests drive a real
headless browser (Chrome, Edge or Chromium); they are skipped when none is installed. Please do
not skip, weaken or delete a failing test to make a change pass — say in the pull request what
fails instead.

## Tiles

New tiles are very welcome. Every tile follows the contract in
[`tiles/CONTRACT.md`](tiles/CONTRACT.md) (machine-readable: [`tiles/contract.json`](tiles/contract.json)).
Before you open a pull request with a tile:

- build it against the contract (`npx aihud new-tile` prints it, the `/new-tile` skill uses it),
- run `npx aihud check` — it must answer `ok`,
- keep the tile free of network calls and imports from outside the package (a test enforces this
  for shipped tiles).

## Style

- Plain JavaScript (ES modules), Node built-ins only, no new dependencies without discussing it
  first.
- Line endings are LF. The repository's `.gitattributes` takes care of that; please do not
  commit CRLF files.
- Code, comments, docs and commit messages in English.

## Formats can break

aihud reads transcript formats that are internal to Claude Code, Codex and Antigravity. When an
update of one of these tools breaks aihud, an issue with the tool's version (for example
`claude --version`) and a short description of what broke helps most.

By contributing, you agree that your contributions are licensed under the MIT License of this
project, and you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

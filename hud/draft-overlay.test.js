// The HUD's draft overlay (`draft-overlay.js`): the pure match/geometry rules and the overlay on a
// small fake DOM with stub tile modules. The wiring into the real HUD page, over the real node's SSE,
// is proven in a real browser (composer/composer-polish.browser.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftMatches, draftGeometry, createDraftOverlay } from './draft-overlay.js';

function fakeDoc() {
  const doc = {};
  doc.createElement = (tag) => ({
    tagName: tag.toUpperCase(), className: '', dataset: {}, style: {}, children: [], hidden: false, _text: '',
    get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); },
    set textContent(v) { this._text = String(v); this.children = []; },
    append(...c) { this.children.push(...c); for (const k of c) k.parentNode = this; },
    replaceChildren(...c) { this._text = ''; this.children = c; for (const k of c) k.parentNode = this; },
  });
  return doc;
}
const flush = () => new Promise((r) => setTimeout(r, 5));
const STUB = { meta: { sizes: [{ cols: 8, rows: 2 }] }, render(el, data, o) { el.textContent = `R${o.cols}x${o.rows}@${o.unit}`; el.renderedWith = { data, ...o }; } };

function setup({ orientation = 'portrait', width = 180, height = 900, mods = { 'header-standard-portrait': STUB } } = {}) {
  const doc = fakeDoc();
  const parent = doc.createElement('body');
  const imports = [];
  const state = { orientation, settings: { unit_max: 22.5 }, data: { hud: {} }, modules: new Map(), bust: 0 };
  const win = { innerWidth: width, innerHeight: height, document: { documentElement: { clientWidth: width } } };
  const overlay = createDraftOverlay({
    win, doc, state, parent, base: '', importModule: async (url) => { imports.push(url); const n = decodeURIComponent(url.split('/').pop().replace(/\.js.*$/, '')); return mods[n] || null; },
  });
  return { overlay, parent, state, imports };
}
const DRAFT = { orientation: 'portrait', cols: 8, rows: 12, tiles: [{ tile: 'header-standard-portrait', col: 0, row: 3 }] };

test('draftMatches: only a live draft of the HUD\'s current orientation counts', () => {
  assert.equal(draftMatches(DRAFT, 'portrait'), true);
  assert.equal(draftMatches(DRAFT, 'landscape'), false);
  assert.equal(draftMatches({ end: true }, 'portrait'), false);
  assert.equal(draftMatches(null, 'portrait'), false);
  assert.equal(draftMatches(DRAFT, null), false, 'before the HUD knows its shape: nothing');
});

test('draftGeometry: the frame is cols x rows at the REAL unit of the HUD (portrait: inner width ÷ 8; landscape: inner height ÷ band rows, capped by unit_max)', () => {
  assert.deepEqual(draftGeometry(DRAFT, { width: 180, height: 900, unitMax: 22.5 }), { unit: 22.5, width: 180, height: 270 });
  assert.deepEqual(draftGeometry(DRAFT, { width: 162, height: 900, unitMax: 22.5 }), { unit: 20, width: 160, height: 240 });
  const land = { orientation: 'landscape', cols: 40, rows: 6, tiles: [] };
  assert.deepEqual(draftGeometry(land, { width: 1000, height: 120, unitMax: 22.5 }), { unit: 20, width: 800, height: 120 });
  assert.deepEqual(draftGeometry(land, { width: 1000, height: 400, unitMax: 22.5 }), { unit: 22.5, width: 900, height: 135 }, 'capped by unit_max');
});

test('overlay: a matching draft shows the frame at the real size and renders every placed tile for real at its place', async () => {
  const { overlay, parent, state } = setup();
  state.orientation = 'portrait';
  overlay.set(DRAFT);
  await overlay.ready();
  const box = parent.children[0];
  assert.equal(box.hidden, false);
  assert.equal(box.dataset.state, 'shown');
  const frame = box.children[0];
  assert.equal(frame.style.width, '180px');
  assert.equal(frame.style.height, '270px');
  const tiles = frame.children.filter((c) => c.dataset.tile);
  assert.equal(tiles.length, 1, 'one placed tile');
  assert.equal(tiles[0].dataset.tile, 'header-standard-portrait');
  assert.equal(tiles[0].style.left, '0px');
  assert.equal(tiles[0].style.top, `${3 * 22.5}px`);
  assert.equal(tiles[0].style.width, '180px');
  assert.equal(tiles[0].style.height, '45px');
  assert.equal(tiles[0].textContent, 'R8x2@22.5', 'the tile\'s own render, at the real unit');
  assert.strictEqual(tiles[0].renderedWith.data, state.data, 'with the HUD\'s current data');
});

test('overlay: another orientation shows nothing (and renders nothing); the end hides it; a new matching draft shows it again', async () => {
  const { overlay, parent, state, imports } = setup({ orientation: 'landscape' });
  state.orientation = 'landscape';
  overlay.set(DRAFT);   // a portrait draft, the HUD is landscape
  await overlay.ready();
  const box = parent.children[0];
  assert.ok(!box || box.hidden === true, 'hidden');
  if (box) assert.equal(box.dataset.state, 'mismatch');
  assert.deepEqual(imports, [], 'nothing was imported or rendered for a draft that does not match');
  state.orientation = 'portrait';   // the HUD changes shape: the same draft now matches
  overlay.redraw();
  await overlay.ready();
  assert.equal(parent.children[0].hidden, false);
  assert.equal(parent.children[0].dataset.state, 'shown');
  overlay.set({ end: true });
  await overlay.ready();
  assert.equal(parent.children[0].hidden, true);
  assert.equal(parent.children[0].dataset.state, 'off');
});

test('overlay: a heartbeat of the same draft does not rebuild; a changed draft or unit does; an unknown tile is a marked cell, not a crash', async () => {
  let renders = 0;
  const counting = { meta: STUB.meta, render(el) { renders++; el.textContent = 'x'; } };
  const { overlay, parent, state } = setup({ mods: { 'header-standard-portrait': counting } });
  state.orientation = 'portrait';
  overlay.set(DRAFT);
  await overlay.ready();
  overlay.set(JSON.parse(JSON.stringify(DRAFT)));
  await overlay.ready();
  assert.equal(renders, 1, 'same draft, same unit: one render');
  overlay.set({ ...DRAFT, rows: 13 });
  await overlay.ready();
  assert.equal(renders, 2);
  overlay.set({ ...DRAFT, tiles: [...DRAFT.tiles, { tile: 'not-there', col: 0, row: 6 }] });
  await overlay.ready();
  const cells = parent.children[0].children[0].children.filter((c) => c.dataset.tile);
  assert.deepEqual(cells.map((c) => c.dataset.tile), ['header-standard-portrait', 'not-there']);
  assert.match(cells[1].className, /missing/);
  assert.equal(cells[1].textContent, 'not-there');
  await flush();
});

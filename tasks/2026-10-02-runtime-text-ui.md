# RUNTIME TEXT AND UI: BITMAP FONT, PANELS, UI AS DATA (2026-10-02)

**GATE:** none · **Priority:** P1 · **Size:** L · **Depends on:** player-loop-test-protocol, asset-render-cli

## Origin
D12 (graphics are code: this includes the font and the UI), D10 (games are pure data, so UI is
described, not programmed) and D23. Kairosoft sims are mostly menus, counters and message
tickers, so text and UI are core engine parts, not polish.

## Read first
- `research/multiplatform.md` §4.1 item 3 and rule 9 (presentation as data; TypeScript-only UI
  code is what a second player must rewrite by hand).
- `research/ref-sakura-crossing.md` §5 (ii): labels generated from data with auto-fit, and a
  generated bitmap font (no system fonts, no tofu).
- The owner's `code-pixel-game` skill, `references/art-kit.md` §6 (5×7 proportional font from
  glyph grids, `missingGlyphs`, the locale coverage test) and `references/style.md` (fonts).
- `research/code-graphics.md` §2.5 (floating numbers and labels must read over busy tiles).

## Scope
1. Asset kind **`font`** in `asset-kit`: a bitmap font built from glyph stamp grids
   (proportional, ASCII + Czech and common Latin diacritics), per-glyph advance and kerning
   pairs, baked to an atlas like any asset. `missingGlyphs(text)` is exported.
2. **Text in the runtime:** draw-list text items (font, palette slot, plain / outlined /
   1-px shadow, alignment, wrap, auto-fit to a box), integer positions only. Integer number
   formatting (thousands separators, money, percentages from basis points).
3. Asset kind **`ui`**: 9-slice panels, buttons, icons and bars written as generators.
4. **UI as data** (`games/<id>/ui/*.json`, schema in `game-data`): a layout tree of panel,
   label, icon, button, list, bar, tabs and a message ticker; integer layout with anchors and
   safe-area insets; values **bound** to paths in the sim's view model; actions emit
   **commands**. No game-specific UI code.
5. The player draws the UI tree over the scene; `describe()` lists visible UI elements with
   their boxes, so scripts can press a button by id.
6. Example: `counter-shop` gets a money counter, a price button and a ticker; the font and the
   UI assets appear in the studio gallery (a font shows its full glyph sheet).

## Out of scope
- Pointer, keyboard and gamepad handling (`runtime-input`); here buttons are pressed by id
  through the test protocol.
- Floating numbers and pop labels (`fx-emitters`).
- Text input fields, rich text, right-to-left and CJK scripts.

## Acceptance
- A test proves every string of every locale of every game has glyphs.
- Layout goldens: the example UI drawn by the CPU backend at two native resolutions matches
  stored hashes; no element sits on a fractional pixel (asserted in the layout code).
- Pixel parity of text and panels between WebGL and CPU in the host browser.
- A script presses the price button by id and the bound label changes on the next tick.

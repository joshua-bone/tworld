# Meme Tiles Implementation Plan

**Goal:** Author Meme tiles in DATTools and play them with consistent MS/Lynx behavior.
**Architecture:** Extend the existing DAT registries and per-ruleset catalogs. Keep
hint trails as immutable optional engine/snapshot state, projected through the
existing tile-overlay renderer. Share artwork bytes between repositories.
**Tech Stack:** TypeScript, React, canvas, Vitest, DAT binary codec, GitHub Pages.
**Spec:** `docs/superpowers/specs/2026-10-20-meme-tiles-design.md`

## Global constraints

- DAT 0x76 boots; 0x77–0x7A Red tank N/W/S/E; 0x7B clockwise; 0x7C counterclockwise.
- Runtime RedTank=0x7C, Boots_Hint=0x86, Button_RedTankCW=0x87, Button_RedTankCCW=0x88.
- Boot slot 4; classic boots remain slots 0–3. No classic replay behavior changes.
- User confirmed preservation/looping of hint marks and immediately moving tanks.
- Write failing behavior tests before production code; record red and green commands.
- Canonical checkouts, bounded tools, commit/push/deploy both apps. No worktrees.

## Review focus

1. Spaces, empty hints, and revisits must not skip characters or erase marks.
2. Undo/replay must preserve trail cursor without mutating older snapshots.
3. Rotating a moving Lynx tank must preserve its in-flight position/arrival.
4. Blue buttons must not turn Red tanks and vice versa, including held buttons.
5. Editor rotation/flipping and buried terrain must preserve actor metadata and buttons.

## Task 1: Shared contracts and trail state (root)

Files: `game-core/api/model.ts`, `types.ts`, `interactive.ts`,
`game-core/impl/{hintTrail,actorLocalInventory,initialize,snapshot}.ts`,
`ruleset-ms/api/tiles.ts`, both `builtinLevelRegistration.ts` registries.

Interfaces: `HintTrailState { nextIndex: number; marks: {pos:number; z:number; text:string}[] }`,
optional `EngineState.hintTrail` and `GameSnapshot.hintTrail`;
`recordHintTrail(state: EngineState, hint: string, pos: number, z=1): void`;
`hintTrailOverlays(trail: HintTrailState | undefined): InteractiveGameTileOverlay[]`.
Trail recording checks `state.inventory.boots[4] > 0`, is immutable, and skips revisits.
Overlay kind/mode `hint-letter`, render carries `text` and optional `alpha`.

- [x] RED: real inventory collection at index 4 yields 1, theft removes it; snapshot round trip retains extra slot and independent trail; literal `A B` trail loops and preserves marks.
- [x] GREEN: implement those contracts, retain four-element arrays for ordinary levels.
- [x] Verify shared tests and DAT decoding for all seven codes.

## Task 2: MS runtime (MS worker)

Own `web/src/ruleset-ms/impl/**`, excluding builtin registry owned by root.
Consume Task 1 constants/helper. Extend catalog policies, tank movement/button
actions and arrival integration; project persistent trail overlays. Preserve
trail through every MS state clone/transition and undo codec.

- [x] RED: `memeTiles.test.ts` pickup/writing/space/revisit/loop/theft; Red tanks start moving, turn both ways, stop at walls, ignore blue buttons; clone and restore trail state.
- [x] GREEN: implement per-ruleset behavior without new shared raw-ID branches.
- [x] Verify the new tests and nearest movement/button/engine suites with timeouts.

## Task 3: Lynx runtime (Lynx worker)

Own `web/src/ruleset-lynx/impl/**`, excluding builtin registry owned by root.
Consume Task 1 contracts. Integrate arrival/overlay projection and catalog policies.
Queue Red tank turns using the established Lynx movement timing without moving
sideways mid-tile. Preserve state across clone/undo.

- [x] RED: same trail and tank scenarios as MS, plus mid-move turn and repeated presses.
- [x] GREEN: implement; preserve classic tank behavior.
- [x] Verify new and adjacent engine/button/movement suites with timeouts.

## Task 4: DATTools editor and format (DATTools worker)

Own `/Users/joshuabone/git/DATTools`, except artwork files supplied by root.
Extend tile naming/display, Meme palette section/search, directional transforms,
creature detection/metadata, rendering atlas loading, and DAT round trips.
Use semantic names HINT_BOOTS, RED_TANK_N/W/S/E, RED_TANK_BUTTON_CW/CCW;
accept existing UNKNOWN_0xNN numeric aliases. Artwork root will supply
`web/public/meme_artwork/meme.png` and `meme.json` with the same atlas-key format
as expansion assets and frames keyed by those names.

- [x] RED: all codes export/import losslessly; palette search; rotation/flip; tanks
  preserve bottom terrain and enter creature list; actual atlas overrides rendered.
- [x] GREEN: implement via existing codec, palette and sprite paths.
- [x] Format touched files; full tests, typecheck, library and Pages builds.

## Task 5: Art, rendering, and ATDD (root)

Files: new `res/meme_artwork/`, `legacyCanvasTileset.ts`, map renderer/HUD,
shared overlay types, cross-repo DAT acceptance fixture/tests.

- [x] Generate and inspect Hint boots, Red tank and CW/CCW button sprites; share final assets.
- [x] RED: registered sprites, fifth boot inventory and semi-transparent text overlay rendering.
- [x] GREEN: integrate artwork and overlay rendering without changing terrain.
- [x] ATDD: export a small Meme DAT with DATTools; load and play under both real engines;
  assert hint trail and button turns, undo/replay; inspect both browser apps.

## Task 6: Review and deployment (root)

- [x] Run appropriate bounded suites, builds/typechecks, and an independent final review.
- [ ] Commit/push each repository; merge protected tworld master via PR; deploy both Pages apps.
- [ ] Verify live routes/assets, fetched default branches, and tworld workspace health.

## Execution record

- 2026-10-20: Requirements clarified; both repos clean and fetched. DATTools fast-forwarded
  four commits to 18ef18b. tworld starts at 0e3d396d. User-authorized implementation and
  deployment proceed without additional permission gates; questions above settled gameplay.

- Test-first evidence: shared inventory/DAT contracts 13 failures, trail helper four
  failures, UI rendering four failures, MS/Lynx new gameplay failures, and DATTools
  authoring/actual atlas loader failures were observed before their implementations.
- Final combined browser product + complete MS/Lynx + adjacent shared/undo suites:
  1,433 passed, 16 existing todos. An additional MS catalog contract test passed
  with its adjacent catalog suite (10 tests). DATTools: all 277 tests passed.
- Browser acceptance: opened the generated DAT in DATTools, used Test in MS,
  navigated that exact compressed export to the local build, collected boots and
  inspected the persistent trail. Also played Lynx, completed the level, inspected
  Red tank sprites, and verified the fifth boot slot in both rulesets at 390x844.
- Independent review found and verified fixes for MS teleport entrance marks,
  pushed/cloned/released block button activation, and a nested cloner turn that
  left a phantom Red tank. All have targeted regression tests.
- Phone acceptance exposed clipped inventory; portrait inventory now keeps its
  natural height and the controls fit the remaining space. No input timing changed.
- Wider checks found three pre-existing fixture mismatches: both undo canonical
  digests and the replay model's empty modifierMasks. Each was reproduced at base
  0e3d396d; both actual undo digest candidates were identical at base and current.
  Fixtures were not rewritten. Product gates, build and feature suites pass.

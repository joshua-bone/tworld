# HybridCC v0 browser host

This directory is the Tile World-owned browser host for HybridCC v0. It does
not contain a second gameplay engine:

1. The browser reads a classic DAT from Tile World's bundled assets or shared
   `tworld-browser-profile` IndexedDB store.
2. The HybridCC WebAssembly C ABI immediately converts the DAT into canonical
   HCLV native-level bytes.
3. The C++ engine owns every gameplay transition and returns canonical state,
   dynamic cell/signal facts, an ordered event journal, and state/event hashes.
4. `HybridCcV0GameEngineAdapter.ts` is an ordinary shared-player engine port.
   `renderProjection.ts` converts its facts into Tile World's existing Lynx
   artwork vocabulary. Neither layer can write back into the engine.

The deployed WebAssembly files are generated artifacts, not Tile World source.
Their exact HybridCC2026 source commit and SHA-256 digests are recorded in
`engine/engine-manifest.json`. Vite treats the glue and WebAssembly binaries as
generated assets. Tile World source is
not copied into, linked into, or used to implement the proprietary engine.

## Input provenance

The four 25 ms input samples per 100 ms logic step, late-press carry, and
insertion-order slap selection in `inputCollector.ts` preserve the earlier
HybridCC player behavior. The browser host likewise holds a newly loaded level
at Ready until the first directional input, matching the earlier Python and
TypeScript play-session state machines. The semantic references were:

- HybridCC2025 commit `c2066cdfae75780d1844e11830f572af6394825a`
- HybridCC-Python commit `b675ae3b7274eade8b66acecc4db16a628432cb8`

Joshua Bone (Chip McCallahan), author and owner of those repositories,
authorized their reuse for HybridCC2026.

## v0 parity audit

The final M1 browser-host audit rechecked the pinned HybridCC2025 engine and
play-runtime tests, the HybridCC-Python element and player implementations, and
the current Tile World Lynx player. Tile World is the strict presentation and
browser-control reference; the older Hybrid repositories are semantic and
timing references where they do not conflict with the current player shell.

- The C++ engine remains authoritative at 10 `logic_step` calls per game
  second. Four input samples feed each logic step. Holding Shift doubles both
  rates without discarding the collector's partially sampled input window.
- The browser publishes a separate 20 Hz game-time presentation clock. This
  drives Lynx tile animation and presentation-only actor motion without adding
  engine transitions. Ordinary moves span four presentation samples; moves
  explicitly marked as sliding/forced span two. Boot-protected walking on ice
  and force floors remains an ordinary animated move. Long teleports use
  the direction-implied adjacent origin, preserving the earlier Hybrid camera
  safeguard instead of panning across the map.
- Native key and tool arrays are converted explicitly into the Tile World HUD
  orders. Native cell layers are likewise composed explicitly into Lynx's two
  visual layers, including thin walls over pickups and pickups over devices.
- Durable win/loss outcomes are projected into the shared modern result sheet.
  Death keeps the native terminal position as the camera source even after the
  player actor has been removed.
- Ordered ABI events are projected into Tile World's Lynx sound-bit vocabulary
  and played through its existing browser audio player. Surface loops are tied
  to visible committed motion, and button activation retains the responsible
  actor so blocks and mobs follow the same audio policy as Chip.
- The Hybrid route embeds the shared `PlayerApp`. Shift timing, pause/help/result
  overlays, audio lifetime, level navigation, and profile progress therefore
  have one owner. Hybrid completion is stored under an honest `Hybrid` ruleset
  key and a content hash of the immediately converted native level.

The audit intentionally retained Tile World's current Backspace/Delete pause,
Space-to-start, help, result-sheet, and level-navigation behavior instead of the
older Hybrid demos' Space-to-pause binding. Native Hybrid replay playback,
undo/history, and shareable Hybrid level links remain disabled rather than
being represented as working features.

## Discrepancy ledger and regression seams

| Reported symptom | Earlier Hybrid evidence | Root bookkeeping mismatch | Authoritative seam and regression test |
| --- | --- | --- | --- |
| Boot-protected ice/force moves did not animate; loops continued at rest | Python `UIGamestateManager` distinguishes `slide` from ordinary interaction and emits sounds from current interaction hints; HybridCC2025 separates input, play runtime, and render ports | The first browser host inferred motion and loops from the tile under Chip, so terrain was mistaken for movement | ABI actor-moved events and actor flags drive `motionProjection.test.ts`; active tracks drive `soundProjection.test.ts` |
| Bombs had no explosion sound | Python destruction hints preserve the destroyed bomb and armed state | Snapshot-diff audio returned early after the player actor disappeared | Terminal/destruction events drive `soundProjection.test.ts` even with an empty actor list |
| Clears were not marked | Both earlier playable demos owned terminal state outside rendering | A parallel Hybrid UI hard-coded an empty progress map | Shared `PlayerApp` persists content-hashed `Hybrid` progress; `levelProgress.test.ts` covers ruleset separation and set counts |
| Death moved the camera to the upper-left | Earlier Python camera remains a gameboard object across terminal animation | Presentation treated a missing live player as coordinate `(0,0)` | Durable outcome position drives `renderProjection.test.ts` |
| Blob/walker animation was corrupted | Earlier runtimes expose presentation movement separately from engine position | The host counted creature frames upward while Lynx artwork consumes the remaining movement phase | Descending 20 Hz frames are fixed in `motionProjection.test.ts` and rendered by the shared Lynx canvas |
| Toggle-wall art ignored button presses | HybridCC2025 `button_togglewall.test.ts` and Python signal-backed toggle graphics both use current signal state | The host rendered the element's initial rule forever | ABI cell `open` state drives `renderProjection.test.ts` |
| Only Chip produced button audio | Python `UIInteractionRequest` records both source and target | Snapshot comparison looked only at Chip's destination cell | Actor-agnostic activation events drive `soundProjection.test.ts` for player, block, and mob |

`wasmBridge.test.ts` is the binary layout contract; the real-artifact smoke test
then imports CCLP1 and steps the generated ABI v2 WebAssembly. The adapter test
checks the 40 Hz input / 10 Hz logic / 20 Hz presentation ratios independently
of React. A structural shared-host test prevents reintroducing a private clock,
canvas, sound player, or result overlay in `HybridCcV0App`.

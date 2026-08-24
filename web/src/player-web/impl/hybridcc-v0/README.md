# HybridCC v0 browser host

This directory is the Tile World-owned browser host for HybridCC v0. It does
not contain a second gameplay engine:

1. The browser reads a classic DAT from Tile World's bundled assets or shared
   `tworld-browser-profile` IndexedDB store.
2. The HybridCC WebAssembly C ABI immediately converts the DAT into canonical
   HCLV native-level bytes.
3. The C++ engine owns every gameplay transition and returns canonical state
   snapshots plus a per-step state hash.
4. `renderProjection.ts` converts snapshots into Tile World's existing Lynx
   artwork vocabulary. It cannot write back into the engine.

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
  associated with ice, force floors, and teleports span two. Long teleports use
  the direction-implied adjacent origin, preserving the earlier Hybrid camera
  safeguard instead of panning across the map.
- Native key and tool arrays are converted explicitly into the Tile World HUD
  orders. Native cell layers are likewise composed explicitly into Lynx's two
  visual layers, including thin walls over pickups and pickups over devices.
- Durable win/loss outcomes are projected into the shared modern result sheet.
  Death keeps the native terminal position and inventory as the camera/HUD
  source instead of treating a dead player as a missing player and falling
  back to the map origin.
- Snapshot deltas are projected into Tile World's Lynx sound-bit vocabulary and
  played through its existing browser audio player. This adapter is
  presentation-only and cannot change simulation state.

The audit intentionally retained Tile World's current Backspace/Delete pause,
Space-to-start, help, result-sheet, and level-navigation behavior instead of the
older Hybrid demos' Space-to-pause binding. Replay management, undo/history,
profiles/progress, shareable level links, and advanced runtime controls remain
outside the v0 browser host rather than being represented as working features.

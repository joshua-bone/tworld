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
HybridCC player behavior. The semantic references were:

- HybridCC2025 commit `c2066cdfae75780d1844e11830f572af6394825a`
- HybridCC-Python commit `b675ae3b7274eade8b66acecc4db16a628432cb8`

Joshua Bone (Chip McCallahan), author and owner of those repositories,
authorized their reuse for HybridCC2026.

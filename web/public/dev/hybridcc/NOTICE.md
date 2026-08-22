# HybridCC browser player notices

The HybridCC engine, DAT-to-native converter, browser player host, original
web interface, and original fallback artwork are Copyright Joshua Bone and are
distributed under the HybridCC2026 license included with this bundle.

The four-subtick browser input collector was adapted from Joshua Bone's own
HybridCC implementations at these pinned revisions:

- HybridCC2025 `c2066cdfae75780d1844e11830f572af6394825a`
- HybridCC-Python `b675ae3b7274eade8b66acecc4db16a628432cb8`

Joshua Bone authorized reuse of those implementations in HybridCC2026.

Selected pixels in the primary and exact color-state Lynx-style atlases are
derived from `tworld/res/atiles.bmp` at Tile World revision
`5c47907507f5fdc6cebaa6f6125d8b93d3d92d44`. Tile World's README credits
Anders Kaseorg and POV-Ray and places those tile images in the public domain.
The exact source bitmap SHA-256 is
`91ec08cb9c03e98ea7a0ad068b23de1bcf0c57457e338166a03ff4f022895284`.
The artwork manifest identifies the provenance of every primary and state sprite.

The bundled `intro.dat` is Tile World's public-domain introductory level set,
created by Brian Raiter. The bundled `3DINTRO.dat` is selected by exact bytes
from the same pinned Tile World revision for the tutorial catalog; its records
identify Joshua Bone as author, and the source history records his commits.
DAT bytes are converted immediately in memory; the HybridCC engine never
parses DAT.

No Tile World GPL implementation code, renderer, parser, CSS, or JavaScript is
copied, translated, linked, or loaded by this player. The deployment consumes
only the pinned data/artwork bytes described above.

# CCSolver

CCSolver is the public level-understanding and replay-construction laboratory
for Tile World. It analyzes Chip's Challenge levels, represents their solutions
as semantic subgoals, and compiles independently verified MS and Lynx TWS
replays. Its versioned strategy artifacts will later support the private
HybridCC2026 engine through a file or separate-process boundary.

CCSolver is not another gameplay engine. Tile World's MS and Lynx engines and
native oracle remain authoritative for legacy replay results.

## Documents

- [Design](docs/design.md)
- [Project plan](docs/project-plan.md)
- [Artifact kernel v1](docs/artifact-kernel-v1.md)
- [Level facts v1](docs/level-facts-v1.md)
- [P1A pinned corpus and static analysis](docs/p1a-static-analysis.md)

## Status

P0 established the workspace, dependency boundaries, canonical artifact kernel,
and the first static `level-facts` root artifact. P1A is now implemented: a
checked-in manifest derives 2,440 map cases and 4,880 separate target records
from 193 byte-pinned repository sources, and a target-policy evidence seam feeds
a pure, conservative static analyzer. Synthetic ATDD and an MS Intro level 8
golden cover directed connectivity, weak regions, conditional boundaries,
resource and transport incidence, iterative articulation analysis, uncertainty,
and basic machine-readable dossier data.

The P1A gameplay-analysis adapter is MS-only. The corpus manifest records MS and
Lynx target/donor availability, and the pure analyzer accepts target-specific
evidence, but there is not yet a Lynx topology-evidence producer. Static
analysis and dossier values are canonical and content-addressed previews rather
than frozen root artifact schemas. Lynx parity, curriculum selection, runtime
events, goals, plans, search, replay generation, and the dossier UI remain later
review slices.

CCSolver inherits Tile World's GPL-2.0-or-later license. Generated dossier pages
will be publicly reachable under the existing GitHub Pages deployment but will
not be linked from the main Tile World site or navigation.

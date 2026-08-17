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

## Status

The project is in P0. The P0A workspace foundation provides the package,
dependency boundaries, root commands, and CI installation model. P0B will add
the first artifact schemas, canonical JSON, and hashing; those semantics are not
part of the foundation package yet.

CCSolver inherits Tile World's GPL-2.0-or-later license. Generated dossier pages
will be publicly reachable under the existing GitHub Pages deployment but will
not be linked from the main Tile World site or navigation.

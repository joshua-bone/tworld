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

## Status

The project is in P0. P0A established the workspace, dependency boundaries,
root commands, and CI installation model. P0B establishes the first strict,
content-addressed artifact kernel: canonical JSON, portable SHA-256 identities,
corpus cases, replay certificates, semantic identity primitives, schemas, and
conformance fixtures. Rich level facts and semantic plan schemas remain P0C
work and are intentionally opaque references in v1.

CCSolver inherits Tile World's GPL-2.0-or-later license. Generated dossier pages
will be publicly reachable under the existing GitHub Pages deployment but will
not be linked from the main Tile World site or navigation.

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
- [P1B cross-ruleset topology and curriculum](docs/p1b-cross-ruleset-topology.md)
- [P2A runtime observation and human-review packets](docs/p2a-runtime-observation.md)

## Status

P0 established the workspace, dependency boundaries, canonical artifact kernel,
and the first static `level-facts` root artifact. P1A pinned 193 repository
sources and derived 2,440 map occurrences and 4,880 target records. P1B is now
implemented: genuine MS and Lynx policy adapters feed shared engine-neutral
facts and analysis kernels, and a pure comparator explains differences as
source facts, target policy, or policy-derived features.

The P1B corpus audit quarantines 55 DATTools-invalid occurrences before ruleset
interpretation, leaving 2,251 valid paired occurrences as the production scope
of the donor-redacted measured-report pipeline. The checked static comparison
finds 770 parity cases and 1,481 cases with explicit target differences. Its
curriculum builder freezes
eight declarative Phase-A ASCII cases, five donor-visible training levels, six
donor-hidden evaluation levels, normalized-gameplay-digest cohort isolation,
and provisional size-based budgets. Key Pyramid is the paired golden target for
both analysis pipelines and their comparison. The ASCII cases are declarations
for later execution, and the `blind` label is policy rather than
capability-enforced donor isolation until P8. Topology evidence, comparisons,
reports, curriculum data, and basic dossier data remain canonical
content-addressed previews rather than frozen root artifact schemas.

CCSolver additionally accepts only the standard CC1 tile vocabulary. The six Tile World
expansion codes `0x70`–`0x75` (Sandbag, Bowling Ball, Cloud, Hook, Ice Block,
and Pet Carrier) are unconditionally outside solver scope on either plane and
every otherwise-valid layer; valid multi-layer geometry remains in scope.
Corpus normalization, LevelFacts, paired analysis, and runtime
entry reject them before target interpretation; the game engines themselves
remain unchanged. None occurs in the current 2,440-map manifest, so this guard
does not change the checked P1B counts or artifact bytes.

P2A is implemented: a target-neutral runtime port, shared authority/checkpoint
kernel, and independent MS/Lynx adapters expose exact semantic observation,
true replay execution, checkpoint branching, first-terminal latching, and
deterministic render projections without duplicating gameplay. Checked Key
Pyramid and Intro 8 packets place full observation/render values beside compact
human-readable baseline summaries and deltas. Each packet directly pins its
map/series bytes, LevelFacts, target adapter revision, and engine revision. Key
replay evidence is explicitly donor runtime characterization; its separate
manual start still uses a donor-derived initialization seed and is not claimed
donor-independent. Intro 8's east trace is explicitly blocked movement, not
button evidence. The packet set is authoritative runtime-characterization
evidence only after generation and an independent byte-for-byte
`npm run ccsolver:p2a:check` pass; Markdown reviews are derived aids.

P2A is perception, not solver reasoning. It does not yet produce a goal graph,
subgoal witness, route, or replay. The next human-checkable reasoning slice is
P3A's terminal-first backward prerequisite graph, followed by P3B exact
witnesses, P4A annotated maps, and P5 full-level proof. P2B's complete causal
event journal remains a separate later expansion. Semantic rooms and block
dead-square proofs remain unimplemented.

CCSolver inherits Tile World's GPL-2.0-or-later license. Generated dossier pages
will be publicly reachable under the existing GitHub Pages deployment but will
not be linked from the main Tile World site or navigation.

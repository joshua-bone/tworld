# P1A pinned corpus and static analysis

## Status

P1A is the first executable static-understanding slice. It delivers two related
but deliberately separate products:

1. a reproducible manifest of the intended official and CCLP5-voting source
   corpus, including separate MS and Lynx target records and donor metadata; and
2. an MS target-policy adapter plus a pure, target-parameterized analyzer that
   derives only topology justified by explicit evidence.

This is not a solver, a runtime observer, or a second gameplay engine. It does
not prove that a level is solvable and it does not produce a replay.

## Pinned corpus manifest

The checked-in [`manifest.v1.json`](../corpus/manifest.v1.json) is generated from
193 repository files pinned individually by byte length and SHA-256. The
aggregate source revision is:

```text
joshua-bone/tworld@42c78d0db343621f887fefce581315479d9a8be3
```

The builder verifies every source before parsing it. It rejects byte-length or
digest drift, unsafe or duplicate source paths, duplicate donor entries,
password mismatches, stale generated output, and a registry/pin-table mismatch.
It reuses Tile World's DAT, series-config, and TWS codecs; CCSolver does not copy
those parsers.

The committed manifest derives these exact denominators:

| Measure | Count |
| --- | ---: |
| Packs | 39 |
| Map cases | 2,440 |
| MS/Lynx target records | 4,880 |
| Donor-backed target records | 4,664 |
| Cases with both donors | 2,257 |
| MS-only donor cases | 150 |
| Lynx-only donor cases | 0 |
| Cases with no donor | 33 |

The 39 packs are CCLP1 through CCLP5 plus 34 CCLP5-voting packs. Each map case
has exactly two ordered target records, `ms` then `lynx`, even when a target has
no donor. The 150 MS-only cases are all 149 CCLP2 cases plus CCLP5 level 23.
CCLXP2 is explicitly excluded: it is not treated as a level-number-aligned Lynx
counterpart to CCLP2.

Each case retains its exact DAT member span and digest, normalized gameplay-map
digest, stable occurrence/content identity, and both target records. A present
donor records the exact TWS entry digest and length, source ordinal and level,
password, best ticks, flags, seed, stepping, random-slide state, move count, and
whether diagonal or mouse input occurs. These are donor facts, not proof that
the same input works under another ruleset.

From the repository root:

```sh
npm run ccsolver:corpus:check
npm run ccsolver:corpus:generate
```

`check` reconstructs the complete manifest from pinned bytes and requires an
exact canonical match. `generate` is the intentional update path after a
reviewed source-pin or registry change.

## Why topology evidence is separate from level facts

`LevelFactsV1` preserves imported semantic placements, actors, resources,
wiring, transports, hazards, and provenance. It intentionally does not claim
which exposed tile controls movement, which directions a target ruleset permits,
or whether initial occupancy makes a cell conditional. Those conclusions are
target policy, not source facts.

P1A therefore inserts `StaticTopologyEvidenceV1` between level facts and pure
analysis. Evidence binds all of the following:

- target (`ms` or `lynx`);
- the exact canonical `level-facts` content reference;
- level identity and geometry;
- topology-policy ID and revision; and
- exactly one evidence record for every logical cell.

Each cell records its effective placement, every supporting placement, source
exposure (`lower`, `upper`, or `implicit`), allowed entry and exit movement
headings, classification, typed caveats, and initial occupant. Effective and
supporting roles must be disjoint and together contain every LevelFacts
placement at that coordinate exactly once. This prevents an adapter from
silently omitting a source placement while describing the cell as open.

The MS adapter obtains movement and interaction policy from the MS catalog and
focused ruleset helpers. The pure analyzer never pattern-matches semantic type
names or raw tile IDs to decide legality. This separation lets a future Lynx
adapter provide genuinely different evidence without weakening shared static
analysis.

## Certain-only analysis contract

`StaticAnalysisV1` normalizes non-semantic cell, fact, caveat, and direction
ordering while preserving semantic order such as transport routing. It retains
content references to both the exact level facts and exact topology evidence.
Its guarantees are conservative:

- Only cells classified `open` enter the certain graph. `conditional`,
  `dynamic`, and `unknown` cells become explicit boundaries; `blocked` cells
  remain excluded. Unknown never implies open.
- Directed cardinal adjacency requires the source exit heading and destination
  entry heading to permit the same movement direction.
- Adjacency is planar. There is no implicit edge between equal `(x, y)` values
  on different z layers.
- Weak regions are connected components of the certain directed graph when
  direction is ignored. Region IDs derive from the minimum member-cell ordinal.
- Articulation points are computed over each certain weak region with an
  iterative depth-first algorithm, not recursive call-stack traversal.
- Conditional, dynamic, and unknown boundaries report the certain regions that
  could enter or leave them under their directional evidence.
- Resource gates list candidate sources with the same resource type. Transport
  incidences preserve declared member order. Forced surfaces, hazards, and exits
  attach to their certain or boundary-adjacent regions.
- Source and policy uncertainties remain explicit, and the feature vector
  contains exact integer counts rather than a heuristic complexity score.

The analyzer requires a full grid and accepts at most 65,536 logical cells
across all z layers. ATDD exercises a `65,536 × 1 × 1` open corridor and finds
its 65,534 interior articulation points without recursion. Shapes above the
shared LevelFacts budget fail instead of truncating or overflowing.

These outputs are initial-state deductions, not execution proofs. In
particular:

- a weak region is not yet a human-authored room or puzzle area;
- a boundary says where a conditional transition may connect, not that its
  prerequisite is obtainable or that crossing is safe;
- resource dependencies are candidate matches, not an ordering or consumption
  plan;
- transport members are incidences and retain routing order, but do not become
  unconditional graph edges;
- forced-surface and hazard attachments do not simulate a forced path or prove
  survivability;
- moving actors, blocks, buttons, traps, cloners, and map mutations require
  runtime state; and
- dead squares, irreversible-action reasoning, goals, strategies, search, and
  replay certification are not implemented by P1A.

## Intro level 8 golden and basic dossier data

The checked-in MS golden at
[`fixtures/golden/p1a/intro-008/ms`](../fixtures/golden/p1a/intro-008/ms)
contains four canonical JSON values:

- `level-facts.v1.json`;
- `topology-evidence.v1.json`;
- `static-analysis.v1.json`; and
- `dossier-data.v1.json`.

The basic dossier identifies `tworld:intro:8`, targets MS, and binds exact
SHA-256/byte-length references for the other three values. Its checked-in
summary is:

```json
{
  "actorCount": 8,
  "articulationPointCount": 60,
  "certainOpenCellCount": 805,
  "exitCount": 1,
  "forcedSurfaceCount": 0,
  "hazardCount": 1,
  "logicalCellCount": 1024,
  "placementCount": 1245,
  "regionCount": 33,
  "resourceGateCount": 0,
  "resourceSourceCount": 0,
  "transportNetworkCount": 0,
  "uncertaintyCount": 0,
  "wiringCount": 6
}
```

The corresponding analysis has 2,732 directed adjacency edges, 1,366
bidirectional weak connections, 186 blocked cells, four conditional boundaries,
29 dynamic boundaries, and no unknown boundaries. The dossier warning list is
empty because this golden has no static or traversal uncertainty.

From the repository root:

```sh
npm run ccsolver:analysis:check
npm run ccsolver:analysis:generate
```

`check` rebuilds all four values from `data/intro.dat` and requires byte-exact
canonical equality. `generate` intentionally rewrites the goldens after a
reviewed policy or analyzer revision.

## Scope boundary and next slice

The manifest covers MS and Lynx target/donor availability, but the P1A topology
producer and real-level golden are MS-only. The pure analyzer is ready to accept
Lynx evidence; no Lynx policy adapter or Lynx static golden exists yet.

Topology evidence, static analysis, and basic dossier data are canonical,
content-addressed values. They are not yet added to the frozen root artifact
protocol or JSON Schema set. P1A intentionally defers that compatibility
commitment until both rulesets exercise the seam. It also defers curriculum
selection, the dossier website, runtime event journals, donor interpretation,
planning, search, and replay construction.

The proposed P1B is **Cross-ruleset topology evidence and curriculum freeze**:
add the Lynx policy adapter and cross-ruleset goldens, characterize honest MS/
Lynx topology differences, select the first measured synthetic and donor-hidden
curricula with explicit budgets, then decide which proven derived values are
ready for root-artifact schemas.

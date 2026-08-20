# P1B cross-ruleset topology and curriculum

## Status and scope

P1B is complete. It adds a genuine Lynx static-analysis path, explicit paired
MS/Lynx comparison, source-validity quarantine, a measured valid-paired corpus
report, and a frozen first curriculum. The bounded production generator and an
independent byte-for-byte check both succeeded for all checked outputs. The
implementation remains static: it does not execute a level, prove a route,
inspect donor moves, or certify a replay.

The P1A corpus manifest and its pinned bytes remain the source of truth. P1B
adds derived, canonical, content-addressed preview data. `LevelFactsV1` remains
the existing frozen root artifact; topology evidence, static analysis, paired
comparison, validity and measurement reports, curriculum data, and basic
dossier data do not become new root protocol schemas in this slice.

## Source-validity quarantine

Paired analysis runs a source-validity gate before either ruleset is allowed to
interpret the map. The gate follows the DATTools cell-validity policy pinned to
commit `68be18aca0dc42fa3929ff8160c6c8acea8c18e5`, specifically the policy in
`web/src/levelEditing.ts`, `src/dat/cc1Tiles.ts`, and
`src/dat/dat3dLevels.ts` in that repository. It records exact source
coordinates and file codes for:

- legacy invalid file codes;
- actors in the lower plane; and
- a nonactor upper tile, including Empty, masking meaningful lower terrain,
  except for the explicit DATTools 3D cases.

Invalid source is quarantined, not repaired or assigned invented gameplay
semantics. This is an intentional implementation of the decision that such
legacy layouts may be ignored.

A separate CCSolver source-scope guard excludes Tile World's six nonstandard
DAT extensions: `0x70` Sandbag, `0x71` Bowling Ball, `0x72` Cloud, `0x73`
Hook, `0x74` Ice Block, and `0x75` Pet Carrier. It applies on both planes and
all source layers, including Cloud in a 3D layer. These codes are not
misreported as DATTools cell-validity failures: they are valid engine
extensions that CCSolver deliberately declines to analyze. The guard runs
before corpus normalization, LevelFacts construction, paired analysis, and
runtime entry. The pinned corpus contains zero occurrences, so all P1B counts
and checked bytes remain unchanged.

| Raw DAT code | Expanded name | Tile World decoded catalog ID |
| --- | --- | --- |
| `0x70` | Sandbag | `MS_TILE.Sandbag` (`0x80`) |
| `0x71` | Bowling Ball | `MS_TILE.BowlingBall_Still` (`0x82`) |
| `0x72` | Cloud | `MS_TILE.Cloud` (`0x83`) |
| `0x73` | Hook | `MS_TILE.Hook` (`0x81`) |
| `0x74` | Ice Block | `MS_TILE.IceBlock_Static` (`0x84`) |
| `0x75` | Pet Carrier | `MS_TILE.PetCarrier` (`0x85`) |

The decoded IDs remain engine implementation details and do not enter solver
facts or runtime observations.

The full 2,440-occurrence audit found 55 invalid occurrences and 1,745 invalid
cells:

- 49 are in CCLP2; and
- six are paired CCLP5 Voting occurrences:
  `cclp5-voting-acrylic/018`, `cclp5-voting-darkness/030`,
  `cclp5-voting-eagle/009`, `cclp5-voting-juicy/015`,
  `cclp5-voting-juicy/036`, and `cclp5-voting-raspberry/030`.

The 1,745 current issue records comprise 123 invalid-file-code cells, 40
lower-plane actors, and 1,582 masked-lower-terrain cells. The report keeps
reason-signature counts separately so future overlapping reasons cannot be
mistaken for distinct cells.

Of 2,257 donor-paired occurrences in P1A, 2,251 therefore remain valid and
eligible for paired measurement. The validity report re-hashes every
referenced pinned DAT map source and member slice, retains complete
invalid-occurrence evidence, and contains no donor replay path, timing, seed,
or input metadata.

## Genuine target adapters and shared kernels

MS and Lynx have separate composition adapters. Each adapter projects the same
legacy source bytes through its own ruleset catalog and policy helpers. The
Lynx producer is not an MS result relabeled as Lynx: Lynx entry, exit, slide,
door, button, actor, and element interpretations come from Lynx seams.

The adapters deliberately share engine-neutral kernels for normalized
projection, `LevelFactsV1` construction, topology-evidence construction, and
static analysis. This keeps structural algorithms synchronized without erasing
ruleset policy. Architecture tests keep target implementation imports in the
composition layer and keep the shared kernels target-neutral.

The paired builder:

1. validates source structure;
2. builds independently bound MS and Lynx facts, topology evidence, and static
   analysis;
3. passes both bundles to the pure comparator; and
4. canonicalizes and content-addresses the comparison.

The comparator reports only three causal categories:

- `source-facts` when the target projections genuinely differ;
- `target-policy` for per-cell effective/supporting placement, entry, exit,
  classification, caveat, or occupancy differences; and
- `derived-from-policy` for static feature changes implied by target policy.

It rejects mismatched levels, geometry, analyzer revisions, content bindings,
target duplication, and downstream analysis differences that cannot be
explained by the target evidence. A north-west ice-corner ATDD case records the
known target-policy difference instead of normalizing it away.

## Measured corpus and identity isolation

The measured report's production scope covers all 2,251 valid paired
occurrences. Every case keeps its exact source feature vector, each target's
static feature vector and content references, and a compact comparison summary.
The checked report classifies 770 occurrences as static parity and 1,481 as
divergent under the explicit source-fact, target-policy, or derived-feature
comparison dimensions. This is a static-analysis result, not a claim that the
two engines use the same or different winning route.
P1B does not collapse these features into a scalar complexity score: later
selection and diagnosis must be able to explain which measured dimensions
mattered.

The source audit found 2,358 distinct normalized gameplay identities among all
2,440 occurrences, including 82 two-occurrence alias groups. Within the valid
paired population there are 2,183 distinct identities and 68 alias groups
covering 136 occurrences. Curriculum isolation therefore uses normalized
gameplay digest, not an occurrence path. For example, `cclp5/098` and
`cclp5-voting-immunity/042` are the same gameplay identity and cannot straddle
training and evaluation.

Measurement is donor-redacted. Measured cases contain occurrence identity,
validity, per-target donor-availability booleans, normalized gameplay identity,
exact static vectors, comparisons, and content references. Curriculum catalog
validation also receives donor-redacted pack/source occurrence metadata. No TWS
path, ticks, flags, seeds, moves, or decoded inputs are supplied.

## Frozen curriculum

The curriculum records the exact measured-corpus report digest and byte length
from which its selected training and evaluation cases were projected.

### Phase-A synthetic declarations

P1B freezes eight compact semantic source declarations:

1. `phase-a-straight-exit`;
2. `phase-a-wall-detour`;
3. `phase-a-fork-rejoin`;
4. `phase-a-chip-socket`;
5. `phase-a-key-door`;
6. `phase-a-alternative-exits`;
7. `phase-a-one-block-lane`; and
8. `phase-a-impossible-socket`.

Their ASCII rows use a small declarative vocabulary for player, floor, wall,
exit, collectible, socket, key, door, and block concepts. They are not yet DAT
fixtures and are not executable through either gameplay engine. P7 must add a
versioned compiler/fixture adapter and prove the resulting levels before these
cases can serve as solver acceptance tests. P1B validates only declaration
identity, structure, referential integrity, and frozen budgets.

### Donor-visible training

- `cclp1/001` — Key Pyramid
- `cclp1/005` — Facades
- `cclp3/013` — Road Block
- `cclp1/113` — Teleport Trouble
- `cclp3/035` — MonsterMaze

### Donor-hidden evaluation wave

- `cclp5-voting-initiative/032` — Probably The Worst Maze To Exist
- `cclp5-voting-halo/038` — Ripple
- `cclp5-voting-broadcast/020` — Between The Lines
- `cclp5-voting-darkness/031` — Panzerbon
- `cclp5-voting-wilderness/036` — Don't Try To Find The Answer...
- `cclp5-voting-zipline/034` — Maze Of The Year

`full-input` and `blind` are declared exposure policies. The generated
evaluation data is donor-redacted, but P1B does not provide a security boundary
that prevents a caller or developer from opening donor files elsewhere in the
repository. P8 must add audited, capability-enforced donor access before these
cases support a strong blind-evaluation claim.

## Provisional search budgets

P1B freezes one deterministic, size-based budget revision so later attempts can
be compared without retroactively changing their allowance. For `n` logical
cells:

- node expansions: `1,024 * n`;
- simulated decisions: `16 * node expansions`;
- replay decisions: `min(65,536, 64 * n)`; and
- deterministic attempts: one per target.

The declared safety cutoffs are 60 seconds and 512 MiB. Hitting either cutoff
is `infrastructure-inconclusive`, not evidence that the level has no solution.
These values are provisional policy constants, not measured solver-performance
claims and not mechanic-specific defaults.

## Goldens and proof boundary

The paired Key Pyramid (`cclp1/001`) golden contract binds the same pinned source
to MS and Lynx level facts, topology evidence, static analysis, basic dossier
data, and their explicit comparison. Synthetic ATDD covers policy parity and
known divergence; the all-valid-paired generation/check gate must measure every
eligible source deterministically before its checked files are authoritative.

The generator/checker owns these output paths:

- `ccsolver/corpus/p1b-validity-report.v1.json`;
- `ccsolver/corpus/p1b-measured-corpus.v1.json`;
- `ccsolver/corpus/p1b-curriculum.v1.json`;
- `ccsolver/fixtures/golden/p1b/cclp1-001/ms/`, containing facts, topology,
  analysis, and basic dossier data;
- `ccsolver/fixtures/golden/p1b/cclp1-001/lynx/`, with the same four products;
  and
- `ccsolver/fixtures/golden/p1b/cclp1-001/comparison/static-topology-comparison.v1.json`.

`npm run ccsolver:p1b:check` regenerates these values in memory and fails on
drift. `npm run ccsolver:p1b:generate` intentionally rewrites the checked
outputs when source pins or reviewed P1B policy change.

The full measured phase uses deterministic process shards rather than
single-process promise concurrency. The local generator/checker keeps its
bounded process-worker mode. CI uses a separate fixed-eight map/reduce proof:
one coordinator recomputes source validity and the canonical contiguous shard
plan, eight isolated jobs measure one shard each, and a reducer independently
recomputes the current plan and all 12 checked outputs. Every request and result
is canonical, content-addressed, and bound to the exact workflow commit, run,
plan, and occurrence interval; missing, extra, duplicated, stale, or foreign
artifacts fail closed. Timing and memory diagnostics remain outside canonical
result bytes.

On pull requests, the coordinator may reconstruct a shard from the trusted
merge-base only when the prior checked proof receipt is valid and the complete
causal request bytes are identical. The result is rebound to the current
manifest before use. GitHub artifact caches are never proof authority, and the
reducer still verifies the complete checked result. The coordinator, each
worker, and the reducer have explicit 10-, 45-, and 15-minute bounds,
respectively. Sharding and reuse change scheduling, not canonical output order
or the P1B evidence contract.

P1B still does not provide:

- semantic room or corridor decomposition;
- block destination, dead-square, deadlock, or solvability proof;
- runtime observation, causal events, checkpoints, or render projection;
- terminal-first goal graphs, contracts, or contextual witnesses;
- donor alignment, search, replay construction, or certification; or
- the dossier UI and generated media.

The immediate next slice at P1B completion was **P2A — Runtime Observation,
Checkpoint, and Render Projection Port**. It is now delivered; see
[P2A runtime observation](p2a-runtime-observation.md).
It establishes read-only runtime evidence and exact branch/restore behavior
for both rulesets before planning or search begins.

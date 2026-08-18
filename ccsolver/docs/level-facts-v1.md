# CCSolver level facts v1

Status: P0C1 contract. Names, shapes, canonical fixtures, and identity rules are
frozen for schema version 1.

## Purpose and boundary

`level-facts` is a deterministic, content-addressed description of the static
gameplay information visible at level import. It gives later decomposition,
solver, and dossier work stable source evidence without importing Tile World
parsers or numeric tile IDs into CCSolver.

The artifact is deliberately conservative. It records geometry, placements,
initial actors, resources and gates, exits, wiring, transports, forced
surfaces, hazards, and import uncertainties. It does not claim that a move is
legal, derive rooms or paths, record runtime events, define goals, or issue a
replay certificate. The target engine remains authoritative for behavior.

Facts are target-specific because MS and Lynx can interpret the same static
element differently. The normalized gameplay-map identity is target-neutral,
so facts for the two targets can still refer to the same imported map.

## Coordinate and geometry contract

- Coordinates are zero-based `(x, y, z)`.
- Geometry is a uniform `width × height × depth` grid, matching the native
  Hybrid level model.
- Legacy two-dimensional levels have `depth = 1`; Tile World's decoder z=1 is
  normalized to artifact z=0.
- Every dimension is positive. The product may contain at most 65,536 logical
  cells. Implementations must check this without integer overflow.
- `65,536 × 1 × 1` is valid; `257 × 256 × 1` is not.
- Placements and referenced coordinates must fall inside the declared grid.
- The independent static-placement work bound is 1,048,576, allowing up to 16
  strata/discriminated placements per logical cell at the maximum geometry.

## Identity chain

Identity is acyclic and is derived in this order:

1. Exact source-container and occurrence-member bytes receive SHA-256 blob
   references.
2. The import adapter emits canonical normalized gameplay-map bytes under a
   versioned, target-neutral source normalization profile. Their SHA-256 digest
   is the level's `normalizedGameplayDigest`.
3. A static placement hashes the normalized map digest, coordinate, stratum,
   semantic type, and discriminator.
4. An initial actor hashes its placement ID and complete normalized source
   actor order.
5. A wiring edge hashes the normalized map digest, kind, source declaration
   order, endpoint placement IDs, and discriminator.
6. The complete `level-facts` envelope receives its ordinary artifact digest.

No object embeds its own digest. A `level-facts` artifact does not reference a
`corpus-case`; corpus state points one way to the immutable facts artifact.

The normalized gameplay bytes are built from the shared source decoder before
target-fact interpretation. They include gameplay-bearing geometry, element
stacks and source state, time and collectible requirements, declared actor
order, and wiring. Display-only title, author, password, and hint text are excluded.
Changing display metadata therefore does not change map identity; changing a
cell, facing, actor order, connection, time limit, or requirement does.

## Source provenance

Provenance records:

- the source format and exact content blob;
- a repository path and pinned revision, an HTTP locator and revision, or a
  synthetic fixture ID;
- the ordered source members that form the occurrence, including grouped DAT
  layers;
- the import adapter and normalization profile revisions; and
- the exact normalized gameplay-map blob reference.

Durable provenance never contains a local absolute path or a generation
timestamp. HTTP content is cached by digest and is not a live dependency of a
solver or dossier run.

Repository paths are normalized repository-relative paths without `.` or `..`
segments. Every supplied occurrence member must verify byte-for-byte and occur
as a literal span of the claimed source container; primary decoded level bytes
must also be the z=0 occurrence member. This prevents facts from depending on
unrecorded source bytes.

## Placements and actors

Placement strata are `terrain`, `overlay`, `pickup`, `actor`, and `side`.
Semantic types are open, validated stable IDs so extension elements do not
require a protocol revision. Source catalog tokens remain available for
diagnosis, but normalized gameplay map bytes never expose Tile World numeric
tile IDs or treat an `ms:`/`lynx:` implementation name as the shared semantic
identity.

The actor array records a complete deterministic order. For DAT input, actors
listed in metadata field 10 retain that declared order, and omitted actors are
appended by normalized z, row-major coordinate, and source stack order. Each
actor also records whether it had a declared source-order entry; this keeps the
source fact distinct from the normalized complete order.

Wiring preserves source declaration order independently for each semantic wire
kind. Sparse orders are valid because they may reflect filtered or unresolved
source records; duplicate orders within one kind are invalid.

## Conservative feature indexes

Feature collections reference placement IDs rather than duplicating element
records:

- required collectibles, resource sources, and consume/possess/remaining-zero
  gates;
- terminal exits;
- explicit point-to-point wiring;
- transport networks, whose member order and routing policy are retained
  without fabricating pairwise edges;
- force and ice surfaces; and
- persistent or single-use hazards and known protection resources.

These indexes support queries and dossiers. They are not a substitute for the
ruleset's entry, exit, inventory, timing, collision, or device logic.

## Unknown and malformed source semantics

Unknown catalog elements are preserved with their source token and a stable
uncertainty record. They must never be silently reclassified as a wall, floor,
or another known element. Unresolved wiring, unsupported source features, and
invalid source conditions are likewise explicit closed variants with bounded
diagnostic text and coordinates.

Tile World may retain its runtime fallback behavior for malformed DAT input,
but the level-facts adapter consumes decoder diagnostics so its artifact tells
the truth about the original bytes.

## Verification

Synchronous protocol decoding validates the closed schema, ordering,
uniqueness, references, geometry budget, coordinate bounds, and cross-field
invariants. Hash-dependent verification is explicit and asynchronous:

- placement, actor, and wiring IDs are recomputed from their descriptors; and
- source, occurrence-member, and normalized-map blob references can be checked
  against supplied bytes at an ingestion boundary.

Canonical artifact bytes use the CCSolver Canonical JSON Profile v1 and have no
trailing newline. Protocol fixtures are synthetic unless separately identified
as execution evidence.

## Deferred work

P0C1 intentionally does not define topology, rooms, chokepoints, dead squares,
resource dependency graphs, semantic event journals, goals, plans, snippet
contracts, witnesses, donor alignment, search state, media, or replay issuance.
Those remain separate review slices built on this static evidence.

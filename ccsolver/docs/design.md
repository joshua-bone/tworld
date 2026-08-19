# CCSolver comprehensive design

## Status and authority

This is the canonical design for CCSolver. The repository version is the source
of truth. The accompanying [project plan](project-plan.md) orders the work but
does not override this document.

CCSolver is developed inside the GPL-2.0-or-later Tile World repository. It may
use Tile World's TypeScript engines, legacy C oracle, DAT/TWS codecs, checkpoints,
and renderer directly. Proprietary HybridCC2026 source never enters this
repository. Future Hybrid integration uses versioned files or a separate
process, with the private adapter implemented in HybridCC2026.

The [artifact kernel v1](artifact-kernel-v1.md) freezes the envelope,
canonicalization, corpus-case, replay-certificate, level-facts, and identity
shapes checked in under `ccsolver/schemas/v1/`. The detailed static contract is
in [Level facts v1](level-facts-v1.md). Names and shapes for later semantic
artifacts remain provisional until their own schemas are checked in. The
semantic roles and correctness boundaries in this document are design
decisions, not placeholders.

The pure terminal-first planner and exact contextual-witness executor are now
implemented as provisional P3 preview contracts. Their first dual-target real
slice and checked Key Pyramid review are documented in
[P3 terminal-first planning and contextual witnesses](p3-terminal-planning-and-witness.md).
The historical whole Key Pyramid P3 theory remains unresolved; only its
adjacent red-key leaf is forward-verified within that P3 artifact. P5 retains
that history rather than rewriting it, then publishes a separate pre-execution
candidate plan. Its continuous witnesses and replay certificates independently
prove that the selected implementation wins, while the plan itself remains a
candidate rather than being retroactively relabeled.

The first graphical evidence slice is implemented as a provisional P4A preview
and documented in [P4A graphical subgoal evidence](p4a-subgoal-evidence.md).
It derives deterministic semantic SVG and a static comparison page from checked
P3 bytes, with durable human review stored separately from regenerated machine
evidence. P4A does not upgrade the leaf into a complete solution.

The first complete-level slice is now implemented and documented in
[P5 certified route and P4B whole-level dossier](p5-p4b-key-pyramid.md). P5
checks complete MS/Lynx TWS bytes against both TypeScript and the isolated
native oracle. P4B verifies and consumes only the checked P5 bundle to emit the
unlisted, no-JavaScript-complete Key Pyramid dossier. Machine generation leaves
its human review status `unreviewed`.

## Executive summary

CCSolver turns a map and optional donor replays into an explicit theory of the
level: its rooms, resources, dependencies, hazards, irreversible choices,
subgoals, alternative strategies, and ruleset-specific behavior. It then uses
the real target engine to realize that theory as an input stream and certifies a
complete TWS from the original level start.

The central artifact is a semantic strategy recipe, not a translated donor
input stream. One strategy may compile differently for MS and Lynx. When the
rulesets permit the same causal plan, CCSolver prefers it. When they genuinely
require different plans, CCSolver represents both honestly. CCLP3 level 16,
Two Sets of Rules, is a required canary for this distinction: parity is a
preference, never a schema invariant.

A subgoal snippet is authoritative only when it runs from an exact checkpoint
of the complete original world. The dossier may crop the picture to the room of
interest; simulation remains full-map. A separately minimized microlevel is
useful for explanation and mechanics tests but does not prove that the same
snippet composes in the original level.

The static dossier site is a first-class development surface. Every active
level receives a human description, map overlays, strategy graph, subgoal
contracts, mandatory annotated entry/end state panels, MS/Lynx evidence,
optional bounded playback or focused animation where motion adds explanatory
value, current failures, and exact provenance. The site is public but unlisted:
its app-relative route is
`/ccsolver/`, deployed beneath the repository's configured Pages base path,
without links from the Tile World homepage or player navigation.

## Goals

CCSolver must:

- derive useful semantic facts from a level without requiring a donor replay;
- learn reusable game knowledge through checked-in motifs, tactics, heuristics,
  counterexamples, and reviewed dossiers;
- explain a level as human-readable subgoals and causal dependencies;
- use paired MS/Lynx donors as evidence without assuming either optimized route
  is the desired strategy;
- produce valid target-specific MS and Lynx TWS files from a semantic plan;
- prefer strategies with shared causal meaning across rulesets when reasonable;
- represent materially different ruleset plans without forcing false parity;
- reason backward from terminal outcomes while proving every realization
  through forward execution;
- isolate and repeatedly test short subgoals from exact reachable checkpoints;
- verify every accepted full replay through the TypeScript target engine and
  pinned native oracle;
- support donor-guided training, donor-hidden validation, and genuinely unseen
  level evaluation;
- publish deterministic, reviewable level dossiers with annotated subgoal
  entry/end states and focused animation when it adds explanatory value; and
- export engine-neutral, content-hashed strategy artifacts suitable for later
  compilation by HybridCC2026.

## Non-goals

The initial project does not aim to:

- implement another MS, Lynx, or Hybrid gameplay engine;
- prove a universal solver for every Chip's Challenge level;
- optimize scores or match donor best times before finding a robust valid win;
- require one input stream, route, or full plan to work in both legacy rulesets;
- treat a semantic state projection as proof of exact continuation equality;
- make a spatially cropped level an authoritative substitute for its source;
- encode arbitrary mid-level state into TWS;
- add CCSolver links or controls to the main Tile World player UI;
- build an in-browser dossier editor in the first version; or
- make maximum-size maps automatically solvable merely because they are valid
  inputs.

## Design principles

- The gameplay engine is the transition authority. Solver logic never carries a
  second implementation of tile legality.
- A full replay from canonical initialization is the final proof.
- Semantic plans explain intent; exact witnesses prove one realization.
- Terminal-first regression proposes obligations; only forward target-engine
  execution proves that they can be realized.
- Prefer parity where it exists; record divergence where it does not.
- Valid and robust comes before optimized.
- Coordinates alone are weak evidence. Causal events and resource state matter.
- Every inference states its evidence and confidence.
- Durable learning lives in the repository, not in an agent's transient memory.
- Derived reports are reproducible from pinned, content-hashed inputs.
- Searches, traces, media builds, and corpus sweeps are explicitly bounded.
- Human review is an intended part of the system, not a failure mode.

## Project boundary

CCSolver owns:

- corpus manifests and source provenance;
- static level analysis and semantic identity;
- normalized semantic observations and event journals;
- donor trace alignment and portability classification;
- goal graphs, expanded plans, contracts, tactics, and strategy recipes;
- exact contextual snippet execution using Tile World checkpoints;
- target-specific MS/Lynx search, TWS construction, and legacy certification;
- motif and heuristic libraries;
- dossier data, static pages, interactive playback, and derived media; and
- a documented external artifact/process protocol.

Tile World's existing runtime owns:

- DAT and TWS decoding and encoding;
- MS and Lynx transitions;
- replay-mode input behavior;
- exact engine checkpoints and restore;
- interactive frame projections;
- native C oracle execution; and
- the existing GitHub Pages deployment.

HybridCC2026 owns its private runtime adapter, semantic-ID binding, recipe
compiler, local Hybrid repair, native replay format, and final verification.
CCSolver does not import, link, or inspect private source.

## Existing foundation

The first implementation should adapt, not duplicate, these seams:

- `web/src/content/api/solutionFileFormat.ts` parses and serializes TWS files.
- `web/src/game-runtime/ports/InteractiveGameEngine.ts` starts, advances,
  restores, and hydrates interactive or replay sessions.
- `web/src/undo-runtime/` captures exact, digest-bearing MS/Lynx checkpoints and
  forkable timelines.
- `web/src/player-web/impl/legacyCanvasMapRenderer.ts` and
  `legacyCanvasHud.tsx` provide deterministic legacy rendering. The current
  map-only helper is a focused viewport, so dossiers also need a dedicated
  zoomable whole-level renderer.
- `web/src/replay-verifier/` and the native oracle certify legacy replays.
- `.github/workflows/github-pages.yml` already publishes `web/dist`.

CCSolver becomes a root npm workspace named `@tworld/ccsolver`. Its domain code
must not depend on React, canvas, or ruleset implementation modules. Those
dependencies live behind adapters.

The repository root is the sole npm project and lockfile authority for the
`web` and `ccsolver` workspaces. Local development, CI, and Pages install once
from the root lock. The private `web` workspace composes concrete Tile World
adapters and depends one way on the narrow `@tworld/ccsolver` package; CCSolver
never imports private web aliases. Architecture tests keep engine/catalog
imports in `web/src/ccsolver-runtime/compose`, while its `impl` and `ports`
remain engine- and host-neutral.

## Architecture

```text
DAT / local TWS / documented external sources
                    |
                    v
          corpus and provenance adapters
                    |
          +---------+----------+
          |                    |
          v                    v
   static LevelFacts     semantic event traces
          |                    |
          +---------+----------+
                    v
       level theory and terminal-first GoalGraph
                    |
                    v
              StrategyPortfolio
                    |
          +---------+----------+
          |                    |
          v                    v
  target execution/search   dossier generator
          |
          v
   complete MS/Lynx TWS
          |
          v
 TypeScript replay + native oracle certificate
```

The intended package layout is:

```text
ccsolver/
  README.md
  package.json
  docs/
    design.md
    project-plan.md
  schemas/
  src/
    domain/
    application/
    ports/
    adapters/
      tworld/
      oracle/
      bitbusters/
    analyze/
    align/
    plan/
      regression/
    snippets/
    search/
    render/
    site/
    cli/
  corpus/
    manifest.json
    levels/<stable-level-id>/
  fixtures/golden/
  generated/       # ignored
  .cache/           # ignored

web/src/ccsolver-runtime/
  ports/             # narrow package/facade declarations
  impl/              # engine-neutral projections and adapters
  compose/           # Tile World ruleset/catalog/repository composition
```

The domain layer contains only typed semantic values and pure transformations.
The `plan` and `snippets` layers are likewise pure. Planning may depend only on
reviewed domain/static-analysis surfaces; snippets may depend only on domain,
planning values, and runtime ports. Both expose narrow package entrypoints, and
architecture tests reject imports from host, renderer, ruleset, or application
implementation layers.
Adapters translate the existing engines, codecs, files, API responses, and
renderer projections into those values. Composition roots select concrete
adapters for CLI, tests, dossier generation, or CI.

## Time and input domains

CCSolver never assumes one universal tick rate. Every exact witness declares
its target ruleset, native tick origin, frequency, replay mode, seed, stepping,
and random-slide state where applicable. MS and Lynx TWS currently use their
native 20 Hz time domain; a future Hybrid adapter consumes 100 ms decisions.

Semantic alignment treats timing as evidence, not identity. Events such as
collection, door consumption, button activation, or arrival at a region are
stronger anchors than equal tick numbers.

The runtime port must advance recorded replay decisions, including an explicit
no-change tick, under true replay-mode semantics. It cannot replace a donor
future with manual-input behavior accidentally. Target witnesses store decoded
relative input events; CCSolver assembles and encodes one complete TWS rather
than concatenating binary fragments.

Generated solutions prefer ordinary directional controls. Existing mouse and
diagonal donor inputs remain representable and are flagged as ruleset-specific
evidence. Any generated use of them is explicit in the quirk ledger.

## Corpus and provenance

The P1A corpus manifest is generated from 193 exact source files pinned by byte
length and SHA-256 at Tile World commit
`42c78d0db343621f887fefce581315479d9a8be3`:

- 2,440 official CCLP1-through-CCLP5 and CCLP5-voting map occurrences,
  represented by 4,880 separate MS/Lynx target records;
- 2,257 exact same-map entries with both MS and Lynx donors;
- 562 paired official entries: 149 each from CCLP1, CCLP3, and CCLP4,
  plus 115 from CCLP5;
- 1,695 paired entries across 34 CCLP5 voting packs;
- 4,664 donor-backed target records in total: both targets for the 2,257
  paired cases plus 150 MS-only cases;
- no direct level-number pairing between the CCLP2 MS pack and CCLXP2 Lynx
  pack: their pack/map bytes differ, so cases are paired only where generated
  canonical gameplay-map digests actually match.

The generator recomputes these denominators from pinned bytes, checks them as
acceptance invariants, and reports them per pack. The checked-in canonical
manifest is repository truth for this corpus revision; changing a source pin or
registry entry requires an intentional regeneration and review.

P1B applies the DATTools cell-validity policy before target interpretation.
That audit quarantines 55 invalid occurrences: 49 from CCLP2 and six paired
CCLP5 Voting occurrences. Quarantine means that CCSolver retains exact evidence
but neither repairs the bytes nor invents gameplay semantics. It leaves 2,251
valid paired occurrences for cross-target measurement. Duplicate-map and
curriculum isolation use the normalized gameplay digest rather than occurrence
paths; aliases therefore cannot leak the same map across training and
evaluation cohorts.

The older HybridCC-Python repository separately contains 470 audited winning
replays, 391 overlapping this paired queue. Those private-repository wins are a
planning baseline only: they are not among the 193 Tile World source pins and
do not appear in the P1A manifest.

Each implemented P1A manifest map record contains:

- a stable occurrence ID and canonical level-content digest;
- exact DAT member paths, byte spans, lengths, and SHA-256 digests;
- pack/level metadata plus the DAT normalization profile and gameplay digest;
- one ordered target record for MS and one for Lynx; and
- an optional donor reference per target containing its TWS path, entry ordinal,
  entry digest/length, password, ticks, flags, seed, stepping, random-slide
  state, move count, and diagonal/mouse-input indicators.

The manifest does not yet execute or oracle-validate donors, reference static
analysis or strategy artifacts, or track solving attempts and certificates.
Those mutable workflow facts belong in the separate versioned `CorpusCaseV1`
ledger established by the artifact kernel. As solving begins, each target's
ledger state will retain its own attempts, candidate replay, certificate
lineage, and explicit status; any aggregate display status remains derived.

Initial statuses are `awaiting-import`, `import-blocked`, `ready`,
`analyzed`, `candidate-generated`, `needs-local-repair`, `needs-route-replan`,
`solved-current`, `needs-reverify`, and `excluded-reviewed`. Exclusion requires a
reviewed technical reason and retained evidence.

External level ingestion uses documented endpoints, fetches explicitly, caches
content-addressed bytes, and records source metadata. Live APIs are never a
runtime dependency of a dossier or solver run.

## Semantic identity and level facts

All domain coordinates are zero-based `(x, y, z)`. Legacy 2D levels use one
normalized z layer. A map may contain up to 65,536 logical cells total across
all z layers so artifacts can later describe Hybrid maps, although early
automatic search is optimized for legacy 32-by-32 levels.

Stable IDs are semantic and source-derived:

- static placements use normalized map digest, coordinate, cell stratum, type,
  and a placement discriminator;
- static wiring uses normalized map digest, semantic kind, source declaration
  order, source/target placement identities, and a discriminator;
- initial actors use placement identity plus source actor order;
- spawned actors use deterministic lineage, such as source plus clone ordinal;
  and
- repeated semantic events carry occurrence ordinals.

When exact actor correspondence is irrelevant or differs by ruleset, contracts
use typed selectors such as “some movable block occupies region B” rather than
inventing false identity.

The versioned static `LevelFacts` artifact includes:

- geometry, cell strata, elements, actors, inventory sources, and terminal
  tiles;
- keys, doors, chips, sockets, boots, hazards, bombs, and consumable resources;
- buttons, traps, cloners, and wiring;
- force-floor and ice placements, teleport networks, and exits; and
- source uncertainties that must not be silently normalized away.

P1A adds target-specific topology evidence without changing `LevelFactsV1`.
Every logical cell records effective/supporting placement exposure, directional
entry and exit policy, an `open`, `blocked`, `conditional`, `dynamic`, or
`unknown` classification, typed caveats, and initial occupancy. The evidence is
bound to exact level-facts content, target, level identity, geometry, and policy
revision. A complete, disjoint effective/supporting partition prevents silent
placement omission.

The pure P1A analyzer derives a certain-open directed graph, weak connected
regions, iterative articulation points, conditional/dynamic/unknown boundaries,
candidate resource dependencies, ordered transport incidences, region
attachments, explicit uncertainty, and exact count features. Unknown or
conditional evidence never becomes certain connectivity; cardinal adjacency
never crosses z layers implicitly. The analyzer uses policy evidence rather
than raw tile IDs or semantic-type name matching.

This initial graph is not yet a semantic room decomposition or solvability
proof. P1B does not add block destinations or dead-square proof. Later
static-analysis and mechanics slices add capability-dependent routing, block
destinations and dead squares, forced conduits, irreversible actions, suspected
deadlocks, and reviewed puzzle-area structure. Keeping imported observations,
target policy, and deductions separate makes every dossier claim traceable and
lets improved analyzers coexist with the same source facts.

Static facts are conservative. The target engine decides whether a concrete
move is legal.

P1A's Intro level 8 golden remains the historical MS vertical slice. P1B adds a
genuine Lynx projection and topology-policy producer. The MS and Lynx adapters
use their own catalog policies while sharing engine-neutral projection,
`LevelFactsV1`, topology, and static-analysis kernels. A pure paired comparator
classifies differences as source facts, target policy, or features derived from
target policy and rejects unexplained downstream divergence. Key Pyramid is the
paired golden target for both pipelines and the comparison.

P1B's donor-redacted measurement runner has a production scope of all 2,251
valid paired occurrences. It retains exact source and target feature vectors
rather than inventing a scalar complexity score. The frozen first curriculum
contains eight declarative Phase-A ASCII sources, five donor-visible training
cases, and six donor-hidden evaluation cases, with cohort isolation by
normalized gameplay identity and provisional size-based budgets. The ASCII
sources are not yet executable engine fixtures. `blind` is a declared exposure
policy, not an enforced donor-access capability; P8 supplies that enforcement
and audit.

`LevelFactsV1` remains part of the frozen artifact kernel. Topology evidence,
static analysis, paired comparison, P1B reports and curriculum, and basic
dossier data remain canonical content-addressed preview shapes rather than new
root artifact schemas. See [P1A pinned corpus and static
analysis](p1a-static-analysis.md) and [P1B cross-ruleset topology and
curriculum](p1b-cross-ruleset-topology.md).

## Semantic observations and causal events

CCSolver needs a delta-oriented, non-mutating observer for both TypeScript
engines. It records realized facts rather than dumping a full map each tick.
Events include:

- input applied or held;
- actor move planned, blocked, started, and finished;
- player cell/region entry and exit;
- push plan and each block displacement;
- pickup, inventory change, key/door use, chip count, and socket removal;
- force, ice, teleport entry/relocation/exit, and control changes;
- button, trap, cloner, tank, toggle, and map mutations;
- actor spawn, lineage, collision, destruction, and player death;
- RNG draws or rotor changes at semantically relevant call sites; and
- win, loss, timeout, and final replay result.

Every event has a stable kind, source and subject identities when applicable,
before/after coordinates, native tick/boundary, causal plan or command ID, and a
bounded payload. Observation must not affect transition results, RNG, ordering,
or state hashes. Overflow is explicit and invalidates analysis rather than
silently omitting proof-critical events.

Three distinct identities are useful:

- an exact restore digest for the opaque engine checkpoint;
- a future-facing continuation digest containing all state that can affect
  subsequent gameplay; and
- a normalized semantic digest for alignment and heuristic comparison.

Only exact continuation equality can justify native suffix reuse. Semantic
equality can justify resuming a tactic or recipe, followed by full verification.

## Strategy portfolio and parity

A `StrategyPortfolio` may contain several plan families. Each family records
orthogonal fields rather than forcing one label to carry several meanings:

- `planShape` describes its relationship to other target plans;
- `targetRulesets` and per-target evidence say where it has been exercised;
- named `dependencies` identify required quirks or mechanics; and
- `resolution` is `proposed`, `partially-verified`, `verified`, `unresolved`, or
  `unsupported`.

The initial `planShape` values are:

- `shared-plan`: the same causal goals and order work in both rulesets;
- `parallel-implementation`: one semantic subgoal has different local movement
  or timing implementations;
- `alternative-branch`: rulesets take different branches that later reach a
  shared milestone;
- `different-plan`: the material goal order or causal strategy differs.

A family of any shape may additionally be quirk-dependent. That dependency is
named and evidenced instead of replacing the plan-shape or resolution field.

CCSolver prefers, in order: a robust shared plan without quirks; a shared plan
with localized target implementations; target-specific robust plans; then a
clearly documented quirk-dependent plan. Validity and reasonable slack outrank
artificial parity or score optimization.

Two Sets of Rules, CCLP3 level 16, must prove that a dossier and compiler can
carry materially different MS and Lynx plans without describing one as a failed
translation of the other.

## Goal graph and realized execution

The explanatory dependency graph and executable run are related but distinct:

- `GoalGraph` is an AND/OR graph of semantic prerequisites, alternatives,
  resource constraints, and milestones.
- `ExpandedPlan` instantiates a selected route as an acyclic graph. Repeated
  operations receive distinct occurrence IDs or a bounded macro that expands
  before execution.
- `ExecutionWitness` is the target-specific linear sequence actually compiled
  and replayed.

A level may revisit a room, oscillate while waiting, or operate a cloner many
times. Those loops belong in tactics or expanded occurrences; the dependency
graph must not imply that revisiting space creates a logical cycle.

## Terminal-first goal regression

CCSolver begins high-level decomposition from the desired terminal state. Each
eligible exit creates an alternative root goal such as `ReachExit` together
with the target-specific conditions for winning there. A closed, declarative
operator schema identifies effects that can establish the desired predicates,
then regresses them into predecessor obligations: requirements, invariants,
resource flow, actor or block stance, time bounds, and predicates that the
operator must not clobber. The result is an AND/OR `GoalGraph`; a selected
`ExpandedPlan` remains ordered for forward execution.

Regression records durable derivation provenance. Each inferred edge identifies
the desired postcondition, selected achiever, residual prerequisites,
alternatives considered, rejected contradictions, target scope, operator
revision, supporting static/runtime/donor evidence, assumptions, and unresolved
facts. Initial derivation values distinguish `authored`, `forward-derived`,
`backward-regressed`, `bidirectional-joined`, and `donor-inferred`. These fields
explain why a subgoal exists without claiming that the inference is executable.

The pure regression kernel belongs under `ccsolver/src/plan`. Its
operators describe semantic effects, requirements, resource consumption,
footprints, and target scope; they do not reproduce tile-entry legality. Runtime
tactics later bind those operator meanings to forward engine execution. The
initial vocabulary stays narrow—terminal, region, resource, gate, actor/block
location, and time predicates with `ReachExit`, `Reach`, `Collect`, and `Unlock`
achievers—then expands only through focused evidence.

Backward reasoning is semantic constraint regression, not reverse gameplay
simulation. Collection, doors, sockets, bombs, cloning, and other mutations
discard information; blocks cannot be legally pulled merely because a reverse
push picture is convenient; transports and forced movement may be many-to-one;
and actor order, time, and RNG are not generally invertible. Reverse-pull block
analysis may identify dead squares or candidate push chains, but it never
becomes a legal move. Monster, device, deadline, and RNG reasoning produces
explicit control, clearance, lower-bound, seed, or phase obligations that must
be realized forward.

Planning may compare two abstract frontiers:

- a backward obligation frontier grown from a terminal alternative; and
- a forward reach, capability, and resource frontier grown from initial facts.

A compatible predicate set is an `abstract-meet`, not an `exact-join`. CCSolver
must still obtain a reachable checkpoint and execute the candidate subgoals
forward through the real target engine. Exact joins, complete replay execution,
and native-oracle certification retain their existing authority. Exact
bidirectional engine search is allowed only in a deliberately bounded,
reversible microdomain whose predecessor table was itself generated and checked
through forward transitions.

Donors are optional ranked evidence. A donor-blind attempt can build the graph
from level facts, target policy, and terminal requirements. When donor exposure
is allowed, hard anchors may be traversed backward from the donor terminal to
suggest missing prerequisites or alternatives, but optimized quirks do not
override a simpler robust causal plan. MS and Lynx regression occurs separately
where target policies differ, then shared semantic structure is retained only
where honest.

## Subgoal contracts

A `SubgoalContract` uses a closed, versioned predicate vocabulary. It contains:

- stable ID, title, human description, motif tags, and authoring provenance;
- `requires` predicates;
- `ensures` predicates;
- `invariants` that must hold throughout;
- ordered or unordered semantic event assertions;
- `must-change`, `may-change`, and `must-not-change` footprints;
- forbidden event patterns;
- a semantic stop predicate and maximum native ticks/work;
- ruleset applicability and known dependencies; and
- evidence coverage, ruleset scope, and robustness grades.

Initial predicates cover player or actor location/region, inventory capability
and counts, remaining chips, static placement state, actor life and facing,
block occupancy, wiring/channel state, terminal state, time bounds, and opaque
seed/phase binding when truly required. Arbitrary JavaScript predicates are not
durable corpus data.

The initial P3B implementation covers predicates and noncausal boundary-change
footprints that can be evaluated from P2A observations. Ordered or causal event
assertions remain inactive until P2B supplies the complete semantic journal;
P3B does not infer collection, opening, or device causality from coincident
before/after changes.

Evidence coverage is `single-witness`, `reachable-envelope`, or `exhaustive`.
The last is used only when a finite start space was actually enumerated.
Ruleset scope is recorded separately as MS, Lynx, both independently, or a
future target set. One successful checkpoint never implies universal validity,
and two single witnesses do not become exhaustive evidence merely because they
cover both legacy rulesets.

## Contextual snippets

The authoritative snippet artifact is temporal:

```text
source level + ruleset + seed + certified prefix + boundary
                         |
                         v
               exact full-world checkpoint
                         |
                  relative decisions
                         |
                         v
             asserted events and end state
```

Durable source data stores the prefix identity, boundary, entry digest, relative
decisions or tactic reference, event assertions, end digest, and contract. Raw
engine checkpoint objects are cache entries keyed by engine build; they are not
a stable checked-in format.

The delivered P3B preview stores content references for exact entry/end
observations and semantic renders plus a sorted `observedChanges` boundary
delta. It intentionally has no causal event assertions yet. It executes an
uninterrupted run and an independently restored checkpoint branch in lockstep;
only complete exact agreement can verify the leaf.

During focused development, a persistent worker replays the prefix once, caches
the checkpoint, and repeatedly restores it to test only the short interval. The
renderer crops to the causal region while the engine retains the whole map.

A `ReducedScenario` is constructed only after the contextual witness works. It
may be found through causal slicing or delta reduction and is labeled
`illustrative` unless independently proved against the original continuation.

## Subgoal visual explanations

Every target-specific semantic subgoal has a reviewable visual explanation.
Its mandatory form is a pair of annotated static map sections:

1. **Starting State**, bound to the expected entry predicates and, once a
   contextual witness exists, its exact entry observation, boundary, and digest;
2. **Ending State**, bound to the expected postconditions and, once executed,
   the observed end or first-failure observation, boundary, and digest.

Expected and observed state are separate dimensions. A proposed ending may be
shown before it has a witness, but it is visibly labeled as expected and cannot
be presented as observed or verified. When expectation and observation differ,
the view highlights the failed predicate, unexpected event, or changed cell.

The provisional `SubgoalEvidenceView` binds the level, facts, plan, subgoal,
target ruleset, contract, contextual witness when available, state-observation
references, and renderer revision. Its first implementation defines one fixed,
bounded causal crop shared by entry and end. Future bounded insets may show
remote buttons, devices, actors, teleport destinations, or other offscreen
dependencies. Map panels are accompanied by a compact summary of important
nonspatial state such as inventory, remaining collectibles, time,
channel/device state, actor order, and RNG/phase bindings.

Overlays are semantic data rather than painted pixels. Initial primitives cover
player and mob route polylines, numbered waypoints and event anchors, points of
interest, regions, wiring and transport edges, state-change highlights, and
`must-change`, `may-change`, and `must-not-change` footprints. Every primitive
has stable placement, actor, event, predicate, or coordinate references where
available; a concise label and textual equivalent; target scope; provenance;
and a basis such as `regressed-requirement`, `backward-candidate`,
`plan-intent`, `observed-witness`, or `donor-evidence`. Planned, donor, backward,
and witnessed paths remain visually and semantically distinct.

Where both planning directions contribute, the ending panel shows the backward
obligation cone, the starting panel and route overlay show forward reach or the
forward witness, and any compatible frontier is labeled as an abstract meet.
The view must expose unresolved obligations between those layers rather than
drawing one apparently continuous proven route before a witness exists.

The causal viewport is derived from referenced routes, points of interest,
changed cells, footprints, and remote endpoints with a bounded margin. Large
worlds use tiled viewports and insets rather than an unbounded full-resolution
bitmap. Cropping never changes simulation: observed entry/end base maps and
observed routes come from exact full-world execution. Expected-only panels are
plan projections, visibly labeled as such, and acquire observed status only
from a contextual witness. Human review notes and overrides are a separate
layer so regeneration cannot silently overwrite feedback.
Review state is `unreviewed`, `reviewed`, or `changes-requested`; it gates the
reviewed dossier/canary claim, not the mechanical validity of an independently
certified replay. Machine evidence does not embed its review state because that
would create a content-address cycle. A resolved page validates a separate
`ReviewStateV1` against the exact evidence and witness content references.

`ccsolver/src/render` owns the engine-neutral view model, validation, canonical
ordering, deterministic semantic SVG, and generated textual equivalent. A Tile
World composition adapter binds exact MS/Lynx observations, frames, and stable
identities to that model. The P4A exporter intentionally renders literal
semantic item stacks rather than inferring hidden terrain or importing live
canvas/tile-art behavior. Future pinned exporters may add SVG/PNG poster frames,
frame sequences, GIF/WebM, and a content-addressed media manifest from the same
scene. Compressed-media byte identity is required only inside its pinned
exporter environment.

Static entry and end panels remain required even when animation is valuable.
Interactive playback, GIF, video, or a contact sheet is a derived explanation
between those keyframes, never the semantic authority. The view model remains
provisional even after the failed synthetic and real dual-target contextual
witnesses exercise it; it does not enter the frozen root artifact protocol
merely because the renderer can display it.

## Join semantics and composition

Every plan edge has one join state:

- `exact-join`: the predecessor's exact continuation state is the tested entry;
- `replanned-join`: the successor tactic was regenerated and succeeded from the
  actual predecessor state;
- `semantic-only`: declared predicates appear compatible but no live composed
  run has succeeded; or
- `broken`.

The dossier never presents `semantic-only` as a completed replay.

Static implication from one contract's `ensures` to the next contract's
`requires` is useful but insufficient. Accepted composition requires that:

1. all selected capsules execute consecutively through one live full-world
   target state;
2. every contract, invariant, forbidden-event check, and bound passes;
3. the resulting input plan encodes and decodes through the TWS codec; and
4. the complete TWS wins from the real level start in both the TypeScript target
   engine and pinned native oracle.

CCSolver never concatenates TWS byte fragments and never assumes matching player
coordinates permit suffix attachment.

## Engine port

The domain-facing `SolverRuntimePort` requires operations equivalent to:

- load and identify a level;
- start manual or true replay-mode execution;
- advance one recorded native decision or no-change tick;
- run to a bounded tick or semantic predicate;
- capture, clone, restore, and dispose an opaque exact checkpoint;
- obtain exact, continuation, and semantic fingerprints as available;
- project static facts and a normalized semantic observation;
- drain bounded causal events and state deltas;
- report player control, transit, eligibility, and input-influence state;
- evaluate canonical input candidates authoritatively by restoring a checkpoint,
  advancing the real engine, observing the result, and restoring again; and
- project a deterministic render frame or region.

The current interactive port already covers session start, replay start,
advance, and restore. CCSolver adapters may use engine-internal typed seams for
performance, but the domain does not import ruleset implementation modules.

Search uses TypeScript checkpoints in its inner loop. The legacy C oracle is a
bounded final and diagnostic authority, not a subprocess invoked for every
search successor.

A pure planner probe is an optional performance optimization, not a required
runtime capability. If added, differential tests must prove it equivalent to
checkpoint-and-advance evaluation and that it consumes no RNG or mutable state.
Native diagnosis initially adapts the oracle's existing bounded/window trace
commands; a new semantic exporter is justified only by measured gaps.

## Donor normalization and alignment

Donor analysis extracts realized semantic events from the exact MS or Lynx run.
It does not align raw TWS commands, state hashes, tile IDs, actor array indexes,
or raw timestamps directly.

Anchors have evidence strength:

- hard: irreversible events at the same stable placement, such as a unique
  pickup, door/socket consumption, block displacement, device mutation,
  teleport pair, or terminal;
- medium: region/chokepoint crossings combined with projected resources and
  mutable-map facts; and
- soft: player coordinate/facing, used only for visualization and search bias.

Weighted sequence alignment permits one-to-many spans for forced movement and
retains event occurrence ordinals. Divergent donor spans remain alternative
edges until a target run proves a valid rejoin.

Waits are semantic when possible: wait until a corridor clears, a block reaches
a region, or a device state changes. A bounded relative delay is a fallback and
retains its donor provenance. Timing-dependent actor and RNG landmarks cannot
be compressed away.

## Solver strategy

CCSolver develops in layers:

1. seed one terminal alternative per eligible exit and regress its semantic
   requirements toward the initial state;
2. compare the backward obligation frontier with forward static reach,
   capability, and resource facts, retaining alternatives and contradictions;
3. select a causal plan and realize it forward through target-specific tactics,
   initially without donor input when the evaluation mode requires that;
4. when donor exposure is allowed, use realized visits, hard anchors, and
   aligned MS/Lynx branches as ranked evidence, validation, or repair hints;
5. repair the first failed subgoal with bounded input/timing search from an
   exact checkpoint, or search forward between semantic anchors;
6. re-regress room, resource, and dependency choices when local repair cannot
   realize the selected obligations; and
7. use human/AI takeover to create or correct tactics for residual cases while
   preserving the rejected hypotheses as evidence.

Backward reach and distance indexes may be derived from target-specific
directed adjacency, but conditional or dynamic boundaries create obligations
rather than certain reverse edges. Forced surfaces, teleports, gates, blocks,
monsters, and RNG retain their explicit target-policy and uncertainty records.
An abstract frontier meet can prioritize forward work; it cannot splice or
certify a suffix.

Initial local search uses deterministic beam search or weighted A*. Candidate
actions are generated only at engine-declared input-influence boundaries when
safe. Heuristics may use donor edit distance, furthest achieved anchor, static
distance, resource mismatch, threat, deadlock, and time slack, but transition
legality always comes from the engine.

The first action alphabet includes no change, four cardinals, target-supported
diagonals, explicit release/hold behavior, and a separately classified mouse
action where legacy behavior requires it. Probe-equivalent candidates may share
one successor evaluation.

Search nodes keep a fast, versioned solver fingerprint, costs, parent, and
action. That fingerprint is a pruning hint only. SHA/canonical comparison and
full replay verification certify results. Full-state clone pools are acceptable
for the legacy MVP; copy-on-write pages or complete reversible journals are
deferred until measurement justifies their complexity.

## Durable learning and evaluation

CCSolver cannot depend on an agent retaining informal memory between sessions.
Reusable understanding is checked in as:

- mechanic and motif definitions;
- static detectors;
- tactics and plan templates;
- search heuristics and bounded defaults;
- positive examples, counterexamples, and deadlock patterns;
- reviewed natural-language explanations; and
- regression cases tied to the behavior they teach.

Examples include key/door routing, chip/socket dependencies, block ferries,
button invariants, teleport networks, forced-floor nailing, monster gates,
cloner production, and Sokoban dead squares.

Every attempt records separate dimensions:

- donor availability: paired, single-ruleset, or none;
- donor exposure: blind, terminal-only, semantic-guided, or full-input;
- construction method: from-scratch, tactic-composed, semantic-guided,
  input-translated, or manual-assisted; and
- evaluation cohort and frozen budget revision.

The same level may accumulate attempts in several modes without rewriting the
earlier evidence. Holdouts are organized as frozen evaluation waves. Once a
case's donor or reviewed solution is revealed, it becomes training evidence and
cannot remain in an untouched holdout; a later wave is frozen before further
tuning. A lesson counts as generalization only when, under the same declared
budget, it newly certifies a different frozen case or advances it to a
predeclared semantic anchor. Failed blind attempts remain append-only evidence.
The P1B evaluation wave is donor-redacted and labeled `blind`, but that label
does not become a strong isolation claim until P8 restricts and audits donor
access as a capability.

## TWS construction and certification

One semantic plan compiles independently for each target ruleset. Each compiler
run binds the exact level bytes, ruleset, seed, stepping/phase state, plan
revision, engine build, solver configuration, and deterministic search seed.

Acceptance requires:

1. the selected capsules execute live from the initial TypeScript state;
2. the recorded input stream reaches the expected terminal result;
3. serialization and parse round-trip preserve the intended replay;
4. replay-mode execution wins again in the TypeScript target engine;
5. the pinned native oracle wins from level start; and
6. the certificate records terminal tick/result, relevant final facts, input and
   artifact digests, tool revisions, and lineage.

Donor time is not an optimization requirement. Initial solutions must satisfy
the level deadline with reasonable slack. Score and route optimization are
separate later passes that may never replace the robust accepted replay.

## Dossier model

Normative dossier inputs are canonical JSON plus reviewed Markdown. HTML, SVG,
frame sequences, GIFs, and videos are generated and content-addressed.

The master page shows:

- active levels and corpus backlog;
- filters for pack, mechanic, donor exposure, construction method, per-target
  status, and portability;
- analyzed subgoals, join state, MS/Lynx certification, and review status;
- current failed subgoal and next action; and
- progress computed from artifacts, never hand-entered totals.

Each level page contains:

1. identity and provenance;
2. a human-language puzzle and room description;
3. a zoomable whole-level map with coordinates, layers, wiring, teleports,
   forced networks, regions, resources, and path overlays;
4. the semantic goal graph and an accessible equivalent table;
5. one card per target-specific subgoal containing its contract, derivation,
   evidence, footprint, join, failures, and a mandatory annotated **Starting
   State** panel;
6. optional bounded interactive playback or derived animation when motion adds
   explanatory value, followed by the mandatory annotated **Ending State** or
   actual failure panel;
7. planned, regressed, donor, and observed player/mob routes, points of
   interest, offscreen dependency insets, and pre/post state and event deltas;
8. optional semantically synchronized MS/Lynx playback with independent clocks;
9. a ruleset-quirk ledger; and
10. downloadable verified TWS files and certificates where available.

Stable app-relative routes use IDs such as
`/ccsolver/levels/cclp3/016-two-sets-of-rules/`. Production prepends Vite's
configured `BASE_PATH` (currently yielding `/tworld/ccsolver/...` on project
Pages). The CCSolver master index and level pages are included in the GitHub
Pages artifact but are not linked from the main Tile World page, player
navigation, or sitemap. Generated pages include `noindex` metadata. This is
obscurity for convenience, not access control. Static directory URLs and the
SPA `404.html` fallback are tested as distinct deployment paths.

## Playback and media

When bounded motion evidence is retained, the primary motion-review UI replays
deterministic frame data through the existing canvas renderer and supports play,
pause, frame step, speed, semantic-anchor jumps, and synchronized comparison.
Semantic alignment is the default; raw tick and wall-time modes remain
available for mechanics diagnosis.

Every subgoal always renders the static Starting State and Ending State panels
from the same `SubgoalEvidenceView`. Animation supplements rather than replaces
those comparison frames. A deterministic selection policy recommends animation
for timing-sensitive movement, multiple relevant actors, remote effects,
forced/transport sequences, or route-order ambiguity; an authored override may
accept or reject the recommendation with a reason.

A selected short animation uses:

- the same fixed causal viewport and insets while the complete world simulates;
- ruleset, level, subgoal, tick, and input labels;
- relevant cells, actors, routes, event anchors, and state changes highlighted;
- a short entry and end hold; and
- the required static panels and equivalent prose as poster/accessibility
  alternatives.

When motion review is selected, long snippets prefer interactive playback plus
an optional WebM/MP4 or contact sheet rather than an enormous GIF. Pages honor
reduced-motion preferences and do not autoplay. Bulk compressed media remains
derived; the contract, witness, semantic scene, and static keyframes carry the
reviewable truth.

Media generation uses explicit simulation ticks, fixed tilesets and scale,
disabled smoothing, a pinned headless browser and encoder, stripped metadata,
and no wall-clock timestamps in content-addressed output.

## Generated and checked-in artifacts

Check in:

- schemas and canonical examples;
- corpus manifests and per-level source metadata;
- semantic facts, plans, contracts, tactics, narratives, and reviews;
- small golden contextual-witness derivations;
- verified TWS outputs or reproducible pack-level output manifests; and
- certificates, lineage, and reviewed exclusions.

Do not check in by default:

- opaque engine checkpoints;
- expanded full traces;
- search frontiers and caches;
- generated HTML bundles;
- bulk GIF/video output; or
- downloaded third-party source bytes already managed by content-addressed
  local storage.

CI builds changed dossier/media artifacts into `web/dist/ccsolver/`. Large or
full-corpus regeneration runs only through an explicitly bounded job or
schedule, not every ordinary test invocation.

## Determinism and versioning

Canonical artifacts use the safe-integer, UTF-16-key-ordered JSON profile
specified by [artifact kernel v1](artifact-kernel-v1.md), with no BOM,
insignificant whitespace, Unicode normalization, or trailing newline. SHA-256
covers those exact UTF-8 bytes. Artifacts contain no generation timestamp or
self-digest in semantic identity.

Every artifact records its schema version and the provenance relevant to its
claim. Static facts bind producer/import revisions and exact source digests;
runtime evidence additionally binds ruleset and engine/oracle revisions;
search attempts add solver configuration, budgets, seed, and lineage. Fields
that do not apply are not filled with invented placeholders. During pre-release
development schemas may break deliberately, but migrations or explicit
regeneration make the change visible.

An engine or semantic-analysis change never overwrites an accepted result. Each
case is reclassified as:

- replay still valid under the new pin;
- recipe recompiled successfully;
- repaired locally;
- replanned;
- awaiting review; or
- excluded with retained evidence.

Behavior-coverage signatures can prioritize likely failures, but every release
candidate reruns the complete declared corpus.

## Testing strategy

Required test layers are:

- schema validation and canonicalization goldens;
- stable semantic-ID and source-provenance tests;
- observer noninterference against ordinary engine hash streams;
- exact checkpoint capture/restore/fork tests;
- replay-mode decision stepping and input hold/release tests;
- semantic event and causal-order goldens;
- static topology and motif detector fixtures;
- donor alignment and repeated-event tests;
- terminal-first regression, alternative-achiever, resource-flow,
  contradiction, and abstract-meet tests;
- subgoal predicate, footprint, evidence, and join tests;
- capsule composition and deliberate broken-join tests;
- TWS encode/decode round-trip tests;
- TypeScript/native-oracle replay certification;
- deterministic dossier, graph, annotated entry/end scene, route overlay, and
  frame generation tests;
- link, accessibility, reduced-motion, and noindex checks; and
- bounded performance and memory tests.

The canary portfolio must include:

- a synthetic one-room navigation/exit level;
- terminal-first chips/socket, key/door, alternative-exit, and impossible-goal
  cases;
- several corpus levels selected by measured low static complexity;
- keys, doors, chips, sockets, and one block puzzle;
- force/ice timing, including CCLP1 level 105 Tunnel Clearance;
- repeated teleport context, including CCLP1 level 113 Teleport Trouble;
- materially different plans, including CCLP3 level 16 Two Sets of Rules;
- causal donor disagreement, including CCLP1 level 67 Booster Shots;
- buttons, traps, cloners, monsters, and RNG; and
- injected timing, illegal-shortcut, alternative-branch, and version-change
  failures that demonstrate repair and lineage.

Visual ATDD additionally covers a remote button/device inset, a moving-monster
route, a proposed ending that must not be labeled observed, a first-failure
panel, distinct MS/Lynx routes for one semantic goal, dangling-reference
rejection, preservation of reviewed notes across machine regeneration with
stale-review detection when evidence changes, textual equivalence, reduced
motion, deterministic bounded media, and proof that viewport selection cannot
change checkpoint or replay state.
Backward-planning ATDD proves that reverse-pull and coordinate symmetry never
become gameplay legality, target-specific forced/transport predecessors remain
conditional, RNG remains an unresolved binding, and every accepted abstract
meet fails closed until a continuous forward witness exists.

Full replay sweeps, search jobs, media generation, and fixture production obey
the repository requirement for explicit time and work bounds.

## Security and operational bounds

All DAT, TWS, schema, and external metadata are untrusted inputs. Parsers and
adapters enforce file, dimension, event, tick, recursion, memory, and output
limits before work expands. Generated HTML escapes all source metadata.

Search has explicit node, wall-time, memory, checkpoint, trace, and media
budgets. Cancellation leaves append-only attempt evidence in a valid state.
Native oracle processes use bounded input, output, lifetime, and concurrency.

An unlisted public dossier is not private. No credentials, private Hybrid data,
local filesystem paths, or unpublished secrets enter generated artifacts.

## Resolved product decisions

- CCSolver source is public under Tile World's GPL-2.0-or-later terms.
- Authoritative snippets use exact full-world checkpoints; visual cropping is
  preferred over spatial simulation reduction.
- Semantic parity is preferred, while different ruleset plans are fully valid
  and explicitly modeled.
- Contracts and narratives may be authored, inferred, or reviewed; provenance
  is always visible.
- Terminal-first semantic regression is the default high-level decomposition;
  target-engine execution and certification remain strictly forward.
- Donor-visible training and donor-hidden validation are separate from the
  beginning.
- Dossier pages are public but unlisted from the main Tile World experience.
- Every target-specific subgoal has static annotated entry/end panels and a
  textual equivalent. When motion evidence is useful, interactive playback is
  preferred over compressed media; both playback and GIF/video output remain
  conditional on explanatory value and bounded policy.

## Deferred measurement decisions

P1B declares a provisional size-only allowance of 1,024 node expansions per
logical cell, 16 simulated decisions per node expansion, at most 64 replay
decisions per logical cell capped at 65,536, and one deterministic attempt per
target. Its 60-second and 512-MiB safety cutoffs classify exhaustion as
infrastructure-inconclusive. These constants make the first frozen cohorts
comparable; they are policy, not measured solver-performance claims.

The project plan still does not invent these values:

- exact event-buffer, trace-window, and checkpoint-cache sizes;
- mechanic-specific search budgets or replacements for the provisional
  size-only policy;
- the snapshot interval and threshold for copy-on-write or reversible journals;
- media length and size thresholds for GIF versus video;
- parallel worker counts for later runtime, search, and oracle jobs (P1B fixes
  its static-analysis generator separately); and
- the point at which optimization passes become cost-effective.

Each is frozen only after representative measurements and a regression gate.

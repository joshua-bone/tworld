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
contracts, MS/Lynx evidence, interactive playback, short GIFs, current failures,
and exact provenance. The site is public but unlisted: its app-relative route is
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
- isolate and repeatedly test short subgoals from exact reachable checkpoints;
- verify every accepted full replay through the TypeScript target engine and
  pinned native oracle;
- support donor-guided training, donor-hidden validation, and genuinely unseen
  level evaluation;
- publish deterministic, reviewable level dossiers and focused animations; and
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
       level theory and StrategyPortfolio
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
proof. Later static-analysis slices add capability-dependent routing, block
destinations and dead squares, forced conduits, irreversible actions, suspected
deadlocks, and reviewed puzzle-area structure. Keeping imported observations,
target policy, and deductions separate makes every dossier claim traceable and
lets improved analyzers coexist with the same source facts.

Static facts are conservative. The target engine decides whether a concrete
move is legal.

The P1A evidence producer and Intro level 8 golden currently target MS only.
The manifest still retains independent MS and Lynx target/donor records, and the
pure analyzer accepts either target once an exact policy-evidence producer
exists. Topology evidence, static analysis, and basic dossier data remain
canonical content-addressed previews, not frozen root artifact schemas, until
cross-ruleset evidence justifies that compatibility commitment. See
[P1A pinned corpus and static analysis](p1a-static-analysis.md).

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

During focused development, a persistent worker replays the prefix once, caches
the checkpoint, and repeatedly restores it to test only the short interval. The
renderer crops to the causal region while the engine retains the whole map.

A `ReducedScenario` is constructed only after the contextual witness works. It
may be found through causal slicing or delta reduction and is labeled
`illustrative` unless independently proved against the original continuation.

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

1. follow realized donor visits and hard anchors through an online intent
   follower;
2. try MS and Lynx paths plus aligned branch combinations;
3. repair the first failed subgoal with bounded input/timing search from an
   exact checkpoint;
4. search between hard semantic anchors using goal predicates;
5. replan room, resource, and dependency order when local repair cannot work;
   and
6. use human/AI takeover to create or correct tactics for the residual cases.

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
5. one card per subgoal with contract, evidence, footprint, join, failures, and
   ruleset implementations;
6. semantically synchronized MS/Lynx playback with independent clocks;
7. pre/post state and event deltas;
8. a ruleset-quirk ledger; and
9. downloadable verified TWS files and certificates where available.

Stable app-relative routes use IDs such as
`/ccsolver/levels/cclp3/016-two-sets-of-rules/`. Production prepends Vite's
configured `BASE_PATH` (currently yielding `/tworld/ccsolver/...` on project
Pages). The CCSolver master index and level pages are included in the GitHub
Pages artifact but are not linked from the main Tile World page, player
navigation, or sitemap. Generated pages include `noindex` metadata. This is
obscurity for convenience, not access control. Static directory URLs and the
SPA `404.html` fallback are tested as distinct deployment paths.

## Playback and media

The primary review UI replays deterministic frame data through the existing
canvas renderer and supports play, pause, frame step, speed, semantic-anchor
jumps, and synchronized comparison. Semantic alignment is the default; raw tick
and wall-time modes remain available for mechanics diagnosis.

Each short subgoal also produces a GIF with:

- a fixed causal viewport while the complete world simulates;
- ruleset, level, subgoal, tick, and input labels;
- relevant cells and actors highlighted;
- a short precondition and postcondition pause; and
- a poster image and equivalent prose.

Long snippets use interactive playback plus an optional WebM/MP4 or contact
sheet rather than an enormous GIF. Pages honor reduced-motion preferences and
do not autoplay.

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
- subgoal predicate, footprint, evidence, and join tests;
- capsule composition and deliberate broken-join tests;
- TWS encode/decode round-trip tests;
- TypeScript/native-oracle replay certification;
- deterministic dossier, graph, and frame generation tests;
- link, accessibility, reduced-motion, and noindex checks; and
- bounded performance and memory tests.

The canary portfolio must include:

- a synthetic one-room navigation/exit level;
- several corpus levels selected by measured low static complexity;
- keys, doors, chips, sockets, and one block puzzle;
- force/ice timing, including CCLP1 level 105 Tunnel Clearance;
- repeated teleport context, including CCLP1 level 113 Teleport Trouble;
- materially different plans, including CCLP3 level 16 Two Sets of Rules;
- causal donor disagreement, including CCLP1 level 67 Booster Shots;
- buttons, traps, cloners, monsters, and RNG; and
- injected timing, illegal-shortcut, alternative-branch, and version-change
  failures that demonstrate repair and lineage.

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
- Donor-visible training and donor-hidden validation are separate from the
  beginning.
- Dossier pages are public but unlisted from the main Tile World experience.
- Interactive playback is primary and short downloadable GIFs are also
  produced.

## Deferred measurement decisions

The project plan does not invent these values:

- exact event-buffer, trace-window, and checkpoint-cache sizes;
- default search node/time/memory budgets by mechanic class;
- the snapshot interval and threshold for copy-on-write or reversible journals;
- media length and size thresholds for GIF versus video;
- parallel worker count for local and CI corpus jobs; and
- the point at which optimization passes become cost-effective.

Each is frozen only after representative measurements and a regression gate.

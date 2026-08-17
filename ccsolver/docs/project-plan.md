# CCSolver project plan

## Status and authority

This plan implements the [CCSolver design](design.md). Milestones are ordered by
proof dependencies, not dates, except for explicitly parallel reporting and
interchange lanes. A milestone is complete only when its exit gate passes;
plausible artifacts or prose do not substitute for execution.

The plan begins with one manually guided end-to-end level pipeline, then grows
semantic inference, search, blind evaluation, and corpus scale. Robust valid
replays come before score optimization.

## Delivery rules

- Keep changes small and commit one coherent seam at a time.
- Add a deterministic test or bounded executable check with every seam.
- Use the existing engines for transitions; never duplicate movement legality.
- Run the smallest failing level before a pack or corpus sweep.
- Give every long replay, search, fixture, media, and corpus command explicit
  time, work, memory, and output bounds.
- Preserve exact input/replay mode, seed, stepping, and source provenance.
- Commit normative schemas, recipes, narratives, and small goldens. Generate
  large traces and media outside ordinary source history.
- Do not expose the dossier through the main Tile World navigation, homepage, or
  sitemap.
- Record failed hypotheses and bounded search exhaustion; do not silently drop
  them from progress reporting.

## Workstreams

The project has six connected workstreams:

1. Domain and artifact schemas.
2. Static level understanding and reusable motifs.
3. Runtime observation, checkpoints, snippets, and certification.
4. Donor interpretation, planning, and search.
5. Dossier UI, rendering, and media.
6. Corpus operations and external/Hybrid interchange.

Domain/schema work precedes everything. Runtime observation and static analysis
can then proceed in parallel. Dossier work begins as soon as stable facts and
events exist. Search depends on both topology and exact checkpoint execution.

## P0: project and artifact foundation

### Objective

Create a compilable CCSolver workspace with enforceable dependency boundaries
and the first versioned artifact vocabulary.

P0 is delivered as reviewable slices:

- **P0A — Workspace foundation:** workspace/lockfile ownership, package
  boundaries, one-way Tile World facade, root commands, and CI.
- **P0B — Canonical artifact kernel:** strict canonical JSON, portable SHA-256,
  corpus cases, replay certificates, semantic identity primitives, schemas, and
  conformance fixtures.
- **P0C — Semantic artifact vocabulary:** small evidence-backed schema slices,
  beginning with P0C1 source provenance and static level facts, then adding
  events, plans, contracts, witnesses, and dossier manifests only alongside
  their producing vertical slices.

### Deliverables

- Choose one coherent npm installation/lockfile model for the current root and
  `web` lockfiles, and update local commands, CI installation, and cache keys as
  one change.
- Add `ccsolver` as the second root npm workspace, named `@tworld/ccsolver`.
- Add root `ccsolver:*` scripts for typecheck, test, CLI, and dossier build.
- Establish a supported cross-workspace TypeScript facade/project reference, or
  compose the concrete adapter on the `web` side; do not import private `web`
  path aliases directly from CCSolver domain code.
- Establish `domain`, `application`, `ports`, `adapters`, `cli`, `render`, and
  `site` package boundaries.
- Define versioned types and schemas incrementally for:
  - `LevelIdentity` and `CorpusCase`, including per-target attempts, statuses,
    replay candidates, and certificates;
  - coordinates, regions, semantic placements, actors, and lineage;
  - static semantic facts, followed separately by runtime events;
  - goal graphs, orthogonal plan-shape/dependency/resolution fields, and
    expanded plans;
  - subgoal contracts and contextual witnesses;
  - execution witnesses and replay certificates; and
  - dossier manifests and provenance.
- Define canonical JSON rules and SHA-256 artifact identity.
- Publish a provisional, engine-neutral file protocol and conformance fixture
  from the outset; its compatibility is not frozen before real execution.
- Add representative valid and invalid schema fixtures.
- Add architecture tests preventing domain/application imports from React,
  canvas, Node I/O, raw tile IDs, or ruleset implementation modules.

### Exit gate

- Representative artifacts validate, canonicalize, and round-trip byte-for-byte.
- A schema/version mismatch fails explicitly.
- Architecture violations fail tests.
- Local and Pages CI installs use the selected workspace/lockfile model without
  relying on an untracked dependency tree.
- Root and web builds, typechecks, and targeted tests remain green.

## P1: corpus manifest and static level intelligence

### Objective

Build a donor-independent, deterministic description of the initial world and
select the first curriculum from measured complexity.

### Deliverables

- Generate the pinned corpus manifest and recompute pack denominators.
- Reconcile the current audited baseline of 2,440 target entries, 2,257 paired
  donor cases, and 470 older Hybrid wins.
- Adapt existing DAT/CCX content APIs without copying parser logic.
- Produce normalized `LevelFacts` with zero-based `(x, y, z)` coordinates.
- Inventory cells, strata, actors, resources, exits, doors, sockets, buttons,
  wiring, traps, cloners, teleports, forced surfaces, hazards, and time limits.
- Detect initial connected regions, chokepoints, articulation boundaries,
  transport networks, gates, resource dependencies, and obvious dead squares.
- Compute an explainable static-complexity feature vector.
- Select and freeze:
  - a foundational Phase-A synthetic curriculum used by P7;
  - the later expanded mechanic curriculum used by P9;
  - donor-visible training cases;
  - the first frozen donor-hidden evaluation wave; and
  - adversarial architecture canaries.
- Emit a deterministic basic dossier JSON for at least one level.

### Exit gate

- Repeated analysis of pinned bytes produces identical canonical artifacts.
- Exactly 65,536 total cells across all z layers are accepted and
  larger/overflowing shapes fail cleanly.
- At least one synthetic and one bundled level show correct layers, identities,
  actors, wiring, resources, and source hashes.
- The first evaluation-wave manifest and budgets are committed before solver
  heuristics are tuned.

## P2: runtime ports and semantic event journal

### Objective

Observe exact MS and Lynx execution through a narrow, non-mutating CCSolver
port.

### Deliverables

- Define `SolverRuntimePort` operations for start, true replay start, recorded
  decision/no-change advance, bounded run, observe, checkpoint, clone, restore,
  event drain, terminal result, and render projection.
- Implement MS and Lynx adapters over existing TypeScript sessions and undo
  checkpoints.
- Preserve replay-mode input carry, release, diagonal, mouse, seed, stepping,
  and random-slide state.
- Add stable semantic observations independent of raw tile IDs.
- Add bounded causal events for movement, collection, inventory, map mutation,
  devices, teleports, actor lifecycle, death, and victory.
- Expose causal plan/command IDs and first-failure reasons where existing engines
  permit them; add narrow observation seams where they do not.
- Adapt the native oracle's existing bounded/window trace commands for
  diagnosis. Add a new delta-oriented semantic exporter only if representative
  measurements show that the existing seam is insufficient.

### Exit gate

- Existing donor replays retain their current results and engine state hashes
  with observation enabled and disabled.
- The same run twice yields the same semantic journal.
- Checkpoint/restore execution equals uninterrupted execution at several
  boundaries in both rulesets.
- Replay-mode and manual-mode differences have focused tests.
- Independent MS and Lynx tests characterize exactly when an input can influence
  the next transition; P7 may prune action boundaries only where those tests
  prove it safe.
- Event-sink exhaustion is explicit and cannot change gameplay.

## P3: exact contextual capsules and contracts

### Objective

Make subgoals independently repeatable without falsifying their world context.

### Deliverables

- Define prefix-derived contextual-witness identity from level, ruleset, seed,
  replay/prefix digest, entry boundary, and state digest.
- Cache opaque engine checkpoints by complete implementation dependency; do not
  make them durable schema data.
- Implement the closed predicate vocabulary for `requires`, `ensures`,
  invariants, event assertions, footprints, forbidden events, and stop bounds.
- Add authored, inferred, observed, reviewed, and verified provenance.
- Add separate evidence-coverage, ruleset-scope, and robustness fields, plus join
  states: exact, replanned, semantic-only, and broken.
- Implement exact state/effect diffs and contract validation.
- Implement prefix replay, checkpoint caching, repeated short-interval execution,
  and cropped render projection over full-world simulation.
- Explicitly retain input-latch, time, RNG, actor-order, and global device state.

### Exit gate

- Deleting the checkpoint cache and rebuilding from the prefix yields the same
  entry digest and snippet result.
- Prefix plus snippet equals uninterrupted execution.
- Changing level, seed, prefix, boundary, or engine build invalidates the cache.
- Synthetic offscreen-actor, RNG, teleport, actor-order, and held-input cases
  prove that spatial cropping is never treated as correctness.
- Two capsules compose only by executing consecutively through one live state.

## P4: dossier and evidence surface

### Objective

Give the user and agent a compact, static laboratory for reviewing every claim.

### Deliverables

- Add an independent static bundle under `web/dist/ccsolver/`.
- Add a direct master route and stable per-level routes beneath Vite's
  configured Pages base path.
- Exclude CCSolver routes from the player UI, homepage, and sitemap; add
  `noindex` metadata.
- Build a zoomable whole-level renderer using existing tile/frame projections.
- Add layer, region, wiring, teleport, force/ice, resource, donor-path, and
  subgoal overlays.
- Render human narrative, strategy portfolio, accessible graph table, subgoal
  contracts, evidence, joins, state/event diffs, failures, and provenance.
- Add deterministic interactive playback with semantic, raw-tick, and wall-time
  comparison modes.
- Add short focused GIF export with poster frames and reduced-motion support.
- Generate graphs from canonical plan data; do not maintain a separate hand
  edited graph source.
- Update the Pages workflow's install and cache steps to include the selected
  workspace/lockfile model and the CCSolver dossier build.

### Exit gate

- The app-relative `/ccsolver/` index and one level URL work beneath the
  production `BASE_PATH` (currently `/tworld/` on project Pages).
- A direct static-directory request and the SPA `404.html` fallback are tested
  separately.
- No discoverability link exists in the ordinary Tile World experience.
- Dossier sources regenerate identically.
- Interactive playback is usable without GIF output, and all visual information
  has a textual equivalent.
- Media generation is pinned, bounded, and deterministic for golden snippets.

## P5: first manually guided end-to-end level

### Objective

Prove the complete semantic-plan-to-certified-TWS pipeline before automating
decomposition.

### Deliverables

- Select the lowest-complexity paired real level from P1. CCLP1 level 1,
  Key Pyramid, is the initial candidate rather than a fixed assumption.
- Write a reviewed human description, static theory, goal graph, and contracts.
- Materialize exact MS and Lynx witnesses for each selected subgoal.
- Use one shared plan where honest, with target-specific local implementations
  as needed.
- Execute the selected subgoals continuously through one full target state.
- Record decisions, assemble complete target-specific TWS files, and round-trip
  them through the existing codec.
- Certify both generated replays in the target TypeScript engine and native
  oracle.
- Validate the provisional external artifact protocol against this first real
  vertical slice and publish the resulting conformance fixture.
- Publish the complete dossier and replay certificates.

### Exit gate

- The MS and Lynx TWS files are generated from checked-in semantic artifacts,
  not copied donor bytes.
- The MS replay wins from the original level start in the TypeScript MS engine
  and native MS oracle; the Lynx replay likewise wins in the TypeScript Lynx
  engine and native Lynx oracle.
- Every selected edge is exact or successfully replanned; no semantic-only edge
  appears as complete.
- Deleting generated outputs and rebuilding reproduces the certificates and
  dossier.

## P6: donor alignment and strategy portfolios

### Objective

Infer useful semantic structure from donor execution while preserving real
ruleset divergence.

### Deliverables

- Extract hard, medium, and soft anchors from realized semantic events.
- Add weighted sequence alignment with repeated-event ordinals and many-to-one
  forced-movement spans.
- Infer candidate subgoal boundaries, contracts, waits, resource changes, and
  topology changes with confidence labels.
- Detect thin-ice corners, force-floor timing/boosts, mouse and diagonal inputs,
  RNG dependence, and other quirks.
- Generate candidate strategy portfolios containing shared plans, parallel
  implementations, alternative branches, and different plans.
- Add review workflow that never overwrites reviewed annotations silently.

### Exit gate

- Canary dossiers correctly distinguish:
  - one shared plan with different timing;
  - one shared subgoal with a different local route;
  - alternative branches with a proven rejoin; and
  - genuinely different ruleset plans.
- CCLP3 level 16, Two Sets of Rules, visibly carries different MS and Lynx plans
  rather than reporting a failed parity translation.
- Repeated coordinates and events do not create false anchor matches.

## P7: tactic library and bounded local search

### Objective

Construct and repair target executions from semantic intent rather than fixed
donor input.

### Deliverables

- Add initial operators such as `Reach`, `Collect`, `Unlock`, `PushTo`,
  `Activate`, `WaitUntil`, `ClearRoute`, `TraverseForced`, `Teleport`, and
  `ReachExit`.
- Add tactic/controller interfaces separate from compiled input witnesses.
- Evaluate candidates authoritatively by checkpoint, real-engine advance, and
  restore. Add a pure planner probe only as an equivalence-tested optimization.
- Search only at engine-declared input-influence boundaries when safe.
- Add deterministic beam search and weighted A* with explicit budgets,
  transposition hints, parent/action reconstruction, and dead-end reasons.
- Bias local repair using semantic anchors, topology, resources, threats, time
  slack, and donor corridors without making donors authoritative.
- Add snapshot-backed branch execution and strategy-suffix recompilation.
- Add human/agent takeover, branch recording, and tactic promotion for residual
  hard subgoals.

### Exit gate

- The foundational Phase-A synthetic curriculum frozen in P1 is solved without
  canned full input streams. P9 expands mechanic coverage after this gate.
- At least one early real level is solved donor-blind under both rulesets.
- A semantic recipe can retime or repair after an injected one-decision failure.
- Exhaustion returns a reproducible diagnostic within its declared budget.
- Search fingerprints never certify a replay; final exact checks still run.

## P8: blind evaluation and durable learning

### Objective

Demonstrate that CCSolver is acquiring reusable game knowledge rather than only
translating TWS.

### Deliverables

- Enforce separate donor-availability, donor-exposure, construction-method, and
  evaluation-cohort fields in the runner.
- Add donor-access and construction-method audit records to each attempt.
- Freeze and run the initial evaluation wave selected in P1.
- Record plan, work, failures, portability, and certification independently of
  donor comparison.
- Promote general lessons into typed motifs, detectors, tactics, heuristics,
  counterexamples, and fixtures.
- Reveal donor evidence only after a blind attempt's artifacts and budget are
  frozen; then reclassify that case as training evidence and freeze a new wave
  before further tuning.

### Exit gate

- Every frozen-wave result is certified or has a categorized reproducible
  failure.
- Logs prove donor bytes and donor-derived annotations were unavailable in blind
  runs.
- Later donor comparison cannot erase or rewrite the blind attempt.
- At least one reviewed lesson, under the same declared budget, newly certifies
  a different frozen case or advances it to a predeclared semantic anchor
  through a checked-in reusable artifact.

## P9: mechanics curriculum and adversarial canaries

### Objective

Grow from simple routing to the interactions that defeat coordinate-following
or local-only search.

### Deliverables

- Expand synthetic and real coverage through:
  1. reachability and terminal entry;
  2. chips and sockets;
  3. keys and doors;
  4. blocks, irreversible pushes, and dead squares;
  5. buttons, channels, traps, cloners, and tanks;
  6. ice, force floors, and blocked forced movement;
  7. teleports and repeated coordinates;
  8. moving actors and actor-order interference; and
  9. RNG-dependent actors and waits.
- Maintain these required adversarial canaries:
  - CCLP1 level 67, Booster Shots, for causal donor disagreement;
  - CCLP1 level 105, Tunnel Clearance, for force-floor nailing/timing;
  - CCLP1 level 113, Teleport Trouble, for repeated-coordinate context; and
  - CCLP3 level 16, Two Sets of Rules, for whole-plan divergence.
- Add injected illegal-shortcut, timing-shift, alternative-branch, cache-change,
  and engine-version failures.

### Exit gate

- Each mechanic has a focused synthetic proof and at least one real dossier.
- Canaries fail for the intended reason when their protection is deliberately
  removed.
- Quirk-dependent strategies are explicit and never mislabeled as shared parity.

## P10: corpus operations and regeneration

### Objective

Attempt every paired-donor target without allowing scale to hide stale or
unexplained results.

### Deliverables

- Add a bounded parallel job runner with resumable, append-only attempt records.
- Add content dependency graphs and selective invalidation for engine, schema,
  source, motif, tactic, plan, and renderer changes.
- Add first-divergence reports and minimal repair jobs.
- Add pack dashboards and exact denominators.
- Use this queue order:
  1. within the paired official queue, prioritize the 391 cases that also have
     an older Hybrid replay and treat it as additional strategy evidence, not a
     separately completed target;
  2. complete all 562 paired official cases, generating and newly certifying
     both target-ruleset outputs;
  3. complete the 1,695 paired CCLP5 voting cases; and
  4. track the remaining 79 older Hybrid wins plus other unpaired or
     conceptual-companion levels as separate evidence queues.
- Classify failures as import, runtime/oracle, observation, decomposition,
  local-repair exhaustion, route-replan exhaustion, ruleset divergence, fixture,
  or reviewed non-portable case.
- Add engine/schema change lanes: unchanged replay, recipe rebuild, local repair,
  replan, review.
- Treat the breadth sweep as an intermediate coverage gate, then run iterative
  repair, route-replanning, and human/agent review campaigns over every queued
  target until it reaches a terminal disposition.

### Exit gate

- Intermediate coverage gate: every in-scope paired-donor target ruleset has at
  least one bounded attempt and any unresolved record has a specific next action.
- Milestone completion gate: every per-target record is certified-current or has
  a reviewed evidence-backed exclusion; a merely queued record cannot complete
  P10.
- No stale certificate appears current after a dependency change.
- Full sweeps obey repository timeout and output-size rules.
- Progress reports show per-pack denominators and never hide exclusions in one
  aggregate percentage.

## P11: HybridCC2026 interchange

This is a parallel interoperability lane. Its provisional protocol begins in
P0, is exercised in P5, and may stabilize as soon as that evidence is adequate;
it does not wait for P10 corpus completion.

### Objective

Stabilize and version the public semantic artifact boundary after CCSolver has
proved it on the first legacy vertical slice.

### Deliverables

- Publish versioned schemas and a CLI/file protocol for level facts, strategy
  portfolios, expanded plans, contracts, and evidence.
- Provide content-hashed conformance fixtures and consumer validation examples.
- Keep all executable legacy implementation and opaque checkpoints out of the
  interchange.
- Permit a private Hybrid adapter to bind semantic IDs, execute tactics against
  100 ms state, and return private certification lineage.
- Add schema compatibility and migration policy.

### Exit gate

- A clean private checkout can consume pinned public artifacts without importing
  or linking Tile World/CCSolver source.
- Unknown or incompatible schema versions fail before partial execution.
- A regenerated private replay can be traced to exact CCSolver source, level,
  strategy, and artifact versions.

## P12: sight-unseen external levels

### Objective

Evaluate level understanding and planning on content with no donor solution.

### Deliverables

- Add an explicit documented-API ingestion adapter with content-addressed cache,
  bounded concurrency, and provenance.
- Generate static facts and a draft dossier before any search.
- Attempt planning in `unseen` mode with a frozen budget.
- Publish certified results or bounded partial diagnoses through the same
  artifact model.

### Exit gate

- One external CC1 level is ingested, analyzed, and attempted without bespoke
  code or donor data.
- A failure is reported as a bounded model/planning result, not confused with an
  engine failure.
- The dossier remains reproducible without contacting the live source again.

## Canary curriculum

Synthetic levels are implemented first so each failure has one cause:

1. one-room route to exit;
2. collect chips and clear a socket;
3. key/inventory/door order;
4. one safe block push and one deadlock;
5. button-to-device effects;
6. ice and force movement with a blocked forced direction;
7. teleport routing and repeated coordinates;
8. moving-actor and actor-order interference;
9. RNG consumption and predicate-based waiting; and
10. an offscreen effect proving full-world capsule execution.

Real cases are selected after P1 measures them. Key Pyramid is the candidate for
the first vertical slice. Booster Shots, Tunnel Clearance, Teleport Trouble, and
Two Sets of Rules are adversarial architecture canaries, not expected early
solver wins.

## Test matrix

### Unit

- schema validation, canonicalization, IDs, predicates, graph rules, facts,
  events, and operator semantics.

### Golden

- representative artifacts, event journals, topology, contracts, selected
  dossiers, graph SVGs, and short render sequences.

### Metamorphic

- uninterrupted versus checkpoint/restore;
- cache retained versus rebuilt;
- TWS encode/decode/replay;
- semantic observer enabled versus disabled; and
- equivalent candidate actions and deterministic search reruns.

### Differential

- TypeScript MS versus native MS oracle;
- TypeScript Lynx versus native Lynx oracle; and
- target replay result and semantic terminal facts.

### Contract and integration

- deliberate precondition, invariant, footprint, postcondition, join, and
  certification failures;
- one complete plan through target-specific TWS and dossier generation.

### Corpus and performance

- fast canary suite on ordinary changes;
- bounded per-level and per-pack sweeps;
- explicit full-corpus jobs; and
- measured regression guards for analysis, checkpointing, search, verification,
  and media only after baselines exist.

## Required failure packet

Every failed attempt should be reducible to a compact packet containing:

- level/source/ruleset identities and digests;
- solver, engine, and oracle revisions;
- donor availability/exposure, construction method, evaluation cohort, and
  donor-access audit;
- plan/subgoal and exact entry derivation;
- first failed predicate or divergent semantic event;
- local state/event window and relevant map region;
- attempted decisions and bounded search summary;
- category, current hypothesis, and next recommended action; and
- links to the dossier node and source artifacts.

This packet is the default context for an agent or human taking over the case.

## Definitions of done

A subgoal is done only when its contract, provenance, exact witness, state/event
evidence, bounds, and live composition status are recorded.

A level is done only when its analysis, reviewed narrative, strategy portfolio,
selected execution, generated replay for each claimed target, TypeScript/native
certificates, and dossier regenerate from pinned inputs. A reviewed exception
with retained evidence is the only alternative.

The paired-corpus effort is done only when every in-scope target-ruleset record
has been attempted and is either certified or explicitly reviewed. A coverage
percentage by itself is never completion.

## Immediate next change

With P0C1 complete, begin **P1A — Pinned corpus manifest and static-analysis
vertical slice** using ATDD:

1. generate a reproducible manifest from the source pins already recorded in
   this repository, retaining pack occurrences and separate MS/Lynx targets;
2. adapt the `level-facts` builder across the bundled legacy corpus without
   copying DAT parser logic into CCSolver;
3. define a derived-analysis artifact only after executable analyzers produce
   rooms, connectivity, gates, resource dependencies, forced/transport
   networks, and uncertainties;
4. run that analyzer first on a tiny synthetic curriculum and the bundled
   Intro level 8 golden, then select the first measured real-level curriculum;
5. emit deterministic machine-readable dossier data, without yet designing the
   dossier UI or runtime event journal; and
6. preserve the 65,536-cell budget, exact source byte chain, stable identities,
   and unknown-element diagnostics established by P0C1.

Runtime event journals, goal/plan graphs, contracts, witnesses, donor
alignment, search, and media remain separate evidence-backed review slices.

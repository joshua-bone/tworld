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
- Build explanatory plans backward from explicit terminal predicates, but
  execute and verify every selected implementation forward in the real target
  engine.
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

## Human review checkpoints

Each major proof dependency produces something a human can inspect before the
next layer is trusted:

1. **P2A — exact runtime perception (available now):** checked canonical JSON
   and self-contained derived Markdown expose source/runtime provenance,
   coordinates, native ticks, player/actor/device state, inventory and remaining
   requirements, input ownership, and changed-cell semantics for Key Pyramid
   and Intro 8. This judges whether CCSolver sees the world accurately; it does
   not judge solver reasoning.
2. **P3A — backward prerequisite graph (available now):** checked Key Pyramid
   MS/Lynx terminal theories expose the exit-rooted AND/OR graph, alternatives,
   exact resource occurrences, uncertainty, and unresolved obligations.
3. **P3B — exact contextual witnesses (available now):** checked Key Pyramid
   MS/Lynx red-key witnesses execute one selected segment forward from the
   complete start state and compare uninterrupted execution with an exact
   restored branch.
4. **P4A — annotated map evidence (available now):** checked graphical
   Key Pyramid MS/Lynx boundaries show plan intent, exact observed endpoints,
   points of interest, and state deltas. A failed standard-only canary keeps its
   intended ending separate from the observed stop. Animation is deliberately
   omitted because P3 retained no intermediate semantic scenes.
5. **P5 — full-level proof (available now):** a pre-execution terminal-first
   candidate plan supplies the exact forward decisions; composed executions
   and certified MS/Lynx replays from canonical initialization show that the
   six reviewed subgoals actually join into a win.
6. **P4B — whole-level dossier (available now):** an unlisted static page uses
   checked P5 bytes for gameplay evidence and the standard repository runtime
   tilesets for presentation. It exposes paired artwork maps, cropped numbered
   route segments, the terminal-first graph, every exact boundary pair, timing
   differences, provenance, certificates, and replay downloads. This is the
   first complete-level human checkpoint.

P2A output is authoritative runtime-characterization evidence only after a
fresh generation is followed by a successful byte-for-byte
`npm run ccsolver:p2a:check`. Its Markdown is a derived review aid.

P3 planning/witness output is authoritative preview evidence only after
`npm run ccsolver:p3:check`. Its compact textual map crops are early review aids;
P4A owns the graphical annotated evidence surface.

P4A graphical output is authoritative preview evidence only after
`npm run ccsolver:p4a:check`. Human review sidecars are separate durable inputs,
not regenerated machine output.

P5 certification is authoritative only after the native oracle is rebuilt and
`npm run ccsolver:p5:check` reproduces the complete checked file set. P4B's
compact authority follows after `npm run ccsolver:p4b:check`; the HTML/SVG site
is derived by `npm run ccsolver:p4b:emit-dist` and never approves its own human
review state.

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

### Status and delivery slices

The scoped P1 foundation and P1B checked-data gate are complete. Semantic room
decomposition and block dead-square proof are explicitly deferred; P1B does not
claim either result.

- **P1A — Pinned corpus manifest and MS static-analysis vertical slice:
  complete.** The checked-in canonical manifest verifies 193 exact sources at
  revision `42c78d0db343621f887fefce581315479d9a8be3` and derives 39 packs,
  2,440 map cases, 4,880 target records, and 4,664 donor-backed targets. A
  target-policy evidence seam and pure certain-only analyzer are covered by a
  synthetic mechanic postcard, shuffled-input and invalid-binding ATDD, a
  65,536-cell iterative articulation case, and deterministic MS Intro level 8
  level-facts/evidence/analysis/dossier goldens.
- **P1B — Cross-ruleset topology evidence and curriculum freeze: complete.** A
  genuine Lynx policy adapter and the MS adapter now feed shared engine-neutral
  facts and analysis kernels. Paired comparisons distinguish source-fact,
  target-policy, and policy-derived differences. A DATTools-derived validity
  gate quarantines 55 invalid occurrences (49 CCLP2 and six paired Voting), and
  the donor-redacted measured-report production scope contains all 2,251
  remaining valid paired occurrences: 770 static-parity cases and 1,481 with
  explicit target differences. Eight declarative Phase-A ASCII cases,
  five donor-visible training cases, six declared donor-hidden evaluation
  cases, digest-level cohort isolation, and provisional size-based budgets are
  frozen. Key Pyramid
  is the paired golden target for MS, Lynx, and comparison output. The bounded
  full generator and independent byte-for-byte check both succeeded.

P1B keeps topology evidence, comparison, reports, curriculum, and basic dossier
data as content-addressed preview shapes rather than freezing new root artifact
schemas. Its Phase-A ASCII sources are declarations, not yet executable engine
fixtures, and its `blind` policy is not capability-enforced until P8. See
[P1B cross-ruleset topology and curriculum](p1b-cross-ruleset-topology.md).
The dossier UI remains P4. Runtime observation is now delivered by P2A; the
complete causal journal remains P2B.

All CCSolver phases permanently use only the standard CC1 tile vocabulary. Raw codes `0x70`–`0x75`
(Sandbag, Bowling Ball, Cloud, Hook, Ice Block, and Pet Carrier) are Tile World
engine extensions, not solver mechanics. A shared source-scope gate rejects
them before corpus identity, facts, analysis, runtime, planning, or curriculum
selection, without removing their support from the legacy engines or excluding
valid multi-layer geometry. The current
manifest contains none, so the frozen P1B denominators and artifacts do not
move.

### Deliverables

- Generate the pinned corpus manifest and recompute pack denominators.
- Reconcile the current audited baseline of 2,440 map occurrences, 4,880
  separate target records, 2,257 paired donor cases, 4,664 donor-backed target
  records, and 470 older Hybrid wins.
- Adapt existing DAT/CCX content APIs without copying parser logic.
- Produce normalized `LevelFacts` with zero-based `(x, y, z)` coordinates.
- Inventory cells, strata, actors, resources, exits, doors, sockets, buttons,
  wiring, traps, cloners, teleports, forced surfaces, hazards, and time limits.
- Detect initial connected regions, chokepoints, articulation boundaries,
  transport networks, gates, and candidate resource dependencies. Defer
  semantic room/corridor structure and block dead-square proof until the
  mechanics work has executable push evidence.
- Compute an explainable static-complexity feature vector.
- Select and freeze:
  - a foundational Phase-A synthetic curriculum used by P7;
  - donor-visible training cases;
  - the first frozen donor-hidden evaluation wave; and
  - adversarial architecture canaries.
- Keep Tile World's six expanded tiles permanently outside every mechanics,
  planning, search, and curriculum phase; no later milestone admits them.
- Emit a deterministic basic dossier JSON for at least one level.

### Exit gate

- Repeated analysis of pinned bytes produces identical canonical artifacts.
- Exactly 65,536 total cells across all z layers are accepted and
  larger/overflowing shapes fail cleanly.
- At least one synthetic and one bundled level show correct layers, identities,
  actors, wiring, resources, and source hashes.
- Invalid legacy source is rejected before target interpretation, and the
  measured-report runner scopes production to every valid paired occurrence
  without donor inputs.
- The first evaluation-wave manifest and budgets are committed before solver
  heuristics are tuned.

## P2: runtime ports and semantic event journal

### Objective

Observe exact MS and Lynx execution through a narrow, non-mutating CCSolver
port.

### Status and delivery slices

P2A is implemented and bounded. The P2B causal-journal foundation needed by
the first P6 alignment slice is delivered; the complete P2 exit remains open.

- **P2A — Runtime Observation, Checkpoint, and Render Projection Port:
  complete.** A pure preview contract,
  engine-neutral authority kernel, and independent MS/Lynx adapters compose the
  existing sessions and undo seams. Focused ATDD covers detached read-only
  observation, transactional failure behavior, exact branch/restore,
  target-native manual polling, true replay ownership, first-terminal latching,
  and deterministic render projections. Key Pyramid and Intro 8 supply checked
  canonical runtime packets plus compact human reviews. See
  [P2A runtime observation](p2a-runtime-observation.md).
- **P2B — Causal semantic event journal foundation: delivered.** The runtime
  now provides explicit opt-in, bounded, non-consuming event pages; native
  action authority; exact checkpoint continuation; deterministic
  source-plus-clone-ordinal lineage; and honest command attribution for the
  Key Pyramid P6A slice plus focused standard-mechanic canaries. Ambiguous
  held/queued effects stay unattributed rather than inheriting a nearby poll.
  See [P2B/P6A causal alignment](p2b-p6a-causal-alignment.md).

### P2A delivered

- Define `SolverRuntimePort` operations for manual start, true replay start, one
  target-native manual poll or replay-owned tick, observe, terminal result,
  checkpoint, independent clone/restore, render projection, and disposal.
- Implement MS and Lynx adapters over existing TypeScript sessions and undo
  checkpoints.
- Preserve replay-mode input carry, release, diagonal, mouse, seed, stepping,
  initial random-slide header metadata, and target-native random state in the
  exact checkpoint token plus explicit observation input/randomness fields;
  native-state fingerprint entries cover only the target state they expose.
- Add stable semantic observations independent of raw tile IDs, including
  exact source/facts/provenance bindings, timing, input, randomness, cells,
  player, deterministic observation actor order with optional exact
  target-collection positions, inventory, remaining requirements, devices,
  fingerprints, and terminal state.
- Add deterministic semantic render-region projection bound to the exact source
  observation without consuming engine state.
- Enforce opaque run/checkpoint ownership, mode and target compatibility,
  capacity, disposal, independent checkpoint restore, and nonmutating errors.
- Freeze first terminal evidence while permitting the target engine's
  post-terminal world progression.
- Generate bounded Key Pyramid donor-runtime and Intro 8 manual
  characterization packets; include full values, compact semantic deltas, and
  derived human review pages without durable handles or timestamps.

### P2B follow-on work

- Extend the delivered named map seams to hazard-driven floor mutations and
  any standard mechanics not yet represented by a native action canary.
- Preserve additional held/queued command lineage only where a target-native
  seam can prove it; keep every ambiguous effect explicitly unattributed.
- Adapt the native oracle's existing bounded/window trace commands when a
  measured diagnostic gap requires it. Add a new delta-oriented semantic
  exporter only if representative evidence shows the existing seam is
  insufficient.

### P2A exit gate

- Observation, terminal, and render reads are detached and do not advance or
  mutate gameplay in either target.
- Uninterrupted and checkpoint/restore continuations agree exactly at focused
  boundaries; cloned branches are independent.
- Manual and replay modes reject mismatched advances, preserve target-native
  input semantics, and retain replay seed, stepping, slide, cursor, and deadline
  state.
- MS reports its in-engine replay-deadline failure explicitly; Lynx reports the
  header deadline without inventing MS enforcement, leaving the outer run bound
  to the verifier.
- The first terminal record remains stable while later target logic may advance.
- Key Pyramid binds exact MS/Lynx donor TWS and entry bytes, labels every
  replay-derived point `donor-runtime-characterization`, and finds the first
  resource change under strict measured bounds.
- Intro 8 proves the east poll stationary before calling it blocked and keeps
  no-input versus second-east followup causes explicit.
- A generate followed by independent `--check` reproduces the four canonical
  JSON packets and two Markdown reviews byte-for-byte under an explicit CI
  timeout.

### Complete P2 exit gate (after P2B)

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

## P3A: terminal-first predicates and symbolic regression

### Objective

Turn each target's exits into explicit desired terminal predicates and derive a
reviewable prerequisite graph before choosing a forward execution.

### Status

Complete for the initial closed vocabulary and Key Pyramid vertical slice. The
pure `plan` layer, deterministic regression kernel, synthetic ATDD, and checked
MS/Lynx parent theories are described in
[P3 terminal-first planning and contextual witnesses](p3-terminal-planning-and-witness.md).
The Key Pyramid parent plans intentionally remain unresolved.

### Deliverables

- Implement the closed initial planning predicate and declarative-achiever
  vocabulary for exits, regions, placement-bound collections, and resource
  gates. Runtime contract predicates and footprints belong to P3B; causal event
  assertions remain deferred until P2B supplies the journal.
- Create a target-scoped terminal root for every exit placement and coordinate;
  represent multiple exits as explicit alternatives rather than silently
  choosing one.
- Build deterministic AND/OR `GoalGraph` candidates by symbolic regression over
  typed achiever declarations for the initial terminal, region, collection, and
  resource-gate vocabulary. This slice defines declarative semantics, not the
  general tactic controllers or search algorithms deferred to P7.
- Declare `ccsolver/src/plan` as a pure source layer before adding the regression
  kernel, define its reviewed dependencies on domain/static-analysis surfaces,
  expose a narrow package entrypoint, and add architecture tests that reject
  host, renderer, runtime, and ruleset implementation imports.
- Record each desired postcondition, selected achiever, residual prerequisites,
  alternatives, rejections, static-evidence references, uncertainty, and bounds
  in a reviewable backward-planning trace.
- Treat P1 regions, boundaries, resource dependencies, transports, and exit
  attachments as candidate evidence only. Unknown or dynamic topology never
  proves a prerequisite or traversal.
- Keep the selected `ExpandedPlan` in forward execution order and distinguish it
  from both the backward-planning trace and the target-specific
  `ExecutionWitness`. Give repeated operations distinct occurrence IDs or
  bounded expansions.
- Detect cyclic regression, inconsistent resource consumption, and unresolved
  prerequisites deterministically.
- Never reverse-simulate gameplay, actors, or RNG. Engine authority remains
  forward checkpoint-and-advance execution through P2.

### Exit gate

- Terminal-first regression produces stable, reviewable graphs for a one-room
  exit, a key-and-door route, and a chip-and-socket route.
- A synthetic level with two exits retains both alternatives and records why a
  selected branch was chosen or rejected.
- Shuffled equivalent inputs produce byte-identical graph and regression data.
- The package build and architecture gate accept the declared pure `plan` layer
  and reject a representative forbidden dependency from it.
- Unknown or dynamic topology remains an explicit unresolved condition rather
  than becoming an open path.
- Cyclic, resource-inconsistent, and no-achiever cases return bounded,
  reproducible diagnostics.
- Target-specific premises may yield different MS and Lynx graphs; parity is
  preferred but is not an invariant.

## P3B: exact contextual witnesses and start/end capture

### Objective

Make selected subgoals independently repeatable, forward-verifiable, and
visually inspectable without falsifying their full-world context.

### Status

Complete for the pure executor and first real dual-target leaf. The checked
Key Pyramid witness collects the exact adjacent red-key placement under a fixed
donor-independent manual seed in MS and Lynx. It binds one exact selected
segment of the unresolved parent theory; verification never upgrades that
parent.

### Deliverables

- Define prefix-derived contextual-witness identity from level, ruleset, seed,
  replay/prefix digest, entry boundary, and state digest.
- Cache opaque engine checkpoints by complete implementation dependency; do not
  make them durable schema data.
- Add separate derivation, observation, review, and verification provenance.
- Add separate evidence-coverage, ruleset-scope, and robustness fields. This
  executor emits exact, semantic-only, or broken joins; replanned composition is
  reserved for the later live-composition layer.
- Implement exact state/effect diffs and contract validation.
- Implement prefix replay, checkpoint caching, repeated short-interval execution,
  and cropped render projection over full-world simulation.
- Capture exact starting and ending ticks, normalized observations, state
  digests, deterministic render frames, noncausal observed state changes, and
  their content references for every contextual witness. Ordered causal events
  remain P2B work.
- Capture a fixed causal viewport and annotation inputs for the two boundary
  frames. A bounded intermediate frame sequence may be retained for animation,
  but it is optional and derivative.
- Explicitly retain input-latch, time, RNG, actor-order, and global device state.

### Exit gate

- Deleting the checkpoint cache and rebuilding from the prefix yields the same
  entry digest and snippet result.
- Prefix plus snippet equals uninterrupted execution.
- Changing level, seed, prefix, boundary, or engine build invalidates the cache.
- Synthetic offscreen-actor, RNG, teleport, actor-order, and held-input cases
  prove that spatial cropping is never treated as correctness.
- Starting and ending observations, digests, and frames regenerate identically
  and refer to the exact entry and stop boundaries of the witness.
- Omitting an optional intermediate frame sequence does not invalidate an exact
  witness or its two boundary captures.
- Two capsules compose only by executing consecutively through one live state.

## P4A: minimum subgoal evidence surface

**Status:** delivered as a checked preview; P4B is now delivered below.

### Objective

Make one exact subgoal understandable from a static page before using the
presentation model on the first real end-to-end level.

### Deliverables

- Define provisional content-addressed subgoal-evidence data alongside its
  producing slice rather than extending the P1 basic dossier summary or
  prematurely freezing a root artifact schema.
- Render one target-specific subgoal section in this mandatory order:
  1. an annotated **Starting State** panel bound to the exact witness entry tick,
     observation, digest, viewport, and accessible prose;
  2. optional bounded interactive playback or generated animation; and
  3. an annotated **Ending State** panel bound to the exact witness stop tick,
     observation, digest, viewport, accessible prose, and observed state delta.
- Keep panels and textual equivalents usable when no animation is generated.
- Label generated frames, posters, GIFs, and videos as derivative review aids;
  the contextual witness and forward engine execution remain authoritative.
- Add a minimal durable review layer with `unreviewed`, `reviewed`, and
  `changes-requested` status, human notes, and reviewed overlay overrides kept
  separate from regenerated machine annotations.
- Generate a deterministic static page and content-addressed assets for one
  successful real dual-target contextual witness and one failed standard-only
  synthetic contextual witness. The failed view shows its Starting State,
  intended Ending State, actual stop/failure state, and first failed predicate
  or observed divergence without conflating expected and observed evidence.

### Exit gate

- The real and synthetic subgoal views and their boundary panels regenerate
  identically from canonical evidence data.
- Removing either the Starting State or Ending State binding fails validation or
  generation; removing optional animation does not.
- Panel annotations identify the target, level, subgoal, boundary tick, viewport,
  and relevant cells or actors, with equivalent text.
- Backward obligation, forward intent, donor evidence, and observed routes use
  distinct labels; an abstract frontier meet is never rendered as a proven
  continuous route.
- Regenerating machine annotations preserves reviewed notes and overrides, while
  a changed bound witness sets their review state to `changes-requested` with a
  stale-binding reason rather than silently carrying approval forward.
- The failed synthetic case visibly distinguishes its intended ending from its
  actual failure observation and identifies the first failed predicate or
  observed divergence.
- The page never implies that a cropped frame or animation proves full-world
  correctness.

Delivery order is P4A, then P5, then P4B. P4 is complete only after P4B passes
its exit gate.

## P5: first manually guided end-to-end level

**Status:** delivered for the paired Key Pyramid reference case. The checked
bundle retains a canonical `expanded-plan` root and six exact same-run joins per
target, complete TWS files, and matching TypeScript/native traces. The plan is
honestly `candidate`; its witness, certificate, and corpus record share the
same non-null plan reference and establish `solved-current`. MS
triggers/settles at 644/644; Lynx triggers/settles at 647/660.

### Objective

Prove the terminal-first semantic-plan-to-certified-TWS pipeline on one real
paired level before scaling decomposition and search.

### Deliverables

- Use CCLP1 level 1, Key Pyramid, selected in P1B and covered by its paired
  static golden, as the initial real end-to-end level. Record an explicit
  evidence-based revision if runtime measurements later make it unsuitable.
- Seed each target analysis from its exit alternatives, construct and review a
  backward-planning trace and prerequisite graph, then select a forward
  `ExpandedPlan` whose subgoals connect the real initial state to victory.
- Write a reviewed human description, static theory, goal graph, and contracts.
- Materialize exact MS and Lynx witnesses for each selected subgoal.
- Use one shared plan where honest, with target-specific local implementations
  or different prerequisite branches as needed.
- Execute the selected subgoals continuously through one full target state.
- Publish the mandatory annotated Starting State and Ending State panels for
  every selected target-specific subgoal; animation remains optional.
- Record decisions, assemble complete target-specific TWS files, and round-trip
  them through the existing codec.
- Certify both generated replays in the target TypeScript engine and native
  oracle.
- Validate the provisional external artifact protocol against this first real
  vertical slice and publish the resulting conformance fixture.
- Publish the P4A evidence surface and replay certificates as the real input to
  P4B's full dossier work.

### Exit gate

- The reviewed backward-planning trace starts at an explicit target exit,
  accounts for every selected subgoal prerequisite, and yields the forward plan
  used to generate the replay.
- The MS and Lynx TWS files are generated from checked-in semantic artifacts,
  not copied donor bytes.
- The MS replay wins from the original level start in the TypeScript MS engine
  and native MS oracle; the Lynx replay likewise wins in the TypeScript Lynx
  engine and native Lynx oracle.
- Every selected edge is exact or successfully replanned; no semantic-only edge
  appears as complete.
- Every selected target-specific subgoal has exact, annotated Starting State and
  Ending State panels even when it has no animation.
- Deleting generated outputs and rebuilding reproduces the planning trace,
  certificates, and evidence surface.

Passing P5 proves the certified replay pipeline. The first real level reaches
the global level definition of done only after P4B adds its complete dossier.

## P4B: full dossier and evidence surface

**Status:** delivered for Key Pyramid as a checked compact manifest/review and
a deterministic static bundle emitted under `web/dist/dev/ccsolver/`. The page is
complete without JavaScript and remains `unreviewed` until a person records a
decision.

### Objective

Expand the P4A subgoal proof into a compact, static laboratory for reviewing the
first real level and every later claim.

### Deliverables

- Add an independent static bundle under `web/dist/dev/ccsolver/`.
- Add a direct master route and stable per-level routes beneath Vite's
  configured Pages base path.
- Exclude CCSolver routes from the player UI, homepage, and sitemap; add
  `noindex` metadata.
- Build a full-width, fit-to-view whole-level renderer with authentic standard
  game artwork, evidence overlays, and cropped segment routes whose labels can
  switch between local and whole-route visit order.
- Add layer, region, wiring, teleport, force/ice, resource, donor-path, and
  subgoal overlays.
- Render human narrative, strategy portfolio, accessible graph table, subgoal
  contracts, evidence, joins, state/event diffs, failures, and provenance.
- Retain the mandatory annotated Starting State and Ending State panels from
  P4A for every target-specific subgoal.
- Support optional deterministic interactive playback with semantic, raw-tick,
  and wall-time comparison modes when a bounded frame sequence exists.
- Support optional short focused GIF export with poster frames and
  reduced-motion behavior; a dossier must remain complete without it.
- Generate graphs from canonical plan data; do not maintain a separate hand
  edited graph source.
- Update the Pages workflow's install and cache steps to include the selected
  workspace/lockfile model and the CCSolver dossier build.

### Exit gate

- The app-relative `/dev/ccsolver/` index and one level URL work beneath the
  production `BASE_PATH` (currently `/tworld/` on project Pages).
- A direct static-directory request and the SPA `404.html` fallback are tested
  separately.
- No discoverability link exists in the ordinary Tile World experience.
- Dossier sources, the P5 real-level page, and mandatory boundary panels
  regenerate identically.
- The P5 case satisfies the global level definition of done with its complete
  dossier and replay certificates.
- Every subgoal remains understandable from its two annotated boundary panels
  and textual evidence without interactive playback, GIF, or video.
- Boundary summaries expose human-readable chips, keys, boots, player state,
  and terminal state while machine identities and hashes remain in linked raw
  evidence rather than the primary review surface.
- When optional playback or media is generated, it is pinned, bounded, and
  deterministic for golden snippets.

## P6: donor alignment and strategy portfolios

### Objective

Infer useful semantic structure from donor execution while preserving real
ruleset divergence.

### Status

**P6A causal alignment foundation: delivered.** The pure bounded aligner uses
hard, medium, and soft semantic anchors, retains repeated-event ordinals,
supports bounded one-to-many movement spans, and reports unmatched or causal
divergence explicitly. The checked Key Pyramid slice aligns the two fresh
target journals without using coordinates or native ticks as hard identity and
produces the first provisional strategy portfolio. Broader cross-level plan
shape acceptance remains P6 follow-on work. See
[P2B/P6A causal alignment](p2b-p6a-causal-alignment.md).

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

- Expand the declarative achiever vocabulary introduced in P3A into executable
  operators such as `Reach`, `Collect`, `Unlock`, `PushTo`, `Activate`,
  `WaitUntil`, `ClearRoute`, `TraverseForced`, `Teleport`, and `ReachExit`.
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

1. one-room route rooted backward from an explicit exit;
2. two exits retained as explicit terminal alternatives;
3. collect chips and clear a socket;
4. key/inventory/door order;
5. one safe block push and one deadlock;
6. button-to-device effects;
7. ice and force movement with a blocked forced direction;
8. teleport routing and repeated coordinates;
9. moving-actor and actor-order interference;
10. RNG consumption and predicate-based waiting; and
11. an offscreen effect proving full-world capsule execution.

P1B freezes the first real training and evaluation cohorts. Key Pyramid is the
selected first vertical slice. Booster Shots, Tunnel Clearance, Teleport
Trouble, and Two Sets of Rules remain adversarial architecture canaries, not
expected early solver wins.

## Test matrix

### Unit

- schema validation, canonicalization, IDs, predicates, graph rules, facts,
  events, symbolic regression, cycle/resource diagnostics, and operator
  semantics.

### Golden

- representative artifacts, event journals, topology, contracts, selected
  backward-planning traces, dossiers, graph SVGs, annotated starting/ending
  panels, and short render sequences.

### Metamorphic

- uninterrupted versus checkpoint/restore;
- cache retained versus rebuilt;
- canonical backward graph versus shuffled equivalent evidence;
- boundary panels with versus without an optional intermediate frame sequence;
- TWS encode/decode/replay;
- semantic observer enabled versus disabled; and
- equivalent candidate actions and deterministic search reruns.

### Differential

- TypeScript MS versus native MS oracle;
- TypeScript Lynx versus native Lynx oracle; and
- target replay result and semantic terminal facts.

### Contract and integration

- deliberate unresolved-regression, precondition, invariant, footprint,
  postcondition, missing-boundary-panel, join, and certification failures;
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
- terminal goal, backward-planning trace, selected plan/subgoal, and exact entry
  derivation;
- first unresolved prerequisite or rejected achiever when decomposition fails;
- first failed predicate or divergent semantic event;
- the annotated Starting State, intended Ending State, and actual stop/failure
  evidence references when contextual execution exists;
- local state/event window and relevant map region;
- attempted decisions and bounded search summary;
- category, current hypothesis, and next recommended action; and
- links to the dossier node and source artifacts.

This packet is the default context for an agent or human taking over the case.

## Definitions of done

A subgoal is done only when its contract, provenance, exact witness, state/event
evidence, bounds, live composition status, and annotated Starting State and
Ending State panels with textual equivalents are recorded. Animation is
optional and never substitutes for either boundary panel.

A level is done only when its analysis, reviewed narrative, terminal-rooted
backward-planning trace, strategy portfolio, selected forward execution,
generated replay for each claimed target, TypeScript/native certificates, and
dossier regenerate from pinned inputs. A reviewed exception with retained
evidence is the only alternative.

The paired-corpus effort is done only when every in-scope target-ruleset record
has been attempted and is either certified or explicitly reviewed. A coverage
percentage by itself is never completion.

## Immediate next change

After human review of the checked Key Pyramid causal-alignment page, proceed
with one large **P6B portfolio-canary + P7A tactic-realization vertical slice**
using ATDD. This advances from explaining one known route to constructing and
repairing bounded semantic work; it does not broaden the P2B foundation by
speculation.

1. freeze standard-only, DATTools-valid P6B acceptance cases for a shared plan
   with different local timing, a shared subgoal with a different local route,
   alternative branches with a proven rejoin, and a genuinely different plan;
2. include the named real canaries CCLP3 level 16 (different plans) and CCLP1
   level 67 (causal donor disagreement), while keeping any donor-derived
   evidence explicitly labeled and non-authoritative;
3. extend the portfolio artifact so each proposed plan family binds its exact
   aligned evidence, target scope, dependencies, confidence, unresolved gaps,
   and review state without upgrading a proposal to a proof;
4. implement the first executable P7A operators for the smallest useful
   `Reach`/`Collect`/`Unlock`/`WaitUntil` subset, with target-specific tactic
   implementations behind one semantic contract;
5. evaluate every candidate through exact checkpoint, real-engine advance, and
   restore under explicit work, tick, branch, and memory bounds; a pure planner
   probe may be added only after an equivalence canary exists;
6. prove deterministic exhaustion diagnostics, inject one decision failure,
   and repair or recompile only the affected suffix; and
7. publish one non-Key checked dossier that shows the proposed portfolio,
   selected tactic realization, exact witness, failure/repair evidence, and the
   boundary between donor guidance and solver construction.

The cycle is complete only when the canaries reject false parity, the selected
tactic succeeds from canonical initialization without a canned full input
stream, the exact replay is independently certified, and regeneration is
byte-stable. Full-corpus sweeps remain unjustified until these bounded cases
establish that the abstractions are useful.

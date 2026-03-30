# Plugin Architecture Follow-On Plan

This plan replaces the completed PA1-PA10 roadmap.

Current baseline:

- [x] decode/load/render/runtime registration has a real ruleset seam
- [x] portable-item runtime and stateful-actor runtime exist
- [x] bowling-ball and hook behavior no longer live primarily in the engine entrypoints
- [x] engine guardrails exist to keep migrated helpers out of the kernel

That work got the codebase to "family-owned registration and runtime helpers".
The next goal is stronger:

- move from metadata and helper seams toward per-element lifecycle handlers
- let elements look more like `testEnter`, `startEnter`, `finishEnter`, `testExit`, `finishExit`
- make concrete element modules own behavior instead of being interpreted later by masks and outcome enums

This is still not a proposal for external plugin loading.
It is an in-repo architectural cleanup to make the rulesets behave more like plugin systems.

## Motivation

We have reduced engine bloat, but we still have a structural gap:

- catalogs mostly return masks, tags, and outcome enums
- helper layers still translate those enums into imperative behavior
- many gameplay changes still require touching shared interpreter files instead of only the element module

That means a new tile or actor often still fans out across:

- catalog metadata
- arrival/interaction helpers
- floor/activation helpers
- movement/vertical helpers
- render/decode/load registration
- targeted engine tests

For example, the current seams are good enough to add new registrations cleanly, but not yet good enough to let `cloud.ts`, `ice.ts`, `hook.ts`, or a future `ghost.ts` own most of their own rules.

## Goal

After this follow-on plan, adding a new element should usually mean:

1. create one concrete element module per ruleset, or a shared family factory plus thin MS/Lynx wrappers
2. register its decode/load/render behavior in that module
3. register its lifecycle handlers in that module
4. add focused tests

It should not usually mean:

- editing `engine.ts`
- adding new raw tile-id branches in shared helper interpreters
- adding one more enum value that must later be interpreted elsewhere

## Non-Goals

- no deep class hierarchy like `mob -> monster -> ant`
- no attempt to unify MS and Lynx timing/order into one shared runtime
- no external plugin loader
- no giant rewrite that invalidates replay characterization all at once

## Design Principles

### Kernel responsibilities

The kernel should own:

- phase order and cadence
- occupancy bookkeeping
- board mutation primitives
- actor arrays and indexes
- replay scheduling and history
- z-layer traversal
- debug tracing
- dispatch of lifecycle hooks

The kernel should not own:

- tile-specific entry/exit effects
- actor-specific blocked-move behavior
- support semantics for specific element families
- ad hoc portable-item or trap/cloner exceptions

### Element responsibilities

Elements should own:

- entry legality
- exit legality
- start-of-entry and completion-of-entry effects
- blocked-move effects
- support behavior
- activation behavior
- trap/cloner special-floor behavior
- collision behavior
- local inventory semantics
- render/decode/load registration

### Composition over inheritance

Inheritance is still the wrong default here.
Behavior is orthogonal, not tree-shaped.

Use:

- shallow interfaces
- composition helpers
- family builders
- capability bundles

Good targets:

- `createFloorElement(...)`
- `withHazardEnter(...)`
- `withTurnToAirOnExit(...)`
- `createMonsterActor(...)`
- `withBallisticCollision(...)`
- `withPortableBacking(...)`
- `withChipLikeInventory(...)`

## Target Architecture

### Tile lifecycle contract

Each ruleset should be able to register tile handlers along these lines:

- `testEnter`
- `startEnter`
- `finishEnter`
- `testExit`
- `finishExit`
- `support`
- `activate`
- `tick`
- `render`
- `decode`
- `load`

Not every tile needs every hook.
Most tiles should be built from families that provide defaults.

### Actor lifecycle contract

Each ruleset should be able to register actor handlers along these lines:

- `testMove`
- `startMove`
- `finishMove`
- `blockedMove`
- `collision`
- `arrival`
- `support`
- `heldFloor`
- `trapRelease`
- `clonerEntry`
- `clonerClone`
- `portableBacking`
- `render`

### Dispatch model

The engine should ask dispatchers questions like:

- "can this actor enter this tile?"
- "what happens when this actor starts entering?"
- "what happens when this tile is exited by this actor?"
- "what supports this actor here?"

It should not ask:

- "is this tile water/fire/bomb/cloud?"
- "is this actor a bowling ball / hook / portable-backed special case?"

## What Still Needs To Change

Even after PA10, the remaining architectural pain is concentrated in interpreter layers like:

- chip arrival / actor arrival helpers
- tile-effects helpers
- floor-impact helpers
- vertical/support helpers
- trap/cloner helpers
- movement helpers that still interpret masks and outcome enums

Those files are cleaner than before, but they still represent "behavior translation" more than true element ownership.

## Concrete End State Examples

### Cloud

After this plan, `cloud.ts` should own:

- decode/load behavior for `0x72`
- render alpha
- support behavior
- `finishExit` turning the tile to air

Adding cloud should not require edits to engine hot paths.

### Bowling ball

After this plan, `bowlingBall.ts` plus its family helpers should own:

- moving/still lifecycle
- throw activation
- collision semantics
- trap/cloner semantics
- support semantics
- local inventory behavior

The engine should only schedule movement and dispatch handlers.

### Future ghost / fake player

These should be expressible by composing:

- actor movement policy
- collision policy
- support policy
- local inventory policy
- tile-entry overrides

without introducing one-off engine branches.

## Migration Strategy

Do not replace everything in one pass.

Do this instead:

1. define typed lifecycle contracts
2. build dispatcher adapters around the existing helper layers
3. migrate one seam at a time
4. keep MS and Lynx handlers separate even when the hook names are shared
5. delete the old enum/mask translation layers only after replay coverage is stable

## Success Criteria

- [ ] adding a floor-like tile with custom enter/exit/support behavior does not require engine edits
- [ ] adding an actor with custom blocked-move/collision/arrival behavior does not require engine edits
- [ ] render, decode, load, and behavior registration for a concrete element are co-located
- [ ] MS and Lynx share lifecycle shapes, not forced shared logic
- [ ] old translation layers shrink to thin dispatch adapters or disappear entirely
- [ ] a new tile like `cloud` or `popup wall` can live mostly in its own module
- [ ] a new actor like `ghost`, `fake player`, or `bowling ball` can live mostly in its own module

## Roadmap

### PA11: Define Lifecycle Hook Types

Goal:

- introduce first-class tile and actor lifecycle interfaces

Targets:

- `web/src/game-core/api/ruleset.ts`
- new lifecycle type modules under `web/src/game-core/api/`
- ruleset registration types

Checklist:

- [x] define tile lifecycle hook interfaces with `testEnter/startEnter/finishEnter/testExit/finishExit/support/activate/tick`
- [x] define actor lifecycle hook interfaces with `testMove/startMove/finishMove/blockedMove/collision/arrival/support`
- [x] define narrow context types so handlers do not receive giant bags of unrelated arguments
- [x] add defaults/null-object helpers so elements only implement the hooks they need

Tests:

- [x] type-level registration tests
- [x] architecture tests proving engines depend on lifecycle dispatch, not concrete element modules

### PA12: Add Dispatch Registries And Adapters

Goal:

- route existing behavior through lifecycle dispatch without changing gameplay yet

Targets:

- `elementRegistration.ts` in both rulesets
- current arrival/tile/floor interpreter seams

Checklist:

- [x] add tile lifecycle registries to both rulesets
- [x] add actor lifecycle registries to both rulesets
- [x] wrap current enum/mask behavior in adapter handlers
- [x] keep behavior identical while introducing the new call shape

Tests:

- [x] registration coverage tests
- [x] focused replay checks proving no behavior drift

### PA13: Migrate Tile Enter/Exit Behavior First

Goal:

- make tile modules own entry/exit semantics

First targets:

- `water`
- `fire`
- `bomb`
- `dirt`
- `popup wall`
- `blue wall` real/fake variants
- `cloud`

Checklist:

- [x] move `testEnter` and `finishEnter` semantics into concrete tile modules
- [x] move `finishExit` semantics into concrete tile modules
- [x] reduce tile-effects and floor-impact translators accordingly
- [x] ensure chip and non-chip entry both use the same tile-owned seam where appropriate

Tests:

- [x] focused engine tests for each migrated tile
- [x] bounded replay sweeps around affected packs

### PA14: Migrate Support And Vertical Semantics

Goal:

- make support decisions plugin-owned instead of scattered through vertical helpers

First targets:

- `air`
- `cloud`
- `elevator`
- portable items on air
- actor support exceptions like blocks and bowling balls

Checklist:

- [x] introduce support-provider and support-consumer hooks
- [x] move tile-specific support semantics out of generic vertical helpers
- [x] move portable-item support/drop semantics onto shared portable/special-item families
- [x] keep MS/Lynx ordering differences in the ruleset runtime, not the shared hook shapes

Tests:

- [ ] air/cloud/elevator regression suites
- [ ] portable-item drop/support regression suites
- [ ] targeted replay sweeps for vertical interaction levels

### PA15: Migrate Forced Floors, Teleports, Traps, And Cloners

Goal:

- make special-floor behavior element-owned

First targets:

- `ice`
- `force floors`
- `teleport`
- `beartrap`
- `clone machine`

Checklist:

- [ ] move forced-direction queries behind tile hooks
- [ ] move trap/cloner entry and release behavior behind tile + actor hooks
- [ ] let actor families express how they behave on those floors without raw tile-id branches
- [ ] keep clone/trap timing differences ruleset-local

Tests:

- [ ] focused trap/cloner/teleport/ice suites
- [ ] bounded replay sweeps for known special-floor levels

### PA16: Migrate Actor Collision And Arrival Ownership

Goal:

- make actor modules own collision, blocked-move, and arrival behavior

First targets:

- `block`
- `ballistic` families
- `bowling ball`
- `chip-like` actors
- core monster families

Checklist:

- [ ] move collision policy from outcome translators to actor handlers
- [ ] move blocked-move behavior to actor handlers
- [ ] move arrival side effects to actor handlers where the actor is the real owner
- [ ] leave kernel occupancy and scheduling intact

Tests:

- [ ] focused collision and blocked-move suites
- [ ] bowling-ball characterization regressions
- [ ] targeted replay sweeps for movement-heavy packs

### PA17: Introduce Concrete Family Builders

Goal:

- make concrete element files small compositions instead of bespoke helper piles

Targets:

- `elements/tiles/families/*`
- `elements/actors/families/*`

Checklist:

- [ ] add family builders for `floor`, `wall`, `hazard`, `forcedFloor`, `button`, `trap`, `cloner`, `air`
- [ ] add family builders for `mob`, `monster`, `block`, `ballistic`, `portableBacked`, `playerLike`
- [ ] make concrete element modules mostly composition declarations
- [ ] avoid class inheritance and keep builders data-plus-hook oriented

Tests:

- [ ] family builder unit tests
- [ ] registration smoke tests for representative concrete elements

### PA18: Co-Locate Concrete Element Ownership

Goal:

- put decode/load/render/behavior registration in one home per concrete element

Checklist:

- [ ] `elementRegistration.ts` becomes assembly only
- [ ] concrete element modules export a single registration bundle
- [ ] remove duplication between registration and behavior helper files
- [ ] make new elements land in one obvious place

Tests:

- [ ] registration completeness tests
- [ ] architecture tests forbidding behavior logic in assembly-only files

### PA19: Remove Legacy Translation Layers

Goal:

- delete the temporary adapters once lifecycle ownership is real

Checklist:

- [ ] remove deprecated mask/outcome translation helpers that only exist for back-compat
- [ ] remove now-redundant tile and actor switch statements
- [ ] tighten architecture tests to prevent raw tile-id branches from returning
- [ ] keep only scheduler/order/occupancy/runtime bookkeeping in the engines

Tests:

- [ ] full relevant typechecks
- [ ] broader replay sweeps for both rulesets
- [ ] focused regression suites for migrated lifecycle seams

## Exit Gate

- [ ] the engines read primarily as schedulers and dispatchers
- [ ] concrete element modules own most concrete gameplay behavior
- [ ] adding `cloud`, `ghost`, `fake player`, `hook`, or similar elements is mostly local work
- [ ] adding a genuinely new gameplay concept requires adding a new typed seam, not scattering new conditionals

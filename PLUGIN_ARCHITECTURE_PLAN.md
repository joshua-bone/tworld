# Plugin Architecture Plan

This plan is for one specific architectural goal:

- make new elements mostly registerable instead of hand-wired
- keep MS and Lynx timing/order differences intact
- reduce the number of engine-hot-path edits required for tiles like `cloud` or actors like `bowling ball`
- move toward element modules such as `floor.ts`, `wall.ts`, `air.ts`, `mob.ts`, `monster.ts`, `ballistic.ts`

This is not a proposal to build external plugin loading.
It is a proposal to make the in-repo ruleset architecture behave like a plugin system.

## Summary

The repo already has partial plugin structure:

- tile metadata lives in `catalogTiles.ts`
- actor metadata lives in `catalogActors.ts`
- decode/load wiring lives in `elementRegistration.ts`
- render wiring lives in `renderRegistration.ts`

That is good, but it is still metadata-first.
The real behavior still fans out through:

- `chipArrival.ts`
- `tileEffects.ts`
- `floorImpactPolicy.ts`
- `actorMovement.ts`
- `chipMovement.ts`
- `trapCloner.ts`
- `portableItems.ts`
- `engine.ts`

So a new element still needs:

1. metadata registration
2. enum translation
3. behavior glue in helpers
4. engine exceptions when existing seams are not expressive enough
5. separate render and decode work

That is why `cloud` touched many files.

## Current Diagnosis

### What is already working

- ruleset-specific catalogs exist
- actor capability policy is composition-friendly
- portable-item runtime and stateful-actor runtime already exist
- MS and Lynx are already allowed to differ in ordering and timing
- render and decode are at least partially registered instead of fully hardcoded

### What is still structurally weak

- registration returns enums and masks, not executable behavior
- effectful code is interpreted later by shared `switch` statements
- many helpers are still shared “action translators” instead of true element handlers
- engine kernels still know too much about specific elements and families
- render/decode/runtime registration are related but still separate seams

### Why `cloud` still spread across many files

`cloud` needed all of these:

- DAT decode/load registration
- tile policy registration
- mob-exit behavior
- support semantics
- renderer/projection behavior
- artwork registration
- tests in multiple layers

That spread was not because `cloud` is inherently complicated.
It happened because there is no single element-owned behavior registration seam.

## Architectural Goal

After this cleanup, adding an element should usually mean:

1. add one element module per ruleset, or one shared family module plus thin ruleset wrappers
2. register decode/load/render metadata in one place
3. register behavior handlers in one place
4. add focused tests

If a feature still requires editing engine hot paths, that should mean:

- the kernel is missing a real lifecycle seam

not:

- the element itself needs special treatment

## Kernel vs Plugin Boundary

### Kernel should own

- turn order and phase scheduling
- movement cadence and timing
- replay integration
- undo/history integration
- occupancy bookkeeping
- runtime actor arrays / indexes
- z-layer traversal and layer switching
- shared board mutation primitives
- debug projection and trace recording

### Element plugins should own

- entry legality
- exit legality
- what happens when entry starts
- what happens when entry completes
- what happens when exit completes
- support semantics
- activation semantics
- collision semantics
- blocked-move semantics
- clone/trap/portable family behavior
- render metadata
- decode/load metadata

## Inheritance Assessment

Deep inheritance like:

- `mob -> monster -> ant`

is not the recommended model here.

Reasons:

- gameplay behavior is orthogonal, not tree-shaped
- many actors mix traits from multiple families
- TypeScript object composition fits this codebase better than class hierarchies
- inheritance would make MS/Lynx divergence harder to express cleanly

Recommended model:

- composable family builders
- shallow interfaces
- explicit capability bundles

Good examples of the shape we want:

- `createMobActor(...)`
- `withMonsterMovement(...)`
- `withBallisticCollision(...)`
- `withPortableBacking(...)`
- `withChipLikeInventory(...)`
- `createFloorTile(...)`
- `withTeleportExit(...)`
- `withTurnToAirOnExit(...)`

So yes, `mob.ts`, `monster.ts`, `ballistic.ts`, `floor.ts`, `wall.ts`, `air.ts` are good targets.
They should be composition modules, not base classes.

## Proposed Model

### Tile plugin shape

Each ruleset should be able to register a tile behavior bundle with handlers along these lines:

- `probeEnter`
- `beginEnter`
- `completeEnter`
- `probeExit`
- `completeExit`
- `probeSupport`
- `onActivate`
- `onTick`
- `render`
- `decode/load`

Not every tile uses every hook.
Most tiles will be built from family helpers that fill in defaults.

### Actor plugin shape

Each ruleset should be able to register an actor behavior bundle with handlers along these lines:

- `probeMove`
- `beginMove`
- `completeMove`
- `blockedMove`
- `collision`
- `arrival`
- `heldFloor`
- `trapRelease`
- `clonerEntry`
- `clonerClone`
- `support`
- `portableBacking`
- `render`

### Family modules

Target module families:

- `elements/tiles/families/floor.ts`
- `elements/tiles/families/wall.ts`
- `elements/tiles/families/door.ts`
- `elements/tiles/families/button.ts`
- `elements/tiles/families/forcedFloor.ts`
- `elements/tiles/families/trap.ts`
- `elements/tiles/families/cloner.ts`
- `elements/tiles/families/air.ts`
- `elements/tiles/families/pickup.ts`
- `elements/actors/families/mob.ts`
- `elements/actors/families/monster.ts`
- `elements/actors/families/block.ts`
- `elements/actors/families/ballistic.ts`
- `elements/actors/families/portableBacked.ts`
- `elements/actors/families/playerLike.ts`

Concrete elements would then become small compositions:

- `tiles/cloud.ts`
- `tiles/ice.ts`
- `tiles/teleport.ts`
- `actors/bowlingBall.ts`
- `actors/glider.ts`
- `actors/ball.ts`

## Migration Principle

Do not rewrite the engine in one pass.

Instead:

1. add handler registries and adapters
2. route existing enum-based behavior through those adapters
3. migrate one seam at a time
4. only then delete old translation layers

That keeps replay stability measurable.

## Success Criteria

- [ ] adding a floor-like tile with custom enter/exit behavior does not require editing engine hot paths
- [ ] adding a new actor family with custom collision/blocked-move/floor-arrival behavior does not require editing engine hot paths
- [ ] render, decode, and behavior registration for a new element are co-located
- [ ] MS and Lynx can share family-builder shapes without being forced to share timing logic
- [ ] cloud-like elements can be added with only element-module, art, and tests changes
- [ ] bowling-ball-like elements can be added with only family/element-module, art, and tests changes unless a truly new kernel seam is needed

## PR Roadmap

### PA1: Write The Kernel Contract

Goal:

- freeze what belongs to the kernel versus what belongs to element plugins

Targets:

- `web/src/game-core/api/ruleset.ts`
- new doc comments in ruleset registration types
- this plan can be referenced from repo docs if needed

Checklist:

- [x] define tile lifecycle phases by name
- [x] define actor lifecycle phases by name
- [x] define support/activation/render/decode seam ownership
- [x] document “no new raw tile-id branches in engine hot paths” rule

Tests:

- [x] none beyond typecheck

Exit gate:

- [x] the lifecycle vocabulary is stable enough that later PRs do not rename core seams again

### PA2: Introduce Executable Tile And Actor Handler Interfaces

Goal:

- upgrade registration from metadata-only to metadata-plus-handlers

Targets:

- `web/src/game-core/api/ruleset.ts`
- new files under `web/src/game-core/api/` for tile/actor handler interfaces
- optional adapter helpers under `web/src/game-core/impl/`

Checklist:

- [x] add `TileBehavior` interface
- [x] add `ActorBehavior` interface
- [x] add default no-op behavior helpers
- [x] keep current catalogs working through adapters

Tests:

- [x] new unit tests for default handler behavior
- [x] typecheck `game-core`
- [x] typecheck `tests`

Exit gate:

- [x] rulesets can register behavior objects without changing runtime behavior yet

### PA3: Create Tile Family Builders

Goal:

- replace large tile-policy sets and ad hoc tag derivation with composable family definitions

Targets:

- `web/src/ruleset-ms/impl/catalogTiles.ts`
- `web/src/ruleset-lynx/impl/catalogTiles.ts`
- new family modules under:
  - `web/src/ruleset-ms/impl/elements/tiles/families/`
  - `web/src/ruleset-lynx/impl/elements/tiles/families/`

Checklist:

- [x] add `floor` family builder
- [x] add `wall` family builder
- [x] add `pickup` family builder
- [x] add `door` family builder
- [x] add `button` family builder
- [x] add `forcedFloor` family builder
- [x] add `trap` family builder
- [x] add `cloner` family builder
- [x] add `air` family builder
- [x] rebuild tile policy tables from family composition

Tests:

- [x] catalog tile tests in both rulesets
- [x] focused policy tests for masks, tags, and actions
- [x] typecheck `ruleset-ms`
- [x] typecheck `ruleset-lynx`

Exit gate:

- [x] tile metadata is assembled from family composition, not large local constant sets plus special-case branches

### PA4: Create Actor Family Builders

Goal:

- replace flat actor capability switching with composable actor-family definitions

Targets:

- `web/src/ruleset-ms/impl/catalogActors.ts`
- `web/src/ruleset-lynx/impl/catalogActors.ts`
- new family modules under:
  - `web/src/ruleset-ms/impl/elements/actors/families/`
  - `web/src/ruleset-lynx/impl/elements/actors/families/`

Checklist:

- [x] add `mob` family builder
- [x] add `monster` family builder
- [x] add `block` family builder
- [x] add `ballistic` family builder
- [x] add `portableBacked` family builder
- [x] add `playerLike` family builder
- [x] refactor concrete actors to compose from these families

Tests:

- [x] catalog actor tests in both rulesets
- [x] focused actor capability tests for glider/fireball/bug/bowling ball
- [x] typecheck `ruleset-ms`
- [x] typecheck `ruleset-lynx`

Exit gate:

- [x] new actors can be defined by composing families instead of editing a large switch

### PA5: Replace Floor-Impact Enum Translation With Tile Handlers

Goal:

- move chip-enter behavior out of enum translation and into tile-owned handlers

Targets:

- `web/src/game-core/impl/floorImpact.ts`
- `web/src/ruleset-ms/impl/floorImpactPolicy.ts`
- `web/src/ruleset-lynx/impl/floorImpactPolicy.ts`
- `web/src/ruleset-ms/impl/chipArrival.ts`
- `web/src/ruleset-lynx/impl/chipArrival.ts`

Checklist:

- [x] introduce handler-driven chip enter flow
- [x] migrate collect/open-door/open-socket/popup/teleport/hazard behavior
- [x] keep portable-item replacement chaining as a shared hook instead of local conditionals
- [x] preserve MS and Lynx ordering differences

Tests:

- [x] chip arrival tests in both rulesets
- [x] teleport, popup wall, door, socket, hazard, and portable replacement tests
- [x] targeted replay checks for affected packs

Exit gate:

- [x] chip arrival no longer depends on action-enum translation switches for ordinary tile behavior

### PA6: Replace Exit And Support Enums With Tile Handlers

Goal:

- move leave/support behavior into tile-owned hooks

Targets:

- `web/src/ruleset-ms/impl/tileEffects.ts`
- `web/src/ruleset-lynx/impl/tileEffects.ts`
- new tile family modules for support and leave behavior

Checklist:

- [x] migrate `turn-to-air` exit behavior to tile handlers
- [x] migrate support probing for air/elevator/cloner/doors/socket/supporting walls
- [x] move cloud support/leave behavior into its tile module
- [x] keep blue-wall reveal/opening behavior shared but handler-driven

Tests:

- [x] cloud tests
- [x] air support tests
- [x] door/socket support-drop tests
- [x] typecheck `ruleset-ms`
- [x] typecheck `ruleset-lynx`

Exit gate:

- [x] adding a cloud-like tile no longer requires edits to generic tile-effects switch code

### PA7: Migrate Trap, Cloner, And Forced-Floor Family Behavior

Goal:

- move trap/cloner/floor-hold semantics to family handlers while the engine keeps scheduling

Targets:

- `web/src/ruleset-ms/impl/trapCloner.ts`
- `web/src/ruleset-lynx/impl/trapCloner.ts`
- `web/src/ruleset-ms/impl/controllers.ts`
- `web/src/ruleset-lynx/impl/controllers.ts`
- forced-floor helpers in both engines

Checklist:

- [ ] trap held/release behavior uses actor family hooks, not engine-local branches
- [ ] cloner entry/hold/release/clone behavior uses actor family hooks
- [ ] forced-floor hold/redirect semantics move to family modules
- [ ] bowling-ball and future ghost/fake-player hooks fit through the same seam

Tests:

- [ ] trap/cloner family tests
- [ ] focused engine tests for trap and cloner edge cases
- [ ] targeted replay sweeps around trap/cloner content

Exit gate:

- [ ] engine controls timing, plugins control family behavior

### PA8: Portable Item And Stateful Actor Plugin Unification

Goal:

- make portable-backed actors and portable tiles first-class element plugins

Targets:

- `web/src/ruleset-ms/impl/portableItems.ts`
- `web/src/ruleset-lynx/impl/portableItems.ts`
- stateful actor runtime helpers in both rulesets
- portable tool action helpers in both rulesets

Checklist:

- [ ] define portable-item family handler interfaces
- [ ] define actor portable-backing handler interfaces
- [ ] move sandbag/hook/bowling-ball shared lifecycle into family helpers
- [ ] keep local inventory and clone behavior in the plugin seam

Tests:

- [ ] portable item tests in both rulesets
- [ ] stateful actor lifecycle tests
- [ ] undo/projection tests where portable-backed state matters

Exit gate:

- [ ] a portable-backed actor family can be added without editing engine hot paths

### PA9: Unify Decode, Load, Render, And Behavior Registration

Goal:

- give each element one registration home

Targets:

- `web/src/ruleset-ms/impl/elementRegistration.ts`
- `web/src/ruleset-lynx/impl/elementRegistration.ts`
- `web/src/ruleset-ms/impl/renderRegistration.ts`
- `web/src/ruleset-lynx/impl/renderRegistration.ts`
- decode/load registration APIs

Checklist:

- [ ] tie decode/load/render/runtime behavior into one element registration object
- [ ] make render projection lookup family-aware and element-owned
- [ ] reduce cross-file registration duplication for portable items and stateful actors

Tests:

- [ ] render registration tests
- [ ] level decode/load tests
- [ ] projection tests
- [ ] typecheck `player-web`

Exit gate:

- [ ] adding a new element means editing one registration module and one element module, not four disjoint registries

### PA10: Slim The Engines To Kernel-Only Responsibilities

Goal:

- remove migrated element knowledge from the engine entrypoints

Targets:

- `web/src/ruleset-ms/impl/engine.ts`
- `web/src/ruleset-lynx/impl/engine.ts`
- any still-large helper modules that only remain as compatibility shims

Checklist:

- [ ] replace remaining raw element checks in engine hot paths with handler dispatch
- [ ] keep only scheduler/order/occupancy/runtime bookkeeping in the kernel
- [ ] add guardrails to prevent new raw tile-id branches from entering engine hot paths

Tests:

- [ ] full targeted replay sweeps for both rulesets
- [ ] full relevant typechecks
- [ ] focused regression suites for bowling ball, cloud, trap/cloner, air, teleports

Exit gate:

- [ ] the engine files mostly read like phase schedulers, not element encyclopedias

## Recommended Order After This Plan

If the immediate goal is future extensibility for:

- bowling balls
- ghosts
- fake players
- cloud-like terrain
- new portable items

then the best first implementation step is:

- PA2, then PA3, then PA4, then PA5

That is the earliest point where new elements stop defaulting to engine edits.

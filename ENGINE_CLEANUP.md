# Engine Cleanup Plan

## Scope

This plan is based on a fresh pass through the current MS and Lynx engine area, not the pre-cleanup state.

Files reviewed:

- `web/src/ruleset-ms/impl/engine.ts`
- `web/src/ruleset-lynx/impl/engine.ts`
- `web/src/ruleset-ms/impl/catalog.ts`
- `web/src/ruleset-lynx/impl/catalog.ts`
- `web/src/ruleset-ms/impl/verticalMovement.ts`
- `web/src/ruleset-lynx/impl/verticalMovement.ts`
- `web/src/ruleset-ms/impl/portableItems.ts`
- `web/src/ruleset-lynx/impl/portableItems.ts`
- `web/src/ruleset-ms/impl/chipInput.ts`
- `web/src/ruleset-lynx/impl/chipInput.ts`
- `web/src/game-core/api/actorCapabilities.ts`
- `web/src/game-core/impl/actorLocalInventory.ts`
- `web/src/game-core/impl/portableItems.ts`
- `web/src/ruleset-ms/impl/engine.test.ts`
- `web/src/ruleset-lynx/impl/engine.test.ts`

## Current Baseline

The cleanup work already done was worthwhile. The codebase is no longer in the state where the next feature should be jammed directly into giant phase runners.

Current hotspot metrics:

| File | Lines | Top-level functions |
| --- | ---: | ---: |
| `web/src/ruleset-ms/impl/engine.ts` | `5010` | `148` |
| `web/src/ruleset-lynx/impl/engine.ts` | `4036` | `141` |
| `web/src/ruleset-ms/impl/catalog.ts` | `880` | `54` |
| `web/src/ruleset-lynx/impl/catalog.ts` | `957` | `56` |

Current engine test coverage is strong, though the test files themselves are now large:

| File | Lines | Test cases |
| --- | ---: | ---: |
| `web/src/ruleset-ms/impl/engine.test.ts` | `6204` | `180` |
| `web/src/ruleset-lynx/impl/engine.test.ts` | `3358` | `132` |

## What Is Already Better

These seams are now real and should be preserved:

- shared turn phase recording in `game-core`
- shared movement outcome vocabulary
- shared portable-item store mechanics
- actor-local inventory helpers
- actor capability vocabulary
- extracted chip-input modules
- extracted vertical movement modules
- extracted MS non-chip floor queue

That means the next cleanup phase should not be a broad rewrite. It should be a narrow attack on the remaining hotspots that still violate Tier 1 and Tier 2 clean-code priorities.

## Assessment Against Tier 1 Priorities

### 1. Small, single-purpose functions and classes

Status: mixed

What is good:

- phase runners are smaller and more readable than before
- `chipInput.ts`, `verticalMovement.ts`, and portable-item modules show the right shape

What is still weak:

- `chooseCreatureDirection` in MS is still `143` lines
- `runFloorMovement` in MS is still `90` lines and handles air, elevator, ice, slide, teleport, failure, and sound effects
- `activateCloner` in MS is still `87` lines and manually assembles ad hoc creature state
- `runLynxChipMovementPhase` is still `168` lines and mixes input resolution, push probing, primed drop settlement, hidden-wall reveal, and move start
- `resolveLynxActorTeleport` is still `72` lines of loop-heavy mutation logic

Conclusion:

- top-level turn flow is acceptable
- second-level movement helpers are the real remaining complexity wall

### 2. Explicit interfaces and narrow seams

Status: mixed to good

What is good:

- `actorCapabilities.ts` exists
- `actorLocalInventory.ts` exists
- `portableItems.ts` exists
- ruleset catalogs own more policy than before

What is still weak:

- the capability surface is still too coarse for future actors like bowling balls, ghosts, or fake players
- teleports, cloners, traps, blocked-move outcomes, and some arrival behavior are still open-coded in engine helpers
- actor-owned collection and global progress are not yet cleanly separated for non-Chip actors

Conclusion:

- the right seam shape exists
- it is not yet deep enough for the next wave of stateful actors

### 3. One level of abstraction per function

Status: mixed

What is good:

- both engines now have clearer high-level tick runners

What is still weak:

- several helpers still mix probing, mutation, sound effects, debug-side behavior, and inventory changes in one place
- chip movement helpers often shift between “classify the tile” and “rewrite the board” inside the same function

Conclusion:

- we no longer have a giant top-level blob
- we still have large mid-level helpers that violate step-down flow

### 4. Step-down flow in control logic

Status: improved but incomplete

What is good:

- MS and Lynx phase runners are readable
- input selection was split into dedicated modules

What is still weak:

- the next function down from the phase runner is often still a kitchen-sink helper
- movement and arrival logic frequently jumps between concerns

Conclusion:

- the next cleanup should target the function layer directly below the tick runner

### 5. Fewer nested conditionals

Status: still weak in key hotspots

Where nesting still dominates:

- MS creature AI selection
- MS floor movement
- MS cloner activation
- Lynx chip movement start
- Lynx teleport resolution
- Lynx chip enter / push / reveal logic

Conclusion:

- the problem is not everywhere
- it is concentrated in a handful of engine hotspots that should become the next extraction targets

### 6. Fewer long argument lists

Status: improved

What is good:

- context objects exist in both engines
- several helpers now accept a runtime context instead of raw state packs

What is still weak:

- broad runtime structs still expose too much mutable state at once
- temporary inline objects are still created in some hotspots instead of using stable helper seams

Conclusion:

- the argument-list problem is no longer the first-order issue
- state-width and context-width are the next issue

### 7. Clear ownership of state

Status: mixed

What is good:

- portable items now have a real store
- actor-local inventory exists as a separate seam

What is still weak:

- movement helpers still directly juggle board state, inventory, sound effects, and runtime actor state
- `chipsNeeded` remains correctly global, but actor-owned collection logic is still not generalized beyond Chip-shaped helpers
- future “portable item that becomes an active actor” behavior does not yet have a clean lifecycle seam

Conclusion:

- ownership improved for current sandbag behavior
- ownership is not yet ready for bowling ball or fake-player-style features

### 8. Deterministic validation commands and characterization tests

Status: strong

What is good:

- engine tests are extensive
- characterization exists for subtle behavior
- recent cleanup work has been guarded by tests

What is still weak:

- test files are becoming large enough that readability and local reuse are now a secondary cleanup target

Conclusion:

- this is a strength
- it should be preserved while improving test ergonomics later

## Assessment Against Tier 2 Priorities

### Loose coupling and high cohesion

Status: mixed

Good examples:

- `chipInput.ts`
- `verticalMovement.ts`
- `portableItems.ts`

Remaining cohesion problems:

- engine helpers still combine traversal, arrival, hazard, sound, and board mutation
- teleports, traps, and cloners are still engine-owned subsystems instead of dedicated modules

### SOLID, used pragmatically

Status: mixed

What is working:

- dependency inversion is improving through shared vocabulary and ruleset policy
- interface segregation is improving around inventory and portable items

What is missing:

- capability interfaces need to become more expressive before they are truly open for extension
- some new behaviors would still require raw branching inside engine hot paths

### Encapsulate boundary conditions

Status: mixed to good

What is already good:

- vertical support resolution is much better isolated
- portable-item replacement/drop behavior is localized

What still leaks:

- teleport exit search
- hidden wall reveal behavior
- cloner/trap release side effects
- some push and blocked-move edge cases

### DRY without fake abstraction

Status: good direction, incomplete execution

Good:

- shared vocabulary and shared store mechanics were the right extractions

Still needed:

- more shared result types around teleport, trap, cloner, and move probing

Avoid:

- a single shared MS/Lynx engine
- erasing ruleset timing differences for the sake of reuse

### Feature-oriented structure

Status: improved

What is good:

- several subsystems already have feature modules

What is still weak:

- teleports
- trap and cloner behavior
- movement-start probing
- actor controller logic

### Naming and intent

Status: mostly good

The biggest naming problem is no longer naming itself. It is when a function name sounds focused but the body still does too much.

### Fail fast and explicit results

Status: improving

What is good:

- movement outcomes now have shared vocabulary

What is still weak:

- some engine helpers still communicate primarily through mutation and booleans instead of structured outcomes

## Concrete Findings By Area

### MS Engine

Good:

- tick phases are easier to follow
- floor queue work was worth extracting
- portable-item and vertical seams are usable
- chip arrival now has a dedicated helper seam

Problems that still matter:

- `chooseCreatureDirection` is still a dense creature-AI switch and should move behind a dedicated controller helper
- `runFloorMovement` still mixes all chip forced/vertical movement behavior
- `activateCloner` still hand-builds clone state in engine code
- chip movement start is still partially open-coded in engine helpers

### Lynx Engine

Good:

- tick runner is much clearer than before
- chip input resolution was a good extraction
- shared phase recording removed a bad duplication seam
- chip target-cell probing now has a dedicated helper seam

Problems that still matter:

- `runLynxChipMovementPhase` is still the biggest local complexity sink
- `resolveLynxActorTeleport` and `resolveLynxChipTeleport` should move into a dedicated teleport module
- cloner and trap activation should leave the engine hot path

### Catalogs

Good:

- policy concentration is happening in the right place

Problems that still matter:

- the catalog surface is still not rich enough for stateful actor extensions
- some behavior that belongs in typed policy is still implemented as engine branching

Important note:

- large catalogs are acceptable if they remain the home for policy
- do not churn them into data tables just for style

### Shared Game-Core Seams

Good:

- `actorCapabilities.ts`, `actorLocalInventory.ts`, `portableItems.ts`, `movementOutcomes.ts`, and `turnPhases.ts` are the right kind of shared code

Problems that still matter:

- actor capabilities need deeper hooks
- portable items still need an activation / attachment lifecycle for future portable actors
- item collection and global progress need a clearer actor-facing seam

### Tests

Good:

- strong characterization safety net

Problems that still matter:

- test ergonomics are now the issue, not missing coverage
- helper builders and assertion DSLs would make future refactors easier to land

## Principles For The Next Cleanup Wave

- Do not build a shared super-engine.
- Keep shared code focused on vocabulary, storage, and helper shape.
- Keep ruleset timing, occupancy, and ordering local to each engine.
- Attack the worst hotspots first, not the whole codebase.
- Extract seams before adding new elements.
- Prefer “probe then apply” helpers over boolean-return mutation blobs.
- Preserve characterization coverage on every structural change.

## Recommended Roadmap

### Progress

- [x] EC10: Movement Probe And Arrival Split
- [ ] EC11: Teleport, Trap, And Cloner Modules
- [ ] EC12: Actor Controller Seams
- [ ] EC13: Generalize Actor-Owned Collection And Global Progress
- [ ] EC14: Portable Item Activation Lifecycle
- [ ] EC15: Runtime State Decomposition
- [ ] EC16: Test DSL And Builder Cleanup

### [x] EC10: Movement Probe And Arrival Split

Done:

- MS chip entered-tile handling now lives behind a dedicated chip-arrival helper with focused unit coverage.
- Lynx chip target-cell probing now lives behind a dedicated helper with focused unit coverage.
- Lynx push preview side effects were moved out of the generic probe and into the call sites that actually need them.

Goal:

- make movement start and arrival logic read as “probe, then apply”

Targets:

- MS chip move probe and arrival handling
- Lynx chip enter / push / reveal probing
- structured results instead of mixed booleans plus mutation

Expected outcome:

- less nesting
- better step-down flow
- cleaner blocked-move and arrival extension points

### [ ] EC11: Teleport, Trap, And Cloner Modules

Goal:

- move teleport search and trap/cloner activation out of engine hot paths

Targets:

- MS `teleportDestination`, trap release, and cloner activation helpers
- Lynx `resolveLynxChipTeleport`, `resolveLynxActorTeleport`, `activateLynxCloner`, and `springLynxTrap`

Expected outcome:

- boundary conditions become local
- ruleset-specific differences stay isolated instead of scattered

### [ ] EC12: Actor Controller Seams

Goal:

- separate movement-controller logic from engine mutation logic

Targets:

- MS creature direction choice
- Lynx actor intent/controller behavior

Expected outcome:

- cleaner AI/control extension points
- direct preparation for fake players and more specialized actors

### [ ] EC13: Generalize Actor-Owned Collection And Global Progress

Goal:

- stop hard-coding Chip-shaped collection helpers as the only path

Targets:

- actor inventory owner lookup by runtime actor
- actor-facing item collection
- actor-facing chip collection that updates global progress without treating progress as local inventory

Expected outcome:

- clean separation of:
  - actor-local inventory
  - portable-item state
  - global progress

### [ ] EC14: Portable Item Activation Lifecycle

Goal:

- support portable entities that can also become active runtime actors

Targets:

- define a stable lifecycle from:
  - map portable item
  - carried portable item
  - primed drop
  - activated actor-attached state
  - detached or destroyed state

Expected outcome:

- bowling ball becomes feasible without spreading conditional logic everywhere
- future hooks or similar portable actors get the same seam

### [ ] EC15: Runtime State Decomposition

Goal:

- shrink engine-local “god structs” without losing ruleset locality

Targets:

- split runtime overlays
- split replay/input latch state
- split portable-item store access
- split actor-runtime bookkeeping from whole-engine mutable state

Expected outcome:

- smaller helper surfaces
- better ownership clarity
- easier testing of subsystems in isolation

### [ ] EC16: Test DSL And Builder Cleanup

Goal:

- keep the characterization safety net, but reduce test maintenance friction

Targets:

- common engine test builders
- reusable assertions for layers, inventory, movement, and overlays

Expected outcome:

- future cleanup PRs stay small and reviewable
- test intent becomes easier to scan

## Feature Gating

Do not resume bowling ball, ghost, or fake-player feature work until at least:

- EC10 is complete
- EC11 is complete
- EC13 is complete
- EC14 is complete

That is the minimum seam set needed to avoid repeating the same conditional-sprawl failure mode.

## What We Should Not Spend Time On Right Now

- rewriting the engines into one common base class
- splitting catalogs purely for aesthetic reasons
- mass renaming without seam improvement
- package-principle cleanup detached from actual hot paths
- replacing every switch with data tables when the switch already lives in a policy module

## Summary

The current architecture is no longer “bad everywhere.” That is the important finding.

The remaining cleanup work is concentrated in a specific layer:

- movement start
- arrival resolution
- teleports
- cloners and traps
- actor-owned collection and activation lifecycle

That is the correct place to keep cleaning. If we clean those seams next, future stateful actors can extend policy and helper modules instead of forcing more branching into the engines.

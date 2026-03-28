# Engine Cleanup Plan

## Motivation

We should not continue feature work like bowling balls, ghosts, or fake players on top of the current engine shape.

The engines are still correct enough to ship behavior, but they are carrying too much complexity in the hot paths:

- `web/src/ruleset-ms/impl/engine.ts` is `5696` lines with `147` top-level functions, `502` `if (...)` lines, and `285` direct `MS_TILE.*` references.
- `web/src/ruleset-lynx/impl/engine.ts` is `4788` lines with `140` top-level functions, `348` `if (...)` lines, and `168` direct `MS_TILE.*` references.
- The largest functions are orchestration-heavy and do too much:
  - MS: `advanceMsTick` is about `732` lines.
  - MS: `runCreatureFloorMovements` is about `607` lines.
  - Lynx: `advanceLynxInteractiveTick` is about `543` lines.
  - Lynx: `runLynxReplayTraceDebugInternal` is about `476` lines and duplicates much of the interactive tick logic.

That creates four concrete problems:

- Deep nesting and long argument lists make local reasoning hard.
- Similar mechanics appear in both engines, but are re-expressed from scratch.
- New element work tends to push behavior into giant engine functions instead of policy seams.
- Debug, replay, and board mutation concerns are mixed into gameplay logic.

The cleanup goal is not a shared super-engine. The goal is:

- minimize nested conditionals
- improve step-down readability
- move stable concepts behind small interfaces
- keep real MS vs Lynx differences in ruleset-specific code
- make new elements extend policy and helpers instead of editing every hot path

## What We Already Have

There are already good seams in the codebase. We should extend them instead of inventing a second architecture.

- `web/src/game-core/api/actorCapabilities.ts`
- `web/src/game-core/impl/actorLocalInventory.ts`
- `web/src/game-core/api/turnPhases.ts`
- `web/src/game-core/impl/board.ts`
- `web/src/game-core/impl/grid.ts`
- ruleset catalogs:
  - `web/src/ruleset-ms/impl/catalog.ts`
  - `web/src/ruleset-lynx/impl/catalog.ts`

Those are the right foundation:

- shared vocabulary in `game-core`
- per-ruleset policy in each catalog
- per-ruleset execution in each engine

## Findings

### Common Concerns That Exist In Both Engines

These concerns show up in both MS and Lynx and should share vocabulary, helper shape, or small reusable infrastructure:

- runtime layer access and `z`-aware board lookup
- portable special-item state
- actor-local inventory ownership and item collection/use
- support resolution for air/elevator
- teleport destination search
- movement start / move completion / arrival outcome handling
- collision resolution
- button / trap / cloner trigger dispatch
- replay input latching and last-move bookkeeping
- phase recording for debug traces

### Common Shape, Different Semantics

These should not become one shared implementation, but they should use the same interface vocabulary:

- turn sequencing
  - MS is tick-phase and floor-queue driven.
  - Lynx is intent/movement/post-resolution driven.
- movement timing
  - MS uses floor queues, slip order, and immediate settle behavior.
  - Lynx uses movement counters and move completion.
- occupancy model
  - MS still leans on layered top/bottom tile inspection.
  - Lynx leans more on runtime actors plus claimed cell flags.
- replay/debug
  - MS records phases inside the main tick path.
  - Lynx has a largely duplicated debug tick path.

### Do Not Abstract These Away

- exact phase ordering differences between MS and Lynx
- exact trap/cloner timing differences
- exact arrival timing and animation differences
- exact support and teleport edge cases when the rulesets disagree

The right reuse level is shared helper infrastructure plus per-ruleset policy and adapters, not a fake common engine base class.

## Recommended Architecture Direction

### 1. Use Context Objects, Not Long Argument Lists

Introduce small engine-local context objects and pass those instead of raw argument packs.

Recommended shapes:

- `MsTickContext`
- `MsPhaseContext`
- `MsLayerAccess`
- `LynxTickContext`
- `LynxPhaseContext`
- `LynxLayerAccess`

These should own:

- current state references
- layer/cell access
- inventory owner access
- runtime mutation helpers
- recorder/debug hooks

This directly addresses:

- step-down readability
- argument explosion
- dependency inversion

### 2. Share Vocabulary And Result Types, Not Engine Classes

Recommended shared interfaces in `game-core`:

```ts
interface PortableItemStore<TItem> {
  collectFromLayers(): TItem[];
  carriedTool(): TItem | undefined;
  primedTool(): TItem | undefined;
  mapToolAt(tileId: number, pos: number, z: number): TItem | undefined;
  projectInventory(): void;
}

interface PhaseRecorder<TSnapshot> {
  record(phase: TurnDebugPhaseName, snapshot: TSnapshot): void;
}

interface MovementProbeResult {
  kind: "blocked" | "move" | "collision";
}

interface ArrivalResolution {
  soundEffects: number;
  completed?: boolean;
  died?: boolean;
  enteredTeleport?: boolean;
}
```

These should stay small. They are for composition, not inheritance.

### 3. Keep Ruleset Policy In Catalogs

When behavior is reusable, the engine should ask a policy question instead of branching on raw tile ids.

Good candidates to expand:

- actor blocked-move behavior
- actor support behavior
- actor collision behavior
- actor arrival behavior
- portable-item carry/drop behavior
- thief interaction behavior
- clone behavior

Broad tags are still only for discovery. Final gameplay decisions should come from typed policy.

### 4. Prefer Two-Step Helpers Over Nested Branching

Current pattern in many places:

- inspect cell
- mutate cell
- inspect floor
- mutate inventory
- inspect teleport
- mutate status

Preferred pattern:

1. probe or classify
2. execute one outcome

Examples:

- `probeMsChipMove(...) -> MovementProbeResult`
- `resolveMsChipArrival(...) -> ArrivalResolution`
- `classifyMsSupportBelow(...) -> SupportResolution`
- `applyLynxChipMoveOutcome(...)`

This is the main way to shrink nested conditionals.

## Shared Extraction Opportunities

These are the best shared extractions across both engines.

### Shared Helper 1: Layer Access

Extract a small `layerAccess` helper module in `game-core` that handles:

- `cellsForZ`
- `lowerCells`
- `upperCells`
- `cellZ`
- `forEachLayer`

Keep it read-oriented. Do not put ruleset mutation policy here.

### Shared Helper 2: Portable Item Store Infrastructure

Portable-item logic is duplicated in both engines already:

- collect from layers
- carried item lookup
- primed item lookup
- map lookup by tile/pos/z
- inventory projection
- replacement pickup bookkeeping

Shared infrastructure should provide:

- entity storage helpers
- projections
- serial generation
- lookup helpers

Ruleset-specific behavior should stay outside:

- MS pending-primed replacement behavior
- Lynx immediate priming behavior
- sandbag water-settle behavior

### Shared Helper 3: Support Classification Vocabulary

The support-below logic in both engines is structurally very similar:

- inspect lower layer
- actors support or not
- cloner/elevator support
- wall/door/socket support
- fake blue wall reveals to floor

We should share:

- result vocabulary
- classification helper shape
- door/socket/wall reveal outcome types

We should keep:

- exact board mutation semantics per ruleset
- chip-vs-non-chip occupant interpretation

### Shared Helper 4: Phase Recording

MS already records debug phases from the main tick.

Lynx should move to the same pattern:

- one authoritative tick path
- optional recorder hook
- debug trace built from recorder snapshots

This is one of the highest-value cleanups because it removes a huge duplicate path.

### Shared Helper 5: Movement/Arrival Result Types

Both engines would benefit from shared result shapes:

- `MovementProbeResult`
- `ArrivalResolution`
- `CollisionResolution`
- `VerticalMoveResolution`

That will reduce nested conditionals and keep step-down flow readable without forcing identical implementation.

## MS-Specific Extraction Opportunities

These should move out of `web/src/ruleset-ms/impl/engine.ts`.

### MS Helper 1: Portable Items

Extract to something like:

- `web/src/ruleset-ms/impl/portableItems.ts`

Move:

- collect/project/reconcile helpers
- prime/settle/replacement logic
- Chip special-item wall behavior

### MS Helper 2: Support And Vertical Movement

Extract to something like:

- `web/src/ruleset-ms/impl/support.ts`
- `web/src/ruleset-ms/impl/verticalMovement.ts`

Move:

- `resolveMsChipSupportBelow`
- `resolveMsNonChipSupportBelow`
- chip/creature/block air sync
- chip/creature/block elevator sync

### MS Helper 3: Chip Movement

Extract to something like:

- `web/src/ruleset-ms/impl/chipMovement.ts`

Move:

- `canMoveChip`
- `applyMsChipEntryEffects`
- `moveChipOnce`
- `moveChipDownOneLayer`
- `moveChipUpOneLayer`
- floor-movement refresh helpers
- manual movement selection helpers

### MS Helper 4: Creature And Block Motion

Extract to something like:

- `web/src/ruleset-ms/impl/creatureMovement.ts`
- `web/src/ruleset-ms/impl/blockMovement.ts`
- `web/src/ruleset-ms/impl/floorQueue.ts`

Move:

- `canMoveCreature*`
- `moveCreature*`
- `chooseCreatureDirection`
- `moveBlock`
- `moveBlockUpOneLayer`
- slip queue logic from `runCreatureFloorMovements`

This is likely the biggest nested-conditional reduction inside MS.

### MS Helper 5: Replay And Debug Bookkeeping

Extract to something like:

- `web/src/ruleset-ms/impl/replayBookkeeping.ts`

Move:

- replay last-move resolution
- recorded replay move resolution
- input latching helpers

`advanceMsTick` should read like a coordinator, not a replay decoder plus timer plus debug sink plus gameplay engine.

## Lynx-Specific Extraction Opportunities

These should move out of `web/src/ruleset-lynx/impl/engine.ts`.

### Lynx Helper 1: Eliminate Debug Tick Duplication

This is the highest-priority Lynx cleanup.

Today:

- `advanceLynxInteractiveTick` contains the real turn logic.
- `runLynxReplayTraceDebugInternal` duplicates most of it.

Target:

- one real tick implementation
- recorder hooks for debug phases
- trace driver wraps the normal tick

### Lynx Helper 2: Portable Items

Extract to:

- `web/src/ruleset-lynx/impl/portableItems.ts`

Move:

- portable item collection
- carry/prime/project helpers
- replacement handling
- sandbag settle behavior

### Lynx Helper 3: Chip Move Selection

Extract to:

- `web/src/ruleset-lynx/impl/chipMoveSelection.ts`

Move:

- pending push preview
- queued input interplay
- forced move selection
- held-trap suppression rules

This part currently drives a lot of argument count and branching.

### Lynx Helper 4: Chip Lifecycle

Extract to:

- `web/src/ruleset-lynx/impl/chipMovement.ts`
- `web/src/ruleset-lynx/impl/chipPostMove.ts`

Move:

- `resolveLynxChipArrival`
- `resolveCompletedLynxChipMove`
- `resolveLynxPostChipMovement`
- `resolveLynxChipCollision`
- `advanceLynxChipTrapRelease`

The goal is an explicit chip movement lifecycle:

1. choose
2. start
3. advance
4. complete
5. resolve post-move

### Lynx Helper 5: Creature Movement And Teleport

Extract to:

- `web/src/ruleset-lynx/impl/creatureMovement.ts`
- `web/src/ruleset-lynx/impl/teleport.ts`
- `web/src/ruleset-lynx/impl/support.ts`

Move:

- `chooseLynxCreatureDirection`
- `chooseLynxCreatureMoveForTick`
- `startLynxCreatureMovement`
- `finishLynxActorMovement`
- `advanceLynxCreature`
- teleport destination / resolution
- support / air / elevator start helpers

### Lynx Helper 6: Traps, Buttons, And Endgame

Extract to:

- `web/src/ruleset-lynx/impl/trapsAndButtons.ts`
- `web/src/ruleset-lynx/impl/endgame.ts`

Move:

- held brown button handling
- sandbag-held brown button handling
- trap springing
- endgame state start/finalize helpers

## Extensibility Strategy

### What To Generalize

- helper vocabulary
- context objects
- result types
- portable-item store infrastructure
- phase recording
- inventory owner handling
- ruleset policy lookup interfaces

### What Not To Generalize

- turn order
- movement cadence
- occupancy timing
- teleport claim rules
- trap/cloner quirks
- animation timing

### How This Helps New Elements

This cleanup should make new elements fit into existing seams:

- `sandbag`: portable-item policy only
- `bowling ball`: portable-item policy + actor movement/collision policy
- `ghost`: actor policy only
- `fake player`: actor policy + controller policy + global progress hooks

The engines should ask questions like:

- what kind of controller is this actor?
- what inventory owner does this entity expose?
- how does this actor probe movement?
- what happens on blocked movement?
- what happens on arrival?
- what supports this entity from below?

They should not ask:

- is this tile id the bowling ball?
- is this tile id a ghost?
- do I need another branch in `moveCreatureOnce`?

## SOLID Mapping

### Single Responsibility

Split orchestration, movement, support, portable items, replay/debug, and board mutation helpers into separate modules.

### Open/Closed

Add new behavior by extending typed policy and plugging new helpers into a seam, not by editing giant switch ladders.

### Liskov

Do not fake one engine as a subtype of the other. Reuse shared abstractions only where behavior shape truly matches.

### Interface Segregation

Prefer small interfaces:

- `PhaseRecorder`
- `PortableItemStore`
- `MovementProbe`
- `SupportResolver`
- `InventoryOwnerResolver`

### Dependency Inversion

Hot-path logic should depend on policy and helper interfaces, not raw tile checks and ad hoc inventory structures.

## Non-Goals

- no shared base engine class
- no inheritance-heavy architecture
- no behavior-changing cleanup unless covered by characterization first
- no “generic movement engine” that erases MS vs Lynx timing

## Proposed EC Plan

### EC1: Characterization Expansion

- [x] Add characterization tests around MS and Lynx for:
- [x] portable item carry / replacement / settle
- [x] support release after wall/door/socket changes
- [x] air and elevator transitions
- [x] teleport exit edge cases
- [x] trap/cloner release timing
- [x] replay last-move and debug-phase expectations
- [x] Add one lightweight metrics snapshot to the doc or tests so future cleanup can be measured.

### EC2: Context Objects And Helper Boundaries

- [x] Introduce `MsTickContext` and `LynxTickContext`.
- [x] Replace the worst long-argument helper calls with context access.
- [x] No behavior changes.

### EC3: Shared Phase Recorder

- [x] Introduce a shared recorder interface in `game-core`.
- [x] Convert Lynx debug traces to use the normal tick path plus recorder hooks.
- [x] Keep MS on the same recorder model.
- [x] Delete duplicated debug tick logic from Lynx.

### EC4: Portable Item Subsystem Extraction

- [x] Extract portable-item store infrastructure into `game-core`.
- [x] Move MS portable-item logic into `ruleset-ms/impl/portableItems.ts`.
- [x] Move Lynx portable-item logic into `ruleset-lynx/impl/portableItems.ts`.
- [x] Keep ruleset-specific priming/settle semantics separate.

### EC5: Support And Vertical Movement Extraction

- [x] Introduce shared support result vocabulary.
- [x] Extract MS support/air/elevator helpers into dedicated files.
- [x] Extract Lynx support/air/elevator helpers into dedicated files.
- [x] Keep ruleset-specific behavior in the ruleset modules.

### EC6: Movement Outcome Vocabulary

- [x] Introduce shared movement/arrival/collision result types.
- [x] Refactor MS chip/creature/block movement helpers to return structured outcomes.
- [x] Refactor Lynx chip/creature movement helpers to use the same vocabulary.

### EC7: MS Engine Step-Down Cleanup

- [x] Split `advanceMsTick` into a turn runner plus phase modules.
- [x] Split `runCreatureFloorMovements` into queue helper + movement processors.
- [x] Split chip movement and replay bookkeeping into dedicated modules.
- [x] Reduce direct tile branching in MS hot paths where a policy seam already exists.

### EC8: Lynx Engine Step-Down Cleanup

- [x] Split `advanceLynxInteractiveTick` into a turn runner plus phase modules.
- [x] Split chip move selection from chip movement execution.
- [x] Split trap/button/endgame helpers into dedicated modules.
- [x] Reduce long parameter lists via context objects.

### EC9: Policy Surface Expansion

- [ ] Extend actor and portable-item policy types for:
- [ ] blocked move behavior
- [ ] support behavior
- [ ] collision behavior
- [ ] arrival behavior
- [ ] thief behavior
- [ ] clone behavior
- [ ] Replace remaining hard-coded raw tile branches only where policy now clearly owns the behavior.

### EC10: Resume Element Work

- [ ] Re-evaluate bowling ball on top of the cleaned seams.
- [ ] Implement MS first.
- [ ] Add tests.
- [ ] Port to Lynx only after the MS seam proves clean.

## Default Recommendation

Do this in the listed order.

The best first cleanup is:

1. characterization
2. context objects
3. Lynx debug-path deduplication

That sequence reduces risk immediately and creates cleaner seams for the harder extractions.

If we try to jump straight to feature work again before EC3 to EC5, we will likely reintroduce exactly the problems we are trying to remove.

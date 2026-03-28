# Engine Extensibility Cleanup Plan

This plan is based on a fresh pass through the current MS and Lynx engines, their extracted helper seams, and the priorities in `CLEAN_CODE.md`.

The question this plan answers is:

- If we add new stateful mobs such as bowling balls or ghosts, can we do it without scattering tile checks and duplicating movement logic?
- If we add new portable items such as hooks, can they plug into the portable-item lifecycle instead of growing sandbag-specific branches?
- If we add new terrain or pickups, can we register behavior instead of editing giant engine and catalog files?
- Could any of that eventually become a real plugin story?

## Current Verdict

Short answer:

- The engine is much cleaner than it was.
- It has real seams now.
- It is not yet a true plugin architecture.

Today, the repo is in a good position for:

- ruleset-specific cleanup without rewriting the engines
- adding features that fit existing policy vocabulary
- reusing portable-item identity, actor-local inventory, and several movement helper seams

Today, the repo is not in a good position for:

- adding a new stateful actor kind without some new engine work
- adding a new portable-item behavior family without extending portable-item rulesets
- adding new terrain families entirely by registration
- loading third-party gameplay elements as external plugins

The honest assessment is:

- internal plugin-shaped extensibility is within reach
- external plugin loading is not
- bowling ball, ghost, fake player, and hook can be made cleanly
- they cannot yet be added as pure registrations without more engine cleanup

## Clean-Code Comparison

### Tier 1: What is already good

- [x] MS and Lynx have shared seam shapes without being forced into a fake common engine
- [x] major hot paths now read in phases instead of one giant monolith
- [x] long argument lists were reduced in many movement and tick helpers
- [x] actor-local inventory is separated from global progress such as `chipsNeeded`
- [x] portable items have stable identity and lifecycle instead of being only tile projections
- [x] teleport, trap/cloner, controller, vertical-movement, and arrival logic have extracted modules
- [x] characterization coverage around subtle engine behavior is strong

### Tier 1: What still blocks extensibility

- [ ] `engine.ts` is still very large in both rulesets
- [ ] actor behavior is still too coarse for new stateful actor families
- [ ] portable items are still fundamentally modeled as `tools` with sandbag-shaped assumptions
- [ ] tile behavior is still mostly encoded as large rule tables plus engine-side interpretation
- [ ] there is no explicit internal element registration layer
- [ ] there is no external plugin contract

### Tier 2: What still needs work

- [ ] OCP is only partially achieved: adding new element families still requires edits in multiple core files
- [ ] DIP is partial: catalogs provide policy data, but engines still know too much about the current policy vocabulary
- [ ] ISP is partial: capability enums are broad enough to be useful, but too narrow for future actor classes
- [ ] descriptive naming improved, but some runtime seams still expose mechanics instead of intent
- [ ] feature-oriented structure exists for many behaviors, but large catalogs still act as “big tables of truth”

## Current State Snapshot

Current core file sizes:

- `web/src/ruleset-ms/impl/engine.ts`: 4295 lines
- `web/src/ruleset-lynx/impl/engine.ts`: 3545 lines
- `web/src/ruleset-ms/impl/catalog.ts`: 879 lines
- `web/src/ruleset-lynx/impl/catalog.ts`: 956 lines
- `web/src/ruleset-ms/impl/portableItems.ts`: 303 lines
- `web/src/ruleset-lynx/impl/portableItems.ts`: 295 lines
- `web/src/game-core/api/actorCapabilities.ts`: 73 lines
- `web/src/game-core/impl/portableItems.ts`: 231 lines

This tells us something important:

- the engines are no longer the only problem
- the catalogs and capability vocabularies are now the main extensibility bottleneck

## Extensibility Assessment By Feature Type

### 1. Stateful mobs such as bowling ball, ghost, fake player

Current state:

- partially ready

What already helps:

- [x] actor-local inventory exists
- [x] global chip progress is separate from local inventory
- [x] blocked-move, trap, cloner, thief, support, and hazard hooks exist in policy form
- [x] movement and arrival helper seams exist in both rulesets

What still blocks clean extension:

- [ ] `ActorTraversalKind` only knows `chip`, `creature`, and `block`
- [ ] `ActorCollisionHook` is still too coarse
- [ ] `ActorBlockedMoveKind` is still too coarse
- [ ] actor runtime state is not yet generalized enough for per-family custom state
- [ ] movement start, arrival, collision, and forced-movement flows are still wired around current actor families

Conclusion:

- bowling ball or ghost can be added cleanly only after the actor strategy vocabulary is widened
- today they would still require engine edits, even if those edits could be localized

### 2. Portable items such as hooks, future special items, bowling ball in carried/still form

Current state:

- partially ready

What already helps:

- [x] portable items have stable identity
- [x] portable items support map, carried, primed, pending, and attached states
- [x] portable items survive projection and reuse

What still blocks clean extension:

- [ ] portable items are still hard-wired to inventory slot `"tools"`
- [ ] replacement and primed-drop behavior is still sandbag-shaped
- [ ] activation semantics are not yet modeled as portable-item policy
- [ ] support/drop consequences are not yet generalized enough for multiple portable-item families
- [ ] attached portable items do not yet drive their own actor lifecycle cleanly

Conclusion:

- a hook-like item is not plug-in ready yet
- the portable-item seam needs one more level of abstraction before it becomes a reusable feature family

### 3. Terrain and pickups

Current state:

- better than actors and portable items

What already helps:

- [x] catalogs encode movement masks, forced-floor kinds, chip-enter actions, buttons, hazards, and inventory slot mapping
- [x] both rulesets already route much tile behavior through catalog policy

What still blocks clean extension:

- [ ] tile actions are still interpreted through engine-owned enums and branches
- [ ] there is no first-class per-tile behavior registration object
- [ ] new tile families still require edits to large catalog tables and likely some engine interpretation code

Conclusion:

- simple new pickups that fit existing slot logic are relatively easy
- new terrain families with stateful or unusual movement/collision behavior are not plugin-ready

### 4. True plugins

Current state:

- not supported

Reasons:

- [ ] tile and actor ids are still compile-time enums
- [ ] ruleset catalogs are compile-time structures
- [ ] decode/load/render/projection paths are static
- [ ] there is no manifest-based extension registration
- [ ] there is no compatibility contract for undo, replay, debug projection, or rendering

Conclusion:

- we should not claim “plugin support” today
- the right near-term goal is internal plugin-shaped extensibility

## Design Goals For The Next Cleanup Wave

- Keep MS and Lynx separate where timing and ordering differ
- Move from coarse enums toward typed policy groups and strategy seams
- Make state ownership explicit for actor-local state, portable-item state, and global progress
- Add new element families by registration plus focused helper implementations, not by editing large engine switch trees
- Prove the seams with one new stateful actor family and one new portable-item family before attempting external plugins

## PR Roadmap

### EP1: Extensibility Characterization Net

Goal:

- capture the behavior we need for future element families before changing seam shape

Checklist:

- [x] add characterization harnesses for stateful actor archetypes: ballistic, phasing, input-driven, inventory-carrying
- [x] add characterization harnesses for portable-item archetypes: carried-only, primed-drop, attach-to-actor, reusable stateful item
- [x] add terrain-entry and collision matrix tests that can be reused by future elements
- [x] add undo, replay, and debug-projection characterization for stateful elements

Why this comes first:

- future seam work will otherwise guess behavior instead of locking it down

### EP2: Decompose Actor Capability Policy

Goal:

- replace the current coarse actor capability vocabulary with smaller, composable policy groups

Checklist:

- [x] split `ActorCapabilityPolicy` into grouped concerns such as control, traversal, collision, hazards, support, theft, trap/cloner, collection, and blocked-move
- [x] remove reliance on `traversalKind: chip | creature | block` as the final gameplay discriminator
- [x] add typed strategy identifiers or typed interfaces for movement-start and collision behavior
- [x] keep policy data per-ruleset in catalog modules

Extensibility win:

- bowling ball, ghost, and fake player stop looking like special cases of the current three movement families

### EP3: Introduce Supplemental Stateful-Actor Runtime

Goal:

- support actor families with persistent per-instance runtime state without overloading existing Chip/block/creature records

Checklist:

- [x] add a supplemental runtime state store keyed by actor serial
- [x] support custom mode/state payloads per actor family
- [x] route clone, destroy, and restore flows through this store
- [x] integrate with interactive projection, replay, and undo

Extensibility win:

- bowling ball mode, ghost state, fake-player control state, and future actor-local state get a real owner

### EP4: Generalize Portable Item Policy

Goal:

- move from “portable tools with sandbag semantics” to “portable item families with explicit behavior policy”

Checklist:

- [x] introduce portable-item policy objects for carry, replacement, prime, drop, attach, detach, and destroy semantics
- [x] support multiple portable-item families without hard-wiring everything to `"tools"`
- [x] migrate sandbag fully onto the new portable-item policy surface
- [x] preserve current identity, projection, and replacement behavior under test

Extensibility win:

- hooks and still-form bowling balls become policy-driven portable items instead of sandbag variants

### EP5: Actor Movement Strategy Layer

Goal:

- make movement and forced-movement logic extensible by strategy rather than by current actor category

Checklist:

- [x] define strategy seams for `canStartMove`, `startMove`, `finishMove`, `blockedMove`, and `forcedMove`
- [x] migrate current Chip, creature, and block behavior onto those seams
- [x] keep ruleset-specific timing and ordering in MS/Lynx modules
- [x] eliminate the remaining “actor family means hard-coded engine path” assumptions

Extensibility win:

- ghost-style phasing or bowling-ball-style ballistic motion gets a place to live without duplicating Chip or creature paths

### EP6: Collision, Arrival, and Hazard Pipeline

Goal:

- make unusual interactions first-class instead of encoded as engine exceptions

Checklist:

- [x] add typed outcomes for actor-vs-actor collision rules
- [x] add typed outcomes for tile-arrival rules
- [x] extend hazard handling beyond `ignore | deny | destroy | transform` where needed
- [x] make thief, trap, and cloner semantics pluggable at the actor-policy level

Extensibility win:

- bowling ball “destroy both”, ghost pass-through, hook attach/detach effects, and special collision cases stop needing bespoke engine branches

### EP7: Tile Effect Pipeline

Goal:

- move tile behavior from static enum interpretation toward executable tile policy seams

Checklist:

- [x] define ruleset-local tile effect seams covering blocked enter, support checks, activation, arrival, teleport, and trap/cloner resolution
- [x] migrate doors, sockets, buttons, teleports, traps, cloners, popup walls, and hidden/blue wall behavior onto those seams
- [x] keep ruleset-specific implementations separate
- [x] reduce large catalog-side enum interpretation in engine code

Extensibility win:

- new terrain and pickup families can be added through a predictable ruleset-local behavior surface instead of scattered engine branching

### EP8: Catalog Decomposition And Registration

Goal:

- stop treating each ruleset catalog as one giant file of static tables

Checklist:

- [x] split each ruleset catalog into tile and actor registration modules with concern-family policy sections for pickups, terrain, forced floors, buttons, portable items, and actor capabilities
- [x] compose each ruleset catalog from smaller registration modules
- [x] keep the final public catalog stable
- [x] add catalog tests per concern family rather than only giant catalog tests

Extensibility win:

- adding a new element becomes “register in the correct family” instead of editing several large constant blocks

### EP9: Rendering And Projection Registration

Goal:

- align engine extensibility with projection and rendering seams

Checklist:

- [x] register actor and portable-item visual state selection by policy instead of tile-id conditionals
- [x] support state-driven sprite selection for moving vs still actors/items through shared render descriptors
- [x] route overlays and animation selection through typed render metadata
- [x] keep renderer consumers synchronized through the shared `InteractiveGameFrame` render descriptor shape

Extensibility win:

- bowling ball, ghost, hook, and future stateful visuals stop requiring special renderer edits everywhere

### EP10: Decode And Load Registration

Goal:

- stop treating decode/load as a separate hard-coded layer that lags behind gameplay seams

Checklist:

- [x] introduce ruleset-local element registration for decode/load mapping
- [x] keep compile-time built-in ids for now, but route decode through registration
- [x] ensure imported sets and DAT parsing can construct registered extensions consistently
- [x] integrate level prep and engine initialization with the registration layer

Extensibility win:

- new built-in elements no longer require ad hoc decode wiring across multiple files

### EP11: Prove The Seams With Real Elements

Goal:

- validate that the cleanup produced real extensibility rather than nicer names around the same branching

Checklist:

- [ ] implement one stateful actor family using the new seams
- [ ] implement one portable-item family using the new seams
- [ ] forbid engine-hot-path branches for those elements outside the declared seam boundaries
- [ ] add replay, undo, debug, and renderer coverage for both

Suggested proof elements:

- bowling ball or ghost for actor proof
- hook or future special item for portable-item proof

Success condition:

- adding the proof elements does not require new large engine switch trees

### EP12: Optional External Plugin Contract

Goal:

- only after internal plugin-shaped extensibility works, evaluate whether real external plugins are worth supporting

Checklist:

- [ ] decide what extension points are safe to expose externally
- [ ] define manifest and registration contracts
- [ ] define compatibility rules for replay, undo, debug projection, save state, and rendering
- [ ] decide what remains compile-time only

Important note:

- this is optional
- do not start here
- the internal seam architecture must prove itself first

## Recommended Order

- [x] EP1
- [x] EP2
- [x] EP3
- [x] EP4
- [x] EP5
- [x] EP6
- [x] EP7
- [x] EP8
- [x] EP9
- [x] EP10
- [ ] EP11
- [ ] EP12 if and only if real external plugins are still a goal

## Non-Goals

- [ ] do not build a fake shared MS/Lynx super-engine
- [ ] do not erase real timing and ordering differences behind generic callbacks
- [ ] do not start with external plugin loading
- [ ] do not add new stateful elements before the next seam layer exists
- [ ] do not grow actor capability enums forever without decomposing them

## Final Answer To The Plugin Question

If you wanted to add bowling balls, ghosts, hooks, new terrain, or new pickups today:

- you could do it more cleanly than before
- you could reuse several existing seams
- you would still need core code edits
- you would still risk duplication for movement, collision, portable-item behavior, or terrain effects

If this roadmap is completed through EP11:

- new built-in element families should be addable through ruleset-local registration plus focused strategy code
- that is the right target for “plugin-shaped” extensibility inside the repo

If you want true external plugins:

- that is a separate architectural project after EP11
- it is not the current engine architecture

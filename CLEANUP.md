# Stateful Element Cleanup Plan

This plan is for one narrow goal:

- make a second bowling-ball attempt land as a clean extension
- keep the same path usable for future stateful mobs such as ghosts and fake players
- keep the same path usable for future portable-item families such as hooks and other special items

This is not a generic repo cleanup pass.
It is an engine and runtime cleanup pass aimed at making new gameplay elements feel registered, not hand-wired.

## Why The First Bowling-Ball Attempt Was Not Good Enough

The rollback confirmed a few things:

- the codebase is cleaner than it used to be
- it is still not ready for a truly clean stateful-element extension
- bowling ball is not “just one more actor”
- bowling ball is also not “just one more portable item”

It crosses too many concerns at once:

- DAT decode
- still-form portable item identity
- carried and primed portable-item behavior
- actor activation from a portable state
- actor-local keys/boots inventory
- blocked-move reversion back into a portable state
- actor-vs-actor collision
- actor-vs-portable collision
- floor hazards and thief behavior
- trap and cloner behavior
- air support and falling
- rendering and projection
- replay, undo, and debug projection

The fact that one feature touches all of those is not itself the problem.
The problem is that those concerns are still split across too many engine-owned branches.

## Current Honest Assessment

### What is already good

- [x] portable items have stable identity
- [x] actor-local inventory is separated from global progress
- [x] stateful actor runtime exists
- [x] movement strategies exist
- [x] actor interaction and tile-effect seams exist
- [x] MS and Lynx keep their own timing and ordering

### What is still not good enough

- [x] there is now a first-class element registration seam that ties decode, runtime, projection, and rendering together
- [x] portable items now have a full activation lifecycle contract
- [x] actor movement no longer assumes only the old built-in families
- [x] chip-vs-runtime-actor probing now uses the same interaction vocabulary as actor movement
- [x] occupancy now has a typed query layer instead of leaking through ad hoc claimed-cell and top-tile checks
- [ ] a new stateful family still requires edits in too many core files

## Goal State

After this cleanup wave, adding bowling ball should look like:

1. register a DAT decode mapping
2. register a portable-item family
3. register an actor family
4. implement that family’s portable activation lifecycle
5. implement that family’s movement, collision, and floor-impact policies
6. register render/projection metadata
7. add ruleset tests

The second attempt will still require code.
It should not require fresh branching in unrelated engine hot paths.

## Non-Goals

- do not build true external plugin loading in this wave
- do not create a fake shared MS/Lynx engine
- do not erase real ruleset differences
- do not chase “DRY” by merging behavior that is only superficially similar
- do not mix this cleanup with another unrelated feature

## Success Criteria

We are ready for bowling-ball attempt two only when all of the following are true:

- [x] a portable item can become a runtime actor through a typed lifecycle seam
- [x] a runtime actor can revert back to a portable item through a typed lifecycle seam
- [x] actor-vs-actor and actor-vs-portable collisions are handled through one typed interaction path
- [x] blocked-move behavior is configured per actor family, not open-coded in engines
- [x] floor-impact and arrival behavior are configured per actor family, not open-coded in engines
- [x] chip probing against moving actors uses the same interaction vocabulary as actor movement
- [ ] adding one new family does not require edits in both ruleset engines outside narrow registration and helper seams

## PR Roadmap

### SE1: Lock Down The Bowling-Ball Failure Surface

Goal:

- characterize the behaviors that made the first attempt spread

Checklist:

- [x] add a shared bowling-ball scenario matrix plus ruleset-local pending test backlog entries
- [x] add focused tests for still-to-moving activation from carried state
- [x] add focused tests for map-still-to-moving activation from forced floor
- [x] add focused tests for moving-to-still reversion with inventory preservation
- [x] add focused tests for actor-vs-portable destruction
- [x] add focused tests for “Chip chasing behind moving bowling ball acts as wall”
- [x] add focused tests for trap hold/release behavior
- [x] add focused tests for cloner hold/deep-clone behavior
- [x] add focused tests for air drop and fall-onto-player / fall-onto-actor behavior

Why first:

- we need the exact failure surface frozen before changing seams again

### SE2: Introduce Element Family Registration

Goal:

- add an internal registration layer that ties together the existing seams

Checklist:

- [x] define a ruleset-local `ElementFamilyRegistration` shape
- [x] split registration into actor families, portable-item families, terrain/pickup families, and decode/load registration
- [x] keep ids static, but stop scattering their meaning across unrelated modules
- [x] move existing hook and sandbag family wiring onto this registration surface first
- [x] expose narrow lookup helpers so engines ask for family behavior instead of inferring it from tile ids

Success condition:

- a new family can be registered in one obvious place per ruleset

### SE3: Portable Item Lifecycle Contract

Goal:

- make portable items first-class state machines instead of map/carried projections plus ad hoc engine code

Checklist:

- [x] define typed lifecycle operations:
- [x] `carry`
- [x] `primeDrop`
- [x] `settleDrop`
- [x] `activateToActor`
- [x] `attachToActor`
- [x] `detachToMap`
- [x] `destroy`
- [x] `clone`
- [x] move replacement behavior and drop semantics behind that contract
- [x] move support-loss drop behavior behind that contract
- [x] make “drop consequences” shared for portable-item families instead of sandbag-shaped
- [x] prove the seam by migrating sandbag and hook fully onto it

Success condition:

- still bowling ball can exist as “just another portable-item family with extra state”

### SE4: Stateful Actor Runtime Contract

Goal:

- stop treating runtime state as a generic side store plus ruleset-specific ad hoc assumptions

Checklist:

- [x] define family-owned runtime state adapters keyed by actor serial
- [x] define typed lifecycle hooks for:
- [x] `spawn`
- [x] `clone`
- [x] `restore`
- [x] `destroy`
- [x] `attach portable backing item`
- [x] `detach portable backing item`
- [x] make the portable backing item relationship explicit instead of implicit
- [x] expose runtime-state access through family helpers instead of direct store poking

Success condition:

- bowling ball runtime state is owned by the bowling-ball family, not by random engine helpers

### SE5: Unified Occupancy And Interaction Targeting

Goal:

- stop treating claimed cells, runtime actors, and portable items as separate collision worlds

Checklist:

- [x] define an occupancy query layer per ruleset
- [x] support typed targets:
- [x] empty
- [x] runtime actor
- [x] static block
- [x] portable item
- [x] chip
- [x] animation-reserved / blocked visual cell when relevant
- [x] make actor movement, chip probing, and trap/cloner checks all use that query layer
- [x] stop special-casing “tools on top tile” inside movement logic

Success condition:

- actor-vs-portable and chip-vs-moving-ball can be expressed through the same interaction targeting model

### SE6: Actor Interaction Pipeline

Goal:

- unify collision semantics across chip movement and non-chip movement

Checklist:

- [x] extend interaction vocabulary to cover:
- [x] deny move
- [x] destroy moving actor
- [x] destroy target
- [x] fail chip
- [x] preserve target on special cases
- [x] consume / transform target when needed
- [x] support actor-vs-portable-item interaction, not just actor-vs-actor
- [x] route chip entering a moving actor through the same interaction seam
- [x] support directional special cases such as “same-direction moving bowling ball acts as wall”

Success condition:

- collision rules are configured, not open-coded in both chip and creature paths

### SE7: Actor Movement Lifecycle Hooks

Goal:

- stop making movement strategy responsible for too many unrelated outcomes

Checklist:

- [x] split actor movement into explicit hooks:
- [x] `canStartMove`
- [x] `onBlockedStart`
- [x] `onEnteredCell`
- [x] `onCompletedStep`
- [x] `onFloorImpact`
- [x] `onHeldFloor`
- [x] keep strategy ids for high-level movement shape, but move family-specific consequences into these lifecycle hooks
- [x] migrate existing creature/block/ballistic families to the new shape without behavior change

Success condition:

- blocked reversion, trap hold, force-floor persistence, and floor destruction become normal family hooks

### SE8: Chip Probe And Player Interaction Cleanup

Goal:

- make Chip’s move legality and push probing compatible with new runtime actor families

Checklist:

- [x] stop treating non-block claimed cells as a generic special case
- [x] route chip move probing through occupancy + interaction hooks
- [x] make “can enter”, “can push”, and “will collide” explicit outcomes
- [x] support directional interaction overrides
- [x] keep replay and diagonal-input semantics unchanged under characterization

Success condition:

- moving bowling ball no longer needs bespoke player logic hidden in chip probing

### SE9: Floor Impact And Arrival Policy

Goal:

- separate “may enter tile” from “what happens after entering tile”

Checklist:

- [x] define shared floor-impact outcomes for current post-entry behavior
- [x] continue
- [x] destroy
- [x] transform floor
- [x] collect pickup
- [x] use inventory
- [x] lose inventory
- [x] hold direction
- [x] revert to portable
- [x] use this for thief, chips, keys, boots, doors, sockets, popup walls, buttons, traps, and exits
- [x] extend the same seam across hazards, fake/real blue walls, and teleports
- [x] keep global chip progress separate from actor-local inventory

Success condition:

- bowling ball’s chip/key/boot/thief/hazard rules become policy wiring, not engine branching

### SE10: Trap, Cloner, And Support Hooks

Goal:

- move the last stateful special-floor assumptions out of engine orchestration

Checklist:

- [x] add family hooks for trap hold and release
- [x] add family hooks for cloner entry, blocked cloner collision, and clone exit
- [x] add family hooks for support and support-loss outcomes
- [x] add family hooks for falling collision outcomes
- [x] make clone of a family-owned runtime state explicit and testable

Success condition:

- bowling ball trap/cloner/air behavior is configurable through the family seam

### SE11: Render And Projection Registration

Goal:

- stop deriving too much visual state from tile ids inside the renderer

Checklist:

- [x] register portable-item still visuals by family
- [x] register runtime actor visuals by family + mode
- [x] support still vs moving bowling ball through render metadata
- [x] ensure undo, replay, and debug projection preserve family state needed for rendering
- [x] keep renderer consumption declarative

Success condition:

- adding a new stateful family does not require new renderer-side tile inference

### SE12: Prove The Seams With Bowling Ball Attempt Two

Goal:

- only after SE1 through SE11 are in place, retry bowling ball

Implementation rule:

- do not expose `0x71` through live DAT decode until the element is complete enough to ship

Why:

- we do not want an intermediate PR that makes existing or future content parse a half-implemented bowling ball

Shared-vs-local split:

- shared when appropriate:
  - portable-item family state shape
  - stateful actor family state shape
  - portable-to-actor and actor-to-portable transition helpers
  - per-ball keys/boots inventory ownership
  - family render metadata and sprite ids
  - collision / floor-impact / special-floor policy data where MS and Lynx truly agree
- ruleset-local by default:
  - action ordering
  - exact throw timing
  - chip-vs-moving-ball interaction timing
  - trap release timing
  - cloner timing
  - teleport timing
  - air / elevator sequencing
  - replay and oracle characterization

Guardrails for every bowling-ball PR:

- if a PR adds a raw bowling-ball tile-id check in `engine.ts`, stop and re-evaluate
- if a PR passes raw inventory arrays through new helper chains, stop and re-evaluate
- if a PR needs both ruleset engines edited in parallel for the same semantic change, move that semantic into a seam first
- if a PR cannot be tested with focused ruleset-local gameplay coverage, it is too large

PR rollout:

#### PR12.1: Bowling Ball Family Scaffolding

Goal:

- add the family-owned state and registration points without enabling the element from DAT yet

Checklist:

- [x] add a `bowling-ball` portable-item family with stable identity and persistent local state
- [x] add a `bowling-ball` stateful actor family with explicit runtime mode
- [x] define the shared bowling-ball state shape:
  - `mode: still | moving`
  - current direction / last travel direction
  - keys
  - boots
- [x] register still and moving visuals through render registration only
- [x] keep the family unreferenced from DAT decode for now

Success condition:

- bowling ball exists as a family-owned concept in the seams without changing gameplay yet

#### PR12.2: Portable Lifecycle And Chip Inventory Semantics

Goal:

- implement still-form bowling ball as a portable item that Chip can carry, prime, and throw

Checklist:

- [x] still bowling ball can be picked up by Chip only
- [x] bowling ball occupies the special-item slot
- [x] replacing it with another special item primes a still drop exactly like sandbag
- [x] `Action1` attempts a forward throw through the portable activation seam
- [x] failed throw leaves the bowling ball in inventory
- [x] carried -> primed -> dropped still-form preserves the same per-instance state
- [x] no actor motion yet beyond activation itself

Success condition:

- portable bowling ball lifecycle is complete without yet relying on bespoke actor-motion behavior

#### PR12.3: Shared Actor-Family Behavior For Moving Bowling Balls

Goal:

- implement the shared semantics that do not depend on MS vs Lynx timing

Checklist:

- [x] bowling ball moving actor uses Chip-like terrain-entry policy through actor movement strategy / floor-impact seams
- [x] bowling ball owns keys/boots inventory through actor-local inventory ownership, not global inventory
- [x] bowling ball can collect chips, keys, and boots
- [x] chip collection updates global chip progress, not per-ball state
- [x] thief clears ball inventory through family policy
- [x] water / fire / bomb hazard behavior is expressed through family hazard policy
- [x] still-ball / moving-ball / special-item destroy-both collision semantics are expressed through the interaction seam
- [x] same-direction Chip-behind-moving-ball wall behavior is expressed through the Chip probe / interaction seam

Success condition:

- the core bowling-ball rules live in family policy and family-owned helpers, not engine branches

#### PR12.4: MS Ruleset Integration

Goal:

- wire bowling ball into MS ordering and runtime behavior

Checklist:

- [x] hook portable activation and throw timing into MS Chip flow
- [x] implement blocked-move reversion vs hold-direction exceptions on ice / force floors
- [x] implement MS trap, cloner, teleport, and air/elevator timing through the existing MS seams
- [x] implement MS actor collision and destruction timing
- [x] implement MS clone deep-copy of bowling-ball inventory/state
- [x] add focused MS engine tests for the full requirement matrix that applies to MS

Success condition:

- bowling ball works in MS without new ad hoc bowling-ball branches in MS hot paths

#### PR12.5: Lynx Ruleset Integration

Goal:

- wire bowling ball into Lynx ordering and runtime behavior

Checklist:

- [x] hook portable activation and throw timing into Lynx Chip flow
- [x] implement blocked-move reversion vs hold-direction exceptions on ice / force floors
- [x] implement Lynx trap, cloner, teleport, and air/elevator timing through the existing Lynx seams
- [x] implement Lynx actor collision and destruction timing
- [x] implement Lynx clone deep-copy of bowling-ball inventory/state
- [x] add focused Lynx engine tests for the full requirement matrix that applies to Lynx
- [ ] add oracle replay differential windows for any behavior that depends on native Lynx timing

Success condition:

- bowling ball works in Lynx without reintroducing pre-cleanup Chip-probe or teleport branching

#### PR12.6: Final Enablement And Full Validation

Goal:

- expose bowling ball to real content only after the behavior is complete

Checklist:

- [x] enable DAT decode `0x71 -> bowling ball`
- [x] enable final renderer / projection / artwork wiring
- [x] add undo, replay, and interactive projection coverage
- [x] run focused replay sweeps for both rulesets
- [x] run typecheck and targeted gameplay suites
- [x] confirm no temporary debug hooks or seam-bypass code remains

Exit condition:

- bowling ball lands without new scattered engine hot-path branches
- bowling ball is added through narrow registration plus family helpers rather than cross-cutting rewrites

## Recommended Order

1. SE1
2. SE2
3. SE3
4. SE5
5. SE6
6. SE7
7. SE8
8. SE9
9. SE10
10. SE4
11. SE11
12. SE12

Reasoning:

- SE4 is important, but not first. We already have a stateful runtime store.
- The bigger blocker is that movement and interaction still do not agree on what an element even is.
- Once occupancy, lifecycle, and interaction are coherent, runtime-state ownership becomes much easier to keep clean.

## What To Watch For

- if a PR adds more raw tile checks to `engine.ts`, stop and re-evaluate
- if a PR passes raw inventory arrays through more helpers, stop and re-evaluate
- if a PR requires touching both ruleset engines plus renderers plus projections for one small semantic change, the seam is still wrong
- if a PR “shares code” by erasing MS/Lynx ordering differences, back it out
- if a PR uses tags as the final gameplay rule when direction, timing, or inventory matter, it is too coarse

## Ready For Second Attempt?

Yes, for a second attempt.

What is still not proven is the exit condition for the attempt itself:

- [ ] bowling ball lands without new scattered engine hot-path branches
- [ ] bowling ball can be added through narrow registration and helper seams rather than cross-cutting rewrites

We are ready for a second bowling-ball implementation attempt only when:

- [x] SE1 through SE11 are complete, or
- [ ] we intentionally accept a narrower target and document exactly which future extensibility goals we are giving up

Bowling ball is now the proof step for the seam work above, not the trigger for more prerequisite cleanup.

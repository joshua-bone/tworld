# Stateful Elements PR Plan

This plan is for rolling out new stateful gameplay elements cleanly:

- portable special items such as `sandbag` and `bowling ball`
- stateful actors such as `ghost` and `fake player`

The goal is to avoid tile-id conditionals in engine hot paths and avoid passing raw inventory state through large argument lists.

## Design Targets

- [x] Characterize current special-item support and drop behavior before refactoring
- [ ] Keep portable-item behavior separate from actor behavior
- [ ] Make stable runtime entity identity the source of truth for portable items
- [ ] Make actor-local inventory and collection rules policy-driven
- [ ] Keep global level progress such as `chipsNeeded` separate from portable-item and actor-local inventory state
- [ ] Make controller, traversal, and collision behavior policy-driven
- [ ] Preserve real MS vs Lynx differences at the ruleset layer

## Core Architecture

### Portable Item Seam

Use this for things that can be:

- carried by Chip
- primed for drop
- placed on the map in a still state
- converted into or associated with a moving actor state later

Examples:

- `sandbag`
- `bowling ball`

This seam owns portable-item identity and drop/carry state only. It must not own global level progress such as `chipsNeeded`.

This seam should answer questions such as:

- [ ] Can Chip collect this item?
- [ ] What happens when Chip already carries another portable item?
- [ ] What does `Action1` do?
- [ ] How does it settle when dropped?
- [ ] Does it transform the floor on settle?
- [ ] Does it provide support while still or while primed?

### Actor Capability Seam

Use this for anything that acts as a runtime actor with local state.

Examples:

- `bowling ball` while moving
- `ghost`
- `fake player`

Actor-local inventory here means actor-owned keys/boots/tools-like state. It does not include global progress counters such as `chipsNeeded`.

This seam should answer questions such as:

- [ ] What controls the actor: AI, player input, forced-only, thrown/ballistic?
- [ ] What inventory does the actor own: none, keys+boots, Chip-like, or something else?
- [ ] What can the actor collect or consume?
- [ ] What movement profile does the actor use?
- [ ] What collision profile does the actor use?
- [ ] What happens on blocked movement?
- [ ] What happens on clone, thief, air, trap, and cloner interactions?

## PR Checklist

### PR1: Characterization + Small Seam Cleanup

- [x] Add characterization around special-item support and support release
- [x] Add missing MS coverage for a block supported over a sandbag in air
- [x] Add support-release coverage in Lynx using an existing support-removal mechanic
- [x] Replace direct `Sandbag` checks in non-Chip air support with a narrow catalog-driven `tools` seam
- [x] Keep behavior unchanged

### PR2: MS Portable Item Runtime Model

- [ ] Introduce a first-class runtime entity for portable items in MS
- [ ] Make that entity survive `carried -> primed -> settled on map`
- [ ] Migrate `sandbag` onto this runtime model first
- [ ] Keep current sandbag behavior unchanged
- [ ] Keep `inventory.tools` and `primedToolDrop` as compatibility projections only; do not let portable-item helpers depend on full engine inventory objects
- [ ] Restrict portable-item projection helpers to portable-item state only, not unrelated global fields such as `chipsNeeded`
- [ ] Remove any MS sandbag logic that depends on loose tile/inventory state where the runtime entity should own it
- [ ] Add characterization for identity-sensitive cases such as replacement, primed drop, teleport origin settle, and air support

### PR3: Lynx Portable Item Runtime Model

- [ ] Introduce the same portable-item runtime seam in Lynx
- [ ] Migrate `sandbag` onto that model
- [ ] Preserve Lynx timing/order quirks
- [ ] Keep the same narrow projection boundary in Lynx: portable-item helpers may project tool-slot/drop state, but not own global progress
- [ ] Add Lynx characterization for teleport settle, support, replacement, and primed drop cases

### PR4: Actor-Local Inventory Seam

- [ ] Introduce a typed actor-local inventory model
- [ ] Make inventory ownership actor-based instead of passing raw inventory arrays through helpers
- [ ] Support at least `no inventory`, `keys + boots`, and future expansion points without changing hot-path signatures
- [ ] Keep actor-local inventory limited to actor-owned resources; do not move `chipsNeeded` or other global progress counters into this seam
- [ ] Add tests covering actor-local key and boot use

### PR5: Controller and Actor Capability Policy

- [ ] Introduce typed ruleset policy for actor control mode
- [ ] Support at least `AI-controlled`, `player-input-controlled`, and `thrown / ballistic` actors
- [ ] Add typed ruleset policy for collection rules, traversal rules, collision rules, blocked-move outcome, and clone / thief / trap / air / cloner hooks
- [ ] Add typed hooks for actor-driven global progress effects such as chip collection, separate from actor-local inventory ownership
- [ ] Keep policy data ruleset-specific even when the seam shape is shared

### PR6: Bowling Ball in MS

- [ ] Decode and render the bowling ball
- [ ] Use the portable-item seam for still / carried / primed behavior
- [ ] Use the actor-capability seam for moving behavior
- [ ] Store bowling-ball local keys/boots inventory on the entity/actor state, not in ad hoc side maps
- [ ] Add focused MS tests for still vs moving state, `Action1` throw behavior, pickup-only-while-still, collision destruction, item and chip collection, blocked-movement exceptions, and thief / trap / cloner / air / elevator interactions

### PR7: Bowling Ball in Lynx

- [ ] Port bowling ball to Lynx on the same seam shapes
- [ ] Preserve Lynx-native timing and ordering behavior
- [ ] Add focused Lynx tests mirroring the MS interaction set where applicable

### PR8: Ghost

- [ ] Add ghost using the actor-capability seam only
- [ ] Give it ghost-specific traversal policy instead of special-casing tiles in engine loops
- [ ] Give it actor-local keys/boots inventory
- [ ] Ensure it does not collect chips
- [ ] Add tests for pass-through behavior, inventory use, and collision behavior

### PR9: Fake Player

- [ ] Add fake player using the actor-capability seam only
- [ ] Give it player-input control policy
- [ ] Give it Chip-like chip collection and key/boot use policy
- [ ] Keep fake-player-specific differences out of generic player code
- [ ] Add tests for shared-input movement, chip collection, inventory use, and collision/interaction order

## Guardrails

- [ ] Do not add new tile-id branches for these elements in engine hot paths when a policy seam can answer the question
- [ ] Do not pass actor inventory through broad helper argument lists
- [ ] Do not give portable-item helpers a full engine-inventory surface when they only need portable-item projection data
- [ ] Do not mix global level progress such as `chipsNeeded` into portable-item state or actor-local inventory
- [ ] Do not merge portable-item state and actor-capability state into one vague abstraction
- [ ] Stop after PR2 if the sandbag migration does not materially simplify the code

## Success Criteria

- [ ] Adding a new portable item does not require scattering tile checks through drop/support/pickup code
- [ ] Adding a new stateful actor does not require scattering tile checks through movement/collision code
- [ ] Inventory-bearing actors use a stable owner model
- [ ] MS and Lynx differences remain explicit and test-covered

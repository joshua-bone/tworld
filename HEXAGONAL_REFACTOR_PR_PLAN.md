# TypeScript Hexagonal Refactor PR Plan

## Goal

Refactor the TypeScript codebase into a stricter hexagonal architecture without replay, trace, or interactive-player regressions.

The end state should have:

- a small rules-agnostic simulation core
- explicit MS and Lynx ruleset modules
- clean application orchestration behind ports
- React, CLI, browser, filesystem, and oracle code only in adapters
- tile and actor behavior driven by ruleset catalogs, tags, and hooks instead of engine-wide `switch` statements on concrete tile ids

## Non-Negotiables

- No big-bang rewrite.
- No replay frontier regressions.
- No adapter logic inside the simulation core.
- No React, filesystem, subprocess, or browser APIs in `domain/`.
- No new gameplay behavior changes unless they are required to preserve parity.
- Every refactor slice must land behind the current parity gates before the next slice begins.

## Refactor Gates

Every PR in this plan must keep these green:

```bash
npm --workspace web run typecheck
npm --workspace web exec vite build
npm run verify:all-replays
```

When a PR only changes architecture scaffolding and not gameplay, a smaller bounded replay sample is acceptable during iteration, but the full replay verifier must be green before the PR is considered complete.

- [x] Do not rerun the full replay sweep while this PR plan is still in progress. Use focused subsets for minimal validation during execution, then reserve the full sweep for the end of the plan.

## Done When

- `domain/game/core` contains shared simulation primitives only.
- `domain/game/rules/ms` and `domain/game/rules/lynx` own ruleset-specific policy and data.
- the engines no longer make most gameplay decisions by directly branching on concrete tile ids
- new tiles can be added by extending ruleset catalogs and handlers instead of editing a monolithic engine loop
- trace projection, debug projection, sound projection, and interactive session shaping live outside the core simulation loop
- all legacy-passing replays still match

## PR 1: Boundary Guardrails And Core Ruleset Seams

- [x] Status: complete

Scope:

- [x] add this refactor plan
- [x] add enforceable architecture tests for the current pure zones
- [x] add the first domain-core ruleset extension seam as types only

Changes:

- [x] enforce that `domain/` non-test code stays free of adapter, React, and Node runtime imports
- [x] enforce that the current pure application surfaces stay free of adapter imports
- [x] add core ruleset metadata types for tile tags, actor tags, capabilities, and hooks

Exit criteria:

- [x] no runtime behavior changes
- [x] boundary tests pass
- [x] typecheck passes
- [x] build passes

## PR 2: Snapshot, Trace, And Debug Projection Extraction

- [x] Status: complete

Scope:

- [x] move snapshot shaping, trace shaping, debug shaping, map-hash projection, and sound-bitmask projection out of the engines

Changes:

- [x] extract shared `GameTrace` and `GameDebugTrace` builders so engines stop hand-assembling outer trace payloads
- [x] extract projectors that convert internal simulation state into `GameSnapshot`, `GameTrace`, and debug payloads
- [x] reduce engine responsibilities to state transition plus effect emission

Exit criteria:

- [x] no trace changes
- [x] replay verifier remains green

## PR 3: Interactive Session Shell Extraction

- [x] Status: complete

Scope:

- [x] stop exposing engine internals directly through interactive session tokens

Changes:

- [x] replace opaque adapter-owned session mutation with explicit session services and projectors
- [x] make interactive sessions consume projected frames instead of raw engine state

Exit criteria:

- [x] browser player behavior is unchanged
- [x] replay import/export stays unchanged

## PR 4: Board And Actor Kernel Extraction

- [ ] Status: in progress

Scope:

- [ ] create the reusable simulation kernel shared by both rulesets

Changes:

- [x] extract shared direction and board-position helpers into `domain/game/core`
- [x] extract shared board cell clone, presence, safe-read access, mutation, flag-predicate, and layer-stack helpers into `domain/game/core`
- [x] extract shared actor lookup and hidden-slot reuse helpers into `domain/game/core`
- [x] extract initial shared movement primitives into `domain/game/core`
- [x] extract initial shared actor storage helpers into `domain/game/core`
- [x] extract initial shared actor occupancy predicates into `domain/game/core`
- [x] extract initial shared board-flag plus actor-occupancy predicates into `domain/game/core`
- [x] extract initial shared timer primitives into `domain/game/core`
- [x] extract initial shared timer construction into `domain/game/core`
- [ ] extract board math, occupancy checks, movement primitives, actor storage, timer primitives, collision primitives, and effect queues into `domain/game/core`
- [ ] keep all ruleset-specific policy outside this kernel

Exit criteria:

- [ ] both rulesets still run through existing adapters
- [ ] no direct adapter imports anywhere in the kernel

## PR 5: MS Ruleset Catalog And Policy Routing

Scope:

- [ ] replace direct tile-id decisions in the MS engine with catalog-driven policy

Changes:

- [ ] add an MS tile catalog with tags, capabilities, and hooks
- [ ] route movement legality, floor interaction, collection, button handling, and death handling through policy helpers
- [ ] shrink the monolithic MS engine loop into a phase pipeline plus policy calls

Exit criteria:

- [ ] MS replay parity stays green
- [ ] adding a new MS tile no longer requires editing the generic movement kernel

## PR 6: Lynx Ruleset Catalog And Policy Routing

Scope:

- [ ] perform the same decoupling for the Lynx engine

Changes:

- [ ] add a Lynx tile catalog with tags, capabilities, and hooks
- [ ] route entry, leave, death, sound, trap, cloner, teleport, and animation policy through the catalog layer

Exit criteria:

- [ ] Lynx replay parity stays green
- [ ] legacy draw and sound parity surfaces still get the same projected state

## PR 7: Shared Turn Pipeline

Scope:

- [ ] standardize both engines around explicit phase orchestration

Changes:

- [ ] formalize named phases such as input resolution, forced movement, actor intents, movement validation, collision resolution, tile hooks, deferred wiring actions, endgame, and animation updates
- [ ] keep ruleset-specific phase handlers separate from the shared phase runner

Exit criteria:

- [ ] engine ordering stays parity-correct
- [ ] phase sequencing becomes testable in isolation

## PR 8: Level Preparation And Ruleset Assembly

Scope:

- [ ] separate raw DAT decoding from ruleset preparation

Changes:

- [ ] keep raw level parsing as data decoding
- [ ] add prepared-level assembly for MS and Lynx that normalizes tile layout, actor seeds, connections, and status flags before simulation starts

Exit criteria:

- [ ] ruleset preparation is explicit and testable
- [ ] engines receive prepared levels instead of raw parser output

## PR 9: Adapter Cleanup And Final Boundary Tightening

Scope:

- [ ] remove remaining architecture leaks after the engines are migrated

Changes:

- [ ] tighten boundary tests to cover more of `application/use-cases`
- [ ] remove old helper paths made obsolete by the refactor
- [ ] document the extension workflow for new tiles and actors

Exit criteria:

- [ ] all boundaries are enforced by tests
- [ ] the codebase matches the target architecture

## Notes For Execution

- Keep the replay oracle as the source of truth throughout the refactor.
- Convert each replay-found regression into a focused test before moving to the next slice.
- Prefer extraction and substitution over rewrite.
- If a proposed abstraction forces MS and Lynx into the same gameplay policy, it is probably the wrong abstraction.

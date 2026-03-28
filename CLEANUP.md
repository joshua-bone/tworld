# Repo Cleanup Plan

## Basis

This plan is based on a fresh repo-wide pass against [CLEAN_CODE.md](/Users/joshuabone/git/tworld/CLEAN_CODE.md), with emphasis on Tier 1 and Tier 2 priorities:

- small, single-purpose functions
- explicit interfaces and narrow seams
- one level of abstraction per function
- step-down flow in control logic
- fewer nested conditionals
- fewer long argument lists
- clear ownership of state
- loose coupling and high cohesion
- encapsulated boundary conditions
- shared vocabulary without fake shared behavior

## Current Assessment

The repo is no longer broadly unhealthy. The strongest wins already in place are:

- strong repo instructions and deterministic commands
- real shared vocabulary in `game-core`
- ruleset-local policy and helper seams instead of one fake shared engine
- strong characterization coverage around core engine behavior

The main remaining problems are concentrated in large orchestrators and boundary-heavy modules, not in every part of the repo.

## Primary Hotspots

Highest-value cleanup targets:

- [web/src/player-web/impl/PlayerApp.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/PlayerApp.tsx)
- [web/src/player-web/impl/LegacyCanvasScreen.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/LegacyCanvasScreen.tsx)
- [web/src/player-web/impl/modern/ModernPlayerApp.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/modern/ModernPlayerApp.tsx)
- [web/src/ruleset-ms/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.ts)
- [web/src/ruleset-lynx/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-lynx/impl/engine.ts)
- [web/src/player-web/impl/IndexedDbBrowserProfileStore.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/IndexedDbBrowserProfileStore.ts)
- [web/src/player-web/impl/urlLaunch.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/urlLaunch.ts)
- [web/src/content/api/series-file.ts](/Users/joshuabone/git/tworld/web/src/content/api/series-file.ts)
- [web/src/content/api/solution-file.ts](/Users/joshuabone/git/tworld/web/src/content/api/solution-file.ts)
- [web/src/replay-verifier/compose/verifyAllSolutionReplays.ts](/Users/joshuabone/git/tworld/web/src/replay-verifier/compose/verifyAllSolutionReplays.ts)
- [web/src/game-runtime/impl/LynxGameEngineAdapter.ts](/Users/joshuabone/git/tworld/web/src/game-runtime/impl/LynxGameEngineAdapter.ts)
- [web/src/game-runtime/impl/MsGameEngineAdapter.ts](/Users/joshuabone/git/tworld/web/src/game-runtime/impl/MsGameEngineAdapter.ts)

## Main Findings

### Tier 1 issues

- Large orchestrators still mix UI flow, persistence, input, selection, replay, and rendering concerns in single files.
- Step-down flow is good at the top of the engines now, but weaker in player-web and some mid-level engine helpers.
- There is still duplicated structural code where shared skeletons would help, especially in the game-runtime adapters.
- A few parser and storage modules mix binary/record decoding, validation, persistence, and policy in one place.

### Tier 2 issues

- Some modules still have more than one reason to change.
- Boundary-condition logic is not always isolated in one home.
- Test coverage is strong, but some non-engine areas still need better builder support before deeper structural refactors.
- The right cleanup target is shared vocabulary and shared helper structure, not broad common implementations that erase ruleset differences.

## PR Plan

- [x] PR1: Safety Net For Structural Cleanup
- [x] PR2: PlayerApp Application Controller Split
- [ ] PR3: Modern Dashboard Shell Split
- [ ] PR4: Legacy Canvas Render Pipeline Split
- [ ] PR5: Shared Interactive Adapter Skeleton
- [ ] PR6: Content Parsing Decomposition
- [ ] PR7: Persistence And URL Launch Cleanup
- [ ] PR8: Replay Verifier Orchestration Split
- [ ] PR9: Engine Phase 2 Cleanup
- [ ] PR10: Test DSL Expansion
- [ ] PR11: Naming And Value Objects Pass
- [ ] PR12: Docs And Workflow Refresh

### PR1: Safety Net For Structural Cleanup

Add characterization around:

- player session flows
- URL launch and import resolution
- profile persistence and replay persistence
- replay sweep reporting
- runtime adapter behavior

Goal:

- make later structural refactors behavior-preserving and reviewable

### PR2: PlayerApp Application Controller Split

Break [PlayerApp.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/PlayerApp.tsx) into smaller seams for:

- session lifecycle
- keyboard and mobile input handling
- persistence sync
- replay and import actions
- selection and catalog state

Goal:

- top-level component becomes orchestration, not implementation

Progress:

- [x] extract selection and navigation controller rules into a dedicated tested module
- [x] extract catalog and persistence sync controller
- [x] extract session lifecycle and runtime sync controller
- [x] extract keyboard/mobile input and replay/import action controllers

### PR3: Modern Dashboard Shell Split

Break [ModernPlayerApp.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/modern/ModernPlayerApp.tsx) into:

- library shell
- family and level navigation
- backup and import workflows
- settings workflows
- pane-resize state

Goal:

- separate composition from catalog/search/load mechanics

### PR4: Legacy Canvas Render Pipeline Split

Break [LegacyCanvasScreen.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/LegacyCanvasScreen.tsx) into:

- artwork loading
- tileset caching
- layer caching
- map rendering
- overlay rendering
- inventory-strip rendering

Goal:

- main render path reads as step-down rendering instead of a giant graphics utility file

### PR5: Shared Interactive Adapter Skeleton

Extract the common structure duplicated in:

- [web/src/game-runtime/impl/LynxGameEngineAdapter.ts](/Users/joshuabone/git/tworld/web/src/game-runtime/impl/LynxGameEngineAdapter.ts)
- [web/src/game-runtime/impl/MsGameEngineAdapter.ts](/Users/joshuabone/git/tworld/web/src/game-runtime/impl/MsGameEngineAdapter.ts)

Candidate shared pieces:

- level load and prep skeleton
- live runtime advancement skeleton
- session projection skeleton
- restore and undo plumbing skeleton

Keep ruleset-specific pieces pluggable:

- failure-cause mapping
- frame projection
- runtime token types
- ruleset-specific trace entry points

### PR6: Content Parsing Decomposition

Split:

- [web/src/content/api/series-file.ts](/Users/joshuabone/git/tworld/web/src/content/api/series-file.ts)
- [web/src/content/api/solution-file.ts](/Users/joshuabone/git/tworld/web/src/content/api/solution-file.ts)

Into narrower helpers for:

- config parsing
- binary readers
- metadata decoders
- hash helpers
- fail-fast boundary checks

Goal:

- isolate boundary conditions and reduce parser opacity

### PR7: Persistence And URL Launch Cleanup

Split:

- [web/src/player-web/impl/IndexedDbBrowserProfileStore.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/IndexedDbBrowserProfileStore.ts)
- [web/src/player-web/impl/urlLaunch.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/urlLaunch.ts)

Into seams for:

- typed record codecs
- backend transaction helpers
- replay/import persistence
- migration helpers
- request parsing
- launch resolution
- remote source adapters
- href building

Goal:

- explicit ownership of parsing, persistence, and resolution state

### PR8: Replay Verifier Orchestration Split

Break replay sweep orchestration into:

- discovery
- filtering
- scenario planning
- execution
- aggregation
- terminal reporting

Targets include:

- [web/src/replay-verifier/compose/verifyAllSolutionReplays.ts](/Users/joshuabone/git/tworld/web/src/replay-verifier/compose/verifyAllSolutionReplays.ts)
- related `verify*` and sweep modules

Goal:

- shared reporter/result vocabulary with ruleset-specific execution left local

### PR9: Engine Phase 2 Cleanup

Resume engine cleanup on the remaining mid-level hotspots in:

- [web/src/ruleset-ms/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.ts)
- [web/src/ruleset-lynx/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-lynx/impl/engine.ts)

Focus areas:

- movement start
- arrival resolution
- remaining branch-heavy helpers
- policy gaps needed for future actors

Goal:

- continue reducing nested conditionals without flattening real ruleset differences

### PR10: Test DSL Expansion

Extend test-builder and DSL patterns beyond engine tests into:

- player-web
- persistence
- replay-verifier
- content parsing

Goal:

- keep the characterization net strong while reducing setup boilerplate and giant test files

### PR11: Naming And Value Objects Pass

Introduce a small set of narrow value objects where primitives hide meaning, and rename mutation-heavy helpers so side effects are explicit.

Examples:

- position-like values
- tick/range values
- inventory-owner identifiers
- parse/result helper names that currently sound read-only while mutating

Goal:

- improve readability after the structural seams exist

### PR12: Docs And Workflow Refresh

Refresh:

- [CLEAN_CODE.md](/Users/joshuabone/git/tworld/CLEAN_CODE.md)
- repo instructions and validation docs
- any contributor-facing workflow notes affected by the cleanup

Goal:

- keep documentation aligned with the actual seam structure and validation path

## Recommended Order

Default order:

1. PR1
2. PR2
3. PR4
4. PR5
5. PR6
6. PR7
7. PR8
8. PR9
9. PR10
10. PR11
11. PR12

PR3 can happen after PR2 or in parallel if the write scope stays disjoint.

This order prioritizes the biggest Tier 1 problems first:

- giant orchestrators
- weak step-down flow
- duplicated adapter structure
- boundary-heavy parsers and stores

## What Not To Do

- do not build a common MS/Lynx engine base class
- do not introduce a React state library just to split large components
- do not do rename-only or file-shuffle PRs
- do not DRY ruleset logic where timing or ordering truly differs
- do not mix seam creation with new gameplay feature work

## Success Criteria

The cleanup is successful if:

- top-level files read as orchestration rather than implementation
- mid-level helpers stay at one abstraction level
- state ownership is more obvious
- new behavior has a clear seam to plug into
- test setup gets smaller while behavior coverage stays strong
- future feature work can extend policy/helper seams instead of adding more conditionals to giant files

# Engine Extension Workflow

This project uses a hexagonal split between:

- `domain/game/core` for rules-agnostic simulation primitives
- `domain/game/rules/ms` and `domain/game/rules/lynx` for ruleset policy
- `application` for orchestration and projection
- `adapters` for browser, CLI, filesystem, and oracle integration

When adding a new tile, actor, or ruleset behavior, follow this workflow.

## Core Rule

Do not add new gameplay behavior by editing shared kernel code to branch on a concrete tile id.

Prefer:

- ruleset catalog entries
- tags and capability helpers
- ruleset-local policy functions
- prepared-level normalization

Only change `domain/game/core` when the behavior is truly rules-agnostic.

## 1. Decide The Layer

Use `domain/game/core` only for:

- board math
- occupancy primitives
- timer primitives
- actor storage helpers
- shared turn-phase orchestration

Use `domain/game/rules/ms` or `domain/game/rules/lynx` for:

- movement masks
- entry and leave policy
- collection, death, sound, trap, cloner, teleport, and animation rules
- actor immunity and tile-role classification

Use `application` for:

- trace comparison
- replay sweep orchestration
- interactive session projection
- import and export flows

Use `adapters` for:

- level repositories
- browser audio
- React rendering
- native oracle access

## 2. Update Level Preparation First

If the new tile or actor needs decode-time normalization, add it in:

- `web/src/domain/game/rules/ms/level.ts`
- `web/src/domain/game/rules/lynx/level.ts`

Keep raw DAT decoding in `decodeMsLevelData()`.
Keep ruleset normalization in `prepareMsLevel()` or `prepareLynxLevel()`.

Examples:

- convert encoded metadata into prepared runtime fields
- normalize Lynx-only special tiles
- set prepared status flags

## 3. Extend The Ruleset Catalog

Add the new tile or actor policy in:

- `web/src/domain/game/rules/ms/catalog.ts`
- `web/src/domain/game/rules/lynx/catalog.ts`

Prefer adding:

- tags such as `button`, `teleport`, `trap`, `deadly`, `collectible`, `pushable`
- capability helpers such as movement masks, inventory slots, immunity, forced-floor classification
- policy helpers for entry, leave, arrival, death, sound, or animation classification

If a new behavior needs multiple related checks, add a catalog helper instead of repeating tile-id checks in the engine.

## 4. Keep Engine Changes Local And Policy-Driven

When touching:

- `web/src/domain/game/rules/ms/engine.ts`
- `web/src/domain/game/rules/lynx/engine.ts`

prefer calling catalog helpers from an existing phase instead of adding new hard-coded tile switches.

Good pattern:

- shared phase orchestration in core
- ruleset-local phase logic in engine
- catalog-driven policy decisions inside that logic

Avoid:

- editing `domain/game/core` just to support one tile
- duplicating the same tile-id decision in multiple engine branches

## 5. Update Projection Only If Player-Or Trace-Visible

If the new behavior affects snapshots, debug traces, or player rendering, update the matching projector:

- `web/src/domain/game/trace.ts`
- `web/src/domain/game/rules/ms/debugProjection.ts`
- `web/src/domain/game/rules/lynx/debugProjection.ts`
- `web/src/domain/game/rules/ms/interactiveProjection.ts`
- `web/src/domain/game/rules/lynx/interactiveProjection.ts`
- React rendering or browser audio adapters if the change is presentation-only

Keep simulation and projection separate.

## 6. Add Tests In The Right Order

For every new behavior:

1. Add focused unit coverage near the changed ruleset module.
2. If parity matters, add characterization coverage against legacy behavior.
3. Add bounded replay parity coverage for the affected scenario or window.

Typical files:

- `web/src/domain/game/rules/ms/*.test.ts`
- `web/src/domain/game/rules/lynx/*.test.ts`
- `web/src/application/use-cases/msOracleReplayCharacterization.test.ts`
- `web/src/application/use-cases/lynxOracleReplayCharacterization.test.ts`
- `web/src/application/use-cases/compareMsReplayTraceScenario.test.ts`
- `web/src/application/use-cases/compareLynxReplayTraceScenario.test.ts`

## 7. Validate In Bounded Steps During Refactors

While the refactor plan is active, use bounded validation first:

```bash
npm --workspace web run typecheck
npm --workspace web exec vite build
env TWORLD_SOLUTION_FILE_FILTER='=CCLP1.dac.tws' TWORLD_REPLAY_FILTER=':1' npm run verify:all-replays
env TWORLD_SOLUTION_FILE_FILTER='=CCLP1-lynx.dac.tws' TWORLD_REPLAY_FILTER=':1' npm run verify:all-replays
```

At the end of a refactor phase, rerun the broader replay verifier before declaring the phase complete.

## 8. Use Legacy As The Source Of Truth

If behavior is unclear:

- inspect `legacy_c`
- characterize native behavior first
- then update the TS engine to match

Do not guess when a legacy implementation is available.

## 9. Checklist

Before merging a new tile or actor change, confirm:

- preparation changes are ruleset-local
- catalog entries exist for new policy
- engine logic calls helpers instead of branching widely on tile ids
- projection changes are separate from simulation changes
- focused tests pass
- parity validation stays green

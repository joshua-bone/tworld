# CCLP5 Voting Frontier Plan

This file tracks the replay frontier for the `CCLP5Voting-*` intake packs. It is separate from `LYNX_PARITY_PLAN.md` because this frontier spans both Lynx and MS and also includes a native-invalid exclusion set.

## Scope

- Source intake: repo-root `CCLP5 Voting Packs/` folder, now moved into `data/`, `save/`, and `sets/`
- Frontier entrypoint: `web/src/adapters/levels/loadNodeReplaySweepSeriesCatalog.ts`
- Reporting runner: `web/src/application/use-cases/reportSolutionReplaySupportProgress.ts`

## Baseline

Latest measured intake report:

- `68` solution files checked
- `3390` replays total
- `3383` legacy-passing replays
- `7` legacy non-passing replays
- `3383` TS-passing replays against the legacy-passing set
- `0` TS-failing replays against the legacy-passing set

By ruleset:

- Lynx: `1695` total, `1692` legacy-passing, `1692` TS-passing
- MS: `1695` total, `1691` legacy-passing, `1691` TS-passing

Useful framing:

- The TS frontier for the voting packs is closed.
- The only remaining work in this file is formalizing the `7` native-invalid exclusions in the reporting path and keeping the corpus green.
- The latest measurement was taken with one bounded full run plus a bounded resume run for the final `14` files after the first pass hit the repo timeout cap.

## Legacy Exclusion Set

These replays do not pass cleanly in `legacy_c` and should stay out of the TS frontier unless we decide to repair the solutions themselves.

- [ ] `CCLP5Voting-Immunity-Lynx.tws:24`
  - native stderr: `invalid cloner wiring: no button at (7 24)`
- [ ] `CCLP5Voting-Initiative-Lynx.tws:47`
  - native stderr: miswired cloner buttons disabled at `(17,18)` and `(18,17)`
- [ ] `CCLP5Voting-Initiative-Lynx.tws:50`
  - native stderr: multiple miswired cloner buttons disabled
- [ ] `CCLP5Voting-Llama-MS.tws:3`
  - native result: `failed` at tick `1472`
- [ ] `CCLP5Voting-Llama-MS.tws:47`
  - native result: `failed` at tick `3590`
- [ ] `CCLP5Voting-Oxford-MS.tws:20`
  - native result: `failed` at tick `1408`
- [ ] `CCLP5Voting-Qualification-MS.tws:47`
  - native stderr: repeated `no creature at location (31 31)`

Action item:

- [ ] Teach the voting-pack reporting path to treat these `7` replays as a checked-in native-invalid exclusion list.

## Frontier Buckets

Current TS mismatch buckets:

- None. The measured TS frontier is `0 / 3383` against the legacy-passing replay set.

Residual tracking:

- Keep the `7` native-invalid replays out of the TS failure count.
- Re-run this intake report if the voting-pack files, parser, or replay runners change.

## Fix Order

### Phase 1: Lynx Sound Bucket

Goal:

- Collapse the `28` `soundEffects` mismatches first.

Representative replays:

- [ ] `CCLP5Voting-Acrylic-Lynx.tws:19`
- [ ] `CCLP5Voting-Llama-Lynx.tws:49`
- [ ] `CCLP5Voting-Qualification-Lynx.tws:48`
- [ ] `CCLP5Voting-Zipline-Lynx.tws:25`

Plan:

- [x] Add native characterization windows for representative `32768 -> 32800` and `36864 -> 36896` cases.
- [x] Add TS parity windows for the same replays.
- [x] Fix the shared Lynx sound-emission path in `web/src/domain/game/rules/lynx/engine.ts`.
- [x] Re-run the focused voting-pack report and confirm the sound bucket shrinks materially before moving on.

### Phase 2: Lynx LastMove Bucket

Goal:

- Collapse the `8` `lastMove` mismatches next.

Representative replays:

- [ ] `CCLP5Voting-Acrylic-Lynx.tws:7`
- [ ] `CCLP5Voting-Universal-Lynx.tws:10`
- [ ] `CCLP5Voting-Universal-Lynx.tws:27`
- [ ] `CCLP5Voting-Vanadium-Lynx.tws:47`

Plan:

- [x] Characterize native facing and replay-input windows around the first mismatch ticks.
- [x] Fix replay/facing/forced-move bookkeeping in `web/src/domain/game/rules/lynx/engine.ts`.
- [x] Re-run the focused voting-pack report and confirm the `lastMove` bucket disappears or reduces to edge cases.

### Phase 3: MS Early Actor And RNG Cluster

Goal:

- Tackle the most leverage-heavy MS failures before the long tail.

Representative replays:

- [ ] `CCLP5Voting-Initiative-MS.tws:47`
- [ ] `CCLP5Voting-Initiative-MS.tws:50`
- [ ] `CCLP5Voting-Zipline-MS.tws:2`
- [ ] `CCLP5Voting-Zipline-MS.tws:14`

Why these first:

- `Initiative-MS` fails on `creatureCount`, which points at actor creation/order.
- `Zipline-MS` fails on `randomState.main.value` and creature direction, which points at RNG consumption and movement ordering.

Plan:

- [x] Add native characterization windows for the first mismatch steps.
  - Added in `web/src/application/use-cases/msOracleReplayCharacterization.test.ts` for:
    - `CCLP5Voting-Initiative-MS.tws:47`
    - `CCLP5Voting-Initiative-MS.tws:50`
    - `CCLP5Voting-Zipline-MS.tws:2`
    - `CCLP5Voting-Zipline-MS.tws:14`
- [x] Fix cloner/actor-slot ordering, RNG advance timing, and creature-order drift in `web/src/domain/game/rules/ms/engine.ts`.
- [x] Re-run the focused voting-pack report and check whether later MS map/state failures collapse with the early-state fixes.

Current focused status:

- The Phase 3 MS quartet is green.
- The broader MS voting-pack frontier is also green at `1691 / 1691` against the legacy-passing set.
- The final MS tail closed with teleport parity fixes:
  - block teleport exit selection reserves the block's just-vacated source cell
  - Chip teleport landing does not incorrectly reject an exit just because the forced-exit step is creature-occupied

### Phase 4: MS Direction And Map Tail

Goal:

- Clear the remaining MS frontier once the early-state issues are stable.

Remaining target replays:

- [x] `CCLP5Voting-Nonsense-MS.tws:22`
- [x] `CCLP5Voting-Spatula-MS.tws:6`
- [x] `CCLP5Voting-Tangent-MS.tws:36`
- [x] `CCLP5Voting-Vanadium-MS.tws:12`
- [x] `CCLP5Voting-Vanadium-MS.tws:19`
- [x] `CCLP5Voting-Yogurt-MS.tws:47`

Plan:

- [x] Fix the remaining map/direction/state drift in `web/src/domain/game/rules/ms/engine.ts`.
- [x] Reduce each surviving failure into a characterization + parity regression before taking the next one.

## Validation Loop

Primary command:

```bash
env TWORLD_SOLUTION_FILE_FILTER=CCLP5Voting- \
  perl -e 'alarm shift @ARGV; exec @ARGV' 1800 \
  web/node_modules/.bin/vite-node --root web \
  web/src/application/use-cases/reportSolutionReplaySupportProgress.ts
```

Working rule:

- Re-measure after each bucket fix, not after each individual replay.
- Do not broaden scope until the current bucket has either collapsed or been split into clearly smaller buckets.

## Exit Criteria

- [ ] Legacy exclusion set is checked in and documented
- [x] Voting-pack TS frontier is `0 / 3383` against the legacy-passing replay set
- [ ] Full replay frontier is re-measured after the voting packs are green
- [x] Any new replay-found bugs are reduced into permanent tests before closing this file

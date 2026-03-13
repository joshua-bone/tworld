# Migration PR Plan

This file is the current migration state, not a full historical log. It should stay short, actionable, and representative of what remains.

## Current Status

- [x] Native characterization/oracle harness exists and is part of the workflow.
- [x] The TypeScript workspace is in place and follows hexagonal boundaries.
- [x] Low-risk native modules have TS equivalents behind ports and fixtures.
- [x] The MS engine is running in pure TypeScript.
- [x] The React app can browse and play MS levels against the TS engine.
- [x] The tracked MS replay frontier is green.
- [x] The tracked local Lynx replay frontier is green: the bounded `CCLP1-lynx.dac.tws` frontier is green at `149` checked / `0` failing, the focused `CCLXP2.dac.tws` frontier is green at `149` checked / `0` failing, and the latest full local Lynx sweep is `1007` checked / `0` failing.
- [x] The `CCLP5Voting-*` intake frontier is green against the legacy-passing set: `68` solution files, `3390` replays, `3383` legacy-passing, `3383` TS-passing, `0` TS-failing, with `7` native-invalid exclusions still tracked separately.
- [ ] The shipped app still depends on the native codebase as a validation/runtime fallback.

## Architecture Rules

- [x] Keep `domain/` pure and deterministic: no React, filesystem, subprocess, or browser APIs.
- [x] Keep orchestration in `application/`: use-cases, ports, comparators, scenario runners.
- [x] Keep integrations in `adapters/`: React, native oracle, filesystem, browser storage, fixtures.
- [x] Treat React as an outer adapter only; the engine stays headless.
- [x] Use integer-only gameplay state and explicit update ordering.
- [x] Compare canonical state and traces, never raw structs or pixels.
- [x] Reduce replay-found bugs into checked-in fixtures and focused tests before moving on.
- [x] Keep the native oracle as the source of truth until the TS-only cutover is complete.

## Replay Gate

Repo-root command:

```bash
npm run verify:ms-replays
```

Latest measured status:

| Corpus | Replay entries | Failures |
| --- | ---: | ---: |
| `CC1.dac.tws` | 149 | 0 |
| `public_CHIPS.dac.tws` | 149 | 0 |
| `CCLP1.dac.tws` | 149 | 0 |
| `CCLP2.dac.tws` | 149 | 0 |
| `CCLP3.dac.tws` | 149 | 0 |
| `CCLP4.dac.tws` | 149 | 0 |
| `CCLP5.dac.tws` | 116 | 0 |
| `public_CCZoneTT.dac.tws` | 0 | 0 |
| `public_EvanD1.dac.tws` | 132 | 0 |
| **Total** | **1142** | **0** |

Notes:

- `CCLP5.dac.tws` has `116` replay entries even though the set has `149` levels.
- `public_CCZoneTT.dac.tws` currently contains no replay entries.
- `CHIPS.dat` is supported locally but remains optional and ignored by git.

## Completed Work

### PR 1-6: Foundation

- [x] Defined the characterization contract and fixture schema.
- [x] Added the native oracle CLI and deterministic fixture generation.
- [x] Added native regression checks and the TS parity harness.

### PR 7-12: TS Migration Base

- [x] Ported low-risk modules and parsing paths needed to unblock the engine rewrite.
- [x] Defined the engine boundary behind ports instead of file-by-file transliteration.
- [x] Built the TS domain skeleton, runtime scaffolding, snapshots, replay plumbing, and comparators.

### PR 13, 13A-13F: MS Engine And Replay Parity

- [x] Ported the MS ruleset into the TS domain.
- [x] Expanded oracle coverage and reduced replay-found bugs into checked-in regressions.
- [x] Added replay-bookkeeping parity coverage.
- [x] Closed early gameplay, collision, and movement-order divergences.
- [x] Closed sound, status, and counter parity issues.
- [x] Added richer oracle/debug output and TS debug tooling where needed.
- [x] Reached zero mismatches across the tracked MS replay frontier.

### PR 14: Playable React UI

- [x] Replaced the migration dashboard with a playable MS browser/game screen.
- [x] Kept gameplay behind application ports and headless engine adapters.
- [x] Added browser persistence and replay import/export flows through adapter ports.

## Remaining Work

### PR 15: Port The Lynx Ruleset

- [ ] Execute the detailed Lynx parity plan in `LYNX_PARITY_PLAN.md`.
- [ ] Port `legacy_c/lxlogic.c` behavior into `web/src/domain/game/rules/lynx/`.
- [x] Instrument the native Lynx oracle debug path far enough to expose post-turn/post-housekeeping map mutation.
- [ ] Reach the same oracle-driven replay and fixture parity bar used for MS before cutover.

Done when:

- [ ] The TS engine reproduces Lynx initialization, transitions, traces, and replay behavior under oracle comparison.

### PR 16: Remove The Native Runtime Dependency

- [ ] Make the TS engine the only gameplay runtime used by the shipped app.
- [ ] Keep the native oracle only as a validation tool for as long as it remains useful.
- [ ] Remove native runtime paths once both MS and Lynx parity are sustained.
- [ ] Decide whether the oracle remains in-repo long term as a regression tool.

Done when:

- [ ] The app is TS/React-only and native code is no longer required to run the product.

## Immediate Next Steps

1. Keep the tracked local Lynx sweep green under both the repo-root verification command and the streaming runner in `LYNX_PARITY_PLAN.md`.
2. Check in the `7` native-invalid voting-pack exclusions in the reporting path so the intake frontier stays measured as TS vs legacy-passing replays.
3. Start removing remaining native runtime dependencies while retaining the oracle as a test-only validation tool until the cutover is stable.
4. If new Lynx corpora or replay fixtures are added, route them through the same parity workflow before expanding product scope.

## Maintenance Rule For This File

- Keep this file focused on current state, replay-gate numbers, and remaining work.
- Do not append historical debugging notes or old intermediate counts here.
- If a phase is complete, summarize it in one or two bullets instead of preserving the full trail.

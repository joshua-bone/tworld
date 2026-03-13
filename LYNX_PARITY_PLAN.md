# Lynx Port And Replay Parity Plan

This file tracks the detailed PR15 work. Unlike `PR_PLAN.md`, it can carry the finer-grained Lynx checklist and corpus notes.

## Starting State

- TS gameplay is complete for the MS ruleset and has started for Lynx.
- The React app can browse Lynx sets, but full Lynx gameplay remains blocked because the TS Lynx engine only covers init plus a small chip-only runtime slice.
- Replay sweep tooling is now generic enough to run a Lynx frontier sweep, and it already targets the TS Lynx adapter.
- The native oracle, fixture pipeline, phase-debug output, and replay-reduction workflow already exist and should be reused instead of rebuilt.

## Local Lynx Corpus Inventory

Current local Lynx set wrappers:

- `sets/cc-lynx.dac`
- `sets/cc-fixlynx.dac`
- `sets/intro-lynx.dac`
- `sets/CCLP1-Lynx.dac`
- `sets/CCLP2.dat-lynx.dac`
- `sets/CCLP3-Lynx.dac`
- `sets/CCLP4-Lynx.dac`
- `sets/CCLP5-Lynx.dac`
- `sets/EvanD1.dat-lynx.dac`
- `sets/public_CCZoneTT-lynx.dac`
- `sets/public_CHIPS-lynx.dac`

Current local Lynx replay corpora:

- `save/CC1-lynx.dac.tws`
- `save/CCLP1-lynx.dac.tws`
- `save/CCLP3-lynx.dac.tws`
- `save/CCLP4-lynx.dac.tws`
- `save/CCLP5-lynx.dac.tws`
- `save/CCLXP2.dac.tws`
- `save/public_CCZoneTT-lynx.dac.tws`
- `save/public_CHIPS-lynx.dac.tws`

Known gap:

- There is no local `CCLP2-lynx` replay corpus right now.

## Lessons From The MS Port

These are mandatory process rules for Lynx:

1. Build the replay gate early.
   - Do not wait until most of `lxlogic.c` is ported before standing up a Lynx replay sweep.
   - First concrete deliverable is a repo-root `verify:lynx-replays` path, even if it initially reports unsupported or all-failing.

2. Reuse the phase-debug workflow immediately.
   - The native oracle phase-debug output already paid for itself on MS.
   - Do not postpone debug visibility until the replay frontier gets painful.

3. Reduce replay-found bugs into checked-in regressions.
   - Every meaningful replay-found Lynx bug should become:
     - a reduced replay/trace fixture
     - a focused domain/unit regression where possible

4. Keep the main plan short.
   - `PR_PLAN.md` should stay stateful and compact.
   - Historical Lynx debugging notes belong here, not in the main plan.

5. Avoid ruleset-specific harness dead ends.
   - The MS-specific sweep should either be generalized or mirrored with shared logic.
   - Do not duplicate more harness code than necessary.

6. Use bounded tooling.
   - Replay sweeps and debug runs must stay non-interactive and time-bounded.

7. Do not invent new infrastructure unless the existing oracle/debug path proves insufficient.
   - In particular, do not create a separate `13E_3`-style native mini-scenario runner unless the existing phase-debug path fails to localize bugs.

## Phase L1: Generic Lynx Replay Gate

- [x] Generalize or parallel the replay-sweep path so Lynx corpora can be checked locally.
- [x] Add a repo-root command for Lynx replay sweeps.
  - [x] `npm run verify:lynx-replays`
- [x] Ensure replay-series alias resolution covers the local Lynx corpora, especially:
  - `CC1-lynx.dac.tws` <-> `cc-lynx.dac` / `public_CHIPS-lynx.dac`
  - `CCLP1-lynx.dac.tws` <-> `CCLP1-Lynx.dac`
  - `CCLP3-lynx.dac.tws` <-> `CCLP3-Lynx.dac`
  - `CCLP4-lynx.dac.tws` <-> `CCLP4-Lynx.dac`
  - `CCLP5-lynx.dac.tws` <-> `CCLP5-Lynx.dac`
  - `public_CCZoneTT-lynx.dac.tws` <-> `public_CCZoneTT-lynx.dac`
- [x] Measure and record the initial Lynx frontier counts by corpus.

Done when:

- [x] `verify:lynx-replays` runs end-to-end against the local Lynx corpora and reports real counts.

## Phase L2: Lynx Domain Skeleton

- [x] Create `web/src/domain/game/rules/lynx/`.
- [x] Reuse the shared DAT level decoding path for the first Lynx level parser seam.
- [x] Add a first TS Lynx engine adapter parallel to the MS one.
- [x] Add initialization-only Lynx input-trace support and intro init parity tests.
- [x] Reach parity for the intro zero-tick init slice (`intro-lynx` levels `1` through `9`).
- [x] Port the Lynx level/state initialization path fully enough to cover more than zero-tick init traces.
- [x] Switch the Lynx replay sweep candidate from the MS adapter to the Lynx adapter.
- [x] Reuse existing domain/application types where the rulesets can share contracts cleanly.

Done when:

- [x] A TS Lynx adapter can initialize a level and emit canonical snapshots through the existing engine ports.

## Phase L3: Initial Lynx Fixture Corpus

- [x] Add checked-in Lynx initialization fixtures.
- [x] Add short input-trace fixtures for early/high-signal mechanics.
- [ ] Add reduced replay-trace fixtures from the first replay frontier failures.
- [x] Start with small/early-level and intro scenarios before broader corpora.

Priority mechanic areas:

- force floors
- ice and ice corners
- teleport search/exit semantics
- monster ordering
- button/trap/cloner interactions
- Chip collision/death semantics
- replay bookkeeping (`lastMove`, input timing, replay cursor)

Done when:

- [ ] The first replay-found Lynx bugs are being caught by checked-in fixtures before the full replay sweep is rerun.

## Current TS Lynx Slice

Live-oracle green today:

- init traces: `intro-lynx-level-1-init` through `intro-lynx-level-9-init`
- runtime traces:
  - `intro-lynx-level-1-east-chips`
  - `intro-lynx-level-2-watch-step-east`
  - `intro-lynx-level-3-friends-idle`
  - `intro-lynx-level-6-teleports-east`
  - `intro-lynx-level-8-buttons-east`

Native debug visibility available today:

- checked-in Lynx debug fixture: `intro-lynx-level-8-buttons-east-debug`
- Lynx debug phases now include:
  - `post-input-latch`
  - `post-initial-housekeeping`
  - `post-creature-intent`
  - `post-creature-movement`
  - `post-teleport-resolution`
  - `post-putwall-resolution`
  - `final`
- the first visible level-8 map mutation appears in native debug at `post-creature-movement` on step `0`

Current measured next frontiers:

- replay execution has started, so the replay frontier is no longer blocked only at `$engine`
- latest bounded local corpus measurement:
  - `CCLP1-lynx.dac.tws`: `149` replays checked, `0` failing
  - the former bounded frontier is closed end-to-end; the hidden-block-slot lookup fix was the last bounded gameplay bug and it also closed the old `:62`, `:124`, and `:130` tail failures
- latest full local corpus measurement:
  - `1007` Lynx replays checked, `0` failing
  - every tracked local Lynx replay corpus is now green under the streaming sweep runner
- latest focused `CCLXP2` remeasure:
  - `CCLXP2.dac.tws`: `149` replays checked, `0` failing
  - the focused `CCLXP2` frontier is closed end-to-end
- current exact replay frontiers:
  - none in the tracked local corpus; the full local Lynx replay frontier is green

## Phase L4: Core Lynx Engine Port

- [ ] Port Chip movement and timing semantics from `legacy_c/lxlogic.c`.
- [x] Port the first non-Chip actor movement ordering slice needed for intro runtime parity.
- [ ] Port Lynx-specific hazard, teleport, and collision behavior.
- [ ] Port replay/solution timing details that differ from MS.

Done when:

- [ ] The TS Lynx engine passes the initial fixture corpus and reduced replay cases for the core mechanics.

## Phase L5: Debug-Driven Parity Push

- [x] Reuse the native phase-debug output for exact Lynx trace mismatches before replay execution exists.
- [ ] Reuse the native phase-debug output for exact Lynx replay mismatches once `runReplayTrace()` exists.
- [ ] Add Lynx-specific debug fields only if the existing debug payload is insufficient.
- [ ] Keep reducing replay failures into permanent regressions as the frontier drops.

Done when:

- [ ] The remaining Lynx frontier is small enough that exact replay debugging is fast and predictable.

## Phase L6: Full Lynx Replay Frontier

- [ ] Bring every tracked local Lynx replay corpus to zero mismatches.
- [ ] Keep per-corpus counts current in this file while PR15 is active.
- [x] Once green, move the final summary back into `PR_PLAN.md` and keep the details here.

Frontier table:

| Corpus | Replay entries | Failures | Notes |
| --- | ---: | ---: | --- |
| `CC1-lynx.dac.tws` | 148 | 0 | latest full local remeasure; corpus is now green |
| `CCLP1-lynx.dac.tws` | 149 | 0 | bounded frontier is now fully green |
| `CCLP3-lynx.dac.tws` | 149 | 0 | latest full local remeasure; corpus is now green |
| `CCLP4-lynx.dac.tws` | 149 | 0 | latest full local remeasure; corpus is now green |
| `CCLP5-lynx.dac.tws` | 115 | 0 | latest full local remeasure; corpus is now green |
| `CCLXP2.dac.tws` | 149 | 0 | focused frontier is now fully green again |
| `public_CCZoneTT-lynx.dac.tws` | 0 | 0 | no replay entries |
| `public_CHIPS-lynx.dac.tws` | 148 | 0 | latest full local remeasure; corpus is now green |
| **Total** | **1007** | **0** | latest full local remeasure; tracked Lynx frontier is green |

Done when:

- [x] All tracked local Lynx replay corpora are green under the repo-root sweep command.

## Immediate Next Steps

1. Keep the tracked local Lynx sweep green under the streaming runner and the repo-root verification path.
2. If new Lynx corpora or fixture sets are added, bring them in through the same parity workflow and reduce any new failures into permanent regressions.
3. Use the now-green local frontier to support removal of remaining native fallback paths in the shipped app.

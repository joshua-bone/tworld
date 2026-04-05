# Performance Plan

## Status

- [x] Initial performance investigation completed
- [x] Representative benchmark scenarios identified
- [x] Primary bottlenecks identified
- [x] Debug perf overlay implemented
- [x] Scheduler fix implemented
- [ ] Worker payload reduction implemented
- [ ] Undo/history projection reduction implemented
- [ ] Incremental frame projection implemented
- [ ] 3D/Lynx render-path optimization implemented
- [ ] Perf regression coverage added

## Problem Statement

Community reports describe the product as laggy, with gameplay running slower than real time and occasionally jumping forward. That matches the current architecture: when a gameplay tick runs long, the app tends to fall behind and skip/collapse timing rather than recover smoothly.

The problem is not just raw ruleset simulation speed. The larger issue is the full live pipeline:

1. worker tick execution
2. interactive session projection
3. undo/history summarization
4. structured-cloning a large session payload back to the main thread
5. main-thread scheduling that drops ticks when one is still in flight
6. render-path hashing and redraw work on top of that

## What Was Measured

I benchmarked the current adapters with representative scenarios:

- typical 2D gameplay
- actor-dense gameplay
- multi-layer 3D gameplay

The harness separated:

- raw engine tick cost
- full interactive tick cost
- approximate worker-to-main-thread clone cost
- draw-state key cost

These measurements exclude actual browser paint and DOM cost, so they are a lower bound.

## Key Results

### With Undo Enabled

| Scenario | Raw tick | Interactive tick | Clone cost | Approx effective rate |
| --- | ---: | ---: | ---: | ---: |
| Typical MS | 5.0ms | 18.6ms | 12.2ms | 14.8 Hz |
| Typical Lynx | 4.3ms | 18.1ms | 12.6ms | 14.8 Hz |
| Dense MS | 3.1ms | 9.7ms | 10.1ms | 17.4 Hz |
| Dense Lynx | 8.4ms | 38.5ms | 21.8ms | 11.4 Hz |
| 3D MS | 13.2ms | 51.4ms | 18.9ms | 9.8 Hz |
| 3D Lynx | 2.0ms | 29.9ms | 13.4ms | 13.0 Hz |

### With Undo Disabled

| Scenario | Interactive tick | Clone cost | Approx effective rate |
| --- | ---: | ---: | ---: |
| Typical MS | 2.8ms | 10.0ms | 18.4 Hz |
| Typical Lynx | 2.9ms | 10.5ms | 18.8 Hz |
| Dense MS | 4.5ms | 18.7ms | 17.4 Hz |
| Dense Lynx | 12.5ms | 19.5ms | 17.0 Hz |
| 3D MS | 11.3ms | 23.4ms | 15.0 Hz |
| 3D Lynx | 2.1ms | 19.3ms | 17.3 Hz |

## Conclusions

- [x] The core ruleset engines are not the only or even primary problem.
- [x] Undo/session projection overhead is a major contributor.
- [x] Cross-thread session cloning is a first-order cost.
- [x] The current scheduler turns transient slowness into permanent slow motion.
- [x] 3D and actor-dense scenarios make the problem much worse.
- [x] Multi-layer Lynx has extra render-path risk because draw memoization is bypassed.

## Root Causes

### 1. Tick Scheduling Is Not Catch-Up Safe

The live loop runs on a fixed interval and skips work if a prior tick is still in flight. That means overload causes slower gameplay, not bounded recovery.

Expected outcome after fix:

- short spikes produce brief catch-up work
- gameplay time stays closer to real time
- "slow then jump" behavior is reduced

### 2. Full Session Payload Returned Every Tick

Each worker tick posts a full interactive session back to the main thread. That payload includes frame data, history summaries, and recorded moves. The structured clone alone is often expensive enough to materially reduce tick throughput.

Expected outcome after fix:

- lower per-tick clone cost
- less GC pressure
- lower main-thread sync overhead

### 3. Undo/History Summaries Are Recomputed Too Often

During live play, the system repeatedly rebuilds checkpoint and recent-tick summaries from undo history. That is useful for history UI, but it is too expensive to pay every gameplay tick.

Expected outcome after fix:

- lower interactive tick cost during normal play
- same undo features, but with lazy or incremental summary work

### 4. Frame Projection Clones Visible Cells Every Tick

The interactive frame path clones board cells for the visible layer and lower layers. In multi-layer views this becomes significantly more expensive.

Expected outcome after fix:

- lower worker CPU per tick
- smaller payloads
- better scaling for 3D levels

### 5. Multi-Layer Lynx Redraw Path Is Too Eager

The legacy canvas path hashes render state every frame, and multi-layer Lynx bypasses draw memoization. That means it can redraw even when the worker side is already overloaded.

Expected outcome after fix:

- less redundant redraw work
- better 3D Lynx smoothness

## Goals

- [ ] Restore gameplay to near-real-time pacing in typical 2D levels
- [ ] Reduce severe slowdown in dense and 3D levels
- [ ] Preserve ruleset correctness and replay parity
- [ ] Keep undo and replay features intact
- [ ] Add durable perf guardrails so regressions are visible

## Non-Goals

- [ ] Rewrite the full rendering system in one pass
- [ ] Remove undo or replay support as a shortcut
- [ ] Introduce ruleset behavior drift for speed

## PR Plan

### PR 0: Debug Perf Overlay

Status:

- [x] Initial overlay shipped

Scope:

- expose visible live perf metrics when debug mode is enabled
- reuse the existing debug overlay rather than creating a separate diagnostics surface
- show high-signal metrics that help distinguish:
  - render slowdown
  - gameplay tick slowdown
  - scheduler drift
  - worker/main-thread backpressure
- prefer EMA/rolling values plus last-value snapshots so spikes and sustained regressions are both visible

Recommended visible metrics:

- [x] render FPS
- [x] effective gameplay tick rate in Hz
- [x] last / EMA / max tick duration in ms
- [x] last / EMA / max render duration in ms
- [x] loop drift in ms
- [x] session load time for new level starts
- [x] current ruleset, level, visible layer count, actor count, overlay count
- [x] undo enabled/disabled and current checkpoint count
- [x] worker round-trip or session advance latency if instrumented separately
- [x] worker payload size in KB once response slimming work begins
- [x] dropped or capped catch-up tick counters once scheduler work lands

Acceptance:

- [x] debug mode clearly shows frame rate
- [x] debug mode clearly shows simulation rate separate from render rate
- [x] metrics are legible during active gameplay and level transitions
- [ ] overlay is cheap enough not to materially distort the numbers it shows

Risk:

- low

Why first:

- this gives immediate visibility into whether later PRs improve rendering, simulation, scheduling, or worker overhead

### PR 1: Scheduler Correctness

Status:

- [x] Catch-up scheduler implemented in legacy gameplay loop
- [x] Debug counters exposed for catch-up batches and dropped ticks
- [ ] Browser gameplay validation completed across representative levels

Scope:

- replace the fixed `setInterval` + drop-if-busy behavior with a catch-up scheduler
- accumulate elapsed real time
- run up to a capped number of catch-up ticks per loop
- expose counters for dropped/capped catch-up events

Acceptance:

- [ ] gameplay no longer permanently slows under brief stalls
- [ ] sustained overload degrades gracefully instead of desynchronizing badly
- [ ] existing gameplay/replay behavior remains correct

Risk:

- medium

Why first:

- this directly addresses the user-visible "slow and jumps" symptom

### PR 2: Worker Response Slimming

Status:

- [x] `advance-session` now returns a delta for stable session metadata, checkpoint ticks, recorded moves, and visible-layer cell changes
- [ ] static frame/setup payload split from steady-state tick payload
- [ ] lazy history payload introduced for non-live UI needs

Scope:

- stop returning the full interactive session on every tick
- split session data into:
  - static session/setup payload
  - lightweight tick/frame payload
  - lazy history payload when needed
- keep authoritative history and state in the worker

Acceptance:

- [ ] average clone cost drops materially
- [ ] payload size for steady-state ticks is significantly smaller
- [ ] gameplay UI still has the data it needs

Risk:

- high

Why second:

- clone cost is consistently large even when simulation is cheap

### PR 3: Incremental Undo/History Summaries

Status:

- [ ] Not started

Scope:

- stop recomputing checkpoint/recent tick summaries every gameplay tick
- maintain incremental live-play summaries in worker runtime
- compute full checkpoint lists lazily for history UI

Acceptance:

- [ ] interactive tick cost with undo enabled moves much closer to undo-disabled cost
- [ ] undo and timeline UI remain correct

Risk:

- medium

Why third:

- measurements show undo is a major multiplier in normal gameplay

### PR 4: Incremental Frame Projection

Status:

- [ ] Not started

Scope:

- stop cloning full visible board layers each tick
- separate static board/layer data from per-tick actor and overlay changes
- send only changed cell patches where possible

Acceptance:

- [ ] worker-side projection cost drops in 2D and 3D scenarios
- [ ] 3D levels show the biggest improvement

Risk:

- high

Why fourth:

- this attacks both CPU cost and payload size in the most structural way

### PR 5: 3D and Lynx Render-Path Cleanup

Status:

- [ ] Not started

Scope:

- remove or narrow unconditional multi-layer Lynx draw memoization bypass
- key redraws off meaningful frame/version changes instead of every RAF
- audit draw-state hashing cost in the legacy canvas path

Acceptance:

- [ ] reduced redraw churn in multi-layer levels
- [ ] 3D Lynx smoothness improves

Risk:

- medium

Why fifth:

- renderer improvements matter, but worker/session costs are already enough to miss 20 Hz

### PR 6: Perf Instrumentation and Regression Coverage

Status:

- [ ] Not started

Scope:

- keep the existing runtime perf metrics
- add scenario benchmarks for:
  - typical MS
  - typical Lynx
  - dense MS
  - dense Lynx
  - 3D MS
  - 3D Lynx
- add thresholds or trend checks that fail loudly when costs regress materially

Acceptance:

- [ ] perf regressions become visible in development and CI tooling
- [ ] future changes can be compared against a stable baseline

Risk:

- low

Why sixth:

- after core fixes land, guardrails are needed to keep the gains

## Recommended Execution Order

- [x] PR 0: Debug Perf Overlay
- [x] PR 1: Scheduler Correctness
- [ ] PR 2: Worker Response Slimming
- [ ] PR 3: Incremental Undo/History Summaries
- [ ] PR 4: Incremental Frame Projection
- [ ] PR 5: 3D and Lynx Render-Path Cleanup
- [ ] PR 6: Perf Instrumentation and Regression Coverage

## Recommended Success Metrics

- [ ] Typical 2D gameplay sustains close to 20 Hz in normal play
- [ ] Typical 2D gameplay with undo enabled stays comfortably above 18 Hz
- [ ] Dense and 3D gameplay improve materially versus current baseline
- [ ] Per-tick worker payload size drops significantly
- [ ] Per-tick clone cost drops significantly
- [ ] Reported "slow and jumps" complaints stop reproducing in the known scenarios

## Current Recommendation

Start with PR 0 so debug mode exposes the live perf picture during gameplay. Then move into PR 1, PR 2, and PR 3. That sequence gives immediate observability and then targets the biggest user-visible causes of slowdown without requiring a full rendering rewrite up front.

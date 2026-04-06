# Performance Plan

## Status

- [x] Initial steady-state performance investigation completed
- [x] Debug perf overlay shipped
- [x] Scheduler catch-up work shipped
- [x] Worker response slimming shipped
- [x] Undo/history live-summary reduction shipped
- [x] Incremental frame projection shipped
- [x] 3D/Lynx render-path cleanup shipped
- [x] Perf benchmark/guard tooling shipped
- [ ] Level-entry and first-load spike pass completed
- [ ] Load-phase diagnostics split into worker/load/render subphases
- [ ] First level-entry hitch reduced materially

## Scope

This plan now has two parts:

1. steady-state gameplay throughput work that is already shipped
2. remaining level-entry and first-load spike work that is still open

The current user-visible complaint is no longer just "gameplay runs slow all the time." The remaining complaint is that the game still hitches, especially when first loading into a level.

## What Is Already Shipped

- [x] PR 0: Debug perf overlay
- [x] PR 1: Scheduler correctness and catch-up behavior
- [x] PR 2: Worker response slimming
- [x] PR 3: Incremental undo/history summaries
- [x] PR 4: Incremental frame projection
- [x] PR 5: 3D/Lynx render-path cleanup
- [x] PR 6: Perf instrumentation and regression guard

These changes improved steady-state behavior, but they did not remove the full level-entry hitch.

## Current Problem Statement

The remaining lag spike is a cold-start stack, not a single bottleneck.

On first level entry, the product can pay for all of this at once:

1. worker creation and worker module evaluation
2. worker-side repository and imported-DAT hydration
3. built-in DAT fetch and grouped-level extraction
4. ruleset-specific level preparation
5. initial session projection and session cloning
6. legacy tileset decode/build
7. synchronous render cache warmup on the main thread
8. first-use audio element creation

That is why the game can feel fine after it is already running, but still hitch badly when entering a level.

## Current Findings

### 1. Imported DAT hydration is on the gameplay load path

`BrowserLevelRepository.loadLevel()` always calls `ensureImportedSeriesHydrated()` before loading any level, even built-in content.

Relevant seams:

- `web/src/level-catalog/impl/BrowserLevelRepository.ts`

Impact:

- built-in level load can block on IndexedDB-backed imported file hydration
- users with imported packs pay extra cold-start cost even when they are not playing those packs

### 2. Built-in level load parses the whole DAT before selecting one level

The built-in path caches grouped levels by calling `extractGroupedDatLevels(datBytes)` for the entire DAT, then selects one level from that full index.

Relevant seams:

- `web/src/level-catalog/impl/BrowserLevelRepository.ts`

Impact:

- first load pays whole-pack extraction cost
- this is acceptable for tooling or catalog construction, but not ideal for first gameplay entry

### 3. Worker warmup is too shallow

The worker is pre-created and pinged, but the ping only proves that the worker exists. It does not preload any series config, DAT bytes, grouped level data, or prepared level state.

Relevant seams:

- `web/src/player-web/compose/createBrowserAppServices.ts`
- `web/src/game-runtime/impl/WorkerBackedInteractiveGameEngine.ts`
- `web/src/game-runtime/impl/interactiveGame.worker.ts`

Impact:

- the first real `start-session` still pays the expensive path
- the main thread and worker do not share level repository warm state

### 4. Initial render warmup is synchronous main-thread work on level entry

`LegacyCanvasScreen` clears lower-layer caches and then immediately runs `prewarmVisibleLayerCaches(...)` inside a synchronous effect when a gameplay session appears.

Relevant seams:

- `web/src/player-web/impl/LegacyCanvasScreen.tsx`
- `web/src/player-web/impl/legacyCanvasMapRenderer.ts`

Impact:

- guaranteed hitch on level entry in legacy gameplay
- especially bad for 3D or animated levels
- this is likely one of the highest-signal user-facing spike sources

### 5. Render warmup currently does more than it needs to

The warmup renders the top layer plus lower layers across several future timervals, even though the persistent cache value is mainly in lower-layer canvases.

Relevant seams:

- `web/src/player-web/impl/legacyCanvasMapRenderer.ts`

Impact:

- extra synchronous work on the main thread
- unnecessary entry cost for normal gameplay

### 6. Tileset bootstrap still happens at runtime

Tilesets are prewarmed at app startup, but they still require image load, canvas draw, sprite extraction, and override application at runtime.

Relevant seams:

- `web/src/player-web/compose/App.tsx`
- `web/src/player-web/impl/legacyCanvasTileset.ts`

Impact:

- usually amortized, but still a cold-start risk
- if prewarm loses the race with gameplay entry, level load stalls on tileset readiness

### 7. First-use audio is still lazy

The sound player is created on app mount, but audio elements are created on first sound playback.

Relevant seams:

- `web/src/player-web/impl/PlayerApp.tsx`
- `web/src/player-web/impl/BrowserSoundEffectsPlayer.ts`

Impact:

- smaller than level parsing or render warmup
- still a contributor to "first action" hitching

### 8. The overlay does not split level-entry cost into actionable subphases

The debug overlay shows `sessionLoadMs` and draw metrics, but not a load-phase breakdown such as:

- worker startup/start-session
- repository/load-level
- level preparation
- initial projection
- tileset load
- initial render warmup

Relevant seams:

- `web/src/player-web/impl/runtimePerf.ts`
- `web/src/player-web/impl/legacyCanvasDebug.ts`
- `web/src/player-web/impl/usePlayerAppSessionController.ts`

Impact:

- the remaining hitch is measurable, but not yet attributable enough
- this slows down validation of later fixes

## Immediate Highest-Value Changes

The two most likely immediate wins are:

- [ ] remove synchronous `prewarmVisibleLayerCaches(...)` from the level-entry critical path
- [ ] stop unconditional imported-DAT hydration from built-in gameplay level loads

These are the first two changes most likely to reduce the hitch you can actually feel.

## Goals

- [ ] Reduce first level-entry hitch materially on built-in packs
- [ ] Keep steady-state gameplay throughput gains intact
- [ ] Avoid new replay or ruleset correctness regressions
- [ ] Make load spikes measurable by subphase, not just as one total
- [ ] Rebaseline perf guardrails after load-path fixes land

## Non-Goals

- [ ] Rewrite the entire rendering stack
- [ ] Remove undo, replay, or worker architecture as a shortcut
- [ ] Trade correctness for lower load times

## PR Plan

### PR 7: Load-Phase Diagnostics Split

Status:

- [ ] Not started

Scope:

- add separate perf timings for:
  - worker/session start request
  - repository `loadLevel`
  - ruleset `prepareLoadedLevel`
  - initial projection/session packaging
  - tileset load/build
  - initial render warmup
- expose these in the debug overlay alongside existing `sessionLoadMs`

Acceptance:

- [ ] level entry no longer appears as one opaque number
- [ ] first-load hitch can be attributed to a specific subphase

Risk:

- low

Why first:

- this makes the rest of the load-spike work provable instead of speculative

### PR 8: Move Initial Render Warmup Off the Critical Path

Status:

- [ ] Not started

Scope:

- stop running `prewarmVisibleLayerCaches(...)` synchronously during level entry
- defer cache warmup until after first paint
- chunk work with `requestIdleCallback`, `requestAnimationFrame`, or bounded time slices
- limit warmup to lower layers only
- skip or heavily reduce warmup for single-layer sessions

Acceptance:

- [ ] first playable frame appears before cache warmup completes
- [ ] entry hitch is materially reduced in legacy gameplay
- [ ] multi-layer smoothness remains acceptable after the deferred warmup settles

Risk:

- medium

Why second:

- this is the clearest main-thread hitch in the current level-entry path

### PR 9: Remove Imported-DAT Hydration from Built-In Gameplay Loads

Status:

- [ ] Not started

Scope:

- stop calling imported DAT hydration on every `loadLevel()` call
- hydrate imports only when:
  - listing imported content
  - selecting an imported series
  - explicitly syncing imported content

Acceptance:

- [ ] built-in level loads no longer wait on unrelated imported-pack hydration
- [ ] imported pack behavior still works when actually used

Risk:

- medium

Why third:

- this is a pure cold-start penalty with no gameplay value for built-in content

### PR 10: Real Worker Preload

Status:

- [ ] Not started

Scope:

- replace worker `ping` warmup with a real preload path
- support preloading selected series/level data into the worker before gameplay start
- prefer passing already-loaded bytes or prepared metadata into the worker over refetching and reparsing inside the worker

Acceptance:

- [ ] first `start-session` avoids most worker cold-start overhead
- [ ] worker and UI no longer duplicate as much level-load work

Risk:

- medium-high

Why fourth:

- current warmup only proves liveness, not readiness

### PR 11: Replace Whole-DAT First-Load Extraction with Indexed or Lazy Single-Level Load

Status:

- [ ] Not started

Scope:

- stop extracting all grouped levels on the first gameplay load for built-in data
- add either:
  - a checked-in level offset/index manifest, or
  - a lazy single-level extraction path

Acceptance:

- [ ] first built-in level load does not require whole-pack extraction
- [ ] later navigation still benefits from caching

Risk:

- high

Why fifth:

- this is structurally correct, but larger than the two easiest wins above

### PR 12: Asset Bootstrap Smoothing

Status:

- [ ] Not started

Scope:

- make tileset prewarm more deterministic and earlier
- ensure tileset decode/build does not race gameplay entry
- precreate or predecode common one-shot audio after unlock
- avoid first-sound allocation spikes during gameplay

Acceptance:

- [ ] tileset readiness is not a common first-level blocker
- [ ] first sound playback no longer causes noticeable hitching

Risk:

- low-medium

Why sixth:

- useful cleanup, but not the largest remaining spike source

### PR 13: Rebaseline and Closeout

Status:

- [ ] Not started

Scope:

- rerun the perf harness and debug overlay validation after load-path changes
- update benchmark baselines
- confirm first-load and warm-load behavior separately

Acceptance:

- [ ] new baselines reflect both steady-state and level-entry behavior
- [ ] first-level hitch is measurably lower than before this phase

Risk:

- low

Why last:

- only useful after the load-path changes land

## Recommended Execution Order

- [ ] PR 7: Load-phase diagnostics split
- [ ] PR 8: Move initial render warmup off the critical path
- [ ] PR 9: Remove imported-DAT hydration from built-in gameplay loads
- [ ] PR 10: Real worker preload
- [ ] PR 11: Indexed or lazy single-level load
- [ ] PR 12: Asset bootstrap smoothing
- [ ] PR 13: Rebaseline and closeout

## Success Criteria

- [ ] first level-entry hitch is materially smaller on built-in content
- [ ] first playable frame appears before any heavy render warmup finishes
- [ ] built-in gameplay loads do not block on unrelated imported content
- [ ] overlay shows which load subphase is responsible for remaining spikes
- [ ] warm loads are consistently better than cold loads
- [ ] steady-state gameplay performance does not regress

## Current Recommendation

Start with PR 7 only if the goal is attribution first. If the goal is fastest user-visible improvement, do PR 8 and PR 9 immediately after or even ahead of the broader preload/indexing work.

The current best default sequence is:

1. PR 7 for visibility
2. PR 8 for the obvious main-thread hitch
3. PR 9 for the avoidable repository hydration penalty
4. PR 10 and PR 11 for deeper structural cleanup

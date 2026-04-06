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
- [x] Level-entry and first-load spike pass completed
- [x] Load-phase diagnostics split into worker/load/render subphases
- [x] Initial projection and tileset bootstrap diagnostics split further
- [x] Runtime-init reduction pass started from PR14 findings
- [ ] First level-entry hitch reduced materially

## Scope

This plan now has three parts:

1. steady-state gameplay throughput work that is already shipped
2. remaining level-entry and first-load spike work that is still open
3. the reopened projection/render-bootstrap pass now that repository load is no longer the main cost

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

- [x] remove synchronous `prewarmVisibleLayerCaches(...)` from the level-entry critical path
- [x] stop unconditional imported-DAT hydration from built-in gameplay level loads

These are the first two changes most likely to reduce the hitch you can actually feel.

## Goals

- [ ] Reduce first level-entry hitch materially on built-in packs
- [x] Keep steady-state gameplay throughput gains intact
- [x] Avoid new replay or ruleset correctness regressions
- [x] Make load spikes measurable by subphase, not just as one total
- [x] Rebaseline perf guardrails after load-path fixes land

## Non-Goals

- [ ] Rewrite the entire rendering stack
- [ ] Remove undo, replay, or worker architecture as a shortcut
- [ ] Trade correctness for lower load times

## PR Plan

### PR 7: Load-Phase Diagnostics Split

Status:

- [x] Implemented

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

- [x] level entry no longer appears as one opaque number
- [x] first-load hitch can be attributed to a specific subphase

Risk:

- low

Why first:

- this makes the rest of the load-spike work provable instead of speculative

Shipped diagnostics:

- `sessionLoadMs` remains the end-to-end total
- `workerSessionStartMs` captures the main-thread worker start-session round trip
- `levelLoadMs` captures repository `loadLevel`
- `prepareLevelMs` captures ruleset `prepareLoadedLevel`
- `initialProjectionMs` captures initial session projection and packaging
- `tilesetLoadMs` captures legacy tileset decode/build
- `initialRenderWarmupMs` is now surfaced in the overlay as a first-class boot metric

### PR 8: Move Initial Render Warmup Off the Critical Path

Status:

- [x] Implemented

Scope:

- stop running `prewarmVisibleLayerCaches(...)` synchronously during level entry
- defer cache warmup until after first paint
- chunk work with `requestIdleCallback`, `requestAnimationFrame`, or bounded time slices
- limit warmup to lower layers only
- skip or heavily reduce warmup for single-layer sessions

Acceptance:

- [x] first playable frame appears before cache warmup completes
- [ ] entry hitch is materially reduced in legacy gameplay
- [ ] multi-layer smoothness remains acceptable after the deferred warmup settles

Risk:

- medium

Why second:

- this is the clearest main-thread hitch in the current level-entry path

Shipped behavior:

- warmup now starts after first paint instead of blocking level entry
- warmup runs in bounded background slices instead of one synchronous effect
- only lower-layer caches are prewarmed
- single-layer sessions skip warmup entirely
- warmup is keyed to session start, so later UI syncs do not restart it for the same run

### PR 9: Remove Imported-DAT Hydration from Built-In Gameplay Loads

Status:

- [x] Implemented

Scope:

- stop calling imported DAT hydration on every `loadLevel()` call
- hydrate imports only when:
  - listing imported content
  - selecting an imported series
  - explicitly syncing imported content

Acceptance:

- [x] built-in level loads no longer wait on unrelated imported-pack hydration
- [x] imported pack behavior still works when actually used

Risk:

- medium

Why third:

- this is a pure cold-start penalty with no gameplay value for built-in content

Shipped behavior:

- built-in `loadLevel()` requests now go straight to bundled series/data assets
- imported DAT hydration only happens on imported-content paths
- loading an imported series still hydrates persistent imported DAT storage on demand

### PR 10: Real Worker Preload

Status:

- [x] Implemented

Scope:

- replace worker `ping` warmup with a real preload path
- support preloading selected series/level data into the worker before gameplay start
- prefer passing already-loaded bytes or prepared metadata into the worker over refetching and reparsing inside the worker

Acceptance:

- [x] selection changes can preload the chosen level before gameplay start
- [x] worker warmup no longer stops at a liveness-only `ping`
- [x] worker and UI can reuse the same loaded level payload instead of refetching and reparsing it separately

Risk:

- medium-high

Why fourth:

- current warmup only proves liveness, not readiness

Shipped behavior:

- worker warmup now instantiates the worker instead of issuing a fake `ping`
- the app exposes a best-effort preload path for a concrete `GameRequest`
- catalog selection changes now trigger preload for playable series/levels
- the main-thread repository can prime the exact loaded level payload
- the worker accepts a `preload-level` request and primes its own repository from that payload
- later `start-session` calls can reuse the primed loaded level instead of repeating the full cold load path

### PR 11: Replace Whole-DAT First-Load Extraction with Indexed or Lazy Single-Level Load

Status:

- [x] Implemented

Scope:

- stop extracting all grouped levels on the first gameplay load for built-in data
- add either:
  - a checked-in level offset/index manifest, or
  - a lazy single-level extraction path

Acceptance:

- [x] first built-in level load no longer materializes the full grouped level payload for the entire DAT
- [x] later navigation can reuse cached DAT bytes plus a lightweight grouped-level index

Risk:

- high

Why fifth:

- this is structurally correct, but larger than the two easiest wins above

Shipped behavior:

- built-in DAT files now build a lightweight grouped-level index instead of eagerly extracting every grouped level payload
- the grouped index stores layer offsets and sizes, not cloned level byte arrays
- built-in level loads now slice only the requested grouped level and its layers from cached DAT bytes
- the same index+slice path now exists in both browser and Node level repositories
- 3D grouped numbering and descending-layer ordering are covered by parser-level regression tests

### PR 12: Asset Bootstrap Smoothing

Status:

- [x] Implemented

Scope:

- make tileset prewarm more deterministic and earlier
- ensure tileset decode/build does not race gameplay entry
- precreate or predecode common one-shot audio after unlock
- avoid first-sound allocation spikes during gameplay

Acceptance:

- [x] legacy tileset warmup is deterministic instead of depending on idle timing
- [x] first sound playback can reuse precreated audio elements instead of allocating them on demand

Risk:

- low-medium

Why sixth:

- useful cleanup, but not the largest remaining spike source

Shipped behavior:

- app startup now prewarms both legacy tilesets immediately instead of deferring MS warmup behind idle/timeout heuristics
- legacy image loading now uses a shared decoded-image promise cache so repeated tileset builds do not refetch or re-decode the same bitmap assets
- the sound player now precreates one-shot pools and loop audio elements as part of bootstrap instead of allocating them on first playback
- audio bootstrap is triggered on player mount and again after unlock as a no-op safety path
- the debug perf overlay now reports `audioBootstrapMs` alongside tileset and render warmup boot metrics

### PR 13: Rebaseline and Closeout

Status:

- [x] Implemented

Scope:

- rerun the perf harness and debug overlay validation after load-path changes
- update benchmark baselines
- confirm first-load and warm-load behavior separately

Acceptance:

- [x] new baselines reflect both steady-state and level-entry behavior
- [x] `perf:bench` and `perf:guard` now report cold and warm `start-session` medians alongside steady-state tick medians
- [ ] first-level hitch is measurably lower than before this phase

Risk:

- low

Why last:

- only useful after the load-path changes land

Shipped behavior:

- `perf:bench` now prints both steady-state tick results and cold/warm load-path results for the six fixed scenarios
- `perf:guard` now enforces both the steady-state baseline and a calibrated load-path baseline
- a new load baseline is checked in for cold/warm `start-session`, `levelLoad`, `prepareLevel`, and `initialProjection`
- the closeout run confirms that warm repository load is effectively eliminated while total entry time is still dominated by initial projection on heavier cases

Closeout findings from the current guard run:

- steady-state guard passed after the load-path changes
- warm `levelLoadMs` median is now essentially zero across all scenarios at `0.04-0.07ms`
- total warm `start-session` median is still dominated by `initialProjectionMs`, especially on Lynx and 3D scenarios
- current warm-start medians are roughly `54ms` Typical MS, `97ms` Typical Lynx, `50ms` Dense MS, `138ms` Dense Lynx, `356ms` 3D MS, and `447ms` 3D Lynx
- this means the load/repository work landed, but the remaining first-entry hitch is now mostly a projection/render-bootstrap problem instead of a DAT hydration or parsing problem

### PR 14: Initial Projection and Tileset Bootstrap Diagnostics Split

Status:

- [x] Implemented

Scope:

- split `initialProjectionMs` into:
  - runtime init
  - frame projection
  - history projection
  - session-state projection
  - final session packaging
- split `tilesetLoadMs` into:
  - image load/decode
  - tileset build/override application
- surface those subphases in the debug overlay without adding per-tick profiling overhead

Acceptance:

- [x] initial projection is no longer a single opaque number
- [x] tileset bootstrap is no longer a single opaque number
- [ ] we can identify the dominant remaining cold-start subphase on the deployed build

Risk:

- low

Why now:

- the guard run already showed that repository load is no longer the main issue
- the next useful cut depends on knowing whether the remaining hitch is frame projection, session packaging, or browser-side tileset work

Shipped behavior:

- `initialProjectionMs` now has overlay-visible subphases for runtime init, frame projection, history projection, state projection, and session packaging
- `tilesetLoadMs` now has overlay-visible subphases for image load and build/override work
- the worker start-session seam forwards the new projection metrics back to the main-thread perf registry

### PR 15: Runtime Init Clone Reduction

Status:

- [x] Implemented

Scope:

- target the dominant PR14 subphase: `initialRuntimeInitMs`
- remove avoidable cell/object cloning during session startup
- reduce startup work that rebuilds immutable board-position data
- avoid duplicate layer cloning during MS initial engine persistence

Acceptance:

- [x] startup work no longer clones immutable `position` payloads
- [x] Lynx startup no longer double-clones cells before stripping creatures for the initial board state
- [x] MS startup no longer reclones already-private layer cells when persisting the first engine map
- [ ] warm-start medians are improved consistently across representative scenarios

Risk:

- medium

Why now:

- PR14 showed that frame/history/session packaging were all tiny compared with `initialRuntimeInitMs`
- the next useful cut was reducing runtime-start cloning and one-time state construction, not projection formatting

Shipped behavior:

- `cloneBoardCells(...)` now reuses immutable `position` objects while still cloning mutable tile payloads
- Lynx initial creature stripping now mutates freshly cloned startup cells in place instead of cloning them a second time
- MS initial engine bootstrap now reuses its freshly prepared runtime layers instead of recloning those non-active layers during the first `updateEngine(...)`

Current local validation:

- a bounded local harness rerun on `typical-lynx` improved materially from the earlier PR14 pass:
  - warm `initialProjectionMs` median moved from roughly `253ms` to `52ms`
  - cold `initialProjectionMs` median moved from roughly `186ms` to `100ms`
- heavier scenarios are still noisy and not closed out:
  - `3d-lynx` remained high in the same harness rerun
  - MS startup results were mixed and need another guarded rebaseline instead of a claim-by-inspection

### PR 16: Lazy Initial Undo Checkpoint Materialization

Status:

- [x] Implemented

Scope:

- reduce `initialRuntimeInitMs` further by removing eager initial undo snapshot cloning from interactive session startup
- keep generic undo-history APIs exact by default
- preserve Lynx restore correctness by materializing the lazy initial snapshot before the first live mutation
- keep runtime and branch checkpoints eager so later restore points do not drift with mutable engine state

Acceptance:

- [x] interactive session startup no longer clones the initial undo checkpoint eagerly
- [x] direct undo-history creation remains exact by default outside the interactive adapter path
- [x] MS and Lynx restore/fork flows still pass after the lazy-start change
- [ ] warm-start medians show a consistent reduction on the heavier browser-visible cases

Risk:

- medium

Why now:

- PR14 and PR15 both pointed at runtime initialization rather than frame/history/session packaging
- the initial undo checkpoint was still doing a full `structuredClone(...)` plus digest at session start even though most sessions never restore immediately
- this cut is narrow enough to be low-risk if the laziness is limited to the interactive adapter path

Shipped behavior:

- `createMsUndoHistory(...)` and `createLynxUndoHistory(...)` now support an explicit `lazyInitialCheckpoint` option instead of always deciding eagerly
- the interactive adapter path opts into that laziness for live session startup only
- direct undo-history utilities keep eager initial checkpoint capture unless the caller explicitly opts in
- the adapter primes the initial checkpoint on the first live advance before engine mutation, which preserves exact restore semantics for mutable Lynx state
- later checkpoints and fork checkpoints still capture eagerly, so mid-run restores do not drift

Current local validation:

- targeted undo and restore coverage passed after the change:
  - `src/undo-runtime/impl/history.test.ts`
  - `src/game-runtime/impl/restoreInteractiveGameSession.test.ts`
  - `src/game-runtime/impl/interactiveSessionProjection.test.ts`
- a bounded local perf rerun currently reports these cold/warm `start-session` medians:
  - `Typical MS`: `37.78ms` cold, `17.31ms` warm
  - `Typical Lynx`: `8.04ms` cold, `3.10ms` warm
  - `3D MS`: `11.89ms` cold, `11.80ms` warm
  - `3D Lynx`: `9.06ms` cold, `24.27ms` warm
- that local harness result is directionally encouraging on typical starts but does not close out the heavier browser-visible hitch yet

## Recommended Execution Order

- [x] PR 7: Load-phase diagnostics split
- [x] PR 8: Move initial render warmup off the critical path
- [x] PR 9: Remove imported-DAT hydration from built-in gameplay loads
- [x] PR 10: Real worker preload
- [x] PR 11: Indexed or lazy single-level load
- [x] PR 12: Asset bootstrap smoothing
- [x] PR 13: Rebaseline and closeout
- [x] PR 14: Initial projection and tileset bootstrap diagnostics split
- [x] PR 15: Runtime init clone reduction
- [x] PR 16: Lazy initial undo checkpoint materialization

## Success Criteria

- [ ] first level-entry hitch is materially smaller on built-in content
- [x] first playable frame appears before any heavy render warmup finishes
- [x] built-in gameplay loads do not block on unrelated imported content
- [x] overlay shows which load subphase is responsible for remaining spikes
- [ ] warm loads are consistently better than cold loads
- [x] steady-state gameplay performance does not regress

## Current Recommendation

The repository/load-path phase is closed. The active follow-up phase is now initial projection and browser-side render bootstrap.

The remaining bottleneck is no longer repository hydration or DAT extraction. PR14 showed that the real hotspot inside `initialProjectionMs` is `initialRuntimeInitMs`, PR15 cut the obvious board/runtime clone waste there, and PR16 removed eager initial undo checkpoint capture from the interactive startup path. The next cuts should stay on that runtime-init seam for heavy/3D cases and then rebaseline, rather than reopening the repository path or overfitting to frame projection.

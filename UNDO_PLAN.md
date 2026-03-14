# Event-Sourced Undo And Rewind Plan

This document defines a clean undo design for both MS and Lynx.

The design target is stricter than "map state matches after undo". Undo is only considered correct if restoring to a prior point reproduces the full interactive session state needed for future ticks to evolve identically.

That means:

- board cells and visible map state must match
- actor runtime state must match
- chip motion, queued inputs, and push state must match
- timer and replay cursor must match
- RNG state must match
- animation and endgame counters must match whenever they affect future evolution

## Goals

- Support exact undo for both MS and Lynx.
- Keep engine gameplay logic clean and ruleset-correct.
- Avoid inverse-operation logic.
- Keep recent undo fast.
- Allow optional rewind-and-resume over the original timeline.
- Allow the player to take over from a restored timeline cleanly.

## Non-Goals

- Reversing gameplay effects in-place.
- Mutating existing replay solution files during play.
- Supporting branch merging in the first pass.
- Optimizing for infinite history with zero memory growth.

## Recommendation

Use event sourcing with full-session checkpoints.

The authoritative history is:

1. An initial interactive session checkpoint.
2. A per-tick input event log.
3. Periodic full interactive-session checkpoints.

Restore works by:

1. Selecting the nearest checkpoint at or before the target tick.
2. Restoring that full session token.
3. Replaying recorded tick events forward to the requested tick.

This is the practical version of event sourcing for this codebase.

## Why This Design

Pure inverse undo is the wrong fit here.

Both rulesets have order-sensitive state transitions:

- RNG advancement
- queued input semantics
- actor runtime flags
- teleport, trap, cloner, and push behavior
- animation and endgame state

Trying to define inverse operations for all of those would be fragile and harder to prove correct than replaying forward from a known-good checkpoint.

## Current Code Implications

The current codebase already has most of the determinism surface needed:

- shared engine state in `web/src/game-core/api/model.ts`
- interactive engine port in `web/src/game-runtime/ports/InteractiveGameEngine.ts`
- MS interactive token in `web/src/ruleset-ms/impl/engine.ts`
- Lynx interactive token in `web/src/ruleset-lynx/impl/engine.ts`

MS is easier because its tick advancement already clones forward into a fresh next state.

Lynx is still feasible, but the full interactive token contains more runtime-only fields outside `EngineState`, so checkpoints must capture the entire Lynx session token, not just the shared engine projection.

## Authoritative Undo History

Introduce a dedicated undo history object outside the engines.

This history should not reuse the existing `recordedMoves` replay-export format. That format is intentionally lossy and omits idle ticks.

### History Structure

The history should contain:

- `initialCheckpoint`
- `events`
- `checkpoints`
- `branchMetadata`
- `settingsSnapshot`

### Tick Event

Each event must represent one authoritative tick of interactive history.

Fields:

- `tick`
- `inputCode`
- `inputKind`
- `source`
- `timelineId`

Rules:

- record every tick, including `none`
- do not compress repeated inputs
- preserve raw runtime input semantics exactly as applied to the session
- keep replay-driven ticks and manual ticks distinguishable

### Checkpoint

Each checkpoint must hold the complete restorable session token for the active ruleset.

Fields:

- `tick`
- `ruleset`
- `timelineId`
- `sessionToken`
- `stateDigest`

`sessionToken` means:

- full `MsInteractiveSessionState` for MS
- full `LynxInteractiveSessionState` for Lynx

`stateDigest` is a canonical equality payload used for validation and corruption detection.

## Exactness Rule

The acceptance standard is not "same `mapHash`".

The real standard is:

`restore(targetTick) + replay(to targetTick)` must produce a session token identical to the original session token captured at that tick.

This must include:

- full map cell content
- actor arrays and runtime flags
- chip and motion state
- internal/session-only fields
- RNG
- replay cursor
- sound/animation/endgame counters where relevant

If full-token equality is not true, undo is not correct even if the visible board looks right.

## Checkpoint Frequency

Use dense recent checkpoints plus thinned older checkpoints.

Default recommendation:

- checkpoint every `N` ticks during active play
- keep all checkpoints in the recent window
- thin older checkpoints exponentially
- always keep tick `0`
- always keep the most recent checkpoint

Example retention policy:

- last 10 seconds: keep every checkpoint
- previous minute: keep every 2nd checkpoint
- previous 5 minutes: keep every 4th checkpoint
- older: keep every 8th, then 16th, then 32nd checkpoint bucket

This preserves exactness because only checkpoints are thinned. The per-tick event log remains authoritative.

## Event Retention

Checkpoint thinning alone does not cap history growth.

There are two valid product policies:

1. Unlimited undo within the current session
- retain the full event log
- exact and simple
- memory grows with session length

2. Bounded undo window
- discard events older than the earliest retained checkpoint
- undo before that point is no longer available
- memory stays bounded

Default recommendation:

- start with unlimited session history
- if memory pressure becomes real, add a configurable maximum history duration

## Restore Modes

Support two restore behaviors.

### 1. Undo Restore

- restore target tick
- stop there
- player resumes manually

This should be the default undo behavior.

### 2. Rewind And Resume

- restore target tick
- automatically continue replaying the original timeline
- if the player never intervenes, the old deterministic timeline continues

This is a time-travel playback mode layered on top of undo.

## Takeover Behavior

If the player provides live input while replaying restored future events:

- the restored historical future is cut off at that tick
- a new timeline branch is created
- subsequent events are recorded onto the new branch

Do not try to merge timelines in the first pass.

Default rule:

- first manual input during resumed replay creates a fork
- old future events after that tick are discarded from the active branch
- optional later enhancement: preserve inactive branches for debugging

## Proposed UI Surface

Expose all discussed behavior through explicit UI options.

### Baseline Controls

- `Undo`: restore to previous checkpointed/history point and pause
- `Rewind`: open a history scrubber or step backward by configured increment
- `Resume Original Timeline`: restore and keep replaying historical events

### Help Menu

Add entries to the `?` menu for:

- `Undo`
- `Rewind/Resume`
- `Take over during replay to fork a new timeline`

### Settings Panel

Add toggles and selectors for:

- `Enable Undo History`
- `Enable Rewind And Resume`
- `Allow Takeover During Historical Replay`
- `Keep Unlimited History`
- `Checkpoint Density`
- `History Retention Mode`

Recommended defaults:

- `Enable Undo History`: on
- `Enable Rewind And Resume`: on
- `Allow Takeover During Historical Replay`: on
- `Keep Unlimited History`: on
- `Checkpoint Density`: medium
- `History Retention Mode`: dense recent + exponential thinning

### Advanced Settings

Hide advanced retention controls behind an advanced section.

Advanced options:

- `Checkpoint every X ticks`
- `Recent window duration`
- `Exponential thinning base`
- `Maximum retained history duration`
- `Pause on restore` vs `auto-resume on restore`

### In-Game Status

When replaying a restored historical future, show a lightweight status banner:

- `Replaying history`
- `Take control to fork timeline`

When forked, show:

- `Timeline forked from tick N`

## Architecture Placement

Keep undo history outside ruleset gameplay engines.

### Package Placement

Recommended new package:

- `web/src/undo-runtime`

Structure:

- `ports/`
- `impl/`
- `compose/`

Responsibilities:

- session history management
- checkpoint capture and pruning
- restore orchestration
- branch metadata
- undo/rewind commands

The engines remain responsible only for:

- creating sessions
- advancing one tick from a given session token

They should not own history retention policy.

## Required Engine Surface

The history layer needs explicit ruleset-safe snapshot/restore helpers.

Add ruleset-specific session-token serialization helpers:

- `captureMsInteractiveCheckpoint(session)`
- `restoreMsInteractiveCheckpoint(checkpoint)`
- `captureLynxInteractiveCheckpoint(session)`
- `restoreLynxInteractiveCheckpoint(checkpoint)`

Those helpers must preserve the complete token, not a reduced projection.

## Validation Standard

The practical meaning of "100% certainty" in this codebase is:

1. Every captured checkpoint can be restored losslessly.
2. Replay from a restored checkpoint reaches a full session-token state identical to the original recorded one.
3. This is proven over targeted unit tests, ruleset characterization windows, randomized stress runs, and replay-driven integration tests.

### Canonical Session Digest

Define a canonical digest function for each interactive token.

It must include:

- all engine state fields
- all ruleset-local runtime fields
- all actor runtime flags
- timer and RNG
- queued inputs and replay plan state
- endgame and animation counters

Acceptance check:

- deep structural equality
- stable serialized digest equality

Do not rely only on:

- `mapHash`
- `creaturesHash`
- visual output

### Deterministic Undo Tests

For both MS and Lynx, add tests that:

1. start a session
2. apply a scripted tick-by-tick input stream
3. capture original session states at every tick
4. restore from multiple prior checkpoints
5. replay forward to each recorded tick
6. assert full-token equality at each target tick

This should run for:

- manual play
- replay play
- mixed replay/manual takeover

### Fuzz Validation

Add randomized bounded tests:

- generate deterministic input streams from fixed seeds
- run sessions for a bounded number of ticks
- restore from random target ticks
- replay forward
- assert full-token equality

Run this for both rulesets with multiple seeds in CI.

### Parity Validation

Undo itself is a TS-side runtime feature, but restored gameplay must still preserve legacy parity.

Validation rule:

- a session advanced normally and the same session restored-and-replayed to the same tick must produce the same parity-visible state

Use bounded replay verification windows to confirm no gameplay drift after restore.

### Corruption Detection

At checkpoint capture time:

- store canonical digest

At restore time:

- verify checkpoint digest before replay
- fail fast if the checkpoint payload is incomplete or corrupted

## Performance Expectations

Recent undo should be near-instant because the nearest checkpoint should be close.

Older rewind may be slower because replay distance grows as checkpoints are thinned.

That is acceptable and intentional.

Performance guardrails:

- checkpoint capture should be O(session token size)
- restore should be O(replayed ticks after nearest checkpoint)
- recent undo should target sub-frame or low-latency interaction

## Risks

### 1. Hidden Lynx Runtime State

Lynx has more non-projected runtime state than MS.

Mitigation:

- checkpoint the full session token
- define token equality first
- do not reduce Lynx checkpoints to shared engine state

### 2. Input Logging Mismatch

Current replay recording is too lossy for undo history.

Mitigation:

- add a new per-tick event stream
- keep replay export separate from undo history

### 3. Checkpoint Drift From Mutable References

If a checkpoint stores live references, restore correctness is lost.

Mitigation:

- snapshot by deep clone or immutable serialization
- verify digest immediately after capture

### 4. Confusing Replay Versus Live Timeline UX

If resumed history and live input are not clearly separated, player behavior becomes ambiguous.

Mitigation:

- explicit replaying-history banner
- explicit takeover semantics
- explicit branch creation on first manual input

## Recommended Implementation Order

### [x] PR1: Session Equality Contract

- [x] define canonical full-token digest for MS and Lynx
- [x] add session-equality tests
- [x] add fixtures for state round-trip tests

Exit criteria:

- full-token equality can be asserted deterministically for both rulesets

### [ ] PR2: History Model And MS Checkpoints

- [ ] add undo history package
- [ ] add per-tick event log
- [ ] add MS checkpoint capture/restore
- [ ] add MS restore-and-replay tests

Exit criteria:

- MS undo is exact under deterministic tests

### [ ] PR3: Lynx Checkpoints

- [ ] add Lynx full-session checkpoint capture/restore
- [ ] add Lynx restore-and-replay tests

Exit criteria:

- Lynx undo is exact under deterministic tests

### [ ] PR4: Restore Commands

- [ ] add undo restore behavior
- [ ] add history navigation commands
- [ ] keep restore paused by default

Exit criteria:

- user can restore to prior points in both rulesets

### [ ] PR5: Resume Historical Timeline

- [ ] add rewind-and-resume mode
- [ ] add explicit timeline replay state
- [ ] add takeover branching on first manual input

Exit criteria:

- restored future continues deterministically until player takeover

### [ ] PR6: Retention And Pruning

- [ ] add dense recent checkpoints
- [ ] add exponential thinning for older checkpoints
- [ ] add history retention settings

Exit criteria:

- history memory is bounded by policy
- recent undo remains fast

### [ ] PR7: UI And Settings

- [ ] add help entries
- [ ] add UI controls for undo, rewind, resume, takeover
- [ ] add settings toggles for all supported behaviors
- [ ] add status banner for replaying historical future

Exit criteria:

- all discussed behaviors are controllable in UI

### [ ] PR8: Final Validation And Broader Replay Gates

- [ ] run bounded restore/replay parity validations
- [ ] run broader replay verification after implementation is complete
- [ ] document operational limits and defaults

Exit criteria:

- undo/replay restore is exact under test and does not regress gameplay parity

## Default Product Policy

The default shipping behavior should be:

- undo history enabled
- dense recent checkpoints plus exponential thinning
- restore pauses by default
- rewind-and-resume available but explicit
- takeover allowed during resumed historical replay
- first live input forks the timeline and discards the old future from the active branch

## Final Rule

Do not declare this feature complete because the board looks right after undo.

The feature is only complete when full interactive session state is reproducible after restore and replay for both MS and Lynx.

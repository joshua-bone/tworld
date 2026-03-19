# Recording Parity Plan

## Goal

Make replay recording and playback match legacy behavior exactly, with legacy treated as the specification.

This is primarily an MS problem today, especially for mouse-goal input, but the plan should leave the codebase in a shape where Lynx parity is enforced the same way.

## What "Parity" Means

Parity is not "the replay usually wins."

Parity means that for a given input stream, legacy and modern produce the same:

- recorded replay moves
- replay cursor progression
- tick-by-tick input interpretation
- `lastMove`
- `goalPos`
- Chip position / direction / movement state
- map hash / creature hash
- final outcome

This follows the repo guidance in [docs/migration/characterization.md](/Users/joshuabone/git/tworld/docs/migration/characterization.md#L103): gameplay parity is enforced through canonical snapshots and replay/input traces.

## Root Cause

The current replay layer is still too generic.

The main leak is [web/src/game-core/api/playback.ts](/Users/joshuabone/git/tworld/web/src/game-core/api/playback.ts#L98), where `recordManualMove()` is ruleset-agnostic. That is fine for simple keyboard input, but it is the wrong abstraction for MS because MS replay semantics depend on:

- the legacy keyboard poll cadence
- preserve polls
- whether Chip already moved this cycle
- whether a mouse-goal is still active
- whether a raw mouse command must be preserved as-is

The MS engine already contains those semantics, including mouse-goal behavior, in [web/src/ruleset-ms/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.ts#L4230). The recorder must be owned there, not inferred later.

## Legacy Spec Surface

The behavior we must match is the legacy path:

- MS keyboard buffering: [web/src/player-web/impl/legacyInput.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/legacyInput.ts#L26)
- MS mouse-goal queueing: [web/src/player-web/impl/legacyInput.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/legacyInput.ts#L74)
- MS engine mouse-goal semantics: [web/src/ruleset-ms/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.ts#L4283)
- Existing MS mouse regression coverage: [web/src/ruleset-ms/impl/engine.test.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.test.ts#L1224)

The rule is simple: modern must reuse legacy recording semantics, not emulate them approximately.

## Non-Goals

- No compatibility shim for malformed historical replays as the default solution.
- No UI-only workaround that "fixes" replay save/load without fixing the engine contract.
- No accepting win/loss parity if tick-by-tick state still diverges.

## Required Invariants

- `recordedMoves` must be a ruleset-owned artifact, not a generic byproduct of scheduled UI input.
- Replay export must serialize exactly what the ruleset recorded. It must not normalize or reinterpret commands beyond the replay file format itself.
- Replay playback must consume exactly the same command stream the recorder intended.
- Modern UI input buffering must feed the same command stream into the engine as legacy UI.
- Mouse-goal commands must preserve legacy raw command form when legacy preserves it.

## Proposed API Changes

### 1. Replace Generic "recordManualMove" Ownership

Keep [web/src/game-core/api/playback.ts](/Users/joshuabone/git/tworld/web/src/game-core/api/playback.ts#L98) as a low-level helper at most, but stop treating it as the source of truth for MS.

Introduce a ruleset-owned recording decision shape:

```ts
interface RecordedReplayMoveDecision {
  when: number;
  dir: number;
}
```

Optional debug-only extension if needed while stabilizing:

```ts
interface ReplayRecordingDebugDecision extends RecordedReplayMoveDecision {
  rawInputCode: number;
  source: "keyboard" | "absolute-mouse" | "relative-mouse" | "nop";
}
```

### 2. Make Tick Advance Return Recording Decisions

For MS, `advanceMsTick(...)` should return:

```ts
interface MsAdvanceTickResult {
  state: MsGameState;
  recordedReplayMove: RecordedReplayMoveDecision | null;
}
```

This replaces "infer the replay move from whatever input happened to be scheduled."

The current `recordedReplayInputCode` fix is a step in this direction, but the end state should be an actual replay move decision object.

### 3. Move Session Recording to the Ruleset

[web/src/ruleset-ms/impl/engine.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.ts#L5064) should append only `advanceMsTick(...).recordedReplayMove`.

The session layer should not decide:

- whether to record
- which tick to record
- which command code to store

It should only append what the ruleset says to append.

### 4. Keep Replay Cursor Handling Inside the Same Contract

Any interactive replay session must advance cursor state the same way the trace/debug replay paths do.

The current code already had one bug here: replay trace/debug paths were explicitly updating the replay cursor while the interactive path lagged behind. This class of bug should not be possible once recording/playback ownership is fully centralized inside the engine result.

## Test Plan

## Layer 1: MS Engine Characterization

Add or tighten engine tests in [web/src/ruleset-ms/impl/engine.test.ts](/Users/joshuabone/git/tworld/web/src/ruleset-ms/impl/engine.test.ts).

These should assert exact per-tick values for:

- `currentInputCode`
- `lastMove`
- `goalPos`
- Chip position
- replay cursor
- recorded replay moves

Named scenarios:

- `ms-keyboard-hold-repeat`
- `ms-off-cycle-direction-change`
- `ms-absolute-mouse-goal-basic`
- `ms-relative-mouse-goal-basic`
- `ms-mouse-goal-preserve-polls`
- `ms-mouse-goal-while-chip-has-moved`
- `ms-mouse-goal-then-keyboard-override`
- `ms-repeated-mouse-retarget`
- `ms-mouse-goal-on-slide`
- `ms-mouse-goal-on-ice`
- `ms-mouse-goal-after-teleport`
- `ms-blocked-mouse-goal-recheck`

Several of these already partially exist. The task is to make them assert recording parity, not just movement parity.

## Layer 2: Manual -> Export -> Replay Round Trip

Add end-to-end tests in [web/src/game-runtime/impl/exportedReplayParity.test.ts](/Users/joshuabone/git/tworld/web/src/game-runtime/impl/exportedReplayParity.test.ts).

For each named scenario:

1. drive a manual session with explicit inputs
2. export the replay
3. start a replay session from the exported bytes
4. compare every tick to the manual session

Required MS scenarios:

- keyboard hold-repeat
- off-cycle turn before next move cadence
- absolute mouse-goal with preserve polls
- relative mouse-goal
- retarget while prior goal active
- click then override with keyboard

## Layer 3: UI Input Parity

Add a small set of tests around [web/src/player-web/impl/legacyInput.ts](/Users/joshuabone/git/tworld/web/src/player-web/impl/legacyInput.ts) and the modern click path in [web/src/player-web/impl/PlayerApp.tsx](/Users/joshuabone/git/tworld/web/src/player-web/impl/PlayerApp.tsx#L2580).

Goal:

- prove that modern MS mouse clicks feed the same queued command stream as legacy
- prove that keyboard + mouse interleaving uses the same command ordering

This can be done without a full React integration test if the click-to-buffer path is factored into a testable helper.

## Layer 4: Known Replay Regression Cases

Maintain a short synthetic regression suite for cases that previously failed.

Do not depend on ad hoc replay files dropped in repo root.

Instead:

- derive the bad input prefix into a synthetic checked-in test
- assert the pre-fix broken export would have diverged
- assert the fixed export round-trips

## Implementation Sequence

### PR 1: Define The Recording Contract

- [ ] Add `RecordedReplayMoveDecision` to the ruleset tick-advance result.
- [ ] Update MS session advance to append only ruleset-emitted decisions.
- [ ] Leave replay file export as a pure serializer.

### PR 2: Finish MS Keyboard Recording Parity

- [ ] Remove any remaining "scheduled input means recorded move" assumptions.
- [ ] Cover off-cycle turn timing and hold-repeat timing with round-trip tests.
- [ ] Verify exact replay cursor parity for manual and replay sessions.

### PR 3: Finish MS Mouse-Goal Recording Parity

- [ ] Route modern mouse-goal input through the same legacy queue semantics.
- [ ] Record raw mouse-goal commands exactly when legacy would record them.
- [ ] Cover absolute, relative, retarget, blocked, slide, and keyboard-override cases.

### PR 4: Make Parity Failures Easy To Diagnose

- [ ] Add shared helpers to diff manual vs replay sessions tick-by-tick.
- [ ] Include replay cursor, goalPos, lastMove, and map/creature hashes in failure output.
- [ ] Ensure every new replay regression test prints the first divergent tick and key fields.

### PR 5: Extend The Same Architecture To Lynx

- [ ] Audit whether Lynx recording still depends on generic move inference anywhere.
- [ ] Add a smaller but equivalent Lynx recording parity suite.
- [ ] Keep the same engine-owned recording contract across both rulesets.

## Done Criteria

This work is done only when all of the following are true:

- The MS engine owns replay recording semantics.
- Modern MS mouse-goal recording uses the same effective command stream as legacy.
- Manual -> export -> replay round-trip tests pass for keyboard and mouse scenarios.
- Replay drift failures identify the first divergent tick and relevant state fields.
- No compatibility-load shim is required for newly recorded replays.

## Default Decision

Default approach:

- treat legacy as the oracle
- move replay recording ownership into the ruleset engines
- prove parity with characterization and round-trip tests

Not the default:

- patching symptoms one replay at a time
- normalizing commands in the UI
- repairing malformed new recordings on load

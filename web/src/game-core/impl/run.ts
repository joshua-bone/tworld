import { initializeEngineState } from "@game-core/impl/initialize";
import { createRuntimeCommand, plannedReplayInput, recordManualMove, resolveManualInput, scheduledInputForTick, type ReplayPlan } from "@game-core/api/playback";
import { engineStateToSnapshot } from "@game-core/impl/snapshot";
import { stepEngineState } from "@game-core/impl/step";
import { createGameTrace } from "@game-core/impl/trace";
import type { EngineLevelSeed } from "@game-core/api/model";
import type { GameCommand, GameSnapshot, GameTrace } from "@game-core/api/types";
import type { SolutionMove } from "@content/api/solution-file";

export interface CanonicalTraceRunOptions {
  scheduledInputs: GameCommand[];
  maxTicks: number;
  stepSnapshots: GameSnapshot[];
  replayPlan?: ReplayPlan;
}

export interface CanonicalTraceRunResult {
  trace: GameTrace;
  recordedMoves: SolutionMove[];
  replayPlan?: ReplayPlan;
}

export function runCanonicalTrace(seed: EngineLevelSeed, options: CanonicalTraceRunOptions): CanonicalTraceRunResult {
  const initialState = initializeEngineState(seed);
  const initialSnapshot = engineStateToSnapshot(initialState, "initial", createRuntimeCommand(0, -1));
  let state = initialState;
  let previousInput = createRuntimeCommand(0, -1);
  let replayPlan = options.replayPlan;
  let recordedMoves: SolutionMove[] = [];

  const steps: GameSnapshot[] = [];
  const stepLimit = Math.min(options.maxTicks, options.stepSnapshots.length);

  for (let stepIndex = 0; stepIndex < stepLimit; stepIndex += 1) {
    const tick = state.timer.currentTime + 1;
    let input = createRuntimeCommand(0, tick);

    if (replayPlan) {
      const replayTick = plannedReplayInput(replayPlan, tick);
      input = replayTick.input;
      replayPlan = replayTick.plan;
    } else {
      input = resolveManualInput(previousInput, scheduledInputForTick(options.scheduledInputs, tick));
      previousInput = input;
    }

    const transition = stepEngineState({
      current: state,
      input,
      nextSnapshot: options.stepSnapshots[stepIndex]!,
    });

    state = transition.state;
    recordedMoves = recordManualMove(recordedMoves, state.timer.currentTime, state.replay.cursor, input.inputCode);
    steps.push(engineStateToSnapshot(state, "tick", input));

    if (state.status !== "playing") {
      break;
    }
  }
  const lastStep = steps[steps.length - 1];

  return {
    trace: createGameTrace({
      request: { ...seed.request },
      scheduledInputs: options.scheduledInputs,
      initialState: initialSnapshot,
      steps,
      result: {
        status: lastStep?.status ?? state.status,
        finalTick: lastStep?.currentTime ?? state.timer.currentTime,
      },
    }),
    recordedMoves,
    replayPlan,
  };
}

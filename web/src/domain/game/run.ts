import { initializeEngineState } from "@domain/game/initialize";
import { createRuntimeCommand, plannedReplayInput, recordManualMove, resolveManualInput, scheduledInputForTick, type ReplayPlan } from "@domain/game/playback";
import { engineStateToSnapshot } from "@domain/game/snapshot";
import { stepEngineState } from "@domain/game/step";
import type { EngineLevelSeed } from "@domain/game/model";
import type { GameCommand, GameSnapshot, GameTrace } from "@domain/game/types";
import type { SolutionMove } from "@domain/solution-file";

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
    trace: {
      request: { ...seed.request },
      scheduledInputs: options.scheduledInputs.map((command) => ({ ...command })),
      initialState: initialSnapshot,
      steps,
      result: {
        status: lastStep?.status ?? state.status,
        finalTick: lastStep?.currentTime ?? state.timer.currentTime,
        stepCount: steps.length,
      },
    },
    recordedMoves,
    replayPlan,
  };
}

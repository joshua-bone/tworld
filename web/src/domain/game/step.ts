import { snapshotToEngineState } from "@domain/game/initialize";
import type { EngineState, EngineTransition } from "@domain/game/model";
import type { GameRuntimeCommand, GameSnapshot } from "@domain/game/types";

export interface EngineStepBoundary {
  readonly current: EngineState;
  readonly input: GameRuntimeCommand;
  readonly nextSnapshot: GameSnapshot;
}

export function stepEngineState(boundary: EngineStepBoundary): EngineTransition {
  return {
    input: {
      ...boundary.input,
    },
    state: snapshotToEngineState(boundary.current.request, boundary.nextSnapshot, boundary.current.map.cells),
  };
}

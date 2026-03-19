import { snapshotToEngineState } from "@game-core/impl/initialize";
import type { EngineState, EngineTransition } from "@game-core/api/model";
import type { GameRuntimeCommand, GameSnapshot } from "@game-core/api/types";

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

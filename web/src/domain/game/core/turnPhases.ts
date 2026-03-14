export const TURN_DEBUG_PHASE = {
  initial: "initial",
  final: "final",
  postInputLatch: "post-input-latch",
  postInitialHousekeeping: "post-initial-housekeeping",
  postCreatureIntent: "post-creature-intent",
  postCreatureMovement: "post-creature-movement",
  postChipFloorMovement: "post-chip-floor-movement",
  postChipInput: "post-chip-input",
  postChipMovement: "post-chip-movement",
  postBlockFloorMovement: "post-block-floor-movement",
  postCloneRelease: "post-clone-release",
  postTeleportResolution: "post-teleport-resolution",
  postPutwallResolution: "post-putwall-resolution",
} as const;

export const TURN_PHASE = {
  initialHousekeeping: "initial-housekeeping",
  creatureIntent: "creature-intent",
  creatureMovement: "creature-movement",
  chipFloorMovement: "chip-floor-movement",
  creatureFloorMovement: "creature-floor-movement",
  chipInputResolution: "chip-input-resolution",
  timer: "timer",
  manualMovement: "manual-movement",
  chipMovement: "chip-movement",
  cloneRelease: "clone-release",
  postMoveResolution: "post-move-resolution",
  finalize: "finalize",
} as const;

export type TurnPhaseName = (typeof TURN_PHASE)[keyof typeof TURN_PHASE];
export type TurnDebugPhaseName = (typeof TURN_DEBUG_PHASE)[keyof typeof TURN_DEBUG_PHASE];

export const MS_TURN_PHASE_SEQUENCE: readonly TurnPhaseName[] = [
  TURN_PHASE.initialHousekeeping,
  TURN_PHASE.creatureMovement,
  TURN_PHASE.chipFloorMovement,
  TURN_PHASE.creatureFloorMovement,
  TURN_PHASE.chipInputResolution,
  TURN_PHASE.timer,
  TURN_PHASE.manualMovement,
  TURN_PHASE.cloneRelease,
];

export const LYNX_TURN_PHASE_SEQUENCE: readonly TurnPhaseName[] = [
  TURN_PHASE.initialHousekeeping,
  TURN_PHASE.creatureIntent,
  TURN_PHASE.creatureMovement,
  TURN_PHASE.chipMovement,
  TURN_PHASE.postMoveResolution,
  TURN_PHASE.finalize,
];

export const MS_TURN_DEBUG_PHASE_SEQUENCE: readonly TurnDebugPhaseName[] = [
  TURN_DEBUG_PHASE.initial,
  TURN_DEBUG_PHASE.postInputLatch,
  TURN_DEBUG_PHASE.postInitialHousekeeping,
  TURN_DEBUG_PHASE.postCreatureMovement,
  TURN_DEBUG_PHASE.postChipFloorMovement,
  TURN_DEBUG_PHASE.postChipInput,
  TURN_DEBUG_PHASE.postChipMovement,
  TURN_DEBUG_PHASE.postBlockFloorMovement,
  TURN_DEBUG_PHASE.postCloneRelease,
  TURN_DEBUG_PHASE.final,
];

export const LYNX_TURN_DEBUG_PHASE_SEQUENCE: readonly TurnDebugPhaseName[] = [
  TURN_DEBUG_PHASE.initial,
  TURN_DEBUG_PHASE.postInputLatch,
  TURN_DEBUG_PHASE.postInitialHousekeeping,
  TURN_DEBUG_PHASE.postCreatureIntent,
  TURN_DEBUG_PHASE.postCreatureMovement,
  TURN_DEBUG_PHASE.postTeleportResolution,
  TURN_DEBUG_PHASE.postPutwallResolution,
  TURN_DEBUG_PHASE.final,
];

export interface TurnPhaseHandler<TResult> {
  readonly name: TurnPhaseName;
  run: () => TResult | null | undefined;
}

export function recordTurnDebugPhase<TSnapshot>(
  phases: TSnapshot[],
  phase: TurnDebugPhaseName,
  project: (phase: TurnDebugPhaseName) => TSnapshot,
): void {
  phases.push(project(phase));
}

export function runTurnPhaseHandlers<TResult>(handlers: readonly TurnPhaseHandler<TResult>[]): TResult | null {
  for (const handler of handlers) {
    const result = handler.run();
    if (result !== null && result !== undefined) {
      return result;
    }
  }
  return null;
}

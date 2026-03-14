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

export type TurnDebugPhaseName = (typeof TURN_DEBUG_PHASE)[keyof typeof TURN_DEBUG_PHASE];

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

export function recordTurnDebugPhase<TSnapshot>(
  phases: TSnapshot[],
  phase: TurnDebugPhaseName,
  project: (phase: TurnDebugPhaseName) => TSnapshot,
): void {
  phases.push(project(phase));
}

import { describe, expect, it } from "vitest";
import {
  createArrayTurnDebugPhaseRecorder,
  LYNX_TURN_PHASE_SEQUENCE,
  LYNX_TURN_DEBUG_PHASE_SEQUENCE,
  MS_TURN_PHASE_SEQUENCE,
  MS_TURN_DEBUG_PHASE_SEQUENCE,
  TURN_PHASE,
  TURN_DEBUG_PHASE,
  recordTurnDebugPhase,
  runTurnPhaseHandlers,
} from "@game-core/api/turnPhases";

describe("turn debug phases", () => {
  it("defines canonical MS and Lynx turn phase sequences", () => {
    expect(MS_TURN_PHASE_SEQUENCE).toEqual([
      TURN_PHASE.initialHousekeeping,
      TURN_PHASE.creatureMovement,
      TURN_PHASE.chipFloorMovement,
      TURN_PHASE.creatureFloorMovement,
      TURN_PHASE.chipInputResolution,
      TURN_PHASE.timer,
      TURN_PHASE.manualMovement,
      TURN_PHASE.cloneRelease,
    ]);
    expect(LYNX_TURN_PHASE_SEQUENCE).toEqual([
      TURN_PHASE.initialHousekeeping,
      TURN_PHASE.creatureIntent,
      TURN_PHASE.creatureMovement,
      TURN_PHASE.chipMovement,
      TURN_PHASE.postMoveResolution,
      TURN_PHASE.finalize,
    ]);
  });

  it("defines canonical MS and Lynx phase sequences", () => {
    expect(MS_TURN_DEBUG_PHASE_SEQUENCE).toEqual([
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
    ]);
    expect(LYNX_TURN_DEBUG_PHASE_SEQUENCE).toEqual([
      TURN_DEBUG_PHASE.initial,
      TURN_DEBUG_PHASE.postInputLatch,
      TURN_DEBUG_PHASE.postInitialHousekeeping,
      TURN_DEBUG_PHASE.postCreatureIntent,
      TURN_DEBUG_PHASE.postCreatureMovement,
      TURN_DEBUG_PHASE.postTeleportResolution,
      TURN_DEBUG_PHASE.postPutwallResolution,
      TURN_DEBUG_PHASE.final,
    ]);
  });

  it("records projected debug phases in order", () => {
    const phases: string[] = [];
    const recorder = createArrayTurnDebugPhaseRecorder(phases);

    recordTurnDebugPhase(recorder, TURN_DEBUG_PHASE.postInputLatch, (phase) => `phase:${phase}`);
    recordTurnDebugPhase(recorder, TURN_DEBUG_PHASE.final, (phase) => `phase:${phase}`);

    expect(phases).toEqual(["phase:post-input-latch", "phase:final"]);
  });

  it("runs turn phase handlers in order until one returns a result", () => {
    const phases: string[] = [];

    const result = runTurnPhaseHandlers<number>([
      {
        name: TURN_PHASE.initialHousekeeping,
        run: () => {
          phases.push(TURN_PHASE.initialHousekeeping);
          return null;
        },
      },
      {
        name: TURN_PHASE.creatureMovement,
        run: () => {
          phases.push(TURN_PHASE.creatureMovement);
          return 7;
        },
      },
      {
        name: TURN_PHASE.finalize,
        run: () => {
          phases.push(TURN_PHASE.finalize);
          return 9;
        },
      },
    ]);

    expect(result).toBe(7);
    expect(phases).toEqual([TURN_PHASE.initialHousekeeping, TURN_PHASE.creatureMovement]);
  });
});

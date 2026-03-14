import { describe, expect, it } from "vitest";
import {
  LYNX_TURN_DEBUG_PHASE_SEQUENCE,
  MS_TURN_DEBUG_PHASE_SEQUENCE,
  TURN_DEBUG_PHASE,
  recordTurnDebugPhase,
} from "@domain/game/core/turnPhases";

describe("turn debug phases", () => {
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

    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.postInputLatch, (phase) => `phase:${phase}`);
    recordTurnDebugPhase(phases, TURN_DEBUG_PHASE.final, (phase) => `phase:${phase}`);

    expect(phases).toEqual(["phase:post-input-latch", "phase:final"]);
  });
});

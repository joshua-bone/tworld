import { describe, expect, it } from "vitest";
import { applyLynxHeldButtonReplayConsumption } from "@ruleset-lynx/impl/turnState";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";

describe("lynx turnState", () => {
  it("queues deferred replay input after a held-brown-button trap release in replay mode", () => {
    const update = applyLynxHeldButtonReplayConsumption(
      {
        replayMode: true,
        currentInputCode: MS_DIRECTION.east,
        queuedReplayInputCode: 0,
        queuedChipInputCode: 0,
        recordedReplayInputCode: 0,
      },
      {
        chipPos: 10,
        chipDir: MS_DIRECTION.east,
        chipMoving: 0,
        endGameTicksElapsed: null,
        endGameResult: null,
        endGameAnimationTileId: null,
        endGameAnimationFrame: null,
        consumedReplayInput: true,
        deferredChipInputCode: MS_DIRECTION.north,
        chipArrivedOnTrapThisTick: true,
      },
    );

    expect(update).toEqual({
      replayMode: true,
      currentInputCode: 0,
      queuedReplayInputCode: MS_DIRECTION.east,
      queuedChipInputCode: MS_DIRECTION.north,
      recordedReplayInputCode: 0,
      consumedLastMoveCode: MS_DIRECTION.east,
    });
  });

  it("records consumed held-button input directly in interactive mode", () => {
    const update = applyLynxHeldButtonReplayConsumption(
      {
        replayMode: false,
        currentInputCode: MS_DIRECTION.south,
        queuedReplayInputCode: 0,
        queuedChipInputCode: 0,
        recordedReplayInputCode: 0,
      },
      {
        chipPos: 10,
        chipDir: MS_DIRECTION.south,
        chipMoving: 0,
        endGameTicksElapsed: null,
        endGameResult: null,
        endGameAnimationTileId: null,
        endGameAnimationFrame: null,
        consumedReplayInput: true,
        deferredChipInputCode: 0,
        chipArrivedOnTrapThisTick: false,
      },
    );

    expect(update.recordedReplayInputCode).toBe(MS_DIRECTION.south);
    expect(update.currentInputCode).toBe(MS_DIRECTION.south);
    expect(update.consumedLastMoveCode).toBeNull();
  });
});

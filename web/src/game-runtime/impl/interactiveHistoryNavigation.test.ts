import { describe, expect, it } from "vitest";
import { previousInteractiveGameSessionExponentialCheckpointTick } from "@game-runtime/impl/interactiveHistoryNavigation";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";

function makeSession(currentTick: number, latestTick = 400, initialTick = -1): InteractiveGameSession {
  return {
    history: {
      enabled: true,
      initialTick,
      currentTick,
      latestTick,
      checkpointTicks: [initialTick, 20, 40, 80, 160, 320, latestTick],
      previousTick: currentTick > initialTick ? currentTick - 1 : null,
      previousCheckpointTick: currentTick > initialTick ? currentTick - 20 : null,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
  } as InteractiveGameSession;
}

describe("previousInteractiveGameSessionExponentialCheckpointTick", () => {
  it("targets 1, 2, 4, 8 second ages from the live edge", () => {
    expect(previousInteractiveGameSessionExponentialCheckpointTick(makeSession(400), 20)).toBe(380);
    expect(previousInteractiveGameSessionExponentialCheckpointTick(makeSession(380), 20)).toBe(360);
    expect(previousInteractiveGameSessionExponentialCheckpointTick(makeSession(360), 20)).toBe(320);
    expect(previousInteractiveGameSessionExponentialCheckpointTick(makeSession(320), 20)).toBe(240);
  });

  it("clamps to the initial tick when history is shorter than the next checkpoint age", () => {
    expect(previousInteractiveGameSessionExponentialCheckpointTick(makeSession(20, 100, -1), 20)).toBe(-1);
    expect(previousInteractiveGameSessionExponentialCheckpointTick(makeSession(-1, 100, -1), 20)).toBeNull();
  });
});

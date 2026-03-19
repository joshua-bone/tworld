import { describe, expect, it } from "vitest";
import { previousInteractiveGameSessionCheckpointTick, previousInteractiveGameSessionTick } from "@game-runtime/impl/interactiveHistoryNavigation";
import { resumeInteractiveGameSession } from "@game-runtime/impl/resumeInteractiveGameSession";
import { restoreInteractiveGameSession } from "@game-runtime/impl/restoreInteractiveGameSession";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";

async function advanceMany<TSession extends InteractiveGameSession>(
  session: TSession,
  advance: (current: TSession) => Promise<TSession>,
  count: number,
): Promise<TSession> {
  let current = session;
  for (let index = 0; index < count; index += 1) {
    current = await advance(current);
  }
  return current;
}

describe("restoreInteractiveGameSession", () => {
  it("restores MS sessions to prior ticks and pauses there", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const started = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const session = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 9);

    expect(session.history.currentTick).toBe(8);
    expect(session.history.latestTick).toBe(8);
    expect(session.history.checkpointTicks).toEqual([-1, 7]);
    expect(previousInteractiveGameSessionTick(session)).toBe(7);
    expect(previousInteractiveGameSessionCheckpointTick(session)).toBe(7);

    const restored = await restoreInteractiveGameSession(adapter, session, 7);

    expect(restored.frame.snapshot.tick).toBe(7);
    expect(restored.run.undoUsedCount).toBe(1);
    expect(restored.history).toMatchObject({
      currentTick: 7,
      latestTick: 8,
      checkpointTicks: [-1, 7],
      timelineId: "main",
      timelineCount: 1,
      previousTick: 6,
      previousCheckpointTick: -1,
      restoreMode: "restored-paused",
      restoredFromTick: 7,
      replayTargetTick: null,
    });

    const stillPaused = await adapter.advanceSession(restored, "none");
    expect(stillPaused.history).toMatchObject({
      currentTick: 7,
      latestTick: 8,
      restoreMode: "restored-paused",
      restoredFromTick: 7,
      replayTargetTick: null,
    });

    const resumed = await resumeInteractiveGameSession(adapter, restored);
    expect(resumed.history).toMatchObject({
      currentTick: 7,
      latestTick: 8,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "replaying-history",
      restoredFromTick: 7,
      replayTargetTick: 8,
    });

    const replayed = await adapter.advanceSession(resumed, "none");
    expect(replayed.history).toMatchObject({
      currentTick: 8,
      latestTick: 8,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });
  });

  it("resets MS undo usage after rewinding all the way back to the starting tick", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const started = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const session = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 9);

    const rewound = await restoreInteractiveGameSession(adapter, session, 7);
    expect(rewound.run.undoUsedCount).toBe(1);

    const backToStart = await restoreInteractiveGameSession(adapter, rewound, -1);
    expect(backToStart.run.undoUsedCount).toBe(0);
    expect(backToStart.history).toMatchObject({
      currentTick: -1,
      latestTick: 8,
      restoreMode: "restored-paused",
      restoredFromTick: -1,
    });
  });

  it("restores Lynx sessions to prior ticks and pauses there", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const started = await adapter.startSession({
      seriesFile: "intro-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });
    const session = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 9);

    expect(session.history.currentTick).toBe(8);
    expect(session.history.latestTick).toBe(8);
    expect(session.history.checkpointTicks).toEqual([-1, 7]);
    expect(previousInteractiveGameSessionTick(session)).toBe(7);
    expect(previousInteractiveGameSessionCheckpointTick(session)).toBe(7);

    const restored = await restoreInteractiveGameSession(adapter, session, 7);

    expect(restored.frame.snapshot.tick).toBe(7);
    expect(restored.run.undoUsedCount).toBe(1);
    expect(restored.history).toMatchObject({
      currentTick: 7,
      latestTick: 8,
      checkpointTicks: [-1, 7],
      timelineId: "main",
      timelineCount: 1,
      previousTick: 6,
      previousCheckpointTick: -1,
      restoreMode: "restored-paused",
      restoredFromTick: 7,
      replayTargetTick: null,
    });

    const stillPaused = await adapter.advanceSession(restored, "none");
    expect(stillPaused.history).toMatchObject({
      currentTick: 7,
      latestTick: 8,
      restoreMode: "restored-paused",
      restoredFromTick: 7,
      replayTargetTick: null,
    });

    const resumed = await resumeInteractiveGameSession(adapter, restored);
    expect(resumed.history).toMatchObject({
      currentTick: 7,
      latestTick: 8,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "replaying-history",
      restoredFromTick: 7,
      replayTargetTick: 8,
    });

    const replayed = await adapter.advanceSession(resumed, "none");
    expect(replayed.history).toMatchObject({
      currentTick: 8,
      latestTick: 8,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });
  });

  it("resets Lynx undo usage after rewinding all the way back to the starting tick", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const started = await adapter.startSession({
      seriesFile: "intro-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });
    const session = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 9);

    const rewound = await restoreInteractiveGameSession(adapter, session, 7);
    expect(rewound.run.undoUsedCount).toBe(1);

    const backToStart = await restoreInteractiveGameSession(adapter, rewound, -1);
    expect(backToStart.run.undoUsedCount).toBe(0);
    expect(backToStart.history).toMatchObject({
      currentTick: -1,
      latestTick: 8,
      restoreMode: "restored-paused",
      restoredFromTick: -1,
    });
  });

  it("forks a new MS timeline on first live input after restore", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const started = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });
    const session = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 9);
    const restored = await restoreInteractiveGameSession(adapter, session, 6);

    const takenOver = await adapter.advanceSession(restored, "east");

    expect(takenOver.history).toMatchObject({
      currentTick: 7,
      latestTick: 7,
      timelineId: "timeline-1",
      timelineCount: 2,
      previousTick: 6,
      previousCheckpointTick: 6,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });

    const backToStart = await restoreInteractiveGameSession(adapter, takenOver, -1);
    expect(backToStart.history).toMatchObject({
      currentTick: -1,
      latestTick: 7,
      timelineId: "timeline-1",
      timelineCount: 2,
      previousTick: null,
      previousCheckpointTick: null,
      restoreMode: "restored-paused",
      restoredFromTick: -1,
      replayTargetTick: null,
    });
  });

  it("forks a new Lynx timeline on first live input during historical replay", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const started = await adapter.startSession({
      seriesFile: "intro-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });
    const session = await advanceMany(started, (current) => adapter.advanceSession(current, "none"), 9);
    const restored = await restoreInteractiveGameSession(adapter, session, 6);
    const resumed = await resumeInteractiveGameSession(adapter, restored);

    const takenOver = await adapter.advanceSession(resumed, "east");

    expect(takenOver.history).toMatchObject({
      currentTick: 7,
      latestTick: 7,
      timelineId: "timeline-1",
      timelineCount: 2,
      previousTick: 6,
      previousCheckpointTick: 6,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });

    const backToStart = await restoreInteractiveGameSession(adapter, takenOver, -1);
    expect(backToStart.history).toMatchObject({
      currentTick: -1,
      latestTick: 7,
      timelineId: "timeline-1",
      timelineCount: 2,
      previousTick: null,
      previousCheckpointTick: null,
      restoreMode: "restored-paused",
      restoredFromTick: -1,
      replayTargetTick: null,
    });
  });
});

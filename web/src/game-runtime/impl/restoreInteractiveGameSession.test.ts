import { describe, expect, it } from "vitest";
import { previousInteractiveGameSessionCheckpointTick, previousInteractiveGameSessionTick } from "@game-runtime/impl/interactiveHistoryNavigation";
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
    expect(restored.history).toMatchObject({
      currentTick: 7,
      latestTick: 7,
      checkpointTicks: [-1, 7],
      previousTick: 6,
      previousCheckpointTick: -1,
      restoreMode: "restored-paused",
      restoredFromTick: 7,
    });

    const resumed = await adapter.advanceSession(restored, "none");
    expect(resumed.history).toMatchObject({
      currentTick: 8,
      latestTick: 8,
      restoreMode: "live",
      restoredFromTick: null,
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
    expect(restored.history).toMatchObject({
      currentTick: 7,
      latestTick: 7,
      checkpointTicks: [-1, 7],
      previousTick: 6,
      previousCheckpointTick: -1,
      restoreMode: "restored-paused",
      restoredFromTick: 7,
    });

    const resumed = await adapter.advanceSession(restored, "none");
    expect(resumed.history).toMatchObject({
      currentTick: 8,
      latestTick: 8,
      restoreMode: "live",
      restoredFromTick: null,
    });
  });
});

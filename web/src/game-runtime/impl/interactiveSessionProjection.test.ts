import { describe, expect, it } from "vitest";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { NodeLevelRepository } from "@level-catalog/impl/NodeLevelRepository";

describe("interactive session projection", () => {
  it("projects MS sessions without exposing render overlays", async () => {
    const adapter = new MsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    expect(session.frame.cells).toHaveLength(32 * 32);
    expect(session.frame.render).toBeNull();
    expect(session.history).toMatchObject({
      initialTick: -1,
      currentTick: -1,
      latestTick: -1,
      checkpointTicks: [-1],
      previousTick: null,
      previousCheckpointTick: null,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });
    expect(session.handle).toBeTruthy();
  });

  it("projects Lynx sessions with render overlays on the frame", async () => {
    const adapter = new LynxGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession({
      seriesFile: "intro-lynx.dac",
      levelNumber: 1,
      ruleset: "Lynx",
      randomSeed: 123456789,
    });

    expect(session.frame.cells).toHaveLength(32 * 32);
    expect(session.frame.render?.chip).toMatchObject({
      hidden: false,
      failed: false,
    });
    expect(Array.isArray(session.frame.render?.actors)).toBe(true);
    expect(session.history.currentTick).toBe(-1);

    const next = await adapter.advanceSession(session, "none");
    expect(next.frame.render?.chip?.pos).toBe(session.frame.render?.chip?.pos);
    expect(next.history).toMatchObject({
      currentTick: 0,
      latestTick: 0,
      timelineId: "main",
      timelineCount: 1,
      previousTick: -1,
      previousCheckpointTick: -1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    });
    expect(next.handle).toBeTruthy();
  });
});

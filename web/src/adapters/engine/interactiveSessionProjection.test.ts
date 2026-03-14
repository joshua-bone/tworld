import { describe, expect, it } from "vitest";
import { TsLynxGameEngineAdapter } from "@adapters/engine/TsLynxGameEngineAdapter";
import { TsMsGameEngineAdapter } from "@adapters/engine/TsMsGameEngineAdapter";
import { NodeLevelRepository } from "@adapters/levels/NodeLevelRepository";

describe("interactive session projection", () => {
  it("projects MS sessions without exposing render overlays", async () => {
    const adapter = new TsMsGameEngineAdapter(new NodeLevelRepository());
    const session = await adapter.startSession({
      seriesFile: "intro-ms.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 123456789,
    });

    expect(session.frame.cells).toHaveLength(32 * 32);
    expect(session.frame.render).toBeNull();
    expect(session.handle).toBeTruthy();
  });

  it("projects Lynx sessions with render overlays on the frame", async () => {
    const adapter = new TsLynxGameEngineAdapter(new NodeLevelRepository());
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

    const next = await adapter.advanceSession(session, "none");
    expect(next.frame.render?.chip?.pos).toBe(session.frame.render?.chip?.pos);
    expect(next.handle).toBeTruthy();
  });
});

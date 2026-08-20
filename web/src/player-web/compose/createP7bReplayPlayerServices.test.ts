import type { GameRequest } from "@game-core/api/types";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import { createP7bReplayPlayerServices } from "@player-web/compose/createP7bReplayPlayerServices";
import { describe, expect, it, vi } from "vitest";

const request = {
  seriesFile: "CCLP1.dac",
  levelNumber: 1,
  ruleset: "MS",
} satisfies GameRequest;

describe("createP7bReplayPlayerServices", () => {
  it("composes direct MS and Lynx adapters and deduplicates concurrent level preloads", async () => {
    let finishLoad: (() => void) | undefined;
    const loadLevel = vi.spyOn(BrowserLevelRepository.prototype, "loadLevel")
      .mockImplementation(async (loadedRequest) => {
        await new Promise<void>((resolveLoad) => {
          finishLoad = resolveLoad;
        });
        return {
          request: { ...loadedRequest },
          levelData: new Uint8Array(),
          layerData: [],
        };
      });
    const services = createP7bReplayPlayerServices();

    expect(services.engines.MS).toBeInstanceOf(MsGameEngineAdapter);
    expect(services.engines.Lynx).toBeInstanceOf(LynxGameEngineAdapter);
    const first = services.preloadGameRequest(request);
    const second = services.preloadGameRequest({ ...request });
    await vi.waitFor(() => expect(loadLevel).toHaveBeenCalledTimes(1));
    finishLoad?.();
    await Promise.all([first, second]);

    expect(loadLevel).toHaveBeenCalledWith(request);
  });
});

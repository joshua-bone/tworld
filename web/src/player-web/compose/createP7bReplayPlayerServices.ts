import type { GameRequest } from "@game-core/api/types";
import { LynxGameEngineAdapter } from "@game-runtime/impl/LynxGameEngineAdapter";
import { MsGameEngineAdapter } from "@game-runtime/impl/MsGameEngineAdapter";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export type P7bReplayPlayerServices = Pick<BrowserAppServices, "engines" | "preloadGameRequest"> & {
  readonly preloadGameRequest: NonNullable<BrowserAppServices["preloadGameRequest"]>;
};

function requestKey(request: Pick<GameRequest, "seriesFile" | "levelNumber" | "ruleset">): string {
  return `${request.seriesFile}:${request.levelNumber}:${request.ruleset}`;
}

/**
 * Composes the checked P7 replay player without the normal app's gameplay worker.
 * P7 playback is intentionally part of the manifest-reachable shared player graph,
 * so every runtime dependency must remain visible to that graph.
 */
export function createP7bReplayPlayerServices(): P7bReplayPlayerServices {
  const levelRepository = new BrowserLevelRepository();
  const preloadPromises = new Map<string, Promise<void>>();

  const preloadGameRequest = async (request: GameRequest): Promise<void> => {
    const key = requestKey(request);
    const cached = preloadPromises.get(key);
    if (cached) {
      await cached;
      return;
    }

    const preloadPromise = levelRepository.loadLevel(request).then(() => undefined);
    preloadPromises.set(key, preloadPromise);
    try {
      await preloadPromise;
    } finally {
      if (preloadPromises.get(key) === preloadPromise) preloadPromises.delete(key);
    }
  };

  return {
    engines: {
      MS: new MsGameEngineAdapter(levelRepository),
      Lynx: new LynxGameEngineAdapter(levelRepository),
    },
    preloadGameRequest,
  };
}

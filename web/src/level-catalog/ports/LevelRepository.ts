import type { GameRequest } from "@game-core/api/types";

export interface LoadedLevelData {
  request: GameRequest;
  levelData: Uint8Array;
}

export interface LevelRepository {
  loadLevel(request: GameRequest): Promise<LoadedLevelData>;
}

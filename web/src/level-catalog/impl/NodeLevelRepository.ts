import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractDatLevels, parseSeriesConfig } from "@content/api/series-file";
import type { LevelRepository, LoadedLevelData } from "@level-catalog/ports/LevelRepository";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(currentDir, "../../../../");

export class NodeLevelRepository implements LevelRepository {
  constructor(private readonly repoRoot = defaultRepoRoot) {}

  async loadLevel(request: LoadedLevelData["request"]): Promise<LoadedLevelData> {
    const seriesPath = resolve(this.repoRoot, "sets", request.seriesFile);
    const config = parseSeriesConfig(await readFile(seriesPath, "utf-8"));
    const dataPath = resolve(this.repoRoot, "data", config.mapFile);
    const datFile = new Uint8Array(await readFile(dataPath));
    const extracted = extractDatLevels(datFile);
    const level = extracted.levels.find((candidate) => candidate.number === request.levelNumber);

    if (!level) {
      throw new Error(`level ${request.levelNumber} not found in ${request.seriesFile}`);
    }

    return {
      request: { ...request },
      levelData: level.levelData,
    };
  }
}

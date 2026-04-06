import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractIndexedGroupedDatLevel,
  indexGroupedDatLevels,
  parseSeriesConfig,
  type IndexedDatLevelGroup,
  type SeriesConfig,
} from "@content/api/series-file";
import type { LevelRepository, LoadedLevelData } from "@level-catalog/ports/LevelRepository";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(currentDir, "../../../../");

type GroupedLevelIndex = Map<number, IndexedDatLevelGroup>;

export class NodeLevelRepository implements LevelRepository {
  constructor(private readonly repoRoot = defaultRepoRoot) {}

  private readonly parsedConfigCache = new Map<string, Promise<SeriesConfig>>();
  private readonly dataCache = new Map<string, Promise<Uint8Array>>();
  private readonly groupedLevelCache = new Map<string, Promise<GroupedLevelIndex>>();

  private loadParsedSeriesConfig(seriesFile: string): Promise<SeriesConfig> {
    const cached = this.parsedConfigCache.get(seriesFile);
    if (cached) {
      return cached;
    }

    const seriesPath = resolve(this.repoRoot, "sets", seriesFile);
    const promise = readFile(seriesPath, "utf-8").then((configText) => parseSeriesConfig(configText));
    this.parsedConfigCache.set(seriesFile, promise);
    return promise;
  }

  private loadGroupedLevels(datFile: string): Promise<GroupedLevelIndex> {
    const cached = this.groupedLevelCache.get(datFile);
    if (cached) {
      return cached;
    }

    const promise = this.loadDataFile(datFile)
      .then((datBytes) =>
        new Map(indexGroupedDatLevels(datBytes).levels.map((level) => [level.number, level] satisfies [number, IndexedDatLevelGroup])),
      );
    this.groupedLevelCache.set(datFile, promise);
    return promise;
  }

  private loadDataFile(datFile: string): Promise<Uint8Array> {
    const cached = this.dataCache.get(datFile);
    if (cached) {
      return cached;
    }

    const dataPath = resolve(this.repoRoot, "data", datFile);
    const promise = readFile(dataPath).then((bytes) => new Uint8Array(bytes));
    this.dataCache.set(datFile, promise);
    return promise;
  }

  async loadLevel(request: LoadedLevelData["request"]): Promise<LoadedLevelData> {
    const config = await this.loadParsedSeriesConfig(request.seriesFile);
    const [datBytes, levels] = await Promise.all([this.loadDataFile(config.mapFile), this.loadGroupedLevels(config.mapFile)]);
    const indexedLevel = levels.get(request.levelNumber);

    if (!indexedLevel) {
      throw new Error(`level ${request.levelNumber} not found in ${request.seriesFile}`);
    }

    const level = extractIndexedGroupedDatLevel(datBytes, indexedLevel);

    return {
      request: { ...request },
      levelData: level.levelData,
      layerData: level.layerData.map((entry) => new Uint8Array(entry)),
    };
  }
}

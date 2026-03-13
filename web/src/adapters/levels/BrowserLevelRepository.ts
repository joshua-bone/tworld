import { extractDatLevels, parseSeriesConfig } from "@domain/series-file";
import type { LevelRepository, LoadedLevelData } from "@application/ports/LevelRepository";

export class BrowserLevelRepository implements LevelRepository {
  private readonly seriesConfigs = import.meta.glob("../../../../sets/*.dac", {
    import: "default",
    query: "?raw",
  }) as Record<string, () => Promise<string>>;

  private readonly dataFiles = import.meta.glob(["../../../../data/*.dat", "../../../../data/*.ccx", "!../../../../data/CHIPS.dat"], {
    import: "default",
    query: "?url",
  }) as Record<string, () => Promise<string>>;

  private readonly configCache = new Map<string, Promise<string>>();
  private readonly dataCache = new Map<string, Promise<Uint8Array>>();

  private async loadBySuffix<T>(files: Record<string, () => Promise<T>>, suffix: string): Promise<T> {
    const match = Object.entries(files).find(([path]) => path.endsWith(suffix));
    if (!match) {
      throw new Error(`browser asset not found: ${suffix}`);
    }
    return match[1]();
  }

  private loadSeriesConfig(seriesFile: string): Promise<string> {
    const cached = this.configCache.get(seriesFile);
    if (cached) {
      return cached;
    }

    const promise = this.loadBySuffix(this.seriesConfigs, `/sets/${seriesFile}`);
    this.configCache.set(seriesFile, promise);
    return promise;
  }

  private loadDataFile(filename: string): Promise<Uint8Array> {
    const cached = this.dataCache.get(filename);
    if (cached) {
      return cached;
    }

    const promise = this.loadBySuffix(this.dataFiles, `/data/${filename}`).then(async (url) => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`failed to fetch ${filename}: ${response.status}`);
      }
      return new Uint8Array(await response.arrayBuffer());
    });

    this.dataCache.set(filename, promise);
    return promise;
  }

  async loadLevel(request: LoadedLevelData["request"]): Promise<LoadedLevelData> {
    const config = parseSeriesConfig(await this.loadSeriesConfig(request.seriesFile));
    const datFile = await this.loadDataFile(config.mapFile);
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

import type { SeriesCatalogEntry } from "@content/api/series";
import { extractGroupedDatLevels, parseDatFile, parseSeriesConfig, type RawDatLevelGroup } from "@content/api/series-file";
import type { LevelRepository, LoadedLevelData } from "@level-catalog/ports/LevelRepository";

const IMPORT_RULESETS = ["MS", "Lynx"] as const;

interface ImportedDatSeries {
  filename: string;
  groupedLevels: RawDatLevelGroup[];
}

function importedSeriesFile(filename: string, ruleset: (typeof IMPORT_RULESETS)[number]): string {
  const baseName = filename.replace(/\.[^.]+$/u, "") || filename;
  return `${baseName} (${ruleset})`;
}

export class BrowserLevelRepository implements LevelRepository {
  private readonly seriesConfigs = import.meta.glob("@sets/*.dac", {
    import: "default",
    query: "?raw",
  }) as Record<string, () => Promise<string>>;

  private readonly dataFiles = import.meta.glob(["@data/*.dat", "@data/*.ccx", "!@data/CHIPS.dat"], {
    import: "default",
    query: "?url",
  }) as Record<string, () => Promise<string>>;

  private readonly configCache = new Map<string, Promise<string>>();
  private readonly dataCache = new Map<string, Promise<Uint8Array>>();
  private readonly importedSeries = new Map<string, ImportedDatSeries>();

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

  async importDatFile(file: File): Promise<SeriesCatalogEntry[]> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.importDatBytes(file.name, bytes);
  }

  importDatBytes(filename: string, datBytes: Uint8Array): SeriesCatalogEntry[] {
    const grouped = extractGroupedDatLevels(datBytes);

    return IMPORT_RULESETS.map((ruleset) => {
      const parsed = parseDatFile(datBytes, { ruleset });
      const seriesFile = importedSeriesFile(filename, ruleset);

      this.importedSeries.set(seriesFile, {
        filename,
        groupedLevels: grouped.levels.map((level) => ({
          ...level,
          levelData: new Uint8Array(level.levelData),
          layerData: level.layerData.map((entry) => new Uint8Array(entry)),
          layerNumbers: [...level.layerNumbers],
        })),
      });

      return {
        name: `${filename} (${ruleset})`,
        filebase: seriesFile,
        mapfilename: `local:${filename}`,
        ruleset,
        levels: parsed.levels,
      } satisfies SeriesCatalogEntry;
    });
  }

  async loadLevel(request: LoadedLevelData["request"]): Promise<LoadedLevelData> {
    const imported = this.importedSeries.get(request.seriesFile);
    if (imported) {
      const level = imported.groupedLevels.find((candidate) => candidate.number === request.levelNumber);
      if (!level) {
        throw new Error(`level ${request.levelNumber} not found in imported ${imported.filename}`);
      }

      return {
        request: { ...request },
        levelData: new Uint8Array(level.levelData),
        layerData: level.layerData.map((entry) => new Uint8Array(entry)),
      };
    }

    const config = parseSeriesConfig(await this.loadSeriesConfig(request.seriesFile));
    const datFile = await this.loadDataFile(config.mapFile);
    const extracted = extractGroupedDatLevels(datFile);
    const level = extracted.levels.find((candidate) => candidate.number === request.levelNumber);

    if (!level) {
      throw new Error(`level ${request.levelNumber} not found in ${request.seriesFile}`);
    }

    return {
      request: { ...request },
      levelData: level.levelData,
      layerData: level.layerData.map((entry) => new Uint8Array(entry)),
    };
  }
}

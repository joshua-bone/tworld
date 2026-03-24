import type { SeriesCatalogEntry } from "@content/api/series";
import {
  extractGroupedDatLevels,
  parseDatFile,
  parseSeriesConfig,
  type RawDatLevelGroup,
  type SeriesConfig,
} from "@content/api/series-file";
import type { LevelRepository, LoadedLevelData } from "@level-catalog/ports/LevelRepository";
import type { ImportedDatCatalogStore, PersistedImportedDatSource } from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  computeDatContentHash,
  importedSeriesFile,
  IMPORT_RULESETS,
} from "@player-web/impl/importedDatIdentity";
import { normalizeBrowserAssetLoadError } from "@level-catalog/impl/browserAssetLoadError";

type GroupedLevelIndex = Map<number, RawDatLevelGroup>;

interface ImportedDatSeries {
  filename: string;
  datHash: string;
  groupedLevels: RawDatLevelGroup[];
  entry: SeriesCatalogEntry;
  source?: PersistedImportedDatSource;
}

function cloneGroupedLevel(level: RawDatLevelGroup): RawDatLevelGroup {
  return {
    ...level,
    levelData: new Uint8Array(level.levelData),
    layerData: level.layerData.map((entry) => new Uint8Array(entry)),
    layerNumbers: [...level.layerNumbers],
  };
}

function createGroupedLevelIndex(levels: RawDatLevelGroup[]): GroupedLevelIndex {
  return new Map(levels.map((level) => [level.number, level] satisfies [number, RawDatLevelGroup]));
}

export class BrowserLevelRepository implements LevelRepository {
  constructor(private readonly importedDatStore: ImportedDatCatalogStore | null = null) {}

  private readonly seriesConfigs = import.meta.glob("@sets/*.dac", {
    import: "default",
    query: "?raw",
  }) as Record<string, () => Promise<string>>;

  private readonly dataFiles = import.meta.glob(["@data/*.dat", "@data/*.ccx", "!@data/CHIPS.dat"], {
    import: "default",
    query: "?url",
  }) as Record<string, () => Promise<string>>;

  private readonly configCache = new Map<string, Promise<string>>();
  private readonly parsedConfigCache = new Map<string, Promise<SeriesConfig>>();
  private readonly dataCache = new Map<string, Promise<Uint8Array>>();
  private readonly groupedLevelCache = new Map<string, Promise<GroupedLevelIndex>>();
  private readonly importedSeries = new Map<string, ImportedDatSeries>();
  private importedSeriesHydration: Promise<void> | null = null;

  private async loadBySuffix<T>(files: Record<string, () => Promise<T>>, suffix: string): Promise<T> {
    const match = Object.entries(files).find(([path]) => path.endsWith(suffix));
    if (!match) {
      throw new Error(`browser asset not found: ${suffix}`);
    }
    try {
      return await match[1]();
    } catch (error: unknown) {
      throw normalizeBrowserAssetLoadError(error, suffix);
    }
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

  private loadParsedSeriesConfig(seriesFile: string): Promise<SeriesConfig> {
    const cached = this.parsedConfigCache.get(seriesFile);
    if (cached) {
      return cached;
    }

    const promise = this.loadSeriesConfig(seriesFile).then((configText) => parseSeriesConfig(configText));
    this.parsedConfigCache.set(seriesFile, promise);
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

  private loadGroupedLevels(filename: string): Promise<GroupedLevelIndex> {
    const cached = this.groupedLevelCache.get(filename);
    if (cached) {
      return cached;
    }

    const promise = this.loadDataFile(filename).then((datBytes) => createGroupedLevelIndex(extractGroupedDatLevels(datBytes).levels));
    this.groupedLevelCache.set(filename, promise);
    return promise;
  }

  async importDatFile(file: File): Promise<SeriesCatalogEntry[]> {
    await this.ensureImportedSeriesHydrated();
    const bytes = new Uint8Array(await file.arrayBuffer());
    return this.importDatBytes(file.name, bytes);
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    await this.ensureImportedSeriesHydrated();

    for (const [seriesFile, imported] of this.importedSeries.entries()) {
      if (imported.filename === filename) {
        this.importedSeries.delete(seriesFile);
      }
    }

    await this.importedDatStore?.deleteImportedDatFile(filename);
  }

  private async ensureImportedSeriesHydrated(): Promise<void> {
    if (!this.importedDatStore) {
      return;
    }

    const cached = this.importedSeriesHydration;
    if (cached) {
      await cached;
      return;
    }

    const hydration = this.importedDatStore.listImportedDatFiles().then(async (entries) => {
      await Promise.all(
        entries.map(async (entry) => {
          await this.importDatBytes(entry.filename, entry.datBytes, entry.datHash, false, entry.source);
        }),
      );
    });

    this.importedSeriesHydration = hydration;
    await hydration;
  }

  async importDatBytes(
    filename: string,
    datBytes: Uint8Array,
    persistedDatHash?: string,
    persistStore = true,
    source?: PersistedImportedDatSource,
  ): Promise<SeriesCatalogEntry[]> {
    const grouped = extractGroupedDatLevels(datBytes);
    const datHash = persistedDatHash ?? (await computeDatContentHash(datBytes));

    for (const [seriesFile, imported] of this.importedSeries.entries()) {
      if (imported.filename === filename) {
        this.importedSeries.delete(seriesFile);
      }
    }

    const entries = IMPORT_RULESETS.map((ruleset) => {
      const parsed = parseDatFile(datBytes, { ruleset });
      const seriesFile = importedSeriesFile(filename, ruleset);
      const entry = {
        name: `${filename} (${ruleset})`,
        filebase: seriesFile,
        mapfilename: `local:${filename}`,
        ruleset,
        levels: parsed.levels,
      } satisfies SeriesCatalogEntry;

      this.importedSeries.set(seriesFile, {
        filename,
        datHash,
        groupedLevels: grouped.levels.map(cloneGroupedLevel),
        entry,
        source,
      });

      return entry;
    });

    if (persistStore) {
      await this.importedDatStore?.saveImportedDatFile({
        filename,
        datHash,
        datBytes: new Uint8Array(datBytes),
        source,
      });
    }

    return entries;
  }

  async listImportedCatalogEntries(): Promise<SeriesCatalogEntry[]> {
    await this.ensureImportedSeriesHydrated();
    return [...this.importedSeries.values()].map(({ entry }) => entry);
  }

  async loadLevel(request: LoadedLevelData["request"]): Promise<LoadedLevelData> {
    await this.ensureImportedSeriesHydrated();
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

    const config = await this.loadParsedSeriesConfig(request.seriesFile);
    const levels = await this.loadGroupedLevels(config.mapFile);
    const level = levels.get(request.levelNumber);

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

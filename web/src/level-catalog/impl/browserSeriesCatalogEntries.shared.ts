import { parseDatFile, parseSeriesConfig } from "@content/api/series-file";
import type { SeriesCatalogEntry } from "@content/api/series";
import { normalizeBrowserAssetLoadError } from "@level-catalog/impl/browserAssetLoadError";

export type BrowserSeriesLoaderMap<T> = Record<string, () => Promise<T>>;

export function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function listBrowserSeriesCatalogFilesFromLoaders(seriesConfigs: BrowserSeriesLoaderMap<string>): string[] {
  return Object.keys(seriesConfigs)
    .map((path) => basename(path))
    .sort((left, right) => left.localeCompare(right));
}

export async function loadBySuffix<T>(
  files: BrowserSeriesLoaderMap<T>,
  suffix: string,
): Promise<T | null> {
  const match = Object.entries(files).find(([path]) => path.endsWith(suffix));
  if (!match) {
    return null;
  }

  try {
    return await match[1]();
  } catch (error: unknown) {
    throw normalizeBrowserAssetLoadError(error, suffix);
  }
}

export async function loadBrowserSeriesCatalogEntriesFromLoaders(
  seriesConfigs: BrowserSeriesLoaderMap<string>,
  dataFiles: BrowserSeriesLoaderMap<string>,
  seriesFiles?: string[],
): Promise<SeriesCatalogEntry[]> {
  const targets = seriesFiles ?? listBrowserSeriesCatalogFilesFromLoaders(seriesConfigs);
  const catalog: SeriesCatalogEntry[] = [];

  for (const seriesFile of targets) {
    const configText = await loadBySuffix(seriesConfigs, `/sets/${seriesFile}`);
    if (!configText) {
      continue;
    }

    const config = parseSeriesConfig(configText);
    const dataUrl = await loadBySuffix(dataFiles, `/data/${config.mapFile}`);
    if (!dataUrl) {
      continue;
    }

    const response = await fetch(dataUrl);
    if (!response.ok) {
      continue;
    }

    const datBytes = new Uint8Array(await response.arrayBuffer());
    const parsed = parseDatFile(datBytes, { ruleset: config.ruleset });
    catalog.push({
      name: seriesFile,
      filebase: seriesFile,
      mapfilename: `./data/${config.mapFile}`,
      ruleset: parsed.ruleset,
      levels: parsed.levels,
    });
  }

  return catalog;
}

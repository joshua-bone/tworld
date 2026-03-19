import { parseDatFile, parseSeriesConfig } from "@content/api/series-file";
import type { SeriesCatalogEntry } from "@content/api/series";

const seriesConfigs = import.meta.glob("@sets/*.dac", {
  import: "default",
  query: "?raw",
}) as Record<string, () => Promise<string>>;

const dataFiles = import.meta.glob(["@data/*.dat", "!@data/CHIPS.dat"], {
  import: "default",
  query: "?url",
}) as Record<string, () => Promise<string>>;

function basename(path: string): string {
  const parts = path.split("/");
  return parts[parts.length - 1] ?? path;
}

export function listBrowserSeriesCatalogFiles(): string[] {
  return Object.keys(seriesConfigs)
    .map((path) => basename(path))
    .sort((left, right) => left.localeCompare(right));
}

async function loadBySuffix<T>(files: Record<string, () => Promise<T>>, suffix: string): Promise<T | null> {
  const match = Object.entries(files).find(([path]) => path.endsWith(suffix));
  return match ? match[1]() : null;
}

export async function loadBrowserSeriesCatalogEntries(seriesFiles?: string[]): Promise<SeriesCatalogEntry[]> {
  const targets = seriesFiles ?? listBrowserSeriesCatalogFiles();
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

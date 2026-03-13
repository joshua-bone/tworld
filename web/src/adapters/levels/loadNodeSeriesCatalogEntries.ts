import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseDatFile, parseSeriesConfig } from "@domain/series-file";
import type { SeriesCatalogEntry } from "@domain/series";

const currentDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(currentDir, "../../../../");

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function loadNodeSeriesCatalogEntries(
  seriesFiles: string[],
  repoRoot = defaultRepoRoot,
): Promise<SeriesCatalogEntry[]> {
  const catalog: SeriesCatalogEntry[] = [];

  for (const seriesFile of seriesFiles) {
    const seriesPath = resolve(repoRoot, "sets", seriesFile);
    if (!(await fileExists(seriesPath))) {
      continue;
    }

    const config = parseSeriesConfig(await readFile(seriesPath, "utf-8"));
    const dataPath = resolve(repoRoot, "data", config.mapFile);
    if (!(await fileExists(dataPath))) {
      continue;
    }

    const datBytes = new Uint8Array(await readFile(dataPath));
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

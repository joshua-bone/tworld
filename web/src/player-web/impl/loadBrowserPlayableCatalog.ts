import type { SeriesCatalogEntry } from "@content/api/series";
import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import {
  listBrowserSeriesCatalogFiles,
  loadBrowserSeriesCatalogEntries,
} from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

interface LoadBrowserPlayableCatalogOptions {
  includeImported?: boolean;
  seriesFiles?: string[];
}

export const DEFAULT_MODERN_BOOTSTRAP_SERIES_FILES = ["CCLP1-MS.dac", "CCLP1-Lynx.dac"] as const;

export function resolveModernBootstrapCatalogOptions(
  selection: PlayableSelection | null,
  availableBrowserSeriesFiles: readonly string[] = listBrowserSeriesCatalogFiles(),
): LoadBrowserPlayableCatalogOptions {
  if (!selection) {
    return {
      includeImported: false,
      seriesFiles: [...DEFAULT_MODERN_BOOTSTRAP_SERIES_FILES],
    };
  }

  if (availableBrowserSeriesFiles.includes(selection.seriesFile)) {
    return {
      includeImported: false,
      seriesFiles: [selection.seriesFile],
    };
  }

  return {
    includeImported: true,
    seriesFiles: [],
  };
}

export async function loadBrowserPlayableCatalog(
  services: Pick<BrowserAppServices, "fixtureRepository" | "listImportedCatalogEntries">,
  options: LoadBrowserPlayableCatalogOptions = {},
): Promise<SeriesCatalogEntry[]> {
  const { includeImported = true, seriesFiles } = options;
  const [browserEntries, importedEntries] = await Promise.all([
    loadBrowserSeriesCatalogEntries(seriesFiles),
    includeImported ? services.listImportedCatalogEntries() : Promise.resolve([]),
  ]);

  return loadSeriesCatalog(services.fixtureRepository, [...browserEntries, ...importedEntries]);
}

export async function loadModernBootstrapPlayableCatalog(
  services: Pick<BrowserAppServices, "fixtureRepository" | "listImportedCatalogEntries">,
  selection: PlayableSelection | null,
): Promise<SeriesCatalogEntry[]> {
  const bootstrapCatalog = await loadBrowserPlayableCatalog(
    services,
    resolveModernBootstrapCatalogOptions(selection),
  );

  if (selection && bootstrapCatalog.some((entry) => entry.filebase === selection.seriesFile)) {
    return bootstrapCatalog;
  }

  if (!selection) {
    return bootstrapCatalog;
  }

  return loadBrowserPlayableCatalog(services, {
    includeImported: false,
    seriesFiles: [...DEFAULT_MODERN_BOOTSTRAP_SERIES_FILES],
  });
}

import type { SeriesCatalogEntry } from "@content/api/series";
import {
  listBrowserSeriesCatalogFiles,
  loadBrowserSeriesCatalogEntries,
} from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import { listSetFamilyFilebasesForSeriesFile } from "@player-web/impl/modern/curatedCatalog";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

interface LoadBrowserPlayableCatalogOptions {
  includeImported?: boolean;
  seriesFiles?: string[];
}

export const DEFAULT_MODERN_BOOTSTRAP_SERIES_FILES = ["CCLP1-MS.dac", "CCLP1-Lynx.dac"] as const;
export const MODERN_DEFERRED_CATALOG_BATCH_SIZE = 1;

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
    const familySeriesFiles = listSetFamilyFilebasesForSeriesFile(selection.seriesFile)?.filter((seriesFile) =>
      availableBrowserSeriesFiles.includes(seriesFile),
    );

    return {
      includeImported: false,
      seriesFiles: familySeriesFiles && familySeriesFiles.length > 0 ? familySeriesFiles : [selection.seriesFile],
    };
  }

  return {
    includeImported: true,
    seriesFiles: [],
  };
}

export function resolveModernDeferredCatalogBatches(
  selection: PlayableSelection | null,
  availableBrowserSeriesFiles: readonly string[] = listBrowserSeriesCatalogFiles(),
  batchSize = MODERN_DEFERRED_CATALOG_BATCH_SIZE,
): string[][] {
  const bootstrapSeriesFiles = new Set(
    resolveModernBootstrapCatalogOptions(selection, availableBrowserSeriesFiles).seriesFiles ?? [],
  );
  const deferredSeriesFiles = availableBrowserSeriesFiles.filter((seriesFile) => !bootstrapSeriesFiles.has(seriesFile));
  const batches: string[][] = [];

  for (let index = 0; index < deferredSeriesFiles.length; index += batchSize) {
    batches.push(deferredSeriesFiles.slice(index, index + batchSize));
  }

  return batches;
}

export async function loadBrowserPlayableCatalog(
  services: Pick<BrowserAppServices, "listImportedCatalogEntries">,
  options: LoadBrowserPlayableCatalogOptions = {},
): Promise<SeriesCatalogEntry[]> {
  const { includeImported = true, seriesFiles } = options;
  const [browserEntries, importedEntries] = await Promise.all([
    loadBrowserSeriesCatalogEntries(seriesFiles),
    includeImported ? services.listImportedCatalogEntries() : Promise.resolve([]),
  ]);

  return mergeSeriesCatalogEntries(browserEntries, importedEntries);
}

export async function loadModernBootstrapPlayableCatalog(
  services: Pick<BrowserAppServices, "listImportedCatalogEntries">,
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

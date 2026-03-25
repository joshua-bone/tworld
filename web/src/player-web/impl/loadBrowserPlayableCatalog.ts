import type { SeriesCatalogEntry } from "@content/api/series";
import {
  listBrowserSeriesCatalogFiles,
  loadBrowserSeriesCatalogEntries,
} from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import {
  getSetFamilySeriesMetadata,
  listSetFamilyFilebasesForSeriesFile,
  type CuratedCatalogSection,
} from "@player-web/impl/modern/curatedCatalog";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

interface LoadBrowserPlayableCatalogOptions {
  includeImported?: boolean;
  seriesFiles?: string[];
}

export const DEFAULT_MODERN_BOOTSTRAP_SERIES_FILES = ["CCLP1-MS.dac", "CCLP1-Lynx.dac"] as const;
export const MODERN_DEFERRED_CATALOG_BATCH_SIZE = 1;

function deferredSectionRank(section: CuratedCatalogSection | null): number {
  switch (section) {
    case "official":
      return 0;
    case "intro":
      return 1;
    case "local":
      return 2;
    case "other":
      return 3;
    default:
      return 4;
  }
}

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
    seriesFiles: [...DEFAULT_MODERN_BOOTSTRAP_SERIES_FILES],
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
  const preferredSection = selection ? getSetFamilySeriesMetadata(selection.seriesFile)?.section ?? null : null;
  const deferredSeriesFiles = availableBrowserSeriesFiles
    .filter((seriesFile) => !bootstrapSeriesFiles.has(seriesFile))
    .sort((left, right) => {
      const leftMetadata = getSetFamilySeriesMetadata(left);
      const rightMetadata = getSetFamilySeriesMetadata(right);

      const leftPreferred = preferredSection && leftMetadata?.section === preferredSection ? 0 : 1;
      const rightPreferred = preferredSection && rightMetadata?.section === preferredSection ? 0 : 1;
      if (leftPreferred !== rightPreferred) {
        return leftPreferred - rightPreferred;
      }

      const leftSectionRank = deferredSectionRank(leftMetadata?.section ?? null);
      const rightSectionRank = deferredSectionRank(rightMetadata?.section ?? null);
      if (leftSectionRank !== rightSectionRank) {
        return leftSectionRank - rightSectionRank;
      }

      const leftOrder = leftMetadata?.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = rightMetadata?.order ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const leftFamily = leftMetadata?.familyId ?? left;
      const rightFamily = rightMetadata?.familyId ?? right;
      if (leftFamily !== rightFamily) {
        return leftFamily.localeCompare(rightFamily);
      }

      const leftFilebaseOrder = leftMetadata?.filebaseOrder ?? Number.MAX_SAFE_INTEGER;
      const rightFilebaseOrder = rightMetadata?.filebaseOrder ?? Number.MAX_SAFE_INTEGER;
      if (leftFilebaseOrder !== rightFilebaseOrder) {
        return leftFilebaseOrder - rightFilebaseOrder;
      }

      return left.localeCompare(right);
    });
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

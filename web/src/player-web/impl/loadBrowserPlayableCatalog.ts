import type { SeriesCatalogEntry } from "@content/api/series";
import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import { loadBrowserSeriesCatalogEntries } from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

interface LoadBrowserPlayableCatalogOptions {
  includeImported?: boolean;
  seriesFiles?: string[];
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

import type { SeriesCatalogEntry } from "@content/api/series";
import { loadSeriesCatalog } from "@level-catalog/impl/loadSeriesCatalog";
import { loadBrowserSeriesCatalogEntries } from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";

export async function loadBrowserPlayableCatalog(
  services: Pick<BrowserAppServices, "fixtureRepository" | "listImportedCatalogEntries">,
): Promise<SeriesCatalogEntry[]> {
  const [browserEntries, importedEntries] = await Promise.all([
    loadBrowserSeriesCatalogEntries(),
    services.listImportedCatalogEntries(),
  ]);

  return loadSeriesCatalog(services.fixtureRepository, [...browserEntries, ...importedEntries]);
}

import type { SeriesCatalogEntry } from "@content/api/series";

function buildEntrySignature(entry: SeriesCatalogEntry): string {
  return [
    entry.filebase,
    entry.mapfilename,
    entry.ruleset,
    ...entry.levels.map((level) => `${level.number}:${level.gameplayHash}`),
  ].join("|");
}

export function shouldSyncEmbeddedPlayerCatalog(
  currentCatalog: readonly SeriesCatalogEntry[],
  nextCatalog: readonly SeriesCatalogEntry[],
): boolean {
  if (nextCatalog.length === 0) {
    return false;
  }

  if (currentCatalog.length !== nextCatalog.length) {
    return true;
  }

  const currentByFilebase = new Map(currentCatalog.map((entry) => [entry.filebase, buildEntrySignature(entry)]));
  for (const entry of nextCatalog) {
    if (currentByFilebase.get(entry.filebase) !== buildEntrySignature(entry)) {
      return true;
    }
  }

  return false;
}

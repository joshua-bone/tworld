import type { SeriesCatalogEntry } from "@content/api/series";

export function mergeSeriesCatalogEntries(
  current: readonly SeriesCatalogEntry[],
  additions: readonly SeriesCatalogEntry[],
): SeriesCatalogEntry[] {
  const next = [...current];
  const indices = new Map(next.map((entry, index) => [entry.filebase, index] as const));

  for (const addition of additions) {
    const existingIndex = indices.get(addition.filebase);
    if (existingIndex === undefined) {
      indices.set(addition.filebase, next.length);
      next.push(addition);
      continue;
    }

    next[existingIndex] = addition;
  }

  return next;
}

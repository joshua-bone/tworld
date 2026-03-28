import type { SeriesCatalogEntry } from "@content/api/series";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import { resolveSetFamilySelection, type SetFamily } from "@player-web/impl/modern/curatedCatalog";
import { resolveMobileFamilyRuleset } from "@player-web/impl/mobile/mobileCatalog";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

function clampIndex(value: number, count: number): number {
  if (count <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(count - 1, value));
}

function pickLevelNumber(series: SeriesCatalogEntry | null, requested: number | null): number | null {
  if (!series) {
    return null;
  }

  if (requested !== null && series.levels.some((level) => level.number === requested)) {
    return requested;
  }

  return series.levels[0]?.number ?? null;
}

export function resolveInitialSelection(
  catalog: SeriesCatalogEntry[],
  stored: PlayableSelection | null,
): PlayableSelection | null {
  if (catalog.length === 0) {
    return null;
  }

  if (stored) {
    const series = catalog.find((candidate) => candidate.filebase === stored.seriesFile);
    const level = series?.levels.find((candidate) => candidate.number === stored.levelNumber);
    if (series && level) {
      return stored;
    }
  }

  const fallbackSeries = catalog[0]!;
  return {
    seriesFile: fallbackSeries.filebase,
    levelNumber: fallbackSeries.levels[0]?.number ?? 1,
  };
}

export function resolveSeriesSelection(
  catalog: SeriesCatalogEntry[],
  seriesFile: string,
  requestedLevelNumber: number | null,
): PlayableSelection | null {
  const series = catalog.find((candidate) => candidate.filebase === seriesFile) ?? null;
  const levelNumber = pickLevelNumber(series, requestedLevelNumber);
  if (levelNumber === null) {
    return null;
  }

  return {
    seriesFile,
    levelNumber,
  };
}

export function resolveLevelSelection(
  series: SeriesCatalogEntry | null,
  levelNumber: number,
): PlayableSelection | null {
  if (!series || !series.levels.some((level) => level.number === levelNumber)) {
    return null;
  }

  return {
    seriesFile: series.filebase,
    levelNumber,
  };
}

export function resolveFamilySelection(
  family: SetFamily,
  preferredRuleset: "MS" | "Lynx" | null,
  currentFamilyId: string | null,
  currentLevelNumber: number | null,
): PlayableSelection | null {
  const ruleset = resolveMobileFamilyRuleset(family, preferredRuleset);
  if (!ruleset) {
    return null;
  }

  const requestedLevelNumber =
    family.id === currentFamilyId
      ? currentLevelNumber ?? family.continueSelection?.levelNumber ?? 1
      : family.continueSelection?.levelNumber ?? currentLevelNumber ?? 1;

  return resolveSetFamilySelection(family, ruleset, requestedLevelNumber);
}

export function shiftSeriesSelection(
  catalog: SeriesCatalogEntry[],
  selectedSeriesFile: string | null,
  requestedLevelNumber: number | null,
  delta: number,
): PlayableSelection | null {
  if (catalog.length === 0) {
    return null;
  }

  const currentIndex = catalog.findIndex((series) => series.filebase === selectedSeriesFile);
  const nextIndex = clampIndex((currentIndex >= 0 ? currentIndex : 0) + delta, catalog.length);
  return resolveSeriesSelection(catalog, catalog[nextIndex]!.filebase, requestedLevelNumber);
}

export function jumpSeriesSelection(
  catalog: SeriesCatalogEntry[],
  requestedLevelNumber: number | null,
  position: "first" | "last",
): PlayableSelection | null {
  if (catalog.length === 0) {
    return null;
  }

  const series = position === "first" ? catalog[0]! : catalog[catalog.length - 1]!;
  return resolveSeriesSelection(catalog, series.filebase, requestedLevelNumber);
}

export function shiftLevelSelection(
  series: SeriesCatalogEntry | null,
  currentLevelNumber: number | null,
  delta: number,
): number | null {
  if (!series || currentLevelNumber === null) {
    return null;
  }

  const currentIndex = series.levels.findIndex((level) => level.number === currentLevelNumber);
  if (currentIndex < 0) {
    return null;
  }

  const nextIndex = clampIndex(currentIndex + delta, series.levels.length);
  const nextLevel = series.levels[nextIndex];
  if (!nextLevel || nextLevel.number === currentLevelNumber) {
    return null;
  }

  return nextLevel.number;
}

export function jumpLevelSelection(
  series: SeriesCatalogEntry | null,
  position: "first" | "last",
): number | null {
  if (!series || series.levels.length === 0) {
    return null;
  }

  return position === "first"
    ? (series.levels[0]?.number ?? null)
    : (series.levels[series.levels.length - 1]?.number ?? null);
}

export type PlayerAppProceedAction =
  | { kind: "select-level"; levelNumber: number }
  | { kind: "restart" }
  | { kind: "series-list"; message: string };

export function resolveProceedAction(
  levelStatus: InteractiveGameSession["frame"]["snapshot"]["status"],
  currentSeries: SeriesCatalogEntry | null,
  currentLevelNumber: number | null,
  usesModernGameUi: boolean,
): PlayerAppProceedAction | null {
  if (!currentSeries || currentLevelNumber === null) {
    return null;
  }

  if (levelStatus === "completed") {
    const currentIndex = currentSeries.levels.findIndex((level) => level.number === currentLevelNumber);
    const nextLevel = currentSeries.levels[currentIndex + 1];
    if (nextLevel) {
      return {
        kind: "select-level",
        levelNumber: nextLevel.number,
      };
    }

    return usesModernGameUi
      ? { kind: "restart" }
      : {
          kind: "series-list",
          message: `${currentSeries.filebase} completed.`,
        };
  }

  if (levelStatus === "failed") {
    return { kind: "restart" };
  }

  return null;
}

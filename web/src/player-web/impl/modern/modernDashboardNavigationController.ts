import type { SeriesCatalogEntry } from "@content/api/series";
import {
  buildLevelProgressIndex,
  resolveLevelProgressSummary,
  summarizeEntryProgress,
  type LevelProgressSummaryCounts,
} from "@player-web/impl/levelProgress";
import { describeLevelDisplayStatus } from "@player-web/impl/modern/familyActivity";
import {
  buildCuratedCatalogView,
  findSetFamilyById,
  findSetFamilyForSelection,
  listSearchableSetFamilies,
  listSetFamilyRulesets,
  resolveSearchMatchedLevelNumber,
  resolveSetFamilyLevel,
  resolveSetFamilyRuleset,
  resolveSetFamilySelection,
  searchSetFamilies,
  type CuratedCatalogView,
  type SetFamily,
  type SetFamilyRuleset,
} from "@player-web/impl/modern/curatedCatalog";
import type {
  BrowserLevelProgressSummary,
  BrowserPreferredRuleset,
  BrowserResolvedLevelProgressSummary,
} from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

export type LibrarySidebarTab = "official" | "curated" | "sandbox" | "uploads";

export interface ModernDashboardNavigationModel {
  curated: CuratedCatalogView;
  fallbackFamily: SetFamily | null;
  activeFamily: SetFamily | null;
  activeRuleset: SetFamilyRuleset | null;
  activeEntry: SeriesCatalogEntry | null;
  activeLevel: SeriesCatalogEntry["levels"][number] | null;
  activeSelection: PlayableSelection | null;
  progressByKey: ReadonlyMap<string, BrowserLevelProgressSummary>;
  activeLevelProgress: BrowserResolvedLevelProgressSummary | null;
  activeLevelStatus: ReturnType<typeof describeLevelDisplayStatus> | null;
  activeEntryProgress: LevelProgressSummaryCounts;
  searchableFamilies: readonly SetFamily[];
  isSearchActive: boolean;
  searchResults: readonly SetFamily[];
  visibleFamilies: readonly SetFamily[];
}

interface BuildModernDashboardNavigationModelArgs {
  activeFamilyId: string | null;
  activeTab: LibrarySidebarTab;
  catalog: SeriesCatalogEntry[];
  deferredSearchQuery: string;
  lastSelection: PlayableSelection | null;
  levelProgressSummaries: readonly BrowserLevelProgressSummary[];
  modeFingerprint?: string | null;
  requestedLevelsByFamily: Readonly<Record<string, number>>;
  requestedRuleset: BrowserPreferredRuleset;
}

interface ResolveFamilySelectionIntentArgs {
  curated: CuratedCatalogView;
  deferredSearchQuery: string;
  familyId: string;
  requestedRuleset: BrowserPreferredRuleset;
}

export interface ModernFamilySelectionIntent {
  activeFamilyId: string;
  activeTab: LibrarySidebarTab | null;
  requestedLevelNumber: number | null;
}

interface ResolveEmbeddedSelectionIntentArgs {
  currentLastSelection: PlayableSelection | null;
  curated: CuratedCatalogView;
  selection: PlayableSelection;
}

export interface ModernEmbeddedSelectionIntent {
  activeFamilyId: string | null;
  activeTab: LibrarySidebarTab | null;
  nextLastSelection: PlayableSelection;
  requestedLevelNumber: number | null;
  requestedRuleset: BrowserPreferredRuleset | null;
  selectionChanged: boolean;
}

export function resolveDefaultLandingFamily(view: CuratedCatalogView): SetFamily | null {
  return (
    findSetFamilyById(view, "official:cclp1") ??
    view.officialFamilies[0] ??
    view.introFamilies[0] ??
    view.localFamilies[0] ??
    null
  );
}

export function listFamiliesForTab(view: CuratedCatalogView, tab: LibrarySidebarTab): SetFamily[] {
  switch (tab) {
    case "official":
      return view.officialFamilies;
    case "curated":
      return view.introFamilies;
    case "sandbox":
      return [];
    case "uploads":
      return view.localFamilies;
  }
}

export function tabForFamily(family: SetFamily): LibrarySidebarTab | null {
  if (family.section === "official") {
    return "official";
  }

  if (family.section === "intro") {
    return "curated";
  }

  if (family.section === "local") {
    return "uploads";
  }

  return null;
}

export function resolveFamilyRuleset(
  family: SetFamily,
  requestedRuleset: BrowserPreferredRuleset,
): SetFamilyRuleset | null {
  if (family.launchEntries[requestedRuleset]) {
    return requestedRuleset;
  }

  return listSetFamilyRulesets(family)[0] ?? null;
}

export function buildModernDashboardNavigationModel({
  activeFamilyId,
  activeTab,
  catalog,
  deferredSearchQuery,
  lastSelection,
  levelProgressSummaries,
  modeFingerprint = null,
  requestedLevelsByFamily,
  requestedRuleset,
}: BuildModernDashboardNavigationModelArgs): ModernDashboardNavigationModel {
  const curated = buildCuratedCatalogView(catalog, lastSelection);
  const fallbackFamily = resolveDefaultLandingFamily(curated);
  const requestedActiveFamily = activeFamilyId ? findSetFamilyById(curated, activeFamilyId) : null;
  const activeFamily =
    requestedActiveFamily && tabForFamily(requestedActiveFamily)
      ? requestedActiveFamily
      : fallbackFamily;
  const activeRuleset = activeFamily ? resolveFamilyRuleset(activeFamily, requestedRuleset) : null;
  const activeEntry =
    activeFamily && activeRuleset ? activeFamily.launchEntries[activeRuleset] ?? null : null;
  const requestedLevelNumber = activeFamily ? requestedLevelsByFamily[activeFamily.id] ?? 1 : 1;
  const activeLevel =
    activeFamily && activeRuleset
      ? (resolveSetFamilyLevel(activeFamily, activeRuleset, requestedLevelNumber) ??
        activeEntry?.levels[0] ??
        null)
      : null;
  const activeSelection =
    activeFamily && activeRuleset && activeLevel
      ? resolveSetFamilySelection(activeFamily, activeRuleset, activeLevel.number)
      : null;
  const progressByKey = buildLevelProgressIndex(levelProgressSummaries, modeFingerprint);
  const activeLevelProgress =
    activeLevel && activeRuleset
      ? resolveLevelProgressSummary(activeLevel, activeRuleset, progressByKey)
      : null;
  const activeLevelStatus = activeLevel
    ? describeLevelDisplayStatus(activeLevel, activeLevelProgress)
    : null;
  const activeEntryProgress = summarizeEntryProgress(activeEntry, progressByKey);
  const searchableFamilies = listSearchableSetFamilies(curated);
  const searchResults = searchSetFamilies(searchableFamilies, deferredSearchQuery);
  const isSearchActive = deferredSearchQuery.trim() !== "";
  const visibleFamilies = isSearchActive
    ? searchResults
    : listFamiliesForTab(curated, activeTab);

  return {
    curated,
    fallbackFamily,
    activeFamily,
    activeRuleset,
    activeEntry,
    activeLevel,
    activeSelection,
    progressByKey,
    activeLevelProgress,
    activeLevelStatus,
    activeEntryProgress,
    searchableFamilies,
    isSearchActive,
    searchResults,
    visibleFamilies,
  };
}

export function resolveFamilySelectionIntent({
  curated,
  deferredSearchQuery,
  familyId,
  requestedRuleset,
}: ResolveFamilySelectionIntentArgs): ModernFamilySelectionIntent {
  const family = findSetFamilyById(curated, familyId);
  if (!family) {
    return {
      activeFamilyId: familyId,
      activeTab: null,
      requestedLevelNumber: null,
    };
  }

  const matchedRuleset = resolveFamilyRuleset(family, requestedRuleset);
  return {
    activeFamilyId: familyId,
    activeTab: tabForFamily(family),
    requestedLevelNumber:
      matchedRuleset && deferredSearchQuery.trim() !== ""
        ? resolveSearchMatchedLevelNumber(family, deferredSearchQuery, matchedRuleset)
        : null,
  };
}

export function resolveEmbeddedSelectionIntent({
  currentLastSelection,
  curated,
  selection,
}: ResolveEmbeddedSelectionIntentArgs): ModernEmbeddedSelectionIntent {
  const family = findSetFamilyForSelection(curated, selection);
  if (!family) {
    return {
      activeFamilyId: null,
      activeTab: null,
      nextLastSelection: selection,
      requestedLevelNumber: null,
      requestedRuleset: null,
      selectionChanged:
        !currentLastSelection ||
        currentLastSelection.seriesFile !== selection.seriesFile ||
        currentLastSelection.levelNumber !== selection.levelNumber,
    };
  }

  return {
    activeFamilyId: family.id,
    activeTab: tabForFamily(family),
    nextLastSelection: selection,
    requestedLevelNumber: selection.levelNumber,
    requestedRuleset: resolveSetFamilyRuleset(family, selection),
    selectionChanged:
      !currentLastSelection ||
      currentLastSelection.seriesFile !== selection.seriesFile ||
      currentLastSelection.levelNumber !== selection.levelNumber,
  };
}

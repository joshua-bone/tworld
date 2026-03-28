import type { SeriesCatalogEntry } from "@content/api/series";
import {
  buildBrowserProfileBackupFilename,
  createBrowserProfileBackup,
  parseBrowserProfileBackup,
  serializeBrowserProfileBackup,
  type BrowserProfileLocalSettingsSnapshot,
} from "@player-web/impl/browserProfileBackup";
import { describeLocalDatImportMessage } from "@player-web/impl/localDatImportMessaging";
import { mergeSeriesCatalogEntries } from "@player-web/impl/mergeSeriesCatalogEntries";
import {
  buildCuratedCatalogView,
  findSetFamilyById,
  findSetFamilyForSelection,
} from "@player-web/impl/modern/curatedCatalog";
import {
  resolveDefaultLandingFamily,
  tabForFamily,
  type LibrarySidebarTab,
} from "@player-web/impl/modern/modernDashboardNavigationController";
import { buildUrlLaunchHref } from "@player-web/impl/urlLaunch";
import type { BrowserProfileStore, BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";

function isDatFile(file: File): boolean {
  return /\.dat$/iu.test(file.name);
}

function stripLocalDatFilename(mapfilename: string): string | null {
  return mapfilename.startsWith("local:") ? mapfilename.slice("local:".length) : null;
}

export interface ModernLocalDatImportResult {
  message: string;
  nextActiveFamilyId: string | null;
  nextActiveTab: LibrarySidebarTab | null;
  nextCatalog: SeriesCatalogEntry[] | null;
  nextRequestedLevelNumber: number | null;
}

interface ImportModernLocalDatFilesArgs {
  catalog: readonly SeriesCatalogEntry[];
  files: readonly File[];
  importDatFile: (file: File) => Promise<SeriesCatalogEntry[]>;
  requestedRuleset: BrowserPreferredRuleset;
}

export async function importModernLocalDatFiles({
  catalog,
  files,
  importDatFile,
  requestedRuleset,
}: ImportModernLocalDatFilesArgs): Promise<ModernLocalDatImportResult> {
  const candidates = files.filter(isDatFile);
  if (candidates.length === 0) {
    return {
      message: "Only .dat files can be imported from local storage.",
      nextActiveFamilyId: null,
      nextActiveTab: null,
      nextCatalog: null,
      nextRequestedLevelNumber: null,
    };
  }

  const existingFilenames = new Set(
    catalog
      .map((entry) => stripLocalDatFilename(entry.mapfilename))
      .filter((filename): filename is string => filename !== null),
  );

  const results = await Promise.allSettled(
    candidates.map(async (file) => ({
      file,
      entries: await importDatFile(file),
    })),
  );
  const successes = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
  const failures = results.flatMap((result) =>
    result.status === "rejected"
      ? [result.reason instanceof Error ? result.reason.message : String(result.reason)]
      : [],
  );

  if (successes.length === 0) {
    return {
      message: failures[0] ?? "Failed to import the selected DAT file.",
      nextActiveFamilyId: null,
      nextActiveTab: null,
      nextCatalog: null,
      nextRequestedLevelNumber: null,
    };
  }

  const importedEntries = successes.flatMap(({ entries }) => entries);
  const nextCatalog = mergeSeriesCatalogEntries([...catalog], importedEntries);
  const preferredImportedEntry =
    importedEntries.find((entry) => entry.ruleset === requestedRuleset) ?? importedEntries[0] ?? null;
  const preferredImportedSelection =
    preferredImportedEntry && preferredImportedEntry.levels[0]
      ? {
          seriesFile: preferredImportedEntry.filebase,
          levelNumber: preferredImportedEntry.levels[0].number,
        }
      : null;
  const importedFamily = preferredImportedSelection
    ? findSetFamilyForSelection(buildCuratedCatalogView(nextCatalog, preferredImportedSelection), preferredImportedSelection)
    : null;

  return {
    message: describeLocalDatImportMessage({
      existingFilenames,
      failureMessages: failures,
      successfulFilenames: successes.map(({ file }) => file.name),
      variant: "modern",
    }),
    nextActiveFamilyId: importedFamily?.id ?? null,
    nextActiveTab: "uploads",
    nextCatalog,
    nextRequestedLevelNumber: preferredImportedSelection?.levelNumber ?? null,
  };
}

export interface ModernUploadedFamilyDiscardResult {
  message: string;
  nextActiveFamilyId: string | null;
  nextActiveTab: LibrarySidebarTab;
  nextCatalog: SeriesCatalogEntry[];
  removedFamilyId: string;
}

interface DiscardModernUploadedFamilyArgs {
  activeFamilyId: string | null;
  activeTab: LibrarySidebarTab;
  catalog: readonly SeriesCatalogEntry[];
  deleteImportedDatFile: (filename: string) => Promise<void>;
  familyId: string;
  lastSelection: { seriesFile: string; levelNumber: number } | null;
}

export async function discardModernUploadedFamily({
  activeFamilyId,
  activeTab,
  catalog,
  deleteImportedDatFile,
  familyId,
  lastSelection,
}: DiscardModernUploadedFamilyArgs): Promise<ModernUploadedFamilyDiscardResult | null> {
  const curated = buildCuratedCatalogView([...catalog], lastSelection);
  const family = findSetFamilyById(curated, familyId);
  const filename = family?.section === "local" ? stripLocalDatFilename(family.entries[0]?.mapfilename ?? "") : null;
  if (!family || !filename) {
    return null;
  }

  await deleteImportedDatFile(filename);
  const nextCatalog = catalog.filter((entry) => entry.mapfilename !== `local:${filename}`);
  const nextCurated = buildCuratedCatalogView(nextCatalog, lastSelection);
  const preservedActiveFamily =
    activeFamilyId && activeFamilyId !== familyId
      ? findSetFamilyById(nextCurated, activeFamilyId)
      : null;
  const nextActiveFamily =
    activeFamilyId === familyId
      ? (nextCurated.localFamilies[0] ?? resolveDefaultLandingFamily(nextCurated))
      : preservedActiveFamily;
  const nextFallbackFamily = resolveDefaultLandingFamily(nextCurated);

  let nextActiveTab = activeTab;
  let nextActiveFamilyId = nextActiveFamily?.id ?? activeFamilyId;

  if (activeFamilyId === familyId) {
    nextActiveFamilyId = nextActiveFamily?.id ?? null;
    nextActiveTab = nextActiveFamily ? (tabForFamily(nextActiveFamily) ?? "official") : "official";
  } else if (activeTab === "uploads" && nextCurated.localFamilies.length === 0) {
    nextActiveFamilyId = nextFallbackFamily?.id ?? null;
    nextActiveTab = nextFallbackFamily ? (tabForFamily(nextFallbackFamily) ?? "official") : "official";
  }

  return {
    message: `Discarded local set ${filename}.`,
    nextActiveFamilyId,
    nextActiveTab,
    nextCatalog,
    removedFamilyId: familyId,
  };
}

interface BuildModernLevelLinkArgs {
  levelNumber: number;
  origin?: string;
  profileStore: Pick<BrowserProfileStore, "listImportedDatFiles">;
  ruleset: BrowserPreferredRuleset;
  seriesFile: string;
}

export async function buildModernLevelLink({
  levelNumber,
  origin,
  profileStore,
  ruleset,
  seriesFile,
}: BuildModernLevelLinkArgs): Promise<string> {
  const importedDatFiles = await profileStore.listImportedDatFiles();
  return buildUrlLaunchHref({
    importedDatFiles,
    levelNumber,
    origin,
    ruleset,
    seriesFile,
  });
}

export interface ModernProfileBackupDownload {
  filename: string;
  payload: string;
}

export async function prepareModernProfileBackupDownload(
  profileStore: Pick<BrowserProfileStore, "exportProfileSnapshot">,
  exportedAtMs = Date.now(),
): Promise<ModernProfileBackupDownload> {
  const snapshot = await profileStore.exportProfileSnapshot();
  const backup = createBrowserProfileBackup(snapshot, exportedAtMs);
  return {
    filename: buildBrowserProfileBackupFilename(backup.exportedAtMs),
    payload: serializeBrowserProfileBackup(backup),
  };
}

export async function importModernProfileBackup(
  profileStore: Pick<BrowserProfileStore, "importProfileSnapshot">,
  file: Pick<File, "text">,
): Promise<BrowserProfileLocalSettingsSnapshot | undefined> {
  const backup = parseBrowserProfileBackup(await file.text());
  await profileStore.importProfileSnapshot(backup.profile);
  return backup.localSettings;
}

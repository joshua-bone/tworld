import { buildAppHref } from "@player-web/impl/appPaths";
import {
  computeDatContentHash,
  importedSeriesFile,
  sanitizeImportedDatSlotName,
} from "@player-web/impl/importedDatIdentity";
import { parseUrlLaunchRequest, type ParsedUrlLaunchRequest } from "@player-web/impl/urlLaunchRequest";
import {
  buildBitbustersPackToken,
  defaultImportedSlotName,
  findImportedDatEntry,
  findImportedDatEntryBySource,
  findImportedSlotByHash,
  findImportedSlotByToken,
  findMatchingBuiltInSeriesFile,
  loadBitbustersLaunchPack,
  loadGliderBotLaunchPack,
  resolveBuiltInSeriesFile,
  stripSeriesRulesetSuffix,
  type DownloadedLaunchPack,
} from "@player-web/impl/urlLaunchSupport";
import { decodeDatUrlPayload, encodeDatUrlPayload } from "@player-web/impl/urlDatCodec";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import type { BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

export { resetUrlLaunchCachesForTest } from "@player-web/impl/urlLaunchSupport";

export interface UrlLaunchResolution {
  message: string | null;
  overrideApplied: boolean;
  selection: PlayableSelection | null;
}

export interface UrlLaunchHrefRequest {
  baseUrl?: string;
  importedDatFiles: readonly PersistedImportedDatFile[];
  levelNumber: number;
  origin?: string;
  ruleset: BrowserPreferredRuleset;
  seriesFile: string;
}

type UrlLaunchServices = Pick<BrowserAppServices, "importDatBytes" | "profileStore" | "selectionStore">;

function createResolvedSelection(
  slotName: string,
  levelNumber: number,
  ruleset: BrowserPreferredRuleset,
): PlayableSelection {
  return {
    seriesFile: importedSeriesFile(slotName, ruleset),
    levelNumber,
  };
}

async function persistUrlLaunchSelection(
  services: Pick<BrowserAppServices, "selectionStore">,
  selection: PlayableSelection,
): Promise<UrlLaunchResolution> {
  await services.selectionStore.saveSelection(selection);
  return {
    message: null,
    overrideApplied: true,
    selection,
  };
}

function fallbackUrlLaunchResolution(
  fallbackSelection: PlayableSelection | null,
  message: string | null,
): UrlLaunchResolution {
  return {
    message,
    overrideApplied: false,
    selection: fallbackSelection,
  };
}

async function resolveDatPayloadSelection(
  services: UrlLaunchServices,
  request: ParsedUrlLaunchRequest,
): Promise<PlayableSelection | null> {
  if (!request.datPayload) {
    return null;
  }

  const datBytes = await decodeDatUrlPayload(request.datPayload);
  const datHash = await computeDatContentHash(datBytes);
  const importedDatFiles = await services.profileStore.listImportedDatFiles();
  const slotName =
    request.slotName !== null
      ? sanitizeImportedDatSlotName(request.slotName)
      : (await findImportedSlotByHash(datHash, importedDatFiles)) ?? defaultImportedSlotName(datHash);

  await services.importDatBytes(slotName, datBytes);
  return createResolvedSelection(slotName, request.levelNumber, request.ruleset);
}

async function resolveImportedPackSelection(
  services: UrlLaunchServices,
  request: ParsedUrlLaunchRequest,
  pack: DownloadedLaunchPack,
): Promise<PlayableSelection> {
  const importedDatFiles = await services.profileStore.listImportedDatFiles();
  const matchingBuiltInSeriesFile = await findMatchingBuiltInSeriesFile(pack.setToken, request.ruleset, pack.datHash);
  if (matchingBuiltInSeriesFile) {
    return {
      seriesFile: matchingBuiltInSeriesFile,
      levelNumber: request.levelNumber,
    };
  }

  if (pack.source) {
    const importedEntryBySource = findImportedDatEntryBySource(pack.source, importedDatFiles);
    if (importedEntryBySource) {
      const importedHash = importedEntryBySource.datHash ?? (await computeDatContentHash(importedEntryBySource.datBytes));
      if (importedHash === pack.datHash) {
        return createResolvedSelection(importedEntryBySource.filename, request.levelNumber, request.ruleset);
      }

      await services.importDatBytes(importedEntryBySource.filename, pack.datBytes, pack.source);
      return createResolvedSelection(importedEntryBySource.filename, request.levelNumber, request.ruleset);
    }
  }

  const importedSlotByToken = findImportedSlotByToken(pack.setToken, importedDatFiles);
  if (importedSlotByToken) {
    const importedEntry = importedDatFiles.find((entry) => entry.filename === importedSlotByToken) ?? null;
    const importedHash = importedEntry?.datHash ?? (importedEntry ? await computeDatContentHash(importedEntry.datBytes) : null);
    if (
      importedHash === pack.datHash &&
      (!pack.source ||
        (importedEntry?.source?.kind === pack.source.kind &&
          importedEntry.source.game === pack.source.game &&
          importedEntry.source.packId === pack.source.packId))
    ) {
      return createResolvedSelection(importedSlotByToken, request.levelNumber, request.ruleset);
    }

    await services.importDatBytes(importedSlotByToken, pack.datBytes, pack.source);
    return createResolvedSelection(importedSlotByToken, request.levelNumber, request.ruleset);
  }

  const importedSlotByHash = await findImportedSlotByHash(pack.datHash, importedDatFiles);
  if (importedSlotByHash) {
    const importedEntry = importedDatFiles.find((entry) => entry.filename === importedSlotByHash) ?? null;
    if (!pack.source) {
      return createResolvedSelection(importedSlotByHash, request.levelNumber, request.ruleset);
    }

    if (
      importedEntry?.source?.kind === pack.source.kind &&
      importedEntry.source.game === pack.source.game &&
      importedEntry.source.packId === pack.source.packId
    ) {
      return createResolvedSelection(importedSlotByHash, request.levelNumber, request.ruleset);
    }

    await services.importDatBytes(importedSlotByHash, pack.datBytes, pack.source);
    return createResolvedSelection(importedSlotByHash, request.levelNumber, request.ruleset);
  }

  await services.importDatBytes(pack.slotName, pack.datBytes, pack.source);
  return createResolvedSelection(pack.slotName, request.levelNumber, request.ruleset);
}

async function resolvePackSelection(
  services: UrlLaunchServices,
  request: ParsedUrlLaunchRequest,
): Promise<PlayableSelection | null> {
  if (!request.packToken) {
    return null;
  }

  const bitbustersPack = await loadBitbustersLaunchPack(request.packToken);
  if (bitbustersPack) {
    return resolveImportedPackSelection(services, request, bitbustersPack);
  }

  if (!request.packToken.startsWith("gb:")) {
    throw new Error(`Pack ${request.packToken} is not supported.`);
  }

  return resolveImportedPackSelection(services, request, await loadGliderBotLaunchPack(request.packToken));
}

async function resolveSetTokenSelection(
  services: UrlLaunchServices,
  request: ParsedUrlLaunchRequest,
): Promise<PlayableSelection | null> {
  if (!request.setToken) {
    return null;
  }

  const builtInSeriesFile = resolveBuiltInSeriesFile(request.setToken, request.ruleset);
  if (builtInSeriesFile) {
    return {
      seriesFile: builtInSeriesFile,
      levelNumber: request.levelNumber,
    };
  }

  const importedDatFiles = await services.profileStore.listImportedDatFiles();
  const importedSlotName = findImportedSlotByToken(request.setToken, importedDatFiles);
  if (importedSlotName) {
    return createResolvedSelection(importedSlotName, request.levelNumber, request.ruleset);
  }

  throw new Error(`Set ${request.setToken} was not found.`);
}

export async function buildUrlLaunchHref({
  baseUrl = import.meta.env.BASE_URL,
  importedDatFiles,
  levelNumber,
  origin = window.location.origin,
  ruleset,
  seriesFile,
}: UrlLaunchHrefRequest): Promise<string> {
  const url = new URL(buildAppHref("/", baseUrl), origin);
  url.searchParams.set("level", String(levelNumber));
  url.searchParams.set("ruleset", ruleset);

  const importedDatEntry = findImportedDatEntry(seriesFile, ruleset, importedDatFiles);
  if (importedDatEntry) {
    if (importedDatEntry.source?.kind === "bitbusters-custom-pack") {
      url.searchParams.set("pack", buildBitbustersPackToken(importedDatEntry.source));
      return url.toString();
    }

    url.searchParams.set("slot", importedDatEntry.filename);
    url.hash = `dat=${await encodeDatUrlPayload(importedDatEntry.datBytes)}`;
    return url.toString();
  }

  url.searchParams.set("set", stripSeriesRulesetSuffix(seriesFile));
  return url.toString();
}

export async function resolveUrlLaunchSelection(
  services: UrlLaunchServices,
  fallbackSelection: PlayableSelection | null,
  location: Pick<Location, "hash" | "search"> = window.location,
): Promise<UrlLaunchResolution> {
  const request = parseUrlLaunchRequest(location);
  if (!request) {
    return fallbackUrlLaunchResolution(fallbackSelection, null);
  }

  try {
    const selection =
      (await resolveDatPayloadSelection(services, request)) ??
      (await resolvePackSelection(services, request)) ??
      (await resolveSetTokenSelection(services, request));
    if (!selection) {
      return fallbackUrlLaunchResolution(fallbackSelection, null);
    }
    return persistUrlLaunchSelection(services, selection);
  } catch (error: unknown) {
    return fallbackUrlLaunchResolution(
      fallbackSelection,
      error instanceof Error ? error.message : String(error),
    );
  }
}

import { listBrowserSeriesCatalogFiles } from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import type { PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";
import { buildAppHref } from "@player-web/impl/appPaths";
import {
  computeDatContentHash,
  importedSeriesFile,
  sanitizeImportedDatSlotName,
} from "@player-web/impl/importedDatIdentity";
import { decodeDatUrlPayload, encodeDatUrlPayload } from "@player-web/impl/urlDatCodec";
import type { BrowserAppServices } from "@player-web/ports/BrowserAppServices";
import type { BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";
import type { PlayableSelection } from "@player-web/ports/PlayableSelectionStore";

interface ParsedUrlLaunchRequest {
  datPayload: string | null;
  setToken: string | null;
  levelNumber: number;
  ruleset: BrowserPreferredRuleset;
  slotName: string | null;
}

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

function parseLevelNumber(value: string | null): number {
  if (!value) {
    return 1;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function parseRuleset(value: string | null): BrowserPreferredRuleset {
  return value === "MS" ? "MS" : "Lynx";
}

function parseUrlLaunchRequest(location: Pick<Location, "hash" | "search">): ParsedUrlLaunchRequest | null {
  const searchParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.startsWith("#") ? location.hash.slice(1) : location.hash);
  const datPayload = hashParams.get("dat") ?? searchParams.get("dat") ?? searchParams.get("levelset");
  const setToken = searchParams.get("set") ?? hashParams.get("set");

  if (!datPayload && !setToken) {
    return null;
  }

  return {
    datPayload,
    setToken,
    levelNumber: parseLevelNumber(searchParams.get("level") ?? hashParams.get("level")),
    ruleset: parseRuleset(searchParams.get("ruleset") ?? hashParams.get("ruleset")),
    slotName: searchParams.get("slot") ?? hashParams.get("slot") ?? searchParams.get("name") ?? hashParams.get("name"),
  };
}

function normalizeSetToken(value: string): string {
  return value.toLowerCase().replace(/\.[^.]+$/u, "").replace(/[^a-z0-9]/gu, "");
}

function stripSeriesRulesetSuffix(seriesFile: string): string {
  const raw = seriesFile.replace(/\.dac$/iu, "");
  return raw.replace(/(?:-lynx|-ms|\.dat-lynx|\.dat-ms)$/iu, "");
}

function buildSeriesFileCandidates(seriesFile: string): string[] {
  const raw = seriesFile.replace(/\.dac$/iu, "");
  return [
    raw,
    raw.replace(/-(ms|lynx)$/iu, ""),
    raw.replace(/\.dat-(ms|lynx)$/iu, ""),
  ];
}

function matchesRuleset(seriesFile: string, ruleset: BrowserPreferredRuleset): boolean {
  return ruleset === "MS"
    ? /(?:-ms|\.dat-ms)\.dac$/iu.test(seriesFile)
    : /(?:-lynx|\.dat-lynx)\.dac$/iu.test(seriesFile);
}

function resolveBuiltInSeriesFile(
  setToken: string,
  ruleset: BrowserPreferredRuleset,
  availableSeriesFiles: readonly string[],
): string | null {
  const normalizedToken = normalizeSetToken(setToken);
  const matches = availableSeriesFiles.filter((seriesFile) =>
    buildSeriesFileCandidates(seriesFile).some((candidate) => normalizeSetToken(candidate) === normalizedToken),
  );

  return matches.find((seriesFile) => matchesRuleset(seriesFile, ruleset)) ?? matches[0] ?? null;
}

function findImportedSlotByToken(
  setToken: string,
  importedDatFiles: readonly PersistedImportedDatFile[],
): string | null {
  const normalizedToken = normalizeSetToken(setToken);
  const match = importedDatFiles.find((entry) => normalizeSetToken(entry.filename) === normalizedToken);
  return match?.filename ?? null;
}

async function findImportedSlotByHash(
  datHash: string,
  importedDatFiles: readonly PersistedImportedDatFile[],
): Promise<string | null> {
  for (const entry of importedDatFiles) {
    const entryHash = entry.datHash ?? (await computeDatContentHash(entry.datBytes));
    if (entryHash === datHash) {
      return entry.filename;
    }
  }

  return null;
}

function defaultImportedSlotName(datHash: string): string {
  return `Imported-${datHash.slice(0, 8)}.dat`;
}

function findImportedDatEntry(
  seriesFile: string,
  ruleset: BrowserPreferredRuleset,
  importedDatFiles: readonly PersistedImportedDatFile[],
): PersistedImportedDatFile | null {
  return (
    importedDatFiles.find((entry) => importedSeriesFile(entry.filename, ruleset) === seriesFile) ?? null
  );
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
    url.searchParams.set("slot", importedDatEntry.filename);
    url.hash = `dat=${await encodeDatUrlPayload(importedDatEntry.datBytes)}`;
    return url.toString();
  }

  url.searchParams.set("set", stripSeriesRulesetSuffix(seriesFile));
  return url.toString();
}

export async function resolveUrlLaunchSelection(
  services: Pick<BrowserAppServices, "importDatBytes" | "profileStore" | "selectionStore">,
  fallbackSelection: PlayableSelection | null,
  location: Pick<Location, "hash" | "search"> = window.location,
): Promise<UrlLaunchResolution> {
  const request = parseUrlLaunchRequest(location);
  if (!request) {
    return {
      message: null,
      overrideApplied: false,
      selection: fallbackSelection,
    };
  }

  try {
    if (request.datPayload) {
      const datBytes = await decodeDatUrlPayload(request.datPayload);
      const datHash = await computeDatContentHash(datBytes);
      const importedDatFiles = await services.profileStore.listImportedDatFiles();
      const selectedSlotName =
        request.slotName !== null
          ? sanitizeImportedDatSlotName(request.slotName)
          : (await findImportedSlotByHash(datHash, importedDatFiles)) ?? defaultImportedSlotName(datHash);

      await services.importDatBytes(selectedSlotName, datBytes);
      const selection = {
        seriesFile: importedSeriesFile(selectedSlotName, request.ruleset),
        levelNumber: request.levelNumber,
      } satisfies PlayableSelection;
      await services.selectionStore.saveSelection(selection);
      return {
        message: null,
        overrideApplied: true,
        selection,
      };
    }

    if (request.setToken) {
      const availableSeriesFiles = listBrowserSeriesCatalogFiles();
      const builtInSeriesFile = resolveBuiltInSeriesFile(request.setToken, request.ruleset, availableSeriesFiles);
      if (builtInSeriesFile) {
        const selection = {
          seriesFile: builtInSeriesFile,
          levelNumber: request.levelNumber,
        } satisfies PlayableSelection;
        await services.selectionStore.saveSelection(selection);
        return {
          message: null,
          overrideApplied: true,
          selection,
        };
      }

      const importedDatFiles = await services.profileStore.listImportedDatFiles();
      const importedSlotName = findImportedSlotByToken(request.setToken, importedDatFiles);
      if (importedSlotName) {
        const selection = {
          seriesFile: importedSeriesFile(importedSlotName, request.ruleset),
          levelNumber: request.levelNumber,
        } satisfies PlayableSelection;
        await services.selectionStore.saveSelection(selection);
        return {
          message: null,
          overrideApplied: true,
          selection,
        };
      }

      return {
        message: `Set ${request.setToken} was not found.`,
        overrideApplied: false,
        selection: fallbackSelection,
      };
    }

    return {
      message: null,
      overrideApplied: false,
      selection: fallbackSelection,
    };
  } catch (error: unknown) {
    return {
      message: error instanceof Error ? error.message : String(error),
      overrideApplied: false,
      selection: fallbackSelection,
    };
  }
}

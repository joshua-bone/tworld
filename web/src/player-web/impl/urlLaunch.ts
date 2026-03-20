import { listBrowserSeriesCatalogFiles } from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import { loadBySuffix, type BrowserSeriesLoaderMap } from "@level-catalog/impl/browserSeriesCatalogEntries.shared";
import { parseSeriesConfig } from "@content/api/series-file";
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
  packToken: string | null;
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

const GLIDERBOT_PACK_BASE_URL = "https://bitbusters.club/gliderbot/sets/";
const builtInSeriesConfigs = import.meta.glob("@sets/*.dac", {
  import: "default",
  query: "?raw",
}) as BrowserSeriesLoaderMap<string>;
const builtInDataFiles = import.meta.glob(["@data/*.dat", "@data/*.ccx", "!@data/CHIPS.dat"], {
  import: "default",
  query: "?url",
}) as BrowserSeriesLoaderMap<string>;
const builtInDatHashCache = new Map<string, Promise<{ datHash: string; ruleset: BrowserPreferredRuleset } | null>>();

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
  const packToken = searchParams.get("pack") ?? hashParams.get("pack");
  const setToken = searchParams.get("set") ?? hashParams.get("set");

  if (!datPayload && !packToken && !setToken) {
    return null;
  }

  return {
    datPayload,
    packToken,
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

function canonicalizePackPathSegments(value: string): string[] {
  const raw = value.trim().replace(/\/+$/u, "");
  const segments: string[] = [];

  for (const segment of raw.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return segments;
}

function canonicalizeGliderBotPackPath(value: string): string {
  const rawPath = value.startsWith("gb:") ? value.slice("gb:".length) : value;
  const segments = canonicalizePackPathSegments(rawPath);
  if (segments.length === 0) {
    throw new Error("Pack path is empty.");
  }

  if (segments[0] === "cc1" && !/\.dat$/iu.test(segments[segments.length - 1] ?? "")) {
    segments[segments.length - 1] = `${segments[segments.length - 1]}.dat`;
  }

  return segments.join("/");
}

function buildGliderBotPackUrl(canonicalPath: string): string {
  const url = new URL(GLIDERBOT_PACK_BASE_URL);
  const basePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.pathname = `${basePath}${canonicalPath.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
  return url.toString();
}

function packSlotNameFromCanonicalPath(canonicalPath: string): string {
  const basename = canonicalPath.split("/").at(-1);
  if (!basename) {
    throw new Error("Pack path is empty.");
  }

  return sanitizeImportedDatSlotName(basename);
}

async function loadBuiltInSeriesDatHash(
  seriesFile: string,
): Promise<{ datHash: string; ruleset: BrowserPreferredRuleset } | null> {
  const cached = builtInDatHashCache.get(seriesFile);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const configText = await loadBySuffix(builtInSeriesConfigs, `/sets/${seriesFile}`);
    if (!configText) {
      return null;
    }

    const config = parseSeriesConfig(configText);
    if (config.ruleset !== "MS" && config.ruleset !== "Lynx") {
      return null;
    }

    const dataUrl = await loadBySuffix(builtInDataFiles, `/data/${config.mapFile}`);
    if (!dataUrl) {
      return null;
    }

    const response = await fetch(dataUrl);
    if (!response.ok) {
      return null;
    }

    return {
      datHash: await computeDatContentHash(new Uint8Array(await response.arrayBuffer())),
      ruleset: config.ruleset,
    };
  })();

  builtInDatHashCache.set(seriesFile, promise);
  return promise;
}

async function findMatchingBuiltInSeriesFile(
  setToken: string,
  ruleset: BrowserPreferredRuleset,
  datHash: string,
): Promise<string | null> {
  const builtInSeriesFile = resolveBuiltInSeriesFile(setToken, ruleset, listBrowserSeriesCatalogFiles());
  if (!builtInSeriesFile) {
    return null;
  }

  const metadata = await loadBuiltInSeriesDatHash(builtInSeriesFile);
  if (!metadata || metadata.ruleset !== ruleset || metadata.datHash !== datHash) {
    return null;
  }

  return builtInSeriesFile;
}

async function fetchDatBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
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

    if (request.packToken) {
      if (!request.packToken.startsWith("gb:")) {
        return {
          message: `Pack ${request.packToken} is not supported.`,
          overrideApplied: false,
          selection: fallbackSelection,
        };
      }

      const canonicalPackPath = canonicalizeGliderBotPackPath(request.packToken);
      const packUrl = buildGliderBotPackUrl(canonicalPackPath);
      const datBytes = await fetchDatBytes(packUrl);
      const datHash = await computeDatContentHash(datBytes);
      const packSlotName = packSlotNameFromCanonicalPath(canonicalPackPath);
      const packToken = packSlotName.replace(/\.[^.]+$/u, "");
      const importedDatFiles = await services.profileStore.listImportedDatFiles();
      const matchingBuiltInSeriesFile = await findMatchingBuiltInSeriesFile(packToken, request.ruleset, datHash);

      if (matchingBuiltInSeriesFile) {
        const selection = {
          seriesFile: matchingBuiltInSeriesFile,
          levelNumber: request.levelNumber,
        } satisfies PlayableSelection;
        await services.selectionStore.saveSelection(selection);
        return {
          message: null,
          overrideApplied: true,
          selection,
        };
      }

      const importedSlotByToken = findImportedSlotByToken(packToken, importedDatFiles);
      if (importedSlotByToken) {
        const importedEntry = importedDatFiles.find((entry) => entry.filename === importedSlotByToken) ?? null;
        const importedHash = importedEntry?.datHash ?? (importedEntry ? await computeDatContentHash(importedEntry.datBytes) : null);
        if (importedHash === datHash) {
          const selection = {
            seriesFile: importedSeriesFile(importedSlotByToken, request.ruleset),
            levelNumber: request.levelNumber,
          } satisfies PlayableSelection;
          await services.selectionStore.saveSelection(selection);
          return {
            message: null,
            overrideApplied: true,
            selection,
          };
        }

        await services.importDatBytes(importedSlotByToken, datBytes);
        const selection = {
          seriesFile: importedSeriesFile(importedSlotByToken, request.ruleset),
          levelNumber: request.levelNumber,
        } satisfies PlayableSelection;
        await services.selectionStore.saveSelection(selection);
        return {
          message: null,
          overrideApplied: true,
          selection,
        };
      }

      const importedSlotByHash = await findImportedSlotByHash(datHash, importedDatFiles);
      if (importedSlotByHash) {
        const selection = {
          seriesFile: importedSeriesFile(importedSlotByHash, request.ruleset),
          levelNumber: request.levelNumber,
        } satisfies PlayableSelection;
        await services.selectionStore.saveSelection(selection);
        return {
          message: null,
          overrideApplied: true,
          selection,
        };
      }

      await services.importDatBytes(packSlotName, datBytes);
      const selection = {
        seriesFile: importedSeriesFile(packSlotName, request.ruleset),
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

import { listBrowserSeriesCatalogFiles } from "@level-catalog/impl/loadBrowserSeriesCatalogEntries";
import { loadBySuffix, type BrowserSeriesLoaderMap } from "@level-catalog/impl/browserSeriesCatalogEntries.shared";
import { parseSeriesConfig } from "@content/api/series-file";
import type {
  BitbustersCustomPackGame,
  PersistedImportedDatFile,
  PersistedImportedDatSource,
} from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  bitbustersCustomPackGameSlug,
  fetchBitbustersCustomPack,
  type BitbustersCustomPackGameSlug,
} from "@player-web/impl/bitbustersCustomPacksApi";
import {
  computeDatContentHash,
  importedSeriesFile,
  sanitizeImportedDatSlotName,
  stripImportedDatExtension,
} from "@player-web/impl/importedDatIdentity";
import type { BrowserPreferredRuleset } from "@player-web/ports/BrowserProfileStore";

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
const gliderBotDirectoryEntriesCache = new Map<string, Promise<string[]>>();

export interface DownloadedLaunchPack {
  datBytes: Uint8Array;
  datHash: string;
  setToken: string;
  slotName: string;
  source?: PersistedImportedDatSource;
}

function normalizeSetToken(value: string): string {
  return value.toLowerCase().replace(/\.[^.]+$/u, "").replace(/[^a-z0-9]/gu, "");
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

function parseBitbustersPackToken(
  value: string,
): { game: BitbustersCustomPackGame; gameSlug: BitbustersCustomPackGameSlug; packId: number } | null {
  const match = /^bb:(cc1|cc2)\/([1-9][0-9]*)$/iu.exec(value.trim());
  if (!match) {
    return null;
  }

  const gameSlug = match[1].toLowerCase() as BitbustersCustomPackGameSlug;
  return {
    game: gameSlug === "cc1" ? "CC1" : "CC2",
    gameSlug,
    packId: Number.parseInt(match[2]!, 10),
  };
}

function decodeHtmlHref(value: string): string {
  return value
    .replace(/&amp;/gu, "&")
    .replace(/&quot;/gu, "\"")
    .replace(/&#39;/gu, "'")
    .replace(/&lt;/gu, "<")
    .replace(/&gt;/gu, ">");
}

function parseDirectoryListingHrefs(html: string): string[] {
  const matches = html.matchAll(/href="([^"]+)"/giu);
  const hrefs: string[] = [];

  for (const match of matches) {
    const href = match[1];
    if (!href) {
      continue;
    }
    hrefs.push(decodeHtmlHref(href));
  }

  return hrefs;
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

function buildGliderBotPackUrl(canonicalPath: string): string {
  const url = new URL(GLIDERBOT_PACK_BASE_URL);
  const basePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  url.pathname = `${basePath}${canonicalPath.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
  return url.toString();
}

function buildGliderBotDirectoryUrl(directoryPath: string): string {
  const url = new URL(GLIDERBOT_PACK_BASE_URL);
  const basePath = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
  const normalizedDirectory = directoryPath === "" ? "" : `${directoryPath.replace(/\/+$/u, "")}/`;
  url.pathname = `${basePath}${normalizedDirectory.split("/").filter((segment) => segment !== "").map((segment) => encodeURIComponent(segment)).join("/")}`;
  if (!url.pathname.endsWith("/")) {
    url.pathname = `${url.pathname}/`;
  }
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

async function loadGliderBotDirectoryEntries(directoryPath: string): Promise<string[]> {
  const cached = gliderBotDirectoryEntriesCache.get(directoryPath);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const response = await fetch(buildGliderBotDirectoryUrl(directoryPath));
    if (!response.ok) {
      throw new Error(`Failed to fetch ${buildGliderBotDirectoryUrl(directoryPath)}: ${response.status}`);
    }

    return parseDirectoryListingHrefs(await response.text());
  })();

  gliderBotDirectoryEntriesCache.set(directoryPath, promise);
  return promise;
}

async function fetchDatBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export function stripSeriesRulesetSuffix(seriesFile: string): string {
  const raw = seriesFile.replace(/\.dac$/iu, "");
  return raw.replace(/(?:-lynx|-ms|\.dat-lynx|\.dat-ms)$/iu, "");
}

export function resolveBuiltInSeriesFile(
  setToken: string,
  ruleset: BrowserPreferredRuleset,
  availableSeriesFiles: readonly string[] = listBrowserSeriesCatalogFiles(),
): string | null {
  const normalizedToken = normalizeSetToken(setToken);
  const matches = availableSeriesFiles.filter((seriesFile) =>
    buildSeriesFileCandidates(seriesFile).some((candidate) => normalizeSetToken(candidate) === normalizedToken),
  );

  return matches.find((seriesFile) => matchesRuleset(seriesFile, ruleset)) ?? matches[0] ?? null;
}

export function findImportedSlotByToken(
  setToken: string,
  importedDatFiles: readonly PersistedImportedDatFile[],
): string | null {
  const normalizedToken = normalizeSetToken(setToken);
  const match = importedDatFiles.find((entry) => normalizeSetToken(entry.filename) === normalizedToken);
  return match?.filename ?? null;
}

export async function findImportedSlotByHash(
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

export function defaultImportedSlotName(datHash: string): string {
  return `Imported-${datHash.slice(0, 8)}.dat`;
}

export function findImportedDatEntry(
  seriesFile: string,
  ruleset: BrowserPreferredRuleset,
  importedDatFiles: readonly PersistedImportedDatFile[],
): PersistedImportedDatFile | null {
  return (
    importedDatFiles.find((entry) => importedSeriesFile(entry.filename, ruleset) === seriesFile) ?? null
  );
}

export function findImportedDatEntryBySource(
  source: PersistedImportedDatSource,
  importedDatFiles: readonly PersistedImportedDatFile[],
): PersistedImportedDatFile | null {
  return (
    importedDatFiles.find(
      (entry) =>
        entry.source?.kind === source.kind &&
        entry.source.game === source.game &&
        entry.source.packId === source.packId,
    ) ?? null
  );
}

export function buildBitbustersPackToken(
  source: Extract<PersistedImportedDatSource, { kind: "bitbusters-custom-pack" }>,
): string {
  return `bb:${bitbustersCustomPackGameSlug(source.game)}/${source.packId}`;
}

export async function findMatchingBuiltInSeriesFile(
  setToken: string,
  ruleset: BrowserPreferredRuleset,
  datHash: string,
): Promise<string | null> {
  const builtInSeriesFile = resolveBuiltInSeriesFile(setToken, ruleset);
  if (!builtInSeriesFile) {
    return null;
  }

  const metadata = await loadBuiltInSeriesDatHash(builtInSeriesFile);
  if (!metadata || metadata.ruleset !== ruleset || metadata.datHash !== datHash) {
    return null;
  }

  return builtInSeriesFile;
}

export function canonicalizeGliderBotPackPath(value: string): string {
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

export async function resolveGliderBotCaseSensitivePath(canonicalPath: string): Promise<string> {
  const segments = canonicalPath.split("/").filter((segment) => segment !== "");
  if (segments.length === 0) {
    throw new Error("Pack path is empty.");
  }

  const directorySegments = segments.slice(0, -1);
  const requestedFile = segments[segments.length - 1]!;
  const directoryPath = directorySegments.join("/");
  const entries = await loadGliderBotDirectoryEntries(directoryPath);
  const matchingEntry = entries.find((href) => {
    if (href === "../" || href.endsWith("/")) {
      return false;
    }

    return href.toLowerCase() === requestedFile.toLowerCase();
  });

  if (!matchingEntry) {
    return canonicalPath;
  }

  return [...directorySegments, matchingEntry].join("/");
}

export async function loadBitbustersLaunchPack(packToken: string): Promise<DownloadedLaunchPack | null> {
  const parsedToken = parseBitbustersPackToken(packToken);
  if (!parsedToken) {
    return null;
  }

  if (parsedToken.game === "CC2") {
    throw new Error("CC2 custom packs are ZIP-based and not yet supported.");
  }

  const pack = await fetchBitbustersCustomPack(parsedToken.gameSlug, parsedToken.packId);
  if (!pack) {
    throw new Error(`Custom pack ${packToken} was not found.`);
  }
  if (!pack.downloadUrl) {
    throw new Error(`Custom pack ${pack.fileName} is not available for download.`);
  }
  if (!/\.dat$/iu.test(pack.fileName)) {
    throw new Error(`Custom pack ${pack.fileName} is not a supported DAT download.`);
  }

  const datBytes = await fetchDatBytes(pack.downloadUrl);
  return {
    datBytes,
    datHash: await computeDatContentHash(datBytes),
    setToken: stripImportedDatExtension(pack.fileName),
    slotName: sanitizeImportedDatSlotName(pack.fileName),
    source: {
      kind: "bitbusters-custom-pack",
      game: pack.game,
      packId: pack.id,
    } satisfies PersistedImportedDatSource,
  };
}

export async function loadGliderBotLaunchPack(packToken: string): Promise<DownloadedLaunchPack> {
  const canonicalPackPath = canonicalizeGliderBotPackPath(packToken);
  const resolvedPackPath = await resolveGliderBotCaseSensitivePath(canonicalPackPath);
  const datBytes = await fetchDatBytes(buildGliderBotPackUrl(resolvedPackPath));
  return {
    datBytes,
    datHash: await computeDatContentHash(datBytes),
    setToken: packSlotNameFromCanonicalPath(resolvedPackPath).replace(/\.[^.]+$/u, ""),
    slotName: packSlotNameFromCanonicalPath(resolvedPackPath),
  };
}

export function resetUrlLaunchCachesForTest(): void {
  builtInDatHashCache.clear();
  gliderBotDirectoryEntriesCache.clear();
}

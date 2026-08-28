import { IndexedDbImportedDatCatalogStore } from "@level-catalog/impl/IndexedDbImportedDatCatalogStore";
import { computeDatContentHash } from "@level-catalog/impl/importedDatIdentity";
import type { ImportedDatCatalogStore } from "@level-catalog/ports/ImportedDatCatalogStore";
import type {
  HybridCcV1DatConversionResult,
  HybridCcV1DatEntryFailureStatus,
} from "./wasmBridge";
import {
  createLegacyDatSandboxAssetSource,
  LEGACY_DAT_SANDBOX_ASSET_ID,
  LEGACY_DAT_SANDBOX_FILENAME,
  LEGACY_DAT_SANDBOX_NAME,
  type LegacyDatSandboxAssetSource,
} from "./sandbox/legacyDatSandbox";

const officialDatUrls = import.meta.glob(
  [
    "@data/CCLP1.dat",
    "@data/CCLP3.dat",
    "@data/CCLP4.dat",
    "@data/CCLP5.dat",
    "@data/CCLXP2.dat",
  ],
  { import: "default", query: "?url", eager: true },
) as Record<string, string>;

const OFFICIAL_NAMES: Readonly<Record<string, string>> = {
  "CCLP1.dat": "Chip's Challenge Level Pack 1",
  "CCLP3.dat": "Chip's Challenge Level Pack 3",
  "CCLP4.dat": "Chip's Challenge Level Pack 4",
  "CCLP5.dat": "Chip's Challenge Level Pack 5",
  "CCLXP2.dat": "Chip's Challenge Level Pack eXtra 2",
};

export interface HybridCcV1DatCatalogEntry {
  id: string;
  filename: string;
  name: string;
  source: "official" | "sandbox" | "imported";
  sandboxAssets?: LegacyDatSandboxAssetSource;
  loadBytes(): Promise<Uint8Array>;
}

export interface HybridCcV1UnavailableDatEntry {
  entryOrdinal: number;
  levelNumber: number | null;
  status: HybridCcV1DatEntryFailureStatus;
  diagnostic: string;
}

const EXCLUDED_OFFICIAL_DAT_FILENAMES = new Set(["CCLP2.dat"]);

export function isHybridCcV1DatCatalogEntryEligible(
  entry: Pick<HybridCcV1DatCatalogEntry, "filename" | "source">,
): boolean {
  return entry.source !== "official" || !EXCLUDED_OFFICIAL_DAT_FILENAMES.has(entry.filename);
}

export type HybridCcV1DatCatalogLoadResult<T> =
  | {
      status: "available";
      entry: HybridCcV1DatCatalogEntry;
      value: T;
    }
  | {
      status: "unavailable";
      entry: HybridCcV1DatCatalogEntry;
      diagnostic: string;
    };

export function legacyDatSandboxAssetsForEntry(
  entry: HybridCcV1DatCatalogEntry,
): LegacyDatSandboxAssetSource | null {
  return entry.source === "sandbox"
    && entry.id === `sandbox:${LEGACY_DAT_SANDBOX_ASSET_ID}`
    && entry.filename === LEGACY_DAT_SANDBOX_FILENAME
    && entry.sandboxAssets?.assetId === LEGACY_DAT_SANDBOX_ASSET_ID
    ? entry.sandboxAssets
    : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function collectHybridCcV1UnavailableDatEntries(
  conversion: HybridCcV1DatConversionResult,
): HybridCcV1UnavailableDatEntry[] {
  return conversion.entries.flatMap((entry): HybridCcV1UnavailableDatEntry[] => {
    if (entry.status === 0) return [];
    const diagnostics = conversion.diagnostics.filter(
      (diagnostic) => diagnostic.entryOrdinal === entry.entryOrdinal,
    );
    const levelNumber = diagnostics.find((diagnostic) => diagnostic.levelNumber > 0)?.levelNumber
      ?? null;
    return [{
      entryOrdinal: entry.entryOrdinal,
      levelNumber,
      status: entry.status,
      diagnostic: diagnostics.length > 0
        ? diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("; ")
        : `DAT conversion rejected this entry with status ${entry.status} and provided no diagnostic.`,
    }];
  });
}

function officialEntries(): HybridCcV1DatCatalogEntry[] {
  return Object.entries(officialDatUrls)
    .map(([path, url]) => {
      const filename = path.split("/").at(-1) ?? path;
      return {
        id: `official:${filename}`,
        filename,
        name: OFFICIAL_NAMES[filename] ?? filename.replace(/\.dat$/iu, ""),
        source: "official" as const,
        async loadBytes() {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`Could not load ${filename} (${response.status}).`);
          }
          return new Uint8Array(await response.arrayBuffer());
        },
      };
    })
    .sort((left, right) => left.filename.localeCompare(right.filename, undefined, { numeric: true }));
}

export async function loadHybridCcV1DatCatalogEntries<T>(
  entries: readonly HybridCcV1DatCatalogEntry[],
  load: (entry: HybridCcV1DatCatalogEntry, bytes: Uint8Array) => T | Promise<T>,
): Promise<HybridCcV1DatCatalogLoadResult<T>[]> {
  const eligibleEntries = entries.filter(isHybridCcV1DatCatalogEntryEligible);
  return Promise.all(eligibleEntries.map(async (entry): Promise<HybridCcV1DatCatalogLoadResult<T>> => {
    try {
      return {
        status: "available",
        entry,
        value: await load(entry, await entry.loadBytes()),
      };
    } catch (error: unknown) {
      return {
        status: "unavailable",
        entry,
        diagnostic: errorMessage(error),
      };
    }
  }));
}

export class HybridCcV1DatCatalog {
  constructor(
    private readonly store: ImportedDatCatalogStore = new IndexedDbImportedDatCatalogStore(),
    private readonly sandboxAssets: LegacyDatSandboxAssetSource = createLegacyDatSandboxAssetSource(),
  ) {}

  async list(): Promise<HybridCcV1DatCatalogEntry[]> {
    const imported = await this.store.listImportedDatFiles();
    const entries: HybridCcV1DatCatalogEntry[] = [
      ...officialEntries(),
      {
        id: `sandbox:${LEGACY_DAT_SANDBOX_ASSET_ID}`,
        filename: LEGACY_DAT_SANDBOX_FILENAME,
        name: LEGACY_DAT_SANDBOX_NAME,
        source: "sandbox",
        sandboxAssets: this.sandboxAssets,
        loadBytes: () => this.sandboxAssets.loadDatBytes(),
      },
      ...imported.map((entry): HybridCcV1DatCatalogEntry => ({
        id: `imported:${entry.filename}`,
        filename: entry.filename,
        name: entry.filename.replace(/\.dat$/iu, ""),
        source: "imported",
        async loadBytes() {
          return new Uint8Array(entry.datBytes);
        },
      })),
    ];
    return entries.filter(isHybridCcV1DatCatalogEntryEligible);
  }

  async save(file: File): Promise<HybridCcV1DatCatalogEntry> {
    if (!/\.dat$/iu.test(file.name)) {
      throw new Error("HybridCC v1 accepts classic .dat files only.");
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const datHash = await computeDatContentHash(bytes);
    await this.store.saveImportedDatFile({ filename: file.name, datHash, datBytes: bytes });
    return {
      id: `imported:${file.name}`,
      filename: file.name,
      name: file.name.replace(/\.dat$/iu, ""),
      source: "imported",
      async loadBytes() {
        return new Uint8Array(bytes);
      },
    };
  }

  async delete(filename: string): Promise<void> {
    await this.store.deleteImportedDatFile(filename);
  }
}

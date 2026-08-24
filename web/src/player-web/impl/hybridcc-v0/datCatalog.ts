import { IndexedDbImportedDatCatalogStore } from "@level-catalog/impl/IndexedDbImportedDatCatalogStore";
import { computeDatContentHash } from "@level-catalog/impl/importedDatIdentity";

const officialDatUrls = import.meta.glob(
  [
    "@data/CCLP1.dat",
    "@data/CCLP2.dat",
    "@data/CCLP3.dat",
    "@data/CCLP4.dat",
    "@data/CCLP5.dat",
    "@data/CCLXP2.dat",
  ],
  { import: "default", query: "?url", eager: true },
) as Record<string, string>;

const OFFICIAL_NAMES: Readonly<Record<string, string>> = {
  "CCLP1.dat": "Chip's Challenge Level Pack 1",
  "CCLP2.dat": "Chip's Challenge Level Pack 2",
  "CCLP3.dat": "Chip's Challenge Level Pack 3",
  "CCLP4.dat": "Chip's Challenge Level Pack 4",
  "CCLP5.dat": "Chip's Challenge Level Pack 5",
  "CCLXP2.dat": "Chip's Challenge Level Pack eXtra 2",
};

export interface HybridCcDatCatalogEntry {
  id: string;
  filename: string;
  name: string;
  source: "official" | "imported";
  loadBytes(): Promise<Uint8Array>;
}

function officialEntries(): HybridCcDatCatalogEntry[] {
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

export class HybridCcDatCatalog {
  private readonly store = new IndexedDbImportedDatCatalogStore();

  async list(): Promise<HybridCcDatCatalogEntry[]> {
    const imported = await this.store.listImportedDatFiles();
    return [
      ...officialEntries(),
      ...imported.map((entry): HybridCcDatCatalogEntry => ({
        id: `imported:${entry.filename}`,
        filename: entry.filename,
        name: entry.filename.replace(/\.dat$/iu, ""),
        source: "imported",
        async loadBytes() {
          return new Uint8Array(entry.datBytes);
        },
      })),
    ];
  }

  async save(file: File): Promise<HybridCcDatCatalogEntry> {
    if (!/\.dat$/iu.test(file.name)) {
      throw new Error("HybridCC v0 accepts classic .dat files only.");
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

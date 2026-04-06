import { describe, expect, it, vi } from "vitest";
import { BrowserLevelRepository } from "@level-catalog/impl/BrowserLevelRepository";
import type { ImportedDatCatalogStore, PersistedImportedDatFile } from "@level-catalog/ports/ImportedDatCatalogStore";

function encodePassword(password: string): number[] {
  return Array.from(password, (char) => char.charCodeAt(0) ^ 0x99);
}

function encodeLatin1(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0));
}

function createLevelData(number: number, name: string, topFileCode = 1, bottomFileCode = 0, password = "ABCD"): Uint8Array {
  const upperLayer = Uint8Array.from([topFileCode]);
  const lowerLayer = Uint8Array.from([bottomFileCode]);
  const metadata = Uint8Array.from([
    3,
    name.length,
    ...encodeLatin1(name),
    6,
    password.length,
    ...encodePassword(password),
  ]);

  return Uint8Array.from([
    number,
    0,
    10,
    0,
    0,
    0,
    0,
    0,
    upperLayer.length,
    0,
    ...upperLayer,
    lowerLayer.length,
    0,
    ...lowerLayer,
    metadata.length,
    0,
    ...metadata,
  ]);
}

function createDatFile(levels: Uint8Array[]): Uint8Array {
  const bytes = [0xac, 0xaa, 0x02, 0x00, levels.length, 0x00];
  for (const level of levels) {
    bytes.push(level.length & 0xff, (level.length >> 8) & 0xff, ...level);
  }
  return Uint8Array.from(bytes);
}

class MemoryImportedDatCatalogStore implements ImportedDatCatalogStore {
  private readonly entries = new Map<string, PersistedImportedDatFile>();
  listImportedDatFilesCallCount = 0;

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    this.listImportedDatFilesCallCount += 1;
    return [...this.entries.values()].map((entry) => ({
      filename: entry.filename,
      datHash: entry.datHash,
      datBytes: new Uint8Array(entry.datBytes),
    }));
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    this.entries.set(entry.filename, {
      filename: entry.filename,
      datHash: entry.datHash,
      datBytes: new Uint8Array(entry.datBytes),
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    this.entries.delete(filename);
  }
}

describe("BrowserLevelRepository", () => {
  it("imports a local DAT file as playable MS and Lynx catalog entries", async () => {
    const repository = new BrowserLevelRepository();
    const dat = createDatFile([
      createLevelData(1, "Imported Stack\\1", 1, 0),
      createLevelData(2, "Imported Stack\\2", 2, 0),
      createLevelData(3, "Imported Solo", 3, 0),
    ]);

    const entries = await repository.importDatBytes("Imported.dat", dat);
    const msEntry = entries.find((entry) => entry.ruleset === "MS");
    const lynxEntry = entries.find((entry) => entry.ruleset === "Lynx");

    expect(entries).toHaveLength(2);
    expect(msEntry?.filebase).toBe("Imported (MS)");
    expect(lynxEntry?.filebase).toBe("Imported (Lynx)");
    expect(msEntry?.levels.map((level) => level.name)).toEqual(["Imported Stack", "Imported Solo"]);
    expect(lynxEntry?.levels.map((level) => level.number)).toEqual([1, 2]);

    const loaded = await repository.loadLevel({
      seriesFile: msEntry!.filebase,
      levelNumber: 1,
      ruleset: "MS",
    });

    expect(loaded.levelData).toEqual(loaded.layerData[0]);
    expect(loaded.layerData).toHaveLength(2);
    expect((await repository.listImportedCatalogEntries()).map((entry) => entry.filebase)).toEqual([
      "Imported (MS)",
      "Imported (Lynx)",
    ]);
  });

  it("restores imported DAT sets from persistent storage on startup", async () => {
    const store = new MemoryImportedDatCatalogStore();
    const repository = new BrowserLevelRepository(store);
    const dat = createDatFile([
      createLevelData(1, "Imported Stack\\1", 1, 0),
      createLevelData(2, "Imported Solo", 2, 0),
    ]);

    await repository.importDatFile({
      name: "Imported.dat",
      async arrayBuffer() {
        return dat.buffer.slice(dat.byteOffset, dat.byteOffset + dat.byteLength);
      },
    } as File);

    const restoredRepository = new BrowserLevelRepository(store);
    const restoredEntries = await restoredRepository.listImportedCatalogEntries();

    expect(restoredEntries.map((entry) => entry.filebase)).toEqual(["Imported (MS)", "Imported (Lynx)"]);

    const loaded = await restoredRepository.loadLevel({
      seriesFile: "Imported (MS)",
      levelNumber: 1,
      ruleset: "MS",
    });

    expect(loaded.layerData.length).toBeGreaterThan(0);
    expect(loaded.levelData).toEqual(loaded.layerData[0]);
  });

  it("deletes imported DAT sets from memory and persistent storage", async () => {
    const store = new MemoryImportedDatCatalogStore();
    const repository = new BrowserLevelRepository(store);
    const dat = createDatFile([createLevelData(1, "Imported Solo", 2, 0)]);

    await repository.importDatFile({
      name: "Imported.dat",
      async arrayBuffer() {
        return dat.buffer.slice(dat.byteOffset, dat.byteOffset + dat.byteLength);
      },
    } as File);

    await repository.deleteImportedDatFile("Imported.dat");

    expect(await repository.listImportedCatalogEntries()).toEqual([]);
    expect(await store.listImportedDatFiles()).toEqual([]);
  });

  it("replaces an imported slot when the DAT content changes", async () => {
    const repository = new BrowserLevelRepository();
    const firstDat = createDatFile([createLevelData(1, "Original Level", 1, 0)]);
    const secondDat = createDatFile([createLevelData(1, "Updated Level", 2, 0)]);

    await repository.importDatBytes("MyPack.dat", firstDat);
    await repository.importDatBytes("MyPack.dat", secondDat);

    const entries = await repository.listImportedCatalogEntries();
    expect(entries.map((entry) => entry.filebase)).toEqual(["MyPack (MS)", "MyPack (Lynx)"]);
    expect(entries.find((entry) => entry.ruleset === "MS")?.levels.map((level) => level.name)).toEqual(["Updated Level"]);
  });

  it("does not hydrate imported DAT storage when loading a built-in series", async () => {
    const store = new MemoryImportedDatCatalogStore();
    await store.saveImportedDatFile({
      filename: "Imported.dat",
      datHash: "hash",
      datBytes: createDatFile([createLevelData(1, "Imported Solo", 2, 0)]),
    });
    const repository = new BrowserLevelRepository(store) as BrowserLevelRepository & {
      dataFiles: Record<string, () => Promise<string>>;
      seriesConfigs: Record<string, () => Promise<string>>;
    };

    repository.seriesConfigs = {
      "/virtual/sets/TestBuiltIn.dac": async () => "file=TestBuiltIn.dat\nruleset=MS\n",
    };
    repository.dataFiles = {
      "/virtual/data/TestBuiltIn.dat": async () => "https://example.invalid/TestBuiltIn.dat",
    };

    const response = {
      ok: true,
      async arrayBuffer() {
        const dat = createDatFile([createLevelData(1, "Built In", 4, 0)]);
        return dat.buffer.slice(dat.byteOffset, dat.byteOffset + dat.byteLength);
      },
    };
    const fetchMock = vi.fn(async () => response as Response);
    vi.stubGlobal("fetch", fetchMock);

    try {
      const loaded = await repository.loadLevel({
        seriesFile: "TestBuiltIn.dac",
        levelNumber: 1,
        ruleset: "MS",
      });

      expect(loaded.layerData.length).toBeGreaterThan(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(store.listImportedDatFilesCallCount).toBe(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("hydrates imported DAT storage on demand when an imported series is requested", async () => {
    const store = new MemoryImportedDatCatalogStore();
    const dat = createDatFile([createLevelData(1, "Imported Solo", 2, 0)]);
    await store.saveImportedDatFile({
      filename: "Imported.dat",
      datHash: "hash",
      datBytes: dat,
    });
    const repository = new BrowserLevelRepository(store);

    const loaded = await repository.loadLevel({
      seriesFile: "Imported (MS)",
      levelNumber: 1,
      ruleset: "MS",
    });

    expect(loaded.levelData).toEqual(loaded.layerData[0]);
    expect(store.listImportedDatFilesCallCount).toBe(1);
  });
});

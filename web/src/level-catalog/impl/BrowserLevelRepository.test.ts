import { describe, expect, it } from "vitest";
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
  private readonly entries = new Map<string, Uint8Array>();

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    return [...this.entries.entries()].map(([filename, datBytes]) => ({
      filename,
      datBytes: new Uint8Array(datBytes),
    }));
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    this.entries.set(entry.filename, new Uint8Array(entry.datBytes));
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

    const entries = repository.importDatBytes("Imported.dat", dat);
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
});

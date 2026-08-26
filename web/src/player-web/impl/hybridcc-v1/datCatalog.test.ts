import { describe, expect, it } from "vitest";
import type {
  ImportedDatCatalogStore,
  PersistedImportedDatFile,
} from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  collectHybridCcV1UnavailableDatEntries,
  HybridCcV1DatCatalog,
  loadHybridCcV1DatCatalogEntries,
  type HybridCcV1DatCatalogEntry,
} from "./datCatalog";
import type { HybridCcV1DatConversionResult } from "./wasmBridge";

class MemoryImportedDatCatalogStore implements ImportedDatCatalogStore {
  readonly entries = new Map<string, PersistedImportedDatFile>();

  async listImportedDatFiles(): Promise<PersistedImportedDatFile[]> {
    return [...this.entries.values()];
  }

  async saveImportedDatFile(entry: PersistedImportedDatFile): Promise<void> {
    this.entries.set(entry.filename, {
      ...entry,
      datBytes: new Uint8Array(entry.datBytes),
    });
  }

  async deleteImportedDatFile(filename: string): Promise<void> {
    this.entries.delete(filename);
  }
}

function entry(id: string, bytes: readonly number[]): HybridCcV1DatCatalogEntry {
  return {
    id,
    filename: `${id}.dat`,
    name: id,
    source: "imported",
    async loadBytes() {
      return Uint8Array.from(bytes);
    },
  };
}

describe("HybridCC v1 DAT catalog", () => {
  it("returns defensive raw-byte copies for DATs shared with the Tile World catalog", async () => {
    const store = new MemoryImportedDatCatalogStore();
    store.entries.set("local.dat", {
      filename: "local.dat",
      datHash: "fixture-hash",
      datBytes: Uint8Array.of(1, 2, 3),
    });
    const catalog = new HybridCcV1DatCatalog(store);

    const imported = (await catalog.list()).find((candidate) => candidate.id === "imported:local.dat");
    expect(imported).toBeDefined();
    const firstRead = await imported!.loadBytes();
    firstRead[0] = 99;

    expect([...await imported!.loadBytes()]).toEqual([1, 2, 3]);
    expect([...store.entries.get("local.dat")!.datBytes]).toEqual([1, 2, 3]);
  });

  it("isolates an unavailable DAT and continues inspecting the other entries in order", async () => {
    const entries = [entry("one", [1]), entry("broken", [2]), entry("three", [3])];

    const results = await loadHybridCcV1DatCatalogEntries(entries, async (candidate, bytes) => {
      if (candidate.id === "broken") throw new Error("converter rejected entry 7: unknown DAT tile 0x71");
      return bytes[0]! * 10;
    });

    expect(results).toEqual([
      { status: "available", entry: entries[0], value: 10 },
      {
        status: "unavailable",
        entry: entries[1],
        diagnostic: "converter rejected entry 7: unknown DAT tile 0x71",
      },
      { status: "available", entry: entries[2], value: 30 },
    ]);
  });

  it("describes non-Error converter failures without losing their catalog entry", async () => {
    const failed = entry("broken", [2]);

    const [result] = await loadHybridCcV1DatCatalogEntries([failed], () => Promise.reject("bad DAT"));

    expect(result).toEqual({
      status: "unavailable",
      entry: failed,
      diagnostic: "bad DAT",
    });
  });

  it("accepts DAT uploads only", async () => {
    const catalog = new HybridCcV1DatCatalog(new MemoryImportedDatCatalogStore());
    const wrongFormat = new File([Uint8Array.of(1, 2, 3)], "level.c2g");

    await expect(catalog.save(wrongFormat)).rejects.toThrow(
      "HybridCC v1 accepts classic .dat files only.",
    );
  });

  it("retains one level-numbered user diagnostic for every failed entry in a partial conversion", () => {
    const conversion = {
      fileStatus: 0,
      entries: [
        { entryOrdinal: 1, status: 0, requiredChips: 0, diagnosticCount: 0, nativeLevel: {} },
        { entryOrdinal: 78, status: 4, requiredChips: 0, diagnosticCount: 1 },
        { entryOrdinal: 131, status: 4, requiredChips: 0, diagnosticCount: 1 },
      ],
      diagnostics: [
        {
          severity: 2,
          entryOrdinal: 78,
          levelNumber: 78,
          cellIndex: 12,
          tileCode: 0x71,
          sourceLayer: 1,
          code: "dat.unsupported_composition.multiple_pickup",
          message: "The DAT cell has more than one pickup.",
          codeBytes: new Uint8Array(),
          messageBytes: new Uint8Array(),
        },
        {
          severity: 2,
          entryOrdinal: 131,
          levelNumber: 131,
          cellIndex: 27,
          tileCode: 0x72,
          sourceLayer: 1,
          code: "dat.unsupported_composition.multiple_device",
          message: "The DAT cell has more than one device.",
          codeBytes: new Uint8Array(),
          messageBytes: new Uint8Array(),
        },
      ],
    } as unknown as HybridCcV1DatConversionResult;

    expect(collectHybridCcV1UnavailableDatEntries(conversion)).toEqual([
      {
        entryOrdinal: 78,
        levelNumber: 78,
        status: 4,
        diagnostic: "dat.unsupported_composition.multiple_pickup: The DAT cell has more than one pickup.",
      },
      {
        entryOrdinal: 131,
        levelNumber: 131,
        status: 4,
        diagnostic: "dat.unsupported_composition.multiple_device: The DAT cell has more than one device.",
      },
    ]);
  });
});

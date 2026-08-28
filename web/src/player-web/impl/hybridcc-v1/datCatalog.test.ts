import { describe, expect, it, vi } from "vitest";
import type {
  ImportedDatCatalogStore,
  PersistedImportedDatFile,
} from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  collectHybridCcV1UnavailableDatEntries,
  HybridCcV1DatCatalog,
  legacyDatSandboxAssetsForEntry,
  loadHybridCcV1DatCatalogEntries,
  type HybridCcV1DatCatalogEntry,
} from "./datCatalog";
import type { HybridCcV1DatConversionResult } from "./wasmBridge";
import {
  LEGACY_DAT_SANDBOX_ASSET_ID,
  type LegacyDatSandboxAssetSource,
} from "./sandbox/legacyDatSandbox";

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
  it("omits only the built-in official CCLP2 pack", async () => {
    const store = new MemoryImportedDatCatalogStore();
    store.entries.set("CCLP2.dat", {
      filename: "CCLP2.dat",
      datHash: "uploaded-cclp2-name",
      datBytes: Uint8Array.of(1, 2, 3),
    });
    const entries = await new HybridCcV1DatCatalog(store).list();

    expect(entries.filter((candidate) => candidate.source === "official").map(({ filename }) => filename))
      .toEqual(["CCLP1.dat", "CCLP3.dat", "CCLP4.dat", "CCLP5.dat", "CCLXP2.dat"]);
    expect(entries).not.toContainEqual(expect.objectContaining({
      id: "official:CCLP2.dat",
      source: "official",
    }));
    expect(entries).toContainEqual(expect.objectContaining({
      id: "imported:CCLP2.dat",
      source: "imported",
    }));
  });

  it("includes the built-in sandbox immediately without writing it to local storage", async () => {
    const sandboxAssets: LegacyDatSandboxAssetSource = {
      assetId: LEGACY_DAT_SANDBOX_ASSET_ID,
      async loadDatBytes() { return Uint8Array.of(1, 2, 3); },
      async loadHintBytes() { return new Uint8Array(); },
      async loadReplayIndexBytes() { return new Uint8Array(); },
      async loadReplayBytes() { return new Uint8Array(); },
    };
    const catalog = new HybridCcV1DatCatalog(new MemoryImportedDatCatalogStore(), sandboxAssets);

    const sandbox = (await catalog.list()).find((candidate) => candidate.source === "sandbox");

    expect(sandbox).toMatchObject({
      id: "sandbox:legacy_dat_sandbox",
      filename: "legacy_dat_sandbox.dat",
      name: "Legacy DAT Sandbox",
      sandboxAssets,
    });
    expect([...await sandbox!.loadBytes()]).toEqual([1, 2, 3]);
    expect(legacyDatSandboxAssetsForEntry(sandbox!)).toBe(sandboxAssets);
    expect(legacyDatSandboxAssetsForEntry({
      ...sandbox!,
      id: "imported:legacy_dat_sandbox.dat",
      source: "imported",
    })).toBeNull();
  });

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

  it("never reads or converts an excluded official CCLP2 entry", async () => {
    const readCclp2 = vi.fn(async () => Uint8Array.of(2));
    const cclp2: HybridCcV1DatCatalogEntry = {
      id: "official:CCLP2.dat",
      filename: "CCLP2.dat",
      name: "Chip's Challenge Level Pack 2",
      source: "official",
      loadBytes: readCclp2,
    };
    const allowed = entry("allowed", [3]);
    const convert = vi.fn(async (_candidate: HybridCcV1DatCatalogEntry, bytes: Uint8Array) => bytes[0]);

    const results = await loadHybridCcV1DatCatalogEntries([cclp2, allowed], convert);

    expect(results).toEqual([{ status: "available", entry: allowed, value: 3 }]);
    expect(readCclp2).not.toHaveBeenCalled();
    expect(convert).toHaveBeenCalledOnce();
    expect(convert).toHaveBeenCalledWith(allowed, Uint8Array.of(3));
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

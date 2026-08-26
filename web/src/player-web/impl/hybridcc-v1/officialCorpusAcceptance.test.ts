import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { ImportedDatCatalogStore } from "@level-catalog/ports/ImportedDatCatalogStore";
import {
  HybridCcV1DatCatalog,
  type HybridCcV1DatCatalogEntry,
} from "./datCatalog";
import { loadHybridCcV1Wasm } from "./loadWasm";
import {
  hybridCcV1ActorTile,
  hybridCcV1Direction,
  projectHybridCcV1Cell,
} from "./renderProjection";
import {
  convertHybridCcV1Dat,
  createHybridCcV1Engine,
  isHybridCcV1ConvertedLevel,
} from "./wasmBridge";

const OFFICIAL_FILENAMES = [
  "CCLP1.dat",
  "CCLP2.dat",
  "CCLP3.dat",
  "CCLP4.dat",
  "CCLP5.dat",
  "CCLXP2.dat",
] as const;
const MAXIMUM_OFFICIAL_PACKS = OFFICIAL_FILENAMES.length;
const MAXIMUM_DAT_ENTRIES = 894;
const MAXIMUM_PLAYABLE_LEVELS = 892;
const MAXIMUM_CELLS_PER_LEVEL = 65_536;
const MAXIMUM_PROJECTED_CELLS = MAXIMUM_DAT_ENTRIES * 32 * 32;
const ACCEPTANCE_TIMEOUT_MS = 60_000;

const emptyImportedStore: ImportedDatCatalogStore = {
  async listImportedDatFiles() { return []; },
  async saveImportedDatFile() { throw new Error("acceptance test does not write imported DATs"); },
  async deleteImportedDatFile() { throw new Error("acceptance test does not delete imported DATs"); },
};

function filenameForRequest(input: string | URL | Request): string | null {
  const url = input instanceof Request ? input.url : String(input);
  return OFFICIAL_FILENAMES.find((filename) => url.includes(filename)) ?? null;
}

async function readOfficialFixture(filename: string): Promise<Uint8Array> {
  return new Uint8Array(
    await readFile(new URL(`../../../../../data/${filename}`, import.meta.url)),
  );
}

function context(entry: HybridCcV1DatCatalogEntry, ordinal: number, level: number): string {
  return `${entry.filename} entry ${ordinal} (level ${level})`;
}

describe("Hybrid v1 real-Wasm official corpus acceptance", () => {
  it("creates, snapshots, validates, and projects every convertible default official level", async () => {
    vi.stubGlobal("fetch", async (input: string | URL | Request) => {
      const filename = filenameForRequest(input);
      if (filename === null) return new Response(null, { status: 404 });
      const bytes = await readOfficialFixture(filename);
      return new Response(Uint8Array.from(bytes).buffer, { status: 200 });
    });

    try {
      const module = await loadHybridCcV1Wasm();
      const entries = (await new HybridCcV1DatCatalog(emptyImportedStore).list())
        .filter((entry) => entry.source === "official");
      if (entries.length > MAXIMUM_OFFICIAL_PACKS) {
        throw new Error(`official catalog exceeded ${MAXIMUM_OFFICIAL_PACKS} packs`);
      }
      expect(entries.map((entry) => entry.filename)).toEqual([...OFFICIAL_FILENAMES].sort());

      let datEntryCount = 0;
      let playableLevelCount = 0;
      let projectedCellCount = 0;
      let projectedActorCount = 0;
      const rejected: Array<[string, number, number]> = [];

      for (const entry of entries) {
        const conversion = convertHybridCcV1Dat(module, await entry.loadBytes());
        datEntryCount += conversion.entries.length;
        if (datEntryCount > MAXIMUM_DAT_ENTRIES) {
          throw new Error(`official corpus exceeded ${MAXIMUM_DAT_ENTRIES} DAT entries`);
        }

        for (const candidate of conversion.entries) {
          if (!isHybridCcV1ConvertedLevel(candidate)) {
            rejected.push([entry.filename, candidate.entryOrdinal, candidate.status]);
            continue;
          }
          playableLevelCount += 1;
          if (playableLevelCount > MAXIMUM_PLAYABLE_LEVELS) {
            throw new Error(`official corpus exceeded ${MAXIMUM_PLAYABLE_LEVELS} playable levels`);
          }

          const label = context(
            entry,
            candidate.entryOrdinal,
            candidate.nativeLevel.number,
          );
          const engine = createHybridCcV1Engine(module, candidate.nativeLevel, 0);
          try {
            const snapshot = engine.snapshot();
            if (snapshot.cells.length > MAXIMUM_CELLS_PER_LEVEL) {
              throw new Error(`${label} exceeded ${MAXIMUM_CELLS_PER_LEVEL} cells`);
            }
            const invariant = engine.invariantStatus();
            if (invariant !== 0) {
              throw new Error(`${label} failed engine invariant ${invariant}`);
            }

            for (let index = 0; index < snapshot.cells.length; index += 1) {
              try {
                const projected = projectHybridCcV1Cell(
                  snapshot.cells[index]!,
                  index,
                  snapshot.header.width,
                );
                if (!Number.isInteger(projected.top.id) || !Number.isInteger(projected.bottom.id)) {
                  throw new Error("projection returned a non-integer tile identity");
                }
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`${label}, cell ${index}: ${message}`);
              }
            }

            for (const actor of snapshot.actors) {
              if (!actor.alive) continue;
              try {
                const actorTile = hybridCcV1ActorTile(actor.kind);
                const actorDirection = hybridCcV1Direction(actor.direction);
                if (!Number.isInteger(actorTile) || !Number.isInteger(actorDirection)) {
                  throw new Error("projection returned a non-integer actor fact");
                }
              } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`${label}, actor ${actor.id}: ${message}`);
              }
              projectedActorCount += 1;
            }
            projectedCellCount += snapshot.cells.length;
            if (projectedCellCount > MAXIMUM_PROJECTED_CELLS) {
              throw new Error(`official corpus exceeded ${MAXIMUM_PROJECTED_CELLS} projected cells`);
            }
          } finally {
            engine.dispose();
          }
        }
      }

      expect(datEntryCount).toBe(894);
      expect(playableLevelCount).toBe(892);
      expect(projectedCellCount).toBe(892 * 32 * 32);
      expect(projectedActorCount).toBe(37_040);
      expect(rejected).toEqual([
        ["CCLP2.dat", 78, 4],
        ["CCLP2.dat", 131, 4],
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  }, ACCEPTANCE_TIMEOUT_MS);
});

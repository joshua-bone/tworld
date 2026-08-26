import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import createHybridCcV1Module from "./engine/hybridcc_v1_wasm.js";
import { collectHybridCcV1UnavailableDatEntries } from "./datCatalog";
import { hybridCcV1Series } from "./renderProjection";
import {
  buildHybridCcV1Families,
  hybridCcV1InitialCatalogMessage,
} from "./uiModel";
import {
  convertHybridCcV1Dat,
  isHybridCcV1ConvertedLevel,
} from "./wasmBridge";

describe("HybridCC v1 partial DAT conversion UI", () => {
  it("keeps all 147 convertible CCLP2 levels playable and names failures 78 and 131", async () => {
    const wasmUrl = new URL("./engine/hybridcc_v1_wasm.wasm", import.meta.url).href;
    const module = await createHybridCcV1Module({ locateFile: () => wasmUrl });
    const bytes = new Uint8Array(
      await readFile(new URL("../../../../../data/CCLP2.dat", import.meta.url)),
    );
    const conversion = convertHybridCcV1Dat(module, bytes);
    const levels = conversion.entries.filter(isHybridCcV1ConvertedLevel);
    const unavailableEntries = collectHybridCcV1UnavailableDatEntries(conversion);
    const entry = {
      id: "official:CCLP2.dat",
      filename: "CCLP2.dat",
      name: "Chip's Challenge Level Pack 2",
      source: "official" as const,
      async loadBytes() { return new Uint8Array(bytes); },
    };
    const series = hybridCcV1Series("hybrid-v1:official:CCLP2.dat", entry.name, levels);
    const issuesByEntryId = new Map([[entry.id, unavailableEntries]]);
    const [family] = buildHybridCcV1Families(
      [entry],
      new Map([[entry.id, series]]),
      new Map(),
      issuesByEntryId,
    );

    expect(series.levels).toHaveLength(147);
    expect(family?.launchEntries.Hybrid).toBe(series);
    expect(family?.sidebarSummary).toBe("147 playable · 2 unavailable in Hybrid v1.");
    expect(unavailableEntries.map(({ entryOrdinal, levelNumber }) => [entryOrdinal, levelNumber]))
      .toEqual([[78, 78], [131, 131]]);
    expect(family?.context).toContain(
      "Level 78 — dat.unsupported_composition.multiple_pickup",
    );
    expect(family?.context).toContain(
      "Level 131 — dat.unsupported_composition.multiple_device",
    );
    expect(hybridCcV1InitialCatalogMessage(1, new Map(), issuesByEntryId)).toContain(
      "CCLP2.dat: Level 78",
    );
  });
});

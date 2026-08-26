import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HybridCC v1 shared browser host", () => {
  it("delegates the player lifecycle to PlayerApp", async () => {
    const source = await readFile(new URL("./HybridCcV1App.tsx", import.meta.url), "utf8");

    expect(source).toContain("<PlayerApp");
    expect(source).toContain('catalogSource="provided"');
    expect(source).toContain('rulesetOptions={["Hybrid"]}');
    expect(source).toContain("HYBRID_CC_V1_RULESET_LABEL");
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("requestAnimationFrame");
    expect(source).not.toContain("LegacyCanvasScreen");
    expect(source).not.toContain("BrowserSoundEffectsPlayer");
    expect(source).not.toContain("HybridCcV1ResultSheet");
  });

  it("uses the shared profile store rather than maintaining private completion state", async () => {
    const source = await readFile(new URL("./HybridCcV1App.tsx", import.meta.url), "utf8");

    expect(source).toContain("services.profileStore.loadLevelProgressSummaries()");
    expect(source).toContain("onLevelProgressSaved");
    expect(source).toContain("mergeLevelProgressSummaries");
    expect(source).not.toContain("localStorage");
  });

  it("hands raw DAT bytes to the Hybrid converter and isolates a failed catalog entry", async () => {
    const source = await readFile(new URL("./HybridCcV1App.tsx", import.meta.url), "utf8");

    expect(source).toContain("loadHybridCcV1DatCatalogEntries");
    expect(source).toContain("convertHybridCcV1Dat(module, bytes)");
    expect(source).toContain("loadErrorsByEntryId.get(familyId)");
    expect(source).toContain("This DAT set has no playable Hybrid v1 levels.");
    expect(source).not.toContain("new DataView");
    expect(source).not.toContain("parseDat");
  });

  it("keeps partial conversions playable while wiring their failed levels into visible catalog diagnostics", async () => {
    const source = await readFile(new URL("./HybridCcV1App.tsx", import.meta.url), "utf8");

    expect(source).toContain("collectHybridCcV1UnavailableDatEntries(conversion)");
    expect(source).toContain("setUnavailableEntriesByEntryId(nextUnavailableEntries);");
    expect(source).toContain(
      "buildHybridCcV1Families(entries, seriesByEntryId, loadErrorsByEntryId, unavailableEntriesByEntryId)",
    );
    expect(source).toContain(
      "hybridCcV1InitialCatalogMessage(nextSeries.size, nextLoadErrors, nextUnavailableEntries)",
    );
    expect(source).toContain("unavailableEntriesByEntryId.get(familyId)");
  });
});

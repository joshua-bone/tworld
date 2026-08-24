import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("HybridCC v0 shared browser host", () => {
  it("delegates gameplay lifecycle to PlayerApp instead of rebuilding clocks, audio, canvas, or overlays", async () => {
    const source = await readFile(new URL("./HybridCcV0App.tsx", import.meta.url), "utf8");

    expect(source).toContain("<PlayerApp");
    expect(source).toContain('catalogSource="provided"');
    expect(source).toContain('rulesetOptions={["Hybrid"]}');
    expect(source).not.toContain("setInterval");
    expect(source).not.toContain("LegacyCanvasScreen");
    expect(source).not.toContain("BrowserSoundEffectsPlayer");
    expect(source).not.toContain("HybridCcV0ResultSheet");
  });

  it("isolates failed saved DATs until the player selects that catalog entry", async () => {
    const source = await readFile(new URL("./HybridCcV0App.tsx", import.meta.url), "utf8");

    expect(source).toContain(
      "setMessage(hybridCcV0InitialCatalogMessage(nextSeries.size, nextLoadErrors));",
    );
    expect(source).toContain(
      "setMessage(loadErrorsByEntryId.get(familyId) ?? \"This DAT set has no playable Hybrid v0 levels.\");",
    );
    expect(source).not.toContain("failures.length > 0");
  });
});

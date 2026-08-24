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
});

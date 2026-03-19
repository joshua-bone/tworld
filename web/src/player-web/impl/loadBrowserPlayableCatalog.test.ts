import { describe, expect, it } from "vitest";
import { resolveModernBootstrapCatalogOptions } from "@player-web/impl/loadBrowserPlayableCatalog";

describe("resolveModernBootstrapCatalogOptions", () => {
  it("falls back to the default bootstrap set when no prior selection exists", () => {
    expect(resolveModernBootstrapCatalogOptions(null, ["CCLP1-MS.dac", "CCLP1-Lynx.dac"])).toEqual({
      includeImported: false,
      seriesFiles: ["CCLP1-MS.dac", "CCLP1-Lynx.dac"],
    });
  });

  it("prioritizes the saved built-in series file when one exists", () => {
    expect(
      resolveModernBootstrapCatalogOptions(
        { seriesFile: "CCLP4-Lynx.dac", levelNumber: 12 },
        ["CCLP1-MS.dac", "CCLP1-Lynx.dac", "CCLP4-Lynx.dac"],
      ),
    ).toEqual({
      includeImported: false,
      seriesFiles: ["CCLP4-Lynx.dac"],
    });
  });

  it("prioritizes uploaded sets when the saved selection is not a built-in series file", () => {
    expect(
      resolveModernBootstrapCatalogOptions(
        { seriesFile: "MyPack (Lynx)", levelNumber: 3 },
        ["CCLP1-MS.dac", "CCLP1-Lynx.dac", "CCLP4-Lynx.dac"],
      ),
    ).toEqual({
      includeImported: true,
      seriesFiles: [],
    });
  });
});

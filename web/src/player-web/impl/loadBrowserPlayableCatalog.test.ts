import { describe, expect, it } from "vitest";
import {
  resolveModernBootstrapCatalogOptions,
  resolveModernDeferredCatalogBatches,
} from "@player-web/impl/loadBrowserPlayableCatalog";

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
        ["CCLP1-MS.dac", "CCLP1-Lynx.dac", "CCLP4-MS.dac", "CCLP4-Lynx.dac"],
      ),
    ).toEqual({
      includeImported: false,
      seriesFiles: ["CCLP4-MS.dac", "CCLP4-Lynx.dac"],
    });
  });

  it("bootstraps all wrappers in the saved family so a replaced DAT stays authoritative for both rulesets", () => {
    expect(
      resolveModernBootstrapCatalogOptions(
        { seriesFile: "3DINTRO-MS.dac", levelNumber: 2 },
        ["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"],
      ),
    ).toEqual({
      includeImported: false,
      seriesFiles: ["3DINTRO-MS.dac", "3DINTRO-Lynx.dac"],
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
      seriesFiles: ["CCLP1-MS.dac", "CCLP1-Lynx.dac"],
    });
  });
});

describe("resolveModernDeferredCatalogBatches", () => {
  it("defers every non-bootstrap built-in wrapper when starting from the default set", () => {
    expect(
      resolveModernDeferredCatalogBatches(
        null,
        ["CCLP1-MS.dac", "CCLP1-Lynx.dac", "CCLP4-MS.dac", "CCLP4-Lynx.dac"],
      ),
    ).toEqual([["CCLP4-MS.dac"], ["CCLP4-Lynx.dac"]]);
  });

  it("defers every non-family wrapper when bootstrapping a specific built-in family", () => {
    expect(
      resolveModernDeferredCatalogBatches(
        { seriesFile: "CCLP4-Lynx.dac", levelNumber: 12 },
        ["CCLP1-MS.dac", "CCLP1-Lynx.dac", "CCLP4-MS.dac", "CCLP4-Lynx.dac"],
      ),
    ).toEqual([["CCLP1-MS.dac"], ["CCLP1-Lynx.dac"]]);
  });

  it("prioritizes the restored family category before other categories", () => {
    expect(
      resolveModernDeferredCatalogBatches(
        { seriesFile: "3DINTRO-Lynx.dac", levelNumber: 2 },
        [
          "CCLP1-MS.dac",
          "CCLP1-Lynx.dac",
          "3DINTRO-MS.dac",
          "3DINTRO-Lynx.dac",
          "po100t-MS.dac",
          "po100t-Lynx.dac",
          "to100t-MS.dac",
          "to100t-Lynx.dac",
        ],
      ),
    ).toEqual([
      ["po100t-MS.dac"],
      ["po100t-Lynx.dac"],
      ["to100t-MS.dac"],
      ["to100t-Lynx.dac"],
      ["CCLP1-MS.dac"],
      ["CCLP1-Lynx.dac"],
    ]);
  });

  it("keeps the default official bootstrap family live when bootstrapping an uploaded set", () => {
    expect(
      resolveModernDeferredCatalogBatches(
        { seriesFile: "MyPack (Lynx)", levelNumber: 3 },
        ["CCLP1-MS.dac", "CCLP1-Lynx.dac", "CCLP4-Lynx.dac"],
      ),
    ).toEqual([["CCLP4-Lynx.dac"]]);
  });
});

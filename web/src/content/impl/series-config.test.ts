import { describe, expect, it } from "vitest";
import { parseSeriesConfig } from "@content/api/seriesConfig";

describe("seriesConfig", () => {
  it("parses known directives and preserves default booleans", () => {
    expect(parseSeriesConfig("file=CCLP1.dat\nlastlevel=149\nruleset=Lynx")).toEqual({
      mapFile: "CCLP1.dat",
      finalLevel: 149,
      ruleset: "Lynx",
      ignorePasswords: false,
      fixLynx: false,
      fileInSetsDir: false,
    });
  });

  it("rejects file directives that include a path", () => {
    expect(() => parseSeriesConfig("file=../CCLP1.dat")).toThrowError(/may not contain a path/);
  });
});

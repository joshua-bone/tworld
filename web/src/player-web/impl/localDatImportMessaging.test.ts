import { describe, expect, it } from "vitest";
import { describeLocalDatImportMessage } from "@player-web/impl/localDatImportMessaging";

describe("describeLocalDatImportMessage", () => {
  it("describes a brand-new modern import", () => {
    expect(
      describeLocalDatImportMessage({
        existingFilenames: new Set<string>(),
        failureMessages: [],
        successfulFilenames: ["Imported.dat"],
        variant: "modern",
      }),
    ).toBe("Imported Imported.dat. It now appears under Local Sets.");
  });

  it("describes a same-name replacement explicitly", () => {
    expect(
      describeLocalDatImportMessage({
        existingFilenames: new Set<string>(["Imported.dat"]),
        failureMessages: [],
        successfulFilenames: ["Imported.dat"],
        variant: "classic",
      }),
    ).toBe("Replaced existing local set Imported.dat. MS and Lynx entries were updated in the series list.");
  });

  it("describes mixed import and replacement batches", () => {
    expect(
      describeLocalDatImportMessage({
        existingFilenames: new Set<string>(["Old.dat"]),
        failureMessages: [],
        successfulFilenames: ["New.dat", "Old.dat"],
        variant: "modern",
      }),
    ).toBe("Imported 1 DAT file and replaced 1 existing local set. The Local Sets list has been updated.");
  });
});

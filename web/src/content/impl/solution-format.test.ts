import { describe, expect, it } from "vitest";
import { parseSolutionFile, serializeSolutionFile } from "@content/api/solutionFileFormat";

describe("solutionFileFormat", () => {
  it("round-trips the optional set name header entry", () => {
    const bytes = serializeSolutionFile({
      ruleset: "Lynx",
      flags: 3,
      extraHeader: Uint8Array.from([0xaa, 0xbb]),
      setName: "CCLP5",
      entries: [
        {
          levelNumber: 1,
          password: "ABCD",
          bestTimeTicks: null,
          solutionData: null,
          expandedSolution: null,
        },
      ],
    });

    expect(parseSolutionFile(bytes)).toEqual({
      ruleset: "Lynx",
      flags: 3,
      extraHeader: Uint8Array.from([0xaa, 0xbb]),
      setName: "CCLP5",
      entries: [
        {
          levelNumber: 1,
          password: "ABCD",
          bestTimeTicks: null,
          solutionData: null,
          expandedSolution: null,
        },
      ],
    });
  });
});

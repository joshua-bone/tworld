import { describe, expect, it } from "vitest";
import { NodeCharacterizationFixtureRepository } from "@adapters/fixtures/NodeCharacterizationFixtureRepository";
import { contractSolutionData, expandSolutionData, parseSolutionFile, serializeSolutionFile } from "@domain/solution-file";

const repository = new NodeCharacterizationFixtureRepository();

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

describe("solution file", () => {
  it("matches native oracle fixtures for solution payload encoding and file round-trips", async () => {
    const manifest = await repository.loadManifest();

    for (const spec of manifest.solutionSpecs) {
      const fixture = await repository.loadSolutionRoundTrip(spec.name);
      const payload = contractSolutionData(fixture.levelNumber, fixture.password, fixture.bestTimeTicks, fixture.source);
      const fileBytes = serializeSolutionFile({
        ruleset: fixture.ruleset,
        flags: 0,
        extraHeader: new Uint8Array(),
        setName: null,
        entries: [
          {
            levelNumber: fixture.levelNumber,
            password: fixture.password,
            bestTimeTicks: fixture.bestTimeTicks,
            solutionData: payload,
            expandedSolution: null,
          },
        ],
      });
      const parsedFile = parseSolutionFile(fileBytes);

      expect(toHex(payload)).toBe(fixture.encoded.hex);
      expect(expandSolutionData(payload)).toEqual(fixture.memoryRoundTrip);
      expect(parsedFile.ruleset).toBe(fixture.ruleset);
      expect(parsedFile.entries[0]?.bestTimeTicks).toBe(fixture.fileRoundTrip.bestTimeTicks);
      expect(parsedFile.entries[0]?.expandedSolution).toEqual(fixture.fileRoundTrip.expanded);
      expect(toHex(parsedFile.entries[0]?.solutionData ?? new Uint8Array())).toBe(fixture.fileRoundTrip.hex);
    }
  });
});

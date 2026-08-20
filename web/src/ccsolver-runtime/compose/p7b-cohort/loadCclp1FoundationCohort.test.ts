import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CCLP1_FOUNDATION_COHORT,
  CCLP1_FOUNDATION_LIMITS,
} from "./cclp1FoundationCohort";
import { loadCclp1FoundationCohort } from "./loadCclp1FoundationCohort";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("the bounded real CCLP1 P7B cohort", () => {
  it("pins exactly the first ten real levels plus the stepping and mouse canaries", () => {
    expect(CCLP1_FOUNDATION_COHORT.map(({
      occurrenceId,
      levelNumber,
      title,
      canaries,
    }) => ({ occurrenceId, levelNumber, title, canaries }))).toEqual([
      { occurrenceId: "cclp1/001", levelNumber: 1, title: "Key Pyramid", canaries: [] },
      { occurrenceId: "cclp1/002", levelNumber: 2, title: "Slip and Slide", canaries: [] },
      { occurrenceId: "cclp1/003", levelNumber: 3, title: "Present Company", canaries: [] },
      { occurrenceId: "cclp1/004", levelNumber: 4, title: "Block Party", canaries: [] },
      { occurrenceId: "cclp1/005", levelNumber: 5, title: "Facades", canaries: [] },
      { occurrenceId: "cclp1/006", levelNumber: 6, title: "When Insects Attack", canaries: [] },
      { occurrenceId: "cclp1/007", levelNumber: 7, title: "Under Pressure", canaries: [] },
      { occurrenceId: "cclp1/008", levelNumber: 8, title: "Switcheroo", canaries: [] },
      { occurrenceId: "cclp1/009", levelNumber: 9, title: "Swept Away", canaries: [] },
      { occurrenceId: "cclp1/010", levelNumber: 10, title: "Graduation", canaries: [] },
      { occurrenceId: "cclp1/042", levelNumber: 42, title: "Mughfe", canaries: ["stepping"] },
      { occurrenceId: "cclp1/137", levelNumber: 137, title: "Thief Street", canaries: ["ms-mouse"] },
    ]);
    expect(new Set(CCLP1_FOUNDATION_COHORT.map(({ caseId }) => caseId)).size).toBe(12);
    expect(new Set(CCLP1_FOUNDATION_COHORT.map(({ normalizedGameplaySha256 }) => (
      normalizedGameplaySha256
    ))).size).toBe(12);
    expect(CCLP1_FOUNDATION_LIMITS).toEqual({
      levelCount: 12,
      targetCount: 24,
      sourceFileCount: 5,
      maximumSelectedReplayBytes: 4_240,
      maximumDonorTicks: 20_196,
      replayTickSlackPerTarget: 40,
      maximumAdvanceTicks: 21_156,
      maximumEventsPerTarget: 131_072,
      maximumEventStreamCanonicalBytes: 32 * 1024 * 1024,
    });
  });

  it("loads all 24 exact donors from eligible real sources without rewriting raw bytes", async () => {
    const cohort = await loadCclp1FoundationCohort(repositoryRoot);

    expect(cohort.levels.map(({ selection }) => selection)).toEqual(CCLP1_FOUNDATION_COHORT);
    expect(cohort.summary).toEqual({
      levelCount: 12,
      targetCount: 24,
      rawReplayByteLength: 4_240,
      donorTicks: 20_196,
    });

    for (const level of cohort.levels) {
      expect(level.eligibility.sourceScope.status).toBe("eligible");
      expect(level.eligibility.legacyValidity.status).toBe("valid");
      expect(level.targets.map(({ target }) => target)).toEqual(["ms", "lynx"]);
      for (const target of level.targets) {
        expect(target.rawReplayBytes).toHaveLength(target.donor.entryByteLength);
        expect(sha256(target.rawReplayBytes)).toBe(target.donor.entrySha256);
        expect(target.expandedSolution.moves).toHaveLength(target.donor.moveCount);
        expect(target.bestTimeTicks).toBe(target.donor.bestTimeTicks);
      }
    }

    const stepping = cohort.levels.find(({ selection }) => selection.levelNumber === 42)!;
    expect(stepping.targets.map(({ donor }) => donor.stepping)).toEqual([4, 4]);
    const mouse = cohort.levels.find(({ selection }) => selection.levelNumber === 137)!;
    expect(mouse.targets.find(({ target }) => target === "ms")?.donor.containsMouseInput).toBe(true);
    expect(mouse.targets.find(({ target }) => target === "lynx")?.donor.containsMouseInput).toBe(false);

    const firstByte = cohort.levels[0]!.targets[0]!.rawReplayBytes[0]!;
    cohort.levels[0]!.targets[0]!.rawReplayBytes[0] = firstByte ^ 0xff;
    const reloaded = await loadCclp1FoundationCohort(repositoryRoot);
    expect(reloaded.levels[0]!.targets[0]!.rawReplayBytes[0]).toBe(firstByte);
    expect(sha256(reloaded.levels[0]!.targets[0]!.rawReplayBytes)).toBe(
      reloaded.levels[0]!.targets[0]!.donor.entrySha256,
    );
  });
});

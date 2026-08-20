import { describe, expect, it } from "vitest";
import {
  P7_TRAINING_MAP_DIFF_LIMITS,
  buildBoundedCanonicalGameplayMapDiff,
  normalizeVotingLevelTitle,
  resolveVotingMapRelationship,
} from "./trainingCorpusInventory";

function gameplayMap(changedCells: Readonly<Record<number, string>> = {}) {
  return {
    format: "ccsolver-normalized-gameplay-map",
    formatVersion: 1,
    geometry: { depth: 1, height: 2, width: 2 },
    requiredCollectibles: 0,
    timeLimitSeconds: 100,
    layers: [{
      actorOrder: [],
      cells: Array.from({ length: 4 }, (_, cell) => ({
        bottom: { facing: null, semanticType: changedCells[cell] ?? "cc1:floor", state: 0 },
        top: { facing: null, semanticType: "cc1:floor", state: 0 },
      })),
      cloners: [],
      traps: [],
      z: 0,
    }],
  } as const;
}

describe("CCLP5 voting-map relationship resolution", () => {
  it("prefers exact normalized gameplay and treats title-only identity as edited", () => {
    const official = {
      occurrenceId: "cclp5/004",
      title: " Key  Free ",
      normalizedGameplaySha256: "official-map",
    };
    const exact = {
      occurrenceId: "cclp5-voting-exact/009",
      title: "A renamed exact map",
      normalizedGameplaySha256: "official-map",
    };
    const titleOnly = {
      occurrenceId: "cclp5-voting-edited/047",
      title: "key free",
      normalizedGameplaySha256: "edited-map",
    };

    expect(resolveVotingMapRelationship(official, [titleOnly, exact])).toEqual({
      kind: "exact-gameplay-alias",
      candidates: [exact],
    });
    expect(resolveVotingMapRelationship(official, [titleOnly])).toEqual({
      kind: "edited-relative",
      candidate: titleOnly,
      normalizedTitle: "key free",
    });
  });

  it("never chooses between ambiguous normalized titles and preserves punctuation", () => {
    expect(normalizeVotingLevelTitle("  Prism\tConcerto  ")).toBe("prism concerto");
    expect(normalizeVotingLevelTitle("Prism: Concerto")).toBe("prism: concerto");
    const official = {
      occurrenceId: "cclp5/132",
      title: "Prism Concerto",
      normalizedGameplaySha256: "official-map",
    };
    const candidates = ["a", "b"].map((suffix) => ({
      occurrenceId: `cclp5-voting-${suffix}/001`,
      title: "prism concerto",
      normalizedGameplaySha256: `edited-${suffix}`,
    }));

    expect(resolveVotingMapRelationship(official, candidates)).toEqual({
      kind: "none",
      reason: "ambiguous-normalized-title",
      normalizedTitle: "prism concerto",
      ambiguousOccurrenceIds: [
        "cclp5-voting-a/001",
        "cclp5-voting-b/001",
      ],
    });
  });
});

describe("bounded canonical gameplay-map diffs", () => {
  it("records deterministic layer/cell changes rather than raw DAT offsets", () => {
    const diff = buildBoundedCanonicalGameplayMapDiff({
      official: gameplayMap(),
      candidate: gameplayMap({ 1: "cc1:wall", 3: "cc1:water" }),
      officialNormalizedGameplaySha256: "official",
      candidateNormalizedGameplaySha256: "candidate",
      maximumCellRecords: 1,
      maximumOtherRecords: 1,
    });

    expect(diff).toMatchObject({
      algorithm: "canonical-gameplay-layers-cells-diff-v1",
      changedCellCount: 2,
      cellRecordsTruncated: true,
      officialNormalizedGameplaySha256: "official",
      candidateNormalizedGameplaySha256: "candidate",
    });
    expect(diff.cellChanges).toEqual([{
      layerIndex: 0,
      z: 0,
      cellOrdinal: 1,
      x: 1,
      y: 0,
      official: gameplayMap().layers[0].cells[1],
      candidate: gameplayMap({ 1: "cc1:wall" }).layers[0].cells[1],
    }]);
    expect(diff.maximumComparedCells).toBe(P7_TRAINING_MAP_DIFF_LIMITS.maximumComparedCells);
  });

  it("separately and boundedly records non-cell gameplay changes", () => {
    const official = gameplayMap();
    const candidate = { ...gameplayMap(), timeLimitSeconds: 90, requiredCollectibles: 2 };
    const diff = buildBoundedCanonicalGameplayMapDiff({
      official,
      candidate,
      officialNormalizedGameplaySha256: "official",
      candidateNormalizedGameplaySha256: "candidate",
      maximumCellRecords: 4,
      maximumOtherRecords: 1,
    });

    expect(diff.changedCellCount).toBe(0);
    expect(diff.otherDifferenceCount).toBe(2);
    expect(diff.otherRecordsTruncated).toBe(true);
    expect(diff.otherChanges).toEqual([{
      path: "/requiredCollectibles",
      official: { present: true, value: 0 },
      candidate: { present: true, value: 2 },
    }]);
  });
});

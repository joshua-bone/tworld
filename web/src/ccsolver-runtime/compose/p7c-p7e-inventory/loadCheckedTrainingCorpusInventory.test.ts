import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { buildP7TrainingShardPlan } from "../p7-training-execution/p7TrainingShardProtocol";
import {
  P7_TRAINING_INVENTORY_LIMITS,
  materializeDetachedLevelSource,
  materializeDetachedReplayBytes,
} from "./trainingCorpusInventory";
import {
  loadCheckedTrainingCorpusInventory,
  loadCheckedTrainingPackInventory,
} from "./loadCheckedTrainingCorpusInventory";
import type {
  P7TrainingCorpusInventory,
  P7TrainingPackId,
  P7TrainingPackInventoryClosure,
} from "./trainingCorpusInventory";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const digestPort = new WebCryptoSha256();

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("checked P7C-P7E training corpus inventory", () => {
  let inventory: P7TrainingCorpusInventory;
  let scoped: Readonly<Record<P7TrainingPackId, P7TrainingPackInventoryClosure>>;

  beforeAll(async () => {
    inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const [cclp1, cclp4, cclp5] = await Promise.all([
      loadCheckedTrainingPackInventory(repositoryRoot, "cclp1"),
      loadCheckedTrainingPackInventory(repositoryRoot, "cclp4"),
      loadCheckedTrainingPackInventory(repositoryRoot, "cclp5"),
    ]);
    scoped = { cclp1, cclp4, cclp5 };
  }, 60_000);

  it("loads exact pack-specific source closures with full-inventory-equivalent rows and plans", async () => {
    const expectedInputCounts: Readonly<Record<P7TrainingPackId, number>> = {
      cclp1: 5,
      cclp4: 5,
      cclp5: 175,
    };
    for (const [index, packId] of (["cclp1", "cclp4", "cclp5"] as const).entries()) {
      const selected = scoped[packId];
      expect(selected.packs).toHaveLength(1);
      expect(selected.packs[0]).toEqual(inventory.packs[index]);
      expect(selected.verifiedInputs).toHaveLength(expectedInputCounts[packId]);
      expect(selected.verifiedInputs.map(({ path }) => path)).toEqual(
        [...selected.verifiedInputs.map(({ path }) => path)].sort(),
      );

      const fullPlan = await buildP7TrainingShardPlan({ inventory, packId, sha256: digestPort });
      const scopedPlan = await buildP7TrainingShardPlan({
        inventory: selected,
        packId,
        sha256: digestPort,
      });
      expect(scopedPlan.packContent).toEqual(fullPlan.packContent);
      expect(scopedPlan.requests.map(({ canonicalJson }) => canonicalJson))
        .toEqual(fullPlan.requests.map(({ canonicalJson }) => canonicalJson));
    }
    expect(scoped.cclp1.verifiedInputs.map(({ path }) => path)).toEqual([
      "data/CCLP1.dat",
      "save/CCLP1-lynx.dac.tws",
      "save/CCLP1.dac.tws",
      "sets/CCLP1-Lynx.dac",
      "sets/CCLP1-MS.dac",
    ]);
    expect(scoped.cclp4.verifiedInputs.map(({ path }) => path)).toEqual([
      "data/CCLP4.dat",
      "save/CCLP4-lynx.dac.tws",
      "save/CCLP4.dac.tws",
      "sets/CCLP4-Lynx.dac",
      "sets/CCLP4-MS.dac",
    ]);
    expect(scoped.cclp5.verifiedInputs.filter(({ path }) => path.includes("CCLP5Voting-")))
      .toHaveLength(170);
  }, 60_000);

  it("does not read unrelated pack bytes and fails closed on relevant source drift", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "tworld-p7-pack-inventory-"));
    const paths = [
      "ccsolver/corpus/manifest.v1.json",
      "ccsolver/corpus/p1b-validity-report.v1.json",
      ...scoped.cclp1.verifiedInputs.map(({ path }) => path),
    ];
    try {
      for (const path of paths) {
        await mkdir(dirname(resolve(temporaryRoot, path)), { recursive: true });
        await copyFile(resolve(repositoryRoot, path), resolve(temporaryRoot, path));
      }
      const isolated = await loadCheckedTrainingPackInventory(temporaryRoot, "cclp1");
      expect(isolated.packs[0]).toEqual(inventory.packs[0]);

      const relevantPath = "data/CCLP1.dat";
      await unlink(resolve(temporaryRoot, relevantPath));
      await expect(loadCheckedTrainingPackInventory(temporaryRoot, "cclp1"))
        .rejects.toThrow();

      await copyFile(resolve(repositoryRoot, relevantPath), resolve(temporaryRoot, relevantPath));
      const tampered = new Uint8Array(await readFile(resolve(temporaryRoot, relevantPath)));
      tampered[0] = tampered[0]! ^ 0xff;
      await writeFile(resolve(temporaryRoot, relevantPath), tampered);
      await expect(loadCheckedTrainingPackInventory(temporaryRoot, "cclp1"))
        .rejects.toThrow(/pinned source (?:digest|length) mismatch/u);
    } finally {
      await rm(temporaryRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it("pins three exact 149-level official packs and every freshly hashed input", async () => {
    expect(inventory.packs.map(({ packId, levels }) => ({ packId, levels: levels.length })))
      .toEqual([
        { packId: "cclp1", levels: 149 },
        { packId: "cclp4", levels: 149 },
        { packId: "cclp5", levels: 149 },
      ]);
    expect(inventory.summary).toEqual({
      packCount: 3,
      levelCount: 447,
      targetCount: 894,
      verifiedInputFileCount: 185,
      verifiedInputByteLength: 7_028_144,
      officialDonorCandidateCount: 827,
      votingDonorCandidateCount: 294,
      cclp5VotingRelationships: {
        exactGameplayAlias: 82,
        editedRelative: 65,
        none: 2,
        ambiguous: 0,
      },
      cclp5MissingOfficialLevels: {
        exactGameplayAlias: 14,
        editedRelative: 19,
        none: 1,
        ambiguous: 0,
      },
      cclp5MissingOfficialTargets: {
        exactGameplayAlias: 28,
        editedRelative: 37,
        uncovered: 2,
      },
    });
    expect(inventory.verifiedInputs).toHaveLength(P7_TRAINING_INVENTORY_LIMITS.inputFileCount);
    expect(inventory.verifiedInputs.reduce((sum, input) => sum + input.byteLength, 0))
      .toBe(P7_TRAINING_INVENTORY_LIMITS.inputByteLength);
    expect(inventory.packs.every(({ levels }) => levels.every((level, index) => (
      level.levelNumber === index + 1
      && level.validityOccurrence.validity.status === "valid"
      && level.eligibility.sourceScope.status === "eligible"
    )))).toBe(true);
  });

  it("pins direct official donor denominators and keeps replay bytes detached", async () => {
    expect(inventory.packs.map(({ packId, summary }) => ({ packId, ...summary.directCoverage })))
      .toEqual([
        { packId: "cclp1", paired: 149, msOnly: 0, lynxOnly: 0, none: 0, donorTargets: 298 },
        { packId: "cclp4", paired: 149, msOnly: 0, lynxOnly: 0, none: 0, donorTargets: 298 },
        { packId: "cclp5", paired: 115, msOnly: 1, lynxOnly: 0, none: 33, donorTargets: 231 },
      ]);

    const first = inventory.packs[0]!.levels[0]!.targets[0]!.donorCandidates[0]!;
    expect(first.mapRelationship).toBe("official-map");
    const bytes = materializeDetachedReplayBytes(first.replay);
    expect(bytes).toHaveLength(first.replay.content.byteLength);
    expect(`sha256:${sha256(bytes)}`).toBe(first.replay.content.digest);
    bytes[0] = bytes[0]! ^ 0xff;
    expect(sha256(materializeDetachedReplayBytes(first.replay))).not.toBe(sha256(bytes));
    expect(`sha256:${sha256(materializeDetachedReplayBytes(first.replay))}`)
      .toBe(first.replay.content.digest);
  });

  it("materializes fresh official source bytes and exact target browser metadata", () => {
    const first = inventory.packs[0].levels[0]!;
    const materialized = materializeDetachedLevelSource(first.source);
    expect(`sha256:${sha256(materialized.containerBytes)}`).toBe(first.source.containerContent.digest);
    expect(materialized.layerData).toHaveLength(first.source.sourceMembers.length);
    const originalByte = materialized.levelData[0]!;
    materialized.levelData[0] = originalByte ^ 0xff;
    expect(materializeDetachedLevelSource(first.source).levelData[0]).toBe(originalByte);
    expect(first.targets.map(({ execution }) => ({
      request: execution.request,
      display: {
        seriesName: execution.display.seriesName,
        mapFilename: execution.display.mapFilename,
        levelNumber: execution.display.level.number,
        levelName: execution.display.level.name,
      },
    }))).toEqual([
      {
        request: { seriesFile: "CCLP1-MS.dac", levelNumber: 1, ruleset: "MS" },
        display: {
          seriesName: "CCLP1 — MS",
          mapFilename: "CCLP1.dat",
          levelNumber: 1,
          levelName: "Key Pyramid",
        },
      },
      {
        request: { seriesFile: "CCLP1-Lynx.dac", levelNumber: 1, ruleset: "Lynx" },
        display: {
          seriesName: "CCLP1 — Lynx",
          mapFilename: "CCLP1.dat",
          levelNumber: 1,
          levelName: "Key Pyramid",
        },
      },
    ]);
  });

  it("uses voting aliases on the official map and emits checked edited-relative diffs", async () => {
    const cclp5 = inventory.packs.find(({ packId }) => packId === "cclp5")!;
    const resolvedVotingOccurrences = cclp5.levels.flatMap(({ votingRelationship }) => {
      if (votingRelationship?.kind === "exact-gameplay-alias") {
        expect(votingRelationship.candidateOccurrenceIds).toHaveLength(1);
        return votingRelationship.candidateOccurrenceIds;
      }
      return votingRelationship?.kind === "edited-relative"
        ? [votingRelationship.candidateOccurrenceId]
        : [];
    });
    expect(resolvedVotingOccurrences).toHaveLength(147);
    expect(new Set(resolvedVotingOccurrences).size).toBe(147);
    const exact = cclp5.levels[88]!;
    expect(exact.occurrenceId).toBe("cclp5/089");
    expect(exact.votingRelationship).toMatchObject({
      kind: "exact-gameplay-alias",
      candidateOccurrenceIds: ["cclp5-voting-uniform/044"],
    });
    const exactCandidate = exact.targets[1].donorCandidates[0]!;
    expect(exactCandidate.mapRelationship).toBe("exact-gameplay-alias");
    expect(exactCandidate.execution.occurrenceId).toBe("cclp5/089");
    expect(exactCandidate.source.occurrenceId).toBe("cclp5-voting-uniform/044");
    expect(exactCandidate.mapDiff).toBeNull();

    const edited = cclp5.levels[3]!;
    expect(edited.occurrenceId).toBe("cclp5/004");
    expect(edited.votingRelationship).toMatchObject({
      kind: "edited-relative",
      candidateOccurrenceId: "cclp5-voting-chocolate/047",
    });
    const editedRelationship = edited.votingRelationship;
    const diff = editedRelationship?.kind === "edited-relative"
      ? editedRelationship.mapDiff
      : null;
    expect(diff).not.toBeNull();
    expect(diff!.changedCellCount + diff!.otherDifferenceCount).toBeGreaterThan(0);
    expect(diff!.cellChanges.length).toBeLessThanOrEqual(
      P7_TRAINING_INVENTORY_LIMITS.maximumMapDiffCellRecords,
    );
    if (editedRelationship?.kind !== "edited-relative") {
      throw new Error("expected checked edited-relative relationship");
    }
    expect(editedRelationship.officialMap.sourceMembers[0]?.sourcePath).toBe("data/CCLP5.dat");
    expect(editedRelationship.candidateMap.sourceMembers[0]?.sourcePath)
      .toBe("data/CCLP5Voting-Chocolate.dat");
    expect(editedRelationship.candidateMap.validityOccurrence.validity.status).toBe("valid");
    expect(editedRelationship.candidateMap.eligibility.sourceScope.status).toBe("eligible");
    expect(edited.targets.every(({ donorCandidates }) => (
      donorCandidates[0]?.mapRelationship === "edited-relative"
    ))).toBe(true);
  });

  it("makes both all-map no-candidate cases explicit, including uncovered Udassa", async () => {
    const cclp5 = inventory.packs.find(({ packId }) => packId === "cclp5")!;
    const dauntless = cclp5.levels[54]!;
    const udassa = cclp5.levels[138]!;

    expect({
      occurrenceId: dauntless.occurrenceId,
      title: dauntless.title,
      votingRelationship: dauntless.votingRelationship?.kind === "none" ? {
        kind: dauntless.votingRelationship.kind,
        reason: dauntless.votingRelationship.reason,
        normalizedTitle: dauntless.votingRelationship.normalizedTitle,
        ambiguousOccurrenceIds: dauntless.votingRelationship.ambiguousOccurrenceIds,
      } : dauntless.votingRelationship,
      candidateCounts: dauntless.targets.map(({ donorCandidates }) => donorCandidates.length),
    }).toEqual({
      occurrenceId: "cclp5/055",
      title: "Dauntless Extraction",
      votingRelationship: {
        kind: "none",
        reason: "no-normalized-title-candidate",
        normalizedTitle: "dauntless extraction",
        ambiguousOccurrenceIds: [],
      },
      candidateCounts: [1, 1],
    });
    expect({
      occurrenceId: udassa.occurrenceId,
      title: udassa.title,
      votingRelationship: udassa.votingRelationship?.kind === "none" ? {
        kind: udassa.votingRelationship.kind,
        reason: udassa.votingRelationship.reason,
        normalizedTitle: udassa.votingRelationship.normalizedTitle,
        ambiguousOccurrenceIds: udassa.votingRelationship.ambiguousOccurrenceIds,
      } : udassa.votingRelationship,
      candidateCounts: udassa.targets.map(({ donorCandidates }) => donorCandidates.length),
    }).toEqual({
      occurrenceId: "cclp5/139",
      title: "Udassa",
      votingRelationship: {
        kind: "none",
        reason: "no-normalized-title-candidate",
        normalizedTitle: "udassa",
        ambiguousOccurrenceIds: [],
      },
      candidateCounts: [0, 0],
    });
  });
});

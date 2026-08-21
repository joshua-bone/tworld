import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson, type CanonicalJson, type CanonicalJsonValue } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { buildP7bTrainingReplayLevel } from "../p7b-training/trainingReplayContract";
import { loadCheckedTrainingCorpusInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import type {
  P7TrainingCorpusInventory,
  P7TrainingLevelInventory,
  P7TrainingPackId,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  P7_TRAINING_SHARD_COUNT,
  P7_TRAINING_SHARD_LIMITS,
  type P7TrainingPersistEvidence,
  type P7TrainingVerifyPersistedEvidence,
  buildP7TrainingShardPlan,
  reduceP7TrainingShards,
  runP7TrainingShard,
} from "./p7TrainingShardProtocol";
import { P7GeneratedEvidenceStore } from "./p7GeneratedEvidenceStore";
import type { P7GeneratedEvidenceSidecarV1 } from "./p7GeneratedEvidenceSidecar";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const sha256 = new WebCryptoSha256();

function hexDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function missingLevel(row: P7TrainingLevelInventory) {
  const sourceMember = row.source.sourceMembers.find(({ ordinal }) => ordinal === 0)!;
  const levelContent = {
    digest: `sha256:${sourceMember.sha256}` as const,
    byteLength: sourceMember.byteLength,
  };
  const eligibilityJson = canonicalizeJson(row.eligibility as unknown as CanonicalJsonValue);
  const eligibilityBytes = new TextEncoder().encode(eligibilityJson);
  const eligibilityEvidence = {
    digest: `sha256:${hexDigest(eligibilityJson)}` as const,
    byteLength: eligibilityBytes.byteLength,
  };
  const level = buildP7bTrainingReplayLevel({
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: row.packId,
      levelNumber: row.levelNumber,
      title: row.title,
      normalizedGameplaySha256: row.source.normalizedGameplaySha256,
      levelContent,
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: `${row.eligibility.sourceScope.policyRevision}+${row.eligibility.legacyValidity.policyRevision}`,
        evidence: eligibilityEvidence,
      },
    },
    donorCoverage: {
      ms: { status: "missing", rawDonorId: null, detail: "bounded protocol fixture" },
      lynx: { status: "missing", rawDonorId: null, detail: "bounded protocol fixture" },
    },
    rawDonors: [],
    variants: [],
    processing: { status: "blocked", detail: "explicit missing-donor fixture" },
    viewableVariantId: null,
  });
  return {
    status: "missing-donor" as const,
    detail: "explicit missing-donor fixture",
    trainingReplayLevel: level,
    browserTargets: {
      ms: row.targets[0].execution,
      lynx: row.targets[1].execution,
    },
    browserReplays: [],
    portableDecisionTraces: [],
    generatedEvidence: {
      artifact: "ccsolver-p7-generated-evidence-bundle" as const,
      version: 1 as const,
      scopeId: `${row.occurrenceId}/test`,
      limits: {
        maximumBlobCount: 2,
        maximumBlobBytes: 128,
        maximumTotalBytes: 128,
      },
      totals: { blobCount: 1, byteLength: eligibilityBytes.byteLength },
      blobs: [{
        content: eligibilityEvidence,
        mediaType: "application/json" as const,
        bytes: eligibilityBytes,
      }],
    },
  };
}

function withoutDonors(
  inventory: P7TrainingCorpusInventory,
  packId: P7TrainingPackId,
): P7TrainingCorpusInventory {
  return {
    ...inventory,
    packs: inventory.packs.map((pack) => pack.packId !== packId ? pack : ({
      ...pack,
      levels: pack.levels.map((row) => ({
        ...row,
        targets: row.targets.map((target) => ({
          ...target,
          donorCandidates: [],
        })) as unknown as P7TrainingLevelInventory["targets"],
      })),
    })) as unknown as P7TrainingCorpusInventory["packs"],
  };
}

function inMemoryEvidence() {
  const sidecars = new Map<string, P7GeneratedEvidenceSidecarV1>();
  const persistEvidence: P7TrainingPersistEvidence = async ({ occurrenceId, sidecar }) => {
    if (sidecars.has(occurrenceId)) throw new Error(`duplicate evidence sidecar ${occurrenceId}`);
    sidecars.set(occurrenceId, structuredClone(sidecar));
  };
  const verifyEvidence: P7TrainingVerifyPersistedEvidence = async ({ occurrenceId, index, sha256: verifier }) => {
    void verifier;
    const sidecar = sidecars.get(occurrenceId);
    if (sidecar === undefined) throw new Error(`missing evidence sidecar ${occurrenceId}`);
    expect(index).toEqual(sidecar.index);
    return {
      indexCanonicalJson: sidecar.indexCanonicalJson,
      payload: new Uint8Array(sidecar.payload),
    };
  };
  return { sidecars, persistEvidence, verifyEvidence };
}

describe("P7C-P7E deterministic training shards", () => {
  it("pins eight remainder-first official occurrence slices using identity and digests only", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const plan = await buildP7TrainingShardPlan({
      inventory,
      packId: "cclp5",
      sha256,
    });

    expect(P7_TRAINING_SHARD_COUNT).toBe(8);
    expect(plan.requests.map(({ request }) => ({
      shard: request.partition.shardIndex,
      first: request.partition.startLevelNumber,
      last: request.partition.endLevelNumber,
      count: request.occurrences.length,
    }))).toEqual([
      { shard: 0, first: 1, last: 19, count: 19 },
      { shard: 1, first: 20, last: 38, count: 19 },
      { shard: 2, first: 39, last: 57, count: 19 },
      { shard: 3, first: 58, last: 76, count: 19 },
      { shard: 4, first: 77, last: 95, count: 19 },
      { shard: 5, first: 96, last: 113, count: 18 },
      { shard: 6, first: 114, last: 131, count: 18 },
      { shard: 7, first: 132, last: 149, count: 18 },
    ]);
    expect(plan.requests.flatMap(({ request }) => request.occurrences).map(({ occurrenceId }) => (
      occurrenceId
    ))).toEqual(Array.from({ length: 149 }, (_, index) => (
      `cclp5/${String(index + 1).padStart(3, "0")}`
    )));
    for (const artifact of plan.requests) {
      expect(artifact.content).toEqual({
        digest: `sha256:${hexDigest(artifact.canonicalJson)}`,
        byteLength: new TextEncoder().encode(artifact.canonicalJson).byteLength,
      });
      expect(artifact.request.inventory.packContent).toEqual(plan.packContent);
      expect(new TextEncoder().encode(artifact.canonicalJson).byteLength)
        .toBeLessThanOrEqual(P7_TRAINING_SHARD_LIMITS.maximumRequestBytes);
      expect(artifact.canonicalJson).not.toMatch(/containerBytes|levelData|layerData|expandedSolution|rawReplayBytes/u);
      expect(Object.keys(artifact.request.occurrences[0]!)).toEqual([
        "caseId",
        "levelNumber",
        "normalizedGameplaySha256",
        "occurrenceId",
        "sourceContainerContent",
        "sourceLevelContent",
        "title",
      ]);
    }

    const unrelatedPath = inventory.verifiedInputs.find(({ path }) => (
      path.includes("CCLP5Voting-")
    ))!.path;
    const unrelatedMutation = {
      ...inventory,
      verifiedInputs: inventory.verifiedInputs.map((entry) => (
        entry.path === unrelatedPath ? { ...entry, sha256: "f".repeat(64) } : entry
      )),
    };
    const cclp1Before = await buildP7TrainingShardPlan({ inventory, packId: "cclp1", sha256 });
    const cclp1After = await buildP7TrainingShardPlan({
      inventory: unrelatedMutation,
      packId: "cclp1",
      sha256,
    });
    expect(cclp1After.packContent).toEqual(cclp1Before.packContent);
  }, 30_000);

  it("freshly reloads inventory in each job and reduces only exact request-bound results", async () => {
    const inventory = withoutDonors(
      await loadCheckedTrainingCorpusInventory(repositoryRoot),
      "cclp5",
    );
    const plan = await buildP7TrainingShardPlan({ inventory, packId: "cclp5", sha256 });
    const evidence = inMemoryEvidence();
    let loadCount = 0;
    const loadInventory = async () => {
      loadCount += 1;
      return inventory;
    };
    const results = [];
    for (const request of plan.requests) {
      results.push(await runP7TrainingShard({
        repositoryRoot,
        request,
        sha256,
        loadInventory,
        persistEvidence: evidence.persistEvidence,
        processLevel: async (row) => missingLevel(row),
      }));
    }

    expect(loadCount).toBe(8);
    expect(evidence.sidecars.size).toBe(149);
    expect([...evidence.sidecars.values()].every(({ index, payload }) => (
      index.payloadContent.byteLength === payload.byteLength
      && index.entries.every((entry, ordinal) => (
        entry.byteLength === entry.content.byteLength
        && entry.byteOffset === index.entries
          .slice(0, ordinal)
          .reduce((sum, prior) => sum + prior.byteLength, 0)
      ))
    ))).toBe(true);
    // Exactly one canonical index plus one binary payload is persisted per
    // occurrence, independent of the logical evidence-blob count.
    expect(evidence.sidecars.size * 2).toBe(298);
    expect(results.every(({ result }) => result.levels.every(({ processing }) => (
      processing.status === "missing-donor"
      && processing.trainingReplayLevel?.processing.status === "blocked"
    )))).toBe(true);
    for (const result of results) {
      expect(result.content).toEqual({
        digest: `sha256:${hexDigest(result.canonicalJson)}`,
        byteLength: new TextEncoder().encode(result.canonicalJson).byteLength,
      });
      expect(new TextEncoder().encode(result.canonicalJson).byteLength)
        .toBeLessThanOrEqual(P7_TRAINING_SHARD_LIMITS.maximumResultBytes);
      expect(result.canonicalJson).not.toMatch(/generatedEvidence|"bytes"\s*:/u);
    }

    const reduced = await reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results,
      sha256,
      loadInventory,
      verifyEvidence: evidence.verifyEvidence,
    });
    expect(reduced.packId).toBe("cclp5");
    expect(loadCount).toBe(9);
    expect(reduced.levels).toHaveLength(149);
    expect(reduced.levels.map(({ levelNumber }) => levelNumber))
      .toEqual(Array.from({ length: 149 }, (_, index) => index + 1));
    const firstOccurrence = results[0]!.result.levels[0]!.occurrenceId;
    const originalSidecar = evidence.sidecars.get(firstOccurrence)!;
    const tamperedPayload = new Uint8Array(originalSidecar.payload);
    tamperedPayload[0] = tamperedPayload[0]! ^ 0xff;
    evidence.sidecars.set(firstOccurrence, {
      ...originalSidecar,
      payload: tamperedPayload,
    });
    await expect(reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results,
      sha256,
      loadInventory,
      verifyEvidence: evidence.verifyEvidence,
    })).rejects.toThrow("persisted evidence container drifted");
    evidence.sidecars.set(firstOccurrence, originalSidecar);
    await expect(reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results: results.slice(1),
      sha256,
      loadInventory,
      verifyEvidence: evidence.verifyEvidence,
    })).rejects.toThrow("exactly eight");
    await expect(reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results: [...results.slice(0, 7), results[0]!],
      sha256,
      loadInventory,
      verifyEvidence: evidence.verifyEvidence,
    })).rejects.toThrow("duplicate shard result");

    const forgedValue = structuredClone(results[0]!.result);
    const forgedLevel = forgedValue.levels[0]!.processing.trainingReplayLevel as unknown as {
      source: { title: string };
    };
    forgedLevel.source.title = "Coherent but forged title";
    const forgedJson = canonicalizeJson(forgedValue as unknown as CanonicalJsonValue);
    const forged = {
      result: forgedValue,
      canonicalJson: forgedJson as CanonicalJson,
      content: {
        digest: `sha256:${hexDigest(forgedJson)}` as const,
        byteLength: new TextEncoder().encode(forgedJson).byteLength,
      },
    };
    await expect(reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results: [forged, ...results.slice(1)],
      sha256,
      loadInventory,
      verifyEvidence: evidence.verifyEvidence,
    })).rejects.toThrow("fresh inventory");
  }, 30_000);

  it("fails closed on status drift, oversized details, and private evidence paths", async () => {
    const inventory = withoutDonors(
      await loadCheckedTrainingCorpusInventory(repositoryRoot),
      "cclp1",
    );
    const plan = await buildP7TrainingShardPlan({ inventory, packId: "cclp1", sha256 });
    const evidence = inMemoryEvidence();
    const common = {
      repositoryRoot,
      request: plan.requests[0]!,
      sha256,
      loadInventory: async () => inventory,
      persistEvidence: evidence.persistEvidence,
    };
    await expect(runP7TrainingShard({
      ...common,
      processLevel: async (row) => ({ ...missingLevel(row), status: "complete" }),
    })).rejects.toThrow("process status disagrees");
    await expect(runP7TrainingShard({
      ...common,
      processLevel: async (row) => ({ ...missingLevel(row), detail: "é".repeat(2_049) }),
    })).rejects.toThrow("private or unbounded path");
    await expect(runP7TrainingShard({
      ...common,
      processLevel: async (row) => {
        const output = missingLevel(row);
        const store = new P7GeneratedEvidenceStore({
          scopeId: `${row.occurrenceId}/private-path-test`,
          sha256,
        });
        await store.referenceCanonical({ diagnostic: "/Users/example/private/donor.tws" });
        return { ...output, generatedEvidence: store.bundle() };
      },
    })).rejects.toThrow("private absolute path");

    const pointerEvidence = inMemoryEvidence();
    await expect(runP7TrainingShard({
      ...common,
      persistEvidence: pointerEvidence.persistEvidence,
      processLevel: async (row) => {
        const output = missingLevel(row);
        const store = new P7GeneratedEvidenceStore({
          scopeId: output.generatedEvidence.scopeId,
          sha256,
        });
        await store.importBundle(output.generatedEvidence);
        await store.referenceCanonical({ mapDiffPath: "/layers/0/cells/17" });
        return { ...output, generatedEvidence: store.bundle() };
      },
    })).rejects.toThrow("generated evidence contains an orphan");
    expect(pointerEvidence.sidecars.size).toBe(0);
  }, 30_000);

  it("keeps unexpected processor errors shard-fatal without serializing private paths", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const plan = await buildP7TrainingShardPlan({ inventory, packId: "cclp1", sha256 });
    const evidence = inMemoryEvidence();
    const privatePath = "/Users/example/private/do-not-publish.tws";
    await expect(runP7TrainingShard({
      repositoryRoot,
      request: plan.requests[0]!,
      sha256,
      loadInventory: async () => inventory,
      persistEvidence: evidence.persistEvidence,
      processLevel: async () => {
        throw new Error(`unexpected processor failure at ${privatePath}`);
      },
    })).rejects.toThrow(privatePath);
  }, 30_000);
});

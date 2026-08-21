import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
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
  type P7TrainingShardResultArtifact,
  type P7TrainingVerifyPersistedEvidence,
  buildP7TrainingShardPlan,
  reduceP7TrainingShards,
  runP7TrainingShard,
} from "./p7TrainingShardProtocol";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedEvidenceBundleV1,
} from "./p7GeneratedEvidenceStore";
import {
  buildP7GeneratedEvidenceSidecar,
  type P7GeneratedEvidenceSidecarV1,
} from "./p7GeneratedEvidenceSidecar";
import type { P7TrainingEventStreamDigestV1 } from "./p7TrainingEventAccumulator";
import { processP7TrainingLevel } from "./p7TrainingLevelProcessor";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const sha256 = new WebCryptoSha256();

function hexDigest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function replaceGeneratedEvidenceValue(input: {
  readonly bundle: P7GeneratedEvidenceBundleV1;
  readonly original: BlobReferenceV1;
  readonly value: unknown;
}): Promise<{
  readonly bundle: P7GeneratedEvidenceBundleV1;
  readonly reference: BlobReferenceV1;
}> {
  const store = new P7GeneratedEvidenceStore({
    scopeId: input.bundle.scopeId,
    sha256,
  });
  await store.importBundle(input.bundle);
  const reference = await store.referenceCanonical(input.value);
  const blobs = store.bundle().blobs.filter(({ content }) => (
    content.digest !== input.original.digest
    || content.byteLength !== input.original.byteLength
  ));
  return {
    reference,
    bundle: {
      ...input.bundle,
      totals: {
        blobCount: blobs.length,
        byteLength: blobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs,
    },
  };
}

function rehashShardResult(result: P7TrainingShardResultArtifact): P7TrainingShardResultArtifact {
  const canonicalJson = canonicalizeJson(result.result as unknown as CanonicalJsonValue);
  return {
    result: result.result,
    canonicalJson,
    content: {
      digest: `sha256:${hexDigest(canonicalJson)}`,
      byteLength: new TextEncoder().encode(canonicalJson).byteLength,
    },
  };
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
  const sourceEligible = row.eligibility.sourceScope.status === "eligible"
    && row.eligibility.legacyValidity.status === "valid";
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
        status: sourceEligible ? "eligible" : "ineligible",
        standardOnly: sourceEligible,
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

function withDonorsOnlyFor(
  inventory: P7TrainingCorpusInventory,
  packId: P7TrainingPackId,
  occurrenceId: string,
): P7TrainingCorpusInventory {
  return {
    ...inventory,
    packs: inventory.packs.map((pack) => pack.packId !== packId ? pack : ({
      ...pack,
      levels: pack.levels.map((row) => row.occurrenceId === occurrenceId ? row : ({
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

async function expectShardRowFailure(input: {
  readonly promise: Promise<unknown>;
  readonly shardIndex: number;
  readonly occurrenceId: string;
  readonly causeMessage: string;
}): Promise<Error> {
  try {
    await input.promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    const failure = error as Error;
    expect(failure.message).toBe(
      `P7 training shard ${input.shardIndex} failed while processing ${input.occurrenceId}`,
    );
    expect(failure.cause).toBeInstanceOf(Error);
    expect((failure.cause as Error).message).toContain(input.causeMessage);
    return failure;
  }
  throw new Error("expected P7 training shard row failure");
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

  it("rejects rehashed certification-field and browser-root substitutions during reduction", async () => {
    const inventory = withDonorsOnlyFor(
      await loadCheckedTrainingCorpusInventory(repositoryRoot),
      "cclp1",
      "cclp1/001",
    );
    const plan = await buildP7TrainingShardPlan({ inventory, packId: "cclp1", sha256 });
    const persisted = inMemoryEvidence();
    let authorityOutput: Awaited<ReturnType<typeof processP7TrainingLevel>> | null = null;
    const results: P7TrainingShardResultArtifact[] = [];
    for (const request of plan.requests) {
      results.push(await runP7TrainingShard({
        repositoryRoot,
        request,
        sha256,
        loadInventory: async () => inventory,
        persistEvidence: persisted.persistEvidence,
        processLevel: async (source) => {
          if (source.occurrenceId !== "cclp1/001") return missingLevel(source);
          const output = await processP7TrainingLevel(source, sha256);
          authorityOutput = structuredClone(output);
          return output;
        },
      }));
    }
    expect(authorityOutput).not.toBeNull();
    const generatedEvidence = authorityOutput!.generatedEvidence;
    const originalSidecar = persisted.sidecars.get("cclp1/001")!;
    const resultIndex = results.findIndex(({ result }) => result.levels.some(({ occurrenceId }) => (
      occurrenceId === "cclp1/001"
    )));
    expect(resultIndex).toBeGreaterThanOrEqual(0);

    const expectReceiptMutationRejected = async (input: {
      readonly variantId: "raw-ms" | "portable";
      readonly target: "ms" | "lynx";
      readonly mutate: (receipt: Record<string, unknown>) => void;
      readonly message: string;
    }): Promise<void> => {
      const mutatedResults = structuredClone(results) as P7TrainingShardResultArtifact[];
      const mutatedLevel = mutatedResults[resultIndex]!.result.levels.find(({ occurrenceId }) => (
        occurrenceId === "cclp1/001"
      ))!;
      const certification = mutatedLevel.processing.trainingReplayLevel.variants.find(({ variantId }) => (
        variantId === input.variantId
      ))!.certifications[input.target];
      const originalCertification = certification.evidence!;
      const certificationBlob = generatedEvidence.blobs.find(({ content }) => (
        content.digest === originalCertification.digest
        && content.byteLength === originalCertification.byteLength
      ))!;
      const receipt = JSON.parse(new TextDecoder().decode(
        certificationBlob.bytes,
      )) as Record<string, unknown>;
      input.mutate(receipt);
      const replacedCertification = await replaceGeneratedEvidenceValue({
        bundle: generatedEvidence,
        original: originalCertification,
        value: receipt,
      });
      (certification as unknown as { evidence: BlobReferenceV1 }).evidence =
        replacedCertification.reference;
      const sidecar = await buildP7GeneratedEvidenceSidecar({
        bundle: replacedCertification.bundle,
        sha256,
      });
      (mutatedLevel.processing as unknown as {
        evidence: {
          index: P7GeneratedEvidenceSidecarV1["index"];
          indexContent: BlobReferenceV1;
        };
      }).evidence = {
        index: sidecar.index,
        indexContent: sidecar.indexContent,
      };
      persisted.sidecars.set("cclp1/001", sidecar);
      mutatedResults[resultIndex] = rehashShardResult(mutatedResults[resultIndex]!);
      await expect(reduceP7TrainingShards({
        repositoryRoot,
        plan,
        results: mutatedResults,
        sha256,
        loadInventory: async () => inventory,
        verifyEvidence: persisted.verifyEvidence,
      })).rejects.toThrow(input.message);
      persisted.sidecars.set("cclp1/001", originalSidecar);
    };

    await expectReceiptMutationRejected({
      variantId: "raw-ms",
      target: "ms",
      mutate: (receipt) => {
        receipt.artifact = "ccsolver-p7-native-replay-certification-receipt-renamed";
      },
      message: "artifact does not match its native execution",
    });
    await expectReceiptMutationRejected({
      variantId: "raw-ms",
      target: "ms",
      mutate: (receipt) => {
        receipt.version = 2;
      },
      message: "native receipt drifted",
    });
    await expectReceiptMutationRejected({
      variantId: "raw-ms",
      target: "ms",
      mutate: (receipt) => {
        receipt.eventRetention = {
          status: "all-events",
          heavyVerification: "reexecute-authoritative-engine",
        };
      },
      message: "event retention policy drifted",
    });

    const portableVariant = authorityOutput!.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "portable"
    ))!;
    const portableTarget = (["ms", "lynx"] as const).find((target) => {
      const reference = portableVariant.certifications[target].evidence;
      if (reference === null) return false;
      const blob = generatedEvidence.blobs.find(({ content }) => (
        content.digest === reference.digest && content.byteLength === reference.byteLength
      ));
      if (blob === undefined) return false;
      const value = JSON.parse(new TextDecoder().decode(blob.bytes)) as { artifact?: unknown };
      return value.artifact === "ccsolver-p7b-portable-target-certification";
    });
    expect(portableTarget).toBeDefined();
    const portableExecution = portableVariant.certifications[portableTarget!].execution;
    await expectReceiptMutationRejected({
      variantId: "portable",
      target: portableTarget!,
      mutate: (receipt) => {
        receipt.status = "failed";
        receipt.outcome = "loss";
      },
      message: "execution fields drifted",
    });
    await expectReceiptMutationRejected({
      variantId: "portable",
      target: portableTarget!,
      mutate: (receipt) => {
        receipt.replayContent = portableExecution.compilationReceipt;
        receipt.compilationReceipt = portableExecution.replayContent;
      },
      message: "execution fields drifted",
    });
    await expectReceiptMutationRejected({
      variantId: "portable",
      target: portableTarget!,
      mutate: (receipt) => {
        receipt.terminalReleaseDeclarations =
          (receipt.terminalReleaseDeclarations as number) + 1;
      },
      message: "execution fields drifted",
    });

    const rootResults = structuredClone(results) as P7TrainingShardResultArtifact[];
    const rootLevel = rootResults[resultIndex]!.result.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/001"
    ))!;
    const rootVariant = rootLevel.processing.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "raw-ms"
    ))!;
    const rootCertification = rootVariant.certifications.ms;
    const rootAsset = rootLevel.processing.browserReplays.find((entry) => (
      entry.variantId === "raw-ms" && entry.target === "ms"
    ))!;
    const mutableRootAsset = rootAsset as unknown as {
      parity: {
        receipt: {
          expected: { fullEventStream: P7TrainingEventStreamDigestV1 };
          observed: { fullEventStream: P7TrainingEventStreamDigestV1 };
        };
        evidence: BlobReferenceV1;
      };
    };
    const originalParity = rootAsset.parity.evidence;
    const substitutedRoot = {
      ...rootAsset.parity.receipt.expected.fullEventStream,
      manifest: {
        ...rootAsset.parity.receipt.expected.fullEventStream.manifest,
        digest: `sha256:${"f".repeat(64)}` as const,
      },
    };
    mutableRootAsset.parity.receipt.expected.fullEventStream = substitutedRoot;
    mutableRootAsset.parity.receipt.observed.fullEventStream = substitutedRoot;
    const replacedParity = await replaceGeneratedEvidenceValue({
      bundle: generatedEvidence,
      original: originalParity,
      value: rootAsset.parity.receipt,
    });
    mutableRootAsset.parity.evidence = replacedParity.reference;
    (rootCertification.execution as unknown as {
      browserReplayParityReceipt: BlobReferenceV1;
    }).browserReplayParityReceipt = replacedParity.reference;
    const rootSidecar = await buildP7GeneratedEvidenceSidecar({
      bundle: replacedParity.bundle,
      sha256,
    });
    (rootLevel.processing as unknown as {
      evidence: {
        index: P7GeneratedEvidenceSidecarV1["index"];
        indexContent: BlobReferenceV1;
      };
    }).evidence = {
      index: rootSidecar.index,
      indexContent: rootSidecar.indexContent,
    };
    persisted.sidecars.set("cclp1/001", rootSidecar);
    rootResults[resultIndex] = rehashShardResult(rootResults[resultIndex]!);
    await expect(reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results: rootResults,
      sha256,
      loadInventory: async () => inventory,
      verifyEvidence: persisted.verifyEvidence,
    })).rejects.toThrow("browser asset raw-ms:ms is not bound to its certification");
    persisted.sidecars.set("cclp1/001", originalSidecar);

    const prefixResults = structuredClone(results) as P7TrainingShardResultArtifact[];
    const prefixLevel = prefixResults[resultIndex]!.result.levels.find(({ occurrenceId }) => (
      occurrenceId === "cclp1/001"
    ))!;
    const prefixAsset = prefixLevel.processing.browserReplays.find((entry) => (
      entry.variantId === "portable" && entry.parity.receipt.portableScheduleProjection !== null
    ))!;
    expect(prefixAsset).toBeDefined();
    const prefixCertification = prefixLevel.processing.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "portable"
    ))!.certifications[prefixAsset.target];
    const originalPrefixParity = prefixAsset.parity.evidence;
    const projection = prefixAsset.parity.receipt.portableScheduleProjection as unknown as {
      authoredChangeCount: number;
      executedChangeCount: number;
      omittedPostTerminalChanges: Array<{
        ordinal: number;
        nativeTick: number;
        inputCode: number;
        modifierMask: 0;
      }>;
    };
    const forgedOrdinal = projection.authoredChangeCount;
    projection.authoredChangeCount += 1;
    projection.omittedPostTerminalChanges.push({
      ordinal: forgedOrdinal,
      nativeTick: prefixAsset.parity.receipt.expected.terminalNativeTick,
      inputCode: 0,
      modifierMask: 0,
    });
    const replacedPrefixParity = await replaceGeneratedEvidenceValue({
      bundle: generatedEvidence,
      original: originalPrefixParity,
      value: prefixAsset.parity.receipt,
    });
    (prefixAsset.parity as unknown as { evidence: BlobReferenceV1 }).evidence =
      replacedPrefixParity.reference;
    (prefixCertification.execution as unknown as {
      browserReplayParityReceipt: BlobReferenceV1;
    }).browserReplayParityReceipt = replacedPrefixParity.reference;
    const prefixSidecar = await buildP7GeneratedEvidenceSidecar({
      bundle: replacedPrefixParity.bundle,
      sha256,
    });
    (prefixLevel.processing as unknown as {
      evidence: {
        index: P7GeneratedEvidenceSidecarV1["index"];
        indexContent: BlobReferenceV1;
      };
    }).evidence = {
      index: prefixSidecar.index,
      indexContent: prefixSidecar.indexContent,
    };
    persisted.sidecars.set("cclp1/001", prefixSidecar);
    prefixResults[resultIndex] = rehashShardResult(prefixResults[resultIndex]!);
    await expect(reduceP7TrainingShards({
      repositoryRoot,
      plan,
      results: prefixResults,
      sha256,
      loadInventory: async () => inventory,
      verifyEvidence: persisted.verifyEvidence,
    })).rejects.toThrow("portable prefix drifted");
    persisted.sidecars.set("cclp1/001", originalSidecar);
  }, 120_000);

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
    await expectShardRowFailure({
      promise: runP7TrainingShard({
        ...common,
        processLevel: async (row) => ({ ...missingLevel(row), status: "complete" }),
      }),
      shardIndex: 0,
      occurrenceId: "cclp1/001",
      causeMessage: "process status disagrees",
    });
    await expectShardRowFailure({
      promise: runP7TrainingShard({
        ...common,
        processLevel: async (row) => ({ ...missingLevel(row), detail: "é".repeat(2_049) }),
      }),
      shardIndex: 0,
      occurrenceId: "cclp1/001",
      causeMessage: "private or unbounded path",
    });
    await expectShardRowFailure({
      promise: runP7TrainingShard({
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
      }),
      shardIndex: 0,
      occurrenceId: "cclp1/001",
      causeMessage: "private absolute path",
    });

    const pointerEvidence = inMemoryEvidence();
    await expectShardRowFailure({
      promise: runP7TrainingShard({
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
      }),
      shardIndex: 0,
      occurrenceId: "cclp1/001",
      causeMessage: "generated evidence contains an orphan",
    });
    expect(pointerEvidence.sidecars.size).toBe(0);
  }, 30_000);

  it("keeps unexpected processor errors shard-fatal without serializing private paths", async () => {
    const inventory = withoutDonors(
      await loadCheckedTrainingCorpusInventory(repositoryRoot),
      "cclp1",
    );
    const plan = await buildP7TrainingShardPlan({ inventory, packId: "cclp1", sha256 });
    const evidence = inMemoryEvidence();
    const privatePath = "/Users/example/private/do-not-publish.tws";
    const processorError = new Error(`unexpected processor failure at ${privatePath}`);
    const failure = await expectShardRowFailure({
      promise: runP7TrainingShard({
        repositoryRoot,
        request: plan.requests[0]!,
        sha256,
        loadInventory: async () => inventory,
        persistEvidence: evidence.persistEvidence,
        processLevel: async (row) => {
          if (row.occurrenceId === "cclp1/002") throw processorError;
          return missingLevel(row);
        },
      }),
      shardIndex: 0,
      occurrenceId: "cclp1/002",
      causeMessage: privatePath,
    });
    expect(failure.message).not.toContain(privatePath);
    expect(failure.cause).toBe(processorError);
    expect(evidence.sidecars.size).toBe(1);
  }, 30_000);
});

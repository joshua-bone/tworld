import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it } from "vitest";
import { CCLP1_FOUNDATION_LIMITS } from "../p7b-cohort/cclp1FoundationCohort";
import { P7B_MAX_SEGMENTS_PER_VARIANT } from "../p7b-training/trainingReplayContract";
import { loadCheckedTrainingCorpusInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import {
  materializeDetachedReplaySolution,
  type P7TrainingLevelInventory,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import type { P7GeneratedEvidenceSidecarV1 } from "./p7GeneratedEvidenceSidecar";
import { P7GeneratedEvidenceStore } from "./p7GeneratedEvidenceStore";
import {
  assertP7TrainingEventStreamDigest,
  P7_TRAINING_EVENT_STREAM_LIMITS,
  type P7TrainingEventStreamDigestV1,
} from "./p7TrainingEventAccumulator";
import {
  buildP7TrainingPackGeneratedEvidence,
  processP7TrainingLevel,
} from "./p7TrainingLevelProcessor";
import {
  validateAndPersistP7TrainingLevelProcessOutput,
} from "./p7TrainingShardProtocol";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));
const sha256 = new WebCryptoSha256();

function row(
  inventory: Awaited<ReturnType<typeof loadCheckedTrainingCorpusInventory>>,
  occurrenceId: string,
): P7TrainingLevelInventory {
  const result = inventory.packs
    .flatMap(({ levels }) => levels)
    .find((entry) => entry.occurrenceId === occurrenceId);
  if (result === undefined) throw new Error(`missing test inventory row ${occurrenceId}`);
  return result;
}

describe("production P7 training row processor", () => {
  it("executes, compiles, proves, and validates one real CCLP1 row end to end", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const source = row(inventory, "cclp1/001");
    const output = await processP7TrainingLevel(source, sha256);
    let persisted: P7GeneratedEvidenceSidecarV1 | null = null;
    const processing = await validateAndPersistP7TrainingLevelProcessOutput(
      source,
      output,
      sha256,
      repositoryRoot,
      async ({ occurrenceId, sidecar }) => {
        expect(occurrenceId).toBe("cclp1/001");
        persisted = structuredClone(sidecar);
      },
    );

    expect(output.status).toBe("complete");
    expect(processing.trainingReplayLevel.source).toMatchObject({
      packId: "cclp1",
      levelNumber: 1,
      title: "Key Pyramid",
    });
    expect(processing.trainingReplayLevel.rawDonors).toHaveLength(2);
    expect(processing.trainingReplayLevel.rawDonors.map(({ donorId }) => donorId)).toEqual(
      source.targets.map(({ donorCandidates }) => donorCandidates[0]!.candidateId),
    );
    expect(processing.trainingReplayLevel.variants.map(({ variantId }) => variantId)).toEqual([
      "raw-ms",
      "raw-lynx",
      "portable",
    ]);
    expect(processing.browserReplays).toHaveLength(4);
    expect(processing.portableDecisionTraces).toHaveLength(1);
    const portable = processing.trainingReplayLevel.variants.find(({ kind }) => kind === "portable")!;
    expect(portable.segments.length).toBeGreaterThan(0);
    expect(portable.certifications.ms.execution.browserReplayTransport)
      .toBe("manual-held-schedule");
    expect(portable.certifications.lynx.execution.browserReplayTransport)
      .toBe("manual-held-schedule");
    expect(persisted).not.toBeNull();
    expect(persisted!.index.entries.length).toBeGreaterThan(0);
    expect(persisted!.payload.byteLength).toBe(persisted!.index.payloadContent.byteLength);
  }, 30_000);

  it("keeps full-corpus portable segment parity on the first three production canaries", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    for (const occurrenceId of ["cclp1/024", "cclp1/080", "cclp1/109"] as const) {
      const source = row(inventory, occurrenceId);
      const output = await processP7TrainingLevel(source, sha256);
      await expect(validateAndPersistP7TrainingLevelProcessOutput(
        source,
        output,
        sha256,
        repositoryRoot,
        async () => undefined,
      )).resolves.toBeDefined();
      if (occurrenceId === "cclp1/024") {
        const portable = output.trainingReplayLevel.variants.find(({ kind }) => (
          kind === "portable"
        ))!;
        const certification = portable.certifications.ms;
        expect(portable.decisionCount).toBe(144);
        expect(certification.execution.executedDecisionCount).toBe(143);
        expect(certification.segmentSpans.at(-1)?.endDecisionOrdinal).toBe(143);
        const certificationEvidence = certification.evidence!;
        const certificationBlob = output.generatedEvidence.blobs.find(({ content }) => (
          content.digest === certificationEvidence.digest
          && content.byteLength === certificationEvidence.byteLength
        ))!;
        const certificationReceipt = JSON.parse(new TextDecoder().decode(certificationBlob.bytes)) as {
          readonly artifact: string;
          readonly eventCount: number;
          readonly fullEventStream: P7TrainingEventStreamDigestV1;
        };
        expect(certificationReceipt.artifact)
          .toBe("ccsolver-p7b-portable-target-certification");
        expect(certificationReceipt.eventCount)
          .toBe(certificationReceipt.fullEventStream.eventCount);
      }
    }
  }, 120_000);

  it("certifies the exact executed prefix when Lynx wins before an authored trailing decision", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const source = row(inventory, "cclp4/038");
    const output = await processP7TrainingLevel(source, sha256);
    const rawLynx = output.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "raw-lynx"
    ))!;
    const certification = rawLynx.certifications.lynx;
    const browserReplay = output.browserReplays.find(({ variantId, target }) => (
      variantId === "raw-lynx" && target === "lynx"
    ))!;
    const donor = source.targets.find(({ target }) => target === "lynx")!.donorCandidates[0]!;
    const authoredMoves = materializeDetachedReplaySolution(donor.replay).moves;

    expect(donor.replay.moveCount).toBe(789);
    expect(rawLynx.decisionCount).toBe(789);
    expect(rawLynx.replayContent).toEqual(donor.replay.content);
    expect(output.trainingReplayLevel.rawDonors.find(({ donorId }) => (
      donorId === donor.candidateId
    ))!.replayContent).toEqual(donor.replay.content);
    expect(certification).toMatchObject({
      status: "certified",
      outcome: "won",
      terminalNativeTick: 1_623,
      execution: {
        status: "native",
        executedDecisionCount: 788,
        replayContent: rawLynx.replayContent,
        browserReplayContent: browserReplay.content,
      },
    });
    expect(browserReplay.replay.transport).toBe("native-replay-pulses");
    if (browserReplay.replay.transport !== "native-replay-pulses") {
      throw new Error("raw Lynx replay used the wrong browser transport");
    }
    expect(browserReplay.replay.decisions).toEqual(authoredMoves.slice(0, 788).map((move, ordinal) => ({
      ordinal,
      nativeTick: move.when % 0x80_0000,
      encodedWhen: move.when,
      inputCode: move.dir,
      modifierMask: 0,
    })));
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      output,
      sha256,
      repositoryRoot,
      async () => undefined,
    )).resolves.toBeDefined();

    const forgedAuthoredCount = structuredClone(output) as unknown as {
      trainingReplayLevel: {
        variants: Array<{ variantId: string; decisionCount: number }>;
      };
    } & typeof output;
    forgedAuthoredCount.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "raw-lynx"
    ))!.decisionCount = 788;
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      forgedAuthoredCount,
      sha256,
      repositoryRoot,
      async () => undefined,
    )).rejects.toThrow("authored decision count drifted");
  }, 30_000);

  it("retains the complete bounded causal stream for the production event canary", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const source = row(inventory, "cclp1/118");
    const output = await processP7TrainingLevel(source, sha256);
    const rawMs = output.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "raw-ms"
    ))!;
    const eventEvidence = rawMs.certifications.ms.evidence!;
    const eventBlob = output.generatedEvidence.blobs.find(({ content }) => (
      content.digest === eventEvidence.digest
      && content.byteLength === eventEvidence.byteLength
    ))!;
    const eventReceipt = JSON.parse(new TextDecoder().decode(eventBlob.bytes)) as {
      readonly eventCount: number;
      readonly fullEventStream: P7TrainingEventStreamDigestV1;
    };
    expect(eventReceipt.eventCount).toBeGreaterThan(65_536);
    expect(eventReceipt.eventCount).toBeLessThanOrEqual(
      CCLP1_FOUNDATION_LIMITS.maximumRetainedEventsPerTarget,
    );
    expect(eventReceipt.fullEventStream.eventCount).toBe(eventReceipt.eventCount);
    expect(eventReceipt.fullEventStream.canonicalByteLength).toBeLessThanOrEqual(
      P7_TRAINING_EVENT_STREAM_LIMITS.maximumCanonicalBytes,
    );
    expect(eventReceipt.fullEventStream.chunking.chunkCount).toBeGreaterThan(0);
    expect(() => assertP7TrainingEventStreamDigest(eventReceipt.fullEventStream)).not.toThrow();
    if (process.env.TWORLD_P7_TRAINING_METRICS === "1") {
      process.stderr.write(`${JSON.stringify({
        occurrenceId: source.occurrenceId,
        eventCount: eventReceipt.eventCount,
        eventStreamByteLength: eventReceipt.fullEventStream.canonicalByteLength,
      })}\n`);
    }
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      output,
      sha256,
      repositoryRoot,
      async () => undefined,
    )).resolves.toBeDefined();
  }, 120_000);

  it("bounds dense production routes as viewable chapters within the shard contract", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    expect(P7B_MAX_SEGMENTS_PER_VARIANT).toBe(24);
    for (const occurrenceId of ["cclp1/015", "cclp1/124"] as const) {
      const source = row(inventory, occurrenceId);
      const output = await processP7TrainingLevel(source, sha256);
      let persisted: P7GeneratedEvidenceSidecarV1 | null = null;
      await expect(validateAndPersistP7TrainingLevelProcessOutput(
        source,
        output,
        sha256,
        repositoryRoot,
        async ({ sidecar }) => { persisted = structuredClone(sidecar); },
      )).resolves.toBeDefined();
      for (const variant of output.trainingReplayLevel.variants) {
        expect(variant.segments.length).toBeLessThanOrEqual(P7B_MAX_SEGMENTS_PER_VARIANT);
        for (const certification of [variant.certifications.ms, variant.certifications.lynx]) {
          expect(certification.segmentSpans.length)
            .toBeLessThanOrEqual(P7B_MAX_SEGMENTS_PER_VARIANT);
        }
      }
      expect(persisted).not.toBeNull();
      expect(persisted!.index.entries.length).toBeLessThanOrEqual(256);
      const boundaryEvidenceCount = output.generatedEvidence.blobs.filter((blob) => {
        if (blob.mediaType !== "application/json") return false;
        const value = JSON.parse(new TextDecoder().decode(blob.bytes)) as { artifact?: unknown };
        return value.artifact === "ccsolver-p7-segment-boundary-evidence";
      }).length;
      expect(boundaryEvidenceCount).toBe(occurrenceId === "cclp1/015" ? 69 : 46);
      if (process.env.TWORLD_P7_TRAINING_METRICS === "1") {
        process.stderr.write(`${JSON.stringify({
          occurrenceId,
          evidenceBlobCount: persisted!.index.entries.length,
          evidenceByteLength: persisted!.index.totals.byteLength,
          boundaryEvidenceCount,
          variantSegments: output.trainingReplayLevel.variants.map((variant) => ({
            variantId: variant.variantId,
            segmentCount: variant.segments.length,
          })),
        })}\n`);
      }
    }
  }, 180_000);

  it("pins the bounded voting-alias, edited-relative, and true-missing acceptance rows", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const exact = row(inventory, "cclp5/089");
    const edited = row(inventory, "cclp5/004");
    const missing = row(inventory, "cclp5/139");
    expect(exact.targets.flatMap(({ donorCandidates }) => donorCandidates).some((candidate) => (
      candidate.mapRelationship === "exact-gameplay-alias"
      && candidate.source.occurrenceId === "cclp5-voting-uniform/044"
    ))).toBe(true);
    expect(edited.targets.flatMap(({ donorCandidates }) => donorCandidates).some((candidate) => (
      candidate.mapRelationship === "edited-relative"
      && candidate.source.occurrenceId === "cclp5-voting-chocolate/047"
      && candidate.mapDiff !== null
    ))).toBe(true);
    expect(missing.title).toBe("Udassa");
    expect(missing.targets.every(({ donorCandidates }) => donorCandidates.length === 0)).toBe(true);
  }, 30_000);

  it("processes the bounded CCLP5 exact, edited-failure, and missing trio honestly", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const exactRow = row(inventory, "cclp5/089");
    const editedRow = row(inventory, "cclp5/004");
    const missingRow = row(inventory, "cclp5/139");
    const exact = await processP7TrainingLevel(exactRow, sha256);
    const edited = await processP7TrainingLevel(editedRow, sha256);
    const missing = await processP7TrainingLevel(missingRow, sha256);

    expect(exact.trainingReplayLevel.rawDonors.some((donor) => (
      donor.mapRelationship === "exact-gameplay-alias"
      && donor.mapComparisonEvidence !== null
    ))).toBe(true);
    expect(exact.status).not.toBe("missing-donor");
    expect(edited.trainingReplayLevel.rawDonors.some((donor) => (
      donor.mapRelationship === "edited-relative"
      && donor.mapComparisonEvidence !== null
    ))).toBe(true);
    expect(edited.status).toBe("no-certified-replay");
    expect(edited.trainingReplayLevel.variants.flatMap((variant) => (
      [variant.certifications.ms, variant.certifications.lynx]
    )).filter(({ execution }) => execution.status === "native").every(({ status }) => (
      status === "failed"
    ))).toBe(true);
    const editedFailedCells = edited.trainingReplayLevel.variants.flatMap((variant) => (
      (["ms", "lynx"] as const).map((target) => ({
        variantId: variant.variantId,
        target,
        certification: variant.certifications[target],
      }))
    )).filter(({ certification }) => certification.status === "failed");
    expect(editedFailedCells.length).toBeGreaterThan(0);
    const editedFailureExecutionStatuses = editedFailedCells.map(({ certification }) => (
      certification.execution.status
    ));
    expect(editedFailureExecutionStatuses).toContain("native");
    expect(editedFailureExecutionStatuses.every((status) => (
      status === "native" || status === "compiled"
    ))).toBe(true);
    for (const { variantId, target, certification } of editedFailedCells) {
      expect(certification.evidence).not.toBeNull();
      expect(certification.detail).not.toBe("");
      expect(certification.execution).toMatchObject({
        browserReplayContent: null,
        browserReplayParityReceipt: null,
        browserReplayTransport: null,
      });
      expect(edited.browserReplays.some((asset) => (
        asset.variantId === variantId && asset.target === target
      ))).toBe(false);
    }
    expect(missing.status).toBe("missing-donor");
    expect(missing.trainingReplayLevel.rawDonors).toEqual([]);
    expect(missing.trainingReplayLevel.variants).toEqual([]);

    for (const [source, output] of [
      [exactRow, exact],
      [editedRow, edited],
      [missingRow, missing],
    ] as const) {
      let persisted = false;
      await validateAndPersistP7TrainingLevelProcessOutput(
        source,
        output,
        sha256,
        repositoryRoot,
        async () => { persisted = true; },
      );
      expect(persisted).toBe(true);
    }
  }, 60_000);

  it("executes an available target without erasing it when its peer donor is missing", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const paired = row(inventory, "cclp1/001");
    const source = {
      ...paired,
      targets: paired.targets.map((target) => target.target === "lynx"
        ? { ...target, donorCandidates: [] }
        : target) as unknown as P7TrainingLevelInventory["targets"],
    };
    const available = source.targets.find(({ donorCandidates }) => donorCandidates.length > 0)!;
    const missing = source.targets.find(({ donorCandidates }) => donorCandidates.length === 0)!;
    const output = await processP7TrainingLevel(source, sha256);
    let persisted = false;
    const processing = await validateAndPersistP7TrainingLevelProcessOutput(
      source,
      output,
      sha256,
      repositoryRoot,
      async () => { persisted = true; },
    );

    expect(processing.trainingReplayLevel.donorCoverage[available.target]).toMatchObject({
      status: "bound",
      rawDonorId: available.donorCandidates[0]!.candidateId,
    });
    expect(processing.trainingReplayLevel.donorCoverage[missing.target]).toEqual({
      status: "missing",
      rawDonorId: null,
      detail: "no deterministic donor candidate",
    });
    expect(processing.trainingReplayLevel.rawDonors).toHaveLength(1);
    expect(processing.trainingReplayLevel.variants.filter(({ kind }) => kind === "raw"))
      .toHaveLength(1);
    expect(processing.browserReplays.filter(({ variantId }) => variantId !== "portable"))
      .toHaveLength(1);
    expect(persisted).toBe(true);
  }, 30_000);

  it("lifts the frozen portable profile to one pack owner across two real rows", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const first = await processP7TrainingLevel(row(inventory, "cclp1/001"), sha256);
    const second = await processP7TrainingLevel(row(inventory, "cclp1/002"), sha256);
    const pack = await buildP7TrainingPackGeneratedEvidence("cclp1", sha256);
    const profileRefs = [first, second].map((output) => (
      output.trainingReplayLevel.variants.find(({ kind }) => kind === "portable")!
        .portableProfile!.profileContent
    ));
    expect(profileRefs).toEqual([pack.profileContent, pack.profileContent]);
    for (const output of [first, second]) {
      expect(output.generatedEvidence.blobs.some(({ content }) => (
        content.digest === pack.profileContent.digest
      ))).toBe(false);
    }
    expect(pack.generatedEvidence.blobs).toHaveLength(1);
    expect(pack.generatedEvidence.blobs[0]!.content).toEqual(pack.profileContent);
  }, 60_000);

  it("rejects coherently re-signed donor and browser-boundary substitutions", async () => {
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot);
    const source = row(inventory, "cclp1/001");
    const output = await processP7TrainingLevel(source, sha256);

    const forgedDonor = structuredClone(output) as unknown as {
      trainingReplayLevel: {
        donorCoverage: Record<"ms" | "lynx", { rawDonorId: string | null }>;
        rawDonors: Array<{ donorId: string; target: "ms" | "lynx" }>;
        variants: Array<{ lineage: { rawDonorId: string | null } }>;
      };
    } & typeof output;
    const donor = forgedDonor.trainingReplayLevel.rawDonors[0]!;
    const originalDonorId = donor.donorId;
    donor.donorId = "forged-inventory-donor-id";
    forgedDonor.trainingReplayLevel.donorCoverage[donor.target].rawDonorId = donor.donorId;
    forgedDonor.trainingReplayLevel.variants.forEach((variant) => {
      if (variant.lineage.rawDonorId === originalDonorId) {
        variant.lineage.rawDonorId = donor.donorId;
      }
    });
    let invalidPersisted = false;
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      forgedDonor,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("donor set drifted");
    expect(invalidPersisted).toBe(false);

    const renamedReceipt = structuredClone(output) as typeof output;
    const renamedCertification = renamedReceipt.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "raw-ms"
    ))!.certifications.ms;
    const originalCertificationEvidence = renamedCertification.evidence!;
    const originalCertificationBlob = renamedReceipt.generatedEvidence.blobs.find(({ content }) => (
      content.digest === originalCertificationEvidence.digest
      && content.byteLength === originalCertificationEvidence.byteLength
    ))!;
    const renamedValue = JSON.parse(new TextDecoder().decode(
      originalCertificationBlob.bytes,
    )) as Record<string, unknown>;
    renamedValue.artifact = "ccsolver-p7-native-replay-certification-receipt-renamed";
    const renamedEvidence = new P7GeneratedEvidenceStore({
      scopeId: renamedReceipt.generatedEvidence.scopeId,
      sha256,
    });
    await renamedEvidence.importBundle(renamedReceipt.generatedEvidence);
    const renamedReference = await renamedEvidence.referenceCanonical(renamedValue);
    (renamedCertification as unknown as {
      evidence: typeof renamedReference;
    }).evidence = renamedReference;
    const renamedBlobs = renamedEvidence.bundle().blobs.filter(({ content }) => (
      content.digest !== originalCertificationEvidence.digest
      || content.byteLength !== originalCertificationEvidence.byteLength
    ));
    (renamedReceipt as unknown as {
      generatedEvidence: typeof output.generatedEvidence;
    }).generatedEvidence = {
      ...renamedReceipt.generatedEvidence,
      totals: {
        blobCount: renamedBlobs.length,
        byteLength: renamedBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: renamedBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      renamedReceipt,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("artifact does not match its native execution");
    expect(invalidPersisted).toBe(false);

    const alternativeRoot = structuredClone(output) as typeof output;
    const rootVariant = alternativeRoot.trainingReplayLevel.variants.find(({ variantId }) => (
      variantId === "raw-ms"
    ))!;
    const rootCertification = rootVariant.certifications.ms;
    const rootAsset = alternativeRoot.browserReplays.find((entry) => (
      entry.variantId === rootVariant.variantId && entry.target === "ms"
    ))!;
    const mutableRootAsset = rootAsset as unknown as {
      parity: {
        receipt: {
          expected: { fullEventStream: P7TrainingEventStreamDigestV1 };
          observed: { fullEventStream: P7TrainingEventStreamDigestV1 };
        };
        evidence: { digest: `sha256:${string}`; byteLength: number };
      };
    };
    const rootEvidence = new P7GeneratedEvidenceStore({
      scopeId: alternativeRoot.generatedEvidence.scopeId,
      sha256,
    });
    await rootEvidence.importBundle(alternativeRoot.generatedEvidence);
    const originalRootParity = rootAsset.parity.evidence;
    const substitutedRoot = {
      ...rootAsset.parity.receipt.expected.fullEventStream,
      manifest: {
        ...rootAsset.parity.receipt.expected.fullEventStream.manifest,
        digest: `sha256:${"f".repeat(64)}` as const,
      },
    };
    mutableRootAsset.parity.receipt.expected.fullEventStream = substitutedRoot;
    mutableRootAsset.parity.receipt.observed.fullEventStream = substitutedRoot;
    const substitutedRootParity = await rootEvidence.referenceCanonical(rootAsset.parity.receipt);
    mutableRootAsset.parity.evidence = substitutedRootParity;
    (rootCertification.execution as unknown as {
      browserReplayParityReceipt: typeof substitutedRootParity;
    }).browserReplayParityReceipt = substitutedRootParity;
    const rootBlobs = rootEvidence.bundle().blobs.filter(({ content }) => (
      content.digest !== originalRootParity.digest
      || content.byteLength !== originalRootParity.byteLength
    ));
    (alternativeRoot as unknown as {
      generatedEvidence: typeof output.generatedEvidence;
    }).generatedEvidence = {
      ...alternativeRoot.generatedEvidence,
      totals: {
        blobCount: rootBlobs.length,
        byteLength: rootBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: rootBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      alternativeRoot,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("browser asset raw-ms:ms is not bound to its certification");
    expect(invalidPersisted).toBe(false);

    const forgedBoundary = structuredClone(output) as unknown as {
      trainingReplayLevel: {
        variants: Array<{
          variantId: string;
          certifications: Record<"ms" | "lynx", {
            status: string;
            segmentSpans: Array<{ startBoundaryEvidence: { digest: `sha256:${string}`; byteLength: number } }>;
            execution: { browserReplayParityReceipt: { digest: `sha256:${string}`; byteLength: number } };
          }>;
        }>;
      };
      browserReplays: Array<{
        variantId: string;
        target: "ms" | "lynx";
        parity: {
          receipt: {
            expected: { segmentBoundaries: Array<{ startBoundaryEvidence: { digest: `sha256:${string}`; byteLength: number } }> };
            observed: { segmentBoundaries: Array<{ startBoundaryEvidence: { digest: `sha256:${string}`; byteLength: number } }> };
          };
          evidence: { digest: `sha256:${string}`; byteLength: number };
        };
      }>;
      generatedEvidence: typeof output.generatedEvidence;
    } & typeof output;
    const variant = forgedBoundary.trainingReplayLevel.variants.find(({ certifications }) => (
      certifications.ms.status === "certified" && certifications.ms.segmentSpans.length > 0
    ))!;
    const certification = variant.certifications.ms;
    const asset = forgedBoundary.browserReplays.find((entry) => (
      entry.variantId === variant.variantId && entry.target === "ms"
    ))!;
    const evidence = new P7GeneratedEvidenceStore({
      scopeId: forgedBoundary.generatedEvidence.scopeId,
      sha256,
    });
    await evidence.importBundle(forgedBoundary.generatedEvidence);
    const originalParity = asset.parity.evidence;
    const substitutedBoundary = await evidence.referenceCanonical({
      artifact: "ccsolver-p7-forged-boundary",
      version: 1,
      boundary: 0,
    });
    certification.segmentSpans[0]!.startBoundaryEvidence = substitutedBoundary;
    asset.parity.receipt.expected.segmentBoundaries[0]!.startBoundaryEvidence = substitutedBoundary;
    asset.parity.receipt.observed.segmentBoundaries[0]!.startBoundaryEvidence = substitutedBoundary;
    const substitutedParity = await evidence.referenceCanonical(asset.parity.receipt);
    asset.parity.evidence = substitutedParity;
    certification.execution.browserReplayParityReceipt = substitutedParity;
    const boundaryBlobs = evidence.bundle().blobs.filter(({ content }) => (
      content.digest !== originalParity.digest
      || content.byteLength !== originalParity.byteLength
    ));
    forgedBoundary.generatedEvidence = {
      ...forgedBoundary.generatedEvidence,
      totals: {
        blobCount: boundaryBlobs.length,
        byteLength: boundaryBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: boundaryBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      forgedBoundary,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("certification evidence drifted");
    expect(invalidPersisted).toBe(false);

    const forgedTranscript = structuredClone(output) as unknown as {
      trainingReplayLevel: {
        variants: Array<{
          variantId: string;
          certifications: Record<"ms" | "lynx", {
            status: string;
            execution: { browserReplayParityReceipt: { digest: `sha256:${string}`; byteLength: number } };
          }>;
        }>;
      };
      browserReplays: Array<{
        variantId: string;
        target: "ms" | "lynx";
        parity: {
          receipt: {
            observed: {
              segmentSelection: {
                targetTranscript: { digest: `sha256:${string}`; byteLength: number };
              };
            };
          };
          evidence: { digest: `sha256:${string}`; byteLength: number };
        };
      }>;
      generatedEvidence: typeof output.generatedEvidence;
    } & typeof output;
    const transcriptVariant = forgedTranscript.trainingReplayLevel.variants.find((entry) => (
      entry.certifications.ms.status === "certified"
    ))!;
    const transcriptCertification = transcriptVariant.certifications.ms;
    const transcriptAsset = forgedTranscript.browserReplays.find((entry) => (
      entry.variantId === transcriptVariant.variantId && entry.target === "ms"
    ))!;
    const transcriptEvidence = new P7GeneratedEvidenceStore({
      scopeId: forgedTranscript.generatedEvidence.scopeId,
      sha256,
    });
    await transcriptEvidence.importBundle(forgedTranscript.generatedEvidence);
    const originalTranscriptParity = transcriptAsset.parity.evidence;
    transcriptAsset.parity.receipt.observed.segmentSelection.targetTranscript.digest =
      `sha256:${"f".repeat(64)}`;
    const substitutedTranscriptParity = await transcriptEvidence.referenceCanonical(
      transcriptAsset.parity.receipt,
    );
    transcriptAsset.parity.evidence = substitutedTranscriptParity;
    transcriptCertification.execution.browserReplayParityReceipt = substitutedTranscriptParity;
    const transcriptBlobs = transcriptEvidence.bundle().blobs.filter(({ content }) => (
      content.digest !== originalTranscriptParity.digest
      || content.byteLength !== originalTranscriptParity.byteLength
    ));
    forgedTranscript.generatedEvidence = {
      ...forgedTranscript.generatedEvidence,
      totals: {
        blobCount: transcriptBlobs.length,
        byteLength: transcriptBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: transcriptBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      forgedTranscript,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("expected and observed results drifted");
    expect(invalidPersisted).toBe(false);

    const nestedRow = row(inventory, "cclp1/109");
    const nestedOutput = await processP7TrainingLevel(nestedRow, sha256);
    const missingNested = structuredClone(nestedOutput) as typeof nestedOutput;
    const alignedReceipt = missingNested.generatedEvidence.blobs.find((blob) => {
      if (blob.mediaType !== "application/json") return false;
      const value = JSON.parse(new TextDecoder().decode(blob.bytes)) as { artifact?: unknown };
      return value.artifact === "ccsolver-p7b-portable-aligned-target-certification";
    })!;
    const alignedValue = JSON.parse(new TextDecoder().decode(alignedReceipt.bytes)) as {
      sourceCertificationEvidence: { digest: `sha256:${string}`; byteLength: number };
    };
    const missingKey = `${alignedValue.sourceCertificationEvidence.digest}/${
      alignedValue.sourceCertificationEvidence.byteLength
    }`;
    const retainedBlobs = missingNested.generatedEvidence.blobs.filter(({ content }) => (
      `${content.digest}/${content.byteLength}` !== missingKey
    ));
    (missingNested as unknown as {
      generatedEvidence: typeof nestedOutput.generatedEvidence;
    }).generatedEvidence = {
      ...missingNested.generatedEvidence,
      totals: {
        blobCount: retainedBlobs.length,
        byteLength: retainedBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: retainedBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      nestedRow,
      missingNested,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("recursive reference is unresolved");
    expect(invalidPersisted).toBe(false);

    const substitutedNested = structuredClone(nestedOutput) as typeof nestedOutput;
    const substitutedCertification = substitutedNested.trainingReplayLevel.variants
      .flatMap(({ certifications }) => [certifications.ms, certifications.lynx])
      .find(({ evidence: content }) => (
        content !== null
        && content.digest === alignedReceipt.content.digest
        && content.byteLength === alignedReceipt.content.byteLength
      ))!;
    const substitutedNestedEvidence = new P7GeneratedEvidenceStore({
      scopeId: substitutedNested.generatedEvidence.scopeId,
      sha256,
    });
    await substitutedNestedEvidence.importBundle(substitutedNested.generatedEvidence);
    const authoritySubstitutedValue = structuredClone(alignedValue);
    authoritySubstitutedValue.sourceCertificationEvidence =
      nestedRow.targets[0].donorCandidates[0]!.replay.content;
    const authoritySubstitutedReceipt = await substitutedNestedEvidence.referenceCanonical(
      authoritySubstitutedValue,
    );
    (substitutedCertification as unknown as {
      evidence: typeof authoritySubstitutedReceipt;
    }).evidence = authoritySubstitutedReceipt;
    const authoritySubstitutedBlobs = substitutedNestedEvidence.bundle().blobs.filter(({ content }) => (
      (
        content.digest !== alignedReceipt.content.digest
        || content.byteLength !== alignedReceipt.content.byteLength
      )
      && (
        content.digest !== alignedValue.sourceCertificationEvidence.digest
        || content.byteLength !== alignedValue.sourceCertificationEvidence.byteLength
      )
    ));
    (substitutedNested as unknown as {
      generatedEvidence: typeof nestedOutput.generatedEvidence;
    }).generatedEvidence = {
      ...substitutedNested.generatedEvidence,
      totals: {
        blobCount: authoritySubstitutedBlobs.length,
        byteLength: authoritySubstitutedBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: authoritySubstitutedBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      nestedRow,
      substitutedNested,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("aligned source certification");
    expect(invalidPersisted).toBe(false);

    const wrongLength = structuredClone(output) as typeof output;
    const wrongLengthPortable = wrongLength.trainingReplayLevel.variants.find(({ kind }) => (
      kind === "portable"
    ))!;
    const originalLineageEvidence = wrongLengthPortable.lineage.evidence!;
    const transformEvidence = wrongLengthPortable.transforms[0]!.evidence!;
    (wrongLengthPortable.lineage as unknown as {
      evidence: { digest: `sha256:${string}`; byteLength: number };
    }).evidence = {
      digest: transformEvidence.digest,
      byteLength: transformEvidence.byteLength + 1,
    };
    const wrongLengthBlobs = wrongLength.generatedEvidence.blobs.filter(({ content }) => (
      content.digest !== originalLineageEvidence.digest
      || content.byteLength !== originalLineageEvidence.byteLength
    ));
    (wrongLength as unknown as {
      generatedEvidence: typeof output.generatedEvidence;
    }).generatedEvidence = {
      ...wrongLength.generatedEvidence,
      totals: {
        blobCount: wrongLengthBlobs.length,
        byteLength: wrongLengthBlobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: wrongLengthBlobs,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      wrongLength,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("not an authority terminal");
    expect(invalidPersisted).toBe(false);

    const substitutedTransform = structuredClone(output);
    const substitutedPortable = substitutedTransform.trainingReplayLevel.variants.find(({ kind }) => (
      kind === "portable"
    ))!;
    const originalTransformEvidence = substitutedPortable.transforms[0]!.evidence!;
    const lineageEvidence = substitutedPortable.lineage.evidence!;
    for (const transform of substitutedPortable.transforms) {
      (transform as unknown as { evidence: typeof lineageEvidence }).evidence = lineageEvidence;
    }
    const withoutTransformLedger = substitutedTransform.generatedEvidence.blobs.filter(({ content }) => (
      content.digest !== originalTransformEvidence.digest
      || content.byteLength !== originalTransformEvidence.byteLength
    ));
    (substitutedTransform as unknown as {
      generatedEvidence: typeof output.generatedEvidence;
    }).generatedEvidence = {
      ...substitutedTransform.generatedEvidence,
      totals: {
        blobCount: withoutTransformLedger.length,
        byteLength: withoutTransformLedger.reduce((sum, blob) => sum + blob.bytes.byteLength, 0),
      },
      blobs: withoutTransformLedger,
    };
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      substitutedTransform,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
    )).rejects.toThrow("transform ledger");
    expect(invalidPersisted).toBe(false);

    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      output,
      sha256,
      repositoryRoot,
      async () => { invalidPersisted = true; },
      { maximumLevelResultBytes: 1 },
    )).rejects.toThrow("canonical level result is");
    expect(invalidPersisted).toBe(false);
  }, 30_000);
});

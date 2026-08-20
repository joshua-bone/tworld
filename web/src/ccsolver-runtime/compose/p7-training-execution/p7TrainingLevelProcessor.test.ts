import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { describe, expect, it } from "vitest";
import { loadCheckedTrainingCorpusInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import type { P7TrainingLevelInventory } from "../p7c-p7e-inventory/trainingCorpusInventory";
import type { P7GeneratedEvidenceSidecarV1 } from "./p7GeneratedEvidenceSidecar";
import { P7GeneratedEvidenceStore } from "./p7GeneratedEvidenceStore";
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
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      forgedDonor,
      sha256,
      repositoryRoot,
      async () => undefined,
    )).rejects.toThrow("donor set drifted");

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
    forgedBoundary.generatedEvidence = evidence.bundle();
    await expect(validateAndPersistP7TrainingLevelProcessOutput(
      source,
      forgedBoundary,
      sha256,
      repositoryRoot,
      async () => undefined,
    )).rejects.toThrow("certification evidence drifted");
  }, 30_000);
});

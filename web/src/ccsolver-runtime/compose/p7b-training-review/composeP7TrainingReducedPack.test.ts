import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import type { BlobReferenceV1 } from "@tworld/ccsolver/domain";
import {
  buildP7GeneratedEvidenceSidecar,
  type P7GeneratedEvidenceSidecarV1,
} from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import { P7GeneratedEvidenceStore } from "../p7-training-execution/p7GeneratedEvidenceStore";
import {
  buildP7TrainingShardPlan,
  buildP7TrainingMapComparisonEvidenceValue,
  type P7TrainingReducedPack,
} from "../p7-training-execution/p7TrainingShardProtocol";
import { buildP7bTrainingReplayLevel } from "../p7b-training/trainingReplayContract";
import { loadCheckedTrainingCorpusInventory } from "../p7c-p7e-inventory/loadCheckedTrainingCorpusInventory";
import type {
  P7TrainingDonorCandidate,
  P7TrainingCorpusInventory,
  P7TrainingLevelInventory,
  P7TrainingPackId,
} from "../p7c-p7e-inventory/trainingCorpusInventory";
import {
  composeP7TrainingReducedPack,
  composeP7TrainingReducedPackBuildInput,
} from "./composeP7TrainingReducedPack";
import { buildP7TrainingReducedPackExecutionIndex } from "./composeP7TrainingReducedExecutionIndex";
import {
  P7B_SHARED_PLAYER_DIST_ENTRY,
  buildP7bTrainingPackOutputs,
} from "./buildP7bTrainingPackOutputs";
import { attestP7bTrainingPackOutputs } from "./p7bTrainingPackIo";
import {
  P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
  buildP7SharedPlayerGraphAttestation,
} from "./p7SharedPlayerGraphAttestation";

const repositoryRoot = fileURLToPath(new URL("../../../../..", import.meta.url));

function sourceContent(row: P7TrainingLevelInventory) {
  const member = row.source.sourceMembers.find(({ ordinal }) => ordinal === 0)!;
  return { digest: `sha256:${member.sha256}` as const, byteLength: member.byteLength };
}

function donor(
  candidate: P7TrainingDonorCandidate,
  mapComparisonEvidence: BlobReferenceV1 | null,
) {
  const member = candidate.source.sourceMembers.find(({ ordinal }) => ordinal === 0)!;
  return {
    donorId: candidate.candidateId,
    target: candidate.target,
    origin: candidate.source.origin,
    sourcePackId: candidate.source.packId,
    sourceLevelNumber: candidate.source.levelNumber,
    sourceNormalizedGameplaySha256: candidate.source.normalizedGameplaySha256,
    sourceLevelContent: {
      digest: `sha256:${member.sha256}` as const,
      byteLength: member.byteLength,
    },
    replayContent: candidate.replay.content,
    mapRelationship: candidate.mapRelationship,
    mapComparisonEvidence,
  };
}

async function structuralReducedPack(
  inventory: P7TrainingCorpusInventory,
  packId: P7TrainingPackId,
  sha256: WebCryptoSha256,
) {
  const pack = inventory.packs.find((entry) => entry.packId === packId)!;
  const plan = await buildP7TrainingShardPlan({ inventory, packId, sha256 });
  const persisted = new Map<string, P7GeneratedEvidenceSidecarV1>();
  const levels: P7TrainingReducedPack["levels"][number][] = [];
  for (const row of pack.levels) {
    const evidence = new P7GeneratedEvidenceStore({
      scopeId: `${row.occurrenceId}/fixture`,
      sha256,
    });
    const eligibilityEvidence = await evidence.referenceCanonical(row.eligibility);
    const selected = row.targets.map(({ donorCandidates }) => donorCandidates[0]!).filter(Boolean);
    const rawDonors: ReturnType<typeof donor>[] = [];
    for (const candidate of selected) {
      const comparison = buildP7TrainingMapComparisonEvidenceValue(row, candidate);
      rawDonors.push(donor(
        candidate,
        comparison === null ? null : await evidence.referenceCanonical(comparison),
      ));
    }
    const contract = buildP7bTrainingReplayLevel({
      artifact: "ccsolver-p7b-training-replay-level",
      version: 1,
      source: {
        packId: row.packId,
        levelNumber: row.levelNumber,
        title: row.title,
        normalizedGameplaySha256: row.source.normalizedGameplaySha256,
        levelContent: sourceContent(row),
        eligibility: {
          status: "eligible",
          standardOnly: true,
          policyRevision: `${row.eligibility.sourceScope.policyRevision}+${row.eligibility.legacyValidity.policyRevision}`,
          evidence: eligibilityEvidence,
        },
      },
      donorCoverage: Object.fromEntries((["ms", "lynx"] as const).map((target) => {
        const bound = rawDonors.find((entry) => entry.target === target);
        return [target, bound === undefined
          ? { status: "missing", rawDonorId: null, detail: "fixture donor omitted" }
          : { status: "bound", rawDonorId: bound.donorId, detail: "fixture donor bound" }];
      })),
      rawDonors,
      variants: [],
      processing: { status: "blocked", detail: "fixture structural composition" },
      viewableVariantId: null,
    });
    const sidecar = await buildP7GeneratedEvidenceSidecar({
      bundle: evidence.bundle(),
      sha256,
    });
    persisted.set(row.occurrenceId, sidecar);
    levels.push({
      occurrenceId: row.occurrenceId,
      caseId: row.caseId,
      levelNumber: row.levelNumber,
      processing: {
        status: rawDonors.length === 0 ? "missing-donor" : "no-certified-replay",
        detail: "fixture structural composition",
        trainingReplayLevel: contract,
        browserTargets: Object.fromEntries(row.targets.map(({ target, execution }) => [
          target,
          { request: structuredClone(execution.request), display: structuredClone(execution.display) },
        ])) as never,
        browserReplays: [],
        portableDecisionTraces: [],
        evidence: { index: sidecar.index, indexContent: sidecar.indexContent },
      },
    });
  }
  return {
    pack,
    plan,
    persisted,
    reducedPack: {
      packId,
      packContent: plan.packContent,
      levels,
    } satisfies P7TrainingReducedPack,
  };
}

async function sharedPlayerFixture(sha256: WebCryptoSha256) {
  const graphAttestation = await buildP7SharedPlayerGraphAttestation({
    sourceEntryBytes: new TextEncoder().encode("export const p7Player = true;\n"),
    sourceClosureRevision: "fixture-player-source-v1",
    toolchainRevision: "fixture-vite-v1",
    viteManifestBytes: new TextEncoder().encode(JSON.stringify({
      "src/bootstrap/browser/p7bReplayPlayer.tsx": {
        file: P7B_SHARED_PLAYER_DIST_ENTRY,
        isEntry: true,
        src: "src/bootstrap/browser/p7bReplayPlayer.tsx",
      },
    })),
    builtFiles: [{
      path: P7B_SHARED_PLAYER_DIST_ENTRY,
      bytes: new TextEncoder().encode("export {};\n"),
    }],
    sha256,
  });
  return {
    graphAttestationPath: P7_SHARED_PLAYER_GRAPH_CHECKED_PATH,
    graphAttestation,
  } as const;
}

describe("P7 reduced training-pack composer", () => {
  it("rejects a reduced pack that does not cover all 149 official levels", async () => {
    const sha256 = new WebCryptoSha256();
    await expect(composeP7TrainingReducedPackBuildInput({
      repositoryRoot: "/fixture",
      reducedPack: {
        packId: "cclp1",
        packContent: { digest: `sha256:${"0".repeat(64)}`, byteLength: 0 },
        levels: [],
      },
      sharedPlayer: null as never,
      sha256,
      loadInventory: async () => ({
        corpusRevision: "fixture",
        verifiedInputs: [],
        packs: [],
        summary: {},
      } as never),
      loadEvidence: async () => {
        throw new Error("evidence must not load for an invalid denominator");
      },
      readExternalBytes: async () => {
        throw new Error("external bytes must not load for an invalid denominator");
      },
    })).rejects.toThrow("exactly 149");
  });

  it("maps a complete reduced denominator to exact sources, donor bytes, and sidecars", async () => {
    const sha256 = new WebCryptoSha256();
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot, sha256);
    const { pack, persisted, plan, reducedPack } = await structuralReducedPack(
      inventory,
      "cclp1",
      sha256,
    );
    const sharedPlayer = await sharedPlayerFixture(sha256);
    const composition = await composeP7TrainingReducedPack({
      repositoryRoot,
      reducedPack,
      sharedPlayer,
      sha256,
      loadInventory: async () => inventory,
      loadEvidence: async ({ occurrenceId }) => {
        const sidecar = persisted.get(occurrenceId)!;
        return { indexCanonicalJson: sidecar.indexCanonicalJson, payload: sidecar.payload };
      },
    });
    const composed = composition.buildInput;

    expect(composed.pack).toEqual({
      packId: "cclp1",
      title: pack.displayName,
      expectedLevelCount: 149,
    });
    expect(composed.inventory).toHaveLength(149);
    expect(composed.processedLevels).toHaveLength(149);
    expect(composed.processedLevels[0]!.rawDonorBytes).toHaveLength(2);
    expect(composed.processedLevels.every(({ rawDonorBytes }) => (
      rawDonorBytes.length === 2
    ))).toBe(true);
    expect(composed.proof.generatedEvidence.levels).toHaveLength(149);
    expect(composed.proof.generatedEvidence.pack.blobs.length).toBeGreaterThan(0);
    const levelEvidenceOwners = new Set<string>();
    for (const { bundle } of composed.proof.generatedEvidence.levels) {
      for (const { content } of bundle.blobs) {
        const key = `${content.digest}/${content.byteLength}`;
        expect(levelEvidenceOwners.has(key)).toBe(false);
        levelEvidenceOwners.add(key);
      }
    }
    expect(composed.portableProfilePayload).toBeNull();
    expect(composed.proof.externalInputs.map(({ kind }) => kind)).toEqual([
      "corpus-manifest",
      "corpus-validity",
      "official-map",
      "official-replay-container",
      "official-replay-container",
      "official-series-config",
      "official-series-config",
    ]);
    expect(composition.proofSources.externalFiles.map(({ path }) => path)).toEqual(
      composed.proof.externalInputs.map(({ path }) => path),
    );
    expect(composed.proof.derivedSources.filter(({ kind }) => (
      kind === "official-level-source"
    ))).toHaveLength(149);
    const replaySources = composed.proof.derivedSources.filter(({ kind }) => (
      kind === "donor-replay-entry"
    ));
    expect(replaySources).toHaveLength(298);
    expect(replaySources.map(({ retainedPath }) => retainedPath).sort()).toEqual(
      expect.arrayContaining([
      "ccsolver/fixtures/golden/p7b/training-packs/cclp1/levels/001/raw/00-ms.tws-entry.bin",
      "ccsolver/fixtures/golden/p7b/training-packs/cclp1/levels/001/raw/01-lynx.tws-entry.bin",
      ]),
    );
    const built = await buildP7bTrainingPackOutputs(composed);
    const attested = await attestP7bTrainingPackOutputs(
      repositoryRoot,
      "cclp1",
      built.outputs,
      composition.proofSources,
    );
    expect(attested.proofIndex.externalInputs).toHaveLength(7);
    expect(attested.proofIndex.derivedSources).toHaveLength(447);
    expect(attested.manifest.levels).toHaveLength(149);
    const graphFreeExecution = await buildP7TrainingReducedPackExecutionIndex({
      repositoryRoot,
      packId: "cclp1",
      inventory,
      plan,
      reducedPack,
      evidence: reducedPack.levels.map(({ occurrenceId, levelNumber }) => ({
        occurrenceId,
        levelNumber,
      })),
      loadEvidence: async ({ occurrenceId }) => {
        const sidecar = persisted.get(occurrenceId)!;
        return { indexCanonicalJson: sidecar.indexCanonicalJson, payload: sidecar.payload };
      },
      sha256,
    });
    expect(graphFreeExecution.canonicalJson).toBe(new TextDecoder().decode(
      built.outputs.find(({ path }) => path.endsWith("/execution-index.json"))!.content,
    ));

    const reordered = structuredClone(reducedPack) as unknown as {
      levels: Array<{
        processing: { trainingReplayLevel: { rawDonors: unknown[] } };
      }>;
    } & P7TrainingReducedPack;
    reordered.levels[0]!.processing.trainingReplayLevel.rawDonors.reverse();
    await expect(composeP7TrainingReducedPackBuildInput({
      repositoryRoot,
      reducedPack: reordered,
      sharedPlayer,
      sha256,
      loadInventory: async () => inventory,
      loadEvidence: async ({ occurrenceId }) => {
        const sidecar = persisted.get(occurrenceId)!;
        return { indexCanonicalJson: sidecar.indexCanonicalJson, payload: sidecar.payload };
      },
    })).rejects.toThrow("raw donor order drifted");

    const reorderedVariants = structuredClone(reducedPack);
    const mutableVariants = reorderedVariants.levels[0]!.processing
      .trainingReplayLevel as unknown as { variants: unknown[] };
    mutableVariants.variants = [
      { variantId: "portable", kind: "portable" },
      { variantId: "raw-ms", kind: "raw" },
    ];
    await expect(composeP7TrainingReducedPackBuildInput({
      repositoryRoot,
      reducedPack: reorderedVariants,
      sharedPlayer,
      sha256,
      loadInventory: async () => inventory,
      loadEvidence: async () => {
        throw new Error("variant order must fail before evidence loading");
      },
    })).rejects.toThrow("variant order is not canonical");

    await expect(composeP7TrainingReducedPackBuildInput({
      repositoryRoot,
      reducedPack: {
        ...reducedPack,
        packContent: { ...reducedPack.packContent, byteLength: reducedPack.packContent.byteLength + 1 },
      },
      sharedPlayer,
      sha256,
      loadInventory: async () => inventory,
      loadEvidence: async () => {
        throw new Error("pack drift must fail before evidence loading");
      },
    })).rejects.toThrow("pack content drifted");
  }, 30_000);

  it("closes the full CCLP5 official-plus-voting source graph without unused packs", async () => {
    const sha256 = new WebCryptoSha256();
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot, sha256);
    const { persisted, reducedPack } = await structuralReducedPack(inventory, "cclp5", sha256);
    const composition = await composeP7TrainingReducedPack({
      repositoryRoot,
      reducedPack,
      sharedPlayer: await sharedPlayerFixture(sha256),
      sha256,
      loadInventory: async () => inventory,
      loadEvidence: async ({ occurrenceId }) => {
        const sidecar = persisted.get(occurrenceId)!;
        return { indexCanonicalJson: sidecar.indexCanonicalJson, payload: sidecar.payload };
      },
    });

    const external = composition.buildInput.proof.externalInputs;
    const derived = composition.buildInput.proof.derivedSources;
    expect(external).toHaveLength(115);
    expect(external.filter(({ kind }) => kind === "voting-map")).toHaveLength(22);
    expect(external.filter(({ kind }) => kind === "voting-series-config")).toHaveLength(43);
    expect(external.filter(({ kind }) => kind === "voting-replay-container")).toHaveLength(43);
    expect(derived).toHaveLength(478);
    expect(derived.filter(({ kind }) => kind === "official-level-source")).toHaveLength(149);
    expect(derived.filter(({ kind }) => kind === "voting-candidate-level-source")).toHaveLength(33);
    expect(derived.filter(({ kind }) => kind === "donor-replay-entry")).toHaveLength(296);
    expect(composition.buildInput.processedLevels[138]!.rawDonorBytes).toHaveLength(0);

    const built = await buildP7bTrainingPackOutputs(composition.buildInput);
    const attested = await attestP7bTrainingPackOutputs(
      repositoryRoot,
      "cclp5",
      built.outputs,
      composition.proofSources,
    );
    expect(attested.proofIndex.externalInputs).toHaveLength(115);
    expect(attested.proofIndex.derivedSources).toHaveLength(478);
  }, 30_000);

  it("pins the full CCLP4 engine-free source closure", async () => {
    const sha256 = new WebCryptoSha256();
    const inventory = await loadCheckedTrainingCorpusInventory(repositoryRoot, sha256);
    const { persisted, reducedPack } = await structuralReducedPack(inventory, "cclp4", sha256);
    const composition = await composeP7TrainingReducedPack({
      repositoryRoot,
      reducedPack,
      sharedPlayer: await sharedPlayerFixture(sha256),
      sha256,
      loadInventory: async () => inventory,
      loadEvidence: async ({ occurrenceId }) => {
        const sidecar = persisted.get(occurrenceId)!;
        return { indexCanonicalJson: sidecar.indexCanonicalJson, payload: sidecar.payload };
      },
    });

    expect(composition.buildInput.proof.externalInputs).toHaveLength(7);
    expect(composition.buildInput.proof.derivedSources).toHaveLength(447);
    expect(composition.buildInput.processedLevels.every(({ rawDonorBytes }) => (
      rawDonorBytes.length === 2
    ))).toBe(true);
    const built = await buildP7bTrainingPackOutputs(composition.buildInput);
    const attested = await attestP7bTrainingPackOutputs(
      repositoryRoot,
      "cclp4",
      built.outputs,
      composition.proofSources,
    );
    expect(attested.proofIndex.externalInputs).toHaveLength(7);
    expect(attested.proofIndex.derivedSources).toHaveLength(447);
  }, 30_000);
});

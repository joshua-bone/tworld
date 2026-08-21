import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import { canonicalizeJson, type BlobReferenceV1 } from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { buildP7bTrainingReplayLevel } from "../p7b-training/trainingReplayContract";
import { buildP7TrainingPackProofLeaf } from "./buildP7TrainingPackProofLeaf";

const encoder = new TextEncoder();
const sha256 = new WebCryptoSha256();

async function ref(bytes: Uint8Array): Promise<BlobReferenceV1> {
  return referenceSourceBytes(bytes, sha256);
}

type MutableEvidenceBundle = {
  artifact: "ccsolver-p7-generated-evidence-bundle";
  version: 1;
  scopeId: string;
  limits: {
    maximumBlobCount: number;
    maximumBlobBytes: number;
    maximumTotalBytes: number;
  };
  totals: { blobCount: number; byteLength: number };
  blobs: Array<{
    content: BlobReferenceV1;
    mediaType: "application/json" | "application/octet-stream";
    bytes: Uint8Array;
  }>;
};

function emptyBundle(scopeId: string): MutableEvidenceBundle {
  return {
    artifact: "ccsolver-p7-generated-evidence-bundle",
    version: 1,
    scopeId,
    limits: {
      maximumBlobCount: 20_000,
      maximumBlobBytes: 16 * 1024 * 1024,
      maximumTotalBytes: 512 * 1024 * 1024,
    },
    totals: { blobCount: 0, byteLength: 0 },
    blobs: [],
  };
}

async function fixture() {
  const root = "ccsolver/fixtures/golden/p7b/training-packs/fixture-pack";
  const containerBytes = Uint8Array.of(10, 11, 12, 20, 21, 22);
  const containerContent = await ref(containerBytes);
  const packEvidence = emptyBundle("fixture-pack/shared");
  const levels = [];
  const baseOutputs = [{
    path: `${root}/browser.json`,
    mediaType: "application/json" as const,
    content: encoder.encode(canonicalizeJson({ artifact: "fixture-pack-browser" })),
  }, {
    path: `${root}/index.html`,
    mediaType: "text/html" as const,
    content: encoder.encode("<!doctype html><title>Fixture</title>"),
  }, {
    path: `${root}/pack-summary.json`,
    mediaType: "application/json" as const,
    content: encoder.encode(canonicalizeJson({ artifact: "fixture-summary" })),
  }];
  const levelSidecars: Array<{
    occurrenceId: string;
    levelNumber: number;
    bundle: MutableEvidenceBundle;
  }> = [];
  const derivedSources = [];
  for (const levelNumber of [1, 2]) {
    const levelBytes = containerBytes.slice((levelNumber - 1) * 3, levelNumber * 3);
    const levelContent = await ref(levelBytes);
    const evidenceBytes = encoder.encode(canonicalizeJson({ eligible: true, levelNumber }));
    const evidenceContent = await ref(evidenceBytes);
    const contract = buildP7bTrainingReplayLevel({
      artifact: "ccsolver-p7b-training-replay-level",
      version: 1,
      source: {
        packId: "fixture-pack",
        levelNumber,
        title: `Fixture ${levelNumber}`,
        normalizedGameplaySha256: String(levelNumber).repeat(64),
        levelContent,
        eligibility: {
          status: "eligible",
          standardOnly: true,
          policyRevision: "fixture-standard-only-v1",
          evidence: evidenceContent,
        },
      },
      donorCoverage: {
        ms: { status: "not-assessed", rawDonorId: null, detail: "not processed" },
        lynx: { status: "not-assessed", rawDonorId: null, detail: "not processed" },
      },
      rawDonors: [],
      variants: [],
      processing: { status: "pending", detail: "not processed" },
      viewableVariantId: null,
    });
    levels.push(contract);
    baseOutputs.push({
      path: `${root}/levels/00${levelNumber}/contract.json`,
      mediaType: "application/json",
      content: encoder.encode(canonicalizeJson(contract)),
    }, {
      path: `${root}/levels/00${levelNumber}/index.html`,
      mediaType: "text/html",
      content: encoder.encode(`<!doctype html><title>Fixture ${levelNumber}</title>`),
    });
    levelSidecars.push({
      occurrenceId: `fixture-${levelNumber}`,
      levelNumber,
      bundle: {
        ...emptyBundle(`fixture-${levelNumber}/evidence`),
        totals: { blobCount: 1, byteLength: evidenceBytes.byteLength },
        blobs: [{
          content: evidenceContent,
          mediaType: "application/json" as const,
          bytes: evidenceBytes,
        }],
      },
    });
    derivedSources.push({
      kind: "official-level-source" as const,
      content: levelContent,
      sourceContent: containerContent,
      sourcePath: "sets/fixture.dat",
      locator: { kind: "byte-range" as const, byteOffset: (levelNumber - 1) * 3, byteLength: 3 },
      extractorRevision: "dat-level-byte-range-v1" as const,
      retainedPath: null,
      levelNumber,
      variantId: null,
      target: null,
    });
  }
  return {
    root,
    pack: {
      packId: "fixture-pack",
      expectedLevelCount: 2,
      corpusRevision: "fixture-corpus-v1",
      producerRevision: "fixture-producer-v1",
    },
    levels,
    baseOutputs,
    externalInputs: [{
      path: "sets/fixture.dat",
      kind: "official-map" as const,
      content: containerContent,
    }],
    derivedSources,
    generatedEvidence: { pack: packEvidence, levels: levelSidecars },
    sha256,
  };
}

describe("the streamed P7 self-auditing leaf composer", () => {
  it("packs logical level evidence into one canonical index and one raw payload per nonempty scope", async () => {
    const input = await fixture();
    const built = await buildP7TrainingPackProofLeaf(input);

    expect(built.evidenceOutputs.map(({ path }) => path)).toEqual([
      `${input.root}/levels/001/evidence/index.json`,
      `${input.root}/levels/001/evidence/payload.bin`,
      `${input.root}/levels/002/evidence/index.json`,
      `${input.root}/levels/002/evidence/payload.bin`,
    ]);
    expect(built.proofIndex.evidenceSidecars).toHaveLength(2);
    expect(built.proofIndex.evidenceSidecars.map(({ owner }) => (
      owner.kind === "level" ? owner.levelNumber : null
    ))).toEqual([1, 2]);
    expect(built.proofIndex.generatedBlobs.filter(({ locator }) => (
      locator.kind === "evidence-sidecar-entry"
    ))).toHaveLength(2);
    expect(built.proofIndex.levels).toHaveLength(2);
    expect(built.proofIndex.totals.generatedBlobCount).toBe(input.baseOutputs.length + 2);
    expect(built.proofIndex.totals.evidenceSidecarCount).toBe(2);
    expect(built.proofIndex.totals.physicalFileCount).toBe(
      input.baseOutputs.length + 4 + input.externalInputs.length,
    );
    expect(built.proofOutput.path).toBe(`${input.root}/proof-index.json`);
    expect(built.proofIndex.levels.every(({ reachableRefs }) => reachableRefs.length === 3))
      .toBe(true);
  });

  it("rejects cross-level sidecar ownership and missing generated evidence", async () => {
    const duplicated = await fixture();
    duplicated.generatedEvidence.levels[1]!.bundle = duplicated.generatedEvidence.levels[0]!.bundle;
    await expect(buildP7TrainingPackProofLeaf(duplicated)).rejects.toThrow(
      "cross-level generated evidence ownership",
    );

    const missing = await fixture();
    missing.generatedEvidence.levels[0]!.bundle = emptyBundle("fixture-1/missing");
    await expect(buildP7TrainingPackProofLeaf(missing)).rejects.toThrow(
      "reachable reference is unresolved",
    );
  });

  it("rejects dishonest sidecar totals and non-canonical JSON before retaining bytes", async () => {
    const totals = await fixture();
    totals.generatedEvidence.levels[0]!.bundle.totals.byteLength += 1;
    await expect(buildP7TrainingPackProofLeaf(totals)).rejects.toThrow("sidecar totals drifted");

    const noncanonical = await fixture();
    const sidecar = noncanonical.generatedEvidence.levels[0]!.bundle;
    const bytes = encoder.encode(JSON.stringify({ eligible: true, levelNumber: 1 }, null, 2));
    sidecar.blobs[0]!.bytes = bytes;
    sidecar.blobs[0]!.content = await ref(bytes);
    sidecar.totals.byteLength = bytes.byteLength;
    await expect(buildP7TrainingPackProofLeaf(noncanonical)).rejects.toThrow(
      "sidecar JSON is not canonical",
    );

    const unsafe = await fixture();
    unsafe.pack.packId = "../fixture-pack";
    unsafe.root = "ccsolver/fixtures/golden/p7b/training-packs/../fixture-pack";
    await expect(buildP7TrainingPackProofLeaf(unsafe)).rejects.toThrow("unsafe");
  });
});

import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import { buildP7bTrainingReplayLevel } from "../p7b-training/trainingReplayContract";
import { P7_TRAINING_PROCESSOR_REVISION } from "../p7-training-execution/p7TrainingShardProtocol";
import {
  buildP7TrainingPackProofIndex,
  type P7TrainingPackProofIndexInput,
} from "./p7TrainingPackProofIndex";
import {
  assertP7TrainingExecutionBrowserTargets,
  assertP7TrainingExecutionIndexIsStrictSubsetOfPackProof,
  assertP7TrainingExecutionPackContent,
  buildP7TrainingExecutionIndex,
  buildP7TrainingExecutionIndexFromReducedSemanticInput,
  canonicalizeP7TrainingExecutionIndex,
  parseP7TrainingExecutionIndex,
  type P7TrainingExecutionIndexInput,
  type P7TrainingReducedSemanticInput,
} from "./p7TrainingExecutionIndex";

const encoder = new TextEncoder();
const sha256 = new WebCryptoSha256();

async function ref(value: unknown): Promise<BlobReferenceV1> {
  return referenceSourceBytes(
    encoder.encode(canonicalizeJson(value as CanonicalJsonValue)),
    sha256,
  );
}

function targets(levelNumber: number, randomSeed?: number) {
  const request = (ruleset: "MS" | "Lynx") => ({
    seriesFile: `fixture-${ruleset.toLowerCase()}.dac`,
    levelNumber,
    ruleset,
    ...(randomSeed === undefined ? {} : { randomSeed }),
  });
  const display = (ruleset: "MS" | "Lynx") => ({
    seriesName: `Fixture ${ruleset}`,
    mapFilename: "fixture.dat",
    level: {
      index: levelNumber - 1,
      number: levelNumber,
      name: `Level ${levelNumber}`,
      author: "Fixture",
      password: "QWER",
      timeLimitSeconds: 100,
      chipsRequired: 0,
      bestTimeTicks: 0,
      levelSize: 1,
      solutionSize: 0,
      levelHash: `level-${levelNumber}`,
      gameplayHash: `gameplay-${levelNumber}`,
      hasSolution: false,
      sgflags: 0,
      unsolvable: null,
    },
  });
  return {
    ms: { request: request("MS"), display: display("MS") },
    lynx: { request: request("Lynx"), display: display("Lynx") },
  };
}

async function fixture(randomSeed?: number): Promise<{
  readonly input: P7TrainingExecutionIndexInput;
  readonly fullProof: ReturnType<typeof buildP7TrainingPackProofIndex>;
}> {
  const mapContent = await ref({ map: "fixture" });
  const levelContent = await ref({ level: 1 });
  const contractContent = await ref({
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: { levelContent },
  });
  const presentationContent = await ref({ presentation: "graph-dependent" });
  const proofInput: P7TrainingPackProofIndexInput = {
    pack: {
      packId: "fixture-pack",
      expectedLevelCount: 1,
      corpusRevision: "fixture-corpus-v1",
      producerRevision: P7_TRAINING_PROCESSOR_REVISION,
    },
    externalInputs: [{ path: "sets/fixture.dat", kind: "official-map", content: mapContent }],
    derivedSources: [{
      kind: "official-level-source",
      content: levelContent,
      sourceContent: mapContent,
      sourcePath: "sets/fixture.dat",
      locator: { kind: "byte-range", byteOffset: 0, byteLength: levelContent.byteLength },
      extractorRevision: "dat-level-byte-range-v1",
      retainedPath: null,
      levelNumber: 1,
      variantId: null,
      target: null,
    }],
    generatedBlobs: [{
      locator: { kind: "file", path: "packs/fixture/levels/001/contract.json" },
      mediaType: "application/json",
      content: contractContent,
      kind: "level-contract",
      levelNumber: 1,
      variantId: null,
      target: null,
    }],
    evidenceSidecars: [],
    levels: [{
      levelNumber: 1,
      contract: { path: "packs/fixture/levels/001/contract.json", content: contractContent },
      reachableRefs: [levelContent, mapContent],
    }],
    packReachableRefs: [],
  };
  const semanticProof = buildP7TrainingPackProofIndex(proofInput);
  const fullProof = buildP7TrainingPackProofIndex({
    ...proofInput,
    pack: { ...proofInput.pack, producerRevision: "fixture-full-presentation-v1" },
    generatedBlobs: [...proofInput.generatedBlobs, {
      locator: { kind: "file", path: "packs/fixture/index.html" },
      mediaType: "text/html",
      content: presentationContent,
      kind: "pack-index-page",
      levelNumber: null,
      variantId: null,
      target: null,
    }],
    packReachableRefs: [presentationContent],
  });
  return {
    input: {
      processorRevision: P7_TRAINING_PROCESSOR_REVISION,
      pack: { packId: "fixture-pack", packContent: mapContent },
      semanticProof,
      browserTargets: [{ levelNumber: 1, targets: targets(1, randomSeed) }],
    },
    fullProof,
  };
}

async function failedBrowserCellFixture(): Promise<P7TrainingReducedSemanticInput> {
  const rawReplayBytes = encoder.encode(canonicalizeJson({ replay: "failed-native" }));
  const [rawReplayContent, levelContent, eligibilityEvidence, certificationEvidence, packContent]
    = await Promise.all([
      referenceSourceBytes(rawReplayBytes, sha256),
      ref({ level: "failed-native" }),
      ref({ evidence: "eligibility" }),
      ref({ evidence: "failed-certification" }),
      ref({ pack: "failed-native" }),
    ]);
  const transcript = {
    algorithm: "sha256" as const,
    canonicalization: "tworld-canonical-json-v1" as const,
    digest: rawReplayContent.digest,
    byteLength: rawReplayContent.byteLength,
  };
  const level = buildP7bTrainingReplayLevel({
    artifact: "ccsolver-p7b-training-replay-level",
    version: 1,
    source: {
      packId: "fixture-pack",
      levelNumber: 1,
      title: "Failed native replay",
      normalizedGameplaySha256: "a".repeat(64),
      levelContent,
      eligibility: {
        status: "eligible",
        standardOnly: true,
        policyRevision: "fixture-standard-only-v1",
        evidence: eligibilityEvidence,
      },
    },
    donorCoverage: {
      ms: { status: "bound", rawDonorId: "official-ms", detail: "official donor" },
      lynx: { status: "missing", rawDonorId: null, detail: "no donor" },
    },
    rawDonors: [{
      donorId: "official-ms",
      target: "ms",
      origin: "official-pack",
      sourcePackId: "fixture-pack",
      sourceLevelNumber: 1,
      sourceNormalizedGameplaySha256: "a".repeat(64),
      sourceLevelContent: levelContent,
      replayContent: rawReplayContent,
      mapRelationship: "official-map",
      mapComparisonEvidence: null,
    }],
    variants: [{
      variantId: "raw-ms",
      kind: "raw",
      replayContent: rawReplayContent,
      decisionCount: 1,
      portableProfile: null,
      lineage: {
        kind: "raw-donor",
        rawDonorId: "official-ms",
        sourceVariantId: null,
        evidence: null,
      },
      portability: "not-portable",
      transforms: [],
      segments: [],
      certifications: {
        ms: {
          status: "failed",
          outcome: "diverged",
          evidence: certificationEvidence,
          terminalNativeTick: 1,
          detail: "native replay diverged",
          segmentSelection: {
            policyRevision: "semantic-route-chapters-max-24-v1",
            selectionMode: "unviewable",
            candidateCount: 0,
            selectedCandidateOrdinals: [],
            omittedCandidateCount: 0,
            targetTranscript: transcript,
            semanticTranscript: transcript,
          },
          execution: {
            status: "native",
            decisionProfile: {
              profileId: "native-ms-tws-v1",
              profileRevision: "fixture-native-ms-v1",
              clockBasis: "native-tick",
              cadenceHz: 20,
              profileContent: null,
            },
            executedDecisionCount: 1,
            nativeBoundaryClock: "exclusive-advance-count-v1",
            nativeTickRateHz: 20,
            replayContent: rawReplayContent,
            browserReplayContent: null,
            browserReplayParityReceipt: null,
            browserReplayTransport: null,
            compilerRevision: null,
            compilationReceipt: null,
            detail: "retained failed native execution",
          },
          segmentSpans: [],
        },
        lynx: {
          status: "unavailable",
          outcome: "unsupported",
          evidence: null,
          terminalNativeTick: null,
          detail: "no Lynx donor",
          segmentSelection: null,
          execution: {
            status: "unavailable",
            decisionProfile: null,
            executedDecisionCount: null,
            nativeBoundaryClock: null,
            nativeTickRateHz: null,
            replayContent: null,
            browserReplayContent: null,
            browserReplayParityReceipt: null,
            browserReplayTransport: null,
            compilerRevision: null,
            compilationReceipt: null,
            detail: "no Lynx execution",
          },
          segmentSpans: [],
        },
      },
    }],
    processing: { status: "blocked", detail: "native replay did not certify" },
    viewableVariantId: null,
  });
  const emptyEvidenceBundle = (scopeId: string) => ({
    artifact: "ccsolver-p7-generated-evidence-bundle" as const,
    version: 1 as const,
    scopeId,
    limits: {
      maximumBlobCount: 20_000,
      maximumBlobBytes: 16 * 1024 * 1024,
      maximumTotalBytes: 512 * 1024 * 1024,
    },
    totals: { blobCount: 0, byteLength: 0 },
    blobs: [],
  });
  return {
    pack: { packId: "fixture-pack", title: "Fixture", expectedLevelCount: 1 },
    inventory: [level],
    processedLevels: [{
      levelNumber: 1,
      browserTargets: targets(1),
      rawDonorBytes: [{ donorId: "official-ms", bytes: rawReplayBytes }],
      browserReplays: [{
        variantId: "raw-ms",
        target: "ms",
        replay: {
          artifact: "ccsolver-p7b-browser-replay",
          version: 1,
          transport: "native-replay-pulses",
          variantId: "raw-ms",
          target: "ms",
          sourceReplayContent: rawReplayContent,
          nativeTickRateHz: 20,
          terminalNativeTick: 1,
          initialization: {
            flags: 0,
            randomSeed: 0,
            randomSlideDirection: 1,
            stepping: 0,
            bestTimeTicks: 1,
          },
          decisions: [{
            ordinal: 0,
            nativeTick: 0,
            encodedWhen: 0,
            inputCode: 1,
            modifierMask: 0,
          }],
        },
      }],
      variantPayloads: [],
    }],
    portableProfilePayload: null,
    proof: {
      packContent,
      corpusRevision: "fixture-corpus-v1",
      externalInputs: [],
      derivedSources: [],
      generatedEvidence: {
        pack: emptyEvidenceBundle("fixture-pack/shared"),
        levels: [{
          occurrenceId: "fixture-001",
          levelNumber: 1,
          bundle: emptyEvidenceBundle("fixture-pack/001"),
        }],
      },
    },
    sha256,
  };
}

describe("the graph-independent P7 training execution index", () => {
  it("canonicalizes one closed semantic authority and requires a strict full-proof superset", async () => {
    const value = await fixture();
    const index = buildP7TrainingExecutionIndex(value.input);
    const canonical = canonicalizeP7TrainingExecutionIndex(index);

    expect(parseP7TrainingExecutionIndex(canonical)).toEqual(index);
    expect(index.processorRevision).toBe(P7_TRAINING_PROCESSOR_REVISION);
    expect(() => assertP7TrainingExecutionIndexIsStrictSubsetOfPackProof({
      executionIndex: index,
      fullProof: value.fullProof,
    })).not.toThrow();
    expect(() => assertP7TrainingExecutionIndexIsStrictSubsetOfPackProof({
      executionIndex: index,
      fullProof: index.semanticProof,
    })).toThrow("strict superset");
  });

  it("changes authority when a browser target random seed changes", async () => {
    const first = buildP7TrainingExecutionIndex((await fixture()).input);
    const second = buildP7TrainingExecutionIndex((await fixture(42)).input);

    expect(canonicalizeP7TrainingExecutionIndex(second))
      .not.toBe(canonicalizeP7TrainingExecutionIndex(first));
  });

  it("binds the exact freshly reduced pack content", async () => {
    const index = buildP7TrainingExecutionIndex((await fixture()).input);
    expect(() => assertP7TrainingExecutionPackContent({
      executionIndex: index,
      packId: "fixture-pack",
      packContent: { ...index.pack.packContent, byteLength: index.pack.packContent.byteLength + 1 },
    })).toThrow("reduced pack content drifted");
  });

  it("rejects a transplanted target set that does not equal the indexed level", async () => {
    const index = buildP7TrainingExecutionIndex((await fixture()).input);
    expect(() => assertP7TrainingExecutionBrowserTargets({
      executionIndex: index,
      levelNumber: 1,
      browserTargets: targets(1, 42),
    })).toThrow("browser targets drifted");
  });

  it("rejects a browser replay asset for a failed execution cell", async () => {
    await expect(buildP7TrainingExecutionIndexFromReducedSemanticInput(
      await failedBrowserCellFixture(),
    )).rejects.toThrow(
      "browser replay set does not match the exact certified execution matrix",
    );
  });
});

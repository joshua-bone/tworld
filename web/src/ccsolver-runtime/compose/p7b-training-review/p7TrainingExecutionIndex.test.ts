import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
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
  canonicalizeP7TrainingExecutionIndex,
  parseP7TrainingExecutionIndex,
  type P7TrainingExecutionIndexInput,
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
});

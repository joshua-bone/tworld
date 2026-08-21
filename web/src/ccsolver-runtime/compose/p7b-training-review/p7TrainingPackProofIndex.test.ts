import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import { describe, expect, it } from "vitest";
import {
  buildP7GeneratedEvidenceSidecar,
  canonicalizeP7GeneratedEvidenceSidecarIndex,
  parseP7GeneratedEvidenceSidecarIndex,
} from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import {
  attestP7TrainingPackProofIndex,
  buildP7TrainingPackProofIndex,
  canonicalizeP7TrainingPackProofIndex,
  parseP7TrainingPackProofIndex,
  type P7TrainingPackProofIndexInput,
} from "./p7TrainingPackProofIndex";

const encoder = new TextEncoder();
const sha256 = new WebCryptoSha256();

type Mutable<T> = T extends readonly (infer Entry)[]
  ? Mutable<Entry>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

async function ref(bytes: Uint8Array): Promise<BlobReferenceV1> {
  return referenceSourceBytes(bytes, sha256);
}

async function fixture(options: {
  readonly noncanonicalEvidence?: boolean;
  readonly evidenceValue?: CanonicalJsonValue;
} = {}) {
  const corpusBytes = encoder.encode(canonicalizeJson({ corpus: "fixture-v1" }));
  const mapContainerBytes = Uint8Array.of(7, 8, 10, 11, 12, 13);
  const levelBytes = mapContainerBytes.slice(2, 5);
  const evidenceBytes = encoder.encode(options.noncanonicalEvidence === true
    ? JSON.stringify(options.evidenceValue ?? { observed: "won" }, null, 2)
    : canonicalizeJson(options.evidenceValue ?? { observed: "won" }));
  const [corpusContent, mapContainerContent, levelContent, evidenceContent] = await Promise.all([
    ref(corpusBytes),
    ref(mapContainerBytes),
    ref(levelBytes),
    ref(evidenceBytes),
  ]);
  const contractBytes = encoder.encode(canonicalizeJson({
    artifact: "fixture-level-contract",
    version: 1,
    levelContent,
    certificationEvidence: evidenceContent,
  }));
  const contractContent = await ref(contractBytes);
  const builtSidecar = await buildP7GeneratedEvidenceSidecar({
    bundle: {
      artifact: "ccsolver-p7-generated-evidence-bundle",
      version: 1,
      scopeId: "fixture-001/evidence",
      limits: {
        maximumBlobCount: 20_000,
        maximumBlobBytes: 16 * 1024 * 1024,
        maximumTotalBytes: 512 * 1024 * 1024,
      },
      totals: { blobCount: 1, byteLength: evidenceBytes.byteLength },
      blobs: [{
        content: evidenceContent,
        mediaType: options.noncanonicalEvidence === true
          ? "application/octet-stream"
          : "application/json",
        bytes: evidenceBytes,
      }],
    },
    sha256,
  });
  let sidecarIndex = builtSidecar.index;
  let sidecarIndexCanonical = builtSidecar.indexCanonicalJson;
  let sidecarIndexContent = builtSidecar.indexContent;
  if (options.noncanonicalEvidence === true) {
    const rawIndex = structuredClone(builtSidecar.index);
    (rawIndex.entries[0] as { mediaType: string }).mediaType = "application/json";
    sidecarIndex = parseP7GeneratedEvidenceSidecarIndex(rawIndex);
    sidecarIndexCanonical = canonicalizeP7GeneratedEvidenceSidecarIndex(sidecarIndex);
    sidecarIndexContent = await ref(encoder.encode(sidecarIndexCanonical));
  }
  const sidecarIndexPath = "levels/001/evidence/index.json";
  const sidecarPayloadPath = "levels/001/evidence/payload.bin";
  const input: Mutable<P7TrainingPackProofIndexInput> = {
    pack: {
      packId: "fixture-pack",
      expectedLevelCount: 1,
      corpusRevision: "fixture-corpus-v1",
      producerRevision: "fixture-producer-v1",
    },
    externalInputs: [{
      path: "ccsolver/fixtures/golden/p1a/corpus-manifest.json",
      kind: "corpus-manifest",
      content: corpusContent,
    }, {
      path: "sets/CCLP1.dat",
      kind: "official-map",
      content: mapContainerContent,
    }],
    derivedSources: [{
      kind: "official-level-source",
      content: levelContent,
      sourceContent: mapContainerContent,
      sourcePath: "sets/CCLP1.dat",
      locator: { kind: "byte-range", byteOffset: 2, byteLength: 3 },
      extractorRevision: "dat-level-byte-range-v1",
      retainedPath: null,
      levelNumber: 1,
      variantId: null,
      target: null,
    }],
    generatedBlobs: [{
      locator: { kind: "file", path: "levels/001/contract.json" },
      mediaType: "application/json",
      content: contractContent,
      kind: "level-contract",
      levelNumber: 1,
      variantId: null,
      target: null,
    }, {
      locator: {
        kind: "evidence-sidecar-entry",
        indexPath: sidecarIndexPath,
        payloadPath: sidecarPayloadPath,
        byteOffset: sidecarIndex.entries[0]!.byteOffset,
        byteLength: sidecarIndex.entries[0]!.byteLength,
      },
      mediaType: "application/json",
      content: evidenceContent,
      kind: "certification-build-receipt",
      levelNumber: 1,
      variantId: "raw-ms",
      target: "ms",
    }],
    evidenceSidecars: [{
      owner: { kind: "level", occurrenceId: "fixture-001", levelNumber: 1 },
      scopeId: sidecarIndex.scopeId,
      index: { path: sidecarIndexPath, content: sidecarIndexContent },
      payload: { path: sidecarPayloadPath, content: sidecarIndex.payloadContent },
      logicalBlobCount: sidecarIndex.totals.blobCount,
      logicalByteLength: sidecarIndex.totals.byteLength,
    }],
    levels: [{
      levelNumber: 1,
      contract: { path: "levels/001/contract.json", content: contractContent },
      reachableRefs: [evidenceContent, levelContent, mapContainerContent],
    }],
    packReachableRefs: [corpusContent],
  };
  return {
    input,
    files: [
      { path: "ccsolver/fixtures/golden/p1a/corpus-manifest.json", bytes: corpusBytes },
      { path: "sets/CCLP1.dat", bytes: mapContainerBytes },
      { path: "levels/001/contract.json", bytes: contractBytes },
      { path: sidecarIndexPath, bytes: encoder.encode(sidecarIndexCanonical) },
      { path: sidecarPayloadPath, bytes: builtSidecar.payload },
    ],
  };
}

describe("the P7 training pack proof index", () => {
  it("canonicalizes a bounded recursively closed pack proof and rehashes every leaf", async () => {
    const value = await fixture();
    const index = buildP7TrainingPackProofIndex(value.input);
    const canonical = canonicalizeP7TrainingPackProofIndex(index);

    expect(parseP7TrainingPackProofIndex(canonical)).toEqual(index);
    await expect(attestP7TrainingPackProofIndex({
      index,
      files: value.files,
      sha256,
    })).resolves.toMatchObject({
      reachableReferenceCount: 5,
      observedGeneratedBlobCount: 2,
      observedExternalInputCount: 2,
    });
    expect(index.totals).toEqual({
      externalInputCount: 2,
      derivedSourceCount: 1,
      generatedBlobCount: 2,
      evidenceSidecarCount: 1,
      levelCount: 1,
      physicalFileCount: 5,
      declaredPhysicalByteLength: expect.any(Number),
      logicalGeneratedByteLength: expect.any(Number),
    });
  });

  it("rejects missing, orphaned, conflicting, and tampered proof material", async () => {
    const missing = await fixture();
    const unknown = { digest: `sha256:${"f".repeat(64)}`, byteLength: 1 } as const;
    missing.input.levels[0]!.reachableRefs.push(unknown);
    expect(() => buildP7TrainingPackProofIndex(missing.input)).toThrow(
      "reachable reference is unresolved",
    );

    const orphaned = await fixture();
    const orphanBytes = encoder.encode(canonicalizeJson({ orphan: true }));
    const orphanContent = await ref(orphanBytes);
    orphaned.input.generatedBlobs.push({
      locator: { kind: "file", path: "levels/001/orphan-evidence.json" },
      mediaType: "application/json",
      content: orphanContent,
      kind: "transform-evidence",
      levelNumber: 1,
      variantId: "raw-ms",
      target: null,
    });
    expect(() => buildP7TrainingPackProofIndex(orphaned.input)).toThrow(
      "generated blob is orphaned",
    );

    const conflicting = await fixture();
    conflicting.input.externalInputs.push({
      path: "sets/conflicting.dat",
      kind: "official-map",
      content: conflicting.input.generatedBlobs[1]!.content,
    });
    expect(() => buildP7TrainingPackProofIndex(conflicting.input)).toThrow(
      "reference resolves more than once",
    );

    const tampered = await fixture();
    const index = buildP7TrainingPackProofIndex(tampered.input);
    const files = tampered.files.map((file) => (
      file.path === "levels/001/contract.json"
        ? { ...file, bytes: encoder.encode(canonicalizeJson({ substituted: true })) }
        : file
    ));
    await expect(attestP7TrainingPackProofIndex({ index, files, sha256 })).rejects.toThrow(
      "content digest or length drifted",
    );
  });

  it("rejects a recursively hidden reference and non-canonical generated JSON", async () => {
    const hidden = { digest: `sha256:${"e".repeat(64)}`, byteLength: 9 } as const;
    const value = await fixture({ evidenceValue: { hidden } });
    const hiddenIndex = buildP7TrainingPackProofIndex(value.input);
    await expect(attestP7TrainingPackProofIndex({
      index: hiddenIndex,
      files: value.files,
      sha256,
    })).rejects.toThrow("recursive reference is unresolved");

    const noncanonical = await fixture({ noncanonicalEvidence: true });
    const noncanonicalIndex = buildP7TrainingPackProofIndex(noncanonical.input);
    await expect(attestP7TrainingPackProofIndex({
      index: noncanonicalIndex,
      files: noncanonical.files,
      sha256,
    })).rejects.toThrow("sidecar slice is not canonical");
  });

  it("binds each logical evidence slice to one canonical physical sidecar", async () => {
    const tampered = await fixture();
    const tamperedIndex = buildP7TrainingPackProofIndex(tampered.input);
    const payloadPath = tampered.input.evidenceSidecars[0]!.payload.path;
    const tamperedFiles = tampered.files.map((file) => file.path === payloadPath
      ? { ...file, bytes: Uint8Array.from(file.bytes, (byte, index) => index === 0 ? byte ^ 1 : byte) }
      : file);
    await expect(attestP7TrainingPackProofIndex({
      index: tamperedIndex,
      files: tamperedFiles,
      sha256,
    })).rejects.toThrow("content digest or length drifted");

    const misplaced = await fixture();
    const locator = misplaced.input.generatedBlobs[1]!.locator;
    if (locator.kind !== "evidence-sidecar-entry") throw new Error("fixture locator drifted");
    locator.byteOffset += 1;
    expect(() => buildP7TrainingPackProofIndex(misplaced.input)).toThrow(
      "sidecar locator is invalid",
    );

    const wrongScope = await fixture();
    wrongScope.input.evidenceSidecars[0]!.scopeId = "another-scope";
    const wrongScopeIndex = buildP7TrainingPackProofIndex(wrongScope.input);
    await expect(attestP7TrainingPackProofIndex({
      index: wrongScopeIndex,
      files: wrongScope.files,
      sha256,
    })).rejects.toThrow("sidecar binding drifted");

    const unsafePath = await fixture();
    unsafePath.input.evidenceSidecars[0]!.payload.path = "levels/001/evidence/other.bin";
    expect(() => buildP7TrainingPackProofIndex(unsafePath.input)).toThrow(
      "owner and physical paths disagree",
    );
  });

  it("binds every derived source to its exact external path and retains derived bytes once", async () => {
    const value = await fixture();
    const derived = value.input.derivedSources[0]!;
    derived.retainedPath = "levels/001/source/official-level.bin";
    value.files.push({ path: derived.retainedPath, bytes: Uint8Array.of(10, 11, 12) });
    const index = buildP7TrainingPackProofIndex(value.input);

    await expect(attestP7TrainingPackProofIndex({
      index,
      files: value.files,
      sha256,
    })).resolves.toMatchObject({ observedRetainedDerivedSourceCount: 1 });

    const wrongPath = await fixture();
    wrongPath.input.derivedSources[0]!.sourcePath = "sets/not-the-source.dat";
    expect(() => buildP7TrainingPackProofIndex(wrongPath.input)).toThrow(
      "does not match an exact external input",
    );

    const wrongContent = await fixture();
    wrongContent.input.derivedSources[0]!.sourceContent = wrongContent.input.externalInputs[0]!.content;
    expect(() => buildP7TrainingPackProofIndex(wrongContent.input)).toThrow(
      "does not match an exact external input",
    );

    const truncated = await fixture();
    truncated.input.derivedSources[0]!.locator = {
      kind: "byte-range",
      byteOffset: 5,
      byteLength: 2,
    };
    const truncatedIndex = buildP7TrainingPackProofIndex(truncated.input);
    await expect(attestP7TrainingPackProofIndex({
      index: truncatedIndex,
      files: truncated.files,
      sha256,
    })).rejects.toThrow("byte range exceeds its external source");
  });

  it("uses closed source kinds, locators, and extractor revisions", async () => {
    const value = await fixture();
    const sourceKinds = [
      "official-series-config",
      "official-replay-container",
      "voting-map",
      "voting-series-config",
      "voting-replay-container",
    ] as const;
    for (const [index, kind] of sourceKinds.entries()) {
      const content = {
        digest: `sha256:${String(index + 1).repeat(64)}`,
        byteLength: 1,
      } as BlobReferenceV1;
      value.input.externalInputs.push({ path: `sources/input-${index}.bin`, kind, content });
      value.input.packReachableRefs.push(content);
    }
    const votingContent = {
      digest: `sha256:${"9".repeat(64)}`,
      byteLength: 1,
    } as BlobReferenceV1;
    value.input.derivedSources.push({
      kind: "voting-candidate-level-source",
      content: votingContent,
      sourceContent: value.input.externalInputs.at(-3)!.content,
      sourcePath: value.input.externalInputs.at(-3)!.path,
      locator: { kind: "byte-range", byteOffset: 0, byteLength: 1 },
      extractorRevision: "dat-level-byte-range-v1",
      retainedPath: null,
      levelNumber: 1,
      variantId: "voting-candidate",
      target: null,
    });
    value.input.levels[0]!.reachableRefs.push(votingContent);
    expect(() => buildP7TrainingPackProofIndex(value.input)).not.toThrow();

    const invalidRevision = await fixture();
    (invalidRevision.input.derivedSources[0] as { extractorRevision: string }).extractorRevision =
      "unreviewed-extractor";
    expect(() => buildP7TrainingPackProofIndex(invalidRevision.input)).toThrow(
      "extractor revision is invalid",
    );
  });

  it("preflights exact per-file and aggregate resource bounds before retaining bytes", async () => {
    const value = await fixture();
    const index = buildP7TrainingPackProofIndex(value.input);
    const overPerFile = {
      byteLength: 16 * 1024 * 1024 + 1,
    } as Uint8Array;
    await expect(attestP7TrainingPackProofIndex({
      index,
      files: [{ path: "oversized.bin", bytes: overPerFile }],
      sha256,
    })).rejects.toThrow("file exceeds its byte bound");

    const exactPerFile = { byteLength: 16 * 1024 * 1024 } as Uint8Array;
    const overAggregate = Array.from({ length: 33 }, (_, ordinal) => ({
      path: `oversized-${ordinal}.bin`,
      bytes: exactPerFile,
    }));
    await expect(attestP7TrainingPackProofIndex({
      index,
      files: overAggregate,
      sha256,
    })).rejects.toThrow("file byte total exceeds its bound");

    expect(() => buildP7TrainingPackProofIndex(null as never)).toThrow(
      "must be an object",
    );
  });
});

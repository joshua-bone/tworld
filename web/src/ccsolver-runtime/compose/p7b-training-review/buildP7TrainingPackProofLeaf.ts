import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import { parseP7TrainingBrowserReplay } from "@game-core/api/p7TrainingBrowserReplay";
import type { P7GeneratedEvidenceBundleV1 } from "../p7-training-execution/p7GeneratedEvidenceStore";
import { buildP7GeneratedEvidenceSidecar } from "../p7-training-execution/p7GeneratedEvidenceSidecar";
import type { P7bTrainingReplayLevelV1 } from "../p7b-training/trainingReplayContract";
import {
  P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS,
  P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
  P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES,
  buildP7TrainingPackProofIndex,
  canonicalizeP7TrainingPackProofIndex,
  type P7TrainingPackProofIndexV1,
  type P7TrainingProofDerivedSourceV1,
  type P7TrainingProofExternalInputV1,
  type P7TrainingProofEvidenceSidecarV1,
  type P7TrainingProofGeneratedBlobV1,
  type P7TrainingProofGeneratedKindV1,
  type P7TrainingProofMediaTypeV1,
  type P7TrainingProofTargetV1,
} from "./p7TrainingPackProofIndex";

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const PACK_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u;

export interface P7TrainingPackProofPayload {
  readonly path: string;
  readonly mediaType: P7TrainingProofMediaTypeV1;
  readonly content: Uint8Array;
}

export interface P7TrainingPackGeneratedEvidenceSidecarsV1 {
  readonly pack: P7GeneratedEvidenceBundleV1;
  readonly levels: readonly {
    readonly occurrenceId: string;
    readonly levelNumber: number;
    readonly bundle: P7GeneratedEvidenceBundleV1;
  }[];
}

export interface P7TrainingPackProofLeafInput {
  readonly root: string;
  readonly pack: {
    readonly packId: string;
    readonly expectedLevelCount: number;
    readonly corpusRevision: string;
    readonly producerRevision: string;
  };
  readonly levels: readonly P7bTrainingReplayLevelV1[];
  readonly baseOutputs: readonly P7TrainingPackProofPayload[];
  readonly externalInputs: readonly P7TrainingProofExternalInputV1[];
  readonly derivedSources: readonly P7TrainingProofDerivedSourceV1[];
  readonly generatedEvidence: P7TrainingPackGeneratedEvidenceSidecarsV1;
  readonly sha256: Sha256Port;
}

export interface P7TrainingPackProofLeafResult {
  readonly evidenceOutputs: readonly P7TrainingPackProofPayload[];
  readonly proofIndex: P7TrainingPackProofIndexV1;
  readonly proofOutput: P7TrainingPackProofPayload;
}

type EvidenceMetadata = {
  readonly kind: P7TrainingProofGeneratedKindV1;
  readonly levelNumber: number | null;
  readonly variantId: string | null;
  readonly target: P7TrainingProofTargetV1 | null;
};

type Resolver = {
  readonly content: BlobReferenceV1;
  readonly sourceContent: BlobReferenceV1 | null;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function key(reference: BlobReferenceV1): string {
  return `${reference.digest}/${reference.byteLength}`;
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function boundedText(value: unknown, label: string, maximumBytes = 1_024): string {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || value.includes("\0")
    || value.includes("\r")
    || value.includes("\n")
    || encoder.encode(value).byteLength > maximumBytes
  ) throw new Error(`${label} is invalid`);
  return value;
}

function safePath(value: unknown, label: string): string {
  const path = boundedText(value, label);
  if (
    !SAFE_PATH_PATTERN.test(path)
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  ) throw new Error(`${label} is unsafe`);
  return path;
}

function collectReferences(value: unknown, result: BlobReferenceV1[] = []): BlobReferenceV1[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectReferences(entry, result));
    return result;
  }
  if (value === null || typeof value !== "object") return result;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort(compareText);
  if (
    keys.length === 2
    && keys[0] === "byteLength"
    && keys[1] === "digest"
    && typeof record.digest === "string"
    && /^sha256:[0-9a-f]{64}$/u.test(record.digest)
    && Number.isSafeInteger(record.byteLength)
    && (record.byteLength as number) >= 0
  ) {
    result.push({
      digest: record.digest as BlobReferenceV1["digest"],
      byteLength: record.byteLength as number,
    });
    return result;
  }
  Object.values(record).forEach((entry) => collectReferences(entry, result));
  return result;
}

function addMetadata(
  metadata: Map<string, EvidenceMetadata>,
  content: BlobReferenceV1 | null,
  value: EvidenceMetadata,
): void {
  if (content === null) return;
  const contentKey = key(content);
  const existing = metadata.get(contentKey);
  if (existing === undefined) {
    metadata.set(contentKey, value);
    return;
  }
  metadata.set(contentKey, {
    kind: existing.kind === value.kind ? existing.kind : "supporting-build-evidence",
    levelNumber: existing.levelNumber === value.levelNumber ? existing.levelNumber : null,
    variantId: existing.variantId === value.variantId ? existing.variantId : null,
    target: existing.target === value.target ? existing.target : null,
  });
}

function evidenceMetadata(levels: readonly P7bTrainingReplayLevelV1[]): Map<string, EvidenceMetadata> {
  const result = new Map<string, EvidenceMetadata>();
  for (const level of levels) {
    const levelNumber = level.source.levelNumber;
    addMetadata(result, level.source.eligibility.evidence, {
      kind: "eligibility-evidence", levelNumber, variantId: null, target: null,
    });
    for (const donor of level.rawDonors) {
      addMetadata(result, donor.mapComparisonEvidence, {
        kind: "map-comparison-evidence",
        levelNumber,
        variantId: donor.donorId,
        target: donor.target,
      });
    }
    for (const variant of level.variants) {
      addMetadata(result, variant.lineage.evidence, {
        kind: "lineage-evidence", levelNumber, variantId: variant.variantId, target: null,
      });
      for (const transform of variant.transforms) {
        addMetadata(result, transform.evidence, {
          kind: "transform-evidence", levelNumber, variantId: variant.variantId, target: null,
        });
      }
      for (const target of ["ms", "lynx"] as const) {
        const certification = variant.certifications[target];
        addMetadata(result, certification.evidence, {
          kind: "certification-build-receipt", levelNumber, variantId: variant.variantId, target,
        });
        addMetadata(result, certification.execution.compilationReceipt, {
          kind: "compilation-receipt", levelNumber, variantId: variant.variantId, target,
        });
        addMetadata(result, certification.execution.browserReplayParityReceipt, {
          kind: "browser-parity-receipt", levelNumber, variantId: variant.variantId, target,
        });
        for (const span of certification.segmentSpans) {
          addMetadata(result, span.startBoundaryEvidence, {
            kind: "segment-boundary-evidence", levelNumber, variantId: variant.variantId, target,
          });
          addMetadata(result, span.endBoundaryEvidence, {
            kind: "segment-boundary-evidence", levelNumber, variantId: variant.variantId, target,
          });
        }
      }
    }
  }
  return result;
}

function generatedKind(
  root: string,
  path: string,
  bytes: Uint8Array,
): EvidenceMetadata | null {
  const suffix = path.startsWith(`${root}/`) ? path.slice(root.length + 1) : "";
  if (suffix === "browser.json") {
    return { kind: "pack-browser-index", levelNumber: null, variantId: null, target: null };
  }
  if (suffix === "index.html") {
    return { kind: "pack-index-page", levelNumber: null, variantId: null, target: null };
  }
  if (suffix === "pack-summary.json") {
    return { kind: "pack-summary", levelNumber: null, variantId: null, target: null };
  }
  if (suffix === "execution-index.json") {
    return { kind: "execution-index", levelNumber: null, variantId: null, target: null };
  }
  if (suffix.startsWith("profiles/")) {
    return { kind: "portable-profile", levelNumber: null, variantId: null, target: null };
  }
  const match = /^levels\/(\d+)\/(.+)$/u.exec(suffix);
  if (match === null) throw new Error(`proof leaf base output path is unsupported: ${path}`);
  const levelNumber = Number(match[1]);
  const leaf = match[2]!;
  if (leaf === "contract.json") {
    return { kind: "level-contract", levelNumber, variantId: null, target: null };
  }
  if (leaf === "browser.json") {
    return { kind: "level-browser-manifest", levelNumber, variantId: null, target: null };
  }
  if (leaf === "index.html") {
    return { kind: "level-page", levelNumber, variantId: null, target: null };
  }
  if (leaf.startsWith("raw/")) return null;
  if (leaf.startsWith("replays/")) {
    const replay = /^replays\/(\d+)-(ms|lynx)\.json$/u.exec(leaf);
    if (replay === null) throw new Error(`proof leaf browser replay path is invalid: ${path}`);
    const envelope = parseP7TrainingBrowserReplay(decoder.decode(bytes));
    if (envelope.target !== replay[2]) {
      throw new Error(`proof leaf browser replay target path drifted: ${path}`);
    }
    return {
      kind: "browser-replay",
      levelNumber,
      variantId: envelope.variantId,
      target: replay[2] as P7TrainingProofTargetV1,
    };
  }
  if (leaf.startsWith("portable/")) {
    return {
      kind: "portable-decision-trace",
      levelNumber,
      variantId: "portable",
      target: null,
    };
  }
  throw new Error(`proof leaf base output path is unsupported: ${path}`);
}

function parseCanonicalJson(bytes: Uint8Array, label: string): unknown {
  let text: string;
  let value: unknown;
  try {
    text = decoder.decode(bytes);
    value = JSON.parse(text) as unknown;
  } catch (error: unknown) {
    throw new Error(`${label} is not valid UTF-8 JSON`, { cause: error });
  }
  if (canonicalizeJson(value as CanonicalJsonValue) !== text) {
    throw new Error(`${label} is not canonical`);
  }
  return value;
}

async function verifiedSidecarBlobs(input: {
  readonly generatedEvidence: P7TrainingPackGeneratedEvidenceSidecarsV1;
  readonly expectedLevelCount: number;
  readonly sha256: Sha256Port;
}): Promise<readonly {
  readonly owner: "pack" | `level:${number}`;
  readonly occurrenceId: string | null;
  readonly scopeId: string;
  readonly limits: P7GeneratedEvidenceBundleV1["limits"];
  readonly blobs: readonly {
    readonly content: BlobReferenceV1;
    readonly mediaType: "application/json" | "application/octet-stream";
    readonly bytes: Uint8Array;
  }[];
}[]> {
  if (input.generatedEvidence.levels.length !== input.expectedLevelCount) {
    throw new Error("proof leaf generated evidence sidecars drifted from the level denominator");
  }
  const ordered = [...input.generatedEvidence.levels].sort((left, right) => (
    left.levelNumber - right.levelNumber
  ));
  const occurrences = new Set<string>();
  ordered.forEach((entry, index) => {
    if (
      entry.levelNumber !== index + 1
      || occurrences.has(entry.occurrenceId)
      || boundedText(entry.occurrenceId, "proof evidence occurrence id") !== entry.occurrenceId
    ) throw new Error("proof leaf generated evidence sidecar identity drifted");
    occurrences.add(entry.occurrenceId);
  });
  const bundles = [{
    owner: "pack" as const,
    occurrenceId: null,
    bundle: input.generatedEvidence.pack,
  }, ...ordered.map(
    ({ occurrenceId, levelNumber, bundle }) => ({
      owner: `level:${levelNumber}` as const,
      occurrenceId,
      bundle,
    }),
  )];
  const ownership = new Map<string, string>();
  const result = [];
  let totalCount = 0;
  let totalBytes = 0;
  for (const { owner, occurrenceId, bundle } of bundles) {
    if (
      bundle.artifact !== "ccsolver-p7-generated-evidence-bundle"
      || bundle.version !== 1
      || boundedText(bundle.scopeId, "proof evidence scope id") !== bundle.scopeId
      || bundle.blobs.length !== bundle.totals.blobCount
      || bundle.blobs.reduce((sum, blob) => sum + blob.bytes.byteLength, 0)
        !== bundle.totals.byteLength
    ) throw new Error("proof leaf generated evidence sidecar totals drifted");
    if (
      bundle.limits.maximumBlobCount > P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS
      || bundle.limits.maximumBlobBytes > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES
      || bundle.limits.maximumTotalBytes > P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES
    ) throw new Error("proof leaf generated evidence sidecar limits exceed pack bounds");
    const blobs = [];
    for (const blob of bundle.blobs) {
      totalCount += 1;
      totalBytes += blob.bytes.byteLength;
      if (
        totalCount > P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS
        || blob.bytes.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES
        || totalBytes > P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES
      ) throw new Error("proof leaf generated evidence exceeds pack bounds");
      if (blob.mediaType === "application/json") {
        parseCanonicalJson(blob.bytes, "proof sidecar JSON");
      } else if (blob.mediaType !== "application/octet-stream") {
        throw new Error("proof leaf generated evidence media type is unsupported");
      }
      const actual = await referenceSourceBytes(blob.bytes, input.sha256);
      if (!sameReference(actual, blob.content)) {
        throw new Error("proof leaf generated evidence content drifted");
      }
      const contentKey = key(actual);
      const previousOwner = ownership.get(contentKey);
      if (previousOwner !== undefined) {
        throw new Error(
          `proof leaf cross-level generated evidence ownership conflicts: ${previousOwner} and ${owner}`,
        );
      }
      ownership.set(contentKey, owner);
      blobs.push({
        content: actual,
        mediaType: blob.mediaType,
        bytes: new Uint8Array(blob.bytes),
      });
    }
    result.push({
      owner,
      occurrenceId,
      scopeId: bundle.scopeId,
      limits: { ...bundle.limits },
      blobs,
    });
  }
  return result;
}

export async function buildP7TrainingPackProofLeaf(
  input: P7TrainingPackProofLeafInput,
): Promise<P7TrainingPackProofLeafResult> {
  const root = safePath(input.root, "proof leaf root");
  const packId = boundedText(input.pack.packId, "proof leaf pack id", 64);
  if (!PACK_ID_PATTERN.test(packId) || !root.endsWith(`/${packId}`)) {
    throw new Error("proof leaf root and pack id disagree or are unsafe");
  }
  if (
    input.levels.length !== input.pack.expectedLevelCount
    || input.levels.some((level, index) => (
      level.source.packId !== packId || level.source.levelNumber !== index + 1
    ))
  ) throw new Error("proof leaf level denominator or identity drifted");
  const metadata = evidenceMetadata(input.levels);
  const base = await Promise.all(input.baseOutputs.map(async (output) => {
    const path = safePath(output.path, "proof leaf base output path");
    if (!path.startsWith(`${root}/`)) throw new Error("proof leaf base output escapes its root");
    if (!(output.content instanceof Uint8Array)) throw new Error("proof leaf base output is not bytes");
    if (output.content.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES) {
      throw new Error("proof leaf base output exceeds its file bound");
    }
    return {
      path,
      mediaType: output.mediaType,
      bytes: new Uint8Array(output.content),
      content: await referenceSourceBytes(output.content, input.sha256),
      metadata: generatedKind(root, path, output.content),
    };
  }));
  const baseByContent = new Map(base.map((entry) => [key(entry.content), entry]));
  const externalKeys = new Set(input.externalInputs.map(({ content }) => key(content)));
  const derivedKeys = new Set(input.derivedSources.map(({ content }) => key(content)));
  const sidecarScopes = await verifiedSidecarBlobs({
    generatedEvidence: input.generatedEvidence,
    expectedLevelCount: input.pack.expectedLevelCount,
    sha256: input.sha256,
  });
  const evidenceOutputs: P7TrainingPackProofPayload[] = [];
  const evidenceGenerated: P7TrainingProofGeneratedBlobV1[] = [];
  const evidenceSidecars: P7TrainingProofEvidenceSidecarV1[] = [];
  const logicalEvidence: {
    readonly content: BlobReferenceV1;
    readonly mediaType: "application/json" | "application/octet-stream";
    readonly bytes: Uint8Array;
  }[] = [];
  for (const scope of sidecarScopes) {
    const retained = scope.blobs.filter((blob) => {
      const contentKey = key(blob.content);
      return !baseByContent.has(contentKey)
        && !externalKeys.has(contentKey)
        && !derivedKeys.has(contentKey);
    });
    if (retained.length === 0) continue;
    const retainedBytes = retained.reduce((total, blob) => total + blob.bytes.byteLength, 0);
    if (retainedBytes > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES) {
      throw new Error("proof leaf evidence sidecar payload exceeds its physical file bound");
    }
    const ownerLevel = scope.owner === "pack"
      ? null
      : Number(scope.owner.slice("level:".length));
    if (ownerLevel !== null && scope.occurrenceId === null) {
      throw new Error("proof leaf level evidence sidecar lacks its occurrence id");
    }
    const sidecar = await buildP7GeneratedEvidenceSidecar({
      bundle: {
        artifact: "ccsolver-p7-generated-evidence-bundle",
        version: 1,
        scopeId: scope.scopeId,
        limits: { ...scope.limits },
        totals: { blobCount: retained.length, byteLength: retainedBytes },
        blobs: retained,
      },
      sha256: input.sha256,
    });
    const evidenceRoot = ownerLevel === null
      ? `${root}/evidence`
      : `${root}/levels/${String(ownerLevel).padStart(3, "0")}/evidence`;
    const indexPath = `${evidenceRoot}/index.json`;
    const payloadPath = `${evidenceRoot}/payload.bin`;
    const indexBytes = encoder.encode(sidecar.indexCanonicalJson);
    if (
      indexBytes.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES
      || sidecar.payload.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES
    ) throw new Error("proof leaf evidence sidecar physical file exceeds its bound");
    evidenceOutputs.push({
      path: indexPath,
      mediaType: "application/json",
      content: indexBytes,
    }, {
      path: payloadPath,
      mediaType: "application/octet-stream",
      content: new Uint8Array(sidecar.payload),
    });
    evidenceSidecars.push({
      owner: ownerLevel === null
        ? { kind: "pack" }
        : {
            kind: "level",
            occurrenceId: scope.occurrenceId!,
            levelNumber: ownerLevel,
          },
      scopeId: scope.scopeId,
      index: { path: indexPath, content: sidecar.indexContent },
      payload: { path: payloadPath, content: sidecar.index.payloadContent },
      logicalBlobCount: sidecar.index.totals.blobCount,
      logicalByteLength: sidecar.index.totals.byteLength,
    });
    const retainedByContent = new Map(retained.map((blob) => [key(blob.content), blob]));
    for (const entry of sidecar.index.entries) {
      const blob = retainedByContent.get(key(entry.content))!;
      const contentKey = key(entry.content);
      const classified = metadata.get(contentKey) ?? {
        kind: "supporting-build-evidence" as const,
        levelNumber: ownerLevel,
        variantId: null,
        target: null,
      };
      if (
        classified.levelNumber !== null
        && ownerLevel !== null
        && classified.levelNumber !== ownerLevel
      ) throw new Error("proof leaf generated evidence sidecar owns another level's reference");
      evidenceGenerated.push({
        locator: {
          kind: "evidence-sidecar-entry",
          indexPath,
          payloadPath,
          byteOffset: entry.byteOffset,
          byteLength: entry.byteLength,
        },
        mediaType: entry.mediaType,
        content: entry.content,
        kind: classified.kind,
        levelNumber: classified.levelNumber ?? ownerLevel,
        variantId: classified.variantId,
        target: classified.target,
      });
      logicalEvidence.push({
        content: entry.content,
        mediaType: entry.mediaType,
        bytes: new Uint8Array(blob.bytes),
      });
    }
  }
  const baseGenerated: P7TrainingProofGeneratedBlobV1[] = [];
  for (const entry of base) {
    if (entry.metadata === null) {
      const derived = input.derivedSources.find(({ retainedPath, content }) => (
        retainedPath === entry.path && sameReference(content, entry.content)
      ));
      if (derived === undefined) {
        throw new Error(`proof leaf retained derived output lacks provenance: ${entry.path}`);
      }
      continue;
    }
    baseGenerated.push({
      locator: { kind: "file", path: entry.path },
      mediaType: entry.mediaType,
      content: entry.content,
      ...entry.metadata,
    });
  }
  for (const source of input.derivedSources) {
    if (source.retainedPath !== null && !base.some((entry) => (
      entry.path === source.retainedPath && sameReference(entry.content, source.content)
    ))) throw new Error(`proof leaf retained derived source is missing: ${source.retainedPath}`);
  }
  const generatedBlobs = [...baseGenerated, ...evidenceGenerated];
  const resolvers = new Map<string, Resolver>();
  const addResolver = (content: BlobReferenceV1, sourceContent: BlobReferenceV1 | null) => {
    const contentKey = key(content);
    if (resolvers.has(contentKey)) {
      throw new Error(`proof leaf reference resolves more than once: ${contentKey}`);
    }
    resolvers.set(contentKey, { content, sourceContent });
  };
  input.externalInputs.forEach(({ content }) => addResolver(content, null));
  input.derivedSources.forEach(({ content, sourceContent }) => addResolver(content, sourceContent));
  generatedBlobs.forEach(({ content }) => addResolver(content, null));

  const dependencies = new Map<string, readonly BlobReferenceV1[]>();
  for (const entry of [...base, ...logicalEvidence]) {
    if (entry.mediaType !== "application/json") continue;
    const value = parseCanonicalJson(entry.bytes, "proof leaf generated JSON");
    dependencies.set(key(entry.content), collectReferences(value));
  }
  const visit = (content: BlobReferenceV1, closure: Set<string>) => {
    const contentKey = key(content);
    const resolver = resolvers.get(contentKey);
    if (resolver === undefined) {
      throw new Error(`proof leaf reachable reference is unresolved: ${contentKey}`);
    }
    if (closure.has(contentKey)) return;
    closure.add(contentKey);
    if (resolver.sourceContent !== null) visit(resolver.sourceContent, closure);
    dependencies.get(contentKey)?.forEach((dependency) => visit(dependency, closure));
  };
  const proofLevels = input.levels.map((level) => {
    const contractPath = `${root}/levels/${String(level.source.levelNumber).padStart(3, "0")}/contract.json`;
    const contract = base.find(({ path }) => path === contractPath);
    if (contract?.metadata?.kind !== "level-contract") {
      throw new Error(`proof leaf level contract output is missing: ${contractPath}`);
    }
    const closure = new Set<string>();
    visit(contract.content, closure);
    closure.delete(key(contract.content));
    return {
      levelNumber: level.source.levelNumber,
      contract: { path: contractPath, content: contract.content },
      reachableRefs: [...closure].map((contentKey) => resolvers.get(contentKey)!.content),
    };
  });
  const packReachableRefs = [
    ...generatedBlobs.filter(({ kind }) => (
      kind === "pack-browser-index"
      || kind === "execution-index"
      || kind === "pack-index-page"
      || kind === "pack-summary"
      || kind === "level-browser-manifest"
      || kind === "level-page"
    )).map(({ content }) => content),
    ...input.externalInputs.filter(({ kind }) => (
      kind === "corpus-manifest"
      || kind === "corpus-validity"
      || kind === "official-series-config"
      || kind === "voting-series-config"
    )).map(({ content }) => content),
  ];
  const proofIndex = buildP7TrainingPackProofIndex({
    pack: input.pack,
    externalInputs: [...input.externalInputs],
    derivedSources: [...input.derivedSources],
    generatedBlobs,
    evidenceSidecars,
    levels: proofLevels,
    packReachableRefs,
  });
  const proofBytes = encoder.encode(canonicalizeP7TrainingPackProofIndex(proofIndex));
  return {
    evidenceOutputs: evidenceOutputs.sort((left, right) => compareText(left.path, right.path)),
    proofIndex,
    proofOutput: {
      path: `${root}/proof-index.json`,
      mediaType: "application/json",
      content: proofBytes,
    },
  };
}

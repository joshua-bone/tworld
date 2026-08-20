import { referenceSourceBytes } from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  canonicalizeP7GeneratedEvidenceSidecarIndex,
  materializeP7GeneratedEvidenceSidecar,
  parseP7GeneratedEvidenceSidecarIndex,
} from "../p7-training-execution/p7GeneratedEvidenceSidecar";

export const P7_TRAINING_PACK_PROOF_INDEX_ARTIFACT =
  "ccsolver-p7-training-pack-proof-index" as const;
export const P7_TRAINING_PACK_PROOF_INDEX_MAX_BYTES = 16 * 1024 * 1024;
export const P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES = 16 * 1024 * 1024;
export const P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS = 20_000;
export const P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES = 512 * 1024 * 1024;

const SHA256_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const OFFICIAL_PACKS = new Set(["cclp1", "cclp4", "cclp5"]);
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

export type P7TrainingProofTargetV1 = "ms" | "lynx";
export type P7TrainingProofMediaTypeV1 =
  | "application/json"
  | "application/octet-stream"
  | "text/html";
export type P7TrainingProofExternalInputKindV1 =
  | "corpus-manifest"
  | "corpus-validity"
  | "official-map"
  | "official-series-config"
  | "official-replay-container"
  | "voting-map"
  | "voting-series-config"
  | "voting-replay-container";
export type P7TrainingProofDerivedSourceKindV1 =
  | "official-level-source"
  | "voting-candidate-level-source"
  | "donor-replay-entry";
export type P7TrainingProofExtractorRevisionV1 =
  | "dat-level-byte-range-v1"
  | "tws-solution-entry-v1";
export type P7TrainingProofGeneratedKindV1 =
  | "level-contract"
  | "execution-index"
  | "pack-browser-index"
  | "pack-index-page"
  | "pack-summary"
  | "level-browser-manifest"
  | "level-page"
  | "portable-decision-trace"
  | "portable-profile"
  | "browser-replay"
  | "eligibility-evidence"
  | "map-comparison-evidence"
  | "lineage-evidence"
  | "transform-evidence"
  | "compilation-receipt"
  | "certification-build-receipt"
  | "segment-boundary-evidence"
  | "browser-parity-receipt"
  | "supporting-build-evidence";

export interface P7TrainingProofExternalInputV1 {
  readonly path: string;
  readonly kind: P7TrainingProofExternalInputKindV1;
  readonly content: BlobReferenceV1;
}

export interface P7TrainingProofDerivedSourceV1 {
  readonly kind: P7TrainingProofDerivedSourceKindV1;
  readonly content: BlobReferenceV1;
  readonly sourceContent: BlobReferenceV1;
  readonly sourcePath: string;
  readonly locator:
    | { readonly kind: "byte-range"; readonly byteOffset: number; readonly byteLength: number }
    | { readonly kind: "entry-ordinal"; readonly entryOrdinal: number };
  readonly extractorRevision: P7TrainingProofExtractorRevisionV1;
  /** Pack-relative retained copy, owned by this derived declaration rather than duplicated. */
  readonly retainedPath: string | null;
  readonly levelNumber: number;
  readonly variantId: string | null;
  readonly target: P7TrainingProofTargetV1 | null;
}

export interface P7TrainingProofGeneratedBlobV1 {
  readonly locator:
    | { readonly kind: "file"; readonly path: string }
    | {
        readonly kind: "evidence-sidecar-entry";
        readonly indexPath: string;
        readonly payloadPath: string;
        readonly byteOffset: number;
        readonly byteLength: number;
      };
  readonly mediaType: P7TrainingProofMediaTypeV1;
  readonly content: BlobReferenceV1;
  readonly kind: P7TrainingProofGeneratedKindV1;
  readonly levelNumber: number | null;
  readonly variantId: string | null;
  readonly target: P7TrainingProofTargetV1 | null;
}

export interface P7TrainingProofEvidenceSidecarV1 {
  readonly owner:
    | { readonly kind: "pack" }
    | { readonly kind: "level"; readonly occurrenceId: string; readonly levelNumber: number };
  readonly scopeId: string;
  readonly index: { readonly path: string; readonly content: BlobReferenceV1 };
  readonly payload: { readonly path: string; readonly content: BlobReferenceV1 };
  readonly logicalBlobCount: number;
  readonly logicalByteLength: number;
}

export interface P7TrainingPackProofLevelV1 {
  readonly levelNumber: number;
  readonly contract: { readonly path: string; readonly content: BlobReferenceV1 };
  readonly reachableRefs: BlobReferenceV1[];
}

export interface P7TrainingPackProofIndexInput {
  pack: {
    packId: string;
    expectedLevelCount: number;
    corpusRevision: string;
    producerRevision: string;
  };
  externalInputs: P7TrainingProofExternalInputV1[];
  derivedSources: P7TrainingProofDerivedSourceV1[];
  generatedBlobs: P7TrainingProofGeneratedBlobV1[];
  evidenceSidecars: P7TrainingProofEvidenceSidecarV1[];
  levels: P7TrainingPackProofLevelV1[];
  packReachableRefs: BlobReferenceV1[];
}

export interface P7TrainingPackProofIndexV1 {
  readonly artifact: typeof P7_TRAINING_PACK_PROOF_INDEX_ARTIFACT;
  readonly version: 1;
  readonly pack: P7TrainingPackProofIndexInput["pack"];
  readonly externalInputsOrder: "path";
  readonly externalInputs: P7TrainingProofExternalInputV1[];
  readonly derivedSourcesOrder: "content-digest";
  readonly derivedSources: P7TrainingProofDerivedSourceV1[];
  readonly generatedBlobsOrder: "locator";
  readonly generatedBlobs: P7TrainingProofGeneratedBlobV1[];
  readonly evidenceSidecarsOrder: "index-path";
  readonly evidenceSidecars: P7TrainingProofEvidenceSidecarV1[];
  readonly levelsOrder: "level-number";
  readonly levels: P7TrainingPackProofLevelV1[];
  readonly packReachableRefs: BlobReferenceV1[];
  readonly totals: {
    readonly externalInputCount: number;
    readonly derivedSourceCount: number;
    readonly generatedBlobCount: number;
    readonly evidenceSidecarCount: number;
    readonly levelCount: number;
    readonly physicalFileCount: number;
    readonly declaredPhysicalByteLength: number;
    readonly logicalGeneratedByteLength: number;
  };
}

export interface P7TrainingPackProofFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

export interface P7TrainingPackProofAttestation {
  readonly reachableReferenceCount: number;
  readonly observedGeneratedBlobCount: number;
  readonly observedEvidenceSidecarCount: number;
  readonly observedExternalInputCount: number;
  readonly observedRetainedDerivedSourceCount: number;
  readonly observedPhysicalFileCount: number;
  readonly observedLogicalGeneratedByteLength: number;
  readonly observedByteLength: number;
}

type Resolver = {
  readonly category: "external input" | "derived source" | "generated blob";
  readonly path: string;
  readonly content: BlobReferenceV1;
  readonly mediaType: P7TrainingProofMediaTypeV1 | null;
  readonly sourceContent: BlobReferenceV1 | null;
};

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function referenceKey(reference: BlobReferenceV1): string {
  return `${reference.digest}/${reference.byteLength}`;
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return referenceKey(left) === referenceKey(right);
}

function generatedLocatorKey(locator: P7TrainingProofGeneratedBlobV1["locator"]): string {
  return locator.kind === "file"
    ? `file/${locator.path}`
    : `sidecar/${locator.indexPath}/${String(locator.byteOffset).padStart(16, "0")}`;
}

function generatedLabel(blob: P7TrainingProofGeneratedBlobV1): string {
  return blob.locator.kind === "file"
    ? blob.locator.path
    : `${blob.locator.indexPath}#${blob.locator.byteOffset}+${blob.locator.byteLength}`;
}

function exactKeys(value: unknown, expected: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort(compareText);
  const wanted = [...expected].sort(compareText);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has an unsupported shape`);
  }
  return record;
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is out of bounds`);
  }
  return value as number;
}

function text(value: unknown, label: string, maximumBytes = 512): string {
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
  const path = text(value, label, 1_024);
  if (
    !SAFE_PATH_PATTERN.test(path)
    || path.startsWith("/")
    || path.includes("\\")
    || path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) throw new Error(`${label} is unsafe`);
  return path;
}

function reference(value: unknown, label: string): BlobReferenceV1 {
  const record = exactKeys(value, ["byteLength", "digest"], label);
  if (typeof record.digest !== "string" || !SHA256_PATTERN.test(record.digest)) {
    throw new Error(`${label} digest is invalid`);
  }
  return {
    digest: record.digest as BlobReferenceV1["digest"],
    byteLength: integer(
      record.byteLength,
      0,
      P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES,
      `${label} byte length`,
    ),
  };
}

function nullableIdentifier(value: unknown, label: string): string | null {
  return value === null ? null : text(value, label);
}

function nullableTarget(value: unknown, label: string): P7TrainingProofTargetV1 | null {
  if (value === null || value === "ms" || value === "lynx") return value;
  throw new Error(`${label} is invalid`);
}

function enumValue<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
): T[number] {
  if (typeof value !== "string" || !allowed.includes(value)) throw new Error(`${label} is invalid`);
  return value as T[number];
}

function copyExternal(value: unknown): P7TrainingProofExternalInputV1 {
  const record = exactKeys(value, ["content", "kind", "path"], "proof external input");
  return {
    path: safePath(record.path, "proof external input path"),
    kind: enumValue(record.kind, [
      "corpus-manifest",
      "corpus-validity",
      "official-map",
      "official-series-config",
      "official-replay-container",
      "voting-map",
      "voting-series-config",
      "voting-replay-container",
    ] as const, "proof external input kind"),
    content: reference(record.content, "proof external input content"),
  };
}

function copyDerived(value: unknown): P7TrainingProofDerivedSourceV1 {
  const record = exactKeys(value, [
    "content",
    "extractorRevision",
    "kind",
    "levelNumber",
    "locator",
    "retainedPath",
    "sourceContent",
    "sourcePath",
    "target",
    "variantId",
  ], "proof derived source");
  const rawLocator = exactKeys(
    record.locator,
    (record.locator as { kind?: unknown })?.kind === "byte-range"
      ? ["byteLength", "byteOffset", "kind"]
      : ["entryOrdinal", "kind"],
    "proof derived source locator",
  );
  const locator = rawLocator.kind === "byte-range"
    ? {
        kind: "byte-range" as const,
        byteOffset: integer(rawLocator.byteOffset, 0, Number.MAX_SAFE_INTEGER, "byte offset"),
        byteLength: integer(rawLocator.byteLength, 0, Number.MAX_SAFE_INTEGER, "byte length"),
      }
    : rawLocator.kind === "entry-ordinal"
      ? {
          kind: "entry-ordinal" as const,
          entryOrdinal: integer(rawLocator.entryOrdinal, 0, 1_000_000, "entry ordinal"),
        }
      : (() => { throw new Error("proof derived source locator kind is invalid"); })();
  const extractorRevision = enumValue(record.extractorRevision, [
    "dat-level-byte-range-v1",
    "tws-solution-entry-v1",
  ] as const, "derived source extractor revision");
  if (
    (locator.kind === "byte-range" && extractorRevision !== "dat-level-byte-range-v1")
    || (locator.kind === "entry-ordinal" && extractorRevision !== "tws-solution-entry-v1")
  ) {
    throw new Error("proof derived source locator and extractor revision disagree");
  }
  return {
    kind: enumValue(record.kind, [
      "official-level-source",
      "voting-candidate-level-source",
      "donor-replay-entry",
    ] as const, "derived source kind"),
    content: reference(record.content, "derived source content"),
    sourceContent: reference(record.sourceContent, "derived source input content"),
    sourcePath: safePath(record.sourcePath, "derived source input path"),
    locator,
    extractorRevision,
    retainedPath: record.retainedPath === null
      ? null
      : safePath(record.retainedPath, "derived source retained path"),
    levelNumber: integer(record.levelNumber, 1, 4_096, "derived source level"),
    variantId: nullableIdentifier(record.variantId, "derived source variant"),
    target: nullableTarget(record.target, "derived source target"),
  };
}

function copyGenerated(value: unknown): P7TrainingProofGeneratedBlobV1 {
  const record = exactKeys(value, [
    "content",
    "kind",
    "levelNumber",
    "locator",
    "mediaType",
    "target",
    "variantId",
  ], "proof generated blob");
  const rawLocator = exactKeys(
    record.locator,
    (record.locator as { kind?: unknown })?.kind === "file"
      ? ["kind", "path"]
      : ["byteLength", "byteOffset", "indexPath", "kind", "payloadPath"],
    "proof generated blob locator",
  );
  const locator = rawLocator.kind === "file"
    ? {
        kind: "file" as const,
        path: safePath(rawLocator.path, "proof generated blob path"),
      }
    : rawLocator.kind === "evidence-sidecar-entry"
      ? {
          kind: "evidence-sidecar-entry" as const,
          indexPath: safePath(rawLocator.indexPath, "proof generated sidecar index path"),
          payloadPath: safePath(rawLocator.payloadPath, "proof generated sidecar payload path"),
          byteOffset: integer(
            rawLocator.byteOffset,
            0,
            P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
            "proof generated sidecar byte offset",
          ),
          byteLength: integer(
            rawLocator.byteLength,
            0,
            P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
            "proof generated sidecar byte length",
          ),
        }
      : (() => { throw new Error("proof generated blob locator kind is invalid"); })();
  const content = reference(record.content, "proof generated blob content");
  if (content.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES) {
    throw new Error("proof generated blob exceeds its byte bound");
  }
  return {
    locator,
    mediaType: enumValue(
      record.mediaType,
      ["application/json", "application/octet-stream", "text/html"] as const,
      "proof generated blob media type",
    ),
    content,
    kind: enumValue(record.kind, [
      "level-contract",
      "execution-index",
      "pack-browser-index",
      "pack-index-page",
      "pack-summary",
      "level-browser-manifest",
      "level-page",
      "portable-decision-trace",
      "portable-profile",
      "browser-replay",
      "eligibility-evidence",
      "map-comparison-evidence",
      "lineage-evidence",
      "transform-evidence",
      "compilation-receipt",
      "certification-build-receipt",
      "segment-boundary-evidence",
      "browser-parity-receipt",
      "supporting-build-evidence",
    ] as const, "proof generated blob kind"),
    levelNumber: record.levelNumber === null
      ? null
      : integer(record.levelNumber, 1, 4_096, "proof generated blob level"),
    variantId: nullableIdentifier(record.variantId, "proof generated blob variant"),
    target: nullableTarget(record.target, "proof generated blob target"),
  };
}

function copyEvidenceSidecar(value: unknown): P7TrainingProofEvidenceSidecarV1 {
  const record = exactKeys(value, [
    "index", "logicalBlobCount", "logicalByteLength", "owner", "payload", "scopeId",
  ], "proof evidence sidecar");
  const rawOwner = exactKeys(
    record.owner,
    (record.owner as { kind?: unknown })?.kind === "pack"
      ? ["kind"]
      : ["kind", "levelNumber", "occurrenceId"],
    "proof evidence sidecar owner",
  );
  const owner = rawOwner.kind === "pack"
    ? { kind: "pack" as const }
    : rawOwner.kind === "level"
      ? {
          kind: "level" as const,
          occurrenceId: text(rawOwner.occurrenceId, "proof evidence occurrence id"),
          levelNumber: integer(rawOwner.levelNumber, 1, 4_096, "proof evidence owner level"),
        }
      : (() => { throw new Error("proof evidence sidecar owner kind is invalid"); })();
  const rawIndex = exactKeys(record.index, ["content", "path"], "proof evidence sidecar index");
  const rawPayload = exactKeys(
    record.payload,
    ["content", "path"],
    "proof evidence sidecar payload",
  );
  const logicalBlobCount = integer(
    record.logicalBlobCount,
    1,
    P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS,
    "proof evidence sidecar logical blob count",
  );
  const logicalByteLength = integer(
    record.logicalByteLength,
    0,
    P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
    "proof evidence sidecar logical byte length",
  );
  const indexPath = safePath(rawIndex.path, "proof evidence sidecar index path");
  const payloadPath = safePath(rawPayload.path, "proof evidence sidecar payload path");
  const expectedSuffix = owner.kind === "pack"
    ? "evidence/index.json"
    : `levels/${String(owner.levelNumber).padStart(3, "0")}/evidence/index.json`;
  if (
    !indexPath.endsWith(expectedSuffix)
    || payloadPath !== `${indexPath.slice(0, -"index.json".length)}payload.bin`
    || (owner.kind === "pack" && /(?:^|\/)levels\/\d+\/evidence\/index\.json$/u.test(indexPath))
  ) throw new Error("proof evidence sidecar owner and physical paths disagree");
  const indexContent = reference(rawIndex.content, "proof evidence sidecar index content");
  const payloadContent = reference(rawPayload.content, "proof evidence sidecar payload content");
  if (
    indexContent.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES
    || payloadContent.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES
  ) throw new Error("proof evidence sidecar physical file exceeds its byte bound");
  if (payloadContent.byteLength !== logicalByteLength) {
    throw new Error("proof evidence sidecar payload and logical byte totals disagree");
  }
  return {
    owner,
    scopeId: text(record.scopeId, "proof evidence sidecar scope"),
    index: {
      path: indexPath,
      content: indexContent,
    },
    payload: {
      path: payloadPath,
      content: payloadContent,
    },
    logicalBlobCount,
    logicalByteLength,
  };
}

function sortedReferences(values: unknown, label: string): BlobReferenceV1[] {
  if (!Array.isArray(values) || values.length > P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS) {
    throw new Error(`${label} count is out of bounds`);
  }
  const copied = values.map((value) => reference(value, label))
    .sort((left, right) => compareText(referenceKey(left), referenceKey(right)));
  if (copied.some((value, index) => index > 0 && referenceKey(value) === referenceKey(copied[index - 1]!))) {
    throw new Error(`${label} contains a duplicate reference`);
  }
  return copied;
}

function copyLevel(value: unknown): P7TrainingPackProofLevelV1 {
  const record = exactKeys(value, ["contract", "levelNumber", "reachableRefs"], "proof level");
  const contract = exactKeys(record.contract, ["content", "path"], "proof level contract");
  return {
    levelNumber: integer(record.levelNumber, 1, 4_096, "proof level number"),
    contract: {
      path: safePath(contract.path, "proof level contract path"),
      content: reference(contract.content, "proof level contract content"),
    },
    reachableRefs: sortedReferences(record.reachableRefs, "proof level reachable refs"),
  };
}

function resolverMap(index: Pick<
  P7TrainingPackProofIndexV1,
  "externalInputs" | "derivedSources" | "generatedBlobs"
>): Map<string, Resolver> {
  const resolvers = new Map<string, Resolver>();
  const add = (resolver: Resolver) => {
    const key = referenceKey(resolver.content);
    if (resolvers.has(key)) throw new Error(`proof reference resolves more than once: ${key}`);
    resolvers.set(key, resolver);
  };
  index.externalInputs.forEach((input) => add({
    category: "external input",
    path: input.path,
    content: input.content,
    mediaType: null,
    sourceContent: null,
  }));
  index.derivedSources.forEach((source) => add({
    category: "derived source",
    path: source.sourcePath,
    content: source.content,
    mediaType: null,
    sourceContent: source.sourceContent,
  }));
  index.generatedBlobs.forEach((blob) => add({
    category: "generated blob",
    path: generatedLabel(blob),
    content: blob.content,
    mediaType: blob.mediaType,
    sourceContent: null,
  }));
  return resolvers;
}

function validateStaticReachability(index: P7TrainingPackProofIndexV1): void {
  const resolvers = resolverMap(index);
  const used = new Set<string>();
  const visit = (ref: BlobReferenceV1) => {
    const key = referenceKey(ref);
    const resolver = resolvers.get(key);
    if (resolver === undefined) throw new Error(`proof reachable reference is unresolved: ${key}`);
    if (used.has(key)) return;
    used.add(key);
    if (resolver.sourceContent !== null) visit(resolver.sourceContent);
  };
  index.packReachableRefs.forEach(visit);
  for (const level of index.levels) {
    visit(level.contract.content);
    level.reachableRefs.forEach(visit);
  }
  for (const [key, resolver] of resolvers) {
    if (used.has(key)) continue;
    if (resolver.category === "generated blob") throw new Error(`proof generated blob is orphaned: ${resolver.path}`);
    if (resolver.category === "derived source") throw new Error(`proof derived source is orphaned: ${key}`);
    throw new Error(`proof external input is orphaned: ${resolver.path}`);
  }
}

export function buildP7TrainingPackProofIndex(
  value: P7TrainingPackProofIndexInput | P7TrainingPackProofIndexV1,
): P7TrainingPackProofIndexV1 {
  const isBuiltIndex = value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && Object.hasOwn(value, "artifact");
  const input = exactKeys(value, isBuiltIndex
    ? [
        "artifact",
        "derivedSources",
        "derivedSourcesOrder",
        "evidenceSidecars",
        "evidenceSidecarsOrder",
        "externalInputs",
        "externalInputsOrder",
        "generatedBlobs",
        "generatedBlobsOrder",
        "levels",
        "levelsOrder",
        "pack",
        "packReachableRefs",
        "totals",
        "version",
      ]
    : [
        "derivedSources",
        "evidenceSidecars",
        "externalInputs",
        "generatedBlobs",
        "levels",
        "pack",
        "packReachableRefs",
      ], "P7 training pack proof index");
  if (Object.hasOwn(input, "artifact")) {
    if (
      input.artifact !== P7_TRAINING_PACK_PROOF_INDEX_ARTIFACT
      || input.version !== 1
      || input.externalInputsOrder !== "path"
      || input.derivedSourcesOrder !== "content-digest"
      || input.generatedBlobsOrder !== "locator"
      || input.evidenceSidecarsOrder !== "index-path"
      || input.levelsOrder !== "level-number"
    ) throw new Error("P7 training pack proof index identity or ordering is unsupported");
  }
  const rawPack = exactKeys(
    input.pack,
    ["corpusRevision", "expectedLevelCount", "packId", "producerRevision"],
    "proof pack",
  );
  const pack = {
    packId: text(rawPack.packId, "proof pack id", 64),
    expectedLevelCount: integer(rawPack.expectedLevelCount, 1, 4_096, "proof expected levels"),
    corpusRevision: text(rawPack.corpusRevision, "proof corpus revision"),
    producerRevision: text(rawPack.producerRevision, "proof producer revision"),
  };
  if (OFFICIAL_PACKS.has(pack.packId) && pack.expectedLevelCount !== 149) {
    throw new Error("official proof index requires exactly 149 levels");
  }
  if (!Array.isArray(input.externalInputs) || !Array.isArray(input.derivedSources)
    || !Array.isArray(input.generatedBlobs) || !Array.isArray(input.evidenceSidecars)
    || !Array.isArray(input.levels)) {
    throw new Error("proof index declaration collections must be arrays");
  }
  const externalInputs = input.externalInputs.map(copyExternal)
    .sort((left, right) => compareText(left.path, right.path));
  const derivedSources = input.derivedSources.map(copyDerived)
    .sort((left, right) => compareText(referenceKey(left.content), referenceKey(right.content)));
  const generatedBlobs = input.generatedBlobs.map(copyGenerated)
    .sort((left, right) => compareText(generatedLocatorKey(left.locator), generatedLocatorKey(right.locator)));
  const evidenceSidecars = input.evidenceSidecars.map(copyEvidenceSidecar)
    .sort((left, right) => compareText(left.index.path, right.index.path));
  const levels = input.levels.map(copyLevel).sort((left, right) => left.levelNumber - right.levelNumber);
  if (
    externalInputs.length + derivedSources.length + generatedBlobs.length + evidenceSidecars.length
    > P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS
  ) throw new Error("proof index declaration count exceeds its bound");
  const uniquePaths = new Set<string>();
  for (const path of [
    ...externalInputs.map((item) => item.path),
    ...generatedBlobs.flatMap((item) => item.locator.kind === "file"
      ? [item.locator.path]
      : []),
    ...evidenceSidecars.flatMap((item) => [item.index.path, item.payload.path]),
    ...derivedSources.flatMap((item) => item.retainedPath === null ? [] : [item.retainedPath]),
  ]) {
    if (uniquePaths.has(path)) throw new Error(`proof index path is duplicated: ${path}`);
    uniquePaths.add(path);
  }
  const sidecarOwners = new Set<string>();
  const sidecarOccurrences = new Set<string>();
  const sidecarScopes = new Set<string>();
  for (const sidecar of evidenceSidecars) {
    if (sidecar.owner.kind === "level" && sidecar.owner.levelNumber > pack.expectedLevelCount) {
      throw new Error("proof evidence sidecar owner exceeds the pack level denominator");
    }
    const ownerKey = sidecar.owner.kind === "pack"
      ? "pack"
      : `level:${sidecar.owner.levelNumber}`;
    if (sidecarOwners.has(ownerKey)) {
      throw new Error(`proof evidence sidecar owner is duplicated: ${ownerKey}`);
    }
    sidecarOwners.add(ownerKey);
    if (sidecar.owner.kind === "level") {
      if (sidecarOccurrences.has(sidecar.owner.occurrenceId)) {
        throw new Error(`proof evidence sidecar occurrence is duplicated: ${sidecar.owner.occurrenceId}`);
      }
      sidecarOccurrences.add(sidecar.owner.occurrenceId);
    }
    if (sidecarScopes.has(sidecar.scopeId)) {
      throw new Error(`proof evidence sidecar scope is duplicated: ${sidecar.scopeId}`);
    }
    sidecarScopes.add(sidecar.scopeId);
    const logical = generatedBlobs.filter(({ locator }) => (
      locator.kind === "evidence-sidecar-entry"
      && locator.indexPath === sidecar.index.path
      && locator.payloadPath === sidecar.payload.path
    ));
    if (
      logical.length !== sidecar.logicalBlobCount
      || logical.reduce((total, blob) => total + blob.content.byteLength, 0)
        !== sidecar.logicalByteLength
    ) throw new Error("proof evidence sidecar logical totals drifted");
  }
  for (const blob of generatedBlobs) {
    if (blob.locator.kind !== "evidence-sidecar-entry") continue;
    const locator = blob.locator;
    const sidecar = evidenceSidecars.find(({ index, payload }) => (
      index.path === locator.indexPath && payload.path === locator.payloadPath
    ));
    if (
      sidecar === undefined
      || locator.byteLength !== blob.content.byteLength
      || locator.byteOffset > sidecar.logicalByteLength
      || locator.byteLength > sidecar.logicalByteLength - locator.byteOffset
      || blob.mediaType === "text/html"
    ) throw new Error("proof generated sidecar locator is invalid");
    if (
      sidecar.owner.kind === "pack" ? blob.levelNumber !== null : (
        blob.levelNumber !== sidecar.owner.levelNumber
      )
    ) throw new Error("proof generated sidecar owner and level disagree");
  }
  for (const source of derivedSources) {
    const external = externalInputs.find((input) => input.path === source.sourcePath);
    if (
      external === undefined
      || referenceKey(external.content) !== referenceKey(source.sourceContent)
    ) {
      throw new Error(`proof derived source does not match an exact external input: ${source.sourcePath}`);
    }
    const kindMatches =
      (source.kind === "official-level-source"
        && source.locator.kind === "byte-range"
        && external.kind === "official-map")
      || (source.kind === "voting-candidate-level-source"
        && source.locator.kind === "byte-range"
        && external.kind === "voting-map")
      || (source.kind === "donor-replay-entry"
        && source.locator.kind === "entry-ordinal"
        && (external.kind === "official-replay-container"
          || external.kind === "voting-replay-container"));
    if (!kindMatches) {
      throw new Error(`proof derived source kind is incompatible with its exact external input: ${source.sourcePath}`);
    }
  }
  if (levels.length !== pack.expectedLevelCount) throw new Error("proof index level denominator drifted");
  levels.forEach((level, index) => {
    if (level.levelNumber !== index + 1) throw new Error("proof index levels must be contiguous from one");
    const contractBlob = generatedBlobs.find(({ locator }) => (
      locator.kind === "file" && locator.path === level.contract.path
    ));
    if (
      contractBlob?.kind !== "level-contract"
      || referenceKey(contractBlob.content) !== referenceKey(level.contract.content)
    ) throw new Error(`proof level ${level.levelNumber} contract declaration is missing`);
  });
  const declaredPhysicalByteLength = [
    ...externalInputs.map(({ content }) => content),
    ...derivedSources.flatMap(({ content, retainedPath }) => retainedPath === null ? [] : [content]),
    ...generatedBlobs.flatMap(({ content, locator }) => locator.kind === "file" ? [content] : []),
    ...evidenceSidecars.flatMap(({ index, payload }) => [index.content, payload.content]),
  ].reduce((sum, content) => sum + content.byteLength, 0);
  const logicalGeneratedByteLength = generatedBlobs.reduce(
    (sum, { content }) => sum + content.byteLength,
    0,
  );
  if (
    declaredPhysicalByteLength > P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES
    || logicalGeneratedByteLength > P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES
  ) {
    throw new Error("proof index declared physical or logical byte total exceeds its bound");
  }
  const index: P7TrainingPackProofIndexV1 = {
    artifact: P7_TRAINING_PACK_PROOF_INDEX_ARTIFACT,
    version: 1,
    pack,
    externalInputsOrder: "path",
    externalInputs,
    derivedSourcesOrder: "content-digest",
    derivedSources,
    generatedBlobsOrder: "locator",
    generatedBlobs,
    evidenceSidecarsOrder: "index-path",
    evidenceSidecars,
    levelsOrder: "level-number",
    levels,
    packReachableRefs: sortedReferences(input.packReachableRefs, "proof pack reachable refs"),
    totals: {
      externalInputCount: externalInputs.length,
      derivedSourceCount: derivedSources.length,
      generatedBlobCount: generatedBlobs.length,
      evidenceSidecarCount: evidenceSidecars.length,
      levelCount: levels.length,
      physicalFileCount: uniquePaths.size,
      declaredPhysicalByteLength,
      logicalGeneratedByteLength,
    },
  };
  if (Object.hasOwn(input, "totals")) {
    const supplied = exactKeys(input.totals, [
      "declaredPhysicalByteLength",
      "derivedSourceCount",
      "evidenceSidecarCount",
      "externalInputCount",
      "generatedBlobCount",
      "levelCount",
      "logicalGeneratedByteLength",
      "physicalFileCount",
    ], "proof totals");
    if (canonicalizeJson(supplied as CanonicalJsonValue) !== canonicalizeJson(index.totals)) {
      throw new Error("proof index totals are not derived exactly");
    }
  }
  validateStaticReachability(index);
  return index;
}

export function canonicalizeP7TrainingPackProofIndex(value: P7TrainingPackProofIndexInput | P7TrainingPackProofIndexV1): CanonicalJson {
  const canonical = canonicalizeJson(buildP7TrainingPackProofIndex(value) as unknown as CanonicalJsonValue);
  if (encoder.encode(canonical).byteLength > P7_TRAINING_PACK_PROOF_INDEX_MAX_BYTES) {
    throw new Error("P7 training pack proof index exceeds its byte bound");
  }
  return canonical;
}

export function parseP7TrainingPackProofIndex(value: string): P7TrainingPackProofIndexV1 {
  if (encoder.encode(value).byteLength > P7_TRAINING_PACK_PROOF_INDEX_MAX_BYTES) {
    throw new Error("P7 training pack proof index exceeds its byte bound");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error: unknown) {
    throw new Error("P7 training pack proof index is not valid JSON", { cause: error });
  }
  const index = buildP7TrainingPackProofIndex(parsed as P7TrainingPackProofIndexV1);
  if (canonicalizeP7TrainingPackProofIndex(index) !== value) {
    throw new Error("P7 training pack proof index is not canonical JSON");
  }
  return index;
}

export function p7TrainingPackProofPhysicalPaths(
  value: P7TrainingPackProofIndexV1,
): readonly string[] {
  const index = buildP7TrainingPackProofIndex(value);
  return [
    ...index.externalInputs.map(({ path }) => path),
    ...index.generatedBlobs.flatMap(({ locator }) => locator.kind === "file"
      ? [locator.path]
      : []),
    ...index.evidenceSidecars.flatMap(({ index, payload }) => [index.path, payload.path]),
    ...index.derivedSources.flatMap(({ retainedPath }) => (
      retainedPath === null ? [] : [retainedPath]
    )),
  ].sort(compareText);
}

function collectReferences(value: unknown, result: BlobReferenceV1[] = []): BlobReferenceV1[] {
  if (Array.isArray(value)) {
    value.forEach((entry) => collectReferences(entry, result));
    return result;
  }
  if (value === null || typeof value !== "object") return result;
  const record = value as Record<string, unknown>;
  if (
    record.artifact === "ccsolver-p7-training-execution-index"
    && record.semanticProof !== null
    && typeof record.semanticProof === "object"
    && !Array.isArray(record.semanticProof)
  ) {
    for (const [key, entry] of Object.entries(record)) {
      if (key === "pack") {
        // The reduced-pack content digest is a runner-envelope binding, not a
        // physical proof resolver owned by the checked pack leaf.
        continue;
      }
      if (key !== "semanticProof") {
        collectReferences(entry, result);
        continue;
      }
      for (const [proofKey, proofEntry] of Object.entries(
        entry as Record<string, unknown>,
      )) {
        // Physical evidence-container digests are storage bindings, not logical resolvers.
        // The execution index still reaches every logical evidence digest through
        // semanticProof.generatedBlobs.
        if (proofKey !== "evidenceSidecars") collectReferences(proofEntry, result);
      }
    }
    return result;
  }
  const keys = Object.keys(record).sort(compareText);
  if (keys.length === 2 && keys[0] === "byteLength" && keys[1] === "digest") {
    result.push(reference(record, "generated JSON blob reference"));
    return result;
  }
  Object.values(record).forEach((entry) => collectReferences(entry, result));
  return result;
}

export async function attestP7TrainingPackProofIndex(input: {
  readonly index: P7TrainingPackProofIndexV1;
  readonly files: readonly P7TrainingPackProofFile[];
  readonly sha256: Sha256Port;
  readonly extractEntryOrdinal?: (input: {
    readonly sourcePath: string;
    readonly sourceBytes: Uint8Array;
    readonly entryOrdinal: number;
    readonly extractorRevision: P7TrainingProofExtractorRevisionV1;
  }) => Promise<Uint8Array> | Uint8Array;
}): Promise<P7TrainingPackProofAttestation> {
  const index = buildP7TrainingPackProofIndex(input.index);
  const expectedPaths = new Set(p7TrainingPackProofPhysicalPaths(index));
  if (input.files.length > P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS) {
    throw new Error("proof attestation file count exceeds its bound");
  }
  let observedByteLength = 0;
  for (const file of input.files) {
    const byteLength = (file.bytes as { readonly byteLength?: unknown } | null)?.byteLength;
    if (!Number.isSafeInteger(byteLength) || (byteLength as number) < 0) {
      throw new Error("proof attestation file byte length is invalid");
    }
    if ((byteLength as number) > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES) {
      throw new Error("proof attestation file exceeds its byte bound");
    }
    observedByteLength += byteLength as number;
    if (observedByteLength > P7_TRAINING_PACK_PROOF_MAX_TOTAL_BYTES) {
      throw new Error("proof attestation file byte total exceeds its bound");
    }
  }
  const files = new Map<string, Uint8Array>();
  for (const file of input.files) {
    const path = safePath(file.path, "proof attestation file path");
    if (!expectedPaths.has(path) || files.has(path)) {
      throw new Error(`proof attestation file is unexpected or duplicated: ${path}`);
    }
    if (!(file.bytes instanceof Uint8Array)) {
      throw new Error(`proof attestation file bytes are invalid: ${path}`);
    }
    files.set(path, new Uint8Array(file.bytes));
  }
  if (files.size !== expectedPaths.size) throw new Error("proof attestation file set is incomplete");
  if (files.size !== index.totals.physicalFileCount) {
    throw new Error("proof attestation physical file totals drifted");
  }
  const declarations = [
    ...index.externalInputs.map((entry) => ({ path: entry.path, content: entry.content })),
    ...index.generatedBlobs.flatMap((entry) => entry.locator.kind === "file"
      ? [{ path: entry.locator.path, content: entry.content }]
      : []),
    ...index.evidenceSidecars.flatMap((entry) => [entry.index, entry.payload]),
    ...index.derivedSources.flatMap((entry) => entry.retainedPath === null
      ? []
      : [{ path: entry.retainedPath, content: entry.content }]),
  ];
  for (const declaration of declarations) {
    const actual = await referenceSourceBytes(files.get(declaration.path)!, input.sha256);
    if (referenceKey(actual) !== referenceKey(declaration.content)) {
      throw new Error(`proof content digest or length drifted: ${declaration.path}`);
    }
  }
  if (observedByteLength !== index.totals.declaredPhysicalByteLength) {
    throw new Error("proof attestation physical file totals drifted");
  }
  const generatedBytes = new Map<string, Uint8Array>();
  for (const blob of index.generatedBlobs) {
    if (blob.locator.kind !== "file") continue;
    generatedBytes.set(referenceKey(blob.content), files.get(blob.locator.path)!);
  }
  for (const sidecar of index.evidenceSidecars) {
    const rawIndexBytes = files.get(sidecar.index.path)!;
    let rawIndexText: string;
    let rawIndexValue: unknown;
    try {
      rawIndexText = decoder.decode(rawIndexBytes);
      rawIndexValue = JSON.parse(rawIndexText) as unknown;
    } catch (error: unknown) {
      throw new Error(`proof evidence sidecar index is invalid: ${sidecar.index.path}`, {
        cause: error,
      });
    }
    const sidecarIndex = parseP7GeneratedEvidenceSidecarIndex(rawIndexValue);
    const canonicalIndex = canonicalizeP7GeneratedEvidenceSidecarIndex(sidecarIndex);
    if (canonicalIndex !== rawIndexText) {
      throw new Error(`proof evidence sidecar index is not canonical: ${sidecar.index.path}`);
    }
    if (
      sidecarIndex.scopeId !== sidecar.scopeId
      || !sameReference(sidecarIndex.payloadContent, sidecar.payload.content)
      || sidecarIndex.totals.blobCount !== sidecar.logicalBlobCount
      || sidecarIndex.totals.byteLength !== sidecar.logicalByteLength
    ) throw new Error(`proof evidence sidecar binding drifted: ${sidecar.index.path}`);
    const bundle = await materializeP7GeneratedEvidenceSidecar({
      index: sidecarIndex,
      indexCanonicalJson: canonicalIndex,
      indexContent: sidecar.index.content,
      payload: files.get(sidecar.payload.path)!,
      limits: {
        maximumBlobCount: P7_TRAINING_PACK_PROOF_MAX_DECLARATIONS,
        maximumBlobBytes: P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
        maximumTotalBytes: P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES,
      },
      sha256: input.sha256,
    });
    const logicalDeclarations = index.generatedBlobs.filter(({ locator }) => (
      locator.kind === "evidence-sidecar-entry"
      && locator.indexPath === sidecar.index.path
      && locator.payloadPath === sidecar.payload.path
    ));
    if (logicalDeclarations.length !== bundle.blobs.length) {
      throw new Error(`proof evidence sidecar logical declaration count drifted: ${sidecar.index.path}`);
    }
    for (const [entryIndex, blob] of bundle.blobs.entries()) {
      const stored = sidecarIndex.entries[entryIndex]!;
      const declaration = logicalDeclarations.find(({ locator }) => (
        locator.kind === "evidence-sidecar-entry"
        && locator.byteOffset === stored.byteOffset
        && locator.byteLength === stored.byteLength
      ));
      if (
        declaration === undefined
        || declaration.mediaType !== blob.mediaType
        || referenceKey(declaration.content) !== referenceKey(blob.content)
      ) throw new Error(`proof evidence sidecar logical declaration drifted: ${sidecar.index.path}`);
      generatedBytes.set(referenceKey(blob.content), blob.bytes);
    }
  }
  for (const blob of index.generatedBlobs) {
    const bytes = generatedBytes.get(referenceKey(blob.content));
    if (bytes === undefined) {
      throw new Error(`proof generated blob bytes are unresolved: ${generatedLabel(blob)}`);
    }
    const actual = await referenceSourceBytes(bytes, input.sha256);
    if (referenceKey(actual) !== referenceKey(blob.content)) {
      throw new Error(`proof generated blob content drifted: ${generatedLabel(blob)}`);
    }
  }
  for (const source of index.derivedSources) {
    const sourceBytes = files.get(source.sourcePath);
    if (sourceBytes === undefined) throw new Error(`proof derived source input is missing: ${source.sourcePath}`);
    const extracted = source.locator.kind === "byte-range"
      ? (() => {
          if (
            source.locator.byteOffset > sourceBytes.byteLength
            || source.locator.byteLength > sourceBytes.byteLength - source.locator.byteOffset
          ) {
            throw new Error(`proof derived source byte range exceeds its external source: ${source.sourcePath}`);
          }
          return sourceBytes.slice(
            source.locator.byteOffset,
            source.locator.byteOffset + source.locator.byteLength,
          );
        })()
      : input.extractEntryOrdinal === undefined
        ? (() => { throw new Error("proof entry-ordinal extractor is required"); })()
        : await input.extractEntryOrdinal({
          sourcePath: source.sourcePath,
          sourceBytes,
          entryOrdinal: source.locator.entryOrdinal,
          extractorRevision: source.extractorRevision,
        });
    if (!(extracted instanceof Uint8Array)) {
      throw new Error("proof derived source extractor returned invalid bytes");
    }
    if (extracted.byteLength > P7_TRAINING_PACK_PROOF_MAX_FILE_BYTES) {
      throw new Error("proof derived source exceeds its byte bound");
    }
    const actual = await referenceSourceBytes(extracted, input.sha256);
    if (referenceKey(actual) !== referenceKey(source.content)) {
      throw new Error(`proof derived source drifted: ${referenceKey(source.content)}`);
    }
  }
  const jsonDependencies = new Map<string, BlobReferenceV1[]>();
  for (const blob of index.generatedBlobs) {
    if (blob.mediaType !== "application/json") continue;
    const bytes = generatedBytes.get(referenceKey(blob.content))!;
    let text: string;
    let value: unknown;
    try {
      text = decoder.decode(bytes);
      value = JSON.parse(text) as unknown;
    } catch (error: unknown) {
      throw new Error(`proof generated JSON is invalid: ${generatedLabel(blob)}`, { cause: error });
    }
    if (canonicalizeJson(value as CanonicalJsonValue) !== text) {
      throw new Error(`proof generated JSON is not canonical: ${generatedLabel(blob)}`);
    }
    jsonDependencies.set(referenceKey(blob.content), collectReferences(value));
  }
  const resolvers = resolverMap(index);
  const visited = new Set<string>();
  const visit = (ref: BlobReferenceV1, closure: Set<string>) => {
    const key = referenceKey(ref);
    const resolver = resolvers.get(key);
    if (resolver === undefined) throw new Error(`proof recursive reference is unresolved: ${key}`);
    if (closure.has(key)) return;
    closure.add(key);
    visited.add(key);
    if (resolver.sourceContent !== null) visit(resolver.sourceContent, closure);
    jsonDependencies.get(key)?.forEach((dependency) => visit(dependency, closure));
  };
  for (const ref of index.packReachableRefs) visit(ref, new Set());
  for (const level of index.levels) {
    const closure = new Set<string>();
    visit(level.contract.content, closure);
    closure.delete(referenceKey(level.contract.content));
    const declared = level.reachableRefs.map(referenceKey).sort(compareText);
    const observed = [...closure].sort(compareText);
    if (declared.length !== observed.length || declared.some((key, index) => key !== observed[index])) {
      throw new Error(`proof level ${level.levelNumber} reachable reference closure drifted`);
    }
  }
  if (visited.size !== resolvers.size) {
    const orphan = [...resolvers.keys()].find((key) => !visited.has(key))!;
    throw new Error(`proof attestation found an orphaned declaration: ${orphan}`);
  }
  return {
    reachableReferenceCount: visited.size,
    observedGeneratedBlobCount: index.generatedBlobs.length,
    observedEvidenceSidecarCount: index.evidenceSidecars.length,
    observedExternalInputCount: index.externalInputs.length,
    observedRetainedDerivedSourceCount: index.derivedSources.filter(
      ({ retainedPath }) => retainedPath !== null,
    ).length,
    observedPhysicalFileCount: files.size,
    observedLogicalGeneratedByteLength: index.totals.logicalGeneratedByteLength,
    observedByteLength,
  };
}

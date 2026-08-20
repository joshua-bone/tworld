import {
  referenceCanonicalJson,
  referenceSourceBytes,
} from "@tworld/ccsolver/application";
import {
  canonicalizeJson,
  type BlobReferenceV1,
  type CanonicalJson,
  type CanonicalJsonValue,
} from "@tworld/ccsolver/domain";
import type { Sha256Port } from "@tworld/ccsolver/ports";
import {
  P7GeneratedEvidenceStore,
  type P7GeneratedEvidenceBundleV1,
  type P7GeneratedEvidenceLimitsV1,
  type P7GeneratedEvidenceMediaType,
} from "./p7GeneratedEvidenceStore";

export const P7_GENERATED_EVIDENCE_SIDECAR_ARTIFACT =
  "ccsolver-p7-generated-evidence-sidecar" as const;

export interface P7GeneratedEvidenceSidecarIndexV1 {
  readonly artifact: typeof P7_GENERATED_EVIDENCE_SIDECAR_ARTIFACT;
  readonly version: 1;
  readonly scopeId: string;
  readonly payloadContent: BlobReferenceV1;
  readonly totals: {
    readonly blobCount: number;
    readonly byteLength: number;
  };
  readonly entries: readonly {
    readonly content: BlobReferenceV1;
    readonly mediaType: P7GeneratedEvidenceMediaType;
    readonly byteOffset: number;
    readonly byteLength: number;
  }[];
}

export interface P7GeneratedEvidenceSidecarV1 {
  readonly index: P7GeneratedEvidenceSidecarIndexV1;
  readonly indexCanonicalJson: CanonicalJson;
  readonly indexContent: BlobReferenceV1;
  readonly payload: Uint8Array;
}

function record(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const result = value as Record<string, unknown>;
  const actual = Object.keys(result).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) throw new Error(`${label} has an unsupported shape`);
  return result;
}

function integer(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
  return value as number;
}

function contentReference(value: unknown, label: string): BlobReferenceV1 {
  const source = record(value, ["byteLength", "digest"], label);
  if (typeof source.digest !== "string" || !/^sha256:[0-9a-f]{64}$/u.test(source.digest)) {
    throw new Error(`${label} digest is invalid`);
  }
  return {
    digest: source.digest as `sha256:${string}`,
    byteLength: integer(source.byteLength, `${label} byte length`),
  };
}

function sameReference(left: BlobReferenceV1, right: BlobReferenceV1): boolean {
  return left.digest === right.digest && left.byteLength === right.byteLength;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function parseP7GeneratedEvidenceSidecarIndex(
  value: unknown,
): P7GeneratedEvidenceSidecarIndexV1 {
  const source = record(value, [
    "artifact",
    "entries",
    "payloadContent",
    "scopeId",
    "totals",
    "version",
  ], "P7 generated evidence sidecar index");
  if (
    source.artifact !== P7_GENERATED_EVIDENCE_SIDECAR_ARTIFACT
    || source.version !== 1
    || typeof source.scopeId !== "string"
    || source.scopeId.trim() === ""
    || new TextEncoder().encode(source.scopeId).byteLength > 512
    || !Array.isArray(source.entries)
  ) throw new Error("P7 generated evidence sidecar identity is invalid");
  const totals = record(source.totals, ["blobCount", "byteLength"], "P7 sidecar totals");
  const entries = source.entries.map((value, ordinal) => {
    const entry = record(value, [
      "byteLength",
      "byteOffset",
      "content",
      "mediaType",
    ], `P7 sidecar entry ${ordinal}`);
    if (entry.mediaType !== "application/json" && entry.mediaType !== "application/octet-stream") {
      throw new Error(`P7 sidecar entry ${ordinal} media type is invalid`);
    }
    return {
      content: contentReference(entry.content, `P7 sidecar entry ${ordinal} content`),
      mediaType: entry.mediaType as P7GeneratedEvidenceMediaType,
      byteOffset: integer(entry.byteOffset, `P7 sidecar entry ${ordinal} byte offset`),
      byteLength: integer(entry.byteLength, `P7 sidecar entry ${ordinal} byte length`),
    };
  });
  return {
    artifact: P7_GENERATED_EVIDENCE_SIDECAR_ARTIFACT,
    version: 1,
    scopeId: source.scopeId,
    payloadContent: contentReference(source.payloadContent, "P7 sidecar payload content"),
    totals: {
      blobCount: integer(totals.blobCount, "P7 sidecar blob count"),
      byteLength: integer(totals.byteLength, "P7 sidecar byte length"),
    },
    entries,
  };
}

export function canonicalizeP7GeneratedEvidenceSidecarIndex(value: unknown): CanonicalJson {
  return canonicalizeJson(
    parseP7GeneratedEvidenceSidecarIndex(value) as unknown as CanonicalJsonValue,
  );
}

export async function buildP7GeneratedEvidenceSidecar(input: {
  readonly bundle: P7GeneratedEvidenceBundleV1;
  readonly sha256: Sha256Port;
}): Promise<P7GeneratedEvidenceSidecarV1> {
  const store = new P7GeneratedEvidenceStore({
    scopeId: input.bundle.scopeId,
    sha256: input.sha256,
    limits: input.bundle.limits,
  });
  await store.importBundle(input.bundle);
  const bundle = store.bundle();
  const sorted = [...bundle.blobs].sort((left, right) => (
    compareAscii(left.content.digest, right.content.digest)
  ));
  const payload = new Uint8Array(bundle.totals.byteLength);
  let byteOffset = 0;
  const entries = sorted.map(({ content, mediaType, bytes }) => {
    payload.set(bytes, byteOffset);
    const entry = {
      content: { ...content },
      mediaType,
      byteOffset,
      byteLength: bytes.byteLength,
    };
    byteOffset += bytes.byteLength;
    return entry;
  });
  const index = parseP7GeneratedEvidenceSidecarIndex({
    artifact: P7_GENERATED_EVIDENCE_SIDECAR_ARTIFACT,
    version: 1,
    scopeId: bundle.scopeId,
    payloadContent: await referenceSourceBytes(payload, input.sha256),
    totals: { ...bundle.totals },
    entries,
  });
  const indexCanonicalJson = canonicalizeP7GeneratedEvidenceSidecarIndex(index);
  return {
    index,
    indexCanonicalJson,
    indexContent: await referenceCanonicalJson(indexCanonicalJson, input.sha256),
    payload,
  };
}

export async function materializeP7GeneratedEvidenceSidecar(input: {
  readonly index: unknown;
  readonly indexCanonicalJson: CanonicalJson;
  readonly indexContent: BlobReferenceV1;
  readonly payload: Uint8Array;
  readonly limits: P7GeneratedEvidenceLimitsV1;
  readonly sha256: Sha256Port;
}): Promise<P7GeneratedEvidenceBundleV1> {
  const index = parseP7GeneratedEvidenceSidecarIndex(input.index);
  const canonicalJson = canonicalizeP7GeneratedEvidenceSidecarIndex(index);
  if (
    canonicalJson !== input.indexCanonicalJson
    || !sameReference(
      await referenceCanonicalJson(canonicalJson, input.sha256),
      input.indexContent,
    )
    || input.payload.byteLength !== index.payloadContent.byteLength
    || !sameReference(
      await referenceSourceBytes(input.payload, input.sha256),
      index.payloadContent,
    )
    || index.totals.blobCount !== index.entries.length
    || index.totals.byteLength !== index.payloadContent.byteLength
    || index.entries.length > input.limits.maximumBlobCount
    || index.totals.byteLength > input.limits.maximumTotalBytes
  ) throw new Error("P7 generated evidence sidecar binding is invalid");
  let nextOffset = 0;
  const blobs: P7GeneratedEvidenceBundleV1["blobs"][number][] = [];
  for (const [ordinal, entry] of index.entries.entries()) {
    if (
      entry.byteOffset !== nextOffset
      || entry.byteLength !== entry.content.byteLength
      || entry.byteLength > input.limits.maximumBlobBytes
      || (ordinal > 0
        && compareAscii(index.entries[ordinal - 1]!.content.digest, entry.content.digest) >= 0)
    ) throw new Error("P7 generated evidence sidecar entries are not canonical and contiguous");
    const bytes = input.payload.slice(entry.byteOffset, entry.byteOffset + entry.byteLength);
    if (!sameReference(await referenceSourceBytes(bytes, input.sha256), entry.content)) {
      throw new Error("P7 generated evidence sidecar slice digest drifted");
    }
    if (entry.mediaType === "application/json") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      const parsed: unknown = JSON.parse(text);
      if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
        throw new Error("P7 generated JSON evidence sidecar slice is not canonical");
      }
    }
    blobs.push({ content: { ...entry.content }, mediaType: entry.mediaType, bytes });
    nextOffset += entry.byteLength;
  }
  if (nextOffset !== index.payloadContent.byteLength) {
    throw new Error("P7 generated evidence sidecar payload has unindexed bytes");
  }
  return {
    artifact: "ccsolver-p7-generated-evidence-bundle",
    version: 1,
    scopeId: index.scopeId,
    limits: { ...input.limits },
    totals: { ...index.totals },
    blobs,
  };
}

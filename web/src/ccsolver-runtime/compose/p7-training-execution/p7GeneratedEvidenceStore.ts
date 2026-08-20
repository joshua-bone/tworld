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

export const P7_GENERATED_EVIDENCE_DEFAULT_LIMITS = Object.freeze({
  maximumBlobCount: 20_000,
  maximumBlobBytes: 16 * 1024 * 1024,
  maximumTotalBytes: 512 * 1024 * 1024,
});

export interface P7GeneratedEvidenceLimitsV1 {
  readonly maximumBlobCount: number;
  readonly maximumBlobBytes: number;
  readonly maximumTotalBytes: number;
}

export type P7GeneratedEvidenceMediaType =
  | "application/json"
  | "application/octet-stream";

export interface P7GeneratedEvidenceBlobV1 {
  readonly content: BlobReferenceV1;
  readonly mediaType: P7GeneratedEvidenceMediaType;
  readonly bytes: Uint8Array;
}

/**
 * A reproducible digest over bounded canonical JSON that is intentionally not
 * advertised as an emitted blob. Heavy proof streams use this inside a small
 * retained receipt; an auditor re-executes the stream to reproduce the digest.
 */
export interface P7GeneratedCanonicalDigestV1 {
  readonly algorithm: "sha256";
  readonly canonicalization: "tworld-canonical-json-v1";
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
}

export interface P7GeneratedByteDigestV1 {
  readonly algorithm: "sha256";
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
}

export interface P7GeneratedEvidenceBundleV1 {
  readonly artifact: "ccsolver-p7-generated-evidence-bundle";
  readonly version: 1;
  readonly scopeId: string;
  readonly limits: P7GeneratedEvidenceLimitsV1;
  readonly totals: {
    readonly blobCount: number;
    readonly byteLength: number;
  };
  readonly blobs: readonly P7GeneratedEvidenceBlobV1[];
}

interface StoredBlob {
  readonly content: BlobReferenceV1;
  readonly mediaType: P7GeneratedEvidenceMediaType;
  readonly bytes: Uint8Array;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function checkedLimit(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function copyLimits(value: P7GeneratedEvidenceLimitsV1): P7GeneratedEvidenceLimitsV1 {
  return {
    maximumBlobCount: checkedLimit(value.maximumBlobCount, "generated evidence blob-count cap"),
    maximumBlobBytes: checkedLimit(value.maximumBlobBytes, "generated evidence per-blob byte cap"),
    maximumTotalBytes: checkedLimit(value.maximumTotalBytes, "generated evidence total byte cap"),
  };
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength
    && left.every((value, index) => value === right[index]);
}

function canonicalSafe(value: unknown): CanonicalJson {
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error("generated evidence value is not JSON representable");
  return canonicalizeJson(JSON.parse(json) as CanonicalJsonValue);
}

export class P7GeneratedEvidenceStore {
  readonly #scopeId: string;
  readonly #sha256: Sha256Port;
  readonly #limits: P7GeneratedEvidenceLimitsV1;
  readonly #byDigest = new Map<string, StoredBlob>();
  #totalBytes = 0;

  constructor(input: {
    readonly scopeId: string;
    readonly sha256: Sha256Port;
    readonly limits?: P7GeneratedEvidenceLimitsV1;
  }) {
    if (input.scopeId.trim() === "" || new TextEncoder().encode(input.scopeId).byteLength > 512) {
      throw new Error("generated evidence scope id is invalid");
    }
    this.#scopeId = input.scopeId;
    this.#sha256 = input.sha256;
    this.#limits = copyLimits(input.limits ?? P7_GENERATED_EVIDENCE_DEFAULT_LIMITS);
  }

  async #retain(
    bytes: Uint8Array,
    mediaType: P7GeneratedEvidenceMediaType,
  ): Promise<BlobReferenceV1> {
    if (bytes.byteLength > this.#limits.maximumBlobBytes) {
      throw new Error("generated evidence exceeds its per-blob byte cap");
    }
    const detached = new Uint8Array(bytes);
    let canonicalJson: CanonicalJson | null = null;
    if (mediaType === "application/json") {
      let text: string;
      let parsed: unknown;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(detached);
        parsed = JSON.parse(text);
      } catch (error) {
        throw new Error("generated JSON evidence bytes are not valid UTF-8 canonical JSON", {
          cause: error,
        });
      }
      if (canonicalizeJson(parsed as CanonicalJsonValue) !== text) {
        throw new Error("generated JSON evidence bytes are not canonical JSON");
      }
      canonicalJson = text as CanonicalJson;
    }
    const content = canonicalJson === null
      ? await referenceSourceBytes(detached, this.#sha256)
      : await referenceCanonicalJson(canonicalJson, this.#sha256);
    const existing = this.#byDigest.get(content.digest);
    if (existing !== undefined) {
      if (existing.mediaType !== mediaType || !sameBytes(existing.bytes, detached)) {
        throw new Error(`generated evidence digest collision or media-type conflict: ${content.digest}`);
      }
      return { ...existing.content };
    }
    if (this.#byDigest.size + 1 > this.#limits.maximumBlobCount) {
      throw new Error("generated evidence exceeds its blob-count cap");
    }
    if (this.#totalBytes + detached.byteLength > this.#limits.maximumTotalBytes) {
      throw new Error("generated evidence exceeds its total byte cap");
    }
    this.#byDigest.set(content.digest, {
      content: { ...content },
      mediaType,
      bytes: detached,
    });
    this.#totalBytes += detached.byteLength;
    return { ...content };
  }

  async referenceCanonical(value: unknown): Promise<BlobReferenceV1> {
    return this.referenceCanonicalJson(canonicalSafe(value));
  }

  async digestCanonical(value: unknown): Promise<P7GeneratedCanonicalDigestV1> {
    const canonicalJson = canonicalSafe(value);
    const byteLength = new TextEncoder().encode(canonicalJson).byteLength;
    if (byteLength > this.#limits.maximumBlobBytes) {
      throw new Error("generated canonical digest input exceeds its byte cap");
    }
    const content = await referenceCanonicalJson(canonicalJson, this.#sha256);
    return {
      algorithm: "sha256",
      canonicalization: "tworld-canonical-json-v1",
      digest: content.digest,
      byteLength,
    };
  }

  async digestBinary(value: Uint8Array): Promise<P7GeneratedByteDigestV1> {
    if (value.byteLength > this.#limits.maximumBlobBytes) {
      throw new Error("generated byte digest input exceeds its byte cap");
    }
    const content = await referenceSourceBytes(value, this.#sha256);
    return {
      algorithm: "sha256",
      digest: content.digest,
      byteLength: content.byteLength,
    };
  }

  async referenceCanonicalJson(value: CanonicalJson): Promise<BlobReferenceV1> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new Error("generated canonical evidence is invalid JSON", { cause: error });
    }
    if (canonicalizeJson(parsed as CanonicalJsonValue) !== value) {
      throw new Error("generated canonical evidence is not canonical JSON");
    }
    return this.#retain(new TextEncoder().encode(value), "application/json");
  }

  async referenceBinary(value: Uint8Array): Promise<BlobReferenceV1> {
    return this.#retain(value, "application/octet-stream");
  }

  async importBundle(bundle: P7GeneratedEvidenceBundleV1): Promise<void> {
    if (
      bundle.artifact !== "ccsolver-p7-generated-evidence-bundle"
      || bundle.version !== 1
      || bundle.blobs.length !== bundle.totals.blobCount
      || bundle.blobs.reduce((sum, entry) => sum + entry.bytes.byteLength, 0)
        !== bundle.totals.byteLength
    ) {
      throw new Error("generated evidence bundle has an unsupported shape or totals");
    }
    for (const entry of bundle.blobs) {
      const content = await this.#retain(entry.bytes, entry.mediaType);
      if (
        content.digest !== entry.content.digest
        || content.byteLength !== entry.content.byteLength
      ) {
        throw new Error(`generated evidence import digest drifted: ${entry.content.digest}`);
      }
    }
  }

  bundle(): P7GeneratedEvidenceBundleV1 {
    return {
      artifact: "ccsolver-p7-generated-evidence-bundle",
      version: 1,
      scopeId: this.#scopeId,
      limits: { ...this.#limits },
      totals: {
        blobCount: this.#byDigest.size,
        byteLength: this.#totalBytes,
      },
      blobs: [...this.#byDigest.values()]
        .sort((left, right) => compareText(left.content.digest, right.content.digest))
        .map((entry) => ({
          content: { ...entry.content },
          mediaType: entry.mediaType,
          bytes: new Uint8Array(entry.bytes),
        })),
    };
  }
}

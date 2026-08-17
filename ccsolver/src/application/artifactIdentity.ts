import {
  CanonicalJsonError,
  parseCanonicalJson,
  type CanonicalJson,
} from "../domain/canonicalJson.js";
import type { Sha256Port } from "../ports/Sha256Port.js";

declare const artifactIdBrand: unique symbol;

export type ArtifactId = `sha256:${string}` & {
  readonly [artifactIdBrand]: "ArtifactId";
};

export type ArtifactProtocolErrorCode =
  | "artifact.bundle-mismatch"
  | "artifact.digest-mismatch"
  | "artifact.hash-failed"
  | "artifact.invalid-envelope"
  | "artifact.invalid-json"
  | "artifact.invalid-json-value"
  | "artifact.invariant-invalid"
  | "artifact.non-canonical-json"
  | "artifact.schema-invalid"
  | "artifact.unknown-artifact-type"
  | "artifact.unsupported-protocol"
  | "artifact.unsupported-protocol-version"
  | "artifact.unsupported-schema-version";

export class ArtifactProtocolError extends Error {
  override readonly name = "ArtifactProtocolError";

  constructor(
    readonly code: ArtifactProtocolErrorCode,
    readonly path: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

const artifactIdPattern = /^sha256:[0-9a-f]{64}$/u;

export function parseArtifactId(value: string): ArtifactId {
  if (!artifactIdPattern.test(value)) {
    throw new ArtifactProtocolError(
      "artifact.schema-invalid",
      "",
      "artifact IDs must use sha256 followed by 64 lowercase hexadecimal digits",
    );
  }
  return value as ArtifactId;
}

function formatArtifactId(digest: Uint8Array): ArtifactId {
  const hex = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}` as ArtifactId;
}

export async function identifyCanonicalJson(
  canonicalText: CanonicalJson,
  sha256: Sha256Port,
): Promise<ArtifactId> {
  try {
    parseCanonicalJson(canonicalText);
  } catch (error) {
    if (!(error instanceof CanonicalJsonError)) {
      throw error;
    }
    const code = error.code === "canonical.invalid-json"
      ? "artifact.invalid-json"
      : error.code === "canonical.non-canonical"
        ? "artifact.non-canonical-json"
        : "artifact.invalid-json-value";
    throw new ArtifactProtocolError(code, error.path, error.message, { cause: error });
  }

  let digest: Uint8Array;
  try {
    digest = await sha256.digestUtf8(canonicalText);
  } catch (error) {
    throw new ArtifactProtocolError(
      "artifact.hash-failed",
      "",
      "SHA-256 adapter failed to digest canonical artifact bytes",
      { cause: error },
    );
  }

  if (!(digest instanceof Uint8Array) || digest.byteLength !== 32) {
    throw new ArtifactProtocolError(
      "artifact.hash-failed",
      "",
      "SHA-256 adapter must return exactly 32 bytes",
    );
  }
  return formatArtifactId(digest);
}

export async function verifyArtifactIdentity(
  canonicalText: CanonicalJson,
  expectedId: ArtifactId | string,
  sha256: Sha256Port,
): Promise<void> {
  const expected = parseArtifactId(expectedId);
  const actual = await identifyCanonicalJson(canonicalText, sha256);
  if (actual !== expected) {
    throw new ArtifactProtocolError(
      "artifact.digest-mismatch",
      "",
      `artifact digest mismatch: expected ${expected}, received ${actual}`,
    );
  }
}

import type {
  BlobReferenceV1,
  LevelFactsV1,
} from "../domain/artifacts/types.js";
import type { CanonicalJson } from "../domain/canonicalJson.js";
import type { Sha256Port } from "../ports/Sha256Port.js";
import {
  ArtifactProtocolError,
  identifyBytes,
  identifyCanonicalJson,
} from "./artifactIdentity.js";
import { decodeCanonicalArtifact, encodeArtifact } from "./artifactProtocol.js";

export interface LevelFactsSourceBytesV1 {
  readonly container: Uint8Array;
  readonly members: readonly Uint8Array[];
  readonly normalizedMap: CanonicalJson;
}

function utf8ByteLength(value: string): number {
  let length = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    length += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return length;
}

export async function referenceSourceBytes(
  bytes: Uint8Array,
  sha256: Sha256Port,
): Promise<BlobReferenceV1> {
  return {
    digest: await identifyBytes(bytes, sha256),
    byteLength: bytes.byteLength,
  };
}

export async function referenceCanonicalJson(
  value: CanonicalJson,
  sha256: Sha256Port,
): Promise<BlobReferenceV1> {
  return {
    digest: await identifyCanonicalJson(value, sha256),
    byteLength: utf8ByteLength(value),
  };
}

async function verifyBytes(
  actual: Uint8Array,
  expected: BlobReferenceV1,
  path: string,
  sha256: Sha256Port,
): Promise<void> {
  if (actual.byteLength !== expected.byteLength) {
    throw new ArtifactProtocolError(
      "artifact.bundle-mismatch",
      `${path}/byteLength`,
      `source byte length mismatch: expected ${expected.byteLength}, received ${actual.byteLength}`,
    );
  }
  const digest = await identifyBytes(actual, sha256);
  if (digest !== expected.digest) {
    throw new ArtifactProtocolError(
      "artifact.digest-mismatch",
      `${path}/digest`,
      `source digest mismatch: expected ${expected.digest}, received ${digest}`,
    );
  }
}

function containsByteSequence(container: Uint8Array, member: Uint8Array): boolean {
  if (member.byteLength === 0) return true;
  if (member.byteLength > container.byteLength) return false;
  const prefix = new Uint32Array(member.byteLength);
  for (let index = 1, matched = 0; index < member.byteLength; index += 1) {
    while (matched > 0 && member[index] !== member[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (member[index] === member[matched]) matched += 1;
    prefix[index] = matched;
  }
  for (let index = 0, matched = 0; index < container.byteLength; index += 1) {
    while (matched > 0 && container[index] !== member[matched]) {
      matched = prefix[matched - 1] ?? 0;
    }
    if (container[index] === member[matched]) matched += 1;
    if (matched === member.byteLength) return true;
  }
  return false;
}

export async function verifyLevelFactsSourceBytes(
  input: LevelFactsV1,
  source: LevelFactsSourceBytesV1,
  sha256: Sha256Port,
): Promise<void> {
  const artifact = decodeCanonicalArtifact(encodeArtifact(input));
  if (artifact.artifactType !== "level-facts") {
    throw new ArtifactProtocolError(
      "artifact.bundle-mismatch",
      "/artifactType",
      "expected a level-facts artifact",
    );
  }

  await verifyBytes(
    source.container,
    artifact.payload.provenance.source.content,
    "/payload/provenance/source/content",
    sha256,
  );

  const expectedMembers = artifact.payload.provenance.occurrence.members;
  if (source.members.length !== expectedMembers.length) {
    throw new ArtifactProtocolError(
      "artifact.bundle-mismatch",
      "/payload/provenance/occurrence/members",
      `source member count mismatch: expected ${expectedMembers.length}, received ${source.members.length}`,
    );
  }
  for (let index = 0; index < expectedMembers.length; index += 1) {
    const expected = expectedMembers[index];
    const actual = source.members[index];
    if (expected === undefined || actual === undefined) {
      continue;
    }
    await verifyBytes(
      actual,
      expected.content,
      `/payload/provenance/occurrence/members/${index}/content`,
      sha256,
    );
    if (!containsByteSequence(source.container, actual)) {
      throw new ArtifactProtocolError(
        "artifact.bundle-mismatch",
        `/payload/provenance/occurrence/members/${index}/content`,
        "source occurrence member is not a byte-for-byte span of its source container",
      );
    }
  }

  const normalizedReference = await referenceCanonicalJson(source.normalizedMap, sha256);
  const expectedNormalized = artifact.payload.provenance.normalizedMap.content;
  if (normalizedReference.byteLength !== expectedNormalized.byteLength) {
    throw new ArtifactProtocolError(
      "artifact.bundle-mismatch",
      "/payload/provenance/normalizedMap/content/byteLength",
      "normalized gameplay-map byte length does not match its provenance reference",
    );
  }
  if (normalizedReference.digest !== expectedNormalized.digest) {
    throw new ArtifactProtocolError(
      "artifact.digest-mismatch",
      "/payload/provenance/normalizedMap/content/digest",
      "normalized gameplay-map digest does not match its provenance reference",
    );
  }
}

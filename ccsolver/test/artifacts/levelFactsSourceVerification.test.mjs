import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ArtifactProtocolError,
  decodeCanonicalArtifact,
  referenceCanonicalJson,
  referenceSourceBytes,
  verifyLevelFactsSourceBytes,
} from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";

const sha256 = new WebCryptoSha256();
const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../fixtures/conformance/v1",
);

async function verifiableFixtureBundle() {
  const artifact = decodeCanonicalArtifact(
    await readFile(resolve(fixtureRoot, "valid/level-facts.v1.json"), "utf8"),
  );
  const encoder = new TextEncoder();
  const memberZero = encoder.encode("fixture-layer-zero");
  const memberOne = encoder.encode("fixture-layer-one");
  const container = encoder.encode("prefix:fixture-layer-zero:middle:fixture-layer-one:suffix");
  const normalizedMap = canonicalizeJson({ fixture: "normalized-map" });
  artifact.payload.provenance.source.content = await referenceSourceBytes(container, sha256);
  artifact.payload.provenance.occurrence.members[0].content = await referenceSourceBytes(memberZero, sha256);
  artifact.payload.provenance.occurrence.members[1].content = await referenceSourceBytes(memberOne, sha256);
  const normalizedReference = await referenceCanonicalJson(normalizedMap, sha256);
  artifact.payload.provenance.normalizedMap.content = normalizedReference;
  artifact.payload.level.normalizedGameplayDigest = normalizedReference.digest;
  for (const placement of artifact.payload.placements) {
    placement.descriptor.levelDigest = normalizedReference.digest;
  }
  for (const wiring of artifact.payload.wiring) {
    wiring.descriptor.levelDigest = normalizedReference.digest;
  }
  return {
    artifact: decodeCanonicalArtifact(canonicalizeJson(artifact)),
    source: { container, members: [memberZero, memberOne], normalizedMap },
  };
}

test("creates content references for exact bytes and canonical UTF-8", async () => {
  assert.deepEqual(await referenceSourceBytes(Uint8Array.from([0, 255]), sha256), {
    byteLength: 2,
    digest: "sha256:06eb7d6a69ee19e5fbdf749018d3d2abfa04bcbd1365db312eb86dc7169389b8",
  });
  assert.deepEqual(await referenceCanonicalJson(canonicalizeJson({ label: "𐀀" }), sha256), {
    byteLength: 16,
    digest: "sha256:449c6fb2d101b172196b07ae2c14af01f1decd8ef9ff00c23276328f2637c023",
  });
});

test("reports an invalid byte-digest adapter through the stable artifact error", async () => {
  await assert.rejects(
    referenceSourceBytes(Uint8Array.of(1), {
      digestBytes: async () => new Uint8Array(31),
      digestUtf8: async () => new Uint8Array(31),
    }),
    (error) => error instanceof ArtifactProtocolError && error.code === "artifact.hash-failed",
  );
});

test("verifies the complete source byte chain", async () => {
  const { artifact, source } = await verifiableFixtureBundle();
  await verifyLevelFactsSourceBytes(artifact, source, sha256);
});

test("reports exact source bundle mismatches", async () => {
  const { artifact, source } = await verifiableFixtureBundle();

  await assert.rejects(
    verifyLevelFactsSourceBytes(
      artifact,
      { ...source, container: source.container.subarray(1) },
      sha256,
    ),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path === "/payload/provenance/source/content/byteLength"
    ),
  );

  const changedContainer = new Uint8Array(source.container);
  changedContainer[0] ^= 1;
  await assert.rejects(
    verifyLevelFactsSourceBytes(artifact, { ...source, container: changedContainer }, sha256),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.digest-mismatch"
      && error.path === "/payload/provenance/source/content/digest"
    ),
  );

  await assert.rejects(
    verifyLevelFactsSourceBytes(artifact, { ...source, members: [source.members[0]] }, sha256),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path === "/payload/provenance/occurrence/members"
    ),
  );

  const changedMember = new Uint8Array(source.members[0]);
  changedMember[0] ^= 1;
  await assert.rejects(
    verifyLevelFactsSourceBytes(
      artifact,
      { ...source, members: [changedMember, source.members[1]] },
      sha256,
    ),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.digest-mismatch"
      && error.path === "/payload/provenance/occurrence/members/0/content/digest"
    ),
  );

  await assert.rejects(
    verifyLevelFactsSourceBytes(
      artifact,
      { ...source, normalizedMap: canonicalizeJson({ fixture: "normalized-mop" }) },
      sha256,
    ),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.digest-mismatch"
      && error.path === "/payload/provenance/normalizedMap/content/digest"
    ),
  );

  await assert.rejects(
    verifyLevelFactsSourceBytes(
      artifact,
      { ...source, normalizedMap: canonicalizeJson({ fixture: "longer-normalized-map" }) },
      sha256,
    ),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path === "/payload/provenance/normalizedMap/content/byteLength"
    ),
  );
});

test("rejects an occurrence member that is not a source-container span", async () => {
  const { artifact, source } = await verifiableFixtureBundle();
  const foreignMember = new TextEncoder().encode("foreign-member-data");
  artifact.payload.provenance.occurrence.members[0].content = await referenceSourceBytes(
    foreignMember,
    sha256,
  );
  const verifiedShape = decodeCanonicalArtifact(canonicalizeJson(artifact));

  await assert.rejects(
    verifyLevelFactsSourceBytes(
      verifiedShape,
      { ...source, members: [foreignMember, source.members[1]] },
      sha256,
    ),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path === "/payload/provenance/occurrence/members/0/content"
    ),
  );
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ArtifactProtocolError,
  decodeCanonicalArtifact,
  encodeArtifact,
  identifyCanonicalJson,
  identifyStaticWiring,
  verifyLevelFactsIdentities,
} from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(workspaceRoot, "fixtures/conformance/v1");
const sha256 = new WebCryptoSha256();

async function readFixture(path) {
  return readFile(resolve(fixtureRoot, path), "utf8");
}

async function validLevelFacts() {
  return decodeCanonicalArtifact(await readFixture("valid/level-facts.v1.json"));
}

test("round-trips and verifies every derived identity in synthetic level facts", async () => {
  const source = await readFixture("valid/level-facts.v1.json");
  const artifact = decodeCanonicalArtifact(source);

  assert.equal(artifact.artifactType, "level-facts");
  assert.equal(encodeArtifact(artifact), source);
  assert.deepEqual(artifact.payload.geometry, { depth: 2, height: 2, width: 4 });
  assert.deepEqual(
    [...new Set(artifact.payload.placements.map((entry) => entry.descriptor.coordinate.z))],
    [0, 1],
  );
  assert.deepEqual(artifact.payload.provenance.occurrence.members.map((entry) => entry.z), [0, 1]);
  await verifyLevelFactsIdentities(artifact, sha256);
  assert.match(await identifyCanonicalJson(source, sha256), /^sha256:[0-9a-f]{64}$/u);
});

test("accepts exactly 65,536 logical cells without materializing every cell", async () => {
  const artifact = await validLevelFacts();
  artifact.payload.geometry = { depth: 1, height: 1, width: 65_536 };
  artifact.payload.provenance.occurrence.members = artifact.payload.provenance.occurrence.members
    .filter((member) => member.z === 0);
  for (const key of [
    "placements", "actors", "requiredCollectibles", "resourceSources", "resourceGates",
    "exits", "wiring", "transports", "forcedSurfaces", "hazards", "unknowns",
  ]) {
    artifact.payload[key] = [];
  }

  const decoded = decodeCanonicalArtifact(canonicalizeJson(artifact));
  assert.equal(decoded.artifactType, "level-facts");
});

test("rejects a geometry larger than 65,536 logical cells", async () => {
  const artifact = await validLevelFacts();
  artifact.payload.geometry = { depth: 1, height: 256, width: 257 };

  assert.throws(
    () => decodeCanonicalArtifact(canonicalizeJson(artifact)),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invariant-invalid"
      && error.path === "/payload/geometry"
    ),
  );
});

test("rejects tampered placement, actor, and wiring identities", async () => {
  for (const fixture of [
    { collection: "placements", key: "placementId", path: "/payload/placements/0/placementId" },
    { collection: "actors", key: "actorId", path: "/payload/actors/0/actorId" },
    { collection: "wiring", key: "wiringId", path: "/payload/wiring/0/wiringId" },
  ]) {
    let artifact = await validLevelFacts();
    const current = artifact.payload[fixture.collection][0][fixture.key];
    const tampered = current.replace(/[0-9a-f]$/u, (value) => value === "0" ? "1" : "0");
    if (fixture.collection === "placements") {
      artifact = JSON.parse(JSON.stringify(artifact).replaceAll(current, tampered));
    } else {
      artifact.payload[fixture.collection][0][fixture.key] = tampered;
    }

    await assert.rejects(
      verifyLevelFactsIdentities(artifact, sha256),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === "artifact.digest-mismatch"
        && error.path === fixture.path
      ),
      fixture.path,
    );
  }
});

test("derives a stable static wiring identity from endpoint placements", async () => {
  const artifact = await validLevelFacts();
  const wiring = artifact.payload.wiring[0];
  assert.equal(await identifyStaticWiring(wiring.descriptor, sha256), wiring.wiringId);

  const reordered = structuredClone(wiring.descriptor);
  reordered.sourceOrder += 1;
  assert.notEqual(await identifyStaticWiring(reordered, sha256), wiring.wiringId);
});

test("preserves sparse declaration order and rejects duplicates within a wiring kind", async () => {
  const sparse = await validLevelFacts();
  for (const wiring of sparse.payload.wiring) {
    wiring.descriptor.sourceOrder = 17;
  }
  assert.equal(decodeCanonicalArtifact(canonicalizeJson(sparse)).artifactType, "level-facts");

  const duplicate = await validLevelFacts();
  duplicate.payload.wiring[1].descriptor.kind = duplicate.payload.wiring[0].descriptor.kind;
  duplicate.payload.wiring[1].descriptor.sourceOrder = duplicate.payload.wiring[0].descriptor.sourceOrder;
  assert.throws(
    () => decodeCanonicalArtifact(canonicalizeJson(duplicate)),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invariant-invalid"
      && error.path === "/payload/wiring/1/descriptor/sourceOrder"
    ),
  );
});

test("preserves explicit unknown catalog semantics", async () => {
  const artifact = await validLevelFacts();
  const unknownPlacement = artifact.payload.placements.find((entry) => entry.interpretation === "unknown");

  assert.equal(unknownPlacement.sourceElement.elementToken, "0xff");
  assert.equal(artifact.payload.unknowns[0].kind, "unknown-catalog-element");
  assert.deepEqual(decodeCanonicalArtifact(encodeArtifact(artifact)), artifact);
});

test("requires exactly one source-matching uncertainty for every unknown placement", async () => {
  const missing = await validLevelFacts();
  missing.payload.unknowns = [];
  assert.throws(
    () => decodeCanonicalArtifact(canonicalizeJson(missing)),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invariant-invalid"
      && error.path === "/payload/unknowns"
    ),
  );

  const mismatched = await validLevelFacts();
  mismatched.payload.unknowns[0].sourceToken = "a-different-source-token";
  assert.throws(
    () => decodeCanonicalArtifact(canonicalizeJson(mismatched)),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invariant-invalid"
      && error.path === "/payload/unknowns/0/sourceToken"
    ),
  );
});

test("bounds uncertainty coordinates by level geometry", async () => {
  const artifact = await validLevelFacts();
  artifact.payload.unknowns.push({
    unknownId: "unknown-9999",
    kind: "invalid-source-condition",
    coordinates: [{ x: artifact.payload.geometry.width, y: 0, z: 0 }],
    reason: "Synthetic out-of-bounds diagnostic.",
  });

  assert.throws(
    () => decodeCanonicalArtifact(canonicalizeJson(artifact)),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invariant-invalid"
      && error.path === "/payload/unknowns/1/coordinates/0/x"
    ),
  );
});

test("rejects absolute and traversing repository source paths", async () => {
  for (const path of ["/Users/example/level.dat", "data/../private.dat", "C:\\levels\\one.dat"]) {
    const artifact = await validLevelFacts();
    artifact.payload.provenance.source.origin = {
      kind: "repository",
      repository: "fixture-repository",
      revision: "fixture-revision",
      path,
    };
    assert.throws(
      () => decodeCanonicalArtifact(canonicalizeJson(artifact)),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === "artifact.schema-invalid"
        && error.path === "/payload/provenance/source/origin/path"
      ),
      path,
    );
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  ArtifactProtocolError,
  decodeCanonicalArtifact,
  encodeArtifact,
  identifyActor,
  identifyCanonicalJson,
  identifyStaticPlacement,
  verifyCertificateBundle,
  verifyCorpusSuccessor,
} from "@tworld/ccsolver/application";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import { canonicalizeJson } from "@tworld/ccsolver/domain";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(workspaceRoot, "fixtures/conformance/v1");
const sha256 = new WebCryptoSha256();

async function readText(relativePath) {
  return readFile(resolve(fixtureRoot, relativePath), "utf8");
}

async function readJson(relativePath) {
  return JSON.parse(await readText(relativePath));
}

async function makeSuccessor(previous) {
  const current = structuredClone(previous);
  current.payload.previous = {
    protocolVersion: 1,
    artifactType: "corpus-case",
    schemaVersion: 1,
    digest: await identifyCanonicalJson(encodeArtifact(previous), sha256),
  };
  current.payload.producerRevision = "git:successor-fixture";
  return current;
}

test("round-trips and identifies every valid canonical artifact", async () => {
  const manifest = await readJson("manifest.json");

  for (const fixture of manifest.validArtifacts) {
    const source = await readText(fixture.path);
    const decoded = decodeCanonicalArtifact(source);
    assert.equal(decoded.artifactType, fixture.artifactType);
    assert.equal(encodeArtifact(decoded), source);
    assert.equal(await identifyCanonicalJson(source, sha256), fixture.expectedArtifactId);
  }
});

test("reports stable error codes and JSON Pointer paths for invalid artifacts", async () => {
  const manifest = await readJson("manifest.json");

  for (const fixture of manifest.invalidArtifacts) {
    const source = await readText(fixture.path);
    assert.throws(
      () => decodeCanonicalArtifact(source),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === fixture.expectedCode
        && error.path === fixture.expectedPath
      ),
      fixture.path,
    );
  }
});

test("dispatches malformed and unsupported envelopes with stable errors", async () => {
  const certificate = await readJson("valid/replay-certificate.v1.json");
  const cases = [
    {
      source: "{",
      code: "artifact.invalid-json",
      path: "",
    },
    {
      mutate(value) { value.protocol = "different-protocol"; },
      code: "artifact.unsupported-protocol",
      path: "/protocol",
    },
    {
      mutate(value) { value.protocolVersion = 2; },
      code: "artifact.unsupported-protocol-version",
      path: "/protocolVersion",
    },
    {
      mutate(value) { value.artifactType = "unknown-artifact"; },
      code: "artifact.unknown-artifact-type",
      path: "/artifactType",
    },
  ];

  for (const fixture of cases) {
    const value = structuredClone(certificate);
    fixture.mutate?.(value);
    const source = fixture.source ?? canonicalizeJson(value);
    assert.throws(
      () => decodeCanonicalArtifact(source),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === fixture.code
        && error.path === fixture.path
      ),
      fixture.code,
    );
  }
});

test("links a certified attempt to its independently content-addressed certificate", async () => {
  const corpus = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const certificate = decodeCanonicalArtifact(await readText("valid/replay-certificate.v1.json"));

  await verifyCertificateBundle(corpus, certificate, sha256);

  const mismatchedCertificate = structuredClone(certificate);
  mismatchedCertificate.payload.target = "lynx";
  await assert.rejects(
    verifyCertificateBundle(corpus, mismatchedCertificate, sha256),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path === "/payload/target"
    ),
  );

  const alteredCertificate = structuredClone(certificate);
  alteredCertificate.payload.verifications.typescript.toolRevision = "fixture-typescript:v2";
  await assert.rejects(
    verifyCertificateBundle(corpus, alteredCertificate, sha256),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path ===
        "/payload/targets/0/attempts/0/result/certificate/digest"
    ),
  );
});

test("round-trips structured plan references without freezing the future plan payload", async () => {
  const corpus = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const lynxAttempt = corpus.payload.targets[1].attempts[0];
  lynxAttempt.context.donorExposure = "terminal-only";
  lynxAttempt.plan = {
    artifact: {
      protocolVersion: 1,
      artifactType: "expanded-plan",
      schemaVersion: 1,
      digest: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
    },
    goalId: "reach-exit",
    subgoalId: null,
  };

  const encoded = encodeArtifact(corpus);
  assert.deepEqual(decodeCanonicalArtifact(encoded), corpus);
});

test("rejects constructed accessors without evaluating them", async () => {
  const certificate = decodeCanonicalArtifact(await readText("valid/replay-certificate.v1.json"));
  let evaluated = false;
  Object.defineProperty(certificate.payload, "caseId", {
    enumerable: true,
    get() {
      evaluated = true;
      return "case-cclp1-001";
    },
  });

  assert.throws(
    () => encodeArtifact(certificate),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invalid-json-value"
      && error.path === "/payload/caseId"
    ),
  );
  assert.equal(evaluated, false);
});

test("allows target-local attempt IDs while certificates remain target-qualified", async () => {
  const corpus = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const certificate = decodeCanonicalArtifact(await readText("valid/replay-certificate.v1.json"));
  const lynxTarget = corpus.payload.targets[1];
  lynxTarget.attempts[0].attemptId = certificate.payload.attemptId;
  lynxTarget.state.attemptId = certificate.payload.attemptId;

  await verifyCertificateBundle(corpus, certificate, sha256);
});

test("enforces append-only attempt history across corpus successors", async () => {
  const previous = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const current = await makeSuccessor(previous);

  await verifyCorpusSuccessor(previous, current, sha256);

  current.payload.targets[1].attempts[0].result.nextAction = "Rewrite old evidence.";
  await assert.rejects(
    verifyCorpusSuccessor(previous, current, sha256),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.bundle-mismatch"
      && error.path === "/payload/targets/1/attempts/0"
    ),
  );
});

test("rejects corpus successor lineage, identity, and retention mismatches", async () => {
  const previous = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const cases = [
    {
      path: "/payload/previous/digest",
      mutate(current) {
        current.payload.previous.digest =
          "sha256:0000000000000000000000000000000000000000000000000000000000000000";
      },
    },
    {
      path: "/payload/caseId",
      mutate(current) {
        current.payload.caseId = "case-replacement";
      },
    },
    {
      path: "/payload/level",
      mutate(current) {
        current.payload.level.normalizationProfile = "different-profile";
      },
    },
    {
      path: "/payload/targets",
      mutate(current) {
        current.payload.targets = current.payload.targets.slice(0, 1);
      },
    },
    {
      path: "/payload/targets/1/attempts",
      mutate(current) {
        current.payload.targets[1].attempts = [];
        current.payload.targets[1].state = { status: "ready" };
      },
    },
  ];

  for (const fixture of cases) {
    const current = await makeSuccessor(previous);
    fixture.mutate(current);
    await assert.rejects(
      verifyCorpusSuccessor(previous, current, sha256),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === "artifact.bundle-mismatch"
        && error.path === fixture.path
      ),
      fixture.path,
    );
  }
});

test("pins schema versions for references to v1 corpus cases and certificates", async () => {
  const corpus = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  corpus.payload.targets[0].attempts[0].result.certificate.schemaVersion = 2;

  assert.throws(
    () => encodeArtifact(corpus),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.schema-invalid"
      && error.path === "/payload/targets/0/attempts/0/result/certificate/schemaVersion"
    ),
  );
});

test("measures durable text limits in Unicode scalar values", async () => {
  const corpus = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const result = corpus.payload.targets[1].attempts[0].result;
  result.nextAction = "😀".repeat(2048);
  assert.equal(decodeCanonicalArtifact(encodeArtifact(corpus)).artifactType, "corpus-case");

  result.nextAction += "😀";
  assert.throws(
    () => encodeArtifact(corpus),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.schema-invalid"
      && error.path === "/payload/targets/1/attempts/0/result/nextAction"
    ),
  );
});

test("orders set-like references by numeric schema version", async () => {
  const corpus = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const result = corpus.payload.targets[1].attempts[0].result;
  const version2 = {
    protocolVersion: 1,
    artifactType: "trace",
    schemaVersion: 2,
    digest: "sha256:0000000000000000000000000000000000000000000000000000000000000002",
  };
  const version10 = {
    protocolVersion: 1,
    artifactType: "trace",
    schemaVersion: 10,
    digest: "sha256:0000000000000000000000000000000000000000000000000000000000000010",
  };
  result.evidence = [version2, version10];
  assert.equal(decodeCanonicalArtifact(encodeArtifact(corpus)).artifactType, "corpus-case");

  result.evidence = [version10, version2];
  assert.throws(
    () => encodeArtifact(corpus),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.invariant-invalid"
      && error.path === "/payload/targets/1/attempts/0/result/evidence/1"
    ),
  );
});

test("accepts every target-state branch with its required attempt result", async () => {
  const source = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const certified = structuredClone(source.payload.targets[0].attempts[0]);
  const failed = structuredClone(source.payload.targets[1].attempts[0]);
  certified.attemptId = "attempt-1";
  failed.attemptId = "attempt-1";
  const candidate = structuredClone(certified);
  candidate.result = {
    kind: "candidate-generated",
    replay: structuredClone(certified.result.replay),
  };
  const evidence = {
    protocolVersion: 1,
    artifactType: "level-facts",
    schemaVersion: 1,
    digest: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
  };
  const cases = [
    { attempts: [], state: { status: "awaiting-import" } },
    {
      attempts: [],
      state: { status: "import-blocked", reason: "Synthetic import failure.", evidence: [] },
    },
    { attempts: [], state: { status: "ready" } },
    { attempts: [], state: { status: "analyzed", levelFacts: evidence } },
    {
      attempts: [candidate],
      state: { status: "candidate-generated", attemptId: "attempt-1" },
    },
    {
      attempts: [failed],
      state: { status: "needs-local-repair", attemptId: "attempt-1" },
    },
    {
      attempts: [failed],
      state: { status: "needs-route-replan", attemptId: "attempt-1" },
    },
    {
      attempts: [certified],
      state: { status: "solved-current", attemptId: "attempt-1" },
    },
    {
      attempts: [certified],
      state: {
        status: "needs-reverify",
        attemptId: "attempt-1",
        reason: "Synthetic engine revision changed.",
      },
    },
    {
      attempts: [],
      state: {
        status: "excluded-reviewed",
        reason: "Synthetic reviewed exclusion.",
        evidence: [],
        reviewRevision: "fixture-review:v1",
      },
    },
  ];

  for (const targetCase of cases) {
    const corpus = structuredClone(source);
    corpus.payload.targets = [{
      target: "lynx",
      attempts: structuredClone(targetCase.attempts),
      state: structuredClone(targetCase.state),
    }];
    assert.equal(decodeCanonicalArtifact(encodeArtifact(corpus)).artifactType, "corpus-case");
  }
});

test("rejects target states that point to the wrong attempt result kind", async () => {
  const source = decodeCanonicalArtifact(await readText("valid/corpus-case.v1.json"));
  const certified = structuredClone(source.payload.targets[0].attempts[0]);
  const failed = structuredClone(source.payload.targets[1].attempts[0]);
  certified.attemptId = "attempt-1";
  failed.attemptId = "attempt-1";
  const candidate = structuredClone(certified);
  candidate.result = {
    kind: "candidate-generated",
    replay: structuredClone(certified.result.replay),
  };
  const cases = [
    { attempt: failed, status: "candidate-generated" },
    { attempt: candidate, status: "needs-local-repair" },
    { attempt: failed, status: "solved-current" },
  ];

  for (const targetCase of cases) {
    const corpus = structuredClone(source);
    corpus.payload.targets = [{
      target: "lynx",
      attempts: [structuredClone(targetCase.attempt)],
      state: { status: targetCase.status, attemptId: "attempt-1" },
    }];
    assert.throws(
      () => encodeArtifact(corpus),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === "artifact.invariant-invalid"
        && error.path === "/payload/targets/0/state/attemptId"
      ),
      targetCase.status,
    );
  }
});

test("derives stable placement and actor identities from versioned descriptors", async () => {
  const fixture = await readJson("valid/identity-primitives.v1.json");

  assert.equal(
    await identifyStaticPlacement(fixture.placement.descriptor, sha256),
    fixture.placement.expectedId,
  );
  assert.equal(
    await identifyActor(fixture.initialActor.descriptor, sha256),
    fixture.initialActor.expectedId,
  );
  assert.equal(
    await identifyActor(fixture.cloneActor.descriptor, sha256),
    fixture.cloneActor.expectedId,
  );
});

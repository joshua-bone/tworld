import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { WebCryptoSha256 } from "@tworld/ccsolver/adapters/web-crypto";
import {
  ArtifactProtocolError,
  decodeCanonicalArtifact,
  encodeArtifact,
  identifyCanonicalJson,
  verifyCertificateBundle,
} from "@tworld/ccsolver/application";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureRoot = resolve(workspaceRoot, "fixtures/conformance/v1/valid");
const sha256 = new WebCryptoSha256();

function expandedPlanArtifact() {
  return {
    protocol: "ccsolver-artifact",
    protocolVersion: 1,
    artifactType: "expanded-plan",
    schemaVersion: 1,
    payload: {
      producerRevision: "fixture-producer:expanded-plan-v1",
      caseId: "fixture-case-001",
      level: {
        occurrenceId: "fixture-level-001",
        normalizationProfile: "fixture-map-v1",
        normalizedGameplayDigest:
          "sha256:9e316287ad4023cac9a531dece1e23cc8d2bc5b8b5c3042b71ce41fb3709487a",
      },
      target: "ms",
      planId: "plan:0:0",
      rootId: "root:0",
      goalId: "goal:17",
      exitId: "placement:sha256:d383dda76f9ee238c0b972626e9be47bae95a383dc2afb9a520373548faf5879",
      status: "candidate",
      document: {
        format: "terminal-first-planning-document-v1",
        content: {
          digest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          byteLength: 4096,
        },
      },
      selectedImplementation: {
        format: "tile-route-v1",
        content: {
          digest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          byteLength: 2048,
        },
      },
      lineage: [
        {
          protocolVersion: 1,
          artifactType: "level-facts",
          schemaVersion: 1,
          digest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
        },
        {
          protocolVersion: 1,
          artifactType: "static-analysis",
          schemaVersion: 1,
          digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
        },
      ],
    },
  };
}

async function readValid(name) {
  return JSON.parse(await readFile(resolve(fixtureRoot, name), "utf8"));
}

test("round-trips a closed content-addressable expanded-plan root artifact", async () => {
  const artifact = expandedPlanArtifact();
  const canonical = encodeArtifact(artifact);
  const decoded = decodeCanonicalArtifact(canonical);

  assert.deepEqual(decoded, artifact);
  assert.equal(decoded.artifactType, "expanded-plan");
  assert.match(await identifyCanonicalJson(canonical, sha256), /^sha256:[0-9a-f]{64}$/u);
});

test("accepts an unresolved plan without a selected implementation", () => {
  const artifact = expandedPlanArtifact();
  artifact.payload.status = "unresolved";
  artifact.payload.selectedImplementation = null;

  assert.deepEqual(decodeCanonicalArtifact(encodeArtifact(artifact)), artifact);
});

test("reports exact paths for expanded-plan field, target, and lineage failures", () => {
  const cases = [
    {
      path: "/payload/extra",
      mutate(artifact) { artifact.payload.extra = true; },
    },
    {
      path: "/payload/target",
      mutate(artifact) { artifact.payload.target = "hybrid"; },
    },
    {
      path: "/payload/lineage/1",
      code: "artifact.invariant-invalid",
      mutate(artifact) { artifact.payload.lineage.reverse(); },
    },
  ];

  for (const fixture of cases) {
    const artifact = expandedPlanArtifact();
    fixture.mutate(artifact);
    assert.throws(
      () => encodeArtifact(artifact),
      (error) => (
        error instanceof ArtifactProtocolError
        && error.code === (fixture.code ?? "artifact.schema-invalid")
        && error.path === fixture.path
      ),
      fixture.path,
    );
  }
});

test("binds an expanded-plan reference through the existing corpus/certificate bundle", async () => {
  const artifact = expandedPlanArtifact();
  const planDigest = await identifyCanonicalJson(encodeArtifact(artifact), sha256);
  const plan = {
    artifact: {
      protocolVersion: 1,
      artifactType: "expanded-plan",
      schemaVersion: 1,
      digest: planDigest,
    },
    goalId: artifact.payload.goalId,
    subgoalId: null,
  };
  const corpus = await readValid("corpus-case.v1.json");
  const certificate = await readValid("replay-certificate.v1.json");
  corpus.payload.targets[0].attempts[0].plan = structuredClone(plan);
  certificate.payload.plan = structuredClone(plan);
  corpus.payload.targets[0].attempts[0].result.certificate.digest =
    await identifyCanonicalJson(encodeArtifact(certificate), sha256);

  await verifyCertificateBundle(corpus, certificate, sha256);
  assert.deepEqual(
    decodeCanonicalArtifact(encodeArtifact(certificate)).payload.plan,
    plan,
  );
});

test("pins expanded-plan references to the now-defined schema version 1", async () => {
  const corpus = await readValid("corpus-case.v1.json");
  corpus.payload.targets[1].attempts[0].plan = {
    artifact: {
      protocolVersion: 1,
      artifactType: "expanded-plan",
      schemaVersion: 2,
      digest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
    },
    goalId: "goal:17",
    subgoalId: null,
  };

  assert.throws(
    () => encodeArtifact(corpus),
    (error) => (
      error instanceof ArtifactProtocolError
      && error.code === "artifact.schema-invalid"
      && error.path === "/payload/targets/1/attempts/0/plan/artifact/schemaVersion"
    ),
  );
});

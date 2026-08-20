import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import test from "node:test";
import {
  buildP1bSemanticProducerBinding,
  canonicalTransportJson,
  forwardP1bReconstructedShard,
  validateP1bDownloadedArtifactTree,
} from "../scripts/ci/p1b-shards.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");

function reference(text) {
  return {
    digest: `sha256:${createHash("sha256").update(text).digest("hex")}`,
    byteLength: Buffer.byteLength(text),
  };
}

function fixturePlan(head) {
  const producer = {
    content: { digest: `sha256:${"1".repeat(64)}`, byteLength: 1 },
    fileCount: 1,
  };
  const measurement = {
    corpusRevision: "fixture-corpus",
    artifactRepositoryId: "tworld",
    analysisRevisions: {
      artifactProducerRevision: "fixture-artifact",
      importProfileRevision: "fixture-import",
      factsAnalyzerRevision: "fixture-facts",
      staticAnalyzerRevision: "fixture-static",
      catalogRevision: "fixture-catalog",
      msAdapterRevision: "fixture-ms",
      lynxAdapterRevision: "fixture-lynx",
      msPolicyRevision: "fixture-ms-policy",
      lynxPolicyRevision: "fixture-lynx-policy",
    },
  };
  const requests = Array.from({ length: 8 }, (_, shardIndex) => {
    const request = {
      artifact: "ccsolver-p1b-distributed-measurement-request",
      version: 1,
      partition: {
        identity: "sorted-occurrence-contiguous-balanced-v1",
        requestedShardCount: 8,
        shardCount: 8,
        shardIndex,
        startOccurrenceIndex: shardIndex,
        endOccurrenceIndex: shardIndex + 1,
      },
      producer,
      validityPolicyRevision: "fixture-validity",
      measurement,
      occurrences: [{ occurrenceId: `fixture/${shardIndex}` }],
    };
    const canonical = canonicalTransportJson(request);
    const requestReference = reference(canonical);
    const shardId = `0${shardIndex}-${requestReference.digest.slice("sha256:".length)}`;
    return {
      request,
      canonical,
      descriptor: {
        shardId,
        shardIndex,
        startOccurrenceIndex: shardIndex,
        endOccurrenceIndex: shardIndex + 1,
        occurrenceIds: [`fixture/${shardIndex}`],
        request: requestReference,
        requestPath: `requests/${shardId}.request.json`,
        resultPath: `${shardId}/${shardId}.result.json`,
      },
    };
  });
  const partition = {
    identity: "sorted-occurrence-contiguous-balanced-v1",
    requestedShardCount: 8,
    shardCount: 8,
    occurrenceCount: 8,
  };
  const validity = { digest: `sha256:${"2".repeat(64)}`, byteLength: 2 };
  const validityPolicyRevision = "fixture-validity";
  const plan = reference(canonicalTransportJson({
    measurement,
    partition,
    producer,
    shards: requests.map((entry) => entry.descriptor),
    validity,
    validityPolicyRevision,
  }));
  const context = {
    repository: "joshua-bone/tworld",
    headRevision: head,
    runId: "123",
    runAttempt: 1,
  };
  const manifest = {
    artifact: "ccsolver-p1b-distributed-measurement-manifest",
    version: 1,
    context,
    proof: {
      proofId: "p1b",
      producerContract: { digest: `sha256:${"3".repeat(64)}`, byteLength: 3 },
      spec: { digest: `sha256:${"4".repeat(64)}`, byteLength: 4 },
      inputs: { digest: `sha256:${"5".repeat(64)}`, byteLength: 5 },
    },
    producer,
    validity,
    validityPolicyRevision,
    measurement,
    partition,
    plan,
    shards: requests.map((entry) => entry.descriptor),
  };
  const manifestCanonical = canonicalTransportJson(manifest);
  return { context, manifest, manifestCanonical, requests };
}

test("semantic producer hashing binds the injected WebCrypto adapter bytes", async () => {
  const current = await buildP1bSemanticProducerBinding({ root: repositoryRoot });
  assert.ok(current.paths.includes("ccsolver/src/adapters/web-crypto/index.ts"));

  const root = await mkdtemp(join(await realpath(tmpdir()), "tworld-p1b-semantic-"));
  try {
    const entry = "web/src/ccsolver-runtime/compose/p1b-curriculum/measureP1bShardCases.ts";
    const adapter = "ccsolver/src/adapters/web-crypto/index.ts";
    await mkdir(join(root, "web/src/ccsolver-runtime/compose/p1b-curriculum"), { recursive: true });
    await mkdir(join(root, "ccsolver/src/adapters/web-crypto"), { recursive: true });
    await writeFile(join(root, entry), "export const measure = 1;\n");
    await writeFile(join(root, adapter), "export const hash = 1;\n");
    const before = await buildP1bSemanticProducerBinding({
      root,
      entryPaths: [entry],
      controlPaths: [adapter],
    });
    await writeFile(join(root, adapter), "export const hash = 2;\n");
    const after = await buildP1bSemanticProducerBinding({
      root,
      entryPaths: [entry],
      controlPaths: [adapter],
    });
    assert.notEqual(after.content.digest, before.content.digest);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("forward validates and copies one exact reconstructed result without dependencies", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const fixture = fixturePlan(head);
  const target = fixture.requests[0];
  const cases = [{ occurrenceId: "fixture/0" }];
  const result = {
    artifact: "ccsolver-p1b-distributed-measurement-result",
    version: 1,
    context: fixture.context,
    manifest: reference(fixture.manifestCanonical),
    plan: fixture.manifest.plan,
    request: target.descriptor.request,
    shardId: target.descriptor.shardId,
    partition: {
      shardCount: 8,
      shardIndex: 0,
      startOccurrenceIndex: 0,
      endOccurrenceIndex: 1,
    },
    casesContent: reference(canonicalTransportJson(cases)),
    cases,
  };
  const root = await mkdtemp(join(await realpath(tmpdir()), "tworld-p1b-forward-"));
  try {
    const manifestPath = join(root, "manifest.json");
    const requestPath = join(root, `${target.descriptor.shardId}.request.json`);
    const reconstructedPath = join(root, "reconstructed.result.json");
    const outputPath = join(root, "out", `${target.descriptor.shardId}.result.json`);
    await writeFile(manifestPath, fixture.manifestCanonical);
    await writeFile(requestPath, target.canonical);
    await writeFile(reconstructedPath, canonicalTransportJson(result));
    await forwardP1bReconstructedShard({
      root: repositoryRoot,
      manifestPath,
      requestPath,
      reconstructedPath,
      outputPath,
    });
    assert.equal(await readFile(outputPath, "utf8"), canonicalTransportJson(result));

    const tampered = structuredClone(result);
    tampered.cases[0].occurrenceId = "fixture/tampered";
    const secondReconstructed = join(root, "tampered.result.json");
    await writeFile(secondReconstructed, canonicalTransportJson(tampered));
    await assert.rejects(forwardP1bReconstructedShard({
      root: repositoryRoot,
      manifestPath,
      requestPath,
      reconstructedPath: secondReconstructed,
      outputPath: join(root, "out", `${fixture.requests[1].descriptor.shardId}.result.json`),
    }), /stale, tampered, or foreign/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("download-tree validation rejects extras and symlinks around the exact eight files", async () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim();
  const fixture = fixturePlan(head);
  const root = await mkdtemp(join(await realpath(tmpdir()), "tworld-p1b-tree-"));
  try {
    const requests = join(root, "requests");
    const results = join(root, "results");
    const manifestPath = join(root, "manifest.json");
    await mkdir(requests);
    await mkdir(results);
    await writeFile(manifestPath, fixture.manifestCanonical);
    for (const entry of fixture.requests) {
      await writeFile(join(requests, basename(entry.descriptor.requestPath)), entry.canonical);
      const directory = join(results, entry.descriptor.shardId);
      await mkdir(directory);
      await writeFile(join(directory, `${entry.descriptor.shardId}.result.json`), "{}");
    }
    await validateP1bDownloadedArtifactTree({
      manifestPath,
      requestsDirectory: requests,
      resultsDirectory: results,
    });

    await writeFile(join(requests, "extra.json"), "{}");
    await assert.rejects(validateP1bDownloadedArtifactTree({
      manifestPath,
      requestsDirectory: requests,
      resultsDirectory: results,
    }), /missing, extra, symlink, or nonregular/);
    await rm(join(requests, "extra.json"));

    const target = join(requests, basename(fixture.requests[0].descriptor.requestPath));
    await rm(target);
    await symlink(join(requests, basename(fixture.requests[1].descriptor.requestPath)), target);
    await assert.rejects(validateP1bDownloadedArtifactTree({
      manifestPath,
      requestsDirectory: requests,
      resultsDirectory: results,
    }), /missing, extra, symlink, or nonregular/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the closed shard-id parser accepts only canonical 00 through 07 prefixes", async () => {
  const source = await readFile(resolve(repositoryRoot, "scripts/ci/p1b-shards.mjs"), "utf8");
  assert.match(source, /const SHARD_ID = \/\^0\[0-7\]-\[0-9a-f\]\{64\}\$\/u;/);
  assert.doesNotMatch(source, /\[0-7\]\[0-7\]/);
});

test("the P1B proof provenance names the distributed fixed-eight producer", async () => {
  const spec = JSON.parse(await readFile(
    resolve(repositoryRoot, "scripts/ci/proof-specs/p1b.json"),
    "utf8",
  ));
  assert.equal(
    spec.producerContract,
    "npm run ccsolver:build && npm run ccsolver:corpus:check:prepared && "
      + "node scripts/ci/p1b-shards.mjs prepare && "
      + "8x(node scripts/ci/p1b-shards.mjs run|forward) && "
      + "node scripts/ci/p1b-shards.mjs finalize --check|fixed8-worker1|"
      + "node22.22.0-npm10.9.4|tworld-ci-p1b-distributed-v1",
  );
});

test("the wrapper launches its TypeScript driver from the web alias context", () => {
  const result = spawnSync(process.execPath, [
    "scripts/ci/p1b-shards.mjs",
    "run",
    "--root",
    ".",
    "--manifest",
    "/private/tmp/tworld-missing-p1b-manifest",
    "--request",
    "/private/tmp/tworld-missing-p1b-request",
    "--output",
    "/private/tmp/tworld-missing-p1b-result",
  ], {
    cwd: repositoryRoot,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /P1B shard manifest is missing/);
  assert.doesNotMatch(result.stderr, /Cannot find (?:package|module) '@content/u);
});

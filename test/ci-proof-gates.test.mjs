import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  PROOF_BINDINGS,
  resolveProofGates,
  workflowOutputs,
} from "../scripts/ci/resolve-proof-gates.mjs";
import {
  NATIVE_CHANGED_WEB_TESTS,
  UNSUPPORTED_CHANGED_WEB_TESTS,
  changedWebTestDisposition,
} from "../scripts/ci/run-changed-web-tests.mjs";
import {
  P7_ACTIVE_PACKS_POLICY_PATH,
  P7_ACTIVE_PACKS_SCHEMA,
  P7_PACK_BINDINGS,
} from "../scripts/ci/p7-active-packs.mjs";
import {
  PROOF_SPEC_SCHEMA,
  buildProofReceipt,
  canonicalJson,
  writeProofReceipt,
} from "../scripts/ci/proof-receipt.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const resolverPath = resolve(repositoryRoot, "scripts/ci/resolve-proof-gates.mjs");

const P1B_OUTPUTS = [
  "ccsolver/corpus/p1b-curriculum.v1.json",
  "ccsolver/corpus/p1b-measured-corpus.v1.json",
  "ccsolver/corpus/p1b-validity-report.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/comparison/static-topology-comparison.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/lynx/dossier-data.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/lynx/level-facts.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/lynx/static-analysis.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/lynx/topology-evidence.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/ms/dossier-data.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/ms/level-facts.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/ms/static-analysis.v1.json",
  "ccsolver/fixtures/golden/p1b/cclp1-001/ms/topology-evidence.v1.json",
];

const P6A_EVIDENCE_OUTPUTS = [
  "ccsolver/fixtures/golden/p6a/cclp1-001/alignment.json",
  "ccsolver/fixtures/golden/p6a/cclp1-001/lynx/causal-journal.json",
  "ccsolver/fixtures/golden/p6a/cclp1-001/ms/causal-journal.json",
  "ccsolver/fixtures/golden/p6a/cclp1-001/portfolio.json",
];

const UNUSED_STATIC_COMPOSERS = [
  "web/src/ccsolver-runtime/compose/buildTworldLynxStaticAnalysis.ts",
  "web/src/ccsolver-runtime/compose/buildTworldLynxTopologyEvidence.ts",
  "web/src/ccsolver-runtime/compose/buildTworldMsStaticAnalysis.ts",
  "web/src/ccsolver-runtime/compose/buildTworldMsTopologyEvidence.ts",
  "web/src/ccsolver-runtime/compose/buildTworldPairedStaticAnalysis.ts",
  "web/src/ccsolver-runtime/compose/projectVerifiedTworldLevelFacts.ts",
];

const PRODUCER_REACHABLE_CONTENT_API_FILES = [
  "web/src/content/api/contentBinary.ts",
  "web/src/content/api/ruleset.ts",
  "web/src/content/api/score.ts",
  "web/src/content/api/series-file.ts",
  "web/src/content/api/seriesConfig.ts",
  "web/src/content/api/seriesDat.ts",
  "web/src/content/api/solution-file.ts",
  "web/src/content/api/solutionDataCodec.ts",
  "web/src/content/api/solutionFileFormat.ts",
];

const EXPECTED_PROOFS = {
  p1b: {
    count: 12,
    manifest: null,
    outputs: P1B_OUTPUTS,
    producer: "npm run ccsolver:build && npm run ccsolver:corpus:check:prepared && node scripts/ci/p1b-shards.mjs prepare && 8x(node scripts/ci/p1b-shards.mjs run|forward) && node scripts/ci/p1b-shards.mjs finalize --check|fixed8-worker1|node22.22.0-npm10.9.4|tworld-ci-p1b-distributed-v1",
  },
  p5: {
    count: 33,
    manifest: "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json",
    root: "ccsolver/fixtures/golden/p5/cclp1-001",
    producer: "npm run ccsolver:build && npm run ccsolver:p5:check:prepared|native-oracle-image=ghcr.io/joshua-bone/tworld-ci@sha256:a760c0b2f6c02bc39dc59c406554317a35918a1059c5e0b9ea77a67849350cf9|node22.22.0-npm10.9.4|tworld-ci-v1",
  },
  p6a: {
    count: 4,
    manifest: null,
    outputs: P6A_EVIDENCE_OUTPUTS,
    producer: "npm run ccsolver:build && npm run ccsolver:p6a:check:prepared|four-engine-evidence-outputs-v1|node22.22.0-npm10.9.4|tworld-ci-v1",
  },
};

function filePaths(scopes) {
  return scopes.filter(({ kind }) => kind === "file").map(({ path }) => path);
}

function treePaths(scopes) {
  return scopes.filter(({ kind }) => kind === "tree").map(({ path }) => path);
}

function treeScopes(scopes) {
  return scopes.filter(({ kind }) => kind === "tree");
}

function assertInactiveProof(proofs, proofId) {
  assert.deepEqual(proofs[proofId], {
    active: false,
    currentValid: true,
    decision: "inactive",
    heavy: false,
    reasons: [{ code: "inactive-pack" }],
    requested: false,
    reuse: false,
  });
}

async function testFilesUnder(treePath) {
  const entries = await readdir(resolve(repositoryRoot, treePath), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".test.ts"))
    .map((entry) => relative(repositoryRoot, resolve(entry.parentPath, entry.name)))
    .sort();
}

async function localModule(importer, request) {
  const base = resolve(dirname(importer), request);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    try {
      await access(candidate);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next deterministic TypeScript resolution candidate.
    }
  }
  return null;
}

const WEB_SOURCE_ALIASES = [
  ["@content/", "web/src/content/"],
  ["@game-core/", "web/src/game-core/"],
  ["@game-runtime/", "web/src/game-runtime/"],
  ["@level-catalog/", "web/src/level-catalog/"],
  ["@oracle-fixtures/", "web/src/oracle-fixtures/"],
  ["@player-web/", "web/src/player-web/"],
  ["@replay-verifier/", "web/src/replay-verifier/"],
  ["@ruleset-lynx/", "web/src/ruleset-lynx/"],
  ["@ruleset-ms/", "web/src/ruleset-ms/"],
  ["@undo-runtime/", "web/src/undo-runtime/"],
];

function valueModuleRequests(source) {
  const requests = new Set();
  const staticStatement = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu;
  for (const match of source.matchAll(staticStatement)) {
    if (!match[1].trimStart().startsWith("type ")) requests.add(match[2]);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/gu)) {
    requests.add(match[1]);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) {
    requests.add(match[1]);
  }
  return [...requests];
}

async function aliasedModule(request) {
  const mapping = WEB_SOURCE_ALIASES.find(([prefix]) => request.startsWith(prefix));
  if (mapping === undefined) return null;
  const [prefix, sourceRoot] = mapping;
  const base = resolve(repositoryRoot, `${sourceRoot}${request.slice(prefix.length)}`);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next deterministic source candidate.
    }
  }
  return null;
}

async function liveWebValueModuleClosure(entries) {
  const seen = new Set();
  const pending = entries.map((path) => resolve(repositoryRoot, path));
  while (pending.length > 0) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const source = await readFile(path, "utf8");
    for (const request of valueModuleRequests(source)) {
      let local = null;
      if (request.startsWith(".")) local = await localModule(path, request);
      else if (WEB_SOURCE_ALIASES.some(([prefix]) => request.startsWith(prefix))) {
        local = await aliasedModule(request);
      }
      if (local !== null) pending.push(local);
      else if (request.startsWith(".") || WEB_SOURCE_ALIASES.some(([prefix]) => request.startsWith(prefix))) {
        assert.fail(`${relative(repositoryRoot, path)} has an unresolved source import: ${request}`);
      }
    }
  }
  return [...seen].map((path) => relative(repositoryRoot, path)).sort();
}

function scopeCoversPath(scope, path) {
  if (scope.kind === "file") return scope.path === path;
  if (path !== scope.path && !path.startsWith(`${scope.path}/`)) return false;
  return !(scope.excludeFileSuffixes ?? []).some((suffix) => path.endsWith(suffix));
}

async function liveCcsolverPackageRoots(entries) {
  const packages = new Set();
  const seen = new Set();
  const pending = entries.map((path) => resolve(repositoryRoot, path));
  while (pending.length > 0) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const source = await readFile(path, "utf8");
    for (const match of source.matchAll(/["']([^"']+)["']/gu)) {
      const request = match[1];
      if (request.startsWith("@tworld/ccsolver/")) {
        const subpath = request.slice("@tworld/ccsolver/".length);
        packages.add(subpath === "adapters/web-crypto"
          ? "ccsolver/src/adapters/web-crypto"
          : `ccsolver/src/${subpath.split("/")[0]}`);
      } else if (request.startsWith(".")) {
        const local = await localModule(path, request);
        if (local !== null) pending.push(local);
      }
    }
  }
  return [...packages].sort();
}

async function localQuotedIncludeClosure(entries) {
  const seen = new Set();
  const pending = [...entries];
  while (pending.length > 0) {
    const path = pending.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    const source = await readFile(resolve(repositoryRoot, path), "utf8");
    for (const match of source.matchAll(/^\s*#\s*include\s*"([^"]+)"/gmu)) {
      const candidates = [
        join(dirname(path), match[1]),
        join("legacy_c", match[1]),
      ];
      let found = null;
      for (const candidate of candidates) {
        try {
          if ((await stat(resolve(repositoryRoot, candidate))).isFile()) {
            found = candidate;
            break;
          }
        } catch {
          // Try the next repository-local include resolution candidate.
        }
      }
      assert.notEqual(found, null, `${path} has an unresolved quoted include: ${match[1]}`);
      pending.push(found);
    }
  }
  return [...seen].sort();
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"));
}

test("proof exclusions stay within fail-closed changed-web-test runner coverage", async () => {
  for (const [proofId, binding] of Object.entries(PROOF_BINDINGS)) {
    const spec = await readJson(binding.specPath);
    for (const scope of treeScopes(spec.inputScopes)) {
      if (scope.path.startsWith("web/src/")) {
        assert.deepEqual(
          scope.excludeFileSuffixes,
          [".test.ts"],
          `${proofId} web tree ${scope.path} must use the closed test-only exclusion`,
        );
        const futureTestProbe = `${scope.path}/proof-receipt-coverage-probe.test.ts`;
        assert.notEqual(
          changedWebTestDisposition(futureTestProbe),
          null,
          `${proofId} tree ${scope.path} can exclude future tests only while the runner covers them`,
        );
        for (const testPath of await testFilesUnder(scope.path)) {
          assert.notEqual(
            changedWebTestDisposition(testPath),
            null,
            `${proofId} excluded a test outside changed-test runner coverage: ${testPath}`,
          );
        }
      } else {
        assert.equal(
          scope.excludeFileSuffixes,
          undefined,
          `${proofId} tree ${scope.path} is outside changed-web-test runner coverage`,
        );
      }
    }
  }
});

test("every P7 proof binds the central activation declaration", async () => {
  for (const proofId of ["p7c", "p7d", "p7e", "p7-presentation"]) {
    const spec = await readJson(PROOF_BINDINGS[proofId].specPath);
    assert.equal(
      filePaths(spec.inputScopes).filter((path) => path === P7_ACTIVE_PACKS_POLICY_PATH).length,
      1,
      proofId,
    );
  }

  const presentation = await readJson(PROOF_BINDINGS["p7-presentation"].specPath);
  assert.deepEqual(
    filePaths(presentation.inputScopes)
      .filter((path) => path.includes("/execution-authorities/")),
    ["ccsolver/fixtures/golden/p7b/execution-authorities/cclp1.json"],
  );
  assert.deepEqual(presentation.outputScopes, [
    {
      kind: "file",
      path: "ccsolver/fixtures/golden/p7b/presentation-authorities/cclp1.json",
    },
    {
      kind: "file",
      path: "ccsolver/fixtures/golden/p7b/shared-player/p7b-replay-player-graph.json",
    },
    {
      kind: "tree",
      path: "ccsolver/fixtures/golden/p7b/training-packs/cclp1",
    },
  ]);
});

test("checked proof specs bind the audited P1B, P5, and P6A leaves", async () => {
  const corpusManifest = await readJson("ccsolver/corpus/manifest.v1.json");
  const manifestSources = [...new Set(corpusManifest.sources.map(({ path }) => path))].sort();

  for (const [proofId, expected] of Object.entries(EXPECTED_PROOFS)) {
    const binding = PROOF_BINDINGS[proofId];
    const spec = await readJson(binding.specPath);
    const receipt = await buildProofReceipt({
      root: repositoryRoot,
      specPath: binding.specPath,
    });
    const checked = await readJson(binding.receiptPath);
    assert.equal(spec.schema, PROOF_SPEC_SCHEMA);
    assert.equal(spec.proofId, proofId);
    assert.equal(spec.producerContract, expected.producer);
    assert.equal(spec.outputManifestPath, expected.manifest);
    assert.equal(receipt.outputs.entries.length, expected.count);
    assert.deepEqual(checked, receipt, `${proofId} receipt must match current inputs and outputs`);
    assert.equal(spec.inputScopes.some(({ path }) => path.startsWith("docs/")), false);
    assert.equal(
      receipt.inputs.entries.some(({ path }) => (
        path.startsWith("web/src/") && path.endsWith(".test.ts")
      )),
      false,
      `${proofId} proof inputs must not include web tests owned by the changed-test runner`,
    );
    if (expected.outputs !== undefined) {
      assert.deepEqual(receipt.outputs.entries.map(({ path }) => path), expected.outputs);
      assert.deepEqual(treePaths(spec.outputScopes), []);
    } else {
      assert.deepEqual(treePaths(spec.outputScopes), [expected.root]);
      assert.equal(receipt.outputs.entries.every(({ path }) => path.startsWith(`${expected.root}/`)), true);
    }
  }

  const p1bSpec = await readJson(PROOF_BINDINGS.p1b.specPath);
  const p1bInputFiles = new Set(filePaths(p1bSpec.inputScopes));
  assert.deepEqual(
    manifestSources.filter((path) => !p1bInputFiles.has(path)),
    [],
    "the combined P1A/P1B receipt must bind every checked corpus source",
  );
  assert.ok(p1bInputFiles.has("ccsolver/corpus/manifest.v1.json"));

  const p5Spec = await readJson(PROOF_BINDINGS.p5.specPath);
  const p5InputTrees = treePaths(p5Spec.inputScopes);
  assert.equal(p5InputTrees.includes("web/src/content"), false);
  assert.deepEqual(
    filePaths(p5Spec.inputScopes).filter((path) => path.startsWith("web/src/content/")),
    PRODUCER_REACHABLE_CONTENT_API_FILES,
  );
  assert.equal(p5InputTrees.includes("ccsolver/fixtures/golden/p3/cclp1-001"), false);
  assert.ok(p5InputTrees.includes("ccsolver/src/events"));
  assert.ok(p5InputTrees.includes("ccsolver/src/plan"));
  assert.ok(filePaths(p5Spec.inputScopes).includes("legacy_c/oracle/oracle_main.cpp"));
  const p5InputFiles = new Set(filePaths(p5Spec.inputScopes));
  assert.deepEqual(
    [...p5InputFiles].filter((path) => path.startsWith("ccsolver/fixtures/golden/p3/cclp1-001/")),
    [
      "ccsolver/fixtures/golden/p3/cclp1-001/lynx/terminal-plan.json",
      "ccsolver/fixtures/golden/p3/cclp1-001/ms/terminal-plan.json",
    ],
  );
  assert.equal(p5InputTrees.includes("web/src/ccsolver-runtime/compose/p3-review"), false);
  assert.ok(p5InputFiles.has("web/src/ccsolver-runtime/compose/p3-review/keyPyramidP3Source.ts"));
  for (const unused of UNUSED_STATIC_COMPOSERS) assert.equal(p5InputFiles.has(unused), false, unused);
  const legacyCmake = await readFile(resolve(repositoryRoot, "legacy_c/CMakeLists.txt"), "utf8");
  const oracleTarget = legacyCmake.match(/add_executable\(tworld-oracle([\s\S]*?)\n\)/u)?.[1];
  assert.ok(oracleTarget, "legacy CMake must declare the native oracle source set");
  const oracleSources = oracleTarget.trim().split(/\s+/u).map((path) => `legacy_c/${path}`);
  assert.deepEqual(
    oracleSources.filter((path) => !p5InputFiles.has(path)),
    [],
    "the P5 receipt must bind every source compiled into the native oracle",
  );
  const oracleSourceClosure = await localQuotedIncludeClosure(oracleSources);
  assert.deepEqual(
    oracleSourceClosure.filter((path) => !p5InputFiles.has(path)),
    [],
    "the P5 receipt must bind every repository-local oracle include",
  );
  const workflow = await readFile(resolve(repositoryRoot, ".github/workflows/ubuntu-ci.yml"), "utf8");
  const nativeImage = workflow.match(/image: (ghcr\.io\/joshua-bone\/tworld-ci@sha256:[0-9a-f]{64})/u)?.[1];
  assert.ok(nativeImage, "Ubuntu CI must use an immutable native-oracle image");
  assert.match(p5Spec.producerContract, new RegExp(`native-oracle-image=${nativeImage}`));

  const p6aSpec = await readJson(PROOF_BINDINGS.p6a.specPath);
  assert.ok(treePaths(p6aSpec.inputScopes).includes("ccsolver/src/plan"));
  const p6aInputs = new Set(filePaths(p6aSpec.inputScopes));
  const p6aInputTrees = treePaths(p6aSpec.inputScopes);
  assert.equal(p6aInputTrees.includes("web/src/content"), false);
  assert.deepEqual(
    [...p6aInputs].filter((path) => path.startsWith("web/src/content/")),
    PRODUCER_REACHABLE_CONTENT_API_FILES,
  );
  assert.equal(p6aInputTrees.includes("web/src/ccsolver-runtime/compose/p3-review"), false);
  assert.equal(p6aInputTrees.includes("web/src/ccsolver-runtime/compose/p5-review"), false);
  for (const path of [
    "web/src/ccsolver-runtime/compose/p3-review/keyPyramidP3Source.ts",
    "web/src/ccsolver-runtime/compose/p5-review/buildKeyPyramidP5Execution.ts",
    "web/src/ccsolver-runtime/compose/p5-review/buildKeyPyramidP5Plan.ts",
  ]) {
    assert.ok(p6aInputs.has(path), path);
  }
  for (const removedTree of [
    "web/src/game-runtime",
    "web/src/level-catalog",
    "web/src/oracle-fixtures",
    "web/src/replay-verifier",
  ]) {
    assert.equal(p6aInputTrees.includes(removedTree), false, removedTree);
  }
  for (const unused of UNUSED_STATIC_COMPOSERS) assert.equal(p6aInputs.has(unused), false, unused);
  const p5Manifest = await readJson("ccsolver/fixtures/golden/p5/cclp1-001/manifest.json");
  const p5RuntimeAuthority = [
    "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json",
    ...p5Manifest.files
      .filter(({ mediaType, path }) => mediaType !== "application/vnd.tworld.tws" && !path.endsWith(".tws"))
      .map(({ path }) => path),
  ].sort();
  assert.deepEqual(p5RuntimeAuthority.filter((path) => !p6aInputs.has(path)), []);
  for (const presentationOnly of [
    "ccsolver/fixtures/golden/p4b/cclp1-001/manifest.json",
    "ccsolver/fixtures/golden/p4b/cclp1-001/review.md",
    "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewIo.ts",
    "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewPage.ts",
  ]) {
    assert.equal(p6aInputs.has(presentationOnly), false, presentationOnly);
  }

  const p7PresentationSpec = await readJson(PROOF_BINDINGS["p7-presentation"].specPath);
  assert.equal(
    treePaths(p7PresentationSpec.inputScopes).includes("web/src/content"),
    true,
    "the presentation proof must continue to bind the full deployable content tree",
  );

  const p6aLeaf = readdir(
    resolve(repositoryRoot, "ccsolver/fixtures/golden/p6a/cclp1-001"),
    { recursive: true, withFileTypes: true },
  );
  const p6aLeafPaths = (await p6aLeaf)
    .filter((entry) => entry.isFile())
    .map((entry) => resolve(entry.parentPath, entry.name))
    .map((path) => path.slice(`${repositoryRoot}/`.length))
    .sort();
  assert.equal(p6aLeafPaths.length, 7, "the cheap presentation attestation owns the exact leaf");
  assert.deepEqual(p6aLeafPaths, [
    ...P6A_EVIDENCE_OUTPUTS,
    "ccsolver/fixtures/golden/p6a/cclp1-001/manifest.json",
    "ccsolver/fixtures/golden/p6a/cclp1-001/review.html",
    "ccsolver/fixtures/golden/p6a/cclp1-001/review.md",
  ].sort());
});

test("proof input scopes cover every live @tworld/ccsolver package import", async () => {
  const entries = {
    p1b: [
      "web/src/ccsolver-runtime/compose/p1a-corpus/runCorpusManifest.ts",
      "web/src/ccsolver-runtime/compose/p1b-curriculum/runP1bCheckedArtifacts.ts",
      "web/src/ccsolver-runtime/compose/p1b-curriculum/runP1bMeasuredShard.ts",
    ],
    p5: ["web/src/ccsolver-runtime/compose/p5-review/runP5ReviewOutputs.ts"],
    p6a: ["web/src/ccsolver-runtime/compose/p6a-review/runP6aReviewOutputs.ts"],
    p7c: ["web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts"],
    p7d: ["web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts"],
    p7e: ["web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts"],
    "p7-presentation": [
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerCli.ts",
      "web/src/bootstrap/browser/main.tsx",
      "web/src/bootstrap/browser/p7bReplayPlayer.tsx",
    ],
  };
  for (const [proofId, roots] of Object.entries(entries)) {
    const spec = await readJson(PROOF_BINDINGS[proofId].specPath);
    const coveredTrees = new Set(treePaths(spec.inputScopes));
    const livePackages = await liveCcsolverPackageRoots(roots);
    assert.deepEqual(
      livePackages.filter((path) => !coveredTrees.has(path)),
      [],
      `${proofId} omitted a live CCSolver package source tree`,
    );
  }
});

test("proof input scopes cover the audited producer value-module closure", async () => {
  const audits = {
    p1b: {
      allowedOmissions: [],
      entries: [
        "web/src/ccsolver-runtime/compose/p1a-corpus/runCorpusManifest.ts",
        "web/src/ccsolver-runtime/compose/p1b-curriculum/runP1bCheckedArtifacts.ts",
        "web/src/ccsolver-runtime/compose/p1b-curriculum/runP1bMeasuredShard.ts",
      ],
    },
    p5: {
      allowedOmissions: [],
      entries: ["web/src/ccsolver-runtime/compose/p5-review/runP5ReviewOutputs.ts"],
    },
    p6a: {
      allowedOmissions: [
        "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewIo.ts",
        "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewPage.ts",
      ],
      entries: ["web/src/ccsolver-runtime/compose/p6a-review/runP6aReviewOutputs.ts"],
    },
    p7c: {
      allowedOmissions: [],
      entries: ["web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts"],
    },
    p7d: {
      allowedOmissions: [],
      entries: ["web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts"],
    },
    p7e: {
      allowedOmissions: [],
      entries: ["web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts"],
    },
    "p7-presentation": {
      allowedOmissions: [],
      entries: [
        "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerCli.ts",
        "web/src/bootstrap/browser/main.tsx",
        "web/src/bootstrap/browser/p7bReplayPlayer.tsx",
      ],
    },
  };
  for (const [proofId, audit] of Object.entries(audits)) {
    const spec = await readJson(PROOF_BINDINGS[proofId].specPath);
    const closure = await liveWebValueModuleClosure(audit.entries);
    assert.deepEqual(
      closure.filter((path) => !spec.inputScopes.some((scope) => scopeCoversPath(scope, path))),
      audit.allowedOmissions,
      `${proofId} omitted a producer-reachable value module`,
    );
    assert.deepEqual(
      closure.filter((path) => path.endsWith(".test.ts")),
      [],
      `${proofId} production closure imported an excluded test module`,
    );
  }
});

async function write(root, path, contents) {
  const absolute = resolve(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}

async function makeResolverFixture(t, { activePacks = ["cclp1"] } = {}) {
  const root = await mkdtemp(join(tmpdir(), "tworld-proof-gates-"));
  const trustedRoot = await mkdtemp(join(tmpdir(), "tworld-proof-trusted-"));
  t.after(() => Promise.all([
    rm(root, { force: true, recursive: true }),
    rm(trustedRoot, { force: true, recursive: true }),
  ]));

  const fixturePaths = {
    p1b: {
      input: "ccsolver/src/analyze/value.ts",
      output: "proof-output/p1b.json",
    },
    p5: {
      input: "web/src/ccsolver-runtime/compose/p5-review/value.ts",
      output: "proof-output/p5.json",
    },
    p6a: {
      input: "ccsolver/src/events/value.ts",
      output: "proof-output/p6a.json",
    },
    p7c: {
      input: "data/CCLP1.dat",
      output: "proof-output/p7c.json",
    },
    p7d: {
      input: "data/CCLP4.dat",
      output: "proof-output/p7d.json",
    },
    p7e: {
      input: "data/CCLP5.dat",
      output: "proof-output/p7e.json",
    },
    "p7-presentation": {
      input: "web/src/ccsolver-runtime/compose/p7b-training-replays/p7bReplayPresentation.ts",
      output: "proof-output/p7-presentation.json",
    },
  };
  const p7SemanticInput = "web/src/game-core/api/p7TrainingBrowserReplay.ts";
  await write(root, P7_ACTIVE_PACKS_POLICY_PATH, canonicalJson({
    activePacks,
    schema: P7_ACTIVE_PACKS_SCHEMA,
  }));
  const activeP7ProofIds = new Set(activePacks.map((packId) => P7_PACK_BINDINGS[packId].proofId));
  await write(root, p7SemanticInput, "P7 semantic browser transport v1\n");
  for (const [proofId, binding] of Object.entries(PROOF_BINDINGS)) {
    const paths = fixturePaths[proofId];
    await write(root, paths.input, `${proofId} input v1\n`);
    await write(root, paths.output, `${proofId} output v1\n`);
    const inputScopes = [
      { kind: "file", path: paths.input },
      ...(["p7c", "p7d", "p7e"].includes(proofId)
        ? [{ kind: "file", path: p7SemanticInput }]
        : []),
      ...(["p7c", "p7d", "p7e", "p7-presentation"].includes(proofId)
        ? [{ kind: "file", path: P7_ACTIVE_PACKS_POLICY_PATH }]
        : []),
    ].sort((left, right) => Buffer.compare(Buffer.from(left.path), Buffer.from(right.path)));
    await write(root, binding.specPath, canonicalJson({
      inputScopes,
      outputManifestPath: null,
      outputScopes: [{ kind: "file", path: paths.output }],
      producerContract: `${proofId}:fixture:v1`,
      proofId,
      schema: PROOF_SPEC_SCHEMA,
    }));
    if (!["p7c", "p7d", "p7e"].includes(proofId) || activeP7ProofIds.has(proofId)) {
      await writeProofReceipt({
        receiptPath: binding.receiptPath,
        root,
        specPath: binding.specPath,
      });
      await write(trustedRoot, binding.receiptPath, "");
      await copyFile(
        resolve(root, binding.receiptPath),
        resolve(trustedRoot, binding.receiptPath),
      );
    }
  }
  return { activeP7ProofIds, fixturePaths, p7SemanticInput, root, trustedRoot };
}

test("combines changed gates with trusted receipts without running unaffected heavy proofs", async (t) => {
  const fixture = await makeResolverFixture(t);
  const docs = await resolveProofGates({
    changedPaths: ["README.md"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(docs.currentReceiptsValid, true);
  assert.equal(docs.gates.workspace, true);
  assert.equal(docs.gates.static_corpus_p1b, false);
  assert.equal(docs.gates.p5, false);
  assert.equal(docs.gates.runtime_p6_evidence, false);
  assert.equal(docs.gates.training_p7c, false);
  assert.equal(docs.gates.training_p7d, false);
  assert.equal(docs.gates.training_p7e, false);
  assert.equal(docs.gates.p7_presentation_attest, false);

  const p1b = PROOF_BINDINGS.p1b;
  await write(fixture.root, fixture.fixturePaths.p1b.input, "p1b input v2\n");
  await writeProofReceipt({ receiptPath: p1b.receiptPath, root: fixture.root, specPath: p1b.specPath });
  const staticChange = await resolveProofGates({
    changedPaths: [fixture.fixturePaths.p1b.input],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(staticChange.proofs.p1b.heavy, true);
  assert.equal(staticChange.allHeavy, false);
  assert.equal(staticChange.proofs.p1b.reuse, false);
  assert.equal(staticChange.proofs.p5.reuse, true);
  assert.equal(staticChange.proofs.p6a.reuse, true);
  assert.equal(staticChange.proofs.p7c.reuse, true);
  assertInactiveProof(staticChange.proofs, "p7d");
  assertInactiveProof(staticChange.proofs, "p7e");
  assert.equal(staticChange.proofs["p7-presentation"].reuse, true);
  assert.equal(staticChange.gates.static_corpus_p1b, true);
  assert.equal(staticChange.gates.p5, true);
  assert.equal(staticChange.proofs.p5.heavy, false);
  assert.equal(staticChange.gates.runtime_p6_evidence, true);
});

test("selects P7 engine work by pack while keeping presentation independently attestable", async (t) => {
  const fixture = await makeResolverFixture(t);
  const p7c = PROOF_BINDINGS.p7c;
  await write(fixture.root, fixture.fixturePaths.p7c.input, "cclp1 source v2\n");
  await writeProofReceipt({
    receiptPath: p7c.receiptPath,
    root: fixture.root,
    specPath: p7c.specPath,
  });
  const engine = await resolveProofGates({
    changedPaths: [fixture.fixturePaths.p7c.input],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(engine.proofs.p7c.heavy, true);
  assertInactiveProof(engine.proofs, "p7d");
  assertInactiveProof(engine.proofs, "p7e");
  assert.equal(engine.gates.p7_presentation_attest, true);
  assert.deepEqual(workflowOutputs(engine).p7_engine_packs_json, '["cclp1"]');
  assert.equal(workflowOutputs(engine).p7_needs_shards, true);
  assert.equal(workflowOutputs(engine).p7_selected, true);

  const presentationFixture = await makeResolverFixture(t);
  const presentationBinding = PROOF_BINDINGS["p7-presentation"];
  await write(
    presentationFixture.root,
    presentationFixture.fixturePaths["p7-presentation"].input,
    "presentation source v2\n",
  );
  await writeProofReceipt({
    receiptPath: presentationBinding.receiptPath,
    root: presentationFixture.root,
    specPath: presentationBinding.specPath,
  });
  const presentation = await resolveProofGates({
    changedPaths: [presentationFixture.fixturePaths["p7-presentation"].input],
    root: presentationFixture.root,
    trustedRoot: presentationFixture.trustedRoot,
  });
  assert.equal(presentation.proofs.p7c.heavy, false);
  assertInactiveProof(presentation.proofs, "p7d");
  assertInactiveProof(presentation.proofs, "p7e");
  assert.equal(presentation.proofs["p7-presentation"].heavy, true);
  assert.equal(workflowOutputs(presentation).p7_engine_packs_json, "[]");
  assert.equal(workflowOutputs(presentation).p7_needs_shards, false);
  assert.equal(workflowOutputs(presentation).attest_p7_presentation, true);
  assert.equal(workflowOutputs(presentation).p7_selected, true);
});

test("a refreshed P7 presentation receipt cannot select Key Pyramid or native proof gates", async (t) => {
  const fixture = await makeResolverFixture(t);
  const binding = PROOF_BINDINGS["p7-presentation"];
  await write(
    fixture.root,
    fixture.fixturePaths["p7-presentation"].input,
    "coherently refreshed presentation source\n",
  );
  await writeProofReceipt({
    receiptPath: binding.receiptPath,
    root: fixture.root,
    specPath: binding.specPath,
  });

  const result = await resolveProofGates({
    changedPaths: [binding.receiptPath],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });

  assert.equal(result.currentReceiptsValid, true);
  assert.equal(result.proofs["p7-presentation"].heavy, true);
  assert.equal(result.proofs["p7-presentation"].reuse, false);
  assert.equal(result.gates.p7_presentation_attest, true);
  assert.equal(result.gates.workspace, true);
  assert.equal(result.gates.browser, true);
  for (const gate of [
    "native_qt",
    "native_sdl_oracle",
    "static_corpus_p1b",
    "p5",
    "runtime_p6_evidence",
    "training_p7c",
    "training_p7d",
    "training_p7e",
  ]) {
    assert.equal(result.gates[gate], false, gate);
  }
  assert.equal(result.proofs.p5.heavy, false);
  assert.equal(result.proofs.p6a.heavy, false);
  assert.equal(result.proofs.p7c.heavy, false);
});

test("keeps presentation DTO drift out of engine receipts but binds browser transport semantics", async (t) => {
  const presentationFixture = await makeResolverFixture(t);
  const presentationBinding = PROOF_BINDINGS["p7-presentation"];
  await write(
    presentationFixture.root,
    presentationFixture.fixturePaths["p7-presentation"].input,
    "presentation DTO v2\n",
  );
  await writeProofReceipt({
    receiptPath: presentationBinding.receiptPath,
    root: presentationFixture.root,
    specPath: presentationBinding.specPath,
  });
  const presentation = await resolveProofGates({
    changedPaths: [presentationFixture.fixturePaths["p7-presentation"].input],
    root: presentationFixture.root,
    trustedRoot: presentationFixture.trustedRoot,
  });
  assert.equal(presentation.proofs.p7c.reuse, true);
  assert.equal(presentation.proofs.p7c.heavy, false);
  assertInactiveProof(presentation.proofs, "p7d");
  assertInactiveProof(presentation.proofs, "p7e");

  const engineFixture = await makeResolverFixture(t);
  await write(engineFixture.root, engineFixture.p7SemanticInput, "browser transport v2\n");
  for (const proofId of ["p7c"]) {
    const binding = PROOF_BINDINGS[proofId];
    await writeProofReceipt({
      receiptPath: binding.receiptPath,
      root: engineFixture.root,
      specPath: binding.specPath,
    });
  }
  const engine = await resolveProofGates({
    changedPaths: [engineFixture.p7SemanticInput],
    root: engineFixture.root,
    trustedRoot: engineFixture.trustedRoot,
  });
  assert.equal(engine.proofs.p7c.reuse, false);
  assert.equal(engine.proofs.p7c.heavy, true);
  assertInactiveProof(engine.proofs, "p7d");
  assertInactiveProof(engine.proofs, "p7e");
});

test("receipt drift independently requests a heavy proof when path routing misses it", async (t) => {
  const fixture = await makeResolverFixture(t);
  const p5 = PROOF_BINDINGS.p5;
  await write(fixture.root, fixture.fixturePaths.p5.input, "coherently changed p5 input\n");
  await writeProofReceipt({ receiptPath: p5.receiptPath, root: fixture.root, specPath: p5.specPath });

  const result = await resolveProofGates({
    changedPaths: ["README.md"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(result.currentReceiptsValid, true);
  assert.equal(result.proofs.p5.requested, true);
  assert.equal(result.proofs.p5.heavy, true);
  assert.equal(result.proofs.p5.reuse, false);
  assert.equal(result.gates.native_sdl_oracle, true);
  assert.equal(result.gates.native_qt, false);
  assert.equal(result.gates.p5, true);
  assert.equal(result.proofs.p1b.reuse, true);
  assert.equal(result.proofs.p6a.reuse, true);
  assert.equal(result.gates.static_corpus_p1b, false);
  assert.equal(result.gates.runtime_p6_evidence, false);
});

test("keeps Qt and SDL frontend proof gates independent", async (t) => {
  const fixture = await makeResolverFixture(t);
  const qt = await resolveProofGates({
    changedPaths: ["legacy_c/oshw-qt/TWMainWnd.cpp"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(qt.gates.native_qt, true);
  assert.equal(qt.gates.native_sdl_oracle, false);
  assert.equal(qt.gates.p5, false);

  const sdl = await resolveProofGates({
    changedPaths: ["legacy_c/oshw-sdl/sdlout.c"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(sdl.gates.native_qt, false);
  assert.equal(sdl.gates.native_sdl_oracle, true);
  assert.equal(sdl.gates.p5, false);
});

test("keeps affected integration lanes selected when their heavy artifact proof is reusable", async (t) => {
  const fixture = await makeResolverFixture(t);

  const workspaceTestPath = "web/src/ruleset-ms/impl/new-regression.test.ts";
  await write(fixture.root, workspaceTestPath, "export {};\n");
  const workspaceTestChange = await resolveProofGates({
    changedPaths: [workspaceTestPath],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.deepEqual(workspaceTestChange.changedTests, {
    native: [],
    p5: [],
    workspace: [workspaceTestPath],
  });
  assert.equal(workspaceTestChange.gates.workspace, true);

  const nativeTestPath = NATIVE_CHANGED_WEB_TESTS[0];
  await write(fixture.root, nativeTestPath, "export {};\n");
  const nativeTestChange = await resolveProofGates({
    changedPaths: [nativeTestPath],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.deepEqual(nativeTestChange.changedTests.native, [nativeTestPath]);
  assert.equal(nativeTestChange.gates.native_sdl_oracle, true);
  assert.equal(nativeTestChange.gates.native_qt, false);

  const staticTestChange = await resolveProofGates({
    changedPaths: ["ccsolver/test/analyze/new-regression.test.ts"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(staticTestChange.gates.static_corpus_p1b, true);
  assert.equal(staticTestChange.proofs.p1b.heavy, false);

  const runtimeTestChange = await resolveProofGates({
    changedPaths: ["ccsolver/test/events/new-regression.test.ts"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(runtimeTestChange.gates.runtime_p6_evidence, true);
  assert.equal(runtimeTestChange.proofs.p6a.heavy, false);

  const p5TestPath = "web/src/ccsolver-runtime/compose/p5-review/buildKeyPyramidP5Execution.test.ts";
  await write(fixture.root, p5TestPath, "export {};\n");
  const p5TestChange = await resolveProofGates({
    changedPaths: [p5TestPath],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(p5TestChange.gates.p5, true);
  assert.equal(p5TestChange.gates.native_sdl_oracle, true);
  assert.equal(p5TestChange.proofs.p5.reuse, true);
  assert.equal(p5TestChange.proofs.p5.heavy, false);
});

test("skips only Git-proven deletions of unsupported changed tests", async (t) => {
  const fixture = await makeResolverFixture(t);
  const path = UNSUPPORTED_CHANGED_WEB_TESTS[0];

  const deleted = await resolveProofGates({
    changedPaths: [path],
    deletedPaths: [path],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.deepEqual(deleted.changedTests, { native: [], p5: [], workspace: [] });
  assert.equal(deleted.gates.workspace, true);

  await write(fixture.root, path, "export {};\n");
  await assert.rejects(
    resolveProofGates({
      changedPaths: [path],
      deletedPaths: [],
      root: fixture.root,
      trustedRoot: fixture.trustedRoot,
    }),
    /unsupported changed web test/u,
  );
});

test("routes P4B literal inputs through cheap P6 presentation trust without rerunning engines", async (t) => {
  const fixture = await makeResolverFixture(t);
  for (const path of [
    "ccsolver/fixtures/golden/p4b/cclp1-001/manifest.json",
    "ccsolver/fixtures/golden/p4b/cclp1-001/review.md",
  ]) {
    const result = await resolveProofGates({
      changedPaths: [path],
      root: fixture.root,
      trustedRoot: fixture.trustedRoot,
    });

    assert.equal(result.gates.p4b, true, path);
    assert.equal(result.gates.p6_presentation_attest, true, path);
    assert.equal(result.gates.runtime_p6_evidence, false, path);
    assert.equal(result.proofs.p6a.reuse, true, path);
    assert.equal(result.proofs.p6a.heavy, false, path);
  }
});

test("activating CCLP4 without its checked receipt fails closed", async (t) => {
  const fixture = await makeResolverFixture(t);
  await write(fixture.root, P7_ACTIVE_PACKS_POLICY_PATH, canonicalJson({
    activePacks: ["cclp1", "cclp4"],
    schema: P7_ACTIVE_PACKS_SCHEMA,
  }));
  for (const proofId of ["p7c", "p7-presentation"]) {
    const binding = PROOF_BINDINGS[proofId];
    await writeProofReceipt({
      receiptPath: binding.receiptPath,
      root: fixture.root,
      specPath: binding.specPath,
    });
    await copyFile(
      resolve(fixture.root, binding.receiptPath),
      resolve(fixture.trustedRoot, binding.receiptPath),
    );
  }

  const activated = await resolveProofGates({
    changedPaths: [P7_ACTIVE_PACKS_POLICY_PATH],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.deepEqual(activated.activeP7Packs, ["cclp1", "cclp4"]);
  assert.deepEqual(activated.activeP7ProofIds, ["p7c", "p7d"]);
  assert.equal(activated.currentReceiptsValid, false);
  assert.equal(activated.allHeavy, true);
  assert.equal(activated.proofs.p7d.active, true);
  assert.equal(activated.proofs.p7d.currentValid, false);
  assert.equal(
    activated.proofs.p7d.reasons.some(({ code }) => code === "current-receipt-missing"),
    true,
  );
  assert.equal(activated.gates.training_p7c, true);
  assert.equal(activated.gates.training_p7d, true);
  assert.equal(activated.gates.training_p7e, false);
  assertInactiveProof(activated.proofs, "p7e");
});

test("fails closed on a stale current receipt and forces all selected proofs on dispatch", async (t) => {
  const fixture = await makeResolverFixture(t);
  await write(fixture.root, fixture.fixturePaths.p5.input, "stale without receipt regeneration\n");
  const stale = await resolveProofGates({
    changedPaths: [fixture.fixturePaths.p5.input],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(stale.currentReceiptsValid, false);
  assert.equal(stale.proofs.p5.currentValid, false);
  assert.equal(stale.gates.p5, true);

  await writeProofReceipt({
    receiptPath: PROOF_BINDINGS.p5.receiptPath,
    root: fixture.root,
    specPath: PROOF_BINDINGS.p5.specPath,
  });
  const dispatch = await resolveProofGates({
    all: true,
    changedPaths: [],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(dispatch.gates.training_p7d, false);
  assert.equal(dispatch.gates.training_p7e, false);
  assert.equal(
    Object.entries(dispatch.gates)
      .filter(([gate]) => !["training_p7d", "training_p7e"].includes(gate))
      .every(([, selected]) => selected),
    true,
  );
  assert.equal(
    Object.values(dispatch.proofs)
      .filter(({ active }) => active)
      .every(({ heavy, reuse }) => heavy && !reuse),
    true,
  );
  assertInactiveProof(dispatch.proofs, "p7d");
  assertInactiveProof(dispatch.proofs, "p7e");
});

test("a malformed known receipt still fails closed globally", async (t) => {
  const fixture = await makeResolverFixture(t);
  const receiptPath = PROOF_BINDINGS["p7-presentation"].receiptPath;
  await write(fixture.root, receiptPath, "{}\n");

  const result = await resolveProofGates({
    changedPaths: [receiptPath],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });

  assert.equal(result.currentReceiptsValid, false);
  assert.equal(result.allHeavy, true);
  assert.equal(result.proofs["p7-presentation"].currentValid, false);
  assert.equal(
    Object.values(result.proofs)
      .filter(({ active }) => active)
      .every(({ heavy, reuse }) => heavy && !reuse),
    true,
  );
  assert.equal(
    Object.entries(result.gates)
      .filter(([gate]) => !["training_p7d", "training_p7e"].includes(gate))
      .every(([, selected]) => selected),
    true,
  );
  assertInactiveProof(result.proofs, "p7d");
  assertInactiveProof(result.proofs, "p7e");
});

test("treats missing trusted receipts and unknown paths as all-heavy, never as cache authority", async (t) => {
  const fixture = await makeResolverFixture(t);
  const noTrusted = await resolveProofGates({
    changedPaths: [fixture.fixturePaths.p6a.input],
    root: fixture.root,
  });
  assert.equal(noTrusted.proofs.p6a.heavy, true);
  assert.equal(noTrusted.proofs.p6a.decision, "heavy-required");

  const unknown = await resolveProofGates({
    changedPaths: ["future/unknown.file"],
    root: fixture.root,
    trustedRoot: fixture.trustedRoot,
  });
  assert.equal(unknown.allHeavy, true);
  assert.equal(unknown.gates.training_p7d, false);
  assert.equal(unknown.gates.training_p7e, false);
  assert.equal(
    Object.entries(unknown.gates)
      .filter(([gate]) => !["training_p7d", "training_p7e"].includes(gate))
      .every(([, selected]) => selected),
    true,
  );
  assert.equal(
    Object.values(unknown.proofs).filter(({ active }) => active).every(({ heavy }) => heavy),
    true,
  );
  assertInactiveProof(unknown.proofs, "p7d");
  assertInactiveProof(unknown.proofs, "p7e");
});

test("CLI resolves the trusted merge base and writes underscore-safe GitHub outputs", async (t) => {
  const fixture = await makeResolverFixture(t);
  const deletedTestPath = "web/src/ruleset-ms/impl/deleted-regression.test.ts";
  await write(fixture.root, deletedTestPath, "export {};\n");
  const git = (...args) => execFileAsync("git", args, { cwd: fixture.root });
  await git("init", "--quiet");
  await git("config", "user.email", "ci@example.invalid");
  await git("config", "user.name", "CI Test");
  await git("add", ".");
  await git("commit", "--quiet", "-m", "base");
  const { stdout: baseStdout } = await git("rev-parse", "HEAD");
  const base = baseStdout.trim();

  await rm(resolve(fixture.root, deletedTestPath));
  await write(fixture.root, "README.md", "docs only\n");
  await git("add", "--all");
  await git("commit", "--quiet", "-m", "docs");
  const { stdout: headStdout } = await git("rev-parse", "HEAD");
  const head = headStdout.trim();
  const githubOutput = resolve(fixture.root, "github-output.txt");
  const result = await execFileAsync(process.execPath, [
    resolverPath,
    "--root", fixture.root,
    "--base", base,
    "--head", head,
    "--github-output", githubOutput,
  ]);

  assert.equal(result.stderr, "");
  const resolution = JSON.parse(result.stdout);
  assert.deepEqual(resolution.activeP7Packs, ["cclp1"]);
  assert.deepEqual(resolution.activeP7ProofIds, ["p7c"]);
  assert.equal(resolution.gates.workspace, true);
  assert.equal(resolution.changed.paths.includes(deletedTestPath), true);
  assert.deepEqual(resolution.changedTests, { native: [], p5: [], workspace: [] });
  const output = await readFile(githubOutput, "utf8");
  for (const key of [
    "native_qt",
    "native_sdl_oracle",
    "workspace",
    "static_corpus_p1b",
    "p5",
    "reviews_p2a_p4",
    "runtime_p6_evidence",
    "p6_presentation_attest",
    "p4b",
    "browser",
    "training_p7c",
    "training_p7d",
    "training_p7e",
    "p7_presentation_attest",
    "reuse_p1b",
    "reuse_p5",
    "reuse_p6a",
    "heavy_p1b",
    "heavy_p5",
    "heavy_p6a",
    "reuse_p7c",
    "reuse_p7d",
    "reuse_p7e",
    "reuse_p7_presentation",
    "heavy_p7c",
    "heavy_p7d",
    "heavy_p7e",
    "attest_p7_presentation",
    "p7_needs_shards",
    "p7_selected",
    "current_receipts_valid",
    "changed_native_web_tests",
  ]) {
    assert.match(output, new RegExp(`^${key}=(?:true|false)$`, "m"), key);
  }
  assert.match(output, /^changed_web_tests_json=\[\]$/m);
  assert.match(output, /^changed_native_web_tests_json=\[\]$/m);
  assert.match(output, /^p7_active_packs_csv=cclp1$/m);
  assert.match(output, /^p7_active_packs_json=\["cclp1"\]$/m);
  assert.match(output, /^p7_active_proof_ids_json=\["p7c"\]$/m);
  assert.match(output, /^p7_engine_packs_json=\[\]$/m);
  assert.match(output, new RegExp(`^trusted_merge_base=${base}$`, "m"));

  const dispatchOutput = resolve(fixture.root, "dispatch-github-output.txt");
  await execFileAsync(process.execPath, [
    resolverPath,
    "--root", fixture.root,
    "--all",
    "--github-output", dispatchOutput,
  ]);
  assert.match(await readFile(dispatchOutput, "utf8"), /^trusted_merge_base=$/m);
});

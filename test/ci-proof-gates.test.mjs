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
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  PROOF_BINDINGS,
  resolveProofGates,
} from "../scripts/ci/resolve-proof-gates.mjs";
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

const EXPECTED_PROOFS = {
  p1b: {
    count: 12,
    manifest: null,
    outputs: P1B_OUTPUTS,
    producer: "npm run ccsolver:build && npm run ccsolver:corpus:check:prepared && npm run ccsolver:p1b:check:prepared|node22.22.0-npm10.9.4|tworld-ci-v1",
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

test("checked proof specs bind the audited P1B, P5, and P6A leaves", async () => {
  const corpusManifest = await readJson("ccsolver/corpus/manifest.v1.json");
  const manifestSources = [...new Set(corpusManifest.sources.map(({ path }) => path))].sort();

  for (const [proofId, binding] of Object.entries(PROOF_BINDINGS)) {
    const spec = await readJson(binding.specPath);
    const receipt = await buildProofReceipt({
      root: repositoryRoot,
      specPath: binding.specPath,
    });
    const checked = await readJson(binding.receiptPath);
    const expected = EXPECTED_PROOFS[proofId];

    assert.equal(spec.schema, PROOF_SPEC_SCHEMA);
    assert.equal(spec.proofId, proofId);
    assert.equal(spec.producerContract, expected.producer);
    assert.equal(spec.outputManifestPath, expected.manifest);
    assert.equal(receipt.outputs.entries.length, expected.count);
    assert.deepEqual(checked, receipt, `${proofId} receipt must match current inputs and outputs`);
    assert.equal(spec.inputScopes.some(({ path }) => path.startsWith("docs/")), false);

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
  assert.ok(p5InputTrees.includes("ccsolver/fixtures/golden/p3/cclp1-001"));
  assert.ok(p5InputTrees.includes("ccsolver/src/events"));
  assert.ok(p5InputTrees.includes("ccsolver/src/plan"));
  assert.ok(filePaths(p5Spec.inputScopes).includes("legacy_c/oracle/oracle_main.cpp"));
  const p5InputFiles = new Set(filePaths(p5Spec.inputScopes));
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
    ],
    p5: ["web/src/ccsolver-runtime/compose/p5-review/runP5ReviewOutputs.ts"],
    p6a: ["web/src/ccsolver-runtime/compose/p6a-review/runP6aReviewOutputs.ts"],
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

async function write(root, path, contents) {
  const absolute = resolve(root, path);
  await mkdir(dirname(absolute), { recursive: true });
  await writeFile(absolute, contents);
}

async function makeResolverFixture(t) {
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
  };
  for (const [proofId, binding] of Object.entries(PROOF_BINDINGS)) {
    const paths = fixturePaths[proofId];
    await write(root, paths.input, `${proofId} input v1\n`);
    await write(root, paths.output, `${proofId} output v1\n`);
    await write(root, binding.specPath, canonicalJson({
      inputScopes: [{ kind: "file", path: paths.input }],
      outputManifestPath: null,
      outputScopes: [{ kind: "file", path: paths.output }],
      producerContract: `${proofId}:fixture:v1`,
      proofId,
      schema: PROOF_SPEC_SCHEMA,
    }));
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
  return { fixturePaths, root, trustedRoot };
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
  assert.equal(staticChange.gates.static_corpus_p1b, true);
  assert.equal(staticChange.gates.p5, false);
  assert.equal(staticChange.gates.runtime_p6_evidence, true);
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
  assert.equal(result.gates.native, true);
  assert.equal(result.gates.p5, true);
  assert.equal(result.proofs.p1b.reuse, true);
  assert.equal(result.proofs.p6a.reuse, true);
  assert.equal(result.gates.static_corpus_p1b, false);
  assert.equal(result.gates.runtime_p6_evidence, false);
});

test("keeps affected integration lanes selected when their heavy artifact proof is reusable", async (t) => {
  const fixture = await makeResolverFixture(t);

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
  assert.equal(Object.values(dispatch.gates).every(Boolean), true);
  assert.equal(Object.values(dispatch.proofs).every(({ heavy, reuse }) => heavy && !reuse), true);
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
  assert.equal(Object.values(unknown.gates).every(Boolean), true);
  assert.equal(Object.values(unknown.proofs).every(({ heavy }) => heavy), true);
});

test("CLI resolves the trusted merge base and writes underscore-safe GitHub outputs", async (t) => {
  const fixture = await makeResolverFixture(t);
  const git = (...args) => execFileAsync("git", args, { cwd: fixture.root });
  await git("init", "--quiet");
  await git("config", "user.email", "ci@example.invalid");
  await git("config", "user.name", "CI Test");
  await git("add", ".");
  await git("commit", "--quiet", "-m", "base");
  const { stdout: baseStdout } = await git("rev-parse", "HEAD");
  const base = baseStdout.trim();

  await write(fixture.root, "README.md", "docs only\n");
  await git("add", "README.md");
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
  assert.equal(JSON.parse(result.stdout).gates.workspace, true);
  const output = await readFile(githubOutput, "utf8");
  for (const key of [
    "native",
    "workspace",
    "static_corpus_p1b",
    "p5",
    "reviews_p2a_p4",
    "runtime_p6_evidence",
    "p6_presentation_attest",
    "p4b",
    "browser",
    "reuse_p1b",
    "reuse_p5",
    "reuse_p6a",
    "heavy_p1b",
    "heavy_p5",
    "heavy_p6a",
    "current_receipts_valid",
  ]) {
    assert.match(output, new RegExp(`^${key}=(?:true|false)$`, "m"), key);
  }
});

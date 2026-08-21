import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, lstat, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const execFileAsync = promisify(execFile);

async function exists(relativePath) {
  try {
    await access(resolve(repositoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8"));
}

function findLockedPackage(lockfile, packageName) {
  return Object.entries(lockfile.packages).find(([packagePath]) => (
    packagePath === `node_modules/${packageName}`
    || packagePath.endsWith(`/node_modules/${packageName}`)
  ));
}

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job: ${jobName}`);
  const following = workflow.slice(start + marker.length);
  const next = following.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return workflow.slice(start, next === -1 ? undefined : start + marker.length + next);
}

test("uses the canonical CCSolver workspace spelling", async () => {
  const misspelledWorkspace = ["ccs", "solver"].join("");
  const canonicalRoot = await lstat(resolve(repositoryRoot, "ccsolver"));
  assert.equal(canonicalRoot.isDirectory(), true);
  assert.equal(canonicalRoot.isSymbolicLink(), false);
  assert.equal(await exists("ccsolver/package.json"), true);
  assert.equal(await exists(misspelledWorkspace), false);

  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  const trackedPaths = stdout.split("\0").filter(Boolean);
  assert.deepEqual(
    trackedPaths.filter((path) => path.includes(misspelledWorkspace)),
    [],
    "tracked path uses the misspelled CCSolver workspace name",
  );

  const files = trackedPaths.filter((path) => (
    /\.(?:c|h|js|json|md|mjs|sh|toml|ts|tsx|yaml|yml)$/u.test(path)
  ));
  const offenders = [];
  for (const relativePath of files) {
    const contents = await readFile(resolve(repositoryRoot, relativePath), "utf8");
    const occurrenceCount = contents.split(misspelledWorkspace).length - 1;
    if (relativePath === "AGENTS.md") {
      assert.equal(occurrenceCount, 1, "AGENTS.md must document the one known near-miss spelling");
    } else if (occurrenceCount > 0) {
      offenders.push(relativePath);
    }
  }
  assert.deepEqual(offenders, [], `misspelled CCSolver paths: ${offenders.join(", ")}`);
});

test("registers CCSolver as a first-class root workspace", async () => {
  const rootPackage = await readJson("package.json");
  assert.deepEqual(new Set(rootPackage.workspaces), new Set(["web", "ccsolver"]));
  assert.equal(rootPackage.packageManager, "npm@10.9.4");
  assert.equal(rootPackage.engines.node, "22.x");
  assert.equal(rootPackage.engines.npm, "10.x");
  assert.equal((await readFile(resolve(repositoryRoot, ".nvmrc"), "utf8")).trim(), "22.22.0");

  const ccsolverPackage = await readJson("ccsolver/package.json");
  assert.equal(ccsolverPackage.name, "@tworld/ccsolver");
  assert.equal(ccsolverPackage.private, true);
  assert.equal(ccsolverPackage.type, "module");
  assert.equal(ccsolverPackage.scripts.build, "tsc --build tsconfig.json --force");

  for (const script of [
    "ccsolver:build",
    "ccsolver:typecheck",
    "ccsolver:typecheck:browser",
    "ccsolver:test",
    "ccsolver:conformance",
    "ccsolver:cli",
    "ccsolver:dossier",
  ]) {
    assert.match(rootPackage.scripts[script], /--workspace @tworld\/ccsolver/);
  }
  assert.match(rootPackage.scripts["ccsolver:facade"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:corpus:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:corpus:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:analysis:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:analysis:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p1b:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p1b:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p2a:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p2a:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p3:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p3:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p4a:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p4a:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p5:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p5:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p4b:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p4b:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p4b:emit-dist"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p6a:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p6a:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p6a:attest"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p6a:emit-dist"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p7a:check"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p7a:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p7a:attest"], /:prepared/);
  assert.match(rootPackage.scripts["ccsolver:p7a:emit-dist"], /:prepared/);
  for (const command of [
    "ccsolver:corpus:check",
    "ccsolver:corpus:generate",
    "ccsolver:analysis:check",
    "ccsolver:analysis:generate",
    "ccsolver:p1b:check",
    "ccsolver:p1b:generate",
    "ccsolver:p2a:check",
    "ccsolver:p2a:generate",
    "ccsolver:p3:check",
    "ccsolver:p3:generate",
    "ccsolver:p4a:check",
    "ccsolver:p4a:generate",
    "ccsolver:p5:check",
    "ccsolver:p5:generate",
    "ccsolver:p4b:check",
    "ccsolver:p4b:generate",
    "ccsolver:p4b:emit-dist",
    "ccsolver:p6a:check",
    "ccsolver:p6a:generate",
    "ccsolver:p6a:attest",
    "ccsolver:p6a:emit-dist",
    "ccsolver:p7a:check",
    "ccsolver:p7a:generate",
    "ccsolver:p7a:attest",
    "ccsolver:p7a:emit-dist",
  ]) {
    assert.equal(
      (rootPackage.scripts[command].match(/npm run ccsolver:build/g) ?? []).length,
      1,
      `${command} must build CCSolver exactly once`,
    );
  }
  for (const command of [
    "ccsolver:corpus:check",
    "ccsolver:analysis:check",
    "ccsolver:p1b:check",
    "ccsolver:p2a:check",
    "ccsolver:p3:check",
    "ccsolver:p4a:check",
    "ccsolver:p5:check",
    "ccsolver:p4b:check",
    "ccsolver:p4b:emit-dist",
    "ccsolver:p6a:check",
    "ccsolver:p6a:attest",
    "ccsolver:p6a:emit-dist",
    "ccsolver:p7a:check",
    "ccsolver:p7a:attest",
    "ccsolver:p7a:emit-dist",
  ]) {
    const prepared = `${command}:prepared`;
    assert.match(rootPackage.scripts[prepared], /--workspace web/);
    assert.doesNotMatch(rootPackage.scripts[prepared], /ccsolver:build/);
    assert.equal(
      rootPackage.scripts[command],
      `npm run ccsolver:build && npm run ${prepared}`,
    );
  }
  const integrationStages = [
    "smoke",
    "static",
    "corpus",
    "runtime",
    "reviews",
    "causal-proof",
  ];
  assert.equal(
    rootPackage.scripts["ccsolver:integration"],
    integrationStages.map((stage) => `npm run ccsolver:integration:${stage}`).join(" && "),
  );
  for (const stage of integrationStages) {
    const command = rootPackage.scripts[`ccsolver:integration:${stage}`];
    assert.equal(typeof command, "string", `missing integration stage: ${stage}`);
    assert.match(command, /--workspace web run test/);
    assert.doesNotMatch(command, /ccsolver:build/);
  }

  const smoke = rootPackage.scripts["ccsolver:integration:smoke"];
  for (const extractedProof of [
    "buildTworldMsTopologyEvidence.test.ts",
    "buildTworldLynxStaticAnalysis.test.ts",
    "p1a-corpus/corpusManifest.test.ts",
    "p1b-curriculum/measuredCorpusReport.test.ts",
    "runtime/tworldSolverRuntimeAdapters.test.ts",
    "runtime/tworldSolverCausalJournal.test.ts",
    "p2a-review/buildP2aRuntimeReviewOutputs.test.ts",
    "p3-review/buildP3ReviewOutputs.test.ts",
    "p5-review/buildKeyPyramidP5Route.test.ts",
    "p5-review/buildKeyPyramidP5Execution.test.ts",
    "p5-review/certifyKeyPyramidP5Replay.test.ts",
    "p5-review/runExactKeyPyramidNativeReplay.test.ts",
    "p5-review/buildP5ReviewOutputs.test.ts",
  ]) {
    assert.doesNotMatch(
      smoke,
      new RegExp(extractedProof.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${extractedProof} must stay out of the smoke lane`,
    );
  }
  for (const staticProof of [
    "buildTworldMsTopologyEvidence.test.ts",
    "buildTworldLynxTopologyEvidence.test.ts",
    "buildTworldMsStaticAnalysis.test.ts",
    "buildTworldLynxStaticAnalysis.test.ts",
    "buildTworldPairedStaticAnalysis.test.ts",
  ]) {
    assert.match(rootPackage.scripts["ccsolver:integration:static"], new RegExp(staticProof));
  }
  for (const corpusProof of [
    "p1a-corpus/corpusManifest.test.ts",
    "p1b-curriculum/corpusValidityReport.test.ts",
    "p1b-curriculum/deriveMeasuredCorpusCase.test.ts",
    "p1b-curriculum/measuredCorpusReport.test.ts",
    "p1b-curriculum/measuredCorpusShardContract.test.ts",
    "p1b-curriculum/p1bCheckedArtifacts.test.ts",
    "p1b-curriculum/curriculumManifest.test.ts",
    "p1b-curriculum/writeFixedOutputsTransactionally.test.ts",
  ]) {
    assert.match(rootPackage.scripts["ccsolver:integration:corpus"], new RegExp(corpusProof));
  }
  for (const runtimeProof of [
    "runtime/tworldSolverRuntimeAdapters.test.ts",
    "runtime/tworldSolverRuntimeSemantics.test.ts",
    "runtime/tworldNativeCausalEventSeams.test.ts",
    "runtime/tworldSolverCausalJournal.test.ts",
  ]) {
    assert.match(rootPackage.scripts["ccsolver:integration:runtime"], new RegExp(runtimeProof));
  }
  for (const reviewProof of [
    "p2a-review/buildP2aRuntimeReviewOutputs.test.ts",
    "p3-review/buildP3ReviewOutputs.test.ts",
  ]) {
    assert.match(rootPackage.scripts["ccsolver:integration:reviews"], new RegExp(reviewProof));
  }
  assert.doesNotMatch(
    rootPackage.scripts["ccsolver:integration:runtime"],
    /records, pages, reruns, checkpoints/,
  );
  assert.match(
    rootPackage.scripts["ccsolver:integration:causal-proof"],
    /records, pages, reruns, checkpoints/,
  );

  const webPackage = await readJson("web/package.json");
  assert.equal(
    webPackage.scripts["ccsolver:p2a"],
    "vite-node src/ccsolver-runtime/compose/p2a-review/runP2aRuntimeReviewPackets.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p2a:check"], "npm run ccsolver:p2a -- --check");
  assert.equal(webPackage.scripts["ccsolver:p2a:generate"], "npm run ccsolver:p2a -- --write");
  assert.equal(
    webPackage.scripts["ccsolver:p3"],
    "vite-node src/ccsolver-runtime/compose/p3-review/runP3ReviewOutputs.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p3:check"], "npm run ccsolver:p3 -- --check");
  assert.equal(webPackage.scripts["ccsolver:p3:generate"], "npm run ccsolver:p3 -- --write");
  assert.equal(
    webPackage.scripts["ccsolver:p4a"],
    "vite-node src/ccsolver-runtime/compose/p4a-review/runP4aReviewOutputs.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p4a:check"], "npm run ccsolver:p4a -- --check");
  assert.equal(webPackage.scripts["ccsolver:p4a:generate"], "npm run ccsolver:p4a -- --write");
  assert.equal(
    webPackage.scripts["ccsolver:p5"],
    "vite-node src/ccsolver-runtime/compose/p5-review/runP5ReviewOutputs.ts",
  );
  assert.equal(
    webPackage.scripts["ccsolver:p5:check"],
    "npm run ccsolver:p5 -- --check --oracle ../build-verify/legacy_c/tworld-oracle",
  );
  assert.equal(
    webPackage.scripts["ccsolver:p5:generate"],
    "npm run ccsolver:p5 -- --write --oracle ../build-verify/legacy_c/tworld-oracle",
  );
  assert.equal(
    webPackage.scripts["ccsolver:p4b"],
    "vite-node src/ccsolver-runtime/compose/p4b-dossier/runP4bDossierOutputs.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p4b:check"], "npm run ccsolver:p4b -- --check");
  assert.equal(webPackage.scripts["ccsolver:p4b:generate"], "npm run ccsolver:p4b -- --write");
  assert.equal(webPackage.scripts["ccsolver:p4b:emit-dist"], "npm run ccsolver:p4b -- --emit-dist");
  assert.equal(
    webPackage.scripts["ccsolver:p6a"],
    "vite-node src/ccsolver-runtime/compose/p6a-review/runP6aReviewOutputs.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p6a:check"], "npm run ccsolver:p6a -- --check");
  assert.equal(webPackage.scripts["ccsolver:p6a:generate"], "npm run ccsolver:p6a -- --write");
  assert.equal(webPackage.scripts["ccsolver:p6a:attest"], "npm run ccsolver:p6a -- --attest");
  assert.equal(webPackage.scripts["ccsolver:p6a:emit-dist"], "npm run ccsolver:p6a -- --emit-dist");
  assert.equal(
    webPackage.scripts["ccsolver:p7a"],
    "vite-node src/ccsolver-runtime/compose/p6b-p7a-review/runP6bP7aReviewOutputs.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p7a:check"], "npm run ccsolver:p7a -- --check");
  assert.equal(webPackage.scripts["ccsolver:p7a:generate"], "npm run ccsolver:p7a -- --write");
  assert.equal(webPackage.scripts["ccsolver:p7a:attest"], "npm run ccsolver:p7a -- --attest");
  assert.equal(webPackage.scripts["ccsolver:p7a:emit-dist"], "npm run ccsolver:p7a -- --emit-dist");
  for (const smokeTest of [
    "src/ccsolver-runtime/compose/sourceValidity/analyzeTworldSolverSourceScope.test.ts",
    "src/ccsolver-runtime/compose/sourceValidity/tworldSolverSourceScopeAcceptance.test.ts",
    "src/ccsolver-runtime/impl/runtime/createSolverRuntimeKernel.test.ts",
    "src/ccsolver-runtime/compose/p2a-review/buildP2aRuntimeReviewPacket.test.ts",
    "src/ccsolver-runtime/compose/p4a-review/buildP4aReviewOutputs.test.ts",
  ]) {
    assert.match(smoke, new RegExp(
      smokeTest.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
  }
  for (const p4bReleaseTest of [
    "src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.test.ts",
    "src/ccsolver-runtime/compose/p4b-dossier/p4bDossierVisuals.test.ts",
    "src/ccsolver-runtime/compose/p4b-dossier/p4bDossierIo.test.ts",
    "src/ccsolver-runtime/compose/p4b-dossier/p4bDossierSafety.test.ts",
  ]) {
    assert.match(smoke, new RegExp(
      p4bReleaseTest.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
  }
  for (const p6aSmokeTest of [
    "src/ccsolver-runtime/compose/p6a-review/checkedP6aInputs.test.ts",
    "src/ccsolver-runtime/compose/p6a-review/buildP6aReviewOutputs.test.ts",
    "src/ccsolver-runtime/compose/p6a-review/p6aReviewPage.test.ts",
    "src/ccsolver-runtime/compose/p6a-review/p6aReviewIo.test.ts",
  ]) {
    assert.match(smoke, new RegExp(
      p6aSmokeTest.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
  }
  for (const p7aSmokeTest of [
    "src/ccsolver-runtime/compose/p6b-p7a-review/buildP6bPortfolioCanaries.test.ts",
    "src/ccsolver-runtime/compose/p6b-p7a-review/p6bP7aReviewPage.test.ts",
    "src/ccsolver-runtime/compose/p6b-p7a-review/p6bP7aArtwork.test.ts",
    "src/ccsolver-runtime/compose/p6b-p7a-review/p6bP7aReviewIo.test.ts",
  ]) {
    assert.match(smoke, new RegExp(
      p7aSmokeTest.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
  }
  const runtime = rootPackage.scripts["ccsolver:integration:runtime"];
  assert.match(runtime, /p7a-tactics\/standardTactics\.test\.ts/u);
  assert.doesNotMatch(runtime, /p6b-p7a-review\/buildP6bP7aReviewOutputs\.test\.ts/u);
});

test("uses one deterministic root lockfile for both workspaces", async () => {
  assert.equal(await exists("package-lock.json"), true);
  assert.equal(await exists("web/package-lock.json"), false);
  assert.equal(await exists("ccsolver/package-lock.json"), false);

  const lockfile = await readJson("package-lock.json");
  assert.deepEqual(
    new Set(lockfile.packages[""].workspaces),
    new Set(["web", "ccsolver"]),
  );
  assert.equal(lockfile.packages.ccsolver.name, "@tworld/ccsolver");
  assert.equal(lockfile.packages["node_modules/@tworld/ccsolver"].link, true);
  for (const rollupPackage of [
    "@rollup/rollup-darwin-arm64",
    "@rollup/rollup-linux-x64-gnu",
    "@rollup/rollup-win32-x64-msvc",
  ]) {
    assert.ok(findLockedPackage(lockfile, rollupPackage));
  }
});

test("creates explicit source boundaries and a narrow public package surface", async () => {
  for (const boundary of [
    "domain",
    "application",
    "analyze",
    "ports",
    "plan",
    "snippets",
    "events",
    "alignment",
    "adapters",
    "cli",
    "render",
    "site",
  ]) {
    assert.equal(await exists(`ccsolver/src/${boundary}/index.ts`), true);
  }

  const ccsolverPackage = await readJson("ccsolver/package.json");
  assert.deepEqual(
    new Set(Object.keys(ccsolverPackage.exports)),
    new Set([
      ".",
      "./domain",
      "./application",
      "./analyze",
      "./ports",
      "./plan",
      "./render",
      "./snippets",
      "./events",
      "./alignment",
      "./adapters/web-crypto",
    ]),
  );

  const dependencyGroups = [
    ccsolverPackage.dependencies,
    ccsolverPackage.optionalDependencies,
    ccsolverPackage.peerDependencies,
  ];
  assert.deepEqual(dependencyGroups.filter(Boolean), []);
  for (const dependencies of [
    ...dependencyGroups,
    ccsolverPackage.devDependencies,
  ].filter(Boolean)) {
    for (const dependency of Object.keys(dependencies)) {
      assert.doesNotMatch(dependency, /^(?:tworld-web|@ruleset-|@game-|@player-web)/);
    }
  }

  const webPackage = await readJson("web/package.json");
  assert.equal(webPackage.dependencies["@tworld/ccsolver"], "0.0.0");
  assert.equal(await exists("web/tsconfig.project.ccsolver-runtime.json"), true);
  assert.equal(
    await exists("web/src/ccsolver-runtime/ports/ccsolverPackageBoundary.ts"),
    true,
  );
});

test("builds GitHub Pages from the authoritative root install", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/github-pages.yml"),
    "utf8",
  );

  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.match(workflow, /run: npm ci --include=optional/);
  assert.equal((workflow.match(/run: npm run ccsolver:build/g) ?? []).length, 1);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /run: npm run ccsolver:p4b:emit-dist:prepared/);
  assert.match(workflow, /run: npm run ccsolver:p6a:emit-dist:prepared/);
  assert.match(workflow, /run: npm run ccsolver:p7a:emit-dist:prepared/);
  assert.doesNotMatch(workflow, /ccsolver:p4b:check/);
  assert.doesNotMatch(workflow, /ccsolver:p6a:check/);
  assert.doesNotMatch(workflow, /ccsolver:p7a:check/);
  assert.doesNotMatch(
    workflow,
    /tworld-oracle|--oracle|cmake|ctest|ccsolver:p1b|ccsolver:p5|ccsolver:integration|npm test/,
  );
  assert.ok(
    workflow.indexOf("run: npm run ccsolver:build")
      < workflow.indexOf("run: npm run build"),
  );
  assert.ok(
    workflow.indexOf("run: npm run build")
      < workflow.indexOf("run: npm run ccsolver:p4b:emit-dist:prepared"),
  );
  assert.ok(
    workflow.indexOf("run: npm run ccsolver:p4b:emit-dist:prepared")
      < workflow.indexOf("run: npm run ccsolver:p6a:emit-dist:prepared"),
  );
  assert.ok(
    workflow.indexOf("run: npm run ccsolver:p6a:emit-dist:prepared")
      < workflow.indexOf("run: npm run ccsolver:p7a:emit-dist:prepared"),
  );
  assert.doesNotMatch(workflow, /web\/package-lock\.json/);
  assert.doesNotMatch(workflow, /working-directory: web/);
  assert.doesNotMatch(workflow, /npm install --no-save/);
});

test("runs the fail-closed proof graph only on pull requests", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/ubuntu-ci.yml"),
    "utf8",
  );

  assert.match(workflow, /on:\n\s+pull_request:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(
    workflow,
    /concurrency:\n\s+group: ubuntu-ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}\n\s+cancel-in-progress: true/,
  );
  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.match(workflow, /npm ci --include=optional/);
  for (const command of [
    "npm run ccsolver:typecheck",
    "npm run ccsolver:typecheck:browser",
    "npm run ccsolver:test",
    "npm run ccsolver:conformance",
    "npm run ccsolver:build",
    "npm run ccsolver:facade",
    "npm run ccsolver:integration:smoke",
    "npm run ccsolver:integration:static",
    "npm run ccsolver:integration:corpus",
    "npm run ccsolver:integration:runtime",
    "npm run ccsolver:integration:reviews",
    "npm run ccsolver:corpus:check:prepared",
    "npm run ccsolver:analysis:check:prepared",
    "node scripts/ci/p1b-shards.mjs prepare",
    "node scripts/ci/p1b-shards.mjs run",
    "node scripts/ci/p1b-shards.mjs forward",
    "node scripts/ci/p1b-shards.mjs finalize",
    "npm run ccsolver:p2a:check:prepared",
    "npm run ccsolver:p3:check:prepared",
    "npm run ccsolver:p4a:check:prepared",
    "npm run ccsolver:p5:check:prepared",
    "npm run ccsolver:p4b:check:prepared",
    "npm run ccsolver:p6a:check:prepared",
    "npm --workspace web run typecheck:tools",
    "npm run ccsolver:cli -- --help",
    "npm run ccsolver:dossier -- --help",
    "npm run typecheck",
    "npm run build",
  ]) {
    assert.match(workflow, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  const classify = workflowJob(workflow, "classify");
  assert.match(classify, /fetch-depth: 0/);
  assert.match(classify, /changed-gates\.mjs/);
  assert.match(classify, /test\/ci-p1b-shards\.test\.mjs/);

  const preflight = workflowJob(workflow, "ccsolver-p5-preflight");
  assert.match(preflight, /build-sdl1/);
  assert.match(preflight, /actions\/download-artifact@v4/);
  assert.match(
    preflight,
    /npm --workspace web run test -- --run \\\n\s+src\/ccsolver-runtime\/compose\/p5-review(?:\s|$)/,
  );
  assert.match(preflight, /run: npm run ccsolver:p5:check:prepared/);
  assert.match(preflight, /outputs\['heavy-p5'\]/);
  assert.doesNotMatch(preflight, /apt-get|cmake -S|ccsolver:p1b|ccsolver:p6a/);

  const sdl = workflowJob(workflow, "build-sdl1");
  assert.match(sdl, /timeout-minutes: 30/);
  assert.match(sdl, /actions\/upload-artifact@v4/);
  assert.match(sdl, /build-sdl\/legacy_c\/tworld-oracle/);
  assert.match(sdl, /outputs\['native-sdl-oracle'\]/);

  for (const jobName of ["build-qt5", "build-qt6"]) {
    assert.match(workflowJob(workflow, jobName), /outputs\['native-qt'\]/);
  }
  assert.match(workflowJob(workflow, "build-qt6"), /timeout-minutes: 40/);

  const workspace = workflowJob(workflow, "ccsolver-workspace");
  assert.match(workspace, /ccsolver:integration:smoke/);
  assert.match(workspace, /run-changed-web-tests\.mjs/);
  assert.doesNotMatch(workspace, /ccsolver:integration:(?:static|corpus|runtime|reviews|causal-proof)/);

  const staticCorpus = workflowJob(workflow, "ccsolver-static-corpus");
  assert.match(staticCorpus, /ccsolver:integration:static/);
  assert.match(staticCorpus, /ccsolver:integration:corpus/);
  assert.match(staticCorpus, /ccsolver:analysis:check:prepared/);
  assert.doesNotMatch(staticCorpus, /ccsolver:p1b:check:prepared/);

  const p1bPrepare = workflowJob(workflow, "ccsolver-p1b-prepare");
  const p1bShard = workflowJob(workflow, "ccsolver-p1b-shard");
  const p1b = workflowJob(workflow, "ccsolver-p1b");
  const p1bGraph = `${p1bPrepare}\n${p1bShard}\n${p1b}`;
  assert.doesNotMatch(p1bGraph, /ccsolver:integration:(?:static|corpus)/);
  assert.match(p1bPrepare, /ccsolver:corpus:check:prepared/);
  assert.match(p1bPrepare, /p1b-shards\.mjs prepare/);
  assert.match(p1bShard, /p1b-shards\.mjs run/);
  assert.match(p1b, /p1b-shards\.mjs finalize/);
  assert.doesNotMatch(p1bGraph, /ccsolver:p1b:check:prepared/);
  assert.doesNotMatch(p1bGraph, /ccsolver:integration:(?:runtime|reviews|causal-proof)|ccsolver:p5|ccsolver:p6a/);

  const reviews = workflowJob(workflow, "ccsolver-reviews");
  assert.match(reviews, /ccsolver:integration:reviews/);
  assert.match(reviews, /ccsolver:p2a:check:prepared/);
  assert.match(reviews, /ccsolver:p3:check:prepared/);
  assert.match(reviews, /ccsolver:p4a:check:prepared/);
  assert.doesNotMatch(reviews, /ccsolver:integration:(?:static|corpus|runtime|causal-proof)/);

  const runtime = workflowJob(workflow, "ccsolver-runtime");
  assert.match(runtime, /ccsolver:integration:runtime/);
  assert.match(runtime, /ccsolver:p7a:check:prepared/);
  assert.doesNotMatch(runtime, /ccsolver:integration:causal-proof/);
  assert.doesNotMatch(runtime, /ccsolver:integration:(?:static|corpus|reviews)/);

  assert.doesNotMatch(workflowJob(workflow, "ccsolver-p6a"), /ccsolver:p1b|ccsolver:p5/);

  assert.match(p1bPrepare, /timeout-minutes: 10/);
  assert.match(p1bShard, /timeout-minutes: 45[\s\S]*max-parallel: 8/);
  assert.match(p1bShard, /TWORLD_P1B_ANALYSIS_JOBS: 1/);
  assert.match(p1b, /timeout-minutes: 15/);
  assert.match(
    workflowJob(workflow, "ccsolver-p6a"),
    /timeout-minutes: 15[\s\S]*run: npm run ccsolver:p6a:check:prepared/,
  );
  const p6Presentation = workflowJob(workflow, "ccsolver-p6-presentation");
  assert.match(p6Presentation, /p6b-p7a-review\/p6bP7aReviewIo\.test\.ts/);
  assert.match(p6Presentation, /ccsolver:p7a:attest:prepared/);

  const aggregate = workflowJob(workflow, "web-and-ccsolver");
  assert.match(aggregate, /if: \$\{\{ always\(\) \}\}/);
  for (const dependency of [
    "ccsolver-p5-preflight",
    "changed-native-web-tests",
    "ccsolver-workspace",
    "ccsolver-p1b",
    "ccsolver-static-corpus",
    "ccsolver-reviews",
    "ccsolver-runtime",
    "ccsolver-p6a",
    "browser-workspace",
    "classify",
  ]) {
    assert.match(aggregate, new RegExp(dependency));
  }
  assert.match(aggregate, /success/);
  assert.match(aggregate, /skipped/);
  assert.match(aggregate, /exit 1/);
  assert.doesNotMatch(aggregate, /actions\/checkout|npm ci|npm run build|npm test/);
});

test("registers the P5 certification and P4B whole-level review gates", async () => {
  for (const path of [
    "ccsolver/docs/p5-p4b-key-pyramid.md",
    "ccsolver/fixtures/golden/p5/cclp1-001/manifest.json",
    "ccsolver/fixtures/golden/p5/cclp1-001/corpus-case.v1.json",
    "ccsolver/fixtures/golden/p5/cclp1-001/ms/key-pyramid-ms.tws",
    "ccsolver/fixtures/golden/p5/cclp1-001/lynx/key-pyramid-lynx.tws",
    "ccsolver/fixtures/golden/p4b/cclp1-001/manifest.json",
    "ccsolver/fixtures/golden/p4b/cclp1-001/review.md",
  ]) {
    assert.equal(await exists(path), true, `missing P5/P4B release asset: ${path}`);
  }

  const tools = await readJson("web/tsconfig.tools.json");
  for (const path of [
    "src/ccsolver-runtime/compose/p5-review/buildP5ReviewOutputs.ts",
    "src/ccsolver-runtime/compose/p5-review/runP5ReviewOutputs.ts",
    "src/ccsolver-runtime/compose/p4b-dossier/buildP4bDossierOutputs.ts",
    "src/ccsolver-runtime/compose/p4b-dossier/runP4bDossierOutputs.ts",
  ]) {
    assert.ok(tools.include.includes(path), `missing tools boundary: ${path}`);
  }
});

test("registers the bounded P4A graphical evidence review gate", async () => {
  for (const path of [
    "ccsolver/docs/p4a-subgoal-evidence.md",
    "ccsolver/fixtures/golden/p4a/cclp1-001/ms/red-key-evidence.json",
    "ccsolver/fixtures/golden/p4a/cclp1-001/lynx/red-key-evidence.json",
    "ccsolver/fixtures/golden/p4a/synthetic-standard-failed-red-key/evidence.json",
    "ccsolver/fixtures/golden/p4a/manifest.json",
    "ccsolver/fixtures/golden/p4a/review.html",
    "ccsolver/reviews/p4a/cclp1-001/ms/red-key.review.v1.json",
    "ccsolver/reviews/p4a/cclp1-001/lynx/red-key.review.v1.json",
    "ccsolver/reviews/p4a/synthetic-standard-failed-red-key.review.v1.json",
  ]) {
    assert.equal(await exists(path), true, `missing P4A release asset: ${path}`);
  }

  const tools = await readJson("web/tsconfig.tools.json");
  assert.ok(tools.include.includes(
    "src/ccsolver-runtime/compose/p4a-review/buildP4aReviewOutputs.ts",
  ));
  assert.ok(tools.include.includes(
    "src/ccsolver-runtime/compose/p4a-review/runP4aReviewOutputs.ts",
  ));
});

test("registers the bounded P2A runtime-observation review gate", async () => {
  for (const path of [
    "ccsolver/docs/p2a-runtime-observation.md",
    "ccsolver/fixtures/golden/p2a/cclp1-001/ms/runtime-review.json",
    "ccsolver/fixtures/golden/p2a/cclp1-001/lynx/runtime-review.json",
    "ccsolver/fixtures/golden/p2a/cclp1-001/review.md",
    "ccsolver/fixtures/golden/p2a/intro-008/ms/runtime-review.json",
    "ccsolver/fixtures/golden/p2a/intro-008/lynx/runtime-review.json",
    "ccsolver/fixtures/golden/p2a/intro-008/review.md",
  ]) {
    assert.equal(await exists(path), true, `missing P2A release asset: ${path}`);
  }

  const tools = await readJson("web/tsconfig.tools.json");
  assert.ok(tools.include.includes(
    "src/ccsolver-runtime/compose/p2a-review/buildP2aRuntimeReviewOutputs.ts",
  ));
  assert.ok(tools.include.includes(
    "src/ccsolver-runtime/compose/p2a-review/runP2aRuntimeReviewPackets.ts",
  ));
});

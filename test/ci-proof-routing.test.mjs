import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);

async function read(path) {
  return readFile(new URL(path, repositoryRoot), "utf8");
}

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job: ${jobName}`);
  const following = workflow.slice(start + marker.length);
  const next = following.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return workflow.slice(start, next === -1 ? undefined : start + marker.length + next);
}

test("runs the full proof graph only on pull requests or explicit dispatch", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");

  assert.match(workflow, /on:\n\s+pull_request:\n\s+workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.match(workflow, /group: ubuntu-ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.ref \}\}/);
});

test("uses one immutable public native image without apt installation", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");
  const image = /ghcr\.io\/joshua-bone\/tworld-ci@sha256:[a-f0-9]{64}/u;

  for (const jobName of ["build-qt5", "build-qt6", "build-sdl1"]) {
    const job = workflowJob(workflow, jobName);
    assert.match(job, image);
    assert.doesNotMatch(job, /apt-get|sudo /);
    assert.match(job, /needs: classify/);
    assert.match(
      job,
      /git config --global --add safe\.directory "\$GITHUB_WORKSPACE"/,
      `${jobName} must preserve Git trust after checkout's temporary HOME is restored`,
    );
    assert.doesNotMatch(job, /safe\.directory (?:['"]?\*|\/__w\/)/);
    assert.ok(job.indexOf("uses: actions/checkout@v4") < job.indexOf("safe.directory"));
    assert.ok(job.indexOf("safe.directory") < job.indexOf("cmake -DCMAKE_BUILD_TYPE"));
  }
  for (const jobName of ["build-qt5", "build-qt6"]) {
    assert.match(workflowJob(workflow, jobName), /needs\.classify\.outputs\['native-qt'\]/);
  }
  assert.match(
    workflowJob(workflow, "build-sdl1"),
    /needs\.classify\.outputs\['native-sdl-oracle'\]/,
  );
  assert.match(workflowJob(workflow, "build-qt5"), /CMAKE_DISABLE_FIND_PACKAGE_Qt6=TRUE/);
});

test("pins the Node and npm proof epoch across CI and proof receipts", async () => {
  const nvmrc = (await read(".nvmrc")).trim();
  assert.equal(nvmrc, "22.22.0");
  for (const workflowPath of [
    ".github/workflows/ubuntu-ci.yml",
    ".github/workflows/github-pages.yml",
  ]) {
    const workflow = await read(workflowPath);
    const setupCount = (workflow.match(/actions\/setup-node@v4/g) ?? []).length;
    const fileCount = (workflow.match(/node-version-file: \.nvmrc/g) ?? []).length;
    assert.equal(fileCount, setupCount, workflowPath);
    assert.doesNotMatch(workflow, /node-version: 22/);
  }
  const ubuntu = await read(".github/workflows/ubuntu-ci.yml");
  assert.match(ubuntu, /node --version\)" == "v22\.22\.0"/);
  assert.match(ubuntu, /npm --version\)" == "10\.9\.4"/);
  for (const specPath of ["p1b", "p5", "p6a"]) {
    const spec = await read(`scripts/ci/proof-specs/${specPath}.json`);
    assert.match(spec, /node22\.22\.0-npm10\.9\.4/);
    assert.doesNotMatch(spec, /node22-npm10/);
  }
});

test("classifies first and makes every expensive gate conditional", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");
  const classify = workflowJob(workflow, "classify");

  assert.match(classify, /fetch-depth: 0/);
  for (const policyTest of [
    "ci-image-contract.test.mjs",
    "ci-changed-gates.test.mjs",
    "ci-changed-web-tests.test.mjs",
    "ci-proof-receipt.test.mjs",
    "ci-proof-gates.test.mjs",
    "ci-p1b-shards.test.mjs",
    "ci-proof-routing.test.mjs",
  ]) {
    assert.match(classify, new RegExp(policyTest.replaceAll(".", "\\.")));
  }
  assert.match(classify, /changed-gates\.mjs/);
  assert.match(classify, /proof-receipt\.mjs/);
  for (const output of [
    "native-qt",
    "native-sdl-oracle",
    "workspace",
    "static-corpus-p1b",
    "p5",
    "heavy-p5",
    "changed-web-tests-json",
    "changed-native-web-tests-json",
    "changed-native-web-tests",
    "reviews-p2a-p4",
    "runtime-p6-evidence",
    "p6-presentation-attest",
    "p4b",
    "browser",
    "heavy-p1b",
    "heavy-p6a",
  ]) {
    assert.match(classify, new RegExp(`${output.replaceAll("-", "[-_]?")}:`));
  }

  for (const [jobName, gate] of [
    ["ccsolver-static-corpus", "static-corpus-p1b"],
    ["ccsolver-p1b", "heavy-p1b"],
    ["ccsolver-reviews", "reviews-p2a-p4"],
    ["ccsolver-runtime", "runtime-p6-evidence"],
    ["ccsolver-p6a", "heavy-p6a"],
    ["browser-workspace", "browser"],
  ]) {
    const job = workflowJob(workflow, jobName);
    assert.match(job, /needs:/);
    assert.match(job, new RegExp(gate.replaceAll("-", "[-_]?")));
  }
});

test("keeps the always-present required check fail-closed over skipped jobs", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");
  const aggregate = workflowJob(workflow, "web-and-ccsolver");

  assert.match(aggregate, /if: \$\{\{ always\(\) \}\}/);
  for (const dependency of [
    "classify",
    "build-qt5",
    "build-qt6",
    "build-sdl1",
    "changed-native-web-tests",
    "ccsolver-p5-preflight",
    "ccsolver-workspace",
    "ccsolver-static-corpus",
    "ccsolver-p1b",
    "ccsolver-reviews",
    "ccsolver-p4b",
    "ccsolver-runtime",
    "ccsolver-p6a",
    "ccsolver-p6-presentation",
    "browser-workspace",
  ]) {
    assert.match(aggregate, new RegExp(dependency));
  }
  assert.match(aggregate, /success/);
  assert.match(aggregate, /skipped/);
  assert.match(aggregate, /QT_SELECTED: \$\{\{ needs\.classify\.outputs\['native-qt'\] \}\}/);
  assert.match(aggregate, /SDL_SELECTED: \$\{\{ needs\.classify\.outputs\['native-sdl-oracle'\] \}\}/);
  assert.match(aggregate, /P5_SELECTED: \$\{\{ needs\.classify\.outputs\.p5 \}\}/);
  assert.match(aggregate, /P5_HEAVY_SELECTED: \$\{\{ needs\.classify\.outputs\['heavy-p5'\] \}\}/);
  assert.match(aggregate, /CHANGED_NATIVE_TESTS_SELECTED: \$\{\{ needs\.classify\.outputs\['changed-native-web-tests'\] \}\}/);
  assert.match(aggregate, /P1B_SELECTED: \$\{\{ needs\.classify\.outputs\['heavy-p1b'\] \}\}/);
  assert.match(aggregate, /P6A_SELECTED: \$\{\{ needs\.classify\.outputs\['heavy-p6a'\] \}\}/);
  assert.match(aggregate, /require_gate ccsolver-p1b "\$P1B_SELECTED"/);
  assert.match(aggregate, /require_gate ccsolver-p6a "\$P6A_SELECTED"/);
  assert.match(aggregate, /require_gate build-qt5 "\$QT_SELECTED"/);
  assert.match(aggregate, /require_gate build-qt6 "\$QT_SELECTED"/);
  assert.match(aggregate, /require_gate build-sdl1 "\$SDL_SELECTED"/);
  assert.match(aggregate, /require_gate changed-native-web-tests "\$CHANGED_NATIVE_TESTS_SELECTED"/);
  assert.match(aggregate, /require_implication heavy-p5 "\$P5_HEAVY_SELECTED" p5 "\$P5_SELECTED"/);
  assert.match(aggregate, /require_implication p5 "\$P5_SELECTED" build-sdl1 "\$SDL_SELECTED"/);
  assert.match(
    aggregate,
    /require_implication changed-native-web-tests "\$CHANGED_NATIVE_TESTS_SELECTED" build-sdl1 "\$SDL_SELECTED"/,
  );
  assert.match(aggregate, /require_gate/);
  assert.match(aggregate, /selected but finished/);
  assert.match(aggregate, /exit 1/);
});

test("keeps expensive duplicate proofs off the critical path", async () => {
  const workflow = await read(".github/workflows/ubuntu-ci.yml");
  const p5ExecutionTest = await read(
    "web/src/ccsolver-runtime/compose/p5-review/buildKeyPyramidP5Execution.test.ts",
  );
  const staticCorpus = workflowJob(workflow, "ccsolver-static-corpus");
  const p1bPrepare = workflowJob(workflow, "ccsolver-p1b-prepare");
  const p1bShard = workflowJob(workflow, "ccsolver-p1b-shard");
  const p1b = workflowJob(workflow, "ccsolver-p1b");
  const runtime = workflowJob(workflow, "ccsolver-runtime");
  const p6a = workflowJob(workflow, "ccsolver-p6a");

  assert.match(staticCorpus, /outputs\['static-corpus-p1b'\]/);
  assert.match(staticCorpus, /ccsolver:integration:static/);
  assert.match(staticCorpus, /ccsolver:integration:corpus/);
  assert.doesNotMatch(staticCorpus, /ccsolver:p1b:check:prepared/);
  assert.match(p1bPrepare, /ccsolver:corpus:check:prepared/);
  assert.match(p1bPrepare, /p1b-shards\.mjs prepare/);
  assert.match(p1bShard, /p1b-shards\.mjs run/);
  assert.match(p1b, /p1b-shards\.mjs finalize/);
  assert.match(p1b, /outputs\['heavy-p1b'\]/);
  assert.doesNotMatch(`${p1bPrepare}\n${p1bShard}\n${p1b}`, /ccsolver:integration:(?:static|corpus)/);
  assert.doesNotMatch(`${p1bPrepare}\n${p1bShard}\n${p1b}`, /ccsolver:p1b:check:prepared/);
  assert.match(runtime, /ccsolver:integration:runtime/);
  assert.doesNotMatch(runtime, /ccsolver:integration:causal-proof/);
  assert.match(runtime, /outputs\['runtime-p6-evidence'\]/);
  assert.match(p6a, /outputs\['heavy-p6a'\]/);
  assert.match(p6a, /ccsolver:p6a:check:prepared/);
  const p6Presentation = workflowJob(workflow, "ccsolver-p6-presentation");
  assert.match(p6Presentation, /checkedP6aInputs\.test\.ts/);
  assert.match(p6Presentation, /buildP6aReviewOutputs\.test\.ts/);
  assert.match(p6Presentation, /ccsolver:p6a:attest:prepared/);
  assert.doesNotMatch(p6Presentation, /ccsolver:p6a:emit-dist:prepared/);
  assert.doesNotMatch(p6Presentation, /ccsolver:p6a:check:prepared/);
  const p4b = workflowJob(workflow, "ccsolver-p4b");
  assert.match(p4b, /p4bDossierIo\.test\.ts/);
  assert.match(p4b, /p4bDossierSafety\.test\.ts/);
  assert.match(p4b, /ccsolver:p4b:check:prepared/);
  const p5 = workflowJob(workflow, "ccsolver-p5-preflight");
  assert.match(p5, /build-sdl1/);
  assert.doesNotMatch(p5, /build-qt[56]/);
  assert.match(
    p5,
    /npm --workspace web run test -- --run \\\n\s+src\/ccsolver-runtime\/compose\/p5-review(?:\s|$)/,
  );
  assert.match(
    p5,
    /src\/ccsolver-runtime\/compose\/p5-review \\\n\s+--no-file-parallelism/,
  );
  assert.equal(
    (p5.match(/npm --workspace web run test/g) ?? []).length,
    1,
    "P5 scheduling must cover every test once without duplicating engine work",
  );
  assert.match(
    p5ExecutionTest,
    /300_000/,
    "each continuous target needs a measured five-minute bound on hosted runners",
  );
  assert.ok(p5.indexOf("actions/download-artifact@v4") < p5.indexOf("src/ccsolver-runtime/compose/p5-review"));
  assert.match(
    p5,
    /if: \$\{\{ needs\.classify\.outputs\['heavy-p5'\] == 'true' \}\}[\s\S]*ccsolver:p5:check:prepared/,
  );

  const workspace = workflowJob(workflow, "ccsolver-workspace");
  assert.match(workspace, /CHANGED_WEB_TESTS_JSON: \$\{\{ needs\.classify\.outputs\['changed-web-tests-json'\] \}\}/);
  assert.match(workspace, /run-changed-web-tests\.mjs[\s\S]*--lane workspace/);

  const changedNative = workflowJob(workflow, "changed-native-web-tests");
  assert.match(changedNative, /build-sdl1/);
  assert.match(changedNative, /outputs\['changed-native-web-tests'\]/);
  assert.match(changedNative, /actions\/download-artifact@v4/);
  assert.match(changedNative, /run-changed-web-tests\.mjs[\s\S]*--lane native/);
});

test("splits cheap integration from corpus, runtime, and review proofs", async () => {
  const rootPackage = JSON.parse(await read("package.json"));
  const scripts = rootPackage.scripts;

  for (const name of [
    "ccsolver:integration:smoke",
    "ccsolver:integration:static",
    "ccsolver:integration:corpus",
    "ccsolver:integration:runtime",
    "ccsolver:integration:reviews",
    "ccsolver:integration:causal-proof",
  ]) {
    assert.equal(typeof scripts[name], "string", `missing script: ${name}`);
  }
  assert.doesNotMatch(scripts["ccsolver:integration:smoke"], /corpusManifest|corpusValidityReport|measuredCorpusReport/);
  assert.doesNotMatch(scripts["ccsolver:integration:smoke"], /tworldSolverRuntimeAdapters|tworldSolverCausalJournal/);
  assert.doesNotMatch(scripts["ccsolver:integration:smoke"], /buildP2aRuntimeReviewOutputs|buildP3ReviewOutputs/);
  assert.doesNotMatch(scripts["ccsolver:integration:smoke"], /p5-review\/.*\.test\.ts/);
  assert.match(scripts["ccsolver:integration:corpus"], /corpusValidityReport/);
  assert.match(scripts["ccsolver:integration:corpus"], /measuredCorpusShardContract/);
  assert.match(scripts["ccsolver:integration:corpus"], /p1bCheckedArtifacts/);
  assert.match(scripts["ccsolver:integration:runtime"], /tworldSolverRuntimeAdapters/);
  assert.match(scripts["ccsolver:integration:reviews"], /buildP3ReviewOutputs/);
});

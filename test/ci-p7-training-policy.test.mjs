import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { PROOF_BINDINGS } from "../scripts/ci/resolve-proof-gates.mjs";
import {
  ORDERED_P7_PACK_IDS,
  P7_ACTIVE_PACKS_POLICY_PATH,
  loadP7ActivePackPolicy,
} from "../scripts/ci/p7-active-packs.mjs";
import { PROOF_SPEC_SCHEMA } from "../scripts/ci/proof-receipt.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const ENGINE_PROOFS = Object.freeze({
  p7c: Object.freeze({ packId: "cclp1", gate: "training-p7c" }),
  p7d: Object.freeze({ packId: "cclp4", gate: "training-p7d" }),
  p7e: Object.freeze({ packId: "cclp5", gate: "training-p7e" }),
});
const PRESENTATION_PROOF = "p7-presentation";
const SHARED_INPUTS = Object.freeze([
  "ccsolver/corpus/manifest.v1.json",
  "ccsolver/corpus/p1b-validity-report.v1.json",
]);

async function readJson(path) {
  return JSON.parse(await readFile(resolve(repositoryRoot, path), "utf8"));
}

async function readText(path) {
  return readFile(resolve(repositoryRoot, path), "utf8");
}

function workflowJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `missing workflow job: ${jobName}`);
  const following = workflow.slice(start + marker.length);
  const next = following.search(/^  [a-zA-Z0-9_-]+:\n/mu);
  return workflow.slice(start, next === -1 ? undefined : start + marker.length + next);
}

function filePaths(scopes) {
  return scopes.filter(({ kind }) => kind === "file").map(({ path }) => path);
}

function treePaths(scopes) {
  return scopes.filter(({ kind }) => kind === "tree").map(({ path }) => path);
}

function scopesCover(scopes, path) {
  return scopes.some((scope) => scope.kind === "file"
    ? scope.path === path
    : path.startsWith(`${scope.path}/`));
}

async function votingNames(parent, suffix) {
  return (await readdir(resolve(repositoryRoot, parent)))
    .filter((name) => name.startsWith("CCLP5Voting-") && name.endsWith(suffix))
    .map((name) => `${parent}/${name}`)
    .sort();
}

async function expectedRawSources(packId) {
  if (packId === "cclp1") {
    return [
      "data/CCLP1.dat",
      "save/CCLP1-lynx.dac.tws",
      "save/CCLP1.dac.tws",
      "sets/CCLP1-Lynx.dac",
      "sets/CCLP1-MS.dac",
    ].sort();
  }
  if (packId === "cclp4") {
    return [
      "data/CCLP4.dat",
      "save/CCLP4-lynx.dac.tws",
      "save/CCLP4.dac.tws",
      "sets/CCLP4-Lynx.dac",
      "sets/CCLP4-MS.dac",
    ].sort();
  }
  return [
    "data/CCLP5.dat",
    "save/CCLP5-lynx.dac.tws",
    "save/CCLP5.dac.tws",
    "sets/CCLP5-Lynx.dac",
    "sets/CCLP5-MS.dac",
    ...await votingNames("data", ".dat"),
    ...await votingNames("save", ".tws"),
    ...await votingNames("sets", ".dac"),
  ].sort();
}

test("binds three independent P7 engine proofs and one presentation proof", () => {
  for (const [proofId, { gate }] of Object.entries(ENGINE_PROOFS)) {
    assert.deepEqual(PROOF_BINDINGS[proofId], {
      gate,
      receiptPath: `scripts/ci/proof-receipts/${proofId}.receipt.json`,
      specPath: `scripts/ci/proof-specs/${proofId}.json`,
    });
  }
  assert.deepEqual(PROOF_BINDINGS[PRESENTATION_PROOF], {
    gate: "p7-presentation-attest",
    receiptPath: "scripts/ci/proof-receipts/p7-presentation.receipt.json",
    specPath: "scripts/ci/proof-specs/p7-presentation.json",
  });
});

test("keeps each P7 engine receipt graph-free and pack-source exact", async () => {
  const presentationOnly = [
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPlayerGraphIo.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationContract.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerCli.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerCore.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationAuthorityIo.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationProofReceipt.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunManifest.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerBinary.ts",
    "web/src/ccsolver-runtime/compose/p7b-training-replays/p7bReplayPresentation.ts",
    "web/src/ccsolver-runtime/compose/p7b-training-review/p7SharedPlayerGraphAttestation.ts",
    "web/vite.config.ts",
  ];
  for (const [proofId, { packId }] of Object.entries(ENGINE_PROOFS)) {
    const spec = await readJson(PROOF_BINDINGS[proofId].specPath);
    const inputs = filePaths(spec.inputScopes);
    const rawInputs = inputs.filter((path) => /^(?:data|save|sets)\//u.test(path)).sort();
    assert.equal(spec.schema, PROOF_SPEC_SCHEMA);
    assert.equal(spec.proofId, proofId);
    assert.equal(spec.outputManifestPath, null);
    assert.deepEqual(spec.outputScopes, [{
      kind: "file",
      path: `ccsolver/fixtures/golden/p7b/execution-authorities/${packId}.json`,
    }]);
    assert.deepEqual(SHARED_INPUTS.filter((path) => !inputs.includes(path)), []);
    assert.deepEqual(rawInputs, await expectedRawSources(packId));
    assert.deepEqual(presentationOnly.filter((path) => inputs.includes(path)), []);
    assert.equal(
      scopesCover(spec.inputScopes, "web/src/game-core/api/p7bReplayPresentation.ts"),
      false,
      `${proofId}: presentation DTO leaked into engine authority`,
    );
    assert.equal(
      scopesCover(spec.inputScopes, "web/src/game-core/api/p7TrainingBrowserReplay.ts"),
      true,
      `${proofId}: semantic browser transport is unbound`,
    );
    assert.match(
      spec.producerContract,
      /prepare\|8x\(shard\)\|assemble\|reduce\|check\|write\|attest/u,
    );
    for (const engineSource of [
      "web/src/ccsolver-runtime/compose/p7-training-execution/p7TrainingEventAccumulator.ts",
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCli.ts",
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingEngineRunnerCore.ts",
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingExecutionAuthorityIo.ts",
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingNodeEntrypoint.ts",
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingRunnerContract.ts",
      "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingSidecarFilesystem.ts",
      "web/src/ccsolver-runtime/compose/p7b-training-review/p7TrainingExecutionIndex.ts",
      "web/vite.p7-training-engine-runner.config.ts",
    ]) assert.ok(inputs.includes(engineSource), `${proofId}: ${engineSource}`);
  }
  assert.equal((await expectedRawSources("cclp5")).length, 175);
});

test("binds graph and all active checked pack leaves only in the P7 presentation receipt", async () => {
  const spec = await readJson(PROOF_BINDINGS[PRESENTATION_PROOF].specPath);
  const inputs = filePaths(spec.inputScopes);
  const { activePacks } = await loadP7ActivePackPolicy({ root: repositoryRoot });
  assert.equal(spec.schema, PROOF_SPEC_SCHEMA);
  assert.equal(spec.proofId, PRESENTATION_PROOF);
  assert.equal(spec.outputManifestPath, null);
  assert.deepEqual(
    treePaths(spec.outputScopes),
    activePacks.map((packId) => `ccsolver/fixtures/golden/p7b/training-packs/${packId}`),
  );
  assert.deepEqual(filePaths(spec.outputScopes), [
    ...activePacks.map((packId) => (
      `ccsolver/fixtures/golden/p7b/presentation-authorities/${packId}.json`
    )),
    "ccsolver/fixtures/golden/p7b/shared-player/p7b-replay-player-graph.json",
  ]);
  assert.ok(inputs.includes(P7_ACTIVE_PACKS_POLICY_PATH));
  for (const packId of ORDERED_P7_PACK_IDS) {
    assert.equal(
      inputs.includes(`ccsolver/fixtures/golden/p7b/execution-authorities/${packId}.json`),
      activePacks.includes(packId),
      packId,
    );
  }
  for (const entryPath of [
    "web/index.html",
    "web/src/bootstrap/browser/main.tsx",
  ]) assert.ok(inputs.includes(entryPath), entryPath);
  for (const externalTree of ["data", "fixtures/characterization/v1", "res", "sets"]) {
    assert.equal(treePaths(spec.inputScopes).includes(externalTree), false, externalTree);
  }
  for (const artworkPath of [
    "res/atiles.bmp",
    "res/expansion_artwork/expanded.json",
    "res/expansion_artwork/expanded.png",
    "res/tiles.bmp",
  ]) assert.ok(inputs.includes(artworkPath), artworkPath);
  assert.equal(inputs.includes("data/CHIPS.dat"), false);
  for (const presentationSource of [
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPlayerGraphIo.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingNodeEntrypoint.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationContract.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerCli.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerCore.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationAuthorityIo.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationProofReceipt.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunManifest.ts",
    "web/src/ccsolver-runtime/compose/p7-training-runner/p7TrainingPresentationRunnerBinary.ts",
    "web/src/ccsolver-runtime/compose/p7b-training-replays/p7bReplayPresentation.ts",
    "web/src/ccsolver-runtime/compose/p7b-training-review/p7SharedPlayerGraphAttestation.ts",
    "web/src/ccsolver-runtime/compose/p7b-training-review/runP7bTrainingPackDist.ts",
    "web/vite.config.ts",
    "web/vite.p7-training-presentation-runner.config.ts",
  ]) assert.ok(scopesCover(spec.inputScopes, presentationSource), presentationSource);
  assert.match(
    spec.producerContract,
    /p7-training-presentation-runner prepare\|graph-write\|graph-check\|graph-attest\|build\|write\|check\|attest/u,
  );
  assert.match(spec.producerContract, /^BASE_PATH=\/tworld\/ npm run build/u);
});

test("bundles the engine and presentation runners as independent single files", async () => {
  const rootPackage = await readJson("package.json");
  const webPackage = await readJson("web/package.json");
  assert.equal(
    rootPackage.scripts["ccsolver:p7-training:bundle:engine"],
    "npm --workspace web run ccsolver:p7-training:bundle:engine",
  );
  assert.equal(
    rootPackage.scripts["ccsolver:p7-training:bundle:presentation"],
    "npm --workspace web run ccsolver:p7-training:bundle:presentation",
  );
  assert.equal(
    webPackage.scripts["ccsolver:p7-training:bundle:engine"],
    "vite build --config vite.p7-training-engine-runner.config.ts",
  );
  assert.equal(
    webPackage.scripts["ccsolver:p7-training:bundle:presentation"],
    "vite build --config vite.p7-training-presentation-runner.config.ts",
  );
  assert.equal(
    rootPackage.scripts["ccsolver:p7-training:emit-dist:prepared"],
    "npm --workspace web run ccsolver:p7-training:emit-dist",
  );
  assert.equal(
    webPackage.scripts["ccsolver:p7-training:emit-dist"],
    "vite-node --script src/ccsolver-runtime/compose/p7b-training-review/runP7bTrainingPackDist.ts --root .. --packs cclp1,cclp4,cclp5",
  );
  for (const [configPath, entry, output] of [
    [
      "web/vite.p7-training-engine-runner.config.ts",
      "p7TrainingEngineRunnerCli.ts",
      "p7-training-engine-runner.mjs",
    ],
    [
      "web/vite.p7-training-presentation-runner.config.ts",
      "p7TrainingPresentationRunnerCli.ts",
      "p7-training-presentation-runner.mjs",
    ],
  ]) {
    const config = await readText(configPath);
    assert.match(config, new RegExp(entry.replace(".", "\\.")));
    assert.match(config, new RegExp(output.replace(".", "\\.")));
    assert.match(config, /P7_TRAINING_RUNNER_OUT_DIR/u);
    assert.match(config, /target:\s*"node22"/u);
    assert.match(config, /inlineDynamicImports:\s*true/u);
    assert.match(config, /emptyOutDir:\s*false/u);
    assert.doesNotMatch(config, /input:\s*\{/u);
  }
});

test("wires one P7 build coordinator, exactly eight workers, and one stable reducer", async () => {
  const workflow = await readText(".github/workflows/ubuntu-ci.yml");
  const classify = workflowJob(workflow, "classify");
  for (const output of [
    "p7-engine-packs-json",
    "p7-needs-shards",
    "p7-selected",
    "attest-p7-presentation",
    "reuse-p7c",
    "reuse-p7d",
    "reuse-p7e",
    "reuse-p7-presentation",
  ]) assert.match(classify, new RegExp(`${output}:`), output);
  assert.match(classify, /test\/ci-p7-active-packs\.test\.mjs/u);
  assert.match(classify, /test\/ci-p7-training-policy\.test\.mjs/u);

  const prepare = workflowJob(workflow, "ccsolver-p7-training-prepare");
  const shard = workflowJob(workflow, "ccsolver-p7-training-shard");
  const stable = workflowJob(workflow, "ccsolver-p7-training");
  const p7Graph = `${prepare}\n${shard}\n${stable}`;
  assert.match(prepare, /outputs\['p7-selected'\] == 'true'/u);
  assert.equal((prepare.match(/npm ci --include=optional/gu) ?? []).length, 1);
  assert.equal((p7Graph.match(/npm ci --include=optional/gu) ?? []).length, 1);
  assert.equal((p7Graph.match(/npm run ccsolver:build/gu) ?? []).length, 1);
  assert.equal((p7Graph.match(/npm run build/gu) ?? []).length, 1);
  assert.match(prepare, /ccsolver:p7-training:bundle:engine/u);
  assert.match(prepare, /ccsolver:p7-training:bundle:presentation/u);
  assert.match(prepare, /test\/ci-p7-player-graph-build-stability\.test\.mjs/u);
  assert.match(prepare, /test\/ci-p7-player-worker-closure\.test\.mjs/u);
  assert.match(prepare, /p7TrainingPlayerGraphProductionBuild\.test\.ts/u);
  assert.match(prepare, /RUNNER_PATH="\$\(realpath/u);
  assert.match(prepare, /ln -s "\$RUNNER_PATH" "\$LINK_PATH"/u);
  assert.match(prepare, /contains a symbolic link/u);
  assert.match(prepare, /PRESENTATION_RUNNER=.*p7-training-presentation-runner\.mjs/u);
  assert.match(prepare, /node "\$PRESENTATION_RUNNER" prepare/u);
  assert.match(prepare, /node "\$PRESENTATION_RUNNER" graph-check/u);
  assert.match(prepare, /p7-training-engine-runner\.mjs" prepare/u);
  assert.match(prepare, /--presentation-artifacts/u);
  assert.match(prepare, /BASE_PATH:\s*\/tworld\//u);
  const prepareRoots = prepare.indexOf('mkdir -p "$ENGINE_ARTIFACTS" "$PRESENTATION_ARTIFACTS"');
  const presentationPrepare = prepare.indexOf('node "$PRESENTATION_RUNNER" prepare');
  assert.ok(prepareRoots >= 0 && prepareRoots < presentationPrepare);
  assert.match(prepare, /P7_NEEDS_SHARDS/u);
  assert.match(prepare, /p7-training-plan-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}-\$\{\{ github\.sha \}\}/u);
  assert.match(prepare, /retention-days:\s*1/u);
  assert.match(prepare, /overwrite:\s*false/u);

  assert.match(shard, /shard_index:\s*\[0, 1, 2, 3, 4, 5, 6, 7\]/u);
  assert.match(shard, /max-parallel:\s*8/u);
  assert.match(shard, /p7-training-engine-runner\.mjs" shard/u);
  assert.match(shard, /--shard "\$SHARD_INDEX"/u);
  assert.doesNotMatch(shard, /npm ci|npm run|cache:/u);
  assert.equal((shard.match(/actions\/upload-artifact@v4/gu) ?? []).length, 1);

  assert.match(stable, /always\(\).*outputs\['p7-selected'\] == 'true'/u);
  assert.match(stable, /PREPARE_RESULT/u);
  assert.match(stable, /SHARD_RESULT/u);
  assert.match(stable, /P7_NEEDS_SHARDS/u);
  assert.equal((stable.match(/actions\/download-artifact@v4/gu) ?? []).length, 9);
  for (const command of ["assemble", "reduce", "check", "attest"]) {
    assert.match(stable, new RegExp(`node "\\$ENGINE_RUNNER" ${command}`));
  }
  assert.doesNotMatch(stable, /node "\$ENGINE_RUNNER" write/u);
  for (const command of ["build", "check", "graph-attest", "attest"]) {
    assert.match(stable, new RegExp(`node "\\$PRESENTATION_RUNNER" ${command}`));
  }
  assert.match(stable, /--presentation-artifacts/u);
  assert.match(stable, /p7-active-packs\.mjs[\s\S]*--format proof-ids-json/u);
  assert.match(stable, /while IFS= read -r PROOF_ID/u);
  assert.match(stable, /proof-specs\/\$\{PROOF_ID\}\.json/u);
  assert.match(stable, /proof-receipts\/\$\{PROOF_ID\}\.receipt\.json/u);
  assert.match(stable, /p7-active-packs\.mjs[\s\S]*--format packs-csv/u);
  assert.match(stable, /--packs "\$ACTIVE_PACKS"/u);
  assert.doesNotMatch(stable, /for PROOF_ID in p7c p7d p7e|--packs cclp1,cclp4,cclp5/u);
  assert.doesNotMatch(stable, /npm ci|npm run|cache:/u);
  assert.doesNotMatch(p7Graph, /continue-on-error|merge-multiple|pattern:/u);

  const aggregate = workflowJob(workflow, "web-and-ccsolver");
  assert.match(aggregate, /ccsolver-p7-training/u);
  assert.doesNotMatch(aggregate, /ccsolver-p7-training-(?:prepare|shard)/u);
  assert.match(aggregate, /P7_TRAINING_SELECTED/u);
  assert.match(aggregate, /P7_TRAINING_RESULT/u);
});

test("publishes only freshly attested checked P7 packs on Pages", async () => {
  const workflow = await readText(".github/workflows/github-pages.yml");
  const deploy = workflowJob(workflow, "deploy");
  assert.match(workflow, /timeout-minutes:\s*20/u);
  assert.match(workflow, /BASE_PATH:\s*\/tworld\//u);
  assert.doesNotMatch(workflow, /BASE_PATH:\s*\/\$\{\{/u);
  assert.match(workflow, /push:\n\s+branches:\n\s+- master/u);
  assert.match(deploy, /if: github\.ref == 'refs\/heads\/master'/u);
  assert.match(workflow, /ccsolver:p7-training:bundle:presentation/u);
  assert.match(workflow, /PRESENTATION_RUNNER=.*p7-training-presentation-runner\.mjs/u);
  assert.match(workflow, /node "\$PRESENTATION_RUNNER" prepare/u);
  assert.match(workflow, /node "\$PRESENTATION_RUNNER" graph-check/u);
  assert.match(workflow, /node "\$PRESENTATION_RUNNER" graph-attest/u);
  assert.match(
    workflow,
    /node "\$PRESENTATION_RUNNER" attest[\s\S]*--packs "\$ACTIVE_PACKS"/u,
  );
  assert.match(workflow, /p7-active-packs\.mjs[\s\S]*--format packs-csv/u);
  assert.match(
    workflow,
    /npm exec --workspace web -- vite-node --script[\s\S]*runP7bTrainingPackDist\.ts[\s\S]*--packs "\$ACTIVE_PACKS"/u,
  );
  assert.match(workflow, /for PACK_ID in "\$\{ACTIVE_PACK_IDS\[@\]\}"/u);
  assert.doesNotMatch(workflow, /--packs cclp1,cclp4,cclp5|for PACK_ID in cclp1 cclp4 cclp5/u);
  for (const required of [
    "browser.json",
    "execution-index.json",
    "index.html",
    "manifest.json",
    "pack-summary.json",
    "proof-index.json",
  ]) assert.match(workflow, new RegExp(required.replace(".", "\\.")));
  const build = workflow.indexOf("run: npm run build");
  const artifactsRoot = workflow.indexOf('mkdir -p "$PRESENTATION_ARTIFACTS"');
  const presentationPrepare = workflow.indexOf('node "$PRESENTATION_RUNNER" prepare');
  const graphCheck = workflow.indexOf('node "$PRESENTATION_RUNNER" graph-check');
  const attest = workflow.indexOf('node "$PRESENTATION_RUNNER" attest');
  const p4bEmit = workflow.indexOf("ccsolver:p4b:emit-dist:prepared");
  const p6aEmit = workflow.indexOf("ccsolver:p6a:emit-dist:prepared");
  const p7aEmit = workflow.indexOf("ccsolver:p7a:emit-dist:prepared");
  const emit = workflow.indexOf("runP7bTrainingPackDist.ts");
  assert.ok(build < artifactsRoot && artifactsRoot < presentationPrepare);
  assert.ok(build < graphCheck && graphCheck < attest && attest < emit);
  assert.ok(p4bEmit < p6aEmit && p6aEmit < p7aEmit && p7aEmit < emit);
  assert.doesNotMatch(workflow, /p7-training-engine-runner\.mjs (?:prepare|shard|assemble|reduce)/u);
});

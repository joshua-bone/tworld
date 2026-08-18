import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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

test("registers CCSolver as a first-class root workspace", async () => {
  const rootPackage = await readJson("package.json");
  assert.deepEqual(new Set(rootPackage.workspaces), new Set(["web", "ccsolver"]));
  assert.equal(rootPackage.packageManager, "npm@10.9.4");
  assert.equal(rootPackage.engines.node, "22.x");
  assert.equal(rootPackage.engines.npm, "10.x");
  assert.equal((await readFile(resolve(repositoryRoot, ".nvmrc"), "utf8")).trim(), "22");

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
  assert.match(rootPackage.scripts["ccsolver:integration"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:corpus:check"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:corpus:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:analysis:check"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:analysis:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p1b:check"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p1b:generate"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p2a:check"], /--workspace web/);
  assert.match(rootPackage.scripts["ccsolver:p2a:generate"], /--workspace web/);
  for (const command of [
    "ccsolver:corpus:check",
    "ccsolver:corpus:generate",
    "ccsolver:analysis:check",
    "ccsolver:analysis:generate",
    "ccsolver:p1b:check",
    "ccsolver:p1b:generate",
    "ccsolver:p2a:check",
    "ccsolver:p2a:generate",
  ]) {
    assert.match(rootPackage.scripts[command], /npm run ccsolver:build/);
  }

  const webPackage = await readJson("web/package.json");
  assert.equal(
    webPackage.scripts["ccsolver:p2a"],
    "vite-node src/ccsolver-runtime/compose/p2a-review/runP2aRuntimeReviewPackets.ts",
  );
  assert.equal(webPackage.scripts["ccsolver:p2a:check"], "npm run ccsolver:p2a -- --check");
  assert.equal(webPackage.scripts["ccsolver:p2a:generate"], "npm run ccsolver:p2a -- --write");
  for (const p2aTest of [
    "src/ccsolver-runtime/compose/sourceValidity/analyzeTworldSolverSourceScope.test.ts",
    "src/ccsolver-runtime/compose/sourceValidity/tworldSolverSourceScopeAcceptance.test.ts",
    "src/ccsolver-runtime/impl/runtime/createSolverRuntimeKernel.test.ts",
    "src/ccsolver-runtime/compose/runtime/tworldSolverRuntimeAdapters.test.ts",
    "src/ccsolver-runtime/compose/runtime/tworldSolverRuntimeSemantics.test.ts",
    "src/ccsolver-runtime/compose/p2a-review/buildP2aRuntimeReviewPacket.test.ts",
    "src/ccsolver-runtime/compose/p2a-review/buildP2aRuntimeReviewOutputs.test.ts",
  ]) {
    assert.match(rootPackage.scripts["ccsolver:integration"], new RegExp(
      p2aTest.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    ));
  }
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
    new Set([".", "./domain", "./application", "./analyze", "./ports", "./adapters/web-crypto"]),
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
  assert.match(workflow, /run: npm run build/);
  assert.doesNotMatch(workflow, /web\/package-lock\.json/);
  assert.doesNotMatch(workflow, /working-directory: web/);
  assert.doesNotMatch(workflow, /npm install --no-save/);
});

test("runs the workspace foundation gate on pull requests", async () => {
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/ubuntu-ci.yml"),
    "utf8",
  );

  assert.match(workflow, /web-and-ccsolver:/);
  assert.match(workflow, /cache-dependency-path: package-lock\.json/);
  assert.match(workflow, /npm ci --include=optional/);
  for (const command of [
    "npm run ccsolver:typecheck",
    "npm run ccsolver:typecheck:browser",
    "npm run ccsolver:test",
    "npm run ccsolver:conformance",
    "npm run ccsolver:build",
    "npm run ccsolver:facade",
    "npm run ccsolver:integration",
    "npm run ccsolver:corpus:check",
    "npm run ccsolver:analysis:check",
    "npm run ccsolver:p1b:check",
    "npm --workspace web run typecheck:tools",
    "npm run ccsolver:cli -- --help",
    "npm run ccsolver:dossier -- --help",
    "npm run typecheck",
    "npm run build",
  ]) {
    assert.match(workflow, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(
    workflow,
    /- name: Check P1B full-corpus artifacts\n\s+timeout-minutes: 90\n\s+env:\n\s+TWORLD_P1B_ANALYSIS_JOBS: 4\n\s+run: npm run ccsolver:p1b:check/,
  );
  assert.match(
    workflow,
    /- name: Check P2A runtime observation artifacts\n\s+timeout-minutes: 10\n\s+run: npm run ccsolver:p2a:check/,
  );
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

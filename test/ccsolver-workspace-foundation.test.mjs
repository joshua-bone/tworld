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
    "ccsolver:test",
    "ccsolver:cli",
    "ccsolver:dossier",
  ]) {
    assert.match(rootPackage.scripts[script], /--workspace @tworld\/ccsolver/);
  }
  assert.match(rootPackage.scripts["ccsolver:facade"], /--workspace web/);
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
    new Set([".", "./domain", "./application", "./ports"]),
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
    "npm run ccsolver:test",
    "npm run ccsolver:build",
    "npm run ccsolver:facade",
    "npm run ccsolver:cli -- --help",
    "npm run ccsolver:dossier -- --help",
    "npm run typecheck",
    "npm run build",
  ]) {
    assert.match(workflow, new RegExp(command.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

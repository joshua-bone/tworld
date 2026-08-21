import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { classifyChangedPaths } from "../scripts/ci/changed-gates.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(repositoryRoot, "web");
const playerEntry = "src/bootstrap/browser/p7bReplayPlayer.tsx";
const webRequire = createRequire(resolve(webRoot, "package.json"));
const { build } = await import(pathToFileURL(webRequire.resolve("vite")).href);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function stringArray(value, label) {
  if (value === undefined) return [];
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.every((entry) => typeof entry === "string"), `${label} must contain strings`);
  return value;
}

async function reachableGraph(distRoot, entryKey = playerEntry) {
  const manifestText = await readFile(resolve(distRoot, ".vite/manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  const pending = [entryKey];
  const keys = new Set();
  const paths = new Set();
  while (pending.length > 0) {
    const key = pending.shift();
    if (keys.has(key)) continue;
    keys.add(key);
    const entry = manifest[key];
    assert.ok(entry && typeof entry === "object", `missing P7 Vite entry: ${key}`);
    assert.equal(typeof entry.file, "string", `missing P7 Vite file: ${key}`);
    paths.add(entry.file);
    for (const field of ["assets", "css"]) {
      for (const path of stringArray(entry[field], `${key}.${field}`)) paths.add(path);
    }
    for (const field of ["dynamicImports", "imports"]) {
      pending.push(...stringArray(entry[field], `${key}.${field}`));
    }
  }
  const projection = Object.fromEntries([...keys].sort().map((key) => [key, manifest[key]]));
  const files = await Promise.all([...paths].sort().map(async (path) => ({
    path,
    digest: sha256(await readFile(resolve(distRoot, path))),
  })));
  return {
    files,
    keys: [...keys].sort(),
    manifest: JSON.stringify(projection),
  };
}

function scopeCoversPath(scope, path) {
  if (scope.kind === "file") return scope.path === path;
  if (path !== scope.path && !path.startsWith(`${scope.path}/`)) return false;
  return !(scope.excludeFileSuffixes ?? []).some((suffix) => path.endsWith(suffix));
}

function repositorySourcePath(manifestKey) {
  const path = manifestKey.split("?", 1)[0];
  return path.startsWith("../") ? path.slice(3) : null;
}

async function builtJavaScriptContains(distRoot, marker) {
  const { files } = await reachableGraph(distRoot, "index.html");
  for (const { path } of files.filter(({ path }) => path.endsWith(".js"))) {
    if ((await readFile(resolve(distRoot, path), "utf8")).includes(marker)) return true;
  }
  return false;
}

async function buildWithCommit(outDir, commit, base = "/tworld/") {
  await build({
    base,
    build: {
      emptyOutDir: true,
      outDir,
    },
    configFile: resolve(webRoot, "vite.config.ts"),
    define: {
      __TWORLD_GIT_COMMIT__: JSON.stringify(commit),
    },
    logLevel: "silent",
    root: webRoot,
  });
}

async function buildWithHostileCoEntry(outDir, commit) {
  const mainPath = resolve(webRoot, "src/bootstrap/browser/main.tsx");
  await build({
    base: "/tworld/",
    build: {
      emptyOutDir: true,
      outDir,
    },
    configFile: resolve(webRoot, "vite.config.ts"),
    define: {
      __TWORLD_GIT_COMMIT__: JSON.stringify(commit),
    },
    logLevel: "silent",
    plugins: [{
      enforce: "pre",
      name: "hostile-p7-co-entry-mutation",
      transform(code, id) {
        if (id.split("?", 1)[0] !== mainPath) return null;
        return `${code}\nimport "./p7bReplayPlayer";\n`;
      },
    }],
    root: webRoot,
  });
}

test("P7 reachable build graph ignores the normal app commit injection", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tworld-p7-player-graph-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const first = resolve(root, "first");
  const second = resolve(root, "second");
  const rootBase = resolve(root, "root-base");
  const hostileCoEntry = resolve(root, "hostile-co-entry");
  const firstCommit = "111111111111";
  const secondCommit = "222222222222";

  await buildWithCommit(first, firstCommit);
  await buildWithCommit(second, secondCommit);
  await buildWithCommit(rootBase, firstCommit, "/");
  await buildWithHostileCoEntry(hostileCoEntry, firstCommit);

  assert.equal(await builtJavaScriptContains(first, firstCommit), true);
  assert.equal(await builtJavaScriptContains(second, secondCommit), true);
  assert.notEqual(
    await readFile(resolve(first, ".vite/manifest.json"), "utf8"),
    await readFile(resolve(second, ".vite/manifest.json"), "utf8"),
    "normal app manifest must retain injected build provenance",
  );
  assert.deepEqual(await reachableGraph(first), await reachableGraph(second));
  assert.notDeepEqual(
    await reachableGraph(first),
    await reachableGraph(hostileCoEntry),
    "a normal-app co-entry mutation can alter the P7 chunk graph",
  );
  assert.notDeepEqual(
    await reachableGraph(first),
    await reachableGraph(rootBase),
    "the checked /tworld/ graph must reject a root-base build",
  );

  const presentationSpec = JSON.parse(await readFile(
    resolve(repositoryRoot, "scripts/ci/proof-specs/p7-presentation.json"),
    "utf8",
  ));
  const reachableSources = [...new Set(
    [
      ...(await reachableGraph(first)).keys,
      ...(await reachableGraph(hostileCoEntry)).keys,
    ]
      .map(repositorySourcePath)
      .filter((path) => path !== null),
  )].sort();
  const manifestExpandedSources = reachableSources.filter((path) => (
    path.startsWith("data/")
    || path.startsWith("fixtures/characterization/v1/")
    || path.startsWith("sets/")
  ));
  assert.ok(manifestExpandedSources.length > 0);
  assert.deepEqual(
    presentationSpec.inputScopes
      .filter((scope) => scope.kind === "file")
      .map(({ path }) => path)
      .filter((path) => (
        path.startsWith("data/")
        || path.startsWith("fixtures/characterization/v1/")
        || path.startsWith("sets/")
      ))
      .sort(),
    manifestExpandedSources,
    "the receipt must bind exactly every Vite-expanded data, fixture, and set source",
  );
  assert.equal(
    presentationSpec.inputScopes.some((scope) => scopeCoversPath(
      scope,
      "web/src/bootstrap/browser/main.tsx",
    )),
    true,
  );
  assert.equal(
    classifyChangedPaths(["web/src/bootstrap/browser/main.tsx"])
      .gates["p7-presentation-attest"],
    true,
    "a co-entry mutation capable of changing the graph must select presentation attestation",
  );
});

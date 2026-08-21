import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repositoryRoot = resolve(import.meta.dirname, "..");
const webRoot = resolve(repositoryRoot, "web");
const webRequire = createRequire(resolve(webRoot, "package.json"));
const { build } = await import(pathToFileURL(webRequire.resolve("vite")).href);

function stringArray(value, label) {
  if (value === undefined) return [];
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.every((entry) => typeof entry === "string"), `${label} must contain strings`);
  return value;
}

async function reachableFiles(distRoot, entryKey) {
  const manifest = JSON.parse(await readFile(resolve(distRoot, ".vite/manifest.json"), "utf8"));
  const pending = [entryKey];
  const keys = new Set();
  const paths = new Set();
  while (pending.length > 0) {
    const key = pending.shift();
    if (keys.has(key)) continue;
    keys.add(key);
    const entry = manifest[key];
    assert.ok(entry && typeof entry === "object", `missing Vite manifest entry: ${key}`);
    assert.equal(typeof entry.file, "string", `missing Vite output file: ${key}`);
    paths.add(entry.file);
    for (const field of ["assets", "css"]) {
      for (const path of stringArray(entry[field], `${key}.${field}`)) paths.add(path);
    }
    for (const field of ["dynamicImports", "imports"]) {
      pending.push(...stringArray(entry[field], `${key}.${field}`));
    }
  }
  return [...paths].sort();
}

async function javascriptText(distRoot, paths) {
  return Promise.all(paths
    .filter((path) => path.endsWith(".js"))
    .map((path) => readFile(resolve(distRoot, path), "utf8")));
}

async function assetBearingText(distRoot, paths) {
  return Promise.all(paths
    .filter((path) => path.endsWith(".js") || path.endsWith(".css"))
    .map((path) => readFile(resolve(distRoot, path), "utf8")));
}

function literalTworldAssetPaths(sources) {
  const paths = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(/\/tworld\/(assets\/[A-Za-z0-9._/-]+)/gu)) {
      paths.add(match[1]);
    }
  }
  return [...paths].sort();
}

test("the built P7 player has no worker dependency while the normal app remains worker-backed", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "tworld-p7-player-worker-"));
  t.after(() => rm(root, { force: true, recursive: true }));
  const distRoot = resolve(root, "dist");

  await build({
    base: "/tworld/",
    build: { emptyOutDir: true, outDir: distRoot },
    configFile: resolve(webRoot, "vite.config.ts"),
    logLevel: "silent",
    root: webRoot,
  });

  const emittedPaths = await readdir(distRoot, { recursive: true });
  const workerPath = emittedPaths.find((path) => /^assets\/interactiveGame\.worker-[\w-]+\.js$/u.test(path));
  assert.ok(workerPath, "normal app build must emit the interactive gameplay worker");

  const p7Paths = await reachableFiles(distRoot, "src/bootstrap/browser/p7bReplayPlayer.tsx");
  const normalAppPaths = await reachableFiles(distRoot, "index.html");
  const p7JavaScript = await javascriptText(distRoot, p7Paths);
  const normalAppJavaScript = await javascriptText(distRoot, normalAppPaths);
  const p7LiteralAssets = literalTworldAssetPaths(await assetBearingText(distRoot, p7Paths));
  const workerFile = workerPath.split("/").at(-1);

  assert.ok(p7LiteralAssets.length > 0, "P7 reachable JavaScript or CSS must reference emitted assets");
  assert.deepEqual(
    p7LiteralAssets.filter((path) => !p7Paths.includes(path)),
    [],
    "every literal /tworld/assets URL in P7 JavaScript or CSS must be manifest-reachable",
  );
  assert.equal(p7Paths.includes(workerPath), false);
  assert.equal(
    p7JavaScript.some((source) => source.includes(workerFile)),
    false,
    "P7 reachable JavaScript must not retain a gameplay-worker URL",
  );
  assert.equal(
    normalAppJavaScript.some((source) => source.includes(workerFile)),
    true,
    "normal app JavaScript must retain its gameplay-worker URL",
  );
});

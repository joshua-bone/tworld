import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  GATE_IDS,
  classifyChangedPaths,
  resolveChangedPaths,
} from "../scripts/ci/changed-gates.mjs";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(import.meta.dirname, "..");
const classifierPath = resolve(repositoryRoot, "scripts/ci/changed-gates.mjs");

const gateIds = [
  "native",
  "workspace",
  "static-corpus-p1b",
  "p5",
  "reviews-p2a-p4",
  "runtime-p6-evidence",
  "p6-presentation-attest",
  "p4b",
  "browser",
];

function enabled(...ids) {
  return Object.fromEntries(gateIds.map((id) => [id, ids.includes(id)]));
}

function assertSelection(paths, expected, message) {
  const result = classifyChangedPaths(paths);
  assert.deepEqual(result.gates, enabled(...expected), message);
  return result;
}

test("publishes a stable, workflow-facing gate vocabulary", () => {
  assert.deepEqual(GATE_IDS, gateIds);
});

test("treats documentation-only changes as fast workspace work", () => {
  const result = assertSelection(
    ["./ccsolver/docs/p5-p4b-key-pyramid.md", "README.md", "docs/CCLP1/index.html"],
    ["workspace"],
  );

  assert.equal(result.all, false);
  assert.deepEqual(result.paths, [
    "README.md",
    "ccsolver/docs/p5-p4b-key-pyramid.md",
    "docs/CCLP1/index.html",
  ]);
  assert.deepEqual(result.unknownPaths, []);
});

test("isolates P4B page and artwork changes from expensive engine proofs", () => {
  assertSelection(
    [
      "web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.ts",
      "web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierVisuals.ts",
      "web/src/ccsolver-runtime/compose/p4b-dossier/p4bLegacyArtwork.ts",
    ],
    ["workspace", "p6-presentation-attest", "p4b", "browser"],
  );
});

test("routes P6 page and IO changes through presentation attestation and browser checks", () => {
  assertSelection(
    [
      "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewPage.ts",
      "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewIo.test.ts",
    ],
    ["workspace", "p6-presentation-attest", "browser"],
  );
});

test("routes causal runtime, event, and alignment changes through P6 evidence", () => {
  assertSelection(
    [
      "web/src/ccsolver-runtime/compose/runtime/tworldCausalJournal.ts",
      "ccsolver/src/events/validateCausalEventJournal.ts",
      "ccsolver/src/alignment/alignSemanticEvents.ts",
    ],
    ["workspace", "runtime-p6-evidence", "p6-presentation-attest", "browser"],
  );
});

test("routes P5 source and checked output changes through P5, P4B, and P6", () => {
  const downstream = [
    "workspace",
    "native",
    "p5",
    "runtime-p6-evidence",
    "p6-presentation-attest",
    "p4b",
    "browser",
  ];

  assertSelection(
    ["web/src/ccsolver-runtime/compose/p5-review/buildKeyPyramidP5Route.ts"],
    downstream,
  );
  assertSelection(
    ["ccsolver/fixtures/golden/p5/cclp1-001/ms/route.json"],
    downstream,
  );
  assertSelection(["sets/CCLP1-MS.dac"], downstream);
  assertSelection(["sets/CCLP1-Lynx.dac"], downstream);
});

test("routes broad corpus, static analysis, catalog, and data changes through P1B downstream", () => {
  const downstream = [
    "workspace",
    "native",
    "static-corpus-p1b",
    "p5",
    "reviews-p2a-p4",
    "runtime-p6-evidence",
    "p6-presentation-attest",
    "p4b",
    "browser",
  ];

  assertSelection(["ccsolver/corpus/manifest.v1.json"], downstream);
  assertSelection(["ccsolver/src/analyze/staticTopologyAnalyzer.ts"], downstream);
  assertSelection(["web/src/level-catalog/impl/catalog.ts"], downstream);
  assertSelection(["data/CCLP2.dat"], downstream);
  assertSelection(["data/CCLP1.dat"], downstream);
});

test("keeps the baseline workspace and smoke checks on every specialized code lane", () => {
  for (const path of [
    "web/src/ccsolver-runtime/compose/sourceValidity/tworldSolverSourceScopeAcceptance.test.ts",
    "web/src/ccsolver-runtime/compose/p5-review/buildP5ReviewOutputs.test.ts",
    "web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.ts",
    "web/src/ccsolver-runtime/compose/p6a-review/p6aReviewPage.ts",
    "web/src/ccsolver-runtime/compose/runtime/tworldCausalJournal.ts",
    "web/src/ccsolver-runtime/compose/p3-review/buildP3ReviewOutputs.ts",
    "web/src/bootstrap/architecture/hexagonalBoundaries.test.ts",
  ]) {
    assert.equal(classifyChangedPaths([path]).gates.workspace, true, path);
  }
});

test("routes native oracle semantics through the native and P5 proof chain", () => {
  assertSelection(
    ["legacy_c/oracle/oracle_main.cpp", "legacy_c/mslogic.c"],
    [
      "workspace",
      "native",
      "p5",
      "runtime-p6-evidence",
      "p6-presentation-attest",
      "p4b",
      "browser",
    ],
  );
});

test("targets Qt alone but routes SDL authority and CMake through P5 downstream", () => {
  assertSelection(["legacy_c/oshw-qt/TWMainWnd.cpp"], ["native"]);
  const p5Authority = [
    "workspace",
    "native",
    "p5",
    "runtime-p6-evidence",
    "p6-presentation-attest",
    "p4b",
    "browser",
  ];
  assertSelection(["legacy_c/oshw-sdl/sdlout.c"], p5Authority);
  assertSelection(["CMakeLists.txt"], p5Authority);
  assertSelection(["legacy_c/CMakeLists.txt"], p5Authority);
});

test("runs every gate for workflow, dependency, classifier, and unknown source changes", () => {
  for (const path of [
    ".github/workflows/ubuntu-ci.yml",
    "package-lock.json",
    "package.json",
    "scripts/ci/changed-gates.mjs",
    "web/src/future-engine/newBehavior.ts",
  ]) {
    const result = assertSelection([path], gateIds, path);
    assert.equal(result.all, true, path);
    assert.deepEqual(result.unknownPaths, path.includes("future-engine") ? [path] : []);
  }
});

test("fails closed for no paths and unsafe path spellings", () => {
  const empty = assertSelection([], gateIds);
  assert.equal(empty.all, true);
  assert.deepEqual(empty.unknownPaths, ["<no-paths>"]);

  for (const path of [
    "../outside.ts",
    "/tmp/absolute.ts",
    "C:\\outside.ts",
    "web\\src\\ccsolver-runtime\\compose\\p4b-dossier\\p4bDossierPage.ts",
    "",
  ]) {
    const result = assertSelection([path], gateIds, path);
    assert.equal(result.all, true, path);
  }
});

test("unions independent classifications and de-duplicates normalized paths", () => {
  const result = assertSelection(
    [
      "./README.md",
      "README.md",
      "./web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.ts",
    ],
    ["workspace", "p6-presentation-attest", "p4b", "browser"],
  );
  assert.deepEqual(result.paths, [
    "README.md",
    "web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.ts",
  ]);
});

test("emits deterministic JSON for explicit CLI paths", async () => {
  const left = await execFileAsync(process.execPath, [
    classifierPath,
    "README.md",
    "web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.ts",
  ]);
  const right = await execFileAsync(process.execPath, [
    classifierPath,
    "web/src/ccsolver-runtime/compose/p4b-dossier/p4bDossierPage.ts",
    "README.md",
    "README.md",
  ]);

  assert.equal(left.stderr, "");
  assert.equal(left.stdout, right.stdout);
  assert.equal(left.stdout.endsWith("\n"), true);
  assert.deepEqual(
    JSON.parse(left.stdout).gates,
    enabled("workspace", "p6-presentation-attest", "p4b", "browser"),
  );
});

test("resolves a bounded base/head Git diff for CI callers", async (context) => {
  const directory = await mkdtemp(join(tmpdir(), "tworld-changed-gates-"));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const git = (...args) => execFileAsync("git", args, { cwd: directory });
  await git("init", "--quiet");
  await git("config", "user.email", "ci@example.invalid");
  await git("config", "user.name", "CI Test");
  await writeFile(join(directory, "README.md"), "first\n");
  await git("add", "README.md");
  await git("commit", "--quiet", "-m", "first");
  await writeFile(join(directory, "README.md"), "second\n");
  await writeFile(join(directory, "page.ts"), "export {};\n");
  await git("add", "README.md", "page.ts");
  await git("commit", "--quiet", "-m", "second");

  assert.deepEqual(
    await resolveChangedPaths({ base: "HEAD~1", head: "HEAD", cwd: directory }),
    ["README.md", "page.ts"],
  );

  const cli = await execFileAsync(
    process.execPath,
    [classifierPath, "--base", "HEAD~1", "--head", "HEAD"],
    { cwd: directory },
  );
  assert.deepEqual(JSON.parse(cli.stdout).paths, ["README.md", "page.ts"]);
});

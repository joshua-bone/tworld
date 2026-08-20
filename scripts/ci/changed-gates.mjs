#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { changedWebTestDisposition } from "./run-changed-web-tests.mjs";

const execFileAsync = promisify(execFile);

export const GATE_IDS = Object.freeze([
  "native-qt",
  "native-sdl-oracle",
  "workspace",
  "static-corpus-p1b",
  "p5",
  "reviews-p2a-p4",
  "runtime-p6-evidence",
  "p6-presentation-attest",
  "p4b",
  "browser",
]);

const ALL_GATES = Object.freeze([...GATE_IDS]);
const P5_DOWNSTREAM_GATES = Object.freeze([
  "workspace",
  "native-sdl-oracle",
  "p5",
  "runtime-p6-evidence",
  "p6-presentation-attest",
  "p4b",
  "browser",
]);
const P6_EVIDENCE_GATES = Object.freeze([
  "workspace",
  "runtime-p6-evidence",
  "p6-presentation-attest",
  "browser",
]);
const P7_EVIDENCE_GATES = Object.freeze([
  "workspace",
  "runtime-p6-evidence",
  "p6-presentation-attest",
]);
const P7_SHARED_ARTWORK_GATES = Object.freeze([
  "workspace",
  "runtime-p6-evidence",
  "p6-presentation-attest",
  "p4b",
  "browser",
]);
const STATIC_DOWNSTREAM_GATES = Object.freeze([
  "static-corpus-p1b",
  ...P5_DOWNSTREAM_GATES,
  "reviews-p2a-p4",
]);

function isWithin(path, directory) {
  return path === directory || path.startsWith(`${directory}/`);
}

function isOneOf(path, candidates) {
  return candidates.includes(path);
}

function normalizeChangedPath(input) {
  if (typeof input !== "string") return null;
  if (input.includes("\\")) return null;
  let path = input;
  while (path.startsWith("./")) path = path.slice(2);
  if (
    path.length === 0
    || path === "."
    || path.startsWith("/")
    || /^[A-Za-z]:\//u.test(path)
    || /[\u0000-\u001f\u007f]/u.test(path)
    || path.includes("//")
    || path.split("/").includes("..")
  ) {
    return null;
  }
  return path;
}

function isCiControlPath(path) {
  return isWithin(path, ".github")
    || isWithin(path, "scripts/ci")
    || path === "test/ci-changed-gates.test.mjs"
    || path === "AGENTS.md"
    || path === ".nvmrc"
    || path === "package.json"
    || path === "package-lock.json"
    || path === "ccsolver/package.json"
    || path === "web/package.json"
    || /(?:^|\/)tsconfig(?:\.[^/]+)?\.json$/u.test(path)
    || /(?:^|\/)(?:vite|vitest)\.config\.[cm]?[jt]s$/u.test(path);
}

function isDocumentationPath(path) {
  return isWithin(path, "docs")
    || isWithin(path, "ccsolver/docs")
    || path === "README.md"
    || path === "ccsolver/README.md"
    || path === "web/README.md"
    || path === "BUGS"
    || path === "Changelog"
    || path === "COPYING"
    || path === "CLEAN_CODE.md"
    || path === "PERFORMANCE_PLAN.md"
    || path === "PET_CARRIER_PLAN.md"
    || path === "Clean-Code-V2.4.pdf";
}

function isP4bPresentationPath(path) {
  return isWithin(path, "web/src/ccsolver-runtime/compose/p4b-dossier")
    || isWithin(path, "ccsolver/fixtures/golden/p4b")
    || isOneOf(path, [
      "res/tiles.bmp",
      "res/atiles.bmp",
      "web/src/player-web/impl/legacySprites.ts",
      "web/src/player-web/impl/legacyTileset.ts",
    ])
    || /^ccsolver\/src\/render\/p4b/u.test(path);
}

function isP7SharedArtworkPath(path) {
  return path === "web/src/ccsolver-runtime/compose/p4b-dossier/p4bLegacyArtwork.ts"
    || path === "res/tiles.bmp"
    || path === "res/atiles.bmp";
}

function isP6PresentationPath(path) {
  return /^web\/src\/ccsolver-runtime\/compose\/p6a-review\/p6aReview(?:Page|Io)(?:\.|$)/u.test(path)
    || /^ccsolver\/fixtures\/golden\/p6a\/[^/]+\/review\.(?:html|md)$/u.test(path);
}

function isP6EvidencePath(path) {
  return isWithin(path, "web/src/ccsolver-runtime/compose/p6a-review")
    || isWithin(path, "ccsolver/fixtures/golden/p6a");
}

function isP6bP7aPath(path) {
  return isWithin(path, "web/src/ccsolver-runtime/compose/p7a-tactics")
    || isWithin(path, "web/src/ccsolver-runtime/compose/p6b-p7a-review")
    || isWithin(path, "ccsolver/fixtures/golden/p7a");
}

function isCausalRuntimePath(path) {
  return isWithin(path, "ccsolver/src/events")
    || isWithin(path, "ccsolver/src/alignment")
    || isWithin(path, "ccsolver/test/events")
    || isWithin(path, "ccsolver/test/alignment")
    || /^web\/src\/ccsolver-runtime\/compose\/runtime\/(?:tworldCausalJournal|tworldCloneLineage|projectTworldNativeCausalEvents)/u.test(path);
}

function isP5Path(path) {
  return isWithin(path, "web/src/ccsolver-runtime/compose/p5-review")
    || isWithin(path, "ccsolver/fixtures/golden/p5")
    || isOneOf(path, ["sets/CCLP1-MS.dac", "sets/CCLP1-Lynx.dac"]);
}

function isReviewPath(path) {
  return /^web\/src\/ccsolver-runtime\/compose\/(?:p2a-review|p3-review|p4a-review)(?:\/|$)/u.test(path)
    || /^ccsolver\/fixtures\/golden\/(?:p2a|p3|p4a)(?:\/|$)/u.test(path)
    || isWithin(path, "ccsolver/reviews/p4a")
    || isWithin(path, "ccsolver/src/snippets")
    || isWithin(path, "ccsolver/src/plan")
    || isWithin(path, "ccsolver/src/render")
    || isWithin(path, "ccsolver/test/plan");
}

function isP3CheckedOutput(path) {
  return isWithin(path, "ccsolver/fixtures/golden/p3/cclp1-001");
}

function isStaticCorpusPath(path) {
  return isWithin(path, "ccsolver/corpus")
    || isWithin(path, "ccsolver/schemas")
    || isWithin(path, "ccsolver/fixtures/golden/p1a")
    || isWithin(path, "ccsolver/fixtures/golden/p1b")
    || isWithin(path, "ccsolver/src/analyze")
    || isWithin(path, "ccsolver/test/analyze")
    || isWithin(path, "web/src/ccsolver-runtime/compose/p1a-corpus")
    || isWithin(path, "web/src/ccsolver-runtime/compose/p1b-curriculum")
    || isWithin(path, "web/src/ccsolver-runtime/compose/sourceValidity")
    || /^web\/src\/ccsolver-runtime\/compose\/(?:buildTworld|projectVerifiedTworldLevelFacts|runP1aStaticAnalysis|tworld(?:Lynx|Ms)LevelProjection)/u.test(path)
    || isWithin(path, "web/src/ccsolver-runtime/impl")
    || isWithin(path, "web/src/level-catalog")
    || isWithin(path, "web/src/content")
    || isWithin(path, "data")
    || isWithin(path, "save")
    || isWithin(path, "sets")
    || isWithin(path, "ccsolver/src/application")
    || isWithin(path, "ccsolver/src/domain")
    || isWithin(path, "ccsolver/src/ports")
    || isWithin(path, "ccsolver/src/adapters");
}

function isQtPath(path) {
  return isWithin(path, "legacy_c/oshw-qt");
}

function isSdlPath(path) {
  return isWithin(path, "legacy_c/oshw-sdl");
}

function isQtSdlSharedPath(path) {
  return isOneOf(path, [
    "legacy_c/oshw-sdl/sdlsfx.c",
    "legacy_c/oshw-sdl/sdlsfx.h",
  ]);
}

function isNativeOraclePath(path) {
  return isWithin(path, "legacy_c/oracle");
}

function isSharedNativePath(path) {
  return path === "CMakeLists.txt"
    || (
      isWithin(path, "legacy_c")
      && !isNativeOraclePath(path)
      && !isQtPath(path)
      && !isSdlPath(path)
    );
}

function isBrowserOnlyPath(path) {
  return isWithin(path, "web/src/bootstrap")
    || isWithin(path, "web/src/player-web")
    || isWithin(path, "web/src/perf")
    || isWithin(path, "web/src/undo-runtime")
    || path === "web/index.html";
}

function classifyPath(path) {
  const changedTest = changedWebTestDisposition(path);
  if (changedTest === "workspace") return { gates: ["workspace"], reason: "changed-web-test" };
  if (changedTest === "p5") {
    return { gates: ["native-sdl-oracle", "p5"], reason: "changed-p5-test" };
  }
  if (changedTest === "native") {
    return { gates: ["native-sdl-oracle"], reason: "changed-native-web-test" };
  }
  if (changedTest === "unsupported") {
    throw new Error(`unsupported changed web test: ${JSON.stringify(path)}`);
  }
  if (isCiControlPath(path)) return { gates: ALL_GATES, reason: "ci-control" };
  if (isDocumentationPath(path)) return { gates: ["workspace"], reason: "documentation" };
  if (isP7SharedArtworkPath(path)) {
    return { gates: P7_SHARED_ARTWORK_GATES, reason: "p7-shared-artwork" };
  }
  if (isP4bPresentationPath(path)) {
    return {
      gates: ["workspace", "p6-presentation-attest", "p4b", "browser"],
      reason: "p4b-presentation",
    };
  }
  if (isP6PresentationPath(path)) {
    return {
      gates: ["workspace", "p6-presentation-attest", "browser"],
      reason: "p6-presentation",
    };
  }
  if (isP6EvidencePath(path)) {
    return { gates: P6_EVIDENCE_GATES, reason: "p6-evidence" };
  }
  if (isP6bP7aPath(path)) {
    return { gates: P7_EVIDENCE_GATES, reason: "p6b-p7a-evidence" };
  }
  if (isCausalRuntimePath(path)) {
    return { gates: P6_EVIDENCE_GATES, reason: "causal-runtime" };
  }
  if (isP5Path(path)) return { gates: P5_DOWNSTREAM_GATES, reason: "p5-source" };
  if (isP3CheckedOutput(path)) {
    return {
      gates: ["reviews-p2a-p4", ...P5_DOWNSTREAM_GATES],
      reason: "p3-checked-output",
    };
  }
  if (isReviewPath(path)) {
    return { gates: ["workspace", "reviews-p2a-p4"], reason: "p2a-p4-review" };
  }
  if (isStaticCorpusPath(path)) {
    return { gates: STATIC_DOWNSTREAM_GATES, reason: "static-corpus" };
  }
  if (isQtPath(path)) return { gates: ["native-qt"], reason: "native-qt" };
  if (isQtSdlSharedPath(path)) {
    return {
      gates: ["native-qt", "native-sdl-oracle"],
      reason: "native-qt-sdl-shared",
    };
  }
  if (isSdlPath(path)) {
    return { gates: ["native-sdl-oracle"], reason: "native-sdl" };
  }
  if (isNativeOraclePath(path)) {
    return { gates: P5_DOWNSTREAM_GATES, reason: "native-oracle" };
  }
  if (isSharedNativePath(path)) {
    return {
      gates: ["native-qt", ...P5_DOWNSTREAM_GATES],
      reason: "native-shared",
    };
  }
  if (isBrowserOnlyPath(path)) return { gates: ["workspace", "browser"], reason: "browser" };
  return { gates: ALL_GATES, reason: "unknown" };
}

/**
 * Classify repository-relative changed paths into the minimum safe CI gate set.
 * Any malformed or unrecognized path selects every gate.
 */
export function classifyChangedPaths(inputs, { deletedPaths = [] } = {}) {
  const normalized = new Map();
  for (const input of inputs) {
    const path = normalizeChangedPath(input);
    if (path === null) {
      throw new Error(`invalid changed path: ${JSON.stringify(input)}`);
    }
    normalized.set(path, path);
  }

  const deleted = new Set();
  for (const input of deletedPaths) {
    const path = normalizeChangedPath(input);
    if (path === null) {
      throw new Error(`invalid deleted path: ${JSON.stringify(input)}`);
    }
    if (!normalized.has(path)) {
      throw new Error(`deleted path is not present in changed paths: ${JSON.stringify(path)}`);
    }
    deleted.add(path);
  }

  const paths = [...normalized.keys()].sort();
  const selected = new Set();
  const reasons = {};
  const unknownPaths = [];
  if (paths.length === 0) unknownPaths.push("<no-paths>");

  for (const path of paths) {
    const classification = deleted.has(path)
      && changedWebTestDisposition(path) === "unsupported"
      ? { gates: ["workspace"], reason: "deleted-web-test" }
      : classifyPath(path);
    reasons[path] = classification.reason;
    for (const gate of classification.gates) selected.add(gate);
    if (classification.reason === "unknown") unknownPaths.push(path);
  }
  if (unknownPaths.length > 0) {
    for (const gate of ALL_GATES) selected.add(gate);
  }

  const gates = Object.fromEntries(GATE_IDS.map((gate) => [gate, selected.has(gate)]));
  return {
    version: 1,
    paths,
    unknownPaths: [...new Set(unknownPaths)].sort(),
    all: GATE_IDS.every((gate) => gates[gate]),
    gates,
    reasons,
  };
}

function assertRevision(value, option) {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.startsWith("-")
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${option} requires a safe Git revision`);
  }
}

async function resolveDiffPaths({ base, head, cwd, diffFilter }) {
  assertRevision(base, "--base");
  assertRevision(head, "--head");
  const { stdout } = await execFileAsync(
    "git",
    [
      "diff",
      "--name-only",
      "--no-renames",
      `--diff-filter=${diffFilter}`,
      "-z",
      `${base}...${head}`,
      "--",
    ],
    { cwd, encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 10_000 },
  );
  return [...new Set(stdout.split("\0").filter(Boolean))].sort();
}

/** Resolve changed names from the merge-base of `base` and `head`. */
export async function resolveChangedPaths({ base, head = "HEAD", cwd = process.cwd() }) {
  return resolveDiffPaths({ base, head, cwd, diffFilter: "ACDMRTUXB" });
}

/** Resolve only paths whose absence is proven by Git's deletion status. */
export async function resolveDeletedPaths({ base, head = "HEAD", cwd = process.cwd() }) {
  return resolveDiffPaths({ base, head, cwd, diffFilter: "D" });
}

function parseArguments(argv) {
  const paths = [];
  let base;
  let head;
  let stdin = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base" || argument === "--head") {
      const value = argv[index + 1];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      if (argument === "--base") base = value;
      else head = value;
      index += 1;
    } else if (argument === "--stdin") {
      stdin = true;
    } else if (argument.startsWith("-")) {
      throw new Error(`unknown option: ${argument}`);
    } else {
      paths.push(argument);
    }
  }
  if (head !== undefined && base === undefined) {
    throw new Error("--head requires --base");
  }
  return { paths, base, head, stdin };
}

async function main(argv) {
  const options = parseArguments(argv);
  const paths = [...options.paths];
  let deletedPaths = [];
  if (options.base !== undefined) {
    paths.push(...await resolveChangedPaths({ base: options.base, head: options.head }));
    deletedPaths = await resolveDeletedPaths({ base: options.base, head: options.head });
  }
  if (options.stdin) {
    const input = await readFile(0, "utf8");
    paths.push(...input.split(/\0|\r?\n/u).filter(Boolean));
  }
  process.stdout.write(`${JSON.stringify(classifyChangedPaths(paths, { deletedPaths }))}\n`);
}

const isDirectInvocation = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectInvocation) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`changed-gates: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 2;
  });
}

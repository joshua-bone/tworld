import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  collectImportSpecifiers,
  findBoundaryViolations,
  scanSourceTree,
} from "../../scripts/dependencyBoundaries.mjs";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("collects imports, type imports, re-exports, and dynamic imports", () => {
  const imports = collectImportSpecifiers(`
    import type { A } from "./a.js";
    export { B } from "./b.js";
    const value = import("./c.js");
    type D = import("./d.js").D;
  `);

  assert.deepEqual(imports, ["./a.js", "./b.js", "./c.js", "./d.js"]);
});

test("rejects representative dependency-boundary violations", () => {
  const violations = findBoundaryViolations([
    { path: "src/domain/react.ts", source: 'import "react";' },
    { path: "src/domain/node.ts", source: 'import "node:fs";' },
    { path: "src/domain/new-node.ts", source: 'import "node:sqlite";' },
    { path: "src/domain/package.ts", source: 'import "typescript";' },
    { path: "src/domain/adapter.ts", source: 'import "../adapters/index.js";' },
    { path: "src/ports/site.ts", source: 'export * from "../site/index.js";' },
    { path: "src/application/render.ts", source: 'import "../render/index.js";' },
    { path: "src/analyze/node.ts", source: 'import "node:fs";' },
    { path: "src/analyze/application.ts", source: 'import "../application/index.js";' },
    {
      path: "src/application/web.ts",
      source: 'import "../../../web/src/game-runtime/ports/InteractiveGameEngine.js";',
    },
    { path: "src/adapters/ruleset.ts", source: 'import "@ruleset-ms/impl/engine";' },
    { path: "src/adapters/data.ts", source: 'import "@data/private-level";' },
  ]);

  assert.equal(violations.length, 12);
  assert.deepEqual(
    new Set(violations.map((violation) => violation.reason)),
    new Set([
      "application cannot depend on render",
      "analyze cannot depend on application",
      "analyze cannot import Node runtime modules",
      "CCSolver cannot import files outside its source tree",
      "CCSolver cannot import Tile World web or ruleset internals",
      "domain cannot depend on adapters",
      "domain cannot import external packages",
      "domain cannot import Node runtime modules",
      "domain cannot import UI or canvas packages",
      "ports cannot depend on site",
    ]),
  );
});

test("rejects undeclared source layers even when they have no imports", () => {
  const violations = findBoundaryViolations([
    { path: "src/rogue/index.ts", source: "export const value = 1;" },
  ]);

  assert.deepEqual(
    violations.map(({ path, reason, specifier }) => ({ path, reason, specifier })),
    [{
      path: "src/rogue/index.ts",
      reason: "source file is outside the declared CCSolver source layers",
      specifier: "<source>",
    }],
  );
});

test("rejects JavaScript in pure layers so it cannot bypass purity typechecking", () => {
  const violations = findBoundaryViolations([
    { path: "src/domain/browser.mjs", source: 'document.title = "CCSolver";' },
  ]);

  assert.deepEqual(
    violations.map(({ path, reason, specifier }) => ({ path, reason, specifier })),
    [{
      path: "src/domain/browser.mjs",
      reason: "domain source files must use TypeScript",
      specifier: "<source>",
    }],
  );
});

test("keeps the public root entrypoint inside the purity boundary", () => {
  const violations = findBoundaryViolations([
    { path: "src/index.ts", source: 'export * from "node:fs";' },
    { path: "src/index.ts", source: 'export * from "typescript";' },
  ]);

  assert.deepEqual(
    new Set(violations.map((violation) => violation.reason)),
    new Set([
      "root cannot import external packages",
      "root cannot import Node runtime modules",
    ]),
  );
});

test("keeps terminal-first planning pure and below orchestration layers", () => {
  const violations = findBoundaryViolations([
    { path: "src/plan/node.ts", source: 'import "node:fs";' },
    { path: "src/plan/application.ts", source: 'import "../application/index.js";' },
    { path: "src/plan/runtime.ts", source: 'import "../../../web/src/game-runtime/index.js";' },
  ]);

  assert.deepEqual(
    new Set(violations.map((violation) => violation.reason)),
    new Set([
      "CCSolver cannot import files outside its source tree",
      "plan cannot depend on application",
      "plan cannot import Node runtime modules",
    ]),
  );
});

test("keeps contextual snippets pure and dependent only on plan contracts and ports", () => {
  const violations = findBoundaryViolations([
    { path: "src/snippets/node.ts", source: 'import "node:fs";' },
    { path: "src/snippets/application.ts", source: 'import "../application/index.js";' },
    { path: "src/snippets/analyze.ts", source: 'import "../analyze/index.js";' },
    { path: "src/snippets/runtime.ts", source: 'import "../../../web/src/game-runtime/index.js";' },
  ]);

  assert.deepEqual(
    new Set(violations.map((violation) => violation.reason)),
    new Set([
      "CCSolver cannot import files outside its source tree",
      "snippets cannot depend on analyze",
      "snippets cannot depend on application",
      "snippets cannot import Node runtime modules",
    ]),
  );
});

test("keeps the checked-in CCSolver source inside its declared boundaries", async () => {
  assert.deepEqual(await scanSourceTree(workspaceRoot), []);
});

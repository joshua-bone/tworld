import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const currentDir = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(currentDir, "../..");

interface BoundaryRule {
  name: string;
  roots: string[];
  forbidden: RegExp[];
}

function normalizePath(path: string): string {
  return path.replaceAll("\\", "/");
}

function listSourceFiles(root: string): string[] {
  const entries = readdirSync(root).sort((left, right) => left.localeCompare(right));
  const results: string[] = [];

  for (const entry of entries) {
    const absolute = join(root, entry);
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      results.push(...listSourceFiles(absolute));
      continue;
    }

    const extension = extname(entry);
    if ((extension === ".ts" || extension === ".tsx") && !entry.endsWith(".test.ts") && !entry.endsWith(".test.tsx")) {
      results.push(absolute);
    }
  }

  return results;
}

function readImportSpecifiers(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const imports = new Set<string>();
  const fromPattern = /\bfrom\s+["']([^"']+)["']/g;
  const bareImportPattern = /\bimport\s+["']([^"']+)["']/g;

  for (const pattern of [fromPattern, bareImportPattern]) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) {
        imports.add(specifier);
      }
    }
  }

  return [...imports];
}

function filesUnder(relativeRoot: string): string[] {
  return listSourceFiles(resolve(srcRoot, relativeRoot));
}

function assertNoForbiddenImports(rule: BoundaryRule): void {
  const violations: string[] = [];

  for (const root of rule.roots) {
    for (const file of filesUnder(root)) {
      const specifiers = readImportSpecifiers(file);
      for (const specifier of specifiers) {
        if (rule.forbidden.some((pattern) => pattern.test(specifier))) {
          violations.push(`${normalizePath(relative(srcRoot, file))} -> ${specifier}`);
        }
      }
    }
  }

  expect(violations, `${rule.name} violations`).toEqual([]);
}

describe("hexagonal boundaries", () => {
  it("keeps domain code free of adapters, application orchestration, and runtime APIs", () => {
    assertNoForbiddenImports({
      name: "domain purity",
      roots: ["domain"],
      forbidden: [/^@adapters(\/|$)/, /^@application(\/|$)/, /^react$/, /^react-dom$/, /^node:/],
    });
  });

  it("keeps core simulation code free of ruleset-specific imports", () => {
    assertNoForbiddenImports({
      name: "core ruleset isolation",
      roots: ["domain/game/core"],
      forbidden: [/^@domain\/game\/rules\//],
    });
  });

  it("keeps pure application surfaces free of adapter imports", () => {
    assertNoForbiddenImports({
      name: "application purity",
      roots: ["application/ports", "application/mappers", "application/engine"],
      forbidden: [/^@adapters(\/|$)/, /^react$/, /^react-dom$/],
    });
  });
});

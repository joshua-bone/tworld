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

interface BoundaryFileRule {
  name: string;
  files: string[];
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

function sourceFile(relativePath: string): string {
  return resolve(srcRoot, relativePath);
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

function assertFilesHaveNoForbiddenImports(rule: BoundaryFileRule): void {
  const violations: string[] = [];

  for (const relativeFile of rule.files) {
    const file = sourceFile(relativeFile);
    const specifiers = readImportSpecifiers(file);
    for (const specifier of specifiers) {
      if (rule.forbidden.some((pattern) => pattern.test(specifier))) {
        violations.push(`${normalizePath(relative(srcRoot, file))} -> ${specifier}`);
      }
    }
  }

  expect(violations, `${rule.name} violations`).toEqual([]);
}

describe("hexagonal boundaries", () => {
  it("keeps content and core packages free of UI, node, and package orchestration imports", () => {
    assertNoForbiddenImports({
      name: "content and core purity",
      roots: ["content", "game-core"],
      forbidden: [
        /^@bootstrap(\/|$)/,
        /^@player-web(\/|$)/,
        /^@level-catalog(\/|$)/,
        /^@oracle-fixtures(\/|$)/,
        /^@replay-verifier(\/|$)/,
        /^react$/,
        /^react-dom$/,
        /^node:/,
      ],
    });
  });

  it("keeps core simulation code free of ruleset-specific imports", () => {
    assertNoForbiddenImports({
      name: "core ruleset isolation",
      roots: ["game-core/impl"],
      forbidden: [/^@ruleset-ms(\/|$)/, /^@ruleset-lynx(\/|$)/],
    });
  });

  it("keeps package ports free of browser, react, and node dependencies", () => {
    assertNoForbiddenImports({
      name: "ports purity",
      roots: [
        "game-runtime/ports",
        "ccsolver-runtime/ports",
        "level-catalog/ports",
        "oracle-fixtures/ports",
        "player-web/ports",
        "replay-verifier/ports",
      ],
      forbidden: [/^@bootstrap(\/|$)/, /^react$/, /^react-dom$/, /^node:/],
    });
  });

  it("keeps CCSolver adapter implementation independent of concrete engines and hosts", () => {
    assertNoForbiddenImports({
      name: "CCSolver adapter implementation purity",
      roots: ["ccsolver-runtime/impl"],
      forbidden: [
        /^@bootstrap(\/|$)/,
        /^@game-(?:core|runtime)(\/|$)/,
        /^@level-catalog(\/|$)/,
        /^@ruleset-(?:ms|lynx)(\/|$)/,
        /^@undo-runtime(\/|$)/,
        /^react$/,
        /^react-dom$/,
        /^node:/,
      ],
    });
  });

  it("keeps CCSolver target composition free of the other target's implementation policy", () => {
    assertFilesHaveNoForbiddenImports({
      name: "CCSolver Lynx policy isolation",
      files: [
        "ccsolver-runtime/compose/tworldLynxLevelProjection.ts",
        "ccsolver-runtime/compose/buildTworldLynxLevelFacts.ts",
        "ccsolver-runtime/compose/buildTworldLynxTopologyEvidence.ts",
        "ccsolver-runtime/compose/buildTworldLynxStaticAnalysis.ts",
      ],
      forbidden: [/^@ruleset-ms\/impl(\/|$)/],
    });
    assertFilesHaveNoForbiddenImports({
      name: "CCSolver MS policy isolation",
      files: [
        "ccsolver-runtime/compose/tworldMsLevelProjection.ts",
        "ccsolver-runtime/compose/buildTworldMsLevelFacts.ts",
        "ccsolver-runtime/compose/buildTworldMsTopologyEvidence.ts",
        "ccsolver-runtime/compose/buildTworldMsStaticAnalysis.ts",
      ],
      forbidden: [/^@ruleset-lynx\/impl(\/|$)/],
    });
  });

  it("keeps pure implementation services free of bootstrap, react, and node runtime imports", () => {
    assertFilesHaveNoForbiddenImports({
      name: "pure implementation service purity",
      files: [
        "game-runtime/impl/advanceInteractiveGameSession.ts",
        "game-runtime/impl/buildReplayExport.ts",
        "game-runtime/impl/exportInteractiveReplay.ts",
        "game-runtime/impl/interactiveHandle.ts",
        "game-runtime/impl/interactiveHistoryNavigation.ts",
        "game-runtime/impl/importReplayForLevel.ts",
        "game-runtime/impl/projectInteractiveGameSession.ts",
        "game-runtime/impl/projectInteractiveSessionHistory.ts",
        "game-runtime/impl/resumeInteractiveGameSession.ts",
        "game-runtime/impl/restoreInteractiveGameSession.ts",
        "game-runtime/impl/startInteractiveGameSession.ts",
        "game-runtime/impl/startReplayInteractiveGameSession.ts",
        "level-catalog/impl/loadDashboardSummary.ts",
        "level-catalog/impl/loadPlayableSeriesCatalog.ts",
        "level-catalog/impl/loadSeriesCatalog.ts",
        "level-catalog/impl/loadSolutionCatalog.ts",
        "player-web/impl/loadPlayableSelection.ts",
        "player-web/impl/savePlayableSelection.ts",
        "replay-verifier/impl/buildReplayTraceScenariosFromSolutionFile.ts",
        "replay-verifier/impl/compareInputTraceScenario.ts",
        "replay-verifier/impl/runSolutionFileReplaySweep.ts",
      ],
      forbidden: [/^@bootstrap(\/|$)/, /^node:/, /^react$/, /^react-dom$/],
    });
  });
});

import { builtinModules } from "node:module";
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, posix, relative, resolve } from "node:path";
import ts from "typescript";

const sourceExtensions = new Set([".cjs", ".cts", ".js", ".mjs", ".mts", ".ts", ".tsx"]);
const builtins = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`]),
);

const allowedInternalLayers = new Map([
  ["root", new Set(["analyze", "application", "domain", "ports"])],
  ["domain", new Set(["domain"])],
  ["ports", new Set(["domain", "ports"])],
  ["analyze", new Set(["analyze", "domain"])],
  ["application", new Set(["analyze", "application", "domain", "ports"])],
  ["adapters", new Set(["adapters", "analyze", "application", "domain", "ports"])],
  ["render", new Set(["analyze", "application", "domain", "ports", "render"])],
  ["site", new Set(["analyze", "application", "domain", "ports", "render", "site"])],
  ["cli", new Set(["adapters", "analyze", "application", "cli", "domain", "ports", "render", "site"])],
]);

const pureLayers = new Set(["analyze", "application", "domain", "ports", "root"]);
const webAliases = new Set([
  "@bootstrap",
  "@content",
  "@data",
  "@fixtures",
  "@game-core",
  "@game-runtime",
  "@level-catalog",
  "@oracle-fixtures",
  "@player-web",
  "@replay-verifier",
  "@res",
  "@ruleset-lynx",
  "@ruleset-ms",
  "@sets",
  "@undo-runtime",
]);

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

function layerForSource(relativePath) {
  const normalized = normalizePath(relativePath);
  const parts = normalized.split("/");
  if (parts[0] !== "src") {
    return undefined;
  }
  if (parts.length === 2) {
    return "root";
  }
  return parts[1];
}

function collectImportSpecifiers(sourceText, fileName = "source.ts") {
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const specifiers = new Set();

  function addStringLiteral(node) {
    if (node && ts.isStringLiteralLike(node)) {
      specifiers.add(node.text);
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      addStringLiteral(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
    ) {
      addStringLiteral(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) {
      addStringLiteral(node.argument.literal);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isDynamicImport || isRequire) {
        addStringLiteral(node.arguments[0]);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return [...specifiers].sort();
}

function externalViolation(sourceLayer, specifier) {
  const packageRoot = specifier.split("/")[0];
  if (
    specifier === "tworld-web"
    || specifier.startsWith("tworld-web/")
    || webAliases.has(packageRoot)
    || specifier.includes("/web/src/")
  ) {
    return "CCSolver cannot import Tile World web or ruleset internals";
  }

  if (!pureLayers.has(sourceLayer)) {
    return undefined;
  }

  if (specifier.startsWith("node:") || builtins.has(specifier)) {
    return `${sourceLayer} cannot import Node runtime modules`;
  }
  if (
    specifier === "react"
    || specifier.startsWith("react/")
    || specifier === "react-dom"
    || specifier.startsWith("react-dom/")
    || specifier === "canvas"
  ) {
    return `${sourceLayer} cannot import UI or canvas packages`;
  }

  return `${sourceLayer} cannot import external packages`;
}

function dependencyViolation(sourcePath, specifier) {
  const sourceLayer = layerForSource(sourcePath);
  if (!sourceLayer) {
    return "source file is outside the CCSolver source layers";
  }

  if (!specifier.startsWith(".")) {
    return externalViolation(sourceLayer, specifier);
  }

  const targetPath = posix.normalize(
    posix.join(posix.dirname(normalizePath(sourcePath)), specifier),
  );
  if (targetPath === "web" || targetPath.startsWith("web/") || targetPath.startsWith("../")) {
    return "CCSolver cannot import files outside its source tree";
  }

  const targetLayer = layerForSource(targetPath);
  if (!targetLayer) {
    return "CCSolver cannot import files outside its source tree";
  }

  const allowed = allowedInternalLayers.get(sourceLayer);
  if (!allowed?.has(targetLayer)) {
    return `${sourceLayer} cannot depend on ${targetLayer}`;
  }

  return undefined;
}

function sourceViolation(sourcePath) {
  const sourceLayer = layerForSource(sourcePath);
  if (!sourceLayer || !allowedInternalLayers.has(sourceLayer)) {
    return "source file is outside the declared CCSolver source layers";
  }

  if (pureLayers.has(sourceLayer) && extname(sourcePath) !== ".ts") {
    return `${sourceLayer} source files must use TypeScript`;
  }

  return undefined;
}

export function findBoundaryViolations(records) {
  const violations = [];

  for (const record of records) {
    const invalidSourceReason = sourceViolation(record.path);
    if (invalidSourceReason) {
      violations.push({
        path: record.path,
        reason: invalidSourceReason,
        specifier: "<source>",
        diagnostic: `${record.path} [${invalidSourceReason}]`,
      });
      continue;
    }

    for (const specifier of collectImportSpecifiers(record.source, record.path)) {
      const reason = dependencyViolation(record.path, specifier);
      if (reason) {
        violations.push({
          path: record.path,
          reason,
          specifier,
          diagnostic: `${record.path} -> ${specifier} [${reason}]`,
        });
      }
    }
  }

  return violations.sort((left, right) => left.diagnostic.localeCompare(right.diagnostic));
}

async function listSourceFiles(root) {
  const results = [];

  const entries = (await readdir(root, { withFileTypes: true }))
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolute = join(root, entry.name);
    if (entry.isDirectory()) {
      results.push(...await listSourceFiles(absolute));
    } else if (sourceExtensions.has(extname(entry.name)) && !entry.name.includes(".test.")) {
      results.push(absolute);
    }
  }

  return results;
}

export async function scanSourceTree(workspaceRoot) {
  const sourceRoot = resolve(workspaceRoot, "src");
  const records = [];

  for (const absolutePath of await listSourceFiles(sourceRoot)) {
    records.push({
      path: normalizePath(relative(workspaceRoot, absolutePath)),
      source: await readFile(absolutePath, "utf8"),
    });
  }

  return findBoundaryViolations(records);
}

export { collectImportSpecifiers };

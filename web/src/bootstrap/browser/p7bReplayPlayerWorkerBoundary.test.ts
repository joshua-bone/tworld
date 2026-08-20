import { readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const aliases = [
  ["@bootstrap/", "bootstrap/"],
  ["@content/", "content/"],
  ["@game-core/", "game-core/"],
  ["@game-runtime/", "game-runtime/"],
  ["@level-catalog/", "level-catalog/"],
  ["@oracle-fixtures/", "oracle-fixtures/"],
  ["@player-web/", "player-web/"],
  ["@replay-verifier/", "replay-verifier/"],
  ["@ruleset-lynx/", "ruleset-lynx/"],
  ["@ruleset-ms/", "ruleset-ms/"],
  ["@undo-runtime/", "undo-runtime/"],
] as const;

function sourceModuleRequests(source: string): string[] {
  const requests = new Set<string>();
  const staticStatement = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/gu;
  for (const match of source.matchAll(staticStatement)) {
    if (!match[1]?.trimStart().startsWith("type ") && match[2]) requests.add(match[2]);
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/gu)) {
    if (match[1]) requests.add(match[1]);
  }
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/gu)) {
    if (match[1]) requests.add(match[1]);
  }
  return [...requests];
}

function sourceFile(base: string): string | null {
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // Try the next deterministic source candidate.
    }
  }
  return null;
}

function resolveSourceModule(importer: string, request: string): string | null {
  if (request.startsWith(".")) return sourceFile(resolve(dirname(importer), request));
  const alias = aliases.find(([prefix]) => request.startsWith(prefix));
  if (!alias) return null;
  return sourceFile(resolve(sourceRoot, alias[1], request.slice(alias[0].length)));
}

function valueModuleClosure(entry: string): string[] {
  const seen = new Set<string>();
  const pending = [resolve(sourceRoot, entry)];
  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || seen.has(path)) continue;
    seen.add(path);
    for (const request of sourceModuleRequests(readFileSync(path, "utf8"))) {
      const dependency = resolveSourceModule(path, request);
      if (dependency) pending.push(dependency);
    }
  }
  return [...seen]
    .map((path) => relative(sourceRoot, path).replaceAll("\\", "/"))
    .sort();
}

describe("P7B replay-player worker boundary", () => {
  it("uses the direct browser engines without reaching the normal app worker factory", () => {
    const closure = valueModuleClosure("bootstrap/browser/p7bReplayPlayer.tsx");

    expect(closure).toContain("player-web/compose/createP7bReplayPlayerServices.ts");
    expect(closure).toContain("game-runtime/impl/MsGameEngineAdapter.ts");
    expect(closure).toContain("game-runtime/impl/LynxGameEngineAdapter.ts");
    expect(closure).toContain("level-catalog/impl/BrowserLevelRepository.ts");
    expect(closure).not.toContain("player-web/compose/createBrowserAppServices.ts");
    expect(closure).not.toContain("game-runtime/impl/WorkerBackedInteractiveGameEngine.ts");
    expect(closure).not.toContain("game-runtime/impl/interactiveGame.worker.protocol.ts");
    expect(closure).not.toContain("game-runtime/impl/interactiveGame.worker.ts");
  });

  it("keeps the normal browser app worker-backed", () => {
    const closure = valueModuleClosure("player-web/compose/App.tsx");

    expect(closure).toContain("player-web/compose/createBrowserAppServices.ts");
    expect(closure).toContain("game-runtime/impl/WorkerBackedInteractiveGameEngine.ts");
  });
});

import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseP7TrainingEngineRunnerArguments } from "./p7TrainingEngineRunnerCli";

const directory = dirname(fileURLToPath(import.meta.url));
const entry = resolve(directory, "p7TrainingEngineRunnerCli.ts");

async function runtimeImportClosure(entryPath: string): Promise<readonly string[]> {
  const visited = new Set<string>();
  async function visit(path: string): Promise<void> {
    if (visited.has(path)) return;
    visited.add(path);
    const source = await readFile(path, "utf8");
    const imports = source.matchAll(/import\s+(type\s+)?[\s\S]*?\s+from\s+["']([^"']+)["'];/gu);
    for (const match of imports) {
      if (match[1] !== undefined || !match[2]!.startsWith(".")) continue;
      const base = resolve(dirname(path), match[2]!);
      const candidates = [`${base}.ts`, `${base}.tsx`, resolve(base, "index.ts")];
      let resolved: string | undefined;
      for (const candidate of candidates) {
        if (await stat(candidate).then((details) => details.isFile()).catch(() => false)) {
          resolved = candidate;
          break;
        }
      }
      if (resolved === undefined) throw new Error(`test cannot resolve runtime import ${match[2]} from ${path}`);
      await visit(resolved);
    }
  }
  await visit(entryPath);
  return [...visited].sort();
}

describe("P7 engine-only runner entry", () => {
  it("parses strict prepare/shard/assemble/reduce/check/write/attest modes", () => {
    const common = [
      "--root", "/repo",
      "--artifacts", "/artifacts",
      "--head", "a".repeat(40),
      "--run-id", "1234",
      "--run-attempt", "2",
    ];
    expect(parseP7TrainingEngineRunnerArguments([
      "prepare", ...common, "--packs", "cclp1,cclp5",
    ])).toMatchObject({ command: "prepare", packIds: ["cclp1", "cclp5"] });
    expect(parseP7TrainingEngineRunnerArguments([
      "shard", ...common, "--shard", "7",
    ])).toMatchObject({ command: "shard", shardIndex: 7 });
    const shardRoots = Array.from({ length: 8 }, (_, index) => `/shards/${index}`);
    expect(parseP7TrainingEngineRunnerArguments([
      "assemble",
      ...common,
      ...shardRoots.flatMap((root, index) => [`--shard-${index}`, root]),
    ])).toMatchObject({ command: "assemble", shardRoots });
    for (const command of ["reduce", "check", "write", "attest"] as const) {
      expect(parseP7TrainingEngineRunnerArguments([command, ...common]).command).toBe(command);
    }
    expect(() => parseP7TrainingEngineRunnerArguments([
      "prepare", ...common, "--packs", "cclp5,cclp1",
    ])).toThrow("strict");
    expect(() => parseP7TrainingEngineRunnerArguments([
      "shard", ...common, "--shard", "8",
    ])).toThrow("0..7");
  });

  it("keeps player graph, HTML presentation, and checked-pack IO outside its runtime import closure", async () => {
    const closure = await runtimeImportClosure(entry);
    expect(closure.some((path) => path.endsWith("composeP7TrainingReducedExecutionIndex.ts"))).toBe(true);
    for (const forbidden of [
      "p7TrainingPlayerGraphIo",
      "p7TrainingPresentation",
      "buildP7bTrainingPackOutputs",
      "p7bTrainingPackIo",
      "/player-web/",
      "/bootstrap/browser/",
    ]) {
      expect(closure.find((path) => path.includes(forbidden)), forbidden).toBeUndefined();
    }
  });
});

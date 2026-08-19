import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { GameTrace } from "@game-core/api/types";
import { buildCompleteKeyPyramidSolutionFile } from "./certifyKeyPyramidP5Replay";
import { runExactKeyPyramidNativeReplay } from "./runExactKeyPyramidNativeReplay";

const replay = {
  bestTimeTicks: 700,
  flags: 0,
  randomSlideDirection: 1,
  stepping: 0,
  randomSeed: 0,
  moves: [{ when: 0, dir: 8 }],
  modifierMasks: [],
} as const;

function completedTrace(): GameTrace {
  return {
    request: { seriesFile: "CCLP1-MS.dac", levelNumber: 1, ruleset: "MS", randomSeed: 0 },
    scheduledInputs: [],
    initialState: {} as GameTrace["initialState"],
    steps: [],
    result: { status: "completed", finalTick: 644, stepCount: 645 },
  };
}

describe("P5 exact-file native replay", () => {
  it("loads exact inputs from isolated series and save directories", async () => {
    const tws = buildCompleteKeyPyramidSolutionFile("ms", replay).bytes;
    const repositoryRoot = await mkdtemp(join(tmpdir(), "tworld-p5-source-"));
    const sourceSeriesDirectory = resolve(repositoryRoot, "sets");
    const sourceSeriesBytes = new TextEncoder().encode("file=CCLP1.dat\nruleset=MS\n");
    await mkdir(sourceSeriesDirectory);
    await writeFile(resolve(sourceSeriesDirectory, "CCLP1-MS.dac"), sourceSeriesBytes);
    let isolatedDirectory = "";
    try {
      const result = await runExactKeyPyramidNativeReplay({
        repositoryRoot,
        oraclePath: "/workspace/tworld/build-verify/legacy_c/tworld-oracle",
        target: "ms",
        twsBytes: tws,
        maximumTicks: 740,
        execute: async (request) => {
          isolatedDirectory = request.saveDirectory;
          expect(await readdir(request.seriesDirectory)).toEqual(["CCLP1-MS.dac"]);
          expect(Array.from(await readFile(resolve(request.seriesDirectory, "CCLP1-MS.dac"))))
            .toEqual(Array.from(sourceSeriesBytes));
          expect(await readdir(request.saveDirectory)).toEqual(["CCLP1-MS.dac.tws"]);
          expect(Array.from(await readFile(resolve(request.saveDirectory, request.solutionFilename))))
            .toEqual(Array.from(tws));
          expect(request.args).toEqual([
            "--root", repositoryRoot,
            "--series-dir", request.seriesDirectory,
            "--save-dir", request.saveDirectory,
            "replay-trace", "CCLP1-MS.dac", "1", "740",
          ]);
          return completedTrace();
        },
      });

      expect(result.trace.result.status).toBe("completed");
      expect(result.audit).toEqual({
        command: "replay-trace",
        isolatedSaveDirectory: true,
        solutionFilename: "CCLP1-MS.dac.tws",
        saveDirectoryFileCount: 1,
        exactInputBytesRead: true,
        maximumTicks: 740,
      });
      await expect(access(isolatedDirectory)).rejects.toThrow();
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true });
    }
  });

  it("hard-fails when the configured oracle is absent", async () => {
    await expect(runExactKeyPyramidNativeReplay({
      repositoryRoot: "/workspace/tworld",
      oraclePath: "/definitely/missing/tworld-oracle",
      target: "ms",
      twsBytes: buildCompleteKeyPyramidSolutionFile("ms", replay).bytes,
      maximumTicks: 740,
    })).rejects.toThrow(/native oracle is unavailable/);
  });
});

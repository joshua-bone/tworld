import { access, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
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
  it("loads the exact complete TWS from an otherwise-empty temporary save directory", async () => {
    const tws = buildCompleteKeyPyramidSolutionFile("ms", replay).bytes;
    let isolatedDirectory = "";
    const result = await runExactKeyPyramidNativeReplay({
      repositoryRoot: "/workspace/tworld",
      oraclePath: "/workspace/tworld/build-verify/legacy_c/tworld-oracle",
      target: "ms",
      twsBytes: tws,
      maximumTicks: 740,
      execute: async (request) => {
        isolatedDirectory = request.saveDirectory;
        expect(await readdir(request.saveDirectory)).toEqual(["CCLP1-MS.dac.tws"]);
        expect(Array.from(await readFile(resolve(request.saveDirectory, request.solutionFilename))))
          .toEqual(Array.from(tws));
        expect(request.args).toEqual([
          "--root", "/workspace/tworld",
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

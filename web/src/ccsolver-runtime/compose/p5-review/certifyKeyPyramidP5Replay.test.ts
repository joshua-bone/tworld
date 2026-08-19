import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSolutionFile, serializeSolutionFile } from "@content/api/solution-file";
import type { GameTrace } from "@game-core/api/types";
import {
  assertCertifiedTracePair,
  buildCompleteKeyPyramidSolutionFile,
  certifyKeyPyramidP5Replay,
} from "./certifyKeyPyramidP5Replay";
import { loadKeyPyramidRuntimeSource } from "../p3-review/keyPyramidP3Source";
import { buildKeyPyramidP5Replay } from "./buildKeyPyramidP5Execution";
import { buildKeyPyramidP5Route } from "./buildKeyPyramidP5Route";

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(currentDirectory, "../../../../../");
const oraclePath = resolve(repositoryRoot, "build-verify/legacy_c/tworld-oracle");
const PLAN = {
  artifact: {
    protocolVersion: 1,
    artifactType: "expanded-plan",
    schemaVersion: 1,
    digest: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  },
  goalId: "goal:test",
  subgoalId: null,
} as const;

const REPLAY = {
  bestTimeTicks: 700,
  flags: 0,
  randomSlideDirection: 1,
  stepping: 0,
  randomSeed: 0,
  moves: [
    { when: 0, dir: 8 },
    { when: 4, dir: 2 },
    { when: 8, dir: 1 },
  ],
  modifierMasks: [],
} as const;

function trace(status = "completed", finalTick = 644): GameTrace {
  return {
    request: {
      seriesFile: "CCLP1-MS.dac",
      levelNumber: 1,
      ruleset: "MS",
      randomSeed: 0,
    },
    scheduledInputs: [],
    initialState: {} as GameTrace["initialState"],
    steps: [],
    result: { status, finalTick, stepCount: finalTick + 1 },
  };
}

describe("P5 complete replay certification", () => {
  it.each([
    { target: "ms", ruleset: "MS", setName: "CCLP1-MS.dac" },
    { target: "lynx", ruleset: "Lynx", setName: "CCLP1-Lynx.dac" },
  ] as const)("serializes a complete ordinary $target TWS with an exact byte round trip", (spec) => {
    const built = buildCompleteKeyPyramidSolutionFile(spec.target, REPLAY);
    const parsed = parseSolutionFile(built.bytes);

    expect(parsed).toMatchObject({
      ruleset: spec.ruleset,
      flags: 0,
      setName: spec.setName,
      entries: [{
        levelNumber: 1,
        password: "VVGF",
        bestTimeTicks: 700,
        expandedSolution: {
          flags: 0,
          randomSlideDirection: 1,
          stepping: 0,
          randomSeed: 0,
          moves: REPLAY.moves,
        },
      }],
    });
    expect(Array.from(serializeSolutionFile(parsed))).toEqual(Array.from(built.bytes));
    expect(built.audit).toEqual({
      format: "tws",
      entryCount: 1,
      moveCount: 3,
      payloadRoundTripExact: true,
      fullFileRoundTripExact: true,
    });
  });

  it("rejects modifier-bearing output instead of silently emitting an extended format", () => {
    expect(() => buildCompleteKeyPyramidSolutionFile("ms", {
      ...REPLAY,
      modifierMasks: [1],
    })).toThrow(/ordinary TWS cannot carry modifier masks/);
  });

  it("requires two winning traces with identical terminal ticks and exact trace parity", () => {
    expect(assertCertifiedTracePair(trace(), trace())).toEqual({
      result: "win",
      terminalTick: 644,
      mismatchCount: 0,
    });
    expect(() => assertCertifiedTracePair(trace("failed"), trace("failed"))).toThrow(
      /TypeScript replay did not complete/,
    );
    expect(() => assertCertifiedTracePair(trace(), trace("completed", 645))).toThrow(
      /terminal ticks disagree/,
    );
    expect(() => assertCertifiedTracePair(trace(), {
      ...trace(),
      result: { status: "completed", finalTick: 644, stepCount: 999 },
    })).toThrow(/trace mismatch/);
  });

  it.each([
    { target: "ms", settledTick: 644, filename: "CCLP1-MS.dac.tws" },
    { target: "lynx", settledTick: 660, filename: "CCLP1-Lynx.dac.tws" },
  ] as const)("certifies exact generated $target bytes in TypeScript and the native oracle", async (spec) => {
    const source = await loadKeyPyramidRuntimeSource(repositoryRoot, spec.target);
    const route = buildKeyPyramidP5Route(source.levelFacts.facts.payload);
    const certified = await certifyKeyPyramidP5Replay({
      repositoryRoot,
      oraclePath,
      source,
      replay: buildKeyPyramidP5Replay(route),
      plan: PLAN,
    });

    expect(certified.report.plan).toEqual(PLAN);
    expect(certified.report.replay).toMatchObject({
      format: "tws",
      bestTimeTicks: 700,
      moveCount: 162,
    });
    expect(certified.report.verification).toMatchObject({
      typescript: { result: "win", terminalTick: spec.settledTick },
      nativeOracle: {
        result: "win",
        terminalTick: spec.settledTick,
        isolatedSaveDirectory: true,
        solutionFilename: spec.filename,
        exactInputBytesRead: true,
      },
      exactTraceParity: true,
      mismatchCount: 0,
    });
  }, 60_000);
});

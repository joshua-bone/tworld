import { afterEach, describe, expect, it, vi } from "vitest";
import { createRulesetReplaySweepTerminalReporter } from "@replay-verifier/impl/rulesetReplaySweepTerminalReporter";

describe("rulesetReplaySweepTerminalReporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints compact outcome bars and only failing replay lines per file", () => {
    const logs: string[] = [];
    const writes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write);

    const reporter = createRulesetReplaySweepTerminalReporter("MS", false);
    reporter.progress.onSolutionFileStart?.({
      solutionFile: { label: "CCLP1-MS.tws" } as never,
      plan: { series: { filebase: "CCLP1.dac" } } as never,
      scenarios: [{}, {}, {}] as never,
    });
    reporter.progress.onScenarioComplete?.({
      scenario: { name: "CCLP1-MS.tws:1", request: { levelNumber: 1 } } as never,
      failure: null,
    } as never);
    reporter.progress.onScenarioComplete?.({
      scenario: { name: "CCLP1-MS.tws:2", request: { levelNumber: 2 } } as never,
      failure: {
        scenarioName: "CCLP1-MS.tws:2",
        solutionFile: "/tmp/CCLP1-MS.tws",
        seriesFile: "CCLP1.dac",
        levelNumber: 2,
        mismatchPaths: ["$.steps[3].status"],
        mismatches: [{ path: "$.steps[3].status", expected: "playing", actual: "failed" }],
      },
    } as never);
    reporter.progress.onScenarioComplete?.({
      scenario: { name: "CCLP1-MS.tws:3", request: { levelNumber: 3 } } as never,
      failure: null,
    } as never);
    reporter.progress.onSolutionFileComplete?.({
      solutionFile: { label: "CCLP1-MS.tws" } as never,
      plan: { series: { filebase: "CCLP1.dac" } } as never,
      scenarios: [{}, {}, {}] as never,
      replayCount: 3,
      failures: [],
    } as never);

    expect(writes).toEqual(["CCLP1: ", "-", "X", "-", "\n"]);
    expect(logs).toEqual([
      "FAIL L002 CCLP1-MS.tws:2 | $.steps[3].status: expected playing, got failed",
      "",
    ]);
  });
});

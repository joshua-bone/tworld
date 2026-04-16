import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createAllReplayVerifierTerminalReporter,
  createCoordinatedAllReplayVerifierTerminalReporter,
} from "@replay-verifier/impl/allReplayVerifierTerminalReporter";
import { parseReplaySweepCoordinationLine } from "@replay-verifier/impl/replaySweepCoordination";

describe("allReplayVerifierTerminalReporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints compact per-pack bars and only failing replay lines", () => {
    const logs: string[] = [];
    const writes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.join(" "));
    });
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write);

    const reporter = createAllReplayVerifierTerminalReporter(false);
    reporter.onSolutionFileStart("CCLP1-MS.tws", "CCLP1.dac", "MS", 3);
    reporter.onPass("CCLP1-MS.tws:1", 1, "MS");
    reporter.onTraceComparisonFailure("CCLP1-MS.tws:2", 2, "MS", {
      path: "$.steps[5].mapHash",
      expected: "abc",
      actual: "def",
    });
    reporter.onLegacyFailure("CCLP1-MS.tws:3", 3, "MS", "legacy failed at tick 17", "failed");
    reporter.onSolutionFileComplete();

    expect(writes).toEqual(["CCLP1: ", "-", "X", "X", "\n"]);
    expect(logs).toEqual([
      "FAIL L002 CCLP1-MS.tws:2 | mapHash @ $.steps[5] | expected abc, got def",
      "FAIL L003 CCLP1-MS.tws:3 | legacy failed at tick 17",
      "",
    ]);
  });

  it("emits coordinated completion events with elapsed time and split failure counts", () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation(((chunk: string | Uint8Array) => {
      writes.push(typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8"));
      return true;
    }) as typeof process.stdout.write);
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(2_000)
      .mockReturnValueOnce(4_750);

    const reporter = createCoordinatedAllReplayVerifierTerminalReporter();
    reporter.onSolutionFileStart("CCLP1-MS.tws", "CCLP1.dac", "MS", 3);
    reporter.onPass("CCLP1-MS.tws:1", 1, "MS");
    reporter.onTraceComparisonFailure("CCLP1-MS.tws:2", 2, "MS", {
      path: "$.steps[5].mapHash",
      expected: "abc",
      actual: "def",
    });
    reporter.onLegacyFailure("CCLP1-MS.tws:3", 3, "MS", "legacy failed at tick 17", "failed");
    reporter.onSolutionFileComplete();

    const events = writes
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => parseReplaySweepCoordinationLine(line));

    expect(events).toEqual([
      {
        type: "file-start",
        packName: "CCLP1.dac",
        solutionLabel: "CCLP1-MS.tws",
        ruleset: "MS",
        replayCount: 3,
      },
      {
        type: "file-complete",
        packName: "CCLP1.dac",
        solutionLabel: "CCLP1-MS.tws",
        ruleset: "MS",
        checked: 3,
        passed: 1,
        failed: 2,
        tsFailed: 1,
        legacyFailed: 1,
        elapsedMs: 2750,
        failureLines: [
          "FAIL L002 CCLP1-MS.tws:2 | mapHash @ $.steps[5] | expected abc, got def",
          "FAIL L003 CCLP1-MS.tws:3 | legacy failed at tick 17",
        ],
      },
    ]);
  });
});

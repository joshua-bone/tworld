import { afterEach, describe, expect, it, vi } from "vitest";
import { createAllReplayVerifierTerminalReporter } from "@replay-verifier/impl/allReplayVerifierTerminalReporter";

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
});

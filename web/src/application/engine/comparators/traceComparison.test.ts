import { describe, expect, it } from "vitest";
import { collectTraceMismatches, type TraceMismatch } from "@application/engine/comparators/traceComparison";

describe("collectTraceMismatches", () => {
  it("prefers step mismatches over result mismatches at the root trace level", () => {
    const expected = {
      request: { levelNumber: 31 },
      initialState: { status: "playing" },
      scheduledInputs: [],
      steps: [
        { tick: 0, status: "playing" },
        { tick: 1, status: "completed" },
      ],
      result: {
        finalTick: 1,
        status: "completed",
        stepCount: 2,
      },
    };

    const actual = {
      request: { levelNumber: 31 },
      initialState: { status: "playing" },
      scheduledInputs: [],
      steps: [
        { tick: 0, status: "playing" },
        { tick: 1, status: "failed" },
      ],
      result: {
        finalTick: 0,
        status: "failed",
        stepCount: 1,
      },
    };

    const mismatches: TraceMismatch[] = [];
    collectTraceMismatches(actual, expected, "$", mismatches, 10);

    expect(mismatches[0]?.path).toBe("$.steps[1].status");
    expect(mismatches[1]?.path).toBe("$.result.finalTick");
  });

  it("compares shared steps before reporting a step length mismatch", () => {
    const expected = {
      request: { levelNumber: 71 },
      initialState: { status: "playing" },
      scheduledInputs: [],
      steps: [{ tick: 0 }, { tick: 1 }, { tick: 2, status: "completed" }],
      result: {
        finalTick: 2,
        status: "completed",
        stepCount: 3,
      },
    };

    const actual = {
      request: { levelNumber: 71 },
      initialState: { status: "playing" },
      scheduledInputs: [],
      steps: [{ tick: 0 }, { tick: 1 }, { tick: 2, status: "failed" }, { tick: 3 }],
      result: {
        finalTick: 3,
        status: "failed",
        stepCount: 4,
      },
    };

    const mismatches: TraceMismatch[] = [];
    collectTraceMismatches(actual, expected, "$", mismatches, 10);

    expect(mismatches[0]?.path).toBe("$.steps[2].status");
    expect(mismatches[1]?.path).toBe("$.steps.length");
    expect(mismatches[2]?.path).toBe("$.result.finalTick");
  });
});

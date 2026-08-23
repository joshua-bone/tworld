import { describe, expect, it } from "vitest";
import {
  HybridCcV0InputCollector,
  replayInputForDirections,
  type HybridCcDirection,
} from "./inputCollector";

function captureLogicWindow(
  collector: HybridCcV0InputCollector,
  samples: readonly (readonly HybridCcDirection[])[],
): readonly HybridCcDirection[] {
  let collected: readonly HybridCcDirection[] = [];
  samples.forEach((directions, index) => {
    collector.capture(directions);
    if (index === 0) {
      collected = collector.collect();
    }
  });
  return collected;
}

describe("HybridCcV0InputCollector", () => {
  it("reports a held direction at every 100 ms logic boundary", () => {
    const collector = new HybridCcV0InputCollector();

    expect(
      captureLogicWindow(collector, [
        ["north"],
        ["north"],
        ["north"],
        ["north"],
      ]),
    ).toEqual(["north"]);
    expect(collector.capture(["north"])).toEqual(["north"]);
  });

  it("buffers a press between logic boundaries for exactly one boundary", () => {
    const collector = new HybridCcV0InputCollector();

    expect(captureLogicWindow(collector, [[], [], ["north"], []])).toEqual([]);
    expect(captureLogicWindow(collector, [[], [], [], []])).toEqual(["north"]);
    expect(collector.capture([])).toEqual([]);
  });

  it("places a late new direction before a direction still held at the next boundary", () => {
    const collector = new HybridCcV0InputCollector();

    expect(
      captureLogicWindow(collector, [
        ["north"],
        ["north"],
        ["north", "east"],
        ["east"],
      ]),
    ).toEqual(["north"]);
    expect(collector.capture(["north"])).toEqual(["east", "north"]);
  });
});

describe("replayInputForDirections", () => {
  it("encodes the first direction as primary and the first orthogonal direction as slap", () => {
    expect(replayInputForDirections([])).toBe(0);
    expect(replayInputForDirections(["north"])).toBe(1);
    expect(replayInputForDirections(["north", "east"])).toBe(5);
    expect(replayInputForDirections(["east", "north"])).toBe(7);
    expect(replayInputForDirections(["north", "south"])).toBe(1);
    expect(replayInputForDirections(["west", "south", "north"])).toBe(11);
  });
});

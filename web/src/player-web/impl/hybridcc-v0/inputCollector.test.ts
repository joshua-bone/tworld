import { describe, expect, it } from "vitest";
import {
  HybridCcV0InputCollector,
  HybridCcV0InputBuffer,
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

describe("HybridCcV0InputBuffer", () => {
  it("preserves a tap between logic boundaries and the order of a diagonal slap", () => {
    const buffer = new HybridCcV0InputBuffer();
    expect(buffer.nextSampleInputCode()).toBe(0);
    expect(buffer.nextSampleInputCode()).toBe(0);
    buffer.keyDown("east");
    expect(buffer.nextSampleInputCode()).toBe(2);
    buffer.keyDown("north");
    buffer.keyUp("east");
    expect(buffer.nextSampleInputCode()).toBe(7);
    expect(buffer.nextSampleInputCode()).toBe(7);
  });

  it("preserves a starting tap until the shared clock's first sample", () => {
    const buffer = new HybridCcV0InputBuffer();
    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    // The next sample is the following authoritative boundary. The starting
    // tap must not repeat there or shift all later windows by one sample.
    expect(buffer.nextSampleInputCode()).toBe(0);
  });

  it("latches a complete tap between host samples until the next logic boundary", () => {
    const buffer = new HybridCcV0InputBuffer();

    expect(buffer.nextSampleInputCode()).toBe(0);
    expect(buffer.nextSampleInputCode()).toBe(0);
    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(2);
    expect(buffer.nextSampleInputCode()).toBe(0);
  });

  it("preserves event order for multiple complete taps between samples", () => {
    const buffer = new HybridCcV0InputBuffer();

    buffer.keyDown("east");
    buffer.keyUp("east");
    buffer.keyDown("north");
    buffer.keyUp("north");

    expect(buffer.nextSampleInputCode()).toBe(7);
  });

  it("keeps an older held direction ahead of a newer between-sample tap", () => {
    const buffer = new HybridCcV0InputBuffer();

    buffer.keyDown("north");
    expect(buffer.nextSampleInputCode()).toBe(1);
    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextSampleInputCode()).toBe(5);
  });

  it("delivers a short tap to exactly one boundary at every host-sample phase", () => {
    for (let tapSample = 0; tapSample < 4; tapSample += 1) {
      const buffer = new HybridCcV0InputBuffer();
      const boundaryInputs: number[] = [];

      for (let sample = 0; sample < 12; sample += 1) {
        if (sample === tapSample) {
          buffer.keyDown("east");
          buffer.keyUp("east");
        }
        const input = buffer.nextSampleInputCode();
        if (sample % 4 === 0) boundaryInputs.push(input);
      }

      expect(boundaryInputs.filter((input) => input === 2)).toHaveLength(1);
    }
  });

  it.each([1, 2, 3])(
    "hard-clears a buffered tap when gameplay resets at host-sample phase %i",
    (resetSample) => {
      const buffer = new HybridCcV0InputBuffer();

      for (let sample = 0; sample < resetSample; sample += 1) {
        expect(buffer.nextSampleInputCode()).toBe(0);
      }
      buffer.keyDown("east");
      buffer.keyUp("east");
      expect(buffer.nextSampleInputCode()).toBe(2);

      buffer.reset();

      expect(buffer.nextSampleInputCode()).toBe(0);
      expect(buffer.nextSampleInputCode()).toBe(0);
      expect(buffer.nextSampleInputCode()).toBe(0);
      expect(buffer.nextSampleInputCode()).toBe(0);
    },
  );
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

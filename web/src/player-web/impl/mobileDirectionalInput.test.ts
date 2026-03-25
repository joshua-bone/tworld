import { describe, expect, it } from "vitest";
import { MobileDirectionalInputTracker } from "@player-web/impl/mobileDirectionalInput";

describe("MobileDirectionalInputTracker", () => {
  it("presses a direction only once until the last pointer releases it", () => {
    const tracker = new MobileDirectionalInputTracker();

    expect(tracker.assignPointer(1, "north")).toEqual({
      pressed: ["north"],
      released: [],
    });
    expect(tracker.assignPointer(2, "north")).toEqual({
      pressed: [],
      released: [],
    });
    expect(tracker.releasePointer(1)).toEqual({
      pressed: [],
      released: [],
    });
    expect(tracker.releasePointer(2)).toEqual({
      pressed: [],
      released: ["north"],
    });
  });

  it("tracks orthogonal presses independently for diagonal play", () => {
    const tracker = new MobileDirectionalInputTracker();

    expect(tracker.assignPointer(1, "north")).toEqual({
      pressed: ["north"],
      released: [],
    });
    expect(tracker.assignPointer(2, "east")).toEqual({
      pressed: ["east"],
      released: [],
    });
    expect(tracker.releasePointer(1)).toEqual({
      pressed: [],
      released: ["north"],
    });
    expect(tracker.releasePointer(2)).toEqual({
      pressed: [],
      released: ["east"],
    });
  });

  it("reassigns a pointer from one direction to another", () => {
    const tracker = new MobileDirectionalInputTracker();

    expect(tracker.assignPointer(7, "west")).toEqual({
      pressed: ["west"],
      released: [],
    });
    expect(tracker.assignPointer(7, "south")).toEqual({
      pressed: ["south"],
      released: ["west"],
    });
  });

  it("releases every active direction on reset", () => {
    const tracker = new MobileDirectionalInputTracker();

    tracker.assignPointer(1, "south");
    tracker.assignPointer(2, "east");

    expect(tracker.reset()).toEqual({
      pressed: [],
      released: ["south", "east"],
    });
    expect(tracker.reset()).toEqual({
      pressed: [],
      released: [],
    });
  });
});

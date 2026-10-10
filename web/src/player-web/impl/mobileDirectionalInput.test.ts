import { describe, expect, it } from "vitest";
import { mobileDirectionAtPoint, MobileDirectionalInputTracker } from "@player-web/impl/mobileDirectionalInput";

describe("mobile direction hit testing", () => {
  const regions = [
    { direction: "north" as const, left: 100, right: 180, top: 0, bottom: 80 },
    { direction: "east" as const, left: 200, right: 280, top: 100, bottom: 180 },
  ];

  it("stops in neutral space, but tolerates slight drift outside the held arrow", () => {
    expect(mobileDirectionAtPoint(185, 40, regions, "north")).toBe("north");
    expect(mobileDirectionAtPoint(195, 40, regions, "north")).toBeNull();
    expect(mobileDirectionAtPoint(185, 40, regions, null)).toBeNull();
  });

  it("changes to the arrow under the finger instead of the captured starting arrow", () => {
    expect(mobileDirectionAtPoint(240, 140, regions, "north")).toBe("east");
  });
});

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

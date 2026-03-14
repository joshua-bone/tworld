import { describe, expect, it } from "vitest";
import { absoluteMouseMoveCode, LegacyLynxInputBuffer, LegacyMsInputBuffer } from "@adapters/react/legacyMsInput";
import { GAME_INPUT_CODES } from "@domain/game/command";

describe("LegacyMsInputBuffer", () => {
  it("latches a quick tap even if the key is released before the next tick", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextTickInput()).toBe("east");
    expect(buffer.nextTickInput()).toBe("none");
  });

  it("waits two ticks before repeating a held key", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.keyDown("north");

    expect(buffer.nextTickInput()).toBe("north");
    expect(buffer.nextTickInput()).toBe("none");
    expect(buffer.nextTickInput()).toBe("none");
    expect(buffer.nextTickInput()).toBe("north");
    expect(buffer.nextTickInput()).toBe("north");
  });

  it("uses the most recently pressed direction while multiple keys are held", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.keyDown("east");
    expect(buffer.nextTickInput()).toBe("east");

    buffer.keyDown("north");
    expect(buffer.nextTickInput()).toBe("north");

    buffer.keyUp("north");
    expect(buffer.nextTickInput()).toBe("none");
    expect(buffer.nextTickInput()).toBe("none");
    expect(buffer.nextTickInput()).toBe("east");
  });

  it("queues a legacy absolute mouse command followed by preserve polls", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.queueAbsoluteMouseMove(123);

    expect(buffer.nextTickInputCode()).toBe(absoluteMouseMoveCode(123));
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.none);
  });
});

describe("LegacyLynxInputBuffer", () => {
  it("combines held orthogonal keys into a diagonal command", () => {
    const buffer = new LegacyLynxInputBuffer();

    buffer.keyDown("north");
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.north);

    buffer.keyDown("east");
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.north | GAME_INPUT_CODES.east);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.north | GAME_INPUT_CODES.east);
  });

  it("keeps a quick tap for one poll even if the key is released before the tick", () => {
    const buffer = new LegacyLynxInputBuffer();

    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.east);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.none);
  });
});

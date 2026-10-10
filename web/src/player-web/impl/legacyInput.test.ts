import { describe, expect, it } from "vitest";
import { absoluteMouseMoveCode, LegacyLynxInputBuffer, LegacyMsInputBuffer } from "@player-web/impl/legacyInput";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { createEmptyCells, createLevel, createRequest, pos } from "@ruleset-ms/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

describe("LegacyMsInputBuffer", () => {
  it("latches a quick tap even if the key is released before the next tick", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextTickInput()).toBe("east");
    expect(buffer.nextTickInput()).toBe("none");
  });

  it("matches native casual MS polls while holding a direction", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.keyDown("north");

    expect(buffer.nextTickInput()).toBe("north");
    expect(buffer.nextTickInput()).toBe("preserve");
    expect(buffer.nextTickInput()).toBe("preserve");
    expect(buffer.nextTickInput()).toBe("north");
    expect(buffer.nextTickInput()).toBe("north");
  });

  it("ages every held key during overlapping presses, as native MS does", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.keyDown("east");
    expect(buffer.nextTickInput()).toBe("east");

    buffer.keyDown("north");
    expect(buffer.nextTickInput()).toBe("north");

    buffer.keyUp("north");
    expect(buffer.nextTickInput()).toBe("preserve");
    expect(buffer.nextTickInput()).toBe("east");
  });

  // These command sequences were checked by compiling legacy_c/generic/in.c
  // with its real input() function and casualinputs=TRUE (OS event delivery stubbed).
  it("keeps native arrow priority when a lower-priority direction is pressed later", () => {
    const buffer = new LegacyMsInputBuffer();
    buffer.keyDown("north");
    const commands = Array.from({ length: 4 }, () => buffer.nextTickInput());
    buffer.keyDown("east");
    commands.push(...Array.from({ length: 3 }, () => buffer.nextTickInput()));
    buffer.keyUp("north");
    commands.push(buffer.nextTickInput());
    expect(commands).toEqual(["north", "preserve", "preserve", "north", "north", "north", "north", "east"]);
  });

  it("does not save an overridden struck key for a ghost step after the held key releases", () => {
    const buffer = new LegacyMsInputBuffer();
    buffer.keyDown("north");
    for (let i = 0; i < 4; i += 1) buffer.nextTickInputCode();
    buffer.keyDown("east");
    buffer.keyUp("east");
    expect(buffer.nextTickInput()).toBe("north");
    buffer.keyUp("north");
    expect(buffer.nextTickInput()).toBe("none");
  });

  it("preserves a turn until the MS engine can accept it, without adding a repeat", () => {
    const cells = createEmptyCells();
    const start = pos(2, 2);
    cells[start]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    let session = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    const buffer = new LegacyMsInputBuffer();
    const step = () => { session = advanceMsInteractiveSession(session, buffer.nextTickInputCode()); };
    buffer.keyDown("east");
    step(); // tick 0: move east
    buffer.keyUp("east");
    step();
    step();
    buffer.keyDown("north");
    step(); // tick 3: Chip has already moved in this MS cycle
    expect(session.state.internal.chipPos).toBe(pos(3, 2));
    step(); // tick 4: preserve the turn rather than erasing it with none
    expect(session.state.internal.chipPos).toBe(pos(3, 1));
    buffer.keyUp("north");
    for (let i = 0; i < 5; i += 1) step();
    expect(session.state.internal.chipPos).toBe(pos(3, 1));
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

  it("drains queued mouse-goal polls before resuming keyboard input", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.queueAbsoluteMouseMove(123);
    buffer.keyDown("east");

    expect(buffer.nextTickInputCode()).toBe(absoluteMouseMoveCode(123));
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.east);
  });

  it("keeps a quick keyboard tap queued behind mouse-goal preserve polls", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.queueAbsoluteMouseMove(123);
    buffer.keyDown("west");
    buffer.keyUp("west");

    expect(buffer.nextTickInputCode()).toBe(absoluteMouseMoveCode(123));
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.west);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.none);
  });

  it("preserves queued mouse retarget order exactly", () => {
    const buffer = new LegacyMsInputBuffer();

    buffer.queueAbsoluteMouseMove(123);
    buffer.queueAbsoluteMouseMove(456);

    expect(buffer.nextTickInputCode()).toBe(absoluteMouseMoveCode(123));
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(absoluteMouseMoveCode(456));
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.preserve);
  });
});

describe("manual MS repeat cadence", () => {
  function playing(phase: number) {
    const cells = createEmptyCells();
    const start = pos(8, 16);
    cells[start]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    let session = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    for (let i = 0; i < phase; i += 1) session = advanceMsInteractiveSession(session, 0);
    const buffer = new LegacyMsInputBuffer("manual");
    const moves: Array<{ at: number; position: number }> = [];
    let elapsed = 0;
    return {
      buffer, moves,
      position: () => session.state.internal.chipPos,
      step(count = 1) {
        for (let i = 0; i < count; i += 1) {
          const before = session.state.internal.chipPos;
          session = advanceMsInteractiveSession(session, buffer.nextTickInputCode());
          if (session.state.internal.chipPos !== before) moves.push({ at: elapsed, position: session.state.internal.chipPos });
          elapsed += 55;
        }
      },
    };
  }

  it.each([0, 1, 2, 3])("makes a sub-300 ms press one step at MS phase %i", (phase) => {
    const game = playing(phase);
    game.buffer.keyDown("east");
    game.step(6);
    game.buffer.keyUp("east");
    game.step(8);
    expect(game.moves).toEqual([{ at: 0, position: pos(9, 16) }]);
  });

  it.each([0, 1, 2, 3])("keeps continuous walking evenly spaced at MS phase %i", (phase) => {
    const game = playing(phase);
    game.buffer.keyDown("east");
    game.step(20);
    expect(game.moves.map((move) => move.at)).toEqual([0, 330, 550, 770, 990]);
    game.buffer.keyUp("east");
    game.step(8);
    expect(game.moves).toHaveLength(5);
  });

  it("turns toward the latest press even while an older higher-priority arrow is held", () => {
    const game = playing(0);
    game.buffer.keyDown("north");
    game.step(4);
    game.buffer.keyDown("east");
    game.step(4);
    expect(game.moves).toEqual([
      { at: 0, position: pos(8, 15) },
      { at: 220, position: pos(9, 15) },
    ]);
  });

  it("keeps deliberate new taps responsive during the repeat delay", () => {
    const game = playing(0);
    game.buffer.keyDown("east");
    game.step(4);
    game.buffer.keyUp("east");
    game.buffer.keyDown("east");
    game.step();
    expect(game.position()).toBe(pos(10, 16));
  });

  it("treats a released and re-pressed arrow as the latest intent before a poll", () => {
    const buffer = new LegacyMsInputBuffer("manual");
    buffer.keyDown("north");
    buffer.keyDown("south");
    buffer.keyUp("north");
    buffer.keyDown("north");
    expect(buffer.nextTickInput()).toBe("north");
  });

  it("preserves a busy turn until accepted but cancels its repeats on release", () => {
    const game = playing(0);
    game.buffer.keyDown("east");
    game.step(3);
    game.buffer.keyUp("east");
    game.buffer.keyDown("north");
    game.step(2);
    game.buffer.keyUp("north");
    game.step(8);
    expect(game.moves).toEqual([
      { at: 0, position: pos(9, 16) },
      { at: 220, position: pos(9, 15) },
    ]);
  });

  it("clears a released pending turn even when an older direction remains held", () => {
    const game = playing(0);
    game.buffer.keyDown("north");
    game.step(3);
    game.buffer.keyDown("east");
    game.step(); // MS has already moved this cycle; east is still pending.
    game.buffer.keyUp("east");
    game.step();
    expect(game.position()).toBe(pos(8, 15));
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

  it("does not combine a tapped-and-released orthogonal key into a diagonal with a held key", () => {
    const buffer = new LegacyLynxInputBuffer();

    buffer.keyDown("north");
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.north);

    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.north);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.north);
  });

  it("keeps a quick tap for one poll even if the key is released before the tick", () => {
    const buffer = new LegacyLynxInputBuffer();

    buffer.keyDown("east");
    buffer.keyUp("east");

    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.east);
    expect(buffer.nextTickInputCode()).toBe(GAME_INPUT_CODES.none);
  });
});

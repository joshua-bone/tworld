import { encodeRuntimeInputCode, GAME_INPUT_CODES, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import { createPetCarrierState } from "@game-core/impl/petCarrier";
import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";
import { createEmptyCells, createEmptyCellsAtZ, createLevel, createRequest, pos } from "@ruleset-ms/impl/testSupport";

// Literal IDs also check the stable Meme runtime contract.
const HINT_BOOTS = 0x86;
const RED_TANK = 0x7c;
const CW_BUTTON = 0x87;
const CCW_BUTTON = 0x88;
type Session = ReturnType<typeof createMsInteractiveSession>;
type Trail = { nextIndex: number; marks: { pos: number; z: number; text: string }[] };
const trail = (session: Session) => (session.state.engine as typeof session.state.engine & { hintTrail?: Trail }).hintTrail;

function board(hintText = "A B") {
  const cells = createEmptyCells();
  cells[pos(1, 1)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
  cells[pos(2, 1)]!.top.id = HINT_BOOTS;
  return { cells, hintText, creaturePositions: [pos(1, 1)] };
}
function session(level = board()): Session {
  return createMsInteractiveSession(createRequest(), createLevel(level));
}
function step(current: Session, dir: number, settleTicks = 4): Session {
  const oldPos = current.state.internal.chipPos;
  for (let tick = 0; tick < 16; tick += 1) {
    current = advanceMsInteractiveSession(current, dir);
    if (current.state.internal.chipPos !== oldPos) {
      for (let settle = 0; settle < settleTicks; settle += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
      return current;
    }
  }
  throw new Error("Chip did not move within 16 ticks");
}

describe("MS Meme tiles", () => {
  it("collects Hint boots, writes spaces, loops, and preserves marks on revisits", () => {
    const initial = session();
    const first = step(initial, MS_DIRECTION.east);
    expect(first.state.engine.inventory.boots[4]).toBe(1);
    expect(trail(first)?.marks).toEqual([{ pos: pos(2, 1), z: 1, text: "A" }]);
    let next = step(first, MS_DIRECTION.east);
    next = step(next, MS_DIRECTION.west);
    next = step(next, MS_DIRECTION.east);
    next = step(next, MS_DIRECTION.east);
    next = step(next, MS_DIRECTION.east);
    expect(trail(next)).toEqual({ nextIndex: 1, marks: [
      { pos: pos(2, 1), z: 1, text: "A" },
      { pos: pos(3, 1), z: 1, text: " " },
      { pos: pos(4, 1), z: 1, text: "B" },
      { pos: pos(5, 1), z: 1, text: "A" },
    ] });
    expect(trail(initial)).toBeUndefined();
    expect(trail(first)?.marks).toHaveLength(1);
    expect(projectMsInteractiveFrame(next, "tick").tileOverlays).toContainEqual(expect.objectContaining({ pos: pos(4, 1), kind: "hint-letter" }));
    const restored = structuredClone(first);
    expect(trail(step(restored, MS_DIRECTION.south))?.marks).toEqual([
      { pos: pos(2, 1), z: 1, text: "A" }, { pos: pos(2, 2), z: 1, text: " " },
    ]);
  });

  it("does not mark with an empty hint and stops marking after theft without erasing ink", () => {
    expect(trail(step(session(board("")), MS_DIRECTION.east))).toBeUndefined();
    const level = board("AB");
    level.cells[pos(3, 1)]!.top.id = MS_TILE.Burglar;
    const first = step(session(level), MS_DIRECTION.east);
    const stolen = step(first, MS_DIRECTION.east);
    expect(stolen.state.engine.inventory.boots[4] ?? 0).toBe(0);
    expect(trail(step(stolen, MS_DIRECTION.east))).toEqual(trail(first));
  });

  it("writes forced arrivals after the boots pickup", () => {
    const level = board("AB");
    level.cells[pos(3, 1)]!.top.id = MS_TILE.Slide_East;
    let current = step(session(level), MS_DIRECTION.east);
    current = step(current, MS_DIRECTION.east);
    for (let tick = 0; tick < 8; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
    expect(trail(current)?.marks).toContainEqual({ pos: pos(4, 1), z: 1, text: "A" });
  });

  it("starts Red tanks immediately and leaves a wall-blocked tank facing forward", () => {
    const level = board();
    level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
    level.creaturePositions.push(pos(6, 6));
    let moved = session(level);
    for (let tick = 0; tick < 5; tick += 1) moved = advanceMsInteractiveSession(moved, MS_DIRECTION.none);
    expect(moved.state.internal.creatures.find((actor) => actor.id === RED_TANK)?.pos).toBe(pos(7, 6));
    level.cells[pos(7, 6)]!.top.id = MS_TILE.Wall;
    let blocked = session(level);
    for (let tick = 0; tick < 8; tick += 1) blocked = advanceMsInteractiveSession(blocked, MS_DIRECTION.none);
    expect(blocked.state.internal.creatures.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: pos(6, 6), dir: MS_DIRECTION.east });
  });

  it.each([[CW_BUTTON, MS_DIRECTION.south], [CCW_BUTTON, MS_DIRECTION.north], [MS_TILE.Button_Blue, MS_DIRECTION.east]])(
    "button %i turns only its own tank family", (button, expectedRedDir) => {
      const level = board();
      level.cells[pos(2, 1)]!.top.id = button;
      level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
      level.cells[pos(6, 9)]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east);
      level.creaturePositions.push(pos(6, 6), pos(6, 9));
      const next = step(session(level), MS_DIRECTION.east);
      expect(next.state.internal.creatures.find((actor) => actor.id === RED_TANK)?.dir).toBe(expectedRedDir);
      expect(next.state.internal.creatures.find((actor) => actor.id === MS_TILE.Tank)?.dir).toBe(button === MS_TILE.Button_Blue ? MS_DIRECTION.west : MS_DIRECTION.east);
    },
  );

  it("uses the destination layer hint when falling and keeps layer marks separate", () => {
    const lower = createEmptyCells();
    const upper = createEmptyCellsAtZ(2);
    upper[pos(1, 1)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    upper[pos(2, 1)]!.top.id = HINT_BOOTS;
    upper[pos(3, 1)]!.top.id = MS_TILE.Air;
    let current = createMsInteractiveSession(createRequest(), createLevel({
      cells: lower, hintText: "AB", layers: [
        { z: 1, cells: lower, hintText: "AB", traps: [], cloners: [], creaturePositions: [] },
        { z: 2, cells: upper, hintText: "XY", traps: [], cloners: [], creaturePositions: [pos(1, 1)] },
      ],
    }));
    current = step(current, MS_DIRECTION.east);
    current = step(current, MS_DIRECTION.east);
    for (let tick = 0; tick < 12; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
    expect(trail(current)?.marks).toEqual([
      { pos: pos(2, 1), z: 2, text: "X" },
      { pos: pos(3, 1), z: 2, text: "Y" },
      { pos: pos(3, 1), z: 1, text: "A" },
    ]);
  });

  it.each([MS_TILE.Water, MS_TILE.Fire, MS_TILE.Bomb])("Red tanks retain tank hazards on %i", (floor) => {
    const level = board();
    level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
    level.cells[pos(7, 6)]!.top.id = floor;
    level.creaturePositions.push(pos(6, 6));
    let current = session(level);
    for (let tick = 0; tick < 8; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
    expect(current.state.engine.actors.filter((actor) => actor.id === RED_TANK)).toEqual([]);
  });

  it("a Red tank turns on its own button and continues in the new direction", () => {
    const level = board();
    level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
    level.cells[pos(7, 6)]!.top.id = CW_BUTTON;
    level.creaturePositions.push(pos(6, 6));
    let current = session(level);
    for (let tick = 0; tick < 5; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
    expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: pos(7, 6), dir: MS_DIRECTION.south });
    for (let tick = 0; tick < 4; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
    expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: pos(7, 7), dir: MS_DIRECTION.south });
  });

  it("Red tanks clone through the existing cloner button without losing their family", () => {
    const level = board();
    level.cells[pos(2, 1)]!.top.id = MS_TILE.Button_Red;
    level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
    level.cells[pos(6, 6)]!.bottom.id = MS_TILE.CloneMachine;
    level.creaturePositions.push(pos(6, 6));
    let current = createMsInteractiveSession(createRequest(), createLevel({ ...level, cloners: [{ from: pos(2, 1), to: pos(6, 6) }] }));
    current = step(current, MS_DIRECTION.east);
    expect(current.state.engine.actors.filter((actor) => actor.id === RED_TANK).map((actor) => actor.position.pos)).toEqual([pos(6, 6), pos(7, 6)]);
  });


  it("displays a quarter-turn immediately when Chip presses a Red tank button", () => {
    const level = board();
    level.cells[pos(2, 1)]!.top.id = CW_BUTTON;
    level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
    level.cells[pos(7, 6)]!.top.id = MS_TILE.Wall;
    level.creaturePositions.push(pos(6, 6));
    const current = advanceMsInteractiveSession(session(level), MS_DIRECTION.east);
    expect(current.state.engine.map.cells[pos(6, 6)]!.top.id).toBe(msCreatureTile(RED_TANK, MS_DIRECTION.south));
  });


  it("marks a teleport entrance before its destination on planar entry", () => {
    const level = board("ABCD");
    level.cells[pos(3, 1)]!.top.id = MS_TILE.Teleport;
    level.cells[pos(6, 2)]!.top.id = MS_TILE.Teleport;
    const first = step(session(level), MS_DIRECTION.east);
    const teleported = step(first, MS_DIRECTION.east, 0);
    expect(teleported.state.internal.chipPos).toBe(pos(6, 2));
    expect(trail(teleported)).toEqual({ nextIndex: 3, marks: [
      { pos: pos(2, 1), z: 1, text: "A" },
      { pos: pos(3, 1), z: 1, text: "B" },
      { pos: pos(6, 2), z: 1, text: "C" },
    ] });
    expect(trail(first)?.marks).toHaveLength(1);
  });

  it("marks the lower teleport entrance before its destination when falling", () => {
    const lower = createEmptyCells();
    const upper = createEmptyCellsAtZ(2);
    upper[pos(1, 1)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    upper[pos(2, 1)]!.top.id = HINT_BOOTS;
    upper[pos(3, 1)]!.top.id = MS_TILE.Air;
    lower[pos(3, 1)]!.top.id = MS_TILE.Teleport;
    lower[pos(6, 2)]!.top.id = MS_TILE.Teleport;
    let current = createMsInteractiveSession(createRequest(), createLevel({
      cells: lower, hintText: "ABCD", layers: [
        { z: 1, cells: lower, hintText: "ABCD", traps: [], cloners: [], creaturePositions: [] },
        { z: 2, cells: upper, hintText: "ABCD", traps: [], cloners: [], creaturePositions: [pos(1, 1)] },
      ],
    }));
    current = step(current, MS_DIRECTION.east);
    current = step(current, MS_DIRECTION.east, 0);
    for (let tick = 0; tick < 16 && current.state.internal.chipZ !== 1; tick += 1) {
      current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
    }
    expect(current.state.internal.chipPos).toBe(pos(6, 2));
    expect(trail(current)).toEqual({ nextIndex: 0, marks: [
      { pos: pos(2, 1), z: 2, text: "A" },
      { pos: pos(3, 1), z: 2, text: "B" },
      { pos: pos(3, 1), z: 1, text: "C" },
      { pos: pos(6, 2), z: 1, text: "D" },
    ] });
  });

  it.each([false, true])("marks an entered teleport once when no destination is usable (%s)", (hasBlockedDestination) => {
    const level = board("ABCD");
    level.cells[pos(3, 1)]!.top.id = MS_TILE.Teleport;
    if (hasBlockedDestination) {
      level.cells[pos(6, 2)]!.top.id = MS_TILE.Teleport;
      level.cells[pos(7, 2)]!.top.id = MS_TILE.Wall;
    }
    const current = step(step(session(level), MS_DIRECTION.east), MS_DIRECTION.east, 0);
    expect(current.state.internal.chipPos).toBe(pos(3, 1));
    expect(trail(current)).toEqual({ nextIndex: 2, marks: [
      { pos: pos(2, 1), z: 1, text: "A" },
      { pos: pos(3, 1), z: 1, text: "B" },
    ] });
  });

  it("does not write a teleport covered by a wall when the move is blocked", () => {
    const level = board("ABCD");
    level.cells[pos(3, 1)]!.top.id = MS_TILE.Wall;
    level.cells[pos(3, 1)]!.bottom.id = MS_TILE.Teleport;
    const first = step(session(level), MS_DIRECTION.east);
    let current = first;
    for (let tick = 0; tick < 8; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.east);
    expect(current.state.internal.chipPos).toBe(pos(2, 1));
    expect(trail(current)).toEqual(trail(first));
  });


  describe.each([
    [MS_TILE.Block, MS_TILE.Block_Static],
    [MS_TILE.IceBlock, MS_TILE.IceBlock_Static],
  ])("block actor %i activates Meme buttons", (actorId, staticTile) => {
    it.each([[CW_BUTTON, MS_DIRECTION.south], [CCW_BUTTON, MS_DIRECTION.north]])(
      "pushing onto button %i turns Red tanks", (button, expectedDir) => {
        const level = board();
        level.cells[pos(2, 1)]!.top.id = staticTile;
        level.cells[pos(3, 1)]!.top.id = button;
        level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
        level.creaturePositions.push(pos(6, 6));
        const current = advanceMsInteractiveSession(session(level), MS_DIRECTION.east);
        expect(current.state.engine.map.cells[pos(3, 1)]!.top.id).toBe(staticTile);
        expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)?.dir).toBe(expectedDir);
      },
    );

    it.each([[CW_BUTTON, MS_DIRECTION.south], [CCW_BUTTON, MS_DIRECTION.north]])(
      "cloning onto button %i turns Red tanks", (button, expectedDir) => {
        const level = board();
        level.cells[pos(2, 1)]!.top.id = MS_TILE.Button_Red;
        level.cells[pos(10, 10)]!.top.id = msCreatureTile(actorId, MS_DIRECTION.east);
        level.cells[pos(10, 10)]!.bottom.id = MS_TILE.CloneMachine;
        level.cells[pos(11, 10)]!.top.id = button;
        level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
        level.creaturePositions.push(pos(10, 10), pos(6, 6));
        const current = advanceMsInteractiveSession(createMsInteractiveSession(createRequest(), createLevel({
          ...level, cloners: [{ from: pos(2, 1), to: pos(10, 10) }],
        })), MS_DIRECTION.east);
        expect(current.state.engine.map.cells[pos(11, 10)]!.top.id).toBe(staticTile);
        expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)?.dir).toBe(expectedDir);
      },
    );

    it.each([[CW_BUTTON, MS_DIRECTION.south], [CCW_BUTTON, MS_DIRECTION.north]])(
      "releasing from a pet carrier onto button %i turns Red tanks", (button, expectedDir) => {
        const level = board();
        level.cells[pos(2, 1)]!.top.id = button;
        level.cells[pos(6, 6)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
        level.creaturePositions.push(pos(6, 6));
        const initial = session(level);
        initial.state.engine.inventory.tools = [MS_TILE.PetCarrier];
        initial.state.internal.portableTools.portableItems.push({
          serial: initial.state.internal.portableTools.nextPortableItemSerial++,
          family: "pet-carrier", tileId: MS_TILE.PetCarrier, inventorySlot: "tools",
          state: { mode: "carried" },
          petCarrierState: createPetCarrierState({ occupant: { actorId, dir: MS_DIRECTION.east } }),
        });
        const current = advanceMsInteractiveSession(initial, encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1));
        expect(current.state.engine.map.cells[pos(2, 1)]!.top.id).toBe(staticTile);
        expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)?.dir).toBe(expectedDir);
      },
    );
  });


  it.each([[CW_BUTTON, MS_DIRECTION.south, pos(7, 3)], [CCW_BUTTON, MS_DIRECTION.north, pos(7, 1)]])(
    "a nested cloner button %i turns the arriving Red tank exactly once without leaving a ghost", (button, expectedDir, nextPos) => {
      const level = board();
      level.cells[pos(6, 2)]!.top.id = msCreatureTile(RED_TANK, MS_DIRECTION.east);
      level.cells[pos(7, 2)]!.top.id = MS_TILE.Button_Red;
      level.cells[pos(8, 6)]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.east);
      level.cells[pos(8, 6)]!.bottom.id = MS_TILE.CloneMachine;
      level.cells[pos(9, 6)]!.top.id = button;
      level.creaturePositions.push(pos(6, 2));
      let current = createMsInteractiveSession(createRequest(), createLevel({
        ...level, cloners: [{ from: pos(7, 2), to: pos(8, 6) }],
      }));
      for (let tick = 0; tick < 5; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
      expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: pos(7, 2), dir: expectedDir });
      expect(current.state.engine.map.cells[pos(6, 2)]!.top.id).toBe(MS_TILE.Empty);
      expect(current.state.engine.actors.filter((actor) => actor.id === RED_TANK)).toHaveLength(1);
      for (let tick = 0; tick < 4; tick += 1) current = advanceMsInteractiveSession(current, MS_DIRECTION.none);
      expect(current.state.internal.creatures.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: nextPos, dir: expectedDir });
    },
  );

});

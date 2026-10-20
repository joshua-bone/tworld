import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { lynxButtonAction, lynxInventoryIndex, lynxInventorySlot } from "@ruleset-lynx/impl/catalog";
import { lookupLynxActorDefinition } from "@ruleset-lynx/impl/catalogActors";
import { advanceLynxInteractiveSession, createLynxInteractiveSession } from "@ruleset-lynx/impl/engine";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import { canLynxPetCarrierCaptureActor } from "@ruleset-lynx/impl/petCarrierSnapshots";
import { advanceLynxTicks, createBoardAtZ, createCell, createCellAtZ, createLevel, createRequest, createTwoLayerLevel } from "@ruleset-lynx/impl/testSupport";

const RED_TANK = 0x7c;
const HINT_BOOTS = 0x86;
const CLOCKWISE_BUTTON = 0x87;
const COUNTERCLOCKWISE_BUTTON = 0x88;
const trail = (state: ReturnType<typeof createLynxInteractiveSession>["state"]) => state.hintTrail;
const step = (session: ReturnType<typeof createLynxInteractiveSession>, direction: number) => advanceLynxTicks(session, 4, direction);

function tankSession(button: number, redFloor: number = MS_TILE.Empty) {
  return createLynxInteractiveSession(createRequest(), createLevel([
    createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
    createCell(34, button),
    createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east), redFloor),
    createCell(71, MS_TILE.Wall), createCell(102, MS_TILE.Wall),
    createCell(38, MS_TILE.Wall), createCell(69, MS_TILE.Wall),
    createCell(90, msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east)),
    createCell(91, MS_TILE.Wall), createCell(89, MS_TILE.Wall),
  ], [33, 70, 90]));
}

describe("Lynx Meme tiles", () => {
  it("registers the fifth boot and independent tank button policies", () => {
    expect(lynxInventorySlot(HINT_BOOTS)).toBe("boots");
    expect(lynxInventoryIndex(HINT_BOOTS)).toBe(4);
    expect(lynxButtonAction(CLOCKWISE_BUTTON)).toBe("turn-red-tanks-cw");
    expect(lynxButtonAction(COUNTERCLOCKWISE_BUTTON)).toBe("turn-red-tanks-ccw");
    expect(lookupLynxActorDefinition(RED_TANK)?.capabilities.control.mode).toBe("ai");
  });
  it("collects Hint boots, writes spaces, loops, and preserves marks on revisits", () => {
    let session = createLynxInteractiveSession(createRequest(), {
      ...createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, HINT_BOOTS)], [33]),
      hintText: "A B",
    });
    session = step(session, MS_DIRECTION.east);
    expect(session.state.inventory.boots[4]).toBe(1);
    expect(trail(session.state)?.marks).toEqual([{ pos: 34, z: 1, text: "A" }]);
    const firstTrail = trail(session.state);
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.west);
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    expect(trail(session.state)?.marks).toEqual([
      { pos: 34, z: 1, text: "A" }, { pos: 35, z: 1, text: " " },
      { pos: 36, z: 1, text: "B" }, { pos: 37, z: 1, text: "A" },
    ]);
    expect(firstTrail?.marks).toEqual([{ pos: 34, z: 1, text: "A" }]);
    expect(projectLynxInteractiveFrame(session, "tick").tileOverlays).toEqual(expect.arrayContaining([
      expect.objectContaining({ pos: 34, z: 1, kind: "hint-letter" }),
      expect.objectContaining({ pos: 36, z: 1, kind: "hint-letter" }),
    ]));
  });
  it("removes Hint boots on thieves while preserving the trail", () => {
    let session = createLynxInteractiveSession(createRequest(), {
      ...createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, HINT_BOOTS), createCell(35, MS_TILE.Burglar)], [33]), hintText: "AB",
    });
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    expect(session.state.inventory.boots[4] ?? 0).toBe(0);
    expect(trail(session.state)?.marks).toEqual([{ pos: 34, z: 1, text: "A" }]);
  });
  it("starts Red tanks moving at the same speed as Blue tanks", () => {
    const session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east)), createCell(90, msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east)),
    ], [33, 70, 90]));
    const next = advanceLynxInteractiveSession(session, 0);
    expect(next.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 71, moving: 6, dir: MS_DIRECTION.east });
    expect(next.actors.find((actor) => actor.id === MS_TILE.Tank)).toMatchObject({ pos: 91, moving: 6 });
  });
  it.each([[CLOCKWISE_BUTTON, MS_DIRECTION.south], [COUNTERCLOCKWISE_BUTTON, MS_DIRECTION.north]])("turns blocked Red tanks once on arrival at button %i", (button, direction) => {
    let session = step(tankSession(button), MS_DIRECTION.east);
    session = advanceLynxTicks(session, 8);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 70, dir: direction, moving: 0 });
    expect(session.actors.find((actor) => actor.id === MS_TILE.Tank)?.dir).toBe(MS_DIRECTION.east);
  });
  it("keeps Blue and Red tank buttons independent", () => {
    const session = advanceLynxTicks(step(tankSession(MS_TILE.Button_Blue), MS_DIRECTION.east), 1);
    expect(session.actors.find((actor) => actor.id === RED_TANK)?.dir).toBe(MS_DIRECTION.east);
    expect(session.actors.find((actor) => actor.id === MS_TILE.Tank)?.dir).toBe(MS_DIRECTION.west);
  });
  it("finishes the in-flight path before applying a quarter turn", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, MS_TILE.Ice), createCell(35, CLOCKWISE_BUTTON),
      createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east)),
    ], [33, 70]));
    session = advanceLynxTicks(session, 6, MS_DIRECTION.east);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 72, dir: MS_DIRECTION.east, moving: 4 });
    session = advanceLynxTicks(session, 2);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 72, moving: 0 });
    session = advanceLynxTicks(session, 1);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 104, dir: MS_DIRECTION.south, moving: 6 });
  });
  it("marks both the teleport entrance and the newly entered destination", () => {
    let session = createLynxInteractiveSession(createRequest(), {
      ...createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, HINT_BOOTS),
        createCell(35, MS_TILE.Teleport), createCell(70, MS_TILE.Teleport),
      ], [33]), hintText: "ABCD",
    });
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    expect(session.chipPos).toBe(70);
    expect(trail(session.state)?.marks).toEqual([
      { pos: 34, z: 1, text: "A" }, { pos: 35, z: 1, text: "B" }, { pos: 70, z: 1, text: "C" },
    ]);
  });
  it("registers Red tanks in the creature family for normal carrier interactions", () => {
    expect(canLynxPetCarrierCaptureActor(RED_TANK)).toBe(true);
  });

  it("counts overlapping presses and does not repeat a held button", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, CLOCKWISE_BUTTON),
      createCell(66, msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east)), createCell(67, CLOCKWISE_BUTTON),
      createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east)),
      createCell(71, MS_TILE.Wall), createCell(102, MS_TILE.Wall), createCell(38, MS_TILE.Wall), createCell(69, MS_TILE.Wall),
    ], [33, 66, 70]));
    session = step(session, MS_DIRECTION.east);
    session = advanceLynxTicks(session, 1);
    expect(session.actors.find((actor) => actor.id === RED_TANK)?.dir).toBe(MS_DIRECTION.west);
    session = advanceLynxTicks(session, 2);
    expect(session.actors.find((actor) => actor.id === RED_TANK)?.dir).toBe(MS_DIRECTION.west);
  });
  it("turns again after Chip leaves and re-enters a button", () => {
    let session = step(tankSession(CLOCKWISE_BUTTON), MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.west);
    session = step(session, MS_DIRECTION.east);
    session = advanceLynxTicks(session, 1);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 70, dir: MS_DIRECTION.west });
  });
  it("keeps normal tank water, bomb, fire and force-floor behavior", () => {
    for (const [floor, hidden] of [[MS_TILE.Water, true], [MS_TILE.Bomb, true], [MS_TILE.Fire, false]] as const) {
      let session = createLynxInteractiveSession(createRequest(), createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
        createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east)), createCell(71, floor),
      ], [33, 70]));
      session = advanceLynxTicks(session, 4);
      expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ hidden, pos: hidden ? 71 : 70 });
    }
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east), MS_TILE.Slide_South),
      createCell(71, MS_TILE.Wall),
    ], [33, 70]));
    session = advanceLynxTicks(session, 2);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 102, dir: MS_DIRECTION.south, moving: 6 });
  });
  it("turns held cloner tanks and releases native tank clones", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(34, CLOCKWISE_BUTTON), createCell(35, MS_TILE.Button_Red),
      createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east), MS_TILE.CloneMachine),
    ], [33, 70], { cloners: [{ from: 35, to: 70 }] }));
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    const tanks = session.actors.filter((actor) => actor.id === RED_TANK && !actor.hidden);
    expect(tanks).toHaveLength(2);
    expect(tanks.map((actor) => actor.dir)).toEqual([MS_DIRECTION.south, MS_DIRECTION.south]);
    expect(tanks.some((actor) => actor.pos === 70)).toBe(true);
    expect(tanks.some((actor) => actor.pos === 102)).toBe(true);
  });
  it("uses the current layer hint on vertical arrival and keeps layers distinct", () => {
    const lower = createBoardAtZ(1);
    const upper = createBoardAtZ(2);
    lower[34] = createCell(34, MS_TILE.Empty);
    upper[33] = createCellAtZ(33, 2, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    upper[34] = createCellAtZ(34, 2, HINT_BOOTS, MS_TILE.Air);
    const level = createTwoLayerLevel(lower, upper, { upperCreaturePositions: [33] });
    level.layers![0]!.hintText = "ab";
    level.layers![1]!.hintText = "XY";
    let session = createLynxInteractiveSession(createRequest(), level);
    session = step(session, MS_DIRECTION.east);
    session = advanceLynxTicks(session, 2);
    expect(session.chipZ).toBe(1);
    expect(trail(session.state)?.marks).toEqual([
      { pos: 34, z: 2, text: "X" }, { pos: 34, z: 1, text: "b" },
    ]);
  });
  it("keeps empty hints blank and never writes on a blocked move", () => {
    for (const hintText of ["", "A"]) {
      let session = createLynxInteractiveSession(createRequest(), {
        ...createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, MS_TILE.Wall)], [33]), hintText,
      });
      session.state.inventory.boots[4] = 1;
      session = step(session, MS_DIRECTION.east);
      expect(trail(session.state)).toBeUndefined();
    }
  });

  it("releases turned Red tanks from beartraps through native brown-button timing", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(34, CLOCKWISE_BUTTON), createCell(35, MS_TILE.Button_Brown),
      createCell(70, msCreatureTile(RED_TANK, MS_DIRECTION.east), MS_TILE.Beartrap),
    ], [33, 70], { traps: [{ from: 35, to: 70 }] }));
    session = step(session, MS_DIRECTION.east);
    session = step(session, MS_DIRECTION.east);
    expect(session.actors.find((actor) => actor.id === RED_TANK)).toMatchObject({ pos: 102, dir: MS_DIRECTION.south });
  });
  it("lets inventory-capable actors collect Hint boots without writing Chip's trail", () => {
    let session = createLynxInteractiveSession(createRequest(), {
      ...createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
        createCell(70, msCreatureTile(MS_TILE.BowlingBall, MS_DIRECTION.east)), createCell(71, HINT_BOOTS),
      ], [33, 70]), hintText: "ABC",
    });
    session = advanceLynxTicks(session, 4);
    expect(session.state.map.cells[71]?.top.id).toBe(MS_TILE.Empty);
    expect(session.state.inventory.boots[4] ?? 0).toBe(0);
    expect(trail(session.state)).toBeUndefined();
  });
  it("does not create marks when Chip enters a tile with an empty hint", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)), createCell(34, HINT_BOOTS),
    ], [33]));
    session = step(session, MS_DIRECTION.east);
    expect(session.state.inventory.boots[4]).toBe(1);
    expect(trail(session.state)).toBeUndefined();
  });

});

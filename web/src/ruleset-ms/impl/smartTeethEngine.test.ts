import { describe, expect, it } from "vitest";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import { advanceMsInteractiveSession, createMsInteractiveSession } from "@ruleset-ms/impl/engine";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { createEmptyCells, createLevel, createRequest, pos } from "@ruleset-ms/impl/testSupport";
import { projectMsInteractiveFrame } from "@ruleset-ms/impl/interactiveProjection";

function maze() {
  const cells = createEmptyCells();
  for (const cell of cells) cell.top.id = MS_TILE.Wall;
  for (let y = 1; y <= 6; y += 1) {
    for (let x = 1; x <= 7; x += 1) cells[pos(x, y)]!.top.id = MS_TILE.Empty;
  }
  return cells;
}

function advance(session: ReturnType<typeof createMsInteractiveSession>, count: number) {
  for (let tick = 0; tick < count; tick += 1) session = advanceMsInteractiveSession(session, GAME_INPUT_CODES.none);
  return session;
}

describe("MS Smart Teeth integration", () => {
  it.each([false, true])("uses a helper button before the pursuer crosses while the extra hunter holds (helper first: %s)", (helperFirst) => {
    const cells = createEmptyCells();
    for (const cell of cells) cell.top.id = MS_TILE.Wall;
    const pursuerPos = pos(4, 3);
    const helperPos = pos(2, 6);
    const extraPos = pos(2, 8);
    cells[pursuerPos]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[pursuerPos + 1]!.top.id = MS_TILE.SwitchWall_Closed;
    cells[pursuerPos + 2]!.top.id = MS_TILE.Empty;
    cells[pursuerPos + 3]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[helperPos]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[helperPos + 1]!.top.id = MS_TILE.Button_Green;
    cells[extraPos]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[extraPos + 1]!.top.id = MS_TILE.Button_Green;
    const creaturePositions = helperFirst ? [helperPos, pursuerPos, extraPos] : [pursuerPos, helperPos, extraPos];
    const initial = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions }));
    const hunter = (session: typeof initial, serial: number) => session.state.internal.creatures.find((actor) => actor.serial === serial)!;
    const pursuer = initial.state.internal.creatures.find((actor) => actor.pos === pursuerPos)!;
    const helper = initial.state.internal.creatures.find((actor) => actor.pos === helperPos)!;
    const extra = initial.state.internal.creatures.find((actor) => actor.pos === extraPos)!;
    expect(helper.plannedPath?.[1]?.pos).toBe(helperPos + 1);
    expect(pursuer.plannedPath?.[1]?.wait).toBe(true);
    expect(extra.plannedPath?.some((node) => node.toggled)).toBe(false);
    const restored = structuredClone(initial);
    const opened = advance(initial, 9);
    expect(hunter(opened, helper.serial).pos).toBe(helperPos + 1);
    expect(hunter(opened, pursuer.serial).pos).toBe(pursuerPos + (helperFirst ? 1 : 0));
    expect(hunter(opened, extra.serial).pos).toBe(extraPos);
    const openedDoor = opened.state.engine.map.cells[pursuerPos + 1]!;
    expect((helperFirst ? openedDoor.bottom : openedDoor.top).id).toBe(MS_TILE.SwitchWall_Open);
    const crossed = advance(opened, 8);
    expect(hunter(crossed, pursuer.serial).pos).toBe(pursuerPos + (helperFirst ? 2 : 1));
    expect(crossed.state.engine.map.cells[extraPos + 1]!.top.id).toBe(MS_TILE.Button_Green);
    expect(advance(restored, 17).state.internal.creatures).toEqual(crossed.state.internal.creatures);
    expect(initial.state.engine.map.cells[pursuerPos + 1]!.top.id).toBe(MS_TILE.SwitchWall_Closed);
  });

  it("walks away to press a green button then returns through the newly opened wall", () => {
    const cells = createEmptyCells();
    for (const cell of cells) cell.top.id = MS_TILE.Wall;
    const start = pos(2, 3);
    cells[start - 1]!.top.id = MS_TILE.Button_Green;
    cells[start]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[start + 1]!.top.id = MS_TILE.SwitchWall_Closed;
    cells[start + 2]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    const initial = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    expect(initial.state.internal.creatures[0]?.plannedPath?.map((node) => node.pos)).toEqual([start, start - 1, start, start + 1, start + 2]);
    expect(initial.state.engine.map.cells[start + 1]!.top.id).toBe(MS_TILE.SwitchWall_Closed);
    const pressed = advance(initial, 9);
    expect(pressed.state.internal.creatures[0]?.pos).toBe(start - 1);
    expect(pressed.state.engine.map.cells[start + 1]!.top.id).toBe(MS_TILE.SwitchWall_Open);
    expect(pressed.state.internal.creatures[0]?.plannedPath?.[0]?.toggled ?? false).toBe(false);
    const throughWall = advance(pressed, 16);
    expect(throughWall.state.internal.creatures[0]?.pos).toBe(start + 1);
    expect(initial.state.engine.map.cells[start + 1]!.top.id).toBe(MS_TILE.SwitchWall_Closed);
  });

  it("refreshes toggle parity immediately after a forced arrival presses the button", () => {
    const cells = createEmptyCells();
    for (const cell of cells) cell.top.id = MS_TILE.Wall;
    const start = pos(3, 3);
    cells[start - 2]!.top.id = MS_TILE.Button_Green;
    cells[start - 1]!.top.id = MS_TILE.Ice;
    cells[start]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.west);
    cells[start + 1]!.top.id = MS_TILE.SwitchWall_Closed;
    cells[start + 2]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    let session = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    for (let tick = 0; tick < 16 && session.state.engine.map.cells[start + 1]!.top.id === MS_TILE.SwitchWall_Closed; tick += 1) {
      session = advance(session, 1);
    }
    expect(session.state.engine.map.cells[start + 1]!.top.id).toBe(MS_TILE.SwitchWall_Open);
    expect(session.state.internal.creatures[0]?.plannedPath?.[0]?.toggled ?? false).toBe(false);
    expect(session.state.internal.creatures[0]?.plannedPath?.at(-1)?.pos).toBe(start + 2);
  });

  it("takes a safe detour at native Teeth half speed and preserves earlier route snapshots", () => {
    const cells = maze();
    const start = pos(2, 3);
    cells[start]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[pos(4, 3)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[pos(3, 3)]!.top.id = MS_TILE.Water;
    const initial = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    const originalPath = structuredClone(initial.state.internal.creatures[0]?.plannedPath);
    expect(originalPath?.length).toBeGreaterThan(2);
    expect(originalPath?.some((node) => node.pos === pos(3, 3))).toBe(false);
    const beforeMove = advance(initial, 8);
    expect(beforeMove.state.internal.creatures[0]?.pos).toBe(start);
    const moved = advance(beforeMove, 1);
    expect(moved.state.internal.creatures[0]?.pos).toBe(pos(2, 2));
    expect(initial.state.internal.creatures[0]?.plannedPath).toEqual(originalPath);
    expect(projectMsInteractiveFrame(moved, "tick").tileOverlays.some((overlay) => overlay.kind === "planned-route")).toBe(true);
  });

  it("assigns direct pursuit to the shortest legal path and distinct targets to the other hunter", () => {
    const cells = maze();
    const closeButDetoured = pos(4, 3);
    const shorterPath = pos(6, 6);
    cells[closeButDetoured]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[shorterPath]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.north);
    cells[pos(6, 3)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[pos(5, 3)]!.top.id = MS_TILE.Wall;
    const session = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [closeButDetoured, shorterPath] }));
    const hunters = session.state.internal.creatures;
    expect(hunters.find((actor) => actor.pos === shorterPath)?.plannedDirect).toBe(true);
    expect(hunters.find((actor) => actor.pos === closeButDetoured)?.plannedDirect).toBe(false);
    const targets = hunters.map((actor) => actor.plannedPath?.at(-1)?.pos);
    expect(new Set(targets).size).toBe(2);
  });

  it("replans for a moved player and reproduces the same route after snapshot restore", () => {
    const cells = maze();
    const start = pos(2, 3);
    cells[start]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[pos(6, 3)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    const initial = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [start] }));
    const shifted = advanceMsInteractiveSession(initial, MS_DIRECTION.south);
    expect(shifted.state.internal.chipPos).toBe(pos(6, 4));
    const restored = structuredClone(shifted);
    const advanced = advance(shifted, 8);
    const replayed = advance(restored, 8);
    expect(advanced.state.internal.creatures[0]?.plannedPath?.at(-1)?.pos).toBe(pos(6, 4));
    expect(replayed.state.internal.creatures).toEqual(advanced.state.internal.creatures);
    expect(projectMsInteractiveFrame(replayed, "tick").tileOverlays).toEqual(projectMsInteractiveFrame(advanced, "tick").tileOverlays);
  });

  it("reassigns a stale forced hunter plan in the same global round as a ready hunter", () => {
    const cells = maze();
    const forcedPos = pos(5, 2);
    const readyPos = pos(2, 4);
    cells[forcedPos]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[forcedPos]!.bottom.id = MS_TILE.Slide_East;
    cells[readyPos]!.top.id = msCreatureTile(MS_TILE.SmartTeeth, MS_DIRECTION.east);
    cells[pos(7, 2)]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    const initial = createMsInteractiveSession(createRequest(), createLevel({ cells, creaturePositions: [forcedPos, readyPos] }));
    const forced = initial.state.internal.creatures.find((actor) => actor.pos === forcedPos)!;
    expect(forced.plannedDirect).toBe(true);
    // An earlier round put this hunter on a force floor; a newly closed wall
    // now invalidates its route while another hunter can move normally.
    forced.floorMovement = "slide";
    forced.floorMovementDir = MS_DIRECTION.east;
    initial.state.engine.map.cells[forcedPos + 1]!.top.id = MS_TILE.Wall;
    const current = advance(initial, 9);
    const directHunters = current.state.internal.creatures.filter((actor) => actor.plannedDirect);
    expect(directHunters).toHaveLength(1);
    expect(directHunters[0]?.serial).not.toBe(forced.serial);
    expect(current.state.internal.creatures.find((actor) => actor.serial === forced.serial)?.plannedPath).toHaveLength(1);
  });
});

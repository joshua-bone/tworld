import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import { advanceLynxInteractiveSession, createLynxInteractiveSession, createLynxReplaySession } from "@ruleset-lynx/impl/engine";
import { projectLynxInteractiveFrame } from "@ruleset-lynx/impl/interactiveProjection";
import { createBoardAtZ, createCell, createLevel, createRequest, pos } from "@ruleset-lynx/impl/testSupport";

const SMART_TEETH = MS_TILE.SmartTeeth;

describe("Lynx Smart Teeth", () => {
  it("sends a nearby helper to a useful button while the pursuer waits for the real opening", () => {
    const cells = createBoardAtZ(1).map((cell) => createCell(cell.position.pos, MS_TILE.Wall));
    cells[pos(3, 2)] = createCell(pos(3, 2), msCreatureTile(SMART_TEETH, MS_DIRECTION.west));
    cells[pos(2, 2)] = createCell(pos(2, 2), MS_TILE.Button_Green);
    cells[pos(10, 10)] = createCell(pos(10, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.north));
    cells[pos(10, 9)] = createCell(pos(10, 9), MS_TILE.Empty);
    cells[pos(11, 10)] = createCell(pos(11, 10), MS_TILE.SwitchWall_Closed);
    cells[pos(12, 10)] = createCell(pos(12, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    let session = createLynxInteractiveSession(createRequest(), createLevel(cells));
    const helperSerial = session.actors.find((actor) => actor.pos === pos(3, 2))!.serial;
    const pursuerSerial = session.actors.find((actor) => actor.pos === pos(10, 10))!.serial;
    expect(session.actors.find((actor) => actor.serial === helperSerial)?.plannedPath?.[1]?.pos).toBe(pos(2, 2));
    expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.plannedPath?.[1]?.wait).toBe(true);
    session = advanceLynxInteractiveSession(session, 0);
    const checkpoint = structuredClone(session);
    expect(session.actors.find((actor) => actor.serial === helperSerial)?.pos).toBe(pos(2, 2));
    for (let tick = 1; tick < 4; tick += 1) {
      expect(session.state.map.cells[pos(11, 10)]?.top.id).toBe(MS_TILE.SwitchWall_Closed);
      expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.pos).toBe(pos(10, 10));
      session = advanceLynxInteractiveSession(session, 0);
    }
    for (let tick = 4; tick <= 8; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    expect(session.state.map.cells[pos(11, 10)]?.top.id).toBe(MS_TILE.SwitchWall_Open);
    expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.pos).toBe(pos(11, 10));
    let restored = checkpoint;
    for (let tick = 1; tick <= 8; tick += 1) restored = advanceLynxInteractiveSession(restored, 0);
    expect(restored.actors).toEqual(session.actors);
    expect(restored.state.map.cells).toEqual(session.state.map.cells);
  });

  it("allows a useful helper press while an unrelated hunter is held in a closed trap", () => {
    const cells = createBoardAtZ(1).map((cell) => createCell(cell.position.pos, MS_TILE.Wall));
    cells[pos(3, 2)] = createCell(pos(3, 2), msCreatureTile(SMART_TEETH, MS_DIRECTION.west));
    cells[pos(2, 2)] = createCell(pos(2, 2), MS_TILE.Button_Green);
    cells[pos(10, 10)] = createCell(pos(10, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east));
    cells[pos(11, 10)] = createCell(pos(11, 10), MS_TILE.SwitchWall_Closed);
    cells[pos(12, 10)] = createCell(pos(12, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    cells[pos(20, 20)] = createCell(pos(20, 20), msCreatureTile(SMART_TEETH, MS_DIRECTION.east), MS_TILE.Beartrap);
    let session = createLynxInteractiveSession(createRequest(), createLevel(cells));
    const helperSerial = session.actors.find((actor) => actor.pos === pos(3, 2))!.serial;
    const pursuerSerial = session.actors.find((actor) => actor.pos === pos(10, 10))!.serial;
    const trappedSerial = session.actors.find((actor) => actor.pos === pos(20, 20))!.serial;
    expect(session.actors.find((actor) => actor.serial === helperSerial)?.plannedPath?.[1]?.pos).toBe(pos(2, 2));
    for (let tick = 0; tick <= 8; tick += 1) {
      session = advanceLynxInteractiveSession(session, 0);
      expect(session.actors.find((actor) => actor.serial === trappedSerial)?.pos).toBe(pos(20, 20));
      expect(session.actors.find((actor) => actor.serial === trappedSerial)?.moving).toBe(0);
    }
    expect(session.state.map.cells[pos(11, 10)]?.top.id).toBe(MS_TILE.SwitchWall_Open);
    expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.pos).toBe(pos(11, 10));
  });

  it("keeps a second helper off its button while the first helper has a committed green arrival", () => {
    const cells = createBoardAtZ(1).map((cell) => createCell(cell.position.pos, MS_TILE.Wall));
    for (const y of [2, 4]) {
      cells[pos(3, y)] = createCell(pos(3, y), msCreatureTile(SMART_TEETH, MS_DIRECTION.west));
      cells[pos(2, y)] = createCell(pos(2, y), MS_TILE.Button_Green);
    }
    cells[pos(10, 10)] = createCell(pos(10, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.north));
    cells[pos(11, 10)] = createCell(pos(11, 10), MS_TILE.SwitchWall_Closed);
    cells[pos(12, 10)] = createCell(pos(12, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    let session = createLynxInteractiveSession(createRequest(), createLevel(cells));
    const helperSerial = session.actors.find((actor) => actor.pos === pos(3, 2))!.serial;
    const spareSerial = session.actors.find((actor) => actor.pos === pos(3, 4))!.serial;
    const pursuerSerial = session.actors.find((actor) => actor.pos === pos(10, 10))!.serial;
    session = advanceLynxInteractiveSession(session, 0);
    const checkpoint = structuredClone(session);
    expect(session.actors.find((actor) => actor.serial === helperSerial)?.moving).toBeGreaterThan(0);
    expect(session.actors.find((actor) => actor.serial === helperSerial)?.pos).toBe(pos(2, 2));
    for (let tick = 1; tick <= 8; tick += 1) {
      session = advanceLynxInteractiveSession(session, 0);
      expect(session.actors.find((actor) => actor.serial === spareSerial)?.pos, `tick ${tick}`).toBe(pos(3, 4));
      if (tick < 4) expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.pos).toBe(pos(10, 10));
    }
    expect(session.state.map.cells[pos(11, 10)]?.top.id).toBe(MS_TILE.SwitchWall_Open);
    expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.pos).toBe(pos(11, 10));
    let restored = checkpoint;
    for (let tick = 1; tick <= 8; tick += 1) restored = advanceLynxInteractiveSession(restored, 0);
    expect(restored.actors).toEqual(session.actors);
    expect(restored.state.map.cells).toEqual(session.state.map.cells);
  });

  it("keeps a third hunter out of a teleport whose safe exit will close during a helper press", () => {
    const cells = createBoardAtZ(1).map((cell) => createCell(cell.position.pos, MS_TILE.Wall));
    const tiles = [
      [pos(3, 2), msCreatureTile(SMART_TEETH, MS_DIRECTION.west)],
      [pos(2, 2), MS_TILE.Button_Green],
      [pos(15, 13), msCreatureTile(SMART_TEETH, MS_DIRECTION.south)],
      [pos(15, 14), MS_TILE.SwitchWall_Closed],
      [pos(15, 15), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north)],
      [pos(10, 15), MS_TILE.Teleport],
      [pos(11, 15), MS_TILE.SwitchWall_Open],
      [pos(12, 15), MS_TILE.Empty],
      [pos(13, 15), MS_TILE.Empty],
      [pos(14, 15), MS_TILE.Empty],
      [pos(20, 10), MS_TILE.Teleport],
      [pos(21, 10), MS_TILE.Water],
      [pos(3, 20), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)],
      [pos(4, 20), MS_TILE.Teleport],
    ] as const;
    for (const [position, tile] of tiles) cells[position] = createCell(position, tile);
    let session = createLynxInteractiveSession(createRequest(), createLevel(cells));
    const helperSerial = session.actors.find((actor) => actor.pos === pos(3, 2))!.serial;
    const travelerSerial = session.actors.find((actor) => actor.pos === pos(3, 20))!.serial;
    const pursuerSerial = session.actors.find((actor) => actor.pos === pos(15, 13))!.serial;
    for (let tick = 0; tick <= 8; tick += 1) {
      session = advanceLynxInteractiveSession(session, 0);
      const traveler = session.actors.find((actor) => actor.serial === travelerSerial)!;
      expect(traveler.pos, `tick ${tick}`).toBe(pos(3, 20));
      expect(traveler.hidden).toBe(false);
      if (tick === 3) {
        const helper = session.actors.find((actor) => actor.serial === helperSerial)!;
        expect(helper.pos).toBe(pos(2, 2));
        expect(helper.moving).toBe(0);
      }
    }
    expect(session.state.map.cells[pos(11, 15)]?.top.id).toBe(MS_TILE.SwitchWall_Closed);
    expect(session.actors.find((actor) => actor.serial === pursuerSerial)?.pos).toBe(pos(15, 14));
  });

  it("plans a button detour to open a wall and replans against the real toggle after pressing it", () => {
    const cells = createBoardAtZ(1).map((cell) => createCell(cell.position.pos, MS_TILE.Wall));
    cells[pos(3, 3)] = createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east));
    cells[pos(3, 2)] = createCell(pos(3, 2), MS_TILE.Button_Green);
    cells[pos(4, 3)] = createCell(pos(4, 3), MS_TILE.SwitchWall_Closed);
    cells[pos(5, 3)] = createCell(pos(5, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    let session = createLynxInteractiveSession(createRequest(), createLevel(cells));
    expect(session.actors[0]?.plannedPath?.map((node) => node.pos)).toEqual([99, 67, 99, 100, 101]);
    expect(session.state.map.cells[pos(4, 3)]?.top.id).toBe(MS_TILE.SwitchWall_Closed);
    for (let tick = 0; tick < 4; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.pos).toBe(pos(3, 2));
    expect(session.actors[0]?.plannedPath?.map((node) => node.pos)).toEqual([67, 99, 100, 101]);
    expect(session.actors[0]?.plannedPath?.some((node) => node.toggled)).toBe(false);
    for (let tick = 4; tick <= 16; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.pos).toBe(pos(4, 3));
    expect(session.state.map.cells[pos(4, 3)]?.top.id).toBe(MS_TILE.SwitchWall_Open);
  });

  it("shows a selected route before the first input without advancing the actor", () => {
    const session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(10, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
    ]));
    const actor = session.actors[0]!;
    expect(actor.pos).toBe(pos(3, 10));
    expect(actor.moving).toBe(0);
    expect(actor.plannedPath?.[0]?.pos).toBe(actor.pos);
    expect(actor.plannedPath?.at(-1)?.pos).toBe(session.chipPos);
    expect(projectLynxInteractiveFrame(session, "initial").tileOverlays
      .filter((overlay) => overlay.kind === "planned-route").map((overlay) => overlay.pos))
      .toEqual([323, 324, 325, 326, 327, 328, 329, 330]);
  });

  it("removes the consumed step from the stored and displayed route", () => {
    const session = advanceLynxInteractiveSession(createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(10, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
    ])), 0);
    const actor = session.actors[0]!;
    expect(actor.pos).toBe(pos(4, 10));
    expect(actor.plannedPath?.[0]?.pos).toBe(actor.pos);
    expect(projectLynxInteractiveFrame(session, "tick").tileOverlays
      .filter((overlay) => overlay.kind === "planned-route").map((overlay) => overlay.pos))
      .toEqual([324, 325, 326, 327, 328, 329, 330]);
  });

  it("registers a directional monster and keeps the native Teeth half-speed cadence", () => {
    const makeSession = (actorId: number) => createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(20, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(actorId, MS_DIRECTION.east)),
    ]));
    let smart = makeSession(SMART_TEETH);
    let ordinary = makeSession(MS_TILE.Teeth);
    expect(smart.actors).toHaveLength(1);
    expect(smart.actors[0]?.id).toBe(SMART_TEETH);
    for (let tick = 0; tick < 17; tick += 1) {
      smart = advanceLynxInteractiveSession(smart, 0);
      ordinary = advanceLynxInteractiveSession(ordinary, 0);
      expect(smart.actors[0]?.pos, `tick ${tick}`).toBe(ordinary.actors[0]?.pos);
      expect(smart.actors[0]?.moving, `tick ${tick}`).toBe(ordinary.actors[0]?.moving);
    }
    expect(smart.actors[0]?.pos).toBe(pos(6, 10));
  });

  it("takes the north-first shortest safe detour around a wall", () => {
    const initial = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(5, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Wall),
    ]));
    const next = advanceLynxInteractiveSession(initial, 0);
    expect(next.actors[0]?.pos).toBe(pos(3, 2));
  });

  it.each([MS_TILE.Water, MS_TILE.Fire, MS_TILE.Bomb, MS_TILE.Door_Red, MS_TILE.Block_Static])(
    "routes around dangerous or impassable tile %i without changing it",
    (tileId) => {
      const initial = createLynxInteractiveSession(createRequest(), createLevel([
        createCell(pos(5, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
        createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
        createCell(pos(4, 3), tileId),
      ]));
      const targetBefore = initial.state.map.cells[pos(4, 3)]?.top.id;
      const keysBefore = [...initial.state.inventory.keys];
      const next = advanceLynxInteractiveSession(initial, 0);
      expect(next.actors.find((actor) => actor.id === SMART_TEETH)?.pos).toBe(pos(3, 2));
      expect(next.state.map.cells[pos(4, 3)]?.top.id).toBe(targetBefore);
      expect(next.state.inventory.keys).toEqual(keysBefore);
    },
  );

  it("crosses a permitted blue key without borrowing Chip's inventory", () => {
    const initial = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(5, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Key_Blue),
    ]));
    const next = advanceLynxInteractiveSession(initial, 0);
    expect(next.actors[0]?.pos).toBe(pos(4, 3));
    expect(next.state.inventory.keys).toEqual([0, 0, 0, 0]);
  });

  it("respects directional exit walls", () => {
    const initial = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(5, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east), MS_TILE.Wall_East),
    ]));
    const next = advanceLynxInteractiveSession(initial, 0);
    expect(next.actors[0]?.pos).toBe(pos(3, 2));
  });

  it("avoids a safe-looking ice entrance whose forced continuation is lethal", () => {
    const initial = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(6, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Ice),
      createCell(pos(5, 3), MS_TILE.Water),
    ]));
    const next = advanceLynxInteractiveSession(initial, 0);
    expect(next.actors[0]?.pos).toBe(pos(3, 2));
  });

  it("uses safe fixed force floors along a route", () => {
    const initial = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(6, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Slide_East),
    ]));
    const next = advanceLynxInteractiveSession(initial, 0);
    expect(next.actors[0]?.pos).toBe(pos(4, 3));
  });

  it("takes a deterministic teleport shortcut and continues in the entry direction", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(22, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Teleport),
      createCell(pos(20, 3), MS_TILE.Teleport),
    ]));
    session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.pos).toBe(pos(4, 3));
    expect(session.actors[0]?.plannedPath?.[0]?.pos).toBe(pos(4, 3));
    for (let tick = 1; tick < 4; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.pos).toBe(pos(20, 3));
    expect(session.actors[0]?.plannedPath?.[0]?.pos).toBe(pos(20, 3));
    session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.pos).toBe(pos(21, 3));
  });

  it("recomputes an in-flight teleport destination when a real toggle closes its old exit", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(23, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(24, 10), MS_TILE.Button_Green),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(5, 3), MS_TILE.Teleport),
      createCell(pos(10, 3), MS_TILE.Teleport),
      createCell(pos(20, 3), MS_TILE.Teleport),
      createCell(pos(21, 3), MS_TILE.SwitchWall_Open),
    ]));
    for (let tick = 0; tick <= 8; tick += 1) {
      session = advanceLynxInteractiveSession(session, tick === 6 ? MS_DIRECTION.east : 0);
    }
    expect(session.actors[0]?.pos).toBe(pos(5, 3));
    expect(session.actors[0]?.plannedPath?.slice(0, 2).map((node) => node.pos)).toEqual([pos(5, 3), pos(20, 3)]);
    session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.moving).toBeGreaterThan(0);
    expect(session.actors[0]?.plannedPath?.slice(0, 2).map((node) => node.pos)).toEqual([pos(5, 3), pos(10, 3)]);
    expect(session.actors[0]?.plannedPath?.[1]?.dir).toBe(MS_DIRECTION.east);
    session = advanceLynxInteractiveSession(session, 0);
    session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]?.pos).toBe(pos(10, 3));
    expect(session.actors[0]?.plannedPath?.[0]?.pos).toBe(pos(10, 3));
  });

  it("reserves the physical portal entrance when two actors would use different remote exits", () => {
    const session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(25, 25), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north)),
      createCell(pos(4, 5), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(5, 4), msCreatureTile(SMART_TEETH, MS_DIRECTION.south)),
      createCell(pos(5, 5), MS_TILE.Teleport),
      createCell(pos(10, 10), MS_TILE.Teleport),
      createCell(pos(20, 20), MS_TILE.Teleport),
      createCell(pos(21, 20), MS_TILE.Wall),
      ...[pos(3, 5), pos(4, 4), pos(4, 6), pos(5, 3), pos(6, 4)].map((wall) => createCell(wall, MS_TILE.Wall)),
    ]));
    expect(session.actors.filter((actor) => actor.plannedPath?.[1]?.via === pos(5, 5))).toHaveLength(1);
    expect(session.actors.filter((actor) => actor.plannedPath?.length === 1)).toHaveLength(1);
  });

  it("preserves a pending teleport when another actor causes an in-flight replan", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(22, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Teleport),
      createCell(pos(20, 3), MS_TILE.Teleport),
      createCell(pos(22, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.north)),
      createCell(pos(22, 9), MS_TILE.Slide_North),
    ]));
    const serial = session.actors.find((actor) => actor.pos === pos(3, 3))!.serial;
    for (let tick = 0; tick < 3; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    const teleporter = session.actors.find((actor) => actor.serial === serial)!;
    expect(teleporter.pos).toBe(pos(4, 3));
    expect(teleporter.moving).toBeGreaterThan(0);
    expect(teleporter.plannedPath?.slice(0, 2).map((node) => node.pos)).toEqual([pos(4, 3), pos(20, 3)]);
  });

  it("preserves pending teleport metadata when a real green-button arrival invalidates routes", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(22, 3), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 3), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 3), MS_TILE.Teleport),
      createCell(pos(20, 3), MS_TILE.Teleport),
      createCell(pos(22, 9), msCreatureTile(SMART_TEETH, MS_DIRECTION.north), MS_TILE.Button_Green),
      ...[pos(21, 9), pos(23, 9), pos(22, 8), pos(22, 10)].map((wall) => createCell(wall, MS_TILE.Wall)),
    ]));
    const serial = session.actors.find((actor) => actor.pos === pos(3, 3))!.serial;
    session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors.find((actor) => actor.serial === serial)?.pos).toBe(pos(4, 3));
    // Resume an already committed teleport while another arrival changes the board.
    session.actors.find((actor) => actor.pos === pos(22, 9))!.moving = 2;
    session = advanceLynxInteractiveSession(session, 0);
    const teleporter = session.actors.find((actor) => actor.serial === serial)!;
    expect(teleporter.pos).toBe(pos(4, 3));
    expect(teleporter.moving).toBeGreaterThan(0);
    expect(teleporter.plannedPath?.slice(0, 2).map((node) => node.pos)).toEqual([pos(4, 3), pos(20, 3)]);
  });

  it("replans after Chip moves without mutating a previously selected route", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(20, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
    ]));
    session = advanceLynxInteractiveSession(session, MS_DIRECTION.north);
    const firstPath = session.actors[0]!.plannedPath!;
    const firstPathCopy = structuredClone(firstPath);
    expect(firstPath.at(-1)?.pos).toBe(pos(20, 10));
    for (let tick = 1; tick <= 8; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    expect(session.actors[0]!.plannedPath!.at(-1)?.pos).toBe(pos(20, 9));
    expect(firstPath).toEqual(firstPathCopy);
  });

  it("coordinates distinct nearby goals while the shortest route pursues Chip", () => {
    const session = advanceLynxInteractiveSession(createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(10, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(10, 7), msCreatureTile(SMART_TEETH, MS_DIRECTION.south)),
    ])), 0);
    const direct = session.actors.filter((actor) => actor.plannedDirect);
    expect(direct).toHaveLength(1);
    expect(direct[0]?.pos).toBe(pos(10, 8));
    expect(new Set(session.actors.map((actor) => actor.plannedPath!.at(-1)!.pos)).size).toBe(2);
    expect(new Set(session.actors.map((actor) => actor.pos)).size).toBe(2);
  });

  it("keeps one nearest pursuer when a force floor makes one actor ready before another", () => {
    let session = createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(20, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(4, 10), MS_TILE.Slide_East),
      createCell(pos(15, 12), msCreatureTile(SMART_TEETH, MS_DIRECTION.north)),
    ]));
    for (let tick = 0; tick < 3; tick += 1) session = advanceLynxInteractiveSession(session, 0);
    const direct = session.actors.filter((actor) => actor.plannedDirect);
    expect(direct).toHaveLength(1);
    expect(direct[0]?.pos).toBe(pos(15, 11));
    expect(direct[0]?.moving).toBeGreaterThan(0);
  });

  it("preserves selected paths in session snapshots and reproduces them during replay", () => {
    const level = createLevel([
      createCell(pos(10, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
      createCell(pos(10, 7), msCreatureTile(SMART_TEETH, MS_DIRECTION.south)),
    ]);
    let interactive = createLynxInteractiveSession(createRequest(), level);
    let replay = createLynxReplaySession(createRequest(), level, {
      flags: 0, randomSlideDirection: MS_DIRECTION.north, stepping: 0, randomSeed: 362436069, moves: [],
    });
    interactive = advanceLynxInteractiveSession(interactive, 0);
    replay = advanceLynxInteractiveSession(replay, 0);
    const snapshot = structuredClone(interactive);
    for (let tick = 1; tick <= 8; tick += 1) {
      interactive = advanceLynxInteractiveSession(interactive, 0);
      replay = advanceLynxInteractiveSession(replay, 0);
    }
    let restored = snapshot;
    for (let tick = 1; tick <= 8; tick += 1) restored = advanceLynxInteractiveSession(restored, 0);
    expect(interactive.actors).toEqual(replay.actors);
    expect(restored.actors).toEqual(interactive.actors);
  });

  it("projects selected paths and removes the overlay when its actor disappears", () => {
    const session = advanceLynxInteractiveSession(createLynxInteractiveSession(createRequest(), createLevel([
      createCell(pos(10, 10), msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
      createCell(pos(3, 10), msCreatureTile(SMART_TEETH, MS_DIRECTION.east)),
    ])), 0);
    const frame = projectLynxInteractiveFrame(session, "tick");
    const overlay = frame.tileOverlays.filter((item) => item.kind === "planned-route");
    expect(overlay.length).toBeGreaterThan(0);
    session.actors[0]!.hidden = true;
    expect(projectLynxInteractiveFrame(session, "tick").tileOverlays.filter((item) => item.kind === "planned-route")).toEqual([]);
    expect(frame.tileOverlays.filter((item) => item.kind === "planned-route")).toEqual(overlay);
  });
});

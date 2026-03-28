import { describe, expect, it } from "vitest";
import { encodeRuntimeInputCode, GAME_INPUT_CODES, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import { expectOverlayAbsent, expectOverlayPresent } from "@game-core/impl/testOverlays";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  initializeLynxEngineState,
  LYNX_SOUND,
  runLynxInputTrace,
  runLynxInputTraceDebug,
  runLynxReplayTrace,
  runLynxReplayTraceDebug,
} from "@ruleset-lynx/impl/engine";
import {
  advanceLynxTicks,
  createBoardAtZ,
  createCell,
  createCellAtZ,
  createLevel,
  createRequest,
  createTwoLayerLevel,
  lynxAnimations,
  lynxChipTeleported,
  lynxPortableItems,
  lynxRuntimeStateForTest,
  lynxTileOverlays,
  pos,
} from "@ruleset-lynx/impl/testSupport";

describe("initializeLynxEngineState", () => {
  it("preserves cloned runtime map layers during initialization", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    lower[33] = createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty);

    const state = initializeLynxEngineState(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      {
        ...createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty)]),
        cells: lower,
        layers: [
          { z: 1, cells: lower, traps: [{ from: 10, to: 11, fromZ: 1, toZ: 1 }], cloners: [], creaturePositions: [33], hintText: "" },
          { z: 2, cells: upper, traps: [], cloners: [{ from: 20, to: 21, fromZ: 2, toZ: 2 }], creaturePositions: [], hintText: "" },
        ],
      },
    );

    expect(state.map.layers?.map((layer) => layer.z)).toEqual([1, 2]);
    expect(state.map.layers?.[0]?.cells).toBe(state.map.cells);
    expect(state.map.layers?.[1]?.cells).not.toBe(upper);
  });

  it("seeds runtime actor order across layers with z1 actors before z2 actors", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = Array.from({ length: 32 * 32 }, (_, pos) => ({
      ...createCell(pos, MS_TILE.Empty),
      position: {
        x: pos % 32,
        y: Math.floor(pos / 32),
        z: 2,
        pos,
      },
    }));
    const chipPos = 33;
    const lowerBugPos = 34;
    const upperFireballPos = 35;

    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty);
    lower[lowerBugPos] = createCell(lowerBugPos, msCreatureTile(MS_TILE.Bug, 2), MS_TILE.Empty);
    upper[upperFireballPos] = {
      position: { x: upperFireballPos % 32, y: Math.floor(upperFireballPos / 32), z: 2, pos: upperFireballPos },
      top: { id: msCreatureTile(MS_TILE.Fireball, 8), state: 0 },
      bottom: { id: MS_TILE.Empty, state: 0 },
    };

    const session = createLynxInteractiveSession(
      createRequest(),
      {
        ...createLevel([createCell(chipPos, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty)]),
        cells: lower,
        layers: [
          { z: 1, cells: lower, traps: [], cloners: [], creaturePositions: [chipPos, lowerBugPos], hintText: "" },
          { z: 2, cells: upper, traps: [], cloners: [], creaturePositions: [upperFireballPos], hintText: "" },
        ],
      },
    );

    expect(
      session.actors.map((actor) => ({
        id: actor.id,
        pos: actor.pos,
        z: actor.z,
      })),
    ).toEqual([
      { id: MS_TILE.Bug, pos: lowerBugPos, z: 1 },
      { id: MS_TILE.Fireball, pos: upperFireballPos, z: 2 },
    ]);
  });

  it("uses same-layer teleport search when Chip teleports on z2", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const entryTeleportPos = 34;
    const lowerExitPos = 40;
    const upperExitPos = 50;

    lower[entryTeleportPos] = createCell(entryTeleportPos, MS_TILE.Teleport, MS_TILE.Empty);
    lower[lowerExitPos] = createCell(lowerExitPos, MS_TILE.Teleport, MS_TILE.Empty);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    upper[entryTeleportPos] = createCellAtZ(entryTeleportPos, 2, MS_TILE.Teleport, MS_TILE.Empty);
    upper[upperExitPos] = createCellAtZ(upperExitPos, 2, MS_TILE.Teleport, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      {
        ...createLevel([createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty)]),
        cells: lower,
        layers: [
          { z: 1, cells: lower, traps: [], cloners: [], creaturePositions: [], hintText: "" },
          { z: 2, cells: upper, traps: [], cloners: [], creaturePositions: [chipPos], hintText: "" },
        ],
      },
    );

    const teleported = advanceLynxTicks(session, 4, 8);

    expect(teleported.chipZ).toBe(2);
    expect(teleported.chipPos).toBe(upperExitPos);
  });

  it("uses same-layer trap connections when Chip presses a brown button on z2", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const buttonPos = 34;
    const lowerTrapPos = 97;
    const upperTrapPos = 98;

    lower[lowerTrapPos] = createCell(lowerTrapPos, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.Beartrap);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    upper[buttonPos] = createCellAtZ(buttonPos, 2, MS_TILE.Button_Brown, MS_TILE.Empty);
    upper[upperTrapPos] = createCellAtZ(upperTrapPos, 2, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.Beartrap);

    const session = createLynxInteractiveSession(
      createRequest(),
      {
        ...createLevel([createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty)]),
        cells: lower,
        layers: [
          { z: 1, cells: lower, traps: [{ from: buttonPos, to: lowerTrapPos, fromZ: 1, toZ: 1 }], cloners: [], creaturePositions: [lowerTrapPos], hintText: "" },
          { z: 2, cells: upper, traps: [{ from: buttonPos, to: upperTrapPos, fromZ: 2, toZ: 2 }], cloners: [], creaturePositions: [chipPos, upperTrapPos], hintText: "" },
        ],
      },
    );

    const next = advanceLynxTicks(session, 4, 8);
    const upperBall = next.actors.find((actor) => actor.id === MS_TILE.Ball && actor.z === 2);
    const lowerBall = next.actors.find((actor) => actor.id === MS_TILE.Ball && actor.z === 1);

    expect(next.chipZ).toBe(2);
    expect(upperBall?.pos).toBe(66);
    expect(lowerBall?.pos).toBe(lowerTrapPos);
  });

  it("keeps teeth targeting Chip by x/y even when they are on a different z-layer", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const teethPos = 97;

    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    upper[teethPos] = createCellAtZ(teethPos, 2, msCreatureTile(MS_TILE.Teeth, 4), MS_TILE.Empty);
    upper[65] = createCellAtZ(65, 2, MS_TILE.Empty, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      {
        ...createLevel([createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty)]),
        cells: lower,
        layers: [
          { z: 1, cells: lower, traps: [], cloners: [], creaturePositions: [chipPos], hintText: "" },
          { z: 2, cells: upper, traps: [], cloners: [], creaturePositions: [teethPos], hintText: "" },
        ],
      },
    );

    const next = advanceLynxTicks(session, 6);
    const teeth = next.actors.find((actor) => actor.id === MS_TILE.Teeth && actor.z === 2);

    expect(teeth?.pos).toBe(65);
  });

  it("removes Chip from the map without claiming the floor", () => {
    const level = createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty)]);
    const state = initializeLynxEngineState(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
    );

    expect(state.map.cells[33]).toEqual({
      position: { x: 1, y: 1, z: 1, pos: 33 },
      top: { id: MS_TILE.Empty, state: 0 },
      bottom: { id: MS_TILE.Empty, state: 0 },
    });
    expect(state.view).toEqual({ x: 8, y: 8 });
  });

  it("removes non-Chip occupants from the map and marks the floor as claimed", () => {
    const level = createLevel([
      createCell(65, msCreatureTile(MS_TILE.Bug, 1), MS_TILE.Fire),
      createCell(66, MS_TILE.Block_Static, MS_TILE.ICChip),
    ]);
    const state = initializeLynxEngineState(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
    );

    expect(state.map.cells[65]).toEqual({
      position: { x: 1, y: 2, z: 1, pos: 65 },
      top: { id: MS_TILE.Fire, state: 0x40 },
      bottom: { id: MS_TILE.Empty, state: 0 },
    });
    expect(state.map.cells[66]).toEqual({
      position: { x: 2, y: 2, z: 1, pos: 66 },
      top: { id: MS_TILE.ICChip, state: 0x40 },
      bottom: { id: MS_TILE.Empty, state: 0 },
    });
  });

  it("sets ShowHint in the initial state when Chip starts on a hint button", () => {
    const level = createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.HintButton)]);
    const state = initializeLynxEngineState(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
    );

    expect(state.statusFlags & 0x0008).toBe(0x0008);
    expect(state.map.cells[33]?.top.id).toBe(MS_TILE.HintButton);
  });

  it("preserves the replay random slide direction in initialization", () => {
    const level = createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty)]);
    const state = initializeLynxEngineState(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      {
        randomSeed: 362436069,
        stepping: 0,
        randomSlideDirection: 8,
      },
    );

    expect(state.replay.initialRandomSlideDirection).toBe("east");
  });
});

describe("advanceLynxInteractiveSession", () => {
  it("applies unsupported air from initial state by dropping Chip one layer on the first forced-move cadence", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const fallen = advanceLynxTicks(session, 2);

    expect(fallen.chipZ).toBe(1);
    expect(fallen.chipPos).toBe(chipPos);
    expect(fallen.chipMoving).toBe(0);
    expect(fallen.state.map.cells[chipPos]?.top.id).toBe(MS_TILE.Empty);
    expect(fallen.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.Empty);
    expect(fallen.state.map.layers?.[1]?.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("does not drop Chip from air when the immediately lower layer supports him", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 34;
    lower[chipPos] = createCell(chipPos, MS_TILE.Wall);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const settled = advanceLynxTicks(session, 2);

    expect(settled.chipZ).toBe(2);
    expect(settled.chipPos).toBe(chipPos);
    expect(settled.chipMoving).toBe(0);
    expect(settled.state.map.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
    expect(settled.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.Wall);
    expect(settled.state.map.layers?.[1]?.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("drops Chip from air when the immediately lower layer is only an ice corner", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 102;
    lower[chipPos] = createCell(chipPos, MS_TILE.IceWall_Northwest);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const settled = advanceLynxTicks(session, 2);

    expect(settled.chipZ).toBe(1);
    expect(settled.chipPos).toBe(chipPos);
    expect(settled.state.map.cells[chipPos]?.top.id).toBe(MS_TILE.IceWall_Northwest);
    expect(settled.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.IceWall_Northwest);
    expect(settled.state.map.layers?.[1]?.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("does not drop Chip from air when an elevator is directly below", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 35;
    lower[chipPos] = createCell(chipPos, MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const settled = advanceLynxTicks(session, 2);

    expect(settled.chipZ).toBe(2);
    expect(settled.chipPos).toBe(chipPos);
    expect(settled.chipMoving).toBe(0);
    expect(settled.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.Elevator);
    expect(settled.state.map.layers?.[1]?.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("moves Chip upward from an elevator into air", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 41;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Air, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { lowerCreaturePositions: [chipPos] }),
    );

    const elevated = advanceLynxTicks(session, 2);

    expect(elevated.chipZ).toBe(2);
    expect(elevated.chipPos).toBe(chipPos);
    expect(elevated.chipMoving).toBe(0);
    expect(elevated.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.Elevator);
    expect(elevated.state.map.layers?.[1]?.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("lifts Chip through another elevator when a higher layer elevator is directly above", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const middle = createBoardAtZ(2);
    const upper = Array.from({ length: 32 * 32 }, (_, pos) => createCellAtZ(pos, 3, MS_TILE.Empty));
    const chipPos = 41;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    middle[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Elevator, MS_TILE.Empty);
    upper[chipPos] = createCellAtZ(chipPos, 3, MS_TILE.Air, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      {
        ...createLevel([]),
        cells: lower,
        layers: [
          { z: 1, cells: lower, traps: [], cloners: [], creaturePositions: [chipPos], hintText: "" },
          { z: 2, cells: middle, traps: [], cloners: [], creaturePositions: [], hintText: "" },
          { z: 3, cells: upper, traps: [], cloners: [], creaturePositions: [], hintText: "" },
        ],
      },
    );

    const elevated = advanceLynxTicks(session, 4);

    expect(elevated.chipZ).toBe(3);
    expect(elevated.chipPos).toBe(chipPos);
    expect(elevated.chipMoving).toBe(0);
    expect(elevated.state.map.layers?.[1]?.cells[chipPos]?.top.id).toBe(MS_TILE.Elevator);
    expect(elevated.state.map.layers?.[2]?.cells[chipPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("forces a Lynx elevator rise when the upward move is possible even if lateral input is held", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 41;
    const eastPos = 42;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Air, MS_TILE.Empty);
    lower[eastPos] = createCell(eastPos, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { lowerCreaturePositions: [chipPos] }),
    );

    const elevated = advanceLynxTicks(session, 2, 8);

    expect(elevated.chipZ).toBe(2);
    expect(elevated.chipPos).toBe(chipPos);
    expect(elevated.chipMoving).toBe(0);
  });

  it("pushes a block on the upper layer before Chip rises into its elevator destination", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 43;
    const pushedBlockPos = 44;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Block_Static, MS_TILE.Air);
    upper[pushedBlockPos] = createCellAtZ(pushedBlockPos, 2, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const elevated = advanceLynxTicks(session, 2);
    const block = elevated.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(elevated.chipZ).toBe(2);
    expect(elevated.chipPos).toBe(chipPos);
    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(pushedBlockPos);
  });

  it("forces a Lynx elevator push before rising even if a different lateral input is held", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 43;
    const pushedBlockPos = 44;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Block_Static, MS_TILE.Air);
    upper[pushedBlockPos] = createCellAtZ(pushedBlockPos, 2, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const elevated = advanceLynxTicks(session, 2, 1);
    const block = elevated.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(elevated.chipZ).toBe(2);
    expect(elevated.chipPos).toBe(chipPos);
    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(pushedBlockPos);
  });

  it("denies a Lynx elevator rise into non-air terrain", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 42;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Wall, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { lowerCreaturePositions: [chipPos] }),
    );

    const blocked = advanceLynxTicks(session, 2);

    expect(blocked.chipZ).toBe(1);
    expect(blocked.chipPos).toBe(chipPos);
    expect(blocked.chipMoving).toBe(0);
  });

  it("treats a blocked Lynx elevator as ordinary floor for Chip", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 42;
    const eastPos = 43;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Wall, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { lowerCreaturePositions: [chipPos] }),
    );

    const moved = advanceLynxTicks(session, 4, 8);

    expect(moved.chipZ).toBe(1);
    expect(moved.chipPos).toBe(eastPos);
    expect(moved.chipMoving).toBe(0);
  });

  it("treats supported Lynx air as ordinary floor for Chip", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 35;
    const eastPos = 36;
    lower[chipPos] = createCell(chipPos, MS_TILE.Elevator);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);
    upper[eastPos] = createCellAtZ(eastPos, 2, MS_TILE.Air, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const moved = advanceLynxTicks(session, 4, 8);

    expect(moved.chipZ).toBe(2);
    expect(moved.chipPos).toBe(eastPos);
    expect(moved.chipMoving).toBe(0);
  });

  it("raises a Lynx block from an elevator into air", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const blockPos = 45;
    lower[blockPos] = createCell(blockPos, MS_TILE.Block_Static, MS_TILE.Elevator);
    upper[blockPos] = createCellAtZ(blockPos, 2, MS_TILE.Air, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { lowerCreaturePositions: [blockPos] }),
    );

    const elevated = advanceLynxTicks(session, 2);
    const block = elevated.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(blockPos);
    expect(elevated.state.map.layers?.[0]?.cells[blockPos]?.top.id).toBe(MS_TILE.Elevator);
  });

  it("kills Chip when a Lynx block rises into the player's elevator destination", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const sharedPos = 46;
    lower[sharedPos] = createCell(sharedPos, MS_TILE.Block_Static, MS_TILE.Elevator);
    upper[sharedPos] = createCellAtZ(sharedPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, {
        lowerCreaturePositions: [sharedPos],
        upperCreaturePositions: [sharedPos],
      }),
    );

    const elevated = advanceLynxTicks(session, 2);
    const block = elevated.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(elevated.endGameResult).toBe("failed");
    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(sharedPos);
  });

  it("lets a monster on supported air move normally above an elevator", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 34;
    const actorPos = 47;
    const eastPos = 48;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    lower[actorPos] = createCell(actorPos, MS_TILE.Elevator);
    upper[actorPos] = createCellAtZ(actorPos, 2, msCreatureTile(MS_TILE.Ball, 8), MS_TILE.Air);
    upper[eastPos] = createCellAtZ(eastPos, 2, MS_TILE.Air, MS_TILE.Empty);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, {
        lowerCreaturePositions: [chipPos],
        upperCreaturePositions: [actorPos],
      }),
    );

    const moved = advanceLynxTicks(session, 4);
    const ball = moved.actors.find((actor) => actor.id === MS_TILE.Ball && !actor.hidden);

    expect(moved.endGameResult).toBeNull();
    expect(ball?.z).toBe(2);
    expect(ball?.pos).toBe(eastPos);
  });

  it("drops a block from unsupported air into water", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const blockPos = 35;
    lower[blockPos] = createCell(blockPos, MS_TILE.Water);
    upper[blockPos] = createCellAtZ(blockPos, 2, MS_TILE.Block_Static, MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [blockPos] }),
    );

    const fallen = advanceLynxTicks(session, 2);
    const block = fallen.actors.find((actor) => actor.id === MS_TILE.Block);

    expect(block?.hidden).toBe(true);
    expect(fallen.state.map.layers?.[0]?.cells[blockPos]?.top.id).toBe(MS_TILE.Dirt);
    expect(fallen.state.map.layers?.[1]?.cells[blockPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("keeps a non-player supported over a real blue wall without normalizing it", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const blockPos = 103;
    lower[blockPos] = createCell(blockPos, MS_TILE.BlueWall_Real);
    upper[blockPos] = createCellAtZ(blockPos, 2, MS_TILE.Block_Static, MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [blockPos] }),
    );

    const settled = advanceLynxTicks(session, 2);
    const block = settled.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(blockPos);
    expect(settled.state.map.layers?.[0]?.cells[blockPos]?.top.id).toBe(MS_TILE.BlueWall_Real);
    expect(settled.state.map.layers?.[1]?.cells[blockPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("keeps a non-player supported over a fake blue wall", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const blockPos = 104;
    lower[blockPos] = createCell(blockPos, MS_TILE.BlueWall_Fake);
    upper[blockPos] = createCellAtZ(blockPos, 2, MS_TILE.Block_Static, MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [blockPos] }),
    );

    const settled = advanceLynxTicks(session, 2);
    const block = settled.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(blockPos);
    expect(settled.state.map.layers?.[0]?.cells[blockPos]?.top.id).toBe(MS_TILE.BlueWall_Fake);
    expect(settled.state.map.layers?.[1]?.cells[blockPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("drops a non-player from unsupported air onto Chip and collides on landing", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const sharedPos = 36;
    lower[sharedPos] = createCell(sharedPos, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty);
    upper[sharedPos] = createCellAtZ(sharedPos, 2, msCreatureTile(MS_TILE.Bug, 1), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, {
        lowerCreaturePositions: [sharedPos],
        upperCreaturePositions: [sharedPos],
      }),
    );

    const collided = advanceLynxTicks(session, 2);
    const bug = collided.actors.find((actor) => actor.id === MS_TILE.Bug);

    expect(collided.endGameResult).toBe("failed");
    expect(collided.chipZ).toBe(1);
    expect(bug?.z).toBe(1);
    expect(bug?.pos).toBe(sharedPos);
  });

  it("collects a key when Chip falls from unsupported air", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 37;
    lower[chipPos] = createCell(chipPos, MS_TILE.Key_Yellow);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const fallen = advanceLynxTicks(session, 2);

    expect(fallen.chipZ).toBe(1);
    expect(fallen.state.inventory.keys).toEqual([0, 0, 1, 0]);
    expect(fallen.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("does not start ice forcing when Chip falls from unsupported air onto ice", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 38;
    lower[chipPos] = createCell(chipPos, MS_TILE.Ice);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const landed = advanceLynxTicks(session, 2);
    const held = advanceLynxInteractiveSession(landed, 0);

    expect(held.chipZ).toBe(1);
    expect(held.chipPos).toBe(chipPos);
    expect(held.chipMoving).toBe(0);
  });

  it("starts force-floor movement when Chip falls from unsupported air onto a force floor", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 39;
    lower[chipPos] = createCell(chipPos, MS_TILE.Slide_South);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const landed = advanceLynxTicks(session, 2);
    const forced = advanceLynxInteractiveSession(landed, 0);

    expect(forced.chipZ).toBe(1);
    expect(forced.chipPos).toBe(71);
    expect(forced.chipMoving).toBeGreaterThan(0);
  });

  it("bombs Chip when he falls from unsupported air onto a bomb", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 40;
    lower[chipPos] = createCell(chipPos, MS_TILE.Bomb);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const fallen = advanceLynxTicks(session, 2);

    expect(fallen.endGameResult).toBe("failed");
    expect(fallen.chipZ).toBe(1);
    expect(fallen.endGameAnimationTileId).not.toBeNull();
  });

  it("starts the native failed endgame when Chip enters deadly fire", () => {
    const chipPos = 33;
    const firePos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
        createCell(firePos, MS_TILE.Fire),
      ]),
    );

    const afterArrival = advanceLynxTicks(session, 4, 8);

    expect(afterArrival.state.status).toBe("playing");
    expect(afterArrival.endGameResult).toBe("failed");
    expect(afterArrival.endGameAnimationTileId).toBe(0x76);
    expect(afterArrival.chipMoving).toBe(0);
    expect(afterArrival.state.soundEffects & (1 << LYNX_SOUND.ChipLoses)).not.toBe(0);

    const afterDeath = advanceLynxTicks(afterArrival, 13);
    expect(afterDeath.state.status).toBe("failed");
  });

  it("starts the native failed endgame when a creature collides with Chip", () => {
    const chipPos = 33;
    const ballPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel(
        [
          createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
          createCell(ballPos, msCreatureTile(MS_TILE.Ball, 2)),
        ],
        [chipPos, ballPos],
      ),
    );

    const collided = advanceLynxInteractiveSession(session, 0);

    expect(collided.state.status).toBe("playing");
    expect(collided.endGameResult).toBe("failed");
    expect(collided.endGameAnimationTileId).toBe(0x76);
    expect(collided.state.soundEffects & (1 << LYNX_SOUND.ChipLoses)).not.toBe(0);

    const afterDeath = advanceLynxTicks(collided, 13);
    expect(afterDeath.state.status).toBe("failed");
  });

  it("times out with the native failed endgame instead of continuing play", () => {
    const chipPos = 33;
    const session = createLynxInteractiveSession(
      createRequest(),
      {
        ...createLevel([createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8))]),
        timeLimitTicks: 3,
      },
    );
    session.state.timer.currentTime = 3;
    session.state.timer.tick = 3;

    const timedOut = advanceLynxInteractiveSession(session, 0);

    expect(timedOut.state.status).toBe("playing");
    expect(timedOut.endGameResult).toBe("failed");
    expect(timedOut.endGameAnimationTileId).toBe(0x76);
    expect(timedOut.chipMoving).toBe(0);

    const afterDeath = advanceLynxTicks(timedOut, 13);
    expect(afterDeath.state.status).toBe("failed");
  });

  it("advances the failed endgame animation frame-by-frame and then hides Chip", () => {
    const chipPos = 33;
    const firePos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
        createCell(firePos, MS_TILE.Fire),
      ]),
    );

    let current = advanceLynxTicks(session, 4, 8);
    const frames: number[] = [];

    while (current.endGameAnimationFrame !== null) {
      frames.push(current.endGameAnimationFrame);
      current = advanceLynxInteractiveSession(current, 0);
    }

    expect(frames[0]).toBeGreaterThanOrEqual(10);
    expect(frames[0]).toBeLessThanOrEqual(11);
    expect(frames.at(-1)).toBe(0);
    expect(frames.slice(1)).toEqual(frames.slice(0, -1).map((frame) => frame - 1));
    expect(current.endGameResult).toBe("failed");
    expect(current.endGameAnimationFrame).toBeNull();
    expect(current.state.status).toBe("playing");
  });

  it("keeps Chip hidden for the legacy teleport hold tick after a teleport resolves", () => {
    const chipPos = 33;
    const entryTeleportPos = 34;
    const exitTeleportPos = 96;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
        createCell(entryTeleportPos, MS_TILE.Teleport),
        createCell(exitTeleportPos, MS_TILE.Teleport),
      ]),
    );

    const teleported = advanceLynxTicks(session, 4, 8);
    expect(teleported.chipPos).toBe(exitTeleportPos);
    expect(lynxChipTeleported(teleported.state)).toBe(true);
  });

  it("marks Chip as pushing for the display tick when a move is blocked", () => {
    const chipPos = 33;
    const wallPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
        createCell(wallPos, MS_TILE.Wall),
      ]),
    );

    const blocked = advanceLynxInteractiveSession(session, 8);
    expect(blocked.chipPushing).toBe(true);
    expect(blocked.chipPos).toBe(chipPos);
    expect(blocked.chipMoving).toBe(0);

    const settled = advanceLynxInteractiveSession(blocked, 0);
    expect(settled.chipPushing).toBe(false);
  });

  it("queues a temporary reveal overlay when Chip presses a permanent invisible wall", () => {
    const chipPos = 33;
    const wallPos = 34;
    let session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
        createCell(wallPos, MS_TILE.HiddenWall_Perm),
      ]),
    );

    session = advanceLynxInteractiveSession(session, 8);

    expect(session.chipPos).toBe(chipPos);
    expectOverlayPresent(lynxTileOverlays(session.state), {
      z: 1,
      pos: wallPos,
      kind: "hidden-wall-reveal",
      ttl: 10,
    });

    for (let tick = 0; tick < 10; tick += 1) {
      session = advanceLynxInteractiveSession(session, 0);
    }

    expectOverlayAbsent(lynxTileOverlays(session.state), {
      z: 1,
      pos: wallPos,
      kind: "hidden-wall-reveal",
    });
  });

  it("keeps Chip's death animation on the in-progress destination tile when a death starts mid-step", () => {
    const chipPos = 33;
    const targetPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)), createCell(targetPos, MS_TILE.Empty)]),
    );

    const moving = advanceLynxInteractiveSession(session, 8);
    moving.state.timer.currentTime = 1;
    moving.state.timer.tick = 1;
    moving.state.timer.timeLimit = 1;
    const timedOut = advanceLynxInteractiveSession(moving, 0);

    expect(timedOut.endGameResult).toBe("failed");
    expect(timedOut.endGameAnimationTileId).toBe(0x76);
    expect(timedOut.chipPos).toBe(targetPos);
    expect(timedOut.chipMoving).toBe(0);
    expect(timedOut.state.view.x).toBe(16);
    expect(timedOut.state.view.y).toBe(8);
  });

  it("rewinds creature death animations to their source tile on a mid-step collision with Chip", () => {
    const chipPos = 33;
    const ballPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel(
        [
          createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
          createCell(ballPos, msCreatureTile(MS_TILE.Ball, 2)),
        ],
        [chipPos, ballPos],
      ),
    );

    const collided = advanceLynxInteractiveSession(session, 0);
    expect(collided.endGameResult).toBe("failed");
    expect(lynxAnimations(collided.state)).toEqual(
      expect.arrayContaining([expect.objectContaining({ pos: ballPos, tileId: 0x76 })]),
    );
  });

  it("does not carry a tapped manual input into the next tile after Chip finishes moving", () => {
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Empty, MS_TILE.Empty),
        createCell(66, MS_TILE.Empty, MS_TILE.Empty),
      ]),
    );

    let current = advanceLynxInteractiveSession(session, 8);
    current = advanceLynxInteractiveSession(current, 4);
    current = advanceLynxInteractiveSession(current, 0);
    current = advanceLynxInteractiveSession(current, 0);
    current = advanceLynxInteractiveSession(current, 0);

    expect(current.chipPos).toBe(34);
    expect(current.chipDir).toBe(8);
    expect(current.chipMoving).toBe(0);
    expect(current.currentInputCode).toBe(0);
    expect(current.state.view).toEqual({ x: 16, y: 8 });
  });

  it("still allows held manual input to chain into the next move when it is polled again on later ticks", () => {
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Empty, MS_TILE.Empty),
        createCell(66, MS_TILE.Empty, MS_TILE.Empty),
      ]),
    );

    let current = advanceLynxInteractiveSession(session, 8);
    current = advanceLynxInteractiveSession(current, 4);
    current = advanceLynxInteractiveSession(current, 4);
    current = advanceLynxInteractiveSession(current, 4);
    current = advanceLynxInteractiveSession(current, 4);

    expect(current.chipPos).toBe(66);
    expect(current.chipDir).toBe(4);
    expect(current.chipMoving).toBe(6);
    expect(current.currentInputCode).toBe(0);
  });
});

describe("runLynxInputTrace", () => {
  it("collects a chip at movement completion on normal floor movement", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.ICChip, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      4,
    );

    expect(trace.steps[3]?.view).toEqual({ x: 16, y: 8 });
    expect(trace.steps[3]?.soundEffects).toBe(1 << 6);
    expect(trace.steps[3]?.chipsNeeded).toBe(0);
  });

  it("moves twice as fast on plain ice and emits skating forward while moving", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Ice, MS_TILE.Empty),
      createCell(35, MS_TILE.Ice, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      2,
    );

    expect(trace.steps[0]?.view).toEqual({ x: 12, y: 8 });
    expect(trace.steps[0]?.soundEffects).toBe(1 << 19);
    expect(trace.steps[1]?.view).toEqual({ x: 16, y: 8 });
    expect(trace.steps[1]?.soundEffects).toBe(1 << 19);
  });

  it("moves at normal speed on ice with ice boots and emits ice walking while moving", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Boots_Ice, MS_TILE.Empty),
      createCell(35, MS_TILE.Ice, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      level,
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      6,
    );

    expect(trace.steps[4]?.inventory.boots).toEqual([1, 0, 0, 0]);
    expect(trace.steps[4]?.view).toEqual({ x: 18, y: 8 });
    expect(trace.steps[4]?.soundEffects).toBe(1 << 23);
    expect(trace.steps[5]?.view).toEqual({ x: 20, y: 8 });
    expect(trace.steps[5]?.soundEffects).toBe(1 << 23);
  });

  it("moves at normal speed on slides with slide boots and emits slide walking while moving", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Boots_Slide, MS_TILE.Empty),
      createCell(35, MS_TILE.Slide_East, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      level,
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      6,
    );

    expect(trace.steps[4]?.inventory.boots).toEqual([0, 1, 0, 0]);
    expect(trace.steps[4]?.view).toEqual({ x: 18, y: 8 });
    expect(trace.steps[4]?.soundEffects).toBe(1 << 22);
    expect(trace.steps[5]?.view).toEqual({ x: 20, y: 8 });
    expect(trace.steps[5]?.soundEffects).toBe(1 << 22);
  });

  it("lets Chip override ice with ice boots on the next input", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(65, MS_TILE.Boots_Ice, MS_TILE.Empty),
      createCell(97, MS_TILE.Ice, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      level,
      [
        { tick: 0, inputCode: 4, inputName: "south" },
        { tick: 4, inputCode: 4, inputName: "south" },
        { tick: 8, inputCode: 2, inputName: "west" },
      ],
      9,
    );

    expect(trace.steps[8]?.view).toEqual({ x: 6, y: 24 });
  });

  it("lets Chip override slide floors with slide boots on the next input", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(65, MS_TILE.Boots_Slide, MS_TILE.Empty),
      createCell(97, MS_TILE.Slide_South, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      level,
      [
        { tick: 0, inputCode: 4, inputName: "south" },
        { tick: 4, inputCode: 4, inputName: "south" },
        { tick: 8, inputCode: 2, inputName: "west" },
      ],
      9,
    );

    expect(trace.steps[8]?.view).toEqual({ x: 6, y: 24 });
  });

  it("forces Chip off a random slide using the replay slide direction and clears sliding sound on the popup-wall move", () => {
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      createLevel([
        createCell(97, msCreatureTile(MS_TILE.Chip, 1), MS_TILE.Empty),
        createCell(65, MS_TILE.Slide_Random, MS_TILE.Empty),
        createCell(64, MS_TILE.PopupWall, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 20,
        flags: 0,
        randomSlideDirection: 4,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 1 }],
      },
      6,
    );

    expect(trace.steps[1]?.soundEffects).toBe(1 << 21);
    expect(trace.steps[2]?.view).toEqual({ x: 6, y: 16 });
    expect(trace.steps[2]?.soundEffects).toBe(0);
    expect(trace.steps[4]?.view).toEqual({ x: 2, y: 16 });
    expect(trace.steps[5]?.chip?.position.pos).toBe(64);
    expect(trace.steps[5]?.soundEffects).toBe(1 << 14);
  });

  it("turns on an ice wall after movement completes", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.IceWall_Northwest, MS_TILE.Empty),
      createCell(2, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 2, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      3,
    );

    expect(trace.steps[0]?.soundEffects).toBe(1 << 20);
    expect(trace.steps[1]?.soundEffects).toBe(1 << 20);
    expect(trace.steps[2]?.view.x).toBe(16);
    expect(trace.steps[2]?.view.y).toBeLessThan(8);
  });

  it("shows hint when Chip is stationary on a hint button", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.HintButton, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      5,
    );

    expect(trace.steps[4]?.statusFlags & 0x0008).toBe(0x0008);
  });

  it("teleports by searching backwards for the next valid exit teleport and continues out on the next tick", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(40, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(50, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(41, MS_TILE.Wall, MS_TILE.Empty),
      createCell(51, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      6,
    );

    expect(trace.steps[3]!.chip!.position.pos).toBe(50);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 9);
    expect(trace.steps[4]?.view).toEqual({ x: 146, y: 8 });
    expect(trace.steps[5]!.chip!.position.pos).toBe(51);
  });

  it("skips teleports whose exit square is claimed when Chip teleports", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(40, msCreatureTile(MS_TILE.Block, 1), MS_TILE.Empty),
      createCell(50, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(41, MS_TILE.Empty, MS_TILE.Empty),
      createCell(51, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      6,
    );

    expect(trace.steps[3]!.chip!.position.pos).toBe(50);
    expect(trace.steps[5]!.chip!.position.pos).toBe(51);
  });

  it("treats a pushable block exit as a valid Chip teleport destination and forces the push on the next tick", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(40, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(41, msCreatureTile(MS_TILE.Block, 8), MS_TILE.Empty),
      createCell(42, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      7,
    );

    expect(trace.steps[3]!.chip!.position.pos).toBe(40);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 9);
    expect(trace.steps[4]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[5]!.chip!.position.pos).toBe(41);
  });

  it("skips teleports whose claimed block exit cannot actually be pushed", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(40, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(41, MS_TILE.Empty, MS_TILE.Empty),
      createCell(50, MS_TILE.Teleport, MS_TILE.Empty),
      createCell(51, msCreatureTile(MS_TILE.Block, 8), MS_TILE.Empty),
      createCell(52, MS_TILE.Wall, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      6,
    );

    expect(trace.steps[3]!.chip!.position.pos).toBe(40);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 9);
    expect(trace.steps[5]!.chip!.position.pos).toBe(41);
  });

  it("teleports a stationary creature at post-teleport resolution and forces it out in its last attempted facing", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      createLevel([
        createCell(0, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, msCreatureTile(MS_TILE.Ball, 8), MS_TILE.Teleport),
        createCell(33, MS_TILE.Wall, MS_TILE.Empty),
        createCell(35, MS_TILE.Wall, MS_TILE.Empty),
        createCell(40, MS_TILE.Teleport, MS_TILE.Empty),
        createCell(50, MS_TILE.Teleport, MS_TILE.Empty),
        createCell(41, MS_TILE.Wall, MS_TILE.Empty),
        createCell(51, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      [],
      2,
    );

    const teleportPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "post-teleport-resolution");
    const forcedMovePhase = trace.steps[1]?.phases.find((phase) => phase.phase === "final");
    const teleportedBall = teleportPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);
    const movingBall = forcedMovePhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);

    expect(teleportedBall?.position.pos).toBe(50);
    expect(movingBall?.position.pos).toBe(49);
    expect(movingBall?.moving).toBe(6);
  });

  it("collects boots on movement completion and plays CantMove on the next blocked input", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Boots_Water, MS_TILE.Empty),
      createCell(35, MS_TILE.Wall, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      5,
    );

    expect(trace.steps[3]?.inventory.boots).toEqual([0, 0, 0, 1]);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 7);
    expect(trace.steps[4]?.soundEffects).toBe(1 << 5);
  });

  it("keeps the green key after opening a green door", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Key_Green, MS_TILE.Empty),
      createCell(35, MS_TILE.Door_Green, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      8,
    );

    expect(trace.steps[3]?.inventory.keys).toEqual([0, 0, 0, 1]);
    expect(trace.steps[7]?.inventory.keys).toEqual([0, 0, 0, 1]);
    expect(trace.steps[7]?.soundEffects).toBe(1 << 10);
  });

  it("lets chip move onto fire with fire boots and emits the fire-walking sound", () => {
    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Boots_Fire, MS_TILE.Empty),
        createCell(35, MS_TILE.Fire, MS_TILE.Empty),
      ]),
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      5,
    );

    expect(trace.steps[3]?.inventory.boots).toEqual([0, 0, 1, 0]);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 7);
    expect(trace.steps[4]?.soundEffects).toBe(1 << 25);
    expect(trace.steps[4]?.view).toEqual({ x: 18, y: 8 });
  });

  it("strips chip's boots when arriving on a burglar tile", () => {
    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Boots_Fire, MS_TILE.Empty),
        createCell(35, MS_TILE.Burglar, MS_TILE.Empty),
      ]),
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      8,
    );

    expect(trace.steps[3]?.inventory.boots).toEqual([0, 0, 1, 0]);
    expect(trace.steps[7]?.inventory.boots).toEqual([0, 0, 0, 0]);
    expect(trace.steps[7]?.soundEffects).toBe(1 << 8);
  });

  it("starts the exit endgame timer and win sound instead of completing immediately", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Exit, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      10,
    );

    expect(trace.steps[3]?.soundEffects).toBe(1 << 1);
    expect(trace.steps[3]?.timeOffset).toBe(0);
    expect(trace.steps[4]?.timeOffset).toBe(0);
    expect(trace.steps[4]?.status).toBe("playing");
  });

  it("updates secondsPlayed after the first negative endgame timeOffset tick", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Exit, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 15, inputCode: 8, inputName: "east" }],
      21,
    );

    expect(trace.steps[18]?.soundEffects).toBe(1 << 1);
    expect(trace.steps[19]?.timeOffset).toBe(0);
    expect(trace.steps[20]?.currentTime).toBe(20);
    expect(trace.steps[20]?.timeOffset).toBe(-1);
    expect(trace.steps[20]?.secondsPlayed).toBe(0);
  });

  it("lets chip enter a popup wall and turns it into a wall on arrival", () => {
    const level = createLevel([
      createCell(65, msCreatureTile(MS_TILE.Chip, 1), MS_TILE.Empty),
      createCell(33, MS_TILE.PopupWall, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 6, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 1, inputName: "north" }],
      4,
    );

    expect(trace.steps[0]?.soundEffects).toBe(0);
    expect(trace.steps[0]?.view).toEqual({ x: 8, y: 14 });
    expect(trace.steps[3]?.soundEffects).toBe(1 << 14);
    expect(trace.steps[3]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("releases a clone-machine occupant when chip arrives on a red button", () => {
    const buttonPos = 34;
    const clonerPos = 70;
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Button_Red, MS_TILE.Empty),
          createCell(clonerPos, msCreatureTile(MS_TILE.Ball, 8), MS_TILE.CloneMachine),
          createCell(clonerPos + 1, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { cloners: [{ from: buttonPos, to: clonerPos }] },
      ),
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      4,
    );

    const finalPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const ballPositions = finalPhase?.activeCreatures
      .filter((actor) => actor.id === MS_TILE.Ball)
      .map((actor) => actor.position.pos)
      .sort((left, right) => left - right);
    const claimedCloneSource = finalPhase?.boardFlags.some((flag) => flag.position.pos === clonerPos);

    expect(trace.steps[3]?.soundEffects).toBe(1 << 12);
    expect(ballPositions).toEqual([70, 71]);
    expect(claimedCloneSource).toBe(false);
  });

  it("advances a cloner release again when the source actor is still pending in the tick loop", () => {
    const buttonPos = 98;
    const clonerPos = 65;
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Button_Red, MS_TILE.Empty),
          createCell(clonerPos, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.CloneMachine),
          createCell(clonerPos - 32, MS_TILE.Empty, MS_TILE.Empty),
          createCell(130, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.Empty),
        ],
        undefined,
        { cloners: [{ from: buttonPos, to: clonerPos }] },
      ),
      [],
      4,
    );

    const finalPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const releasedBall = finalPhase?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Ball && actor.position.pos === clonerPos - 32,
    );

    expect(trace.steps[3]?.soundEffects).toBe(1 << 12);
    expect(releasedBall?.moving).toBe(4);
  });

  it("releases a beartrap occupant when chip settles on a brown button", () => {
    const buttonPos = 34;
    const trapPos = 97;
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Button_Brown, MS_TILE.Empty),
          createCell(65, MS_TILE.Empty, MS_TILE.Empty),
          createCell(trapPos, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.Beartrap),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      4,
    );

    const finalPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const releasedBall = finalPhase?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Ball && actor.position.pos === 65,
    );

    expect(trace.steps[3]?.soundEffects).toBe(1 << 12);
    expect(releasedBall?.moving).toBe(6);
  });

  it("lets a static block hold a brown button and spring a beartrap", () => {
    const buttonPos = 405;
    const trapPos = 407;
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(0, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(trapPos, msCreatureTile(MS_TILE.Ball, 4), MS_TILE.Beartrap),
          createCell(439, MS_TILE.Empty, MS_TILE.Empty),
        ],
        [trapPos],
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      [],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const releasedBall = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);
    const buttonBlock = finalPhase?.blocks.find((actor) => actor.position.pos === buttonPos);

    expect(trace.steps[0]?.soundEffects).toBe(0);
    expect(releasedBall?.position.pos).toBe(439);
    expect(releasedBall?.moving).toBe(6);
    expect(buttonBlock?.moving).toBe(0);
    expect(buttonBlock?.stateFlags).toContain("dormant");
  });

  it("plays ButtonPushed when a pushed block settles on a brown button", () => {
    const buttonPos = 35;
    const trapPos = 97;
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Button_Brown, MS_TILE.Empty),
          createCell(65, MS_TILE.Empty, MS_TILE.Empty),
          createCell(trapPos, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.Beartrap),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      4,
    );

    const finalPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const settledBlock = finalPhase?.blocks.find((actor) => actor.position.pos === buttonPos);
    const releasedBall = finalPhase?.activeCreatures.find(
      (actor) => actor.id === MS_TILE.Ball && actor.position.pos === 65,
    );

    expect(trace.steps[3]?.soundEffects).toBe((1 << 12) | (1 << 18));
    expect(settledBlock?.moving).toBe(0);
    expect(releasedBall?.moving).toBe(6);
  });

  it("plays TrapEntered on beartrap arrival and auto-releases Chip while the linked brown button stays held", () => {
    const buttonPos = 34;
    const trapPos = 65;
    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(trapPos, MS_TILE.Beartrap, MS_TILE.Empty),
          createCell(97, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      [{ tick: 0, inputCode: 4, inputName: "south" }],
      5,
    );

    expect(trace.steps[2]?.soundEffects).toBe(1 << 15);
    expect(trace.steps[2]?.chip?.position.pos).toBe(65);
    expect(trace.steps[3]?.chip?.position.pos).toBe(97);
    expect(trace.steps[3]?.view.y).toBeGreaterThan(trace.steps[2]?.view.y ?? 0);
  });

  it("does not add CantMove on the tick replay input changes while Chip arrives in a held-open beartrap", () => {
    const buttonPos = 34;
    const trapPos = 65;
    const trace = runLynxReplayTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(64, MS_TILE.Wall, MS_TILE.Empty),
          createCell(trapPos, MS_TILE.Beartrap, MS_TILE.Empty),
          createCell(97, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [
          { when: 0, dir: 4 },
          { when: 2, dir: 2 },
        ],
      },
      5,
    );

    const arrivalPhase = trace.steps[2]?.phases.find((phase) => phase.phase === "post-creature-movement");

    expect(arrivalPhase?.soundEffects).toBe(1 << 15);
    expect(trace.steps[2]?.soundEffects).toBe(1 << 15);
    expect(trace.steps[2]?.chip?.position.pos).toBe(trapPos);
    expect(trace.steps[3]?.soundEffects).toBe(0);
    expect(trace.steps[3]?.lastMove).toBe("west");
    expect(trace.steps[3]?.chip?.position.pos).toBe(97);
  });

  it("advances a moving beartrap occupant once more when a held brown button fires later in the same tick", () => {
    const buttonPos = 35;
    const trapPos = 68;
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(0, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(36, msCreatureTile(MS_TILE.Ball, 4), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(trapPos, MS_TILE.Beartrap, MS_TILE.Empty),
          createCell(132, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      [],
      2,
    );

    const firstFinal = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const secondFinal = trace.steps[1]?.phases.find((phase) => phase.phase === "final");
    const trappedBallAfterEntry = firstFinal?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);
    const trappedBallNextTick = secondFinal?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);

    expect(trace.steps[0]?.soundEffects).toBe(0);
    expect(trappedBallAfterEntry?.position.pos).toBe(trapPos);
    expect(trappedBallAfterEntry?.moving).toBe(4);
    expect(trace.steps[1]?.soundEffects).toBe(1 << 15);
    expect(trappedBallNextTick?.position.pos).toBe(trapPos);
    expect(trappedBallNextTick?.moving).toBe(0);
  });

  it("updates lastMove from replay input before a held-open beartrap release overrides the movement", () => {
    const buttonPos = 34;
    const trapPos = 65;
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
          createCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(trapPos, MS_TILE.Beartrap, MS_TILE.Empty),
          createCell(64, MS_TILE.Empty, MS_TILE.Empty),
          createCell(97, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [
          { when: 0, dir: 4 },
          { when: 3, dir: 2 },
        ],
      },
      5,
    );

    expect(trace.steps[2]?.soundEffects).toBe(1 << 15);
    expect(trace.steps[3]?.lastMove).toBe("west");
    expect(trace.steps[3]?.view).toEqual({ x: 8, y: 20 });
    expect(trace.steps[3]?.chip?.position.pos).toBe(97);
    expect(trace.steps[4]?.chip?.position.pos).toBe(97);
    expect(trace.steps[4]?.lastMove).toBe("west");
  });

  it("uses replay input on the next held-open trap release after the current facing is blocked", () => {
    const buttonPos = 34;
    const trapPos = 65;
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel(
        [
          createCell(buttonPos, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(trapPos, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Beartrap),
          createCell(64, MS_TILE.Empty, MS_TILE.Empty),
          createCell(97, MS_TILE.Wall, MS_TILE.Empty),
        ],
        undefined,
        { traps: [{ from: buttonPos, to: trapPos }] },
      ),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 2 }],
      },
      4,
    );

    expect(trace.steps[0]?.lastMove).toBe("west");
    expect(trace.steps[0]?.soundEffects).toBe(1 << 5);
    expect(trace.steps[0]?.view).toEqual({ x: 8, y: 16 });
    expect(trace.steps[1]?.view).toEqual({ x: 4, y: 16 });
    expect(trace.steps[2]?.chip?.position.pos).toBe(64);
  });

  it("accepts opening replay input on slide floors before slide forcing starts", () => {
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Slide_West),
        createCell(32, MS_TILE.Wall, MS_TILE.Empty),
        createCell(65, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 4 }],
      },
      1,
    );

    expect(trace.steps[0]?.lastMove).toBe("south");
    expect(trace.steps[0]?.view).toEqual({ x: 8, y: 10 });
  });

  it("accepts opening replay input on ice before ice forcing starts", () => {
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Ice),
        createCell(34, MS_TILE.Wall, MS_TILE.Empty),
        createCell(65, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 4 }],
      },
      1,
    );

    expect(trace.steps[0]?.lastMove).toBe("south");
    expect(trace.steps[0]?.view).toEqual({ x: 8, y: 10 });
  });

  it("keeps a pushed block moving across ice until it reaches a bomb", () => {
    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(97, MS_TILE.Ice, MS_TILE.Empty),
        createCell(129, MS_TILE.Bomb, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 4, inputName: "south" }],
      6,
    );

    expect(trace.steps[1]?.chip?.position.pos).toBe(65);
    expect(trace.steps[2]?.mapHash).not.toBe(trace.steps[1]?.mapHash);
    expect(trace.steps[5]?.soundEffects).toBe(1 << 16);
  });

  it("keeps the attempted direction when an immediate ice-block push is blocked", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Ice),
        createCell(97, MS_TILE.Wall, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 4, inputName: "south" }],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const block = finalPhase?.blocks.find((actor) => actor.position.pos === 65);

    expect(trace.steps[0]?.soundEffects).toBe(1 << 5);
    expect(finalPhase?.activeCreatures[0]?.position.pos).toBe(33);
    expect(block?.dir).toBe("south");
    expect(block?.moving).toBe(0);
  });

  it("moves a ball by transferring the claimed floor bit to the destination tile", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(341, msCreatureTile(MS_TILE.Ball, 8), MS_TILE.Empty),
      createCell(342, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("ignores buried creatures on the bottom layer when constructing the Lynx actor list", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(341, MS_TILE.Empty, msCreatureTile(MS_TILE.Ball, 8)),
      createCell(342, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 8, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.mapHash).toBe(trace.initialState.mapHash);
  });

  it("starts ball, bug, and glider movement on the first idle tick", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(167, msCreatureTile(MS_TILE.Ball, 4), MS_TILE.Empty),
      createCell(175, msCreatureTile(MS_TILE.Bug, 1), MS_TILE.Empty),
      createCell(248, msCreatureTile(MS_TILE.Glider, 1), MS_TILE.Empty),
      createCell(135, MS_TILE.Empty, MS_TILE.Empty),
      createCell(143, MS_TILE.Empty, MS_TILE.Empty),
      createCell(166, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("clears a blue key when a non-Chip creature lands on it", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(794, msCreatureTile(MS_TILE.Ball, 8), MS_TILE.Empty),
      createCell(795, MS_TILE.Key_Blue, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      4,
    );

    const finalPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const ball = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);

    expect(ball?.position.pos).toBe(795);
    expect(finalPhase?.map.cells[795]?.top.id).toBe(MS_TILE.Empty);
    expect(finalPhase?.map.cells[795]?.top.state).toBe(0x40);
  });

  it("prevents a bug from entering dirt and falls back to the next legal direction", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(175, msCreatureTile(MS_TILE.Bug, 1), MS_TILE.Empty),
      createCell(174, MS_TILE.Dirt, MS_TILE.Empty),
      createCell(143, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const bug = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Bug);

    expect(bug?.position.pos).toBe(143);
    expect(bug?.dir).toBe("north");
  });

  it("prevents a bug from wrapping west off the left edge and falls back north", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(96, msCreatureTile(MS_TILE.Bug, 1), MS_TILE.Empty),
      createCell(64, MS_TILE.Empty, MS_TILE.Empty),
      createCell(95, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const bug = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Bug);

    expect(bug?.position.pos).toBe(64);
    expect(bug?.dir).toBe("north");
  });

  it("prevents a paramecium from exiting through a wall edge and falls back to the next legal direction", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(125, msCreatureTile(MS_TILE.Paramecium, 1), MS_TILE.Wall_East),
      createCell(93, MS_TILE.Wall_East, MS_TILE.Empty),
      createCell(126, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const paramecium = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Paramecium);

    expect(paramecium?.position.pos).toBe(93);
    expect(paramecium?.dir).toBe("north");
  });

  it("keeps the last attempted facing when a paramecium is blocked on every side", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(125, msCreatureTile(MS_TILE.Paramecium, 1), MS_TILE.Empty),
      createCell(93, MS_TILE.Wall, MS_TILE.Empty),
      createCell(124, MS_TILE.Wall, MS_TILE.Empty),
      createCell(126, MS_TILE.Wall, MS_TILE.Empty),
      createCell(157, MS_TILE.Wall, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const paramecium = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Paramecium);

    expect(paramecium?.position.pos).toBe(125);
    expect(paramecium?.dir).toBe("south");
    expect(paramecium?.tdir).toBe("none");
  });

  it("turns a blocked walker using the Lynx walker PRNG", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(341, msCreatureTile(MS_TILE.Walker, 1), MS_TILE.Empty),
      createCell(309, MS_TILE.Wall, MS_TILE.Empty),
      createCell(342, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("keeps teeth on their destination tile after the initial move completes", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(97, msCreatureTile(MS_TILE.Teeth, 4), MS_TILE.Empty),
      createCell(65, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      6,
    );

    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
    expect(trace.steps[3]?.mapHash).toBe(trace.steps[4]?.mapHash);
    expect(trace.steps[4]?.mapHash).toBe(trace.steps[5]?.mapHash);
  });

  it("does not consume the Lynx walker PRNG when a walker can keep moving straight", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(341, msCreatureTile(MS_TILE.Walker, 1), MS_TILE.Empty),
      createCell(309, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.randomState.lynx.prng2).toBe(0);
    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("chooses a blob direction from the shared main PRNG", () => {
    const level = createLevel([
      createCell(132, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      createCell(341, msCreatureTile(MS_TILE.Blob, 1), MS_TILE.Empty),
      createCell(373, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx", randomSeed: 362436069 },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("pushes a block immediately and plays the block-moving sound", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
      createCell(35, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      1,
    );

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("keeps an unlisted static block inactive in the Lynx actor roster", () => {
    const chipPos = 33;
    const blockPos = 34;
    const level = createLevel(
      [
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(blockPos, MS_TILE.Block_Static, MS_TILE.Empty),
      ],
      [chipPos],
    );

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    expect(trace.steps[0]?.mapHash).toBe(trace.initialState.mapHash);
    expect(trace.steps[0]?.soundEffects).toBe(0);
  });

  it("lets chip push an unlisted static block by activating it on demand", () => {
    const level = createLevel(
      [
        createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(97, MS_TILE.Empty, MS_TILE.Empty),
      ],
      [33],
    );

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 4, inputName: "south" }],
      1,
    );

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[0]?.mapHash).not.toBe(trace.initialState.mapHash);
  });

  it("keeps an unlisted static block inert on a force floor until something activates it", () => {
    const level = createLevel(
      [
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Slide_North),
      ],
      [33],
    );

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");

    expect(trace.steps[0]?.soundEffects).toBe(0);
    expect(finalPhase?.blocks[0]?.position.pos).toBe(65);
    expect(finalPhase?.blocks[0]?.moving).toBe(0);
  });

  it("starts an unlisted static block moving on a force floor after the opening tick", () => {
    const level = createLevel(
      [
        createCell(1, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Slide_North),
      ],
      [1],
    );

    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [],
      2,
    );

    const finalPhase = trace.steps[1]?.phases.find((phase) => phase.phase === "final");

    expect(finalPhase?.blocks[0]?.position.pos).toBe(33);
    expect(finalPhase?.blocks[0]?.moving).toBe(6);
    expect(finalPhase?.map.cells[33]?.top.state).toBe(0x40);
    expect(finalPhase?.map.cells[65]?.top.state).toBe(0);
  });

  it("matches the native Chip-swap actor order after removing Chip from the Lynx actor list", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Bug, 8), MS_TILE.Empty),
        createCell(34, msCreatureTile(MS_TILE.Ball, 8), MS_TILE.Empty),
        createCell(65, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
      ]),
      [],
      1,
    );

    const phase = trace.steps[0]?.phases.find((entry) => entry.phase === "post-input-latch");
    expect(phase?.activeCreatures[1]?.position.pos).toBe(34);
    expect(phase?.activeCreatures[2]?.position.pos).toBe(33);
  });

  it("clears the block-moving sound after the pushed block finishes moving", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
      createCell(35, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      5,
    );

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[4]?.soundEffects).toBe(0);
  });

  it("allows a pushed block to move onto fire in Lynx", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(35, MS_TILE.Fire, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const movingBlock = finalPhase?.blocks[0];

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(movingBlock?.position.pos).toBe(35);
    expect(movingBlock?.floor.id).toBe(MS_TILE.Fire);
    expect(movingBlock?.moving).toBe(6);
  });

  it("starts a pending chip push during creature movement before Chip advances", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(35, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      1,
    );

    const creaturePhase = trace.steps[0]?.phases.find((phase) => phase.phase === "post-creature-movement");
    const chip = creaturePhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Chip);
    const movingBlock = creaturePhase?.blocks[0];

    expect(creaturePhase?.soundEffects).toBe(1 << 18);
    expect(chip?.position.pos).toBe(33);
    expect(chip?.moving).toBe(0);
    expect(movingBlock?.position.pos).toBe(35);
    expect(movingBlock?.moving).toBe(6);
  });

  it("marks a pushed block splash as animated and blocks chip from entering it on the next tick", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(35, MS_TILE.Water, MS_TILE.Empty),
      ]),
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
      ],
      5,
    );

    const splashPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const blockedPhase = trace.steps[4]?.phases.find((phase) => phase.phase === "final");

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 17);
    expect(trace.steps[4]?.soundEffects).toBe(1 << 5);
    expect(splashPhase?.map.cells[35]?.top).toEqual({ id: MS_TILE.Dirt, state: 0x20 });
    expect(blockedPhase?.map.cells[35]?.top).toEqual({ id: MS_TILE.Dirt, state: 0x20 });
  });

  it("only plays CantMove once while repeated inputs stay blocked by a Lynx animation", () => {
    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(35, MS_TILE.Water, MS_TILE.Empty),
      ]),
      [
        { tick: 0, inputCode: 8, inputName: "east" },
        { tick: 4, inputCode: 8, inputName: "east" },
        { tick: 5, inputCode: 8, inputName: "east" },
        { tick: 6, inputCode: 8, inputName: "east" },
      ],
      7,
    );

    expect(trace.steps[4]?.soundEffects).toBe(1 << 5);
    expect(trace.steps[5]?.soundEffects).toBe(0);
    expect(trace.steps[6]?.soundEffects).toBe(0);
  });

  it("turns Chip around after a blocked move on ice and resumes on the next tick", () => {
    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(34, MS_TILE.Wall, MS_TILE.Empty),
        createCell(35, msCreatureTile(MS_TILE.Chip, 2), MS_TILE.Ice),
        createCell(36, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 2, inputName: "west" }],
      5,
    );

    expect(trace.steps[0]?.soundEffects).toBe(1 << 5);
    expect(trace.steps.slice(1, 5).map((step) => step?.view.x)).toEqual([26, 28, 30, 32]);
    expect(trace.steps[1]?.soundEffects).toBe(0);
  });

  it("uses the pending green-button wall toggle for Chip move legality in the same tick", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 3, ruleset: "Lynx" },
      createLevel([
        createCell(33, MS_TILE.SwitchWall_Closed, MS_TILE.Empty),
        createCell(34, msCreatureTile(MS_TILE.Chip, 2), MS_TILE.SwitchWall_Open),
        createCell(66, MS_TILE.Button_Green, MS_TILE.Empty),
        createCell(98, msCreatureTile(MS_TILE.Ball, 1), MS_TILE.Empty),
      ]),
      [{ tick: 3, inputCode: 2, inputName: "west" }],
      4,
    );

    const finalPhase = trace.steps[3]?.phases.find((phase) => phase.phase === "final");
    const chip = finalPhase?.activeCreatures[0];

    expect(trace.steps[3]?.soundEffects).toBe(1 << 12);
    expect(trace.steps[3]?.view.x).toBe(14);
    expect(chip?.position.pos).toBe(33);
    expect(chip?.moving).toBe(6);
    expect(chip?.floor.id).toBe(MS_TILE.SwitchWall_Closed);
  });

  it("toggles switch walls across z-layers when Chip presses a green button", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const buttonPos = 34;
    const switchWallPos = 66;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    lower[buttonPos] = createCell(buttonPos, MS_TILE.Button_Green, MS_TILE.Empty);
    upper[switchWallPos] = createCellAtZ(switchWallPos, 2, MS_TILE.SwitchWall_Closed, MS_TILE.Empty);

    const toggled = advanceLynxTicks(
      createLynxInteractiveSession(
        createRequest(),
        createTwoLayerLevel(lower, upper, { lowerCreaturePositions: [chipPos] }),
      ),
      5,
      8,
    );

    expect(toggled.state.map.layers?.[1]?.cells[switchWallPos]?.top.id).toBe(MS_TILE.SwitchWall_Open);
  });

  it("drops a non-player after a supporting switch wall opens beneath it", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const buttonPos = 34;
    const supportedPos = 66;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty);
    lower[buttonPos] = createCell(buttonPos, MS_TILE.Button_Green, MS_TILE.Empty);
    lower[supportedPos] = createCell(supportedPos, MS_TILE.SwitchWall_Closed, MS_TILE.Empty);
    upper[supportedPos] = createCellAtZ(supportedPos, 2, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), MS_TILE.Air);
    upper[supportedPos - 1] = createCellAtZ(supportedPos - 1, 2, MS_TILE.Wall);
    upper[supportedPos + 1] = createCellAtZ(supportedPos + 1, 2, MS_TILE.Wall);
    upper[supportedPos - 32] = createCellAtZ(supportedPos - 32, 2, MS_TILE.Wall);
    upper[supportedPos + 32] = createCellAtZ(supportedPos + 32, 2, MS_TILE.Wall);

    const toggled = advanceLynxTicks(
      createLynxInteractiveSession(
        createRequest(),
        createTwoLayerLevel(lower, upper, {
          lowerCreaturePositions: [chipPos],
          upperCreaturePositions: [supportedPos],
        }),
      ),
      5,
      MS_DIRECTION.east,
    );

    expect(toggled.state.map.layers?.[0]?.cells[supportedPos]?.top.id).toBe(MS_TILE.SwitchWall_Open);

    const fallen = advanceLynxTicks(toggled, 2);
    const bug = fallen.actors.find((actor) => actor.id === MS_TILE.Bug && !actor.hidden);

    expect(fallen.endGameResult).toBeNull();
    expect(bug?.z).toBe(1);
    expect(fallen.state.map.layers?.[1]?.cells[supportedPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("drops a non-player after Chip opens a supporting green door beneath it", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const supportedPos = 34;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty);
    lower[supportedPos] = createCell(supportedPos, MS_TILE.Door_Green, MS_TILE.Empty);
    upper[supportedPos] = createCellAtZ(supportedPos, 2, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), MS_TILE.Air);
    upper[supportedPos - 1] = createCellAtZ(supportedPos - 1, 2, MS_TILE.Wall);
    upper[supportedPos + 1] = createCellAtZ(supportedPos + 1, 2, MS_TILE.Wall);
    upper[supportedPos - 32] = createCellAtZ(supportedPos - 32, 2, MS_TILE.Wall);
    upper[supportedPos + 32] = createCellAtZ(supportedPos + 32, 2, MS_TILE.Wall);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, {
        lowerCreaturePositions: [chipPos],
        upperCreaturePositions: [supportedPos],
      }),
    );
    session.state.inventory.keys[3] = 1;

    const opened = advanceLynxTicks(session, 5, MS_DIRECTION.east);
    const fallen = advanceLynxTicks(opened, 2);

    expect(fallen.state.inventory.keys).toEqual([0, 0, 0, 1]);
    expect(fallen.endGameResult).toBe("failed");
    expect(fallen.chipZ).toBe(1);
    expect(fallen.state.map.layers?.[1]?.cells[supportedPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("drops a non-player after Chip opens a supporting socket beneath it", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 35;
    const supportedPos = 36;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east), MS_TILE.Empty);
    lower[supportedPos] = createCell(supportedPos, MS_TILE.Socket, MS_TILE.Empty);
    upper[supportedPos] = createCellAtZ(supportedPos, 2, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), MS_TILE.Air);
    upper[supportedPos - 1] = createCellAtZ(supportedPos - 1, 2, MS_TILE.Wall);
    upper[supportedPos + 1] = createCellAtZ(supportedPos + 1, 2, MS_TILE.Wall);
    upper[supportedPos - 32] = createCellAtZ(supportedPos - 32, 2, MS_TILE.Wall);
    upper[supportedPos + 32] = createCellAtZ(supportedPos + 32, 2, MS_TILE.Wall);

    const opened = advanceLynxTicks(
      createLynxInteractiveSession(
        createRequest(),
        createTwoLayerLevel(lower, upper, {
          lowerCreaturePositions: [chipPos],
          upperCreaturePositions: [supportedPos],
        }),
      ),
      5,
      MS_DIRECTION.east,
    );
    const fallen = advanceLynxTicks(opened, 2);

    expect(fallen.endGameResult).toBe("failed");
    expect(fallen.chipZ).toBe(1);
    expect(fallen.state.map.layers?.[1]?.cells[supportedPos]?.top.id).toBe(MS_TILE.Air);
  });

  it("queues tank reversals across z-layers when Chip presses a blue button", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 33;
    const buttonPos = 34;
    const tankPos = 70;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    lower[buttonPos] = createCell(buttonPos, MS_TILE.Button_Blue, MS_TILE.Empty);
    upper[tankPos] = createCellAtZ(tankPos, 2, msCreatureTile(MS_TILE.Tank, 8), MS_TILE.Empty);
    upper[tankPos - 1] = createCellAtZ(tankPos - 1, 2, MS_TILE.Wall, MS_TILE.Empty);
    upper[tankPos + 1] = createCellAtZ(tankPos + 1, 2, MS_TILE.Wall, MS_TILE.Empty);
    upper[tankPos - 32] = createCellAtZ(tankPos - 32, 2, MS_TILE.Wall, MS_TILE.Empty);
    upper[tankPos + 32] = createCellAtZ(tankPos + 32, 2, MS_TILE.Wall, MS_TILE.Empty);

    const pressed = advanceLynxTicks(
      createLynxInteractiveSession(
        createRequest(),
        createTwoLayerLevel(lower, upper, {
          lowerCreaturePositions: [chipPos],
          upperCreaturePositions: [tankPos],
        }),
      ),
      4,
      8,
    );
    const turned = advanceLynxTicks(pressed, 1);
    const turnedTank = turned.actors.find((actor) => actor.id === MS_TILE.Tank && !actor.hidden);

    expect(turnedTank?.dir).toBe(2);
    expect(turnedTank?.pos).toBe(tankPos);
  });

  it("preserves queued replay input until chip can choose the next lynx move", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Empty, MS_TILE.Empty),
      createCell(35, MS_TILE.Empty, MS_TILE.Empty),
      createCell(66, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [
          { when: 0, dir: 8 },
          { when: 1, dir: 4 },
        ],
      },
      8,
    );

    expect(trace.steps[3]?.view).toEqual({ x: 16, y: 8 });
    expect(trace.steps[4]?.lastMove).toBe("south");
    expect(trace.steps[7]?.view).toEqual({ x: 16, y: 16 });
  });

  it("lets a replay input override a slide floor on the next tokened turn without slide boots", () => {
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Slide_East, MS_TILE.Empty),
        createCell(35, MS_TILE.Slide_East, MS_TILE.Empty),
        createCell(36, MS_TILE.Empty, MS_TILE.Empty),
        createCell(67, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [
          { when: 0, dir: 8 },
          { when: 4, dir: 4 },
        ],
      },
      8,
    );

    expect(trace.steps[1]?.view).toEqual({ x: 16, y: 8 });
    expect(trace.steps[3]?.view).toEqual({ x: 24, y: 8 });
    expect(trace.steps[4]?.lastMove).toBe("south");
    expect(trace.steps[4]?.replayCursor).toBe(2);
    expect(trace.steps[4]?.view).toEqual({ x: 24, y: 10 });
    expect(trace.steps[7]?.view).toEqual({ x: 24, y: 16 });
  });

  it("ignores queued replay input after Chip reaches the exit in Lynx endgame", () => {
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(34, MS_TILE.Exit, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [
          { when: 0, dir: 8 },
          { when: 3, dir: 4 },
        ],
      },
      6,
    );

    expect(trace.steps[3]?.inputCode).toBe(4);
    expect(trace.steps[3]?.soundEffects).toBe(1 << 1);
    expect(trace.steps[4]?.inputCode).toBe(0);
    expect(trace.steps[4]?.soundEffects).toBe(0);
    expect(trace.steps[4]?.lastMove).toBe("east");
    expect(trace.steps[4]?.replayCursor).toBe(2);
  });

  it("masks replay move times to the native 23-bit range before scheduling input", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Empty, MS_TILE.Empty),
      createCell(66, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [
          { when: 0x04800000, dir: 8 },
          { when: 0x09000004, dir: 4 },
        ],
      },
      8,
    );

    expect(trace.steps[0]?.lastMove).toBe("east");
    expect(trace.steps[0]?.replayCursor).toBe(1);
    expect(trace.steps[3]?.view).toEqual({ x: 16, y: 8 });
    expect(trace.steps[4]?.lastMove).toBe("south");
    expect(trace.steps[4]?.replayCursor).toBe(2);
    expect(trace.steps[7]?.view).toEqual({ x: 16, y: 16 });
  });

  it("allows chip to enter a claimed non-block tile", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Empty, MS_TILE.Empty),
    ]);
    level.cells[34]!.top.state = 0x40;

    const trace = runLynxInputTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      [{ tick: 0, inputCode: 8, inputName: "east" }],
      1,
    );

    expect(trace.steps[0]?.soundEffects).toBe(0);
    expect(trace.steps[0]?.view).toEqual({ x: 10, y: 8 });
  });

  it("keeps the original diagonal replay command in lastMove while resolving movement to the current facing", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Empty, MS_TILE.Empty),
      createCell(65, MS_TILE.Empty, MS_TILE.Empty),
      createCell(66, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 12 }],
      },
      4,
    );

    expect(trace.steps[0]?.lastMoveCode).toBe(12);
    expect(trace.steps[0]?.lastMove).toBe("cmd-12");
    expect(trace.steps[3]?.view).toEqual({ x: 16, y: 8 });
  });

  it("starts a push on the unchosen diagonal leg while Chip keeps moving along the current facing", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(66, MS_TILE.Empty, MS_TILE.Empty),
        createCell(97, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 12, inputName: "none" }],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(trace.steps[0]?.view).toEqual({ x: 10, y: 8 });
    expect(finalPhase?.activeCreatures[0]?.position.pos).toBe(34);
    expect(finalPhase?.blocks[0]?.position.pos).toBe(97);
    expect(finalPhase?.blocks[0]?.moving).toBe(6);
  });

  it("pushes a block off a blue wall real but still blocks Chip from entering it", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(340, msCreatureTile(MS_TILE.Chip, 2), MS_TILE.Empty),
        createCell(339, MS_TILE.Block_Static, MS_TILE.BlueWall_Real),
        createCell(338, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 2, inputName: "west" }],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");

    expect(finalPhase?.activeCreatures[0]?.position.pos).toBe(340);
    expect(finalPhase?.activeCreatures[0]?.moving).toBe(0);
    expect(finalPhase?.blocks[0]?.position.pos).toBe(338);
    expect(finalPhase?.map.cells[339]?.top.id).toBe(MS_TILE.Wall);
  });

  it("pushes a dormant block off a blue wall during forced ice carry without letting Chip enter", () => {
    const trace = runLynxReplayTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(340, msCreatureTile(MS_TILE.Chip, 2), MS_TILE.Ice),
        createCell(339, MS_TILE.Block_Static, MS_TILE.BlueWall_Real),
        createCell(338, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 20,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [],
      },
      2,
    );

    const finalPhase = trace.steps[1]?.phases.find((phase) => phase.phase === "final");

    expect(trace.steps[1]?.soundEffects).toBe((1 << 18) | (1 << 5));
    expect(finalPhase?.activeCreatures[0]?.position.pos).toBe(340);
    expect(finalPhase?.activeCreatures[0]?.moving).toBe(0);
    expect(finalPhase?.blocks[0]?.position.pos).toBe(338);
    expect(finalPhase?.map.cells[339]?.top.id).toBe(MS_TILE.Wall);
  });

  it("falls back to the vertical leg when a diagonal's horizontal block push is illegal", () => {
    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(340, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty),
        createCell(339, MS_TILE.Block_Static, MS_TILE.BlueWall_Real),
        createCell(338, MS_TILE.Empty, MS_TILE.Empty),
        createCell(308, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 3 }],
      },
      4,
    );

    expect(trace.steps[0]?.lastMoveCode).toBe(3);
    expect(trace.steps[3]?.chip?.position.pos).toBe(308);
  });

  it("queues the diagonal side-leg push before a brown-button trap release on the same tick", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel(
        [
          createCell(373, MS_TILE.Empty, MS_TILE.Empty),
          createCell(405, MS_TILE.Block_Static, MS_TILE.Button_Brown),
          createCell(407, msCreatureTile(MS_TILE.Ball, 4), MS_TILE.Beartrap),
          createCell(437, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
          createCell(438, MS_TILE.Empty, MS_TILE.Empty),
          createCell(439, MS_TILE.Empty, MS_TILE.Empty),
        ],
        undefined,
        { traps: [{ from: 405, to: 407 }] },
      ),
      [{ tick: 0, inputCode: 9, inputName: "none" }],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const trappedBall = finalPhase?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);
    const movedBlock = finalPhase?.blocks.find((actor) => actor.position.pos === 373);

    expect(finalPhase?.activeCreatures[0]?.position.pos).toBe(438);
    expect(finalPhase?.activeCreatures[0]?.moving).toBe(6);
    expect(movedBlock?.moving).toBe(6);
    expect(trappedBall?.position.pos).toBe(407);
    expect(trappedBall?.moving).toBe(0);
  });

  it("queues the diagonal side-leg push while Chip keeps sliding along the forced leg", () => {
    const trace = runLynxInputTraceDebug(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      createLevel([
        createCell(64, MS_TILE.Empty, MS_TILE.Empty),
        createCell(65, MS_TILE.Block_Static, MS_TILE.Empty),
        createCell(66, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Slide_South),
        createCell(98, MS_TILE.Empty, MS_TILE.Empty),
      ]),
      [{ tick: 0, inputCode: 6, inputName: "none" }],
      1,
    );

    const finalPhase = trace.steps[0]?.phases.find((phase) => phase.phase === "final");
    const movedBlock = finalPhase?.blocks.find((actor) => actor.position.pos === 64);

    expect(trace.steps[0]?.soundEffects).toBe(1 << 18);
    expect(finalPhase?.activeCreatures[0]?.position.pos).toBe(98);
    expect(finalPhase?.activeCreatures[0]?.moving).toBe(6);
    expect(movedBlock?.dir).toBe("west");
    expect(movedBlock?.moving).toBe(6);
  });

  it("queues a persistent visual wall reveal when a diagonal slap hits a real blue wall", () => {
    const chipPos = 340;
    const targetPos = 308;
    const wallPos = 341;
    const session = advanceLynxInteractiveSession(
      createLynxInteractiveSession(
        createRequest(),
        createLevel([
          createCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north), MS_TILE.Empty),
          createCell(targetPos, MS_TILE.Empty, MS_TILE.Empty),
          createCell(wallPos, MS_TILE.BlueWall_Real, MS_TILE.Empty),
        ]),
      ),
      MS_DIRECTION.north | MS_DIRECTION.east,
    );

    expect(session.chipPos).toBe(targetPos);
    expect(session.state.map.cells[wallPos]?.top.id).toBe(MS_TILE.BlueWall_Real);
    expectOverlayPresent(lynxTileOverlays(session.state), {
      z: 1,
      pos: wallPos,
      kind: "blue-wall-reveal",
      ttl: 0x7fff_ffff,
    });
  });

  it("does not queue a diagonal slap reveal for a fake blue wall", () => {
    const chipPos = 340;
    const targetPos = 308;
    const wallPos = 341;
    const session = advanceLynxInteractiveSession(
      createLynxInteractiveSession(
        createRequest(),
        createLevel([
          createCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north), MS_TILE.Empty),
          createCell(targetPos, MS_TILE.Empty, MS_TILE.Empty),
          createCell(wallPos, MS_TILE.BlueWall_Fake, MS_TILE.Empty),
        ]),
      ),
      MS_DIRECTION.north | MS_DIRECTION.east,
    );

    expect(session.chipPos).toBe(targetPos);
    expect(session.state.map.cells[wallPos]?.top.id).toBe(MS_TILE.BlueWall_Fake);
    expectOverlayAbsent(lynxTileOverlays(session.state), {
      z: 1,
      pos: wallPos,
      kind: "blue-wall-reveal",
    });
  });

  it("resolves a diagonal replay command to the alternate direction when the current facing is blocked", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.Wall, MS_TILE.Empty),
      createCell(65, MS_TILE.Empty, MS_TILE.Empty),
    ]);

    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 12 }],
      },
      4,
    );

    expect(trace.steps[0]?.lastMoveCode).toBe(12);
    expect(trace.steps[3]?.view).toEqual({ x: 8, y: 16 });
  });

  it("executes replay moves through the Lynx runtime loop", () => {
    const level = createLevel([
      createCell(33, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
      createCell(34, MS_TILE.ICChip, MS_TILE.Empty),
    ]);

    const trace = runLynxReplayTrace(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
      {
        bestTimeTicks: 40,
        flags: 0,
        randomSlideDirection: 1,
        stepping: 0,
        randomSeed: 362436069,
        moves: [{ when: 0, dir: 8 }],
      },
      4,
    );

    expect(trace.steps[3]?.chipsNeeded).toBe(0);
    expect(trace.steps[0]?.replayCursor).toBe(1);
    expect(trace.steps[0]?.lastMove).toBe("east");
    expect(trace.scheduledInputs).toEqual([]);
  });

  it("keeps a dropped sandbag on the source teleport tile while Chip teleports away", () => {
    const chipPos = 33;
    const blockedEastPos = 34;
    const exitTeleportPos = 96;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Teleport),
        createCell(blockedEastPos, MS_TILE.Wall),
        createCell(exitTeleportPos, MS_TILE.Teleport),
      ]),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const next = advanceLynxInteractiveSession(
      session,
      encodeRuntimeInputCode(MS_DIRECTION.east, GAME_INPUT_MODIFIER_MASKS.action1),
    );

    expect(next.chipPos).toBe(exitTeleportPos);
    expect(next.state.inventory.tools).toEqual([0]);
    expect(next.state.map.cells[chipPos]?.top.id).toBe(MS_TILE.Sandbag);
    expect(next.state.map.cells[chipPos]?.bottom.id).toBe(MS_TILE.Teleport);
  });

  it("primes a sandbag drop from a standalone Action1 press and settles it after Chip exits", () => {
    const chipPos = 33;
    const eastPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(eastPos, MS_TILE.Empty),
      ]),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const primed = advanceLynxInteractiveSession(
      session,
      encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1),
    );

    expect(primed.chipPos).toBe(chipPos);
    expect(primed.state.inventory.tools).toEqual([0]);
    expect(primed.recordedMoves).toEqual([
      {
        when: 0,
        dir: GAME_INPUT_CODES.none,
        modifierMask: GAME_INPUT_MODIFIER_MASKS.action1,
      },
    ]);

    const moved = advanceLynxTicks(primed, 4, MS_DIRECTION.east);

    expect(moved.chipPos).toBe(eastPos);
    expect(moved.state.map.cells[chipPos]?.top.id).toBe(MS_TILE.Sandbag);
  });

  it("keeps the same portable item identity when a carried sandbag is primed and settled", () => {
    const chipPos = 33;
    const eastPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(eastPos, MS_TILE.Empty),
      ]),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const primed = advanceLynxInteractiveSession(
      session,
      encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1),
    );
    const primedItem = lynxPortableItems(primed.state).find((item) => item.state.mode === "primed");

    const moved = advanceLynxTicks(primed, 4, MS_DIRECTION.east);
    const settledItem = lynxPortableItems(moved.state).find(
      (item) => item.state.mode === "map" && item.state.pos === chipPos && item.state.z === 1,
    );

    expect(moved.chipPos).toBe(eastPos);
    expect(settledItem?.serial).toBe(primedItem?.serial);
  });

  it("preserves portable item identities across a replacement pickup", () => {
    const chipPos = 33;
    const pickupPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty),
        createCell(pickupPos, MS_TILE.Sandbag),
      ]),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const reconciled = advanceLynxInteractiveSession(session, GAME_INPUT_CODES.none);
    const carriedSerial = lynxPortableItems(reconciled.state).find((item) => item.state.mode === "carried")?.serial;
    const pickupSerial = lynxPortableItems(reconciled.state).find(
      (item) => item.state.mode === "map" && item.state.pos === pickupPos && item.state.z === 1,
    )?.serial;

    const moved = advanceLynxTicks(reconciled, 4, MS_DIRECTION.east);
    const carried = lynxPortableItems(moved.state).find((item) => item.state.mode === "carried");
    const primed = lynxPortableItems(moved.state).find((item) => item.state.mode === "primed");

    expect(carried?.serial).toBe(pickupSerial);
    expect(primed?.serial).toBe(carriedSerial);
  });

  it("keeps a dropped sandbag's portable item identity when it settles on the source teleport tile", () => {
    const chipPos = 33;
    const blockedEastPos = 34;
    const exitTeleportPos = 96;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel([
        createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Teleport),
        createCell(blockedEastPos, MS_TILE.Wall),
        createCell(exitTeleportPos, MS_TILE.Teleport),
      ]),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const runtime = lynxRuntimeStateForTest(session.state);
    const carriedSerial = runtime.portableTools.nextPortableItemSerial;
    runtime.portableTools.portableItems.push({
      serial: carriedSerial,
      family: "sandbag",
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });
    runtime.portableTools.nextPortableItemSerial += 1;

    const next = advanceLynxInteractiveSession(
      session,
      encodeRuntimeInputCode(MS_DIRECTION.east, GAME_INPUT_MODIFIER_MASKS.action1),
    );
    const settled = lynxPortableItems(next.state).find(
      (item) => item.state.mode === "map" && item.state.pos === chipPos && item.state.z === 1,
    );

    expect(next.chipPos).toBe(exitTeleportPos);
    expect(settled?.serial).toBe(carriedSerial);
  });

  it("collects a sandbag when Chip falls from unsupported air", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 37;
    lower[chipPos] = createCell(chipPos, MS_TILE.Sandbag);
    upper[chipPos] = createCellAtZ(chipPos, 2, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [chipPos] }),
    );

    const fallen = advanceLynxTicks(session, 2);

    expect(fallen.chipZ).toBe(1);
    expect(fallen.state.inventory.tools).toEqual([MS_TILE.Sandbag]);
    expect(lynxPortableItems(fallen.state).find((item) => item.state.mode === "carried")?.tileId).toBe(MS_TILE.Sandbag);
    expect(fallen.state.map.layers?.[0]?.cells[chipPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("keeps a block supported over a sandbag in air", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const blockPos = 103;
    lower[blockPos] = createCell(blockPos, MS_TILE.Sandbag);
    upper[blockPos] = createCellAtZ(blockPos, 2, MS_TILE.Block_Static, MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, { upperCreaturePositions: [blockPos] }),
    );

    const supported = advanceLynxTicks(session, 2);
    const block = supported.actors.find((actor) => actor.id === MS_TILE.Block);

    expect(block?.hidden).toBe(false);
    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(blockPos);
    expect(supported.state.map.layers?.[0]?.cells[blockPos]?.top.id).toBe(MS_TILE.Sandbag);
  });

  it("treats a primed tool drop as a wall to adjacent Lynx creatures", () => {
    const chipPos = 33;
    const tankPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel(
        [
          createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
          createCell(tankPos, msCreatureTile(MS_TILE.Tank, 2)),
        ],
        [chipPos, tankPos],
      ),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const primed = advanceLynxInteractiveSession(
      session,
      encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1),
    );
    const tank = primed.actors.find((actor) => actor.id === MS_TILE.Tank && !actor.hidden);

    expect(primed.endGameResult).toBeNull();
    expect(tank?.pos).toBe(tankPos);
    expect(primed.state.inventory.tools).toEqual([0]);
  });

  it("supports a Lynx block above Chip while a tool drop is primed", () => {
    const lower = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
    const upper = createBoardAtZ(2);
    const chipPos = 104;
    lower[chipPos] = createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8), MS_TILE.Empty);
    upper[chipPos] = createCellAtZ(chipPos, 2, MS_TILE.Block_Static, MS_TILE.Air);

    const session = createLynxInteractiveSession(
      createRequest(),
      createTwoLayerLevel(lower, upper, {
        lowerCreaturePositions: [chipPos],
        upperCreaturePositions: [chipPos],
      }),
    );
    session.state.inventory.tools = [MS_TILE.Sandbag];

    const primed = advanceLynxInteractiveSession(
      session,
      encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1),
    );
    const supported = advanceLynxTicks(primed, 2);
    const block = supported.actors.find((actor) => actor.id === MS_TILE.Block && !actor.hidden);

    expect(supported.endGameResult).toBeNull();
    expect(block?.z).toBe(2);
    expect(block?.pos).toBe(chipPos);
  });
});

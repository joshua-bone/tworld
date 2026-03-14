import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@domain/game/model";
import type { ReplaySolutionPayload } from "@domain/game/codec";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  createMsReplaySession,
  initializeMsGameState,
  runMsReplayTrace,
  runMsReplayTraceDebug,
} from "@domain/game/rules/ms/engine";
import type { MsLevel } from "@domain/game/rules/ms/level";
import {
  MS_DIRECTION,
  MS_FLOOR_STATE,
  MS_GRID_HEIGHT,
  MS_GRID_WIDTH,
  MS_SOUND,
  MS_STATUS_FLAG,
  MS_TILE,
  msCreatureDir,
  msCreatureId,
  msCreatureTile,
} from "@domain/game/rules/ms/tiles";

function createEmptyCells(): EngineMapCell[] {
  return Array.from({ length: MS_GRID_WIDTH * MS_GRID_HEIGHT }, (_, pos) => ({
    position: {
      x: pos % MS_GRID_WIDTH,
      y: Math.floor(pos / MS_GRID_WIDTH),
      pos,
    },
    top: { id: MS_TILE.Empty, state: 0 },
    bottom: { id: MS_TILE.Empty, state: 0 },
  }));
}

function pos(x: number, y: number): number {
  return y * MS_GRID_WIDTH + x;
}

function createLevel(overrides: Partial<MsLevel> & { cells: EngineMapCell[]; creaturePositions?: number[] }): MsLevel {
  return {
    number: 1,
    timeLimitTicks: 200,
    chipsNeeded: 0,
    hintText: "",
    traps: [],
    cloners: [],
    creaturePositions: overrides.creaturePositions ?? [],
    statusFlags: 0,
    ...overrides,
  };
}

function createRequest() {
  return {
    seriesFile: "test-ms.dac",
    levelNumber: 1,
    ruleset: "MS" as const,
    randomSeed: 123456789,
  };
}

const TEST_MOUSE_RANGE_MIN = -9;
const TEST_MOUSE_RANGE = 19;
const TEST_CMD_MOUSE_MOVE_FIRST = (MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east) + 1;

function relativeMouseMoveCode(chipPos: number, targetPos: number): number {
  const dx = (targetPos % MS_GRID_WIDTH) - (chipPos % MS_GRID_WIDTH);
  const dy = Math.floor(targetPos / MS_GRID_WIDTH) - Math.floor(chipPos / MS_GRID_WIDTH);
  return TEST_CMD_MOUSE_MOVE_FIRST + (dy - TEST_MOUSE_RANGE_MIN) * TEST_MOUSE_RANGE + (dx - TEST_MOUSE_RANGE_MIN);
}

function absoluteMouseMoveCode(targetPos: number): number {
  return 512 + targetPos;
}

describe("MS engine regressions", () => {
  it("seeds Chip's runtime direction from the lower tile when Chip starts on the top layer", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[chipPos]!.bottom.id = MS_TILE.Empty;

    const state = initializeMsGameState(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );

    expect(state.internal.chipPos).toBe(chipPos);
    expect(state.internal.chipDir).toBe(MS_DIRECTION.west);
  });

  it("keeps replay lastMove latched across a blocked movement cycle", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[pos(11, 10)]!.top.id = MS_TILE.Wall;

    const level = createLevel({
      cells,
      creaturePositions: [chipPos],
    });
    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTrace(createRequest(), level, replay, 5);

    expect(trace.steps.slice(0, 4).map((step) => step.lastMove)).toEqual(["east", "east", "east", "east"]);
    expect(trace.steps[4]?.lastMove).toBe("none");
  });

  it("fails a replay immediately after its recorded best time expires with no remaining moves", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);

    const replay = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [],
      bestTimeTicks: 0,
    } satisfies ReplaySolutionPayload & { bestTimeTicks: number };

    const trace = runMsReplayTrace(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      5,
    );

    expect(trace.steps.map((step) => step.status)).toEqual(["playing", "playing", "failed"]);
    expect(trace.result).toMatchObject({
      status: "failed",
      finalTick: 2,
      stepCount: 3,
    });
  });

  it("emits no debug phases on the replay-deadline failure tick", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);

    const replay = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [],
      bestTimeTicks: 0,
    } satisfies ReplaySolutionPayload & { bestTimeTicks: number };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      5,
    );

    expect(trace.steps[2]).toMatchObject({
      status: "failed",
      currentTime: 2,
    });
    expect(trace.steps[2]?.phases).toEqual([]);
  });

  it("initializes tracked blocks from creature positions when the map cell is Block_Static", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const trackedBlockPos = pos(12, 10);
    const untrackedBlockPos = pos(13, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[trackedBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[trackedBlockPos]!.bottom.id = MS_TILE.Button_Brown;
    cells[untrackedBlockPos]!.top.id = MS_TILE.Block_Static;

    const state = initializeMsGameState(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [trackedBlockPos],
      }),
    );

    expect(state.internal.blocks).toHaveLength(1);
    expect(state.internal.blocks[0]).toMatchObject({
      pos: trackedBlockPos,
      dir: MS_DIRECTION.none,
      hidden: false,
      released: false,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
  });

  it("advances a red-button block source even when the cloner target is not a clone machine", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const buttonPos = pos(3, 2);
    const sourcePos = pos(13, 10);
    const nextPos = pos(14, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[buttonPos]!.top.id = MS_TILE.Button_Red;
    cells[sourcePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.east);
    cells[sourcePos]!.bottom.id = MS_TILE.Ice;
    cells[nextPos]!.top.id = MS_TILE.Empty;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: buttonPos, to: sourcePos }],
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    for (let tick = 0; tick < 4; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.map.cells[sourcePos]?.top.id).toBe(MS_TILE.Ice);
    expect(session.state.engine.map.cells[nextPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.internal.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pos: nextPos,
          dir: MS_DIRECTION.east,
          hidden: false,
        }),
      ]),
    );
  });

  it("records post-chip-input after currentInput is cleared for debug traces", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[chipPos]!.bottom.id = MS_TILE.Empty;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      1,
    );

    const postChipInput = trace.steps[0]?.phases.find((phase) => phase.phase === "post-chip-input");

    expect(postChipInput?.currentInput).toBe("none");
    expect(postChipInput?.currentInputCode).toBe(MS_DIRECTION.none);
    expect(postChipInput?.activeCreatures[0]?.dir).toBe("west");
    expect(postChipInput?.activeCreatures[0]?.tdir).toBe("east");
  });

  it("keeps raw replay mouse-goal commands in debug input and lastMove state", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const targetPos = pos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: relativeMouseMoveCode(chipPos, targetPos) }],
    };
    const mouseCode = relativeMouseMoveCode(chipPos, targetPos);

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      1,
    );
    expect(trace.steps[0]?.inputCode).toBe(mouseCode);
    expect(trace.steps[0]?.phases[0]?.currentInputCode).toBe(mouseCode);
    expect(trace.steps[0]?.chip?.position.pos).toBe(chipPos);
  });

  it("keeps manual absolute mouse-goal commands intact and starts moving toward the clicked tile", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const targetPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );

    const afterClick = advanceMsInteractiveSession(session, absoluteMouseMoveCode(targetPos));
    const afterMove = advanceMsInteractiveSession(afterClick, MS_DIRECTION.none);
    const settled = advanceMsInteractiveSession(afterMove, MS_DIRECTION.none);

    expect(afterClick.state.internal.goalPos).toBe(targetPos);
    expect(settled.state.internal.chipPos).toBe(targetPos);
  });

  it("moves Chip toward a replay mouse-goal on step-two cadence", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const targetPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: relativeMouseMoveCode(chipPos, targetPos) }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      3,
    );

    expect(trace.steps[0]?.chip?.position.pos).toBe(chipPos);
    expect(trace.steps[2]?.chip?.position.pos).toBe(targetPos);
    expect(trace.steps[2]?.phases[6]?.goalPos).toBe(-1);
  });

  it("clears replay mouse-goal lastMove on the tick after the input is recorded", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const targetPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: relativeMouseMoveCode(chipPos, targetPos) }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      2,
    );

    expect(trace.steps[0]?.lastMoveCode).toBe(relativeMouseMoveCode(chipPos, targetPos));
    expect(trace.steps[1]?.lastMove).toBe("none");
  });

  it("records a direct replay move on the tick it is applied even after Chip has moved", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const targetPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[targetPos]!.top.id = MS_TILE.Empty;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 1, dir: MS_DIRECTION.north }],
    };

    const trace = runMsReplayTrace(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      2,
    );

    expect(trace.steps[1]?.inputCode).toBe(MS_DIRECTION.north);
    expect(trace.steps[1]?.lastMove).toBe("north");
  });

  it("keeps the current replay move as lastMove on the completion tick", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const exitPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[exitPos]!.top.id = MS_TILE.Exit;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.south }],
    };

    const trace = runMsReplayTrace(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      1,
    );

    expect(trace.steps[0]?.status).toBe("completed");
    expect(trace.steps[0]?.lastMove).toBe("south");
  });

  it("keeps a replay mouse-goal lastMove while the goal is still active after Chip has moved", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const goalPos = pos(8, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);

    const session = createMsReplaySession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      {
        flags: 0,
        randomSlideDirection: MS_DIRECTION.north,
        stepping: 0,
        randomSeed: 123456789,
        moves: [],
      },
    );
    const mouseCode = relativeMouseMoveCode(chipPos, goalPos);
    session.state.engine.lastMove = { code: mouseCode, name: `cmd-${mouseCode}` };
    session.state.internal.goalPos = goalPos;
    session.state.internal.chipHasMoved = true;
    session.state.engine.timer.currentTime = 1;
    session.state.engine.timer.tick = 1;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.engine.lastMove).toEqual({ code: mouseCode, name: `cmd-${mouseCode}` });
  });

  it("keeps the previous replay lastMove when Chip already moved and a direct input arrives without a goal", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);

    const session = createMsReplaySession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      {
        flags: 0,
        randomSlideDirection: MS_DIRECTION.north,
        stepping: 0,
        randomSeed: 123456789,
        moves: [{ when: 2, dir: MS_DIRECTION.east }],
      },
    );
    session.state.engine.lastMove = { code: MS_DIRECTION.west, name: "west" };
    session.state.internal.goalPos = -1;
    session.state.internal.chipHasMoved = true;
    session.state.engine.timer.currentTime = 1;
    session.state.engine.timer.tick = 1;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.engine.lastMove).toEqual({ code: MS_DIRECTION.west, name: "west" });
  });

  it("keeps the previous replay lastMove when Chip completes during floor movement before chip input", () => {
    const cells = createEmptyCells();
    const chipPos = pos(1, 2);
    const exitPos = pos(1, 1);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[chipPos]!.bottom.id = MS_TILE.Empty;
    cells[exitPos]!.top.id = MS_TILE.Empty;
    cells[exitPos]!.bottom.id = MS_TILE.Exit;

    const session = createMsReplaySession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      {
        flags: 0,
        randomSlideDirection: MS_DIRECTION.north,
        stepping: 0,
        randomSeed: 123456789,
        moves: [{ when: 2, dir: MS_DIRECTION.north }],
      },
    );
    session.state.engine.lastMove = { code: MS_DIRECTION.west, name: "west" };
    session.state.internal.floorMovement = "slide";
    session.state.internal.floorMovementDir = MS_DIRECTION.north;
    session.state.internal.lastSlipDir = MS_DIRECTION.north;
    session.state.internal.chipDir = MS_DIRECTION.north;
    session.state.engine.timer.currentTime = 1;
    session.state.engine.timer.tick = 1;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.engine.status).toBe("completed");
    expect(next.state.engine.lastMove).toEqual({ code: MS_DIRECTION.west, name: "west" });
  });

  it("keeps deferred WaterSplash when Chip completes by pushing a block into water on an exit tile", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const exitPos = pos(1, 2);
    const waterPos = pos(0, 2);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[exitPos]!.top.id = MS_TILE.Block_Static;
    cells[exitPos]!.bottom.id = MS_TILE.Exit;
    cells[waterPos]!.top.id = MS_TILE.Water;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [exitPos],
      }),
    );

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.west);

    expect(next.state.engine.status).toBe("completed");
    expect(next.state.engine.soundEffects & (1 << MS_SOUND.ChipWins)).not.toBe(0);
    expect(next.state.engine.soundEffects & (1 << MS_SOUND.WaterSplash)).not.toBe(0);
  });

  it("applies native non-existence hazard checks when a tracked creature is no longer on the map", () => {
    const cells = createEmptyCells();
    const chipPos = pos(5, 5);
    const fireballPos = pos(0, 0);
    const firePos = pos(1, 0);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[firePos]!.top.id = MS_TILE.Fire;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.engine.timer.currentTime = 7;
    session.state.engine.timer.tick = 7;
    session.state.engine.map.cells[fireballPos]!.top.id = MS_TILE.Empty;
    session.state.engine.map.cells[firePos]!.top.id = MS_TILE.Fire;
    session.state.internal.creatures = [
      {
        serial: 1,
        id: MS_TILE.Fireball,
        dir: MS_DIRECTION.north,
        tdir: MS_DIRECTION.none,
        pos: fireballPos,
        hidden: false,
        moving: 0,
        frame: 0,
        cloning: false,
        released: false,
        turning: false,
        hasMoved: false,
        floorMovement: "none",
        floorMovementDir: MS_DIRECTION.none,
        sliding: false,
      },
    ];
    session.state.internal.creatureIndexBySerial = new Map([[1, 0]]);

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    const creature = next.state.internal.creatures[0]!;

    expect(creature.dir).toBe(MS_DIRECTION.east);
    expect(creature.hidden).toBe(true);
    expect(creature.pos).toBe(fireballPos);
    expect(next.state.engine.map.cells[fireballPos]!.top.id).toBe(MS_TILE.Empty);
    expect(next.state.engine.map.cells[firePos]!.top.id).toBe(MS_TILE.Fire);
  });

  it("clears a replay mouse goal as soon as Chip lands on the target slide tile", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const targetPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[targetPos]!.top.id = MS_TILE.Slide_North;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: relativeMouseMoveCode(chipPos, targetPos) }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      3,
    );

    expect(trace.steps[2]?.phases[6]?.goalPos).toBe(-1);
    expect(trace.steps[2]?.phases[6]?.chipFloor.movementMode).toBe("slide");
    expect(trace.steps[2]?.phases[6]?.slipList[0]?.creature?.position.pos).toBe(targetPos);
  });

  it("rechecks a pushed block probe before choosing a replay mouse-goal direction", () => {
    const cells = createEmptyCells();
    const chipPos = pos(14, 20);
    const targetPos = pos(13, 18);
    const blockPos = pos(14, 19);
    const blockLandingPos = pos(14, 18);
    const westPos = pos(13, 20);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.BlueWall_Real;
    cells[westPos]!.top.id = MS_TILE.ICChip;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: relativeMouseMoveCode(chipPos, targetPos) }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      3,
    );

    expect(trace.steps[2]?.phases[6]?.activeCreatures[0]?.tdir).toBe("west");
    expect(trace.steps[2]?.chip?.position.pos).toBe(westPos);
    expect(trace.steps[2]?.chipsNeeded).toBe(0);
    expect(trace.steps[2]?.phases[6]?.blocks[0]?.position.pos).toBe(blockLandingPos);
  });

  it("records a creature-movement debug phase on even ticks", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      3,
    );

    const stepTwoPhases = trace.steps[2]?.phases.map((phase) => phase.phase);

    expect(stepTwoPhases).toContain("post-creature-movement");
    expect(stepTwoPhases?.indexOf("post-creature-movement")).toBeLessThan(stepTwoPhases?.indexOf("post-chip-floor-movement") ?? -1);
  });

  it("keeps a non-Chip creature on a slide floor in slip state until it successfully floor-moves", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const ballPos = pos(10, 10);
    const slidePos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[slidePos]!.top.id = MS_TILE.Slide_West;

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos],
      }),
      {
        flags: 0,
        randomSlideDirection: MS_DIRECTION.north,
        stepping: 0,
        randomSeed: 123456789,
        moves: [],
      },
      5,
    );

    const postCreatureMovement = trace.steps[4]?.phases.find((phase) => phase.phase === "post-creature-movement");
    const ball = postCreatureMovement?.activeCreatures.find((actor) => actor.id === MS_TILE.Ball);

    expect(ball?.state).toBe(0x10);
    expect(ball?.stateFlags).toContain("slip");
    expect(ball?.stateFlags).not.toContain("slide");
    expect(ball?.floor.movementMode).toBe("slide");
  });

  it("does not move ordinary creatures on step 2, but does on step 4", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const fireballPos = pos(19, 12);
    const gliderPos = pos(9, 14);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[fireballPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east);
    cells[gliderPos]!.top.id = msCreatureTile(MS_TILE.Glider, MS_DIRECTION.south);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.south }],
    };

    const trace = runMsReplayTrace(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, fireballPos, gliderPos],
      }),
      replay,
      5,
    );

    const fireballAtStep2 = trace.steps[2]?.creatures.find((actor) => actor.id === MS_TILE.Fireball);
    const gliderAtStep2 = trace.steps[2]?.creatures.find((actor) => actor.id === MS_TILE.Glider);
    const fireballAtStep4 = trace.steps[4]?.creatures.find((actor) => actor.id === MS_TILE.Fireball);
    const gliderAtStep4 = trace.steps[4]?.creatures.find((actor) => actor.id === MS_TILE.Glider);

    expect(fireballAtStep2?.position.pos).toBe(fireballPos);
    expect(gliderAtStep2?.position.pos).toBe(gliderPos);
    expect(fireballAtStep4?.position.pos).toBe(fireballPos + 1);
    expect(gliderAtStep4?.position.pos).toBe(gliderPos + MS_GRID_WIDTH);
  });

  it("keeps turning tanks rendered in their turning pose on step 6", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const tankPos = pos(12, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.north);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, tankPos],
      }),
    );
    session.state.engine.timer.tick = 5;
    session.state.engine.timer.currentTime = 5;
    session.state.internal.creatures[0]!.dir = MS_DIRECTION.west;
    session.state.internal.creatures[0]!.turning = true;
    session.state.internal.creatures[0]!.hasMoved = true;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.engine.map.cells[tankPos]?.top.id).toBe(msCreatureTile(MS_TILE.Tank, MS_DIRECTION.north));
    expect(next.state.internal.creatures[0]).toMatchObject({
      dir: MS_DIRECTION.west,
      turning: true,
      hasMoved: true,
    });
  });

  it("keeps a blocked bug's preferred tdir on step 4", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const bugPos = pos(20, 20);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[bugPos]!.top.id = msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west);
    cells[pos(19, 20)]!.top.id = MS_TILE.Wall;
    cells[pos(20, 19)]!.top.id = MS_TILE.Wall;
    cells[pos(20, 21)]!.top.id = MS_TILE.Wall;
    cells[pos(21, 20)]!.top.id = MS_TILE.Wall;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, bugPos],
      }),
      replay,
      5,
    );

    const postCreatureMovement = trace.steps[4]?.phases.find((phase) => phase.phase === "post-creature-movement");
    const bug = postCreatureMovement?.activeCreatures.find((actor) => actor.id === MS_TILE.Bug);

    expect(bug?.dir).toBe("west");
    expect(bug?.tdir).toBe("west");
  });

  it("preserves controllerDir through post-initial-housekeeping on step 6", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const bugPos = pos(20, 20);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[bugPos]!.top.id = msCreatureTile(MS_TILE.Bug, MS_DIRECTION.east);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, bugPos],
      }),
      replay,
      7,
    );

    const stepFourPostCreature = trace.steps[4]?.phases.find((phase) => phase.phase === "post-creature-movement");
    const stepSixHousekeeping = trace.steps[6]?.phases.find((phase) => phase.phase === "post-initial-housekeeping");

    expect(stepFourPostCreature?.controllerDir).toBe("north");
    expect(stepSixHousekeeping?.controllerDir).toBe("north");
  });

  it("does not invent a slide slipDir in post-chip-movement when Chip was not forced that tick", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[chipPos]!.bottom.id = MS_TILE.Slide_West;
    cells[pos(9, 10)]!.top.id = MS_TILE.Slide_West;
    cells[pos(8, 10)]!.top.id = MS_TILE.Slide_West;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 4, dir: MS_DIRECTION.north }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
      replay,
      5,
    );

    const postChipMovement = trace.steps[4]?.phases.find((phase) => phase.phase === "post-chip-movement");

    expect(postChipMovement?.activeCreatures[0]?.floor.movementMode).toBe("none");
    expect(postChipMovement?.activeCreatures[0]?.floor.slipDir).toBe("none");
  });

  it("clears carried slide slipDir in post-chip-movement after a same-tick manual move", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[chipPos]!.bottom.id = MS_TILE.Slide_West;
    cells[pos(9, 10)]!.top.id = MS_TILE.Empty;
    cells[pos(9, 10)]!.bottom.id = MS_TILE.Empty;
    cells[pos(9, 9)]!.top.id = MS_TILE.Empty;
    cells[pos(9, 9)]!.bottom.id = MS_TILE.Empty;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.north }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
      replay,
      3,
    );

    const postChipMovement = trace.steps[2]?.phases.find((phase) => phase.phase === "post-chip-movement");

    expect(postChipMovement?.activeCreatures[0]?.floor.movementMode).toBe("none");
    expect(postChipMovement?.activeCreatures[0]?.floor.slipDir).toBe("none");
    expect(trace.steps[2]?.chip?.dir).toBe("north");
  });

  it("carries slide slipDir through post-chip-movement after an odd-tick manual move off a slide", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const firstSlidePos = pos(11, 10);
    const secondSlidePos = pos(12, 10);
    const exitPos = pos(12, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[firstSlidePos]!.top.id = MS_TILE.Slide_East;
    cells[secondSlidePos]!.top.id = MS_TILE.Slide_East;
    cells[exitPos]!.top.id = MS_TILE.Empty;
    cells[exitPos]!.bottom.id = MS_TILE.Empty;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [
        { when: 0, dir: MS_DIRECTION.east },
        { when: 2, dir: MS_DIRECTION.north },
      ],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
      replay,
      3,
    );

    const postChipInput = trace.steps[2]?.phases.find((phase) => phase.phase === "post-chip-input");
    const postChipMovement = trace.steps[2]?.phases.find((phase) => phase.phase === "post-chip-movement");
    const postCloneRelease = trace.steps[2]?.phases.find((phase) => phase.phase === "post-clone-release");

    expect(postChipInput?.chipFloor.movementMode).toBe("slide");
    expect(postChipInput?.chipFloor.slipDir).toBe("east");
    expect(postChipMovement?.chipFloor.movementMode).toBe("none");
    expect(postChipMovement?.chipFloor.slipDir).toBe("east");
    expect(postChipMovement?.slipList).toHaveLength(1);
    expect(postCloneRelease?.chipFloor.slipDir).toBe("none");
    expect(postCloneRelease?.slipList).toHaveLength(0);
  });

  it("resolves deferred block-pushed button effects before post-chip-movement", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(10, 11);
    const brownButtonPos = pos(10, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[brownButtonPos]!.top.id = MS_TILE.Button_Brown;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.south }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
      replay,
      1,
    );

    const postChipMovement = trace.steps[0]?.phases.find((phase) => phase.phase === "post-chip-movement");

    expect((postChipMovement?.soundEffects ?? 0) & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(postChipMovement?.boardFlags).toEqual([]);
  });

  it("clears turning and updates the tile before a blocked step-8 creature attempt", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const tankPos = pos(12, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.north);
    cells[pos(11, 12)]!.top.id = MS_TILE.Wall;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, tankPos],
      }),
    );
    session.state.engine.timer.tick = 7;
    session.state.engine.timer.currentTime = 7;
    session.state.internal.creatures[0]!.dir = MS_DIRECTION.west;
    session.state.internal.creatures[0]!.turning = true;
    session.state.internal.creatures[0]!.hasMoved = true;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.internal.creatures[0]).toMatchObject({
      dir: MS_DIRECTION.west,
      turning: false,
      hasMoved: true,
    });
    expect(next.state.engine.map.cells[tankPos]?.top.id).toBe(msCreatureTile(MS_TILE.Tank, MS_DIRECTION.west));
  });

  it("keeps has-moved through housekeeping and clears it during choose on every fourth tick", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [
        { when: 0, dir: MS_DIRECTION.east },
        { when: 4, dir: MS_DIRECTION.south },
      ],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      5,
    );

    const stepFour = trace.steps[4];
    const housekeeping = stepFour?.phases.find((phase) => phase.phase === "post-initial-housekeeping");
    const postChipInput = stepFour?.phases.find((phase) => phase.phase === "post-chip-input");

    expect(housekeeping?.activeCreatures[0]?.stateFlags).toContain("has-moved");
    expect(postChipInput?.activeCreatures[0]?.stateFlags).not.toContain("has-moved");
    expect(postChipInput?.activeCreatures[0]?.tdir).toBe("south");
    expect(postChipInput?.lastMove).toBe("south");
    expect(stepFour?.lastMove).toBe("south");
  });

  it("does not allow chipsNeeded to go negative when collecting an extra computer chip", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const chipTarget = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[chipTarget]!.top.id = MS_TILE.ICChip;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        chipsNeeded: 0,
        creaturePositions: [chipPos],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.engine.inventory.chipsNeeded).toBe(0);
    expect(next.state.engine.map.cells[chipTarget]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
  });

  it("does not play ButtonPushed or turn tanks when Chip opens a socket covering a blue button", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const socketPos = pos(3, 2);
    const tankPos = pos(8, 8);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[socketPos]!.top.id = MS_TILE.Socket;
    cells[socketPos]!.bottom.id = MS_TILE.Button_Blue;
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, tankPos],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.engine.soundEffects & (1 << MS_SOUND.SocketOpened)).not.toBe(0);
    expect(next.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).toBe(0);
    expect(next.state.engine.actors.find((actor) => actor.id === MS_TILE.Tank)?.dir).toBe("east");
    expect(next.state.engine.map.cells[socketPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    expect(next.state.engine.map.cells[socketPos]?.bottom.id).toBe(MS_TILE.Button_Blue);
  });

  it("makes fireballs explode bombs", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const fireballPos = pos(10, 10);
    const bombPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[fireballPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east);
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, fireballPos],
      }),
    );
    let next = session;
    for (let tick = 0; tick < 5; tick += 1) {
      next = advanceMsInteractiveSession(next, MS_DIRECTION.none);
    }

    expect(next.state.engine.soundEffects & (1 << MS_SOUND.BombExplodes)).not.toBe(0);
    expect(next.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
    expect(next.state.engine.map.cells[bombPos]?.bottom.id).toBe(MS_TILE.Empty);
    expect(next.state.engine.actors.some((actor) => actor.id === MS_TILE.Fireball)).toBe(false);
  });

  it("plays WaterSplash when a teleport exit pushes a block into water", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const startTeleportPos = pos(10, 11);
    const exitTeleportPos = pos(5, 5);
    const blockPos = pos(5, 6);
    const waterPos = pos(5, 7);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[startTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[exitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[waterPos]!.top.id = MS_TILE.Water;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(next.state.engine.soundEffects & (1 << MS_SOUND.Teleporting)).not.toBe(0);
    expect(next.state.engine.soundEffects & (1 << MS_SOUND.WaterSplash)).not.toBe(0);
    expect(next.state.engine.map.cells[exitTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south));
    expect(next.state.engine.map.cells[exitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[blockPos]?.top.id).toBe(MS_TILE.Empty);
    expect(next.state.engine.map.cells[waterPos]?.top.id).toBe(MS_TILE.Dirt);
  });

  it("plays BombExplodes when a teleport exit pushes a block into a bomb", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const startTeleportPos = pos(10, 11);
    const exitTeleportPos = pos(5, 5);
    const blockPos = pos(5, 6);
    const bombPos = pos(5, 7);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[startTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[exitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(next.state.engine.soundEffects & (1 << MS_SOUND.Teleporting)).not.toBe(0);
    expect(next.state.engine.soundEffects & (1 << MS_SOUND.BombExplodes)).not.toBe(0);
    expect(next.state.engine.map.cells[exitTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south));
    expect(next.state.engine.map.cells[exitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[blockPos]?.top.id).toBe(MS_TILE.Empty);
    expect(next.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("turns blocked teeth toward their preferred target direction", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 8);
    const teethPos = pos(10, 10);
    const wallPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[teethPos]!.top.id = msCreatureTile(MS_TILE.Teeth, MS_DIRECTION.east);
    cells[wallPos]!.top.id = MS_TILE.Wall;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, teethPos],
      }),
    );

    for (let tick = 0; tick < 9; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const teeth = session.state.engine.actors.find((actor) => actor.id === MS_TILE.Teeth);
    expect(teeth?.dir).toBe("north");
    expect(teeth?.position.pos).toBe(teethPos);
  });

  it("applies source wall leave checks before choosing a creature fallback direction", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const parameciumPos = pos(10, 10);
    const eastPos = pos(11, 10);
    const southPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[parameciumPos]!.top.id = msCreatureTile(MS_TILE.Paramecium, MS_DIRECTION.east);
    cells[parameciumPos]!.bottom.id = MS_TILE.Wall_South;
    cells[eastPos]!.top.id = MS_TILE.Empty;
    cells[southPos]!.top.id = MS_TILE.Empty;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, parameciumPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const paramecium = session.state.engine.actors.find((actor) => actor.id === MS_TILE.Paramecium);
    expect(paramecium?.position.pos).toBe(eastPos);
    expect(paramecium?.dir).toBe("east");
  });

  it("applies creature ice-floor movement in the same movement cycle", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const tankPos = pos(10, 10);
    const iceCornerPos = pos(10, 11);
    const forcedDestination = pos(9, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.south);
    cells[iceCornerPos]!.top.id = MS_TILE.IceWall_Northwest;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, tankPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const tank = session.state.engine.actors.find((actor) => actor.id === MS_TILE.Tank);
    expect(tank?.position.pos).toBe(forcedDestination);
    expect(tank?.dir).toBe("west");
  });

  it("moves creatures through a slide in the same even-tick floor phase", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const ballPos = pos(5, 11);
    const slidePos = pos(6, 11);
    const exitPos = pos(7, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[slidePos]!.top.id = MS_TILE.Slide_East;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const ball = session.state.engine.actors.find((actor) => actor.id === MS_TILE.Ball);
    expect(ball?.position.pos).toBe(exitPos);
    expect(session.state.internal.creatures.find((creature) => creature.id === MS_TILE.Ball)?.floorMovement).toBe("none");
  });

  it("requeues a blocked slipping creature to the end of the slip list", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const eastBallPos = pos(5, 11);
    const southLeftPos = pos(7, 9);
    const southRightPos = pos(8, 9);
    const eastSlidePos = pos(6, 11);
    const eastExitPos = pos(7, 11);
    const southLeftSlidePos = pos(7, 10);
    const southRightSlidePos = pos(8, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[eastBallPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[southLeftPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[southRightPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[eastSlidePos]!.top.id = MS_TILE.Slide_East;
    cells[southLeftSlidePos]!.top.id = MS_TILE.Slide_South;
    cells[southRightSlidePos]!.top.id = MS_TILE.Slide_South;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, eastBallPos, southLeftPos, southRightPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const ballPositions = session.state.engine.actors
      .filter((actor) => actor.id === MS_TILE.Ball)
      .map((actor) => actor.position.pos)
      .sort((left, right) => left - right);

    expect(ballPositions).toEqual([southLeftSlidePos, southRightSlidePos, eastExitPos]);
  });

  it("marks a slipping creature as sliding after a successful even-tick floor move", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const ballPos = pos(5, 10);
    const nextPos = pos(6, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[ballPos]!.bottom.id = MS_TILE.Ice;
    cells[nextPos]!.top.id = MS_TILE.Ice;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos],
      }),
    );

    const ball = session.state.internal.creatures.find((creature) => creature.pos === ballPos);
    expect(ball).toBeDefined();
    ball!.floorMovement = "ice";
    ball!.floorMovementDir = MS_DIRECTION.east;
    ball!.sliding = false;
    session.state.internal.creatureSlipList = [{ serial: ball!.serial, dir: MS_DIRECTION.east, slipOrder: 0 }];
    session.state.internal.nextSlipOrder = 1;

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const movedBall = session.state.internal.creatures.find((creature) => creature.pos === nextPos);
    expect(movedBall?.floorMovement).toBe("ice");
    expect(movedBall?.sliding).toBe(true);
  });

  it("requeues a blocked ice retry to the tail so it can move again before an earlier slipper", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockedBallPos = pos(4, 10);
    const skippedBallPos = pos(10, 4);
    const trailingBallPos = pos(15, 10);
    const blockedWallPos = pos(3, 10);
    const blockedRetryPos = pos(5, 10);
    const blockedSecondRetryPos = pos(6, 10);
    const trailingNextPos = pos(16, 10);
    const skippedNextPos = pos(10, 5);

    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockedBallPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.west);
    cells[blockedBallPos]!.bottom.id = MS_TILE.Ice;
    cells[skippedBallPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[skippedBallPos]!.bottom.id = MS_TILE.Ice;
    cells[trailingBallPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[trailingBallPos]!.bottom.id = MS_TILE.Ice;
    cells[blockedWallPos]!.top.id = MS_TILE.Wall;

    for (const floorPos of [blockedRetryPos, blockedSecondRetryPos, skippedNextPos, trailingNextPos]) {
      cells[floorPos]!.top.id = MS_TILE.Ice;
    }

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, blockedBallPos, skippedBallPos, trailingBallPos],
      }),
    );

    const blockedBall = session.state.internal.creatures.find((creature) => creature.pos === blockedBallPos);
    const skippedBall = session.state.internal.creatures.find((creature) => creature.pos === skippedBallPos);
    const trailingBall = session.state.internal.creatures.find((creature) => creature.pos === trailingBallPos);
    expect(blockedBall).toBeDefined();
    expect(skippedBall).toBeDefined();
    expect(trailingBall).toBeDefined();

    for (const creature of [blockedBall, skippedBall, trailingBall]) {
      creature!.floorMovement = "ice";
    }
    blockedBall!.floorMovementDir = MS_DIRECTION.west;
    skippedBall!.floorMovementDir = MS_DIRECTION.south;
    trailingBall!.floorMovementDir = MS_DIRECTION.east;
    session.state.internal.creatureSlipList = [
      { serial: blockedBall!.serial, dir: MS_DIRECTION.west, slipOrder: 0 },
      { serial: skippedBall!.serial, dir: MS_DIRECTION.south, slipOrder: 1 },
      { serial: trailingBall!.serial, dir: MS_DIRECTION.east, slipOrder: 2 },
    ];
    session.state.internal.nextSlipOrder = 3;

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const actors = session.state.engine.actors.filter((actor) => actor.id === MS_TILE.Ball);
    expect(actors.find((actor) => actor.position.pos === blockedSecondRetryPos)?.dir).toBe("east");
    expect(actors.find((actor) => actor.position.pos === skippedBallPos)?.dir).toBe("south");
    expect(actors.find((actor) => actor.position.pos === trailingNextPos)?.dir).toBe("east");
  });

  it("clears controller direction on every even tick after tick zero", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.controllerDir = MS_DIRECTION.west;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    expect(session.state.internal.controllerDir).toBe(MS_DIRECTION.west);

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    expect(session.state.internal.controllerDir).toBe(MS_DIRECTION.west);

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    expect(session.state.internal.controllerDir).toBe(MS_DIRECTION.none);
  });

  it("resets idle Chip facing to south after chipwait saturates", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    for (let tick = 0; tick < 13; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.chipWait).toBe(3);
    expect(session.state.engine.map.cells[chipPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south));
    expect(session.state.engine.actors[0]?.dir).toBe("south");
  });

  it("resets chipwait on a blocked Chip move attempt", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const wallPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[wallPos]!.top.id = MS_TILE.Wall;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    for (let tick = 0; tick < 9; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }
    expect(session.state.internal.chipWait).toBe(3);

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    expect(session.state.internal.chipWait).toBe(0);

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.map.cells[chipPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
  });

  it("keeps a tank's visible tile facing forward when it hits a blue button mid-move", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const tankPos = pos(10, 10);
    const blueButtonPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east);
    cells[blueButtonPos]!.top.id = MS_TILE.Button_Blue;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, tankPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    let tank = session.state.engine.actors.find((actor) => actor.id === MS_TILE.Tank);
    expect(tank?.position.pos).toBe(blueButtonPos);
    expect(tank?.dir).toBe("east");
    expect(session.state.internal.creatures.find((creature) => creature.id === MS_TILE.Tank)?.dir).toBe(MS_DIRECTION.west);

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    tank = session.state.engine.actors.find((actor) => actor.id === MS_TILE.Tank);
    expect(tank?.position.pos).toBe(tankPos);
    expect(tank?.dir).toBe("west");
  });

  it("awakens clone-machine creatures and duplicates only when they move off the machine", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const redButtonPos = pos(3, 2);
    const cloneMachinePos = pos(10, 10);
    const bombPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[cloneMachinePos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east);
    cells[cloneMachinePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: redButtonPos, to: cloneMachinePos }],
        creaturePositions: [chipPos, cloneMachinePos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    for (let tick = 0; tick < 4; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const fireballs = session.state.engine.actors.filter((actor) => actor.id === MS_TILE.Fireball);
    expect(fireballs).toHaveLength(1);
    expect(fireballs[0]?.position.pos).toBe(cloneMachinePos);
    expect(session.state.engine.map.cells[cloneMachinePos]?.top.id).toBe(msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east));
    expect(session.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("duplicates clone-machine creatures once they leave the machine", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const redButtonPos = pos(3, 2);
    const cloneMachinePos = pos(10, 10);
    const exitPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[cloneMachinePos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east);
    cells[cloneMachinePos]!.bottom.id = MS_TILE.CloneMachine;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: redButtonPos, to: cloneMachinePos }],
        creaturePositions: [chipPos, cloneMachinePos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const fireballs = session.state.engine.actors.filter((actor) => actor.id === MS_TILE.Fireball);
    expect(fireballs).toHaveLength(2);
    expect(fireballs.map((actor) => actor.position.pos).sort((left, right) => left - right)).toEqual([
      cloneMachinePos,
      exitPos,
    ]);
    expect(session.state.engine.map.cells[cloneMachinePos]?.top.id).toBe(msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east));
    expect(session.state.engine.map.cells[cloneMachinePos]?.bottom.id).toBe(MS_TILE.CloneMachine);
    expect(session.state.engine.map.cells[exitPos]?.top.id).toBe(msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east));
  });

  it("chains a block cloner into a downstream creature cloner immediately", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const sourceRedButtonPos = pos(3, 2);
    const blockClonePos = pos(10, 10);
    const downstreamRedButtonPos = pos(10, 11);
    const ballClonePos = pos(10, 12);
    const blueButtonPos = pos(10, 13);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[sourceRedButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[blockClonePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.south);
    cells[blockClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[downstreamRedButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[ballClonePos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[ballClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[blueButtonPos]!.top.id = MS_TILE.Button_Blue;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [
          { from: sourceRedButtonPos, to: blockClonePos },
          { from: downstreamRedButtonPos, to: ballClonePos },
        ],
        creaturePositions: [chipPos, blockClonePos, ballClonePos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    for (let tick = 0; tick < 4; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const balls = session.state.engine.actors
      .filter((actor) => actor.id === MS_TILE.Ball)
      .map((actor) => actor.position.pos)
      .sort((left, right) => left - right);

    expect(session.state.engine.map.cells[blockClonePos]?.top.id).toBe(msCreatureTile(MS_TILE.Block, MS_DIRECTION.south));
    expect(session.state.engine.map.cells[blockClonePos]?.bottom.id).toBe(MS_TILE.CloneMachine);
    expect(session.state.engine.map.cells[downstreamRedButtonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(balls).toEqual([ballClonePos, blueButtonPos]);
  });

  it("keeps the source block on a clone machine when the cloned copy explodes on a bomb", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const redButtonPos = pos(3, 2);
    const blockClonePos = pos(10, 10);
    const bombPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[blockClonePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.south);
    cells[blockClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: redButtonPos, to: blockClonePos }],
        creaturePositions: [chipPos, blockClonePos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.BombExplodes)).not.toBe(0);
    expect(session.state.engine.map.cells[blockClonePos]?.top.id).toBe(msCreatureTile(MS_TILE.Block, MS_DIRECTION.south));
    expect(session.state.engine.map.cells[blockClonePos]?.bottom.id).toBe(MS_TILE.CloneMachine);
    expect(session.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("creates a clone when the clone machine exit is occupied by a same-direction creature", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const redButtonPos = pos(3, 2);
    const clonePos = pos(10, 10);
    const blockerPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[clonePos]!.top.id = msCreatureTile(MS_TILE.Bug, MS_DIRECTION.south);
    cells[clonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[blockerPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.south);

    const session = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          cloners: [{ from: redButtonPos, to: clonePos }],
          creaturePositions: [chipPos, clonePos, blockerPos],
        }),
      ),
      MS_DIRECTION.east,
    );

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(session.state.engine.map.cells[clonePos]?.bottom.id).toBe(MS_TILE.CloneMachine);
    expect(session.state.engine.map.cells[clonePos]?.bottom.state & MS_FLOOR_STATE.Cloning).not.toBe(0);
    expect(
      session.state.internal.creatures.filter((creature) => creature.id === MS_TILE.Bug && creature.pos === clonePos && !creature.hidden),
    ).toHaveLength(1);
  });

  it("does not arm a first-slide delay when a clone-machine block lands on a slide floor", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const redButtonPos = pos(3, 2);
    const blockClonePos = pos(10, 10);
    const slidePos = pos(10, 11);
    const nextSlidePos = pos(10, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[blockClonePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.south);
    cells[blockClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[slidePos]!.top.id = MS_TILE.Slide_South;
    cells[nextSlidePos]!.top.id = MS_TILE.Slide_South;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: redButtonPos, to: blockClonePos }],
        creaturePositions: [chipPos, blockClonePos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    const clonedBlock = session.state.internal.blocks.find((block) => !block.hidden && block.pos === slidePos);
    expect(clonedBlock).toMatchObject({
      dir: MS_DIRECTION.south,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
      slideDelayPending: true,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.blocks.some((block) => !block.hidden && block.pos === nextSlidePos)).toBe(true);
  });

  it("preserves a red button under a block pushed by Chip", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const redButtonPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[redButtonPos]!.top.id = MS_TILE.Empty;
    cells[redButtonPos]!.bottom.id = MS_TILE.Button_Red;

    const session = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          creaturePositions: [chipPos, blockPos],
        }),
      ),
      MS_DIRECTION.east,
    );

    expect(session.state.engine.map.cells[redButtonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.engine.map.cells[redButtonPos]?.bottom.id).toBe(MS_TILE.Button_Red);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).toBe(0);
  });

  it("does not let a slide-pushed block enter a one-way wall from a blocked direction", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 17);
    const blockPos = pos(10, 16);
    const wallPos = pos(10, 15);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[chipPos]!.bottom.id = MS_TILE.Slide_North;
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[wallPos]!.top.id = MS_TILE.Wall_South;

    const next = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          creaturePositions: [chipPos, blockPos],
        }),
      ),
      MS_DIRECTION.none,
    );

    expect(next.state.engine.actors.find((actor) => actor.id === MS_TILE.Chip)?.position.pos).toBe(chipPos);
    expect(next.state.engine.map.cells[blockPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(next.state.engine.map.cells[wallPos]?.top.id).toBe(MS_TILE.Wall_South);
  });

  it("processes a red-button clone block in the same block-floor phase before the older queued slip entry", () => {
    const cells = createEmptyCells();
    const chipPos = pos(6, 3);
    const southBlockPos = pos(7, 4);
    const eastBlockPos = pos(5, 4);
    const redButtonPos = pos(7, 5);
    const blockClonePos = pos(2, 6);
    const cloneFirstIcePos = pos(3, 6);
    const cloneSecondIcePos = pos(4, 6);

    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[southBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[southBlockPos]!.bottom.id = MS_TILE.Ice;
    cells[eastBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[eastBlockPos]!.bottom.id = MS_TILE.Ice;
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[blockClonePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.east);
    cells[blockClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[cloneFirstIcePos]!.top.id = MS_TILE.Ice;
    cells[cloneSecondIcePos]!.top.id = MS_TILE.Ice;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [{ from: redButtonPos, to: blockClonePos }],
        creaturePositions: [chipPos, southBlockPos, eastBlockPos, blockClonePos],
      }),
    );

    const southBlock = session.state.internal.blocks.find((block) => !block.hidden && block.pos === southBlockPos);
    const eastBlock = session.state.internal.blocks.find((block) => !block.hidden && block.pos === eastBlockPos);
    expect(southBlock).toBeDefined();
    expect(eastBlock).toBeDefined();

    Object.assign(southBlock!, {
      dir: MS_DIRECTION.east,
      floorMovement: "slide" as const,
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });
    Object.assign(eastBlock!, {
      dir: MS_DIRECTION.east,
      floorMovement: "slide" as const,
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 1,
    });
    session.state.internal.nextSlipOrder = 2;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    const visibleBlocks = session.state.internal.blocks.filter((block) => !block.hidden);
    const clonedBlock = visibleBlocks.find((block) => block.pos === cloneSecondIcePos);
    const queuedBlocks = visibleBlocks
      .filter((block) => block.floorMovement !== "none" && block.floorMovementDir !== MS_DIRECTION.none)
      .sort((left, right) => left.slipOrder - right.slipOrder)
      .map((block) => block.pos);

    expect(visibleBlocks.some((block) => block.pos === redButtonPos && block.floorMovement === "none")).toBe(true);
    expect(visibleBlocks.some((block) => block.pos === eastBlockPos)).toBe(true);
    expect(visibleBlocks.some((block) => block.pos === cloneFirstIcePos)).toBe(false);
    expect(clonedBlock).toMatchObject({
      dir: MS_DIRECTION.east,
      floorMovement: "ice",
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
      slideDelayPending: false,
    });
    expect(queuedBlocks).toEqual([eastBlockPos, cloneSecondIcePos]);
  });

  it("plays WaterSplash when Chip pushes a block into water", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const waterPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[waterPos]!.top.id = MS_TILE.Water;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.engine.soundEffects & (1 << MS_SOUND.WaterSplash)).not.toBe(0);
    expect(next.state.engine.map.cells[waterPos]?.top.id).toBe(MS_TILE.Dirt);
    expect(next.state.engine.map.cells[blockPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    expect(next.state.internal.blocks).toContainEqual(
      expect.objectContaining({
        pos: blockPos,
        dir: MS_DIRECTION.east,
        hidden: true,
        released: false,
        floorMovement: "none",
        floorMovementDir: MS_DIRECTION.none,
        sliding: false,
      }),
    );
  });

  it("keeps a hidden debug block at the source after a pushed block splashes into water", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const waterPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[waterPos]!.top.id = MS_TILE.Water;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
      replay,
      5,
    );
    const debugPhase = trace.steps[4]?.phases.find((phase) => phase.phase === "post-chip-movement");
    const hiddenBlock = debugPhase?.blocks.find((block) => block.position.pos === blockPos);

    expect(hiddenBlock?.hidden).toBe(true);
    expect(hiddenBlock?.dir).toBe("east");
    expect(hiddenBlock?.floor.movementMode).toBe("none");
  });

  it("keeps CantMove when a blocked ice move is followed by a successful reverse and manual move", () => {
    const cells = createEmptyCells();
    const chipPos = pos(1, 10);
    const blockedPos = pos(0, 10);
    const reversePos = pos(2, 10);
    const manualPos = pos(3, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[chipPos]!.bottom.id = MS_TILE.Ice;
    cells[blockedPos]!.top.id = MS_TILE.Block_Static;
    cells[reversePos]!.top.id = MS_TILE.Button_Green;
    cells[manualPos]!.top.id = MS_TILE.Ice;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    session.state.internal.floorMovement = "ice";
    session.state.internal.floorMovementDir = MS_DIRECTION.west;
    session.state.internal.chipDir = MS_DIRECTION.west;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.CantMove)).not.toBe(0);
    expect(session.state.internal.chipPos).toBe(manualPos);
    expect(session.state.engine.map.cells[manualPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
  });

  it("activates a static block when Chip attempts a blocked push", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const wallPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[wallPos]!.top.id = MS_TILE.Wall;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.internal.blocks).toContainEqual(
      expect.objectContaining({
        pos: blockPos,
        dir: MS_DIRECTION.none,
        hidden: false,
        floorMovement: "none",
        floorMovementDir: MS_DIRECTION.none,
        sliding: false,
      }),
    );
  });

  it("turns an already tracked block toward Chip's attempted blocked push", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const wallPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[wallPos]!.top.id = MS_TILE.Wall;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, blockPos],
      }),
    );
    session.state.internal.blocks[0]!.dir = MS_DIRECTION.south;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.internal.blocks[0]?.dir).toBe(MS_DIRECTION.east);
    expect(next.state.internal.chipPos).toBe(chipPos);
  });

  it("allows a perpendicular manual move after a blocked slide push on the same even tick", () => {
    const cells = createEmptyCells();
    const chipPos = pos(3, 4);
    const blockedPos = pos(4, 4);
    const manualPos = pos(3, 5);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[chipPos]!.bottom.id = MS_TILE.Slide_East;
    cells[blockedPos]!.top.id = MS_TILE.Wall;
    cells[manualPos]!.top.id = MS_TILE.Slide_East;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.engine.timer.currentTime = 13;
    session.state.internal.floorMovement = "slide";
    session.state.internal.floorMovementDir = MS_DIRECTION.east;
    session.state.internal.chipDir = MS_DIRECTION.east;
    session.state.internal.chipHasMoved = true;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.CantMove)).not.toBe(0);
    expect(session.state.internal.chipPos).toBe(manualPos);
    expect(session.state.internal.chipDir).toBe(MS_DIRECTION.east);
    expect(session.state.engine.map.cells[manualPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
  });

  it("keeps nested cloner bomb sounds when a cloned block lands on another red button", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const fireballPos = pos(6, 5);
    const outerButtonPos = pos(5, 5);
    const outerClonePos = pos(10, 10);
    const innerButtonPos = pos(10, 11);
    const innerClonePos = pos(20, 10);
    const bombPos = pos(20, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[fireballPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.west);
    cells[outerButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[outerClonePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.south);
    cells[outerClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[innerButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[innerClonePos]!.top.id = msCreatureTile(MS_TILE.Block, MS_DIRECTION.south);
    cells[innerClonePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        cloners: [
          { from: outerButtonPos, to: outerClonePos },
          { from: innerButtonPos, to: innerClonePos },
        ],
        creaturePositions: [chipPos, fireballPos, outerClonePos, innerClonePos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.BombExplodes)).not.toBe(0);
    expect(session.state.engine.map.cells[outerButtonPos]?.top.id).toBe(msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.west));
    expect(session.state.engine.map.cells[outerButtonPos]?.bottom.id).toBe(MS_TILE.Button_Red);
    expect(session.state.engine.map.cells[innerButtonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.engine.map.cells[innerButtonPos]?.bottom.id).toBe(MS_TILE.Button_Red);
    expect(session.state.engine.map.cells[innerClonePos]?.top.id).toBe(msCreatureTile(MS_TILE.Block, MS_DIRECTION.south));
    expect(session.state.engine.map.cells[innerClonePos]?.bottom.id).toBe(MS_TILE.CloneMachine);
    expect(session.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("plays TimeLow when the timer hits the native 15-second warning boundary", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        timeLimitTicks: 1200,
        creaturePositions: [chipPos],
      }),
    );
    session.state.engine.timer.currentTime = 899;
    session.state.engine.timer.tick = 900;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.engine.timer.currentTime).toBe(900);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.TimeLow)).not.toBe(0);
  });

  it("fails with TimeOut only when the timer expires before Chip movement", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const exitPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[exitPos]!.top.id = MS_TILE.Exit;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        timeLimitTicks: 3,
        creaturePositions: [chipPos],
      }),
    );
    session.state.engine.timer.currentTime = 2;
    session.state.engine.timer.tick = 3;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(session.state.engine.status).toBe("failed");
    expect(session.state.internal.chipStatus).toBe("outoftime");
    expect(session.state.engine.soundEffects).toBe(1 << MS_SOUND.TimeOut);
    expect(session.state.internal.chipPos).toBe(chipPos);
    expect(session.state.engine.map.cells[exitPos]?.top.id).toBe(MS_TILE.Exit);
  });

  it("uses controller direction for paramecia moving off clone machines", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const ballPos = pos(5, 10);
    const cloneMachinePos = pos(10, 10);
    const cloneExitPos = pos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.west);
    cells[cloneMachinePos]!.top.id = msCreatureTile(MS_TILE.Paramecium, MS_DIRECTION.west);
    cells[cloneMachinePos]!.bottom.id = MS_TILE.CloneMachine;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos, cloneMachinePos],
      }),
    );

    session.state.internal.creatures.push({
      serial: session.state.internal.nextCreatureSerial,
      id: MS_TILE.Paramecium,
      dir: MS_DIRECTION.west,
      tdir: MS_DIRECTION.none,
      pos: cloneMachinePos,
      hidden: false,
      moving: 0,
      frame: 0,
      cloning: false,
      released: false,
      turning: false,
      hasMoved: false,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
    session.state.internal.nextCreatureSerial += 1;

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const paramecia = session.state.engine.actors
      .filter((actor) => actor.id === MS_TILE.Paramecium)
      .map((actor) => actor.position.pos)
      .sort((left, right) => left - right);

    expect(paramecia).toEqual([cloneExitPos, cloneMachinePos]);
  });

  it("does not move a trapped paramecium just because controller direction is set", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const ballPos = pos(10, 18);
    const trapButtonPos = pos(14, 19);
    const trapPos = pos(16, 21);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[trapButtonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = msCreatureTile(MS_TILE.Paramecium, MS_DIRECTION.north);
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: trapButtonPos, to: trapPos }],
        creaturePositions: [chipPos, ballPos, trapPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const paramecium = session.state.engine.actors.find(
      (actor) => actor.id === MS_TILE.Paramecium && actor.position.pos === trapPos,
    );

    expect(paramecium?.dir).toBe("north");
    expect(session.state.engine.map.cells[trapPos]?.bottom.id).toBe(MS_TILE.Beartrap);
    expect(session.state.engine.map.cells[pos(16, 22)]?.top.id).toBe(MS_TILE.Empty);
  });

  it("does not mark a creature released when it enters a closed wired beartrap", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const ballPos = pos(10, 8);
    const trapButtonPos = pos(14, 19);
    const trapPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[trapButtonPos]!.top.id = MS_TILE.Button_Brown;
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[trapPos]!.top.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: trapButtonPos, to: trapPos }],
        creaturePositions: [chipPos, ballPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const ball = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.Ball);
    expect(ball?.released).toBe(false);
    expect(ball?.pos).toBe(trapPos);
  });

  it("does not let Chip leave a closed wired beartrap immediately after entering it", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 8);
    const trapButtonPos = pos(14, 19);
    const trapPos = pos(10, 9);
    const trapExitPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[trapButtonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: trapButtonPos, to: trapPos }],
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.south);
    expect(session.state.internal.chipReleased).toBe(false);
    expect(session.state.engine.map.cells[trapPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south));

    session = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(session.state.internal.chipReleased).toBe(false);
    expect(session.state.engine.map.cells[trapPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south));
    expect(session.state.engine.map.cells[trapExitPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("renders Chip as Swimming_Chip while standing on water with flippers", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const waterPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[waterPos]!.top.id = MS_TILE.Water;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    session.state.engine.inventory.boots[3] = 1;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.north);

    expect(next.state.engine.map.cells[waterPos]?.bottom.id).toBe(MS_TILE.Water);
    expect(next.state.engine.map.cells[waterPos]?.top.id).toBe(msCreatureTile(MS_TILE.Swimming_Chip, MS_DIRECTION.north));
  });

  it("preserves bottom-layer water when Chip moves onto an empty-top water cell with flippers", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const waterPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[waterPos]!.top.id = MS_TILE.Empty;
    cells[waterPos]!.bottom.id = MS_TILE.Water;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );
    session.state.engine.inventory.boots[3] = 1;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.north);

    expect(next.state.engine.map.cells[waterPos]?.bottom.id).toBe(MS_TILE.Water);
    expect(next.state.engine.map.cells[waterPos]?.top.id).toBe(msCreatureTile(MS_TILE.Swimming_Chip, MS_DIRECTION.north));
  });

  it("collects a top-layer yellow key while leaving the bottom floor alone", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const keyPos = pos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[keyPos]!.top.id = MS_TILE.Key_Yellow;
    cells[keyPos]!.bottom.id = MS_TILE.Empty;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.west);

    expect(next.state.engine.inventory.keys[2]).toBe(1);
    expect(next.state.engine.soundEffects & (1 << MS_SOUND.ItemCollected)).not.toBe(0);
    expect(next.state.engine.map.cells[keyPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west));
    expect(next.state.engine.map.cells[keyPos]?.bottom.id).toBe(MS_TILE.Empty);
  });

  it("preserves Chip and water when a creature dies moving into Chip's water tile", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const ballPos = pos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[chipPos]!.bottom.id = MS_TILE.Water;
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos],
      }),
    );
    session.state.engine.inventory.boots[3] = 1;

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.chipStatus).toBe("okay");
    expect(msCreatureId(session.state.engine.map.cells[chipPos]?.top.id ?? MS_TILE.Nothing)).toBe(MS_TILE.Chip);
    expect(msCreatureDir(session.state.engine.map.cells[chipPos]?.top.id ?? MS_TILE.Nothing)).toBe(MS_DIRECTION.north);
    expect(session.state.engine.map.cells[chipPos]?.bottom.id).toBe(MS_TILE.Water);
    expect(session.state.engine.actors.filter((actor) => actor.id === MS_TILE.Ball)).toHaveLength(0);
  });

  it("preserves the underlying water when a creature dies on a bomb sitting over water", () => {
    const cells = createEmptyCells();
    const tankPos = pos(9, 18);
    const bombPos = pos(9, 19);
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.south);
    cells[bombPos]!.top.id = MS_TILE.Bomb;
    cells[bombPos]!.bottom.id = MS_TILE.Water;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [tankPos],
      }),
    );

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
    expect(session.state.engine.map.cells[bombPos]?.bottom.id).toBe(MS_TILE.Water);
    expect(session.state.engine.actors.filter((actor) => actor.id === MS_TILE.Tank)).toHaveLength(0);
  });

  it("keeps a hidden dead creature in debug traces at its original position after a water collision", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const ballPos = pos(9, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[chipPos]!.bottom.id = MS_TILE.Water;
    cells[ballPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, ballPos],
      }),
      replay,
      5,
    );

    const hiddenBallPhase = trace.steps
      .flatMap((step) =>
        step.phases.map((phase) => ({
          phase,
          ball: phase.activeCreatures.find((actor) => actor.id === MS_TILE.Ball && actor.hidden),
        })),
      )
      .find((entry) => entry.ball);

    expect(hiddenBallPhase?.phase.chipStatus).toBe("okay");
    expect(hiddenBallPhase?.ball?.position.pos).toBe(ballPos);
    expect(hiddenBallPhase?.ball?.dir).toBe("east");
  });

  it("keeps Swimming_Chip visible in exported replay traces", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const flippersPos = pos(11, 10);
    const waterPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[flippersPos]!.top.id = MS_TILE.Boots_Water;
    cells[waterPos]!.top.id = MS_TILE.Water;

    const level = createLevel({
      cells,
      creaturePositions: [chipPos],
    });
    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [
        { when: 0, dir: MS_DIRECTION.east },
        { when: 4, dir: MS_DIRECTION.east },
      ],
    };

    const trace = runMsReplayTrace(createRequest(), level, replay, 8);

    expect(trace.steps[4]?.chip?.id).toBe(MS_TILE.Swimming_Chip);
    expect(trace.steps[4]?.chip?.position.pos).toBe(12 + 10 * MS_GRID_WIDTH);
  });

  it("keeps debug runtime Chip actors on the base Chip id while standing on water", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const flippersPos = pos(11, 10);
    const waterPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[flippersPos]!.top.id = MS_TILE.Boots_Water;
    cells[waterPos]!.top.id = MS_TILE.Water;

    const level = createLevel({
      cells,
      creaturePositions: [chipPos],
    });
    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [
        { when: 0, dir: MS_DIRECTION.east },
        { when: 4, dir: MS_DIRECTION.east },
      ],
    };

    const trace = runMsReplayTraceDebug(createRequest(), level, replay, 8);
    const debugPhase = trace.steps[4]?.phases.find((phase) => phase.phase === "post-chip-movement");

    expect(debugPhase?.activeCreatures[0]?.id).toBe(MS_TILE.Chip);
  });

  it("does not drown Chip when moving onto an empty-top water-bottom cell", () => {
    const cells = createEmptyCells();
    const startPos = pos(25, 26);
    const waterPos = pos(25, 25);
    cells[startPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[waterPos]!.top.id = MS_TILE.Empty;
    cells[waterPos]!.bottom.id = MS_TILE.Water;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [startPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.north);

    expect(session.state.internal.chipStatus).toBe("okay");
    expect(session.state.internal.chipPos).toBe(waterPos);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.WaterSplash)).toBe(0);
    expect(session.state.engine.map.cells[waterPos]?.bottom.id).toBe(MS_TILE.Water);
    expect(session.state.engine.map.cells[waterPos]?.top.id).toBe(msCreatureTile(MS_TILE.Swimming_Chip, MS_DIRECTION.north));
  });

  it("tracks view from internal chipPos instead of the first chip-like actor on the board", () => {
    const cells = createEmptyCells();
    const straySwimmingChipPos = pos(5, 5);
    const realChipPos = pos(23, 26);
    cells[straySwimmingChipPos]!.top.id = msCreatureTile(MS_TILE.Swimming_Chip, MS_DIRECTION.east);
    cells[realChipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [realChipPos],
      }),
    );

    expect(session.state.internal.chipPos).toBe(realChipPos);
    expect(session.state.engine.chip?.position.pos).toBe(straySwimmingChipPos);
    expect(session.state.engine.view).toEqual({
      x: (realChipPos % MS_GRID_WIDTH) * 8,
      y: Math.floor(realChipPos / MS_GRID_WIDTH) * 8,
    });
  });

  it("shows hint status from internal chipPos instead of the first chip-like actor on the board", () => {
    const cells = createEmptyCells();
    const straySwimmingChipPos = pos(5, 5);
    const realChipPos = pos(23, 26);
    cells[straySwimmingChipPos]!.top.id = msCreatureTile(MS_TILE.Swimming_Chip, MS_DIRECTION.east);
    cells[realChipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[realChipPos]!.bottom.id = MS_TILE.HintButton;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [realChipPos],
      }),
    );

    expect(session.state.internal.chipPos).toBe(realChipPos);
    expect(session.state.engine.chip?.position.pos).toBe(straySwimmingChipPos);
    expect(session.state.engine.statusFlags & MS_STATUS_FLAG.ShowHint).not.toBe(0);
  });

  it("does not show hint status when only a stray chip-like actor is standing on the hint button", () => {
    const cells = createEmptyCells();
    const straySwimmingChipPos = pos(5, 5);
    const realChipPos = pos(23, 26);
    cells[straySwimmingChipPos]!.top.id = msCreatureTile(MS_TILE.Swimming_Chip, MS_DIRECTION.east);
    cells[straySwimmingChipPos]!.bottom.id = MS_TILE.HintButton;
    cells[realChipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [realChipPos],
      }),
    );

    expect(session.state.internal.chipPos).toBe(realChipPos);
    expect(session.state.engine.chip?.position.pos).toBe(straySwimmingChipPos);
    expect(session.state.engine.statusFlags & MS_STATUS_FLAG.ShowHint).toBe(0);
  });

  it("clears a pending goal when Chip already moved and receives another input", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session.state.internal.goalPos = pos(6, 6);
    session.state.internal.chipHasMoved = true;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.north);

    expect(session.state.internal.goalPos).toBe(-1);
    expect(session.state.internal.chipPos).toBe(chipPos);
  });

  it("clears a pending goal when a blocked Chip move fails", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const wallPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[wallPos]!.top.id = MS_TILE.Wall;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.goalPos = pos(10, 5);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.north);

    expect(session.state.internal.goalPos).toBe(-1);
    expect(session.state.internal.chipPos).toBe(chipPos);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.CantMove)).not.toBe(0);
  });

  it("keeps pushed blocks moving on ice until they hit a bomb", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(10, 11);
    const icePos = pos(10, 12);
    const bombPos = pos(10, 13);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[icePos]!.top.id = MS_TILE.Ice;
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.south);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.BombExplodes)).not.toBe(0);
    expect(session.state.engine.map.cells[icePos]?.top.id).toBe(MS_TILE.Ice);
    expect(session.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("releases a trapped creature when a pushed block lands on a brown button", () => {
    const cells = createEmptyCells();
    const chipPos = pos(14, 15);
    const blockPos = pos(13, 15);
    const buttonPos = pos(12, 15);
    const trapPos = pos(12, 13);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[buttonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.south);
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: buttonPos, to: trapPos }],
        creaturePositions: [chipPos, trapPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.west);

    const trappedCreature = session.state.internal.creatures.find((creature) => creature.pos === trapPos);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(session.state.engine.map.cells[buttonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(trappedCreature?.released).toBe(true);
  });

  it("materializes and releases a trapped static block during initialization", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const buttonPos = pos(12, 10);
    const trapPos = pos(12, 8);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[buttonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = MS_TILE.Block_Static;
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;

    const state = initializeMsGameState(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: buttonPos, to: trapPos }],
        creaturePositions: [chipPos],
      }),
    );

    expect(state.internal.blocks).toHaveLength(1);
    expect(state.internal.blocks[0]).toMatchObject({
      pos: trapPos,
      released: true,
      hidden: false,
    });
  });

  it("materializes and releases a trapped static block when a brown button is pressed", () => {
    const cells = createEmptyCells();
    const chipPos = pos(14, 15);
    const pushedBlockPos = pos(13, 15);
    const buttonPos = pos(12, 15);
    const trapPos = pos(12, 13);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[pushedBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[buttonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = MS_TILE.Block_Static;
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: buttonPos, to: trapPos }],
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.west);

    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(session.state.engine.map.cells[buttonPos]?.top.id).toBe(MS_TILE.Block_Static);
    const trappedBlock = session.state.internal.blocks.find(
      (block) => block.pos === trapPos && !block.hidden,
    );
    expect(trappedBlock).toMatchObject({
      pos: trapPos,
      released: true,
      hidden: false,
    });
  });

  it("clears controllerDir when a has-moved creature stalls before a released teeth on a beartrap", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const fireballPos = pos(5, 5);
    const stalledBallPos = pos(6, 5);
    const trapPos = pos(14, 22);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[fireballPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.east);
    cells[stalledBallPos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.south);
    cells[trapPos]!.top.id = msCreatureTile(MS_TILE.Teeth, MS_DIRECTION.east);
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, fireballPos, stalledBallPos, trapPos],
      }),
    );

    const stalledBall = session.state.internal.creatures.find((creature) => creature.pos === stalledBallPos);
    const trappedTeeth = session.state.internal.creatures.find((creature) => creature.pos === trapPos);
    expect(stalledBall).toBeDefined();
    expect(trappedTeeth).toBeDefined();
    stalledBall!.hasMoved = true;
    trappedTeeth!.released = true;

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const teethAfter = session.state.internal.creatures.find((creature) => creature.id === MS_TILE.Teeth);
    expect(teethAfter).toMatchObject({
      pos: trapPos,
      dir: MS_DIRECTION.east,
      tdir: MS_DIRECTION.none,
      released: true,
    });
  });

  it("keeps a bottom-layer popup wall under Chip when he steps onto it", () => {
    const cells = createEmptyCells();
    const chipPos = pos(14, 12);
    const popupWallPos = pos(14, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[popupWallPos]!.top.id = MS_TILE.Empty;
    cells[popupWallPos]!.bottom.id = MS_TILE.PopupWall;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.north);

    expect(session.state.engine.chip?.position.pos).toBe(popupWallPos);
    expect(session.state.engine.map.cells[popupWallPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north));
    expect(session.state.engine.map.cells[popupWallPos]?.bottom.id).toBe(MS_TILE.PopupWall);
  });

  it("does not arm immediate ice floor movement when Chip collects a top-layer chip sitting on ice", () => {
    const cells = createEmptyCells();
    const chipPos = pos(11, 15);
    const targetPos = pos(12, 15);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[chipPos]!.bottom.id = MS_TILE.Ice;
    cells[targetPos]!.top.id = MS_TILE.ICChip;
    cells[targetPos]!.bottom.id = MS_TILE.Ice;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        chipsNeeded: 42,
        creaturePositions: [chipPos],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(session.state.engine.chip?.position.pos).toBe(targetPos);
    expect(session.state.engine.inventory.chipsNeeded).toBe(41);
    expect(session.state.internal.floorMovement).toBe("none");
    expect(session.state.internal.floorMovementDir).toBe(MS_DIRECTION.none);
  });

  it("plays ButtonPushed when a sliding block lands on a brown button during block floor movement", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(14, 13);
    const buttonPos = pos(13, 13);
    const trapPos = pos(21, 18);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Slide_West;
    cells[buttonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.north);
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: buttonPos, to: trapPos }],
        creaturePositions: [chipPos, trapPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.west,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.west,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    const trappedCreature = session.state.internal.creatures.find((creature) => creature.pos === trapPos);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(session.state.engine.map.cells[buttonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(trappedCreature?.released).toBe(true);
  });

  it("does not move a slipping block off the map", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(0, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Slide_West;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.west,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.west,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(
      session.state.internal.blocks.every(
        (block) => block.pos >= 0 && block.pos < MS_GRID_WIDTH * MS_GRID_HEIGHT,
      ),
    ).toBe(true);
    expect(session.state.engine.soundEffects).toBe(0);
  });

  it("clears block floor movement after it moves from ice onto a brown button", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(7, 15);
    const buttonPos = pos(7, 16);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Ice;
    cells[buttonPos]!.top.id = MS_TILE.Button_Brown;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.south,
      hidden: false,
      released: false,
      floorMovement: "ice",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.map.cells[buttonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.internal.blocks).toHaveLength(1);
    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: buttonPos,
      dir: MS_DIRECTION.south,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
  });

  it("keeps the slide bit after a slipping block takes its next ice move", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(7, 15);
    const firstIcePos = pos(8, 15);
    const secondIcePos = pos(9, 15);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Slide_East;
    cells[firstIcePos]!.top.id = MS_TILE.Ice;
    cells[secondIcePos]!.top.id = MS_TILE.Ice;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.east,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });

    for (let tick = 0; tick < 5; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.map.cells[secondIcePos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: secondIcePos,
      dir: MS_DIRECTION.east,
      floorMovement: "ice",
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
    });
  });

  it("keeps a slipping block on the slip list when a closed beartrap blocks its next move", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const buttonPos = pos(6, 16);
    const trapPos = pos(7, 16);
    const nextPos = pos(7, 17);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[buttonPos]!.top.id = MS_TILE.Button_Brown;
    cells[trapPos]!.top.id = MS_TILE.Block_Static;
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;
    cells[nextPos]!.top.id = MS_TILE.Ice;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: buttonPos, to: trapPos }],
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: trapPos,
      dir: MS_DIRECTION.south,
      hidden: false,
      released: false,
      floorMovement: "ice",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pos: trapPos,
          dir: MS_DIRECTION.south,
          floorMovement: "slide",
          floorMovementDir: MS_DIRECTION.south,
          sliding: false,
        }),
      ]),
    );
    expect(
      session.state.internal.blocks.find(
        (block) =>
          block.pos === trapPos &&
          block.dir === MS_DIRECTION.south &&
          block.floorMovement === "slide" &&
          block.floorMovementDir === MS_DIRECTION.south,
      ),
    ).toMatchObject({
      pos: trapPos,
      dir: MS_DIRECTION.south,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
    });
  });

  it("does not arm floor movement when Chip pushes a block onto an open beartrap", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(10, 11);
    const trapPos = pos(10, 12);
    const buttonPos = pos(9, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[trapPos]!.top.id = MS_TILE.Beartrap;
    cells[buttonPos]!.top.id = MS_TILE.Wall;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        traps: [{ from: buttonPos, to: trapPos }],
        creaturePositions: [chipPos],
      }),
    );

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(next.state.internal.blocks).toHaveLength(1);
    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: trapPos,
      dir: MS_DIRECTION.south,
      released: true,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
  });

  it("does not let Chip push a block out of a closed beartrap", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const trapPos = pos(10, 11);
    const exitPos = pos(10, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[trapPos]!.top.id = MS_TILE.Block_Static;
    cells[trapPos]!.bottom.id = MS_TILE.Beartrap;
    cells[exitPos]!.top.id = MS_TILE.Empty;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(next.state.engine.soundEffects & (1 << MS_SOUND.CantMove)).not.toBe(0);
    expect(next.state.engine.map.cells[chipPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south));
    expect(next.state.engine.map.cells[trapPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(next.state.engine.map.cells[trapPos]?.bottom.id).toBe(MS_TILE.Beartrap);
    expect(next.state.internal.blocks).toHaveLength(1);
    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: trapPos,
      dir: MS_DIRECTION.none,
      released: false,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
  });

  it("keeps a pushed block active after it lands on normal floor", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const landingPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[landingPos]!.top.id = MS_TILE.Empty;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.engine.map.cells[landingPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(next.state.internal.blocks).toHaveLength(1);
    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: landingPos,
      dir: MS_DIRECTION.east,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
    });
  });

  it("sets controllerDir when a pushed block lands on a forcing floor", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const landingPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[landingPos]!.top.id = MS_TILE.Slide_South;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.internal.blocks).toHaveLength(1);
    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: landingPos,
      dir: MS_DIRECTION.east,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
    });
    expect(next.state.internal.controllerDir).toBe(MS_DIRECTION.south);
  });

  it("moves a newly pushed block on the next even tick instead of inventing an extra slide delay", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const slidePos = pos(12, 10);
    const nextSlidePos = pos(12, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[slidePos]!.top.id = MS_TILE.Slide_South;
    cells[nextSlidePos]!.top.id = MS_TILE.Slide_South;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );

    session = advanceMsInteractiveSession(session, MS_DIRECTION.east);
    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: slidePos,
      dir: MS_DIRECTION.east,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
      slideDelayPending: true,
    });

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: slidePos,
      dir: MS_DIRECTION.east,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
      slideDelayPending: true,
    });

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: nextSlidePos,
      dir: MS_DIRECTION.south,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
    });
  });

  it("restarts block floor movement after an ice retry so slide-random consumes a second RNG advance", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(24, 30);
    const retryPos = pos(24, 29);
    const blockedPos = pos(24, 31);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Ice;
    cells[retryPos]!.top.id = MS_TILE.Slide_Random;
    cells[blockedPos]!.top.id = MS_TILE.Wall;

    const session = createMsInteractiveSession(
      { ...createRequest(), randomSeed: 1980468217 },
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.south,
      hidden: false,
      released: false,
      floorMovement: "ice",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });
    session.state.internal.nextSlipOrder = 1;
    session.state.engine.timer.tick = 241;
    session.state.engine.timer.currentTime = 241;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: retryPos,
      dir: MS_DIRECTION.north,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
      slideDelayPending: false,
    });
    expect(next.state.internal.randomMainValue).toBe(1985890719n);
  });

  it("restarts chip floor movement after an ice retry so slide-random consumes a second RNG advance", () => {
    const cells = createEmptyCells();
    const chipPos = pos(24, 30);
    const retryPos = pos(24, 29);
    const blockedPos = pos(24, 31);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[chipPos]!.bottom.id = MS_TILE.Ice;
    cells[retryPos]!.top.id = MS_TILE.Slide_Random;
    cells[blockedPos]!.top.id = MS_TILE.Wall;

    const session = createMsInteractiveSession(
      { ...createRequest(), randomSeed: 1980468217 },
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.floorMovement = "ice";
    session.state.internal.floorMovementDir = MS_DIRECTION.south;
    session.state.internal.chipDir = MS_DIRECTION.south;
    session.state.engine.timer.tick = 241;
    session.state.engine.timer.currentTime = 241;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(next.state.internal.chipPos).toBe(retryPos);
    expect(next.state.internal.chipDir).toBe(MS_DIRECTION.east);
    expect(next.state.internal.floorMovement).toBe("slide");
    expect(next.state.internal.floorMovementDir).toBe(MS_DIRECTION.east);
    expect(next.state.internal.randomMainValue).toBe(1985890719n);
  });

  it("keeps a slipping tank facing east when it returns onto a blue button", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const tankPos = pos(10, 10);
    const landingPos = pos(11, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[tankPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.west);
    cells[tankPos]!.bottom.id = MS_TILE.Slide_East;
    cells[landingPos]!.top.id = MS_TILE.Button_Blue;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, tankPos],
      }),
    );

    const tank = session.state.internal.creatures.find((candidate) => candidate.pos === tankPos);
    expect(tank).toBeDefined();
    tank!.floorMovement = "slide";
    tank!.floorMovementDir = MS_DIRECTION.east;
    tank!.sliding = false;
    session.state.internal.creatureSlipList = [{ serial: tank!.serial, dir: MS_DIRECTION.east, slipOrder: 0 }];
    session.state.internal.nextSlipOrder = 1;
    session.state.engine.timer.tick = 315;
    session.state.engine.timer.currentTime = 315;

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    const movedTank = next.state.internal.creatures.find((candidate) => candidate.serial === tank!.serial);

    expect(movedTank).toMatchObject({
      pos: landingPos,
      dir: MS_DIRECTION.east,
      turning: true,
      hasMoved: true,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
  });

  it("does not let slideDelayPending suppress a pushed block's next even-tick floor move behind earlier slip entries", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const creaturePos = pos(10, 10);
    const creatureNextPos = pos(11, 10);
    const blockPos = pos(5, 5);
    const blockNextPos = pos(5, 6);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[creaturePos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    cells[creaturePos]!.bottom.id = MS_TILE.Slide_East;
    cells[creatureNextPos]!.top.id = MS_TILE.Slide_East;
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Slide_South;
    cells[blockNextPos]!.top.id = MS_TILE.Slide_South;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, creaturePos],
      }),
    );

    const creature = session.state.internal.creatures.find((candidate) => candidate.pos === creaturePos);
    expect(creature).toBeDefined();
    creature!.floorMovement = "slide";
    creature!.floorMovementDir = MS_DIRECTION.east;
    creature!.sliding = false;
    session.state.internal.creatureSlipList = [{ serial: creature!.serial, dir: MS_DIRECTION.east, slipOrder: 0 }];
    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.east,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
      slideDelayPending: true,
      slipOrder: 1,
    });
    session.state.internal.nextSlipOrder = 2;

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: blockNextPos,
      dir: MS_DIRECTION.south,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
    });
  });

  it("does not requeue a successfully moving sliding block behind the next slipping block", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const firstBlockPos = pos(5, 5);
    const secondBlockPos = pos(7, 5);
    const firstNextPos = pos(5, 6);
    const secondNextPos = pos(7, 6);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[firstBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[firstBlockPos]!.bottom.id = MS_TILE.Slide_South;
    cells[secondBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[secondBlockPos]!.bottom.id = MS_TILE.Slide_South;
    cells[firstNextPos]!.top.id = MS_TILE.Slide_South;
    cells[secondNextPos]!.top.id = MS_TILE.Slide_South;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: firstBlockPos,
      dir: MS_DIRECTION.south,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });
    session.state.internal.blocks.push({
      pos: secondBlockPos,
      dir: MS_DIRECTION.south,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.south,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 1,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.internal.blocks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pos: firstNextPos, dir: MS_DIRECTION.south, floorMovement: "slide", sliding: true }),
        expect.objectContaining({ pos: secondNextPos, dir: MS_DIRECTION.south, floorMovement: "slide", sliding: true }),
      ]),
    );
  });

  it("moves an already tracked block instead of duplicating it when Chip pushes it again", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const landingPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[landingPos]!.top.id = MS_TILE.Empty;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );
    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.east,
      hidden: false,
      released: false,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
      slideDelayPending: false,
      slipOrder: -1,
    });

    const next = advanceMsInteractiveSession(session, MS_DIRECTION.east);

    expect(next.state.internal.blocks).toHaveLength(1);
    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: landingPos,
      dir: MS_DIRECTION.east,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
      sliding: false,
    });
  });

  it("teleports a sliding block during block floor movement instead of leaving it on the entry teleport", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(14, 13);
    const entryTeleportPos = pos(15, 13);
    const destinationTeleportPos = pos(5, 5);
    const exitPos = pos(6, 5);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Slide_East;
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[destinationTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[exitPos]!.top.id = MS_TILE.Empty;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
      }),
    );

    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.east,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
      slideDelayPending: false,
      slipOrder: 0,
    });

    for (let tick = 0; tick < 3; tick += 1) {
      session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    }

    expect(session.state.engine.map.cells[entryTeleportPos]?.top.id).toBe(MS_TILE.Teleport);
    expect(session.state.engine.map.cells[destinationTeleportPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.internal.blocks).toHaveLength(1);
    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: destinationTeleportPos,
      dir: MS_DIRECTION.east,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.east,
      sliding: true,
    });
  });

  it("keeps a blocked creature on teleport floor movement with its original slip direction", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const creaturePos = pos(10, 10);
    const blockedExitPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[creaturePos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.west);
    cells[creaturePos]!.bottom.id = MS_TILE.Teleport;
    cells[blockedExitPos]!.top.id = MS_TILE.Wall;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [creaturePos],
      }),
    );
    const creature = session.state.internal.creatures[0]!;
    creature.dir = MS_DIRECTION.west;
    creature.floorMovement = "teleport";
    creature.floorMovementDir = MS_DIRECTION.south;
    creature.sliding = false;
    session.state.internal.creatureSlipList = [{ serial: creature.serial, dir: MS_DIRECTION.south, slipOrder: 0 }];
    session.state.internal.nextSlipOrder = 1;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.internal.creatures[0]).toMatchObject({
      pos: creaturePos,
      dir: MS_DIRECTION.west,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
    });
    expect(session.state.internal.creatureSlipList).toEqual([{ serial: creature.serial, dir: MS_DIRECTION.south, slipOrder: 0 }]);
  });

  it("keeps a turning tank rendered in its turning pose after creature teleport floor movement", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const sourcePos = pos(10, 10);
    const entryTeleportPos = pos(10, 9);
    const destinationTeleportPos = pos(5, 5);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[sourcePos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.west);
    cells[sourcePos]!.bottom.id = MS_TILE.Slide_North;
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[destinationTeleportPos]!.top.id = MS_TILE.Teleport;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [sourcePos],
      }),
    );
    const creature = session.state.internal.creatures[0]!;
    creature.dir = MS_DIRECTION.south;
    creature.turning = true;
    creature.hasMoved = true;
    creature.floorMovement = "slide";
    creature.floorMovementDir = MS_DIRECTION.north;
    creature.sliding = true;
    session.state.internal.creatureSlipList = [{ serial: creature.serial, dir: MS_DIRECTION.north, slipOrder: 0 }];
    session.state.internal.nextSlipOrder = 1;
    session.state.engine.timer.currentTime = 1;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.internal.creatures[0]).toMatchObject({
      pos: destinationTeleportPos,
      dir: MS_DIRECTION.north,
      turning: true,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.north,
    });
    expect(session.state.engine.map.cells[destinationTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east));
    expect(session.state.engine.map.cells[destinationTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
  });

  it("does not choose a creature teleport destination whose exit points into its still-occupied origin", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const creaturePos = pos(26, 3);
    const entryTeleportPos = pos(25, 3);
    const wrappedTeleportPos = pos(27, 3);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[creaturePos]!.top.id = msCreatureTile(MS_TILE.Paramecium, MS_DIRECTION.west);
    cells[creaturePos]!.bottom.id = MS_TILE.Slide_West;
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[wrappedTeleportPos]!.top.id = MS_TILE.Teleport;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [creaturePos],
      }),
    );
    const creature = session.state.internal.creatures[0]!;
    creature.dir = MS_DIRECTION.west;
    creature.floorMovement = "slide";
    creature.floorMovementDir = MS_DIRECTION.west;
    creature.sliding = true;
    session.state.internal.creatureSlipList = [{ serial: creature.serial, dir: MS_DIRECTION.west, slipOrder: 0 }];
    session.state.internal.nextSlipOrder = 1;
    session.state.engine.timer.currentTime = 1;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.internal.creatures[0]).toMatchObject({
      pos: entryTeleportPos,
      dir: MS_DIRECTION.west,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.west,
      sliding: true,
    });
    expect(session.state.engine.map.cells[entryTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Paramecium, MS_DIRECTION.west));
    expect(session.state.engine.map.cells[entryTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(session.state.engine.map.cells[wrappedTeleportPos]?.top.id).toBe(MS_TILE.Teleport);
  });

  it("allows a Chip teleport destination whose exit pushes a block into Chip's just-vacated origin tile", () => {
    const cells = createEmptyCells();
    const chipPos = pos(13, 9);
    const entryTeleportPos = pos(14, 9);
    const preferredExitTeleportPos = pos(11, 9);
    const blockingBlockPos = pos(12, 9);
    const fallbackExitTeleportPos = pos(10, 9);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[preferredExitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[blockingBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[fallbackExitTeleportPos]!.top.id = MS_TILE.Teleport;

    const next = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          creaturePositions: [chipPos, blockingBlockPos],
        }),
      ),
      MS_DIRECTION.east,
    );

    expect(next.state.internal.chipPos).toBe(preferredExitTeleportPos);
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[chipPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(next.state.engine.map.cells[fallbackExitTeleportPos]?.top.id).toBe(MS_TILE.Teleport);
  });

  it("allows Chip to choose a teleport exit whose first step lands on the just-vacated origin tile", () => {
    const cells = createEmptyCells();
    const chipPos = pos(6, 19);
    const entryTeleportPos = pos(7, 19);
    const preferredExitTeleportPos = pos(5, 19);
    const fallbackExitTeleportPos = pos(4, 19);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[chipPos]!.top.state = 0;
    cells[chipPos]!.bottom.id = MS_TILE.Empty;
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[preferredExitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[fallbackExitTeleportPos]!.top.id = MS_TILE.Teleport;

    const next = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          creaturePositions: [chipPos],
        }),
      ),
      MS_DIRECTION.east,
    );

    expect(next.state.internal.chipPos).toBe(preferredExitTeleportPos);
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[fallbackExitTeleportPos]?.top.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[chipPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("allows a Chip teleport exit whose first step is occupied by a creature", () => {
    const cells = createEmptyCells();
    const chipPos = pos(20, 10);
    const entryTeleportPos = pos(19, 10);
    const preferredExitTeleportPos = pos(17, 10);
    const occupiedExitStepPos = pos(18, 10);
    const laterExitTeleportPos = pos(16, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west);
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[preferredExitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[occupiedExitStepPos]!.top.id = msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.south);
    cells[laterExitTeleportPos]!.top.id = MS_TILE.Teleport;

    const next = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          creaturePositions: [chipPos, occupiedExitStepPos],
        }),
      ),
      MS_DIRECTION.west,
    );

    expect(next.state.internal.chipPos).toBe(preferredExitTeleportPos);
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.west));
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[occupiedExitStepPos]?.top.id).toBe(msCreatureTile(MS_TILE.Fireball, MS_DIRECTION.south));
    expect(next.state.engine.map.cells[laterExitTeleportPos]?.top.id).toBe(MS_TILE.Teleport);
  });

  it("keeps a teleported pushed block from exiting through its just-vacated source cell", () => {
    const cells = createEmptyCells();
    const chipPos = pos(13, 13);
    const entryTeleportPos = pos(13, 12);
    const preferredExitTeleportPos = pos(11, 12);
    const pushedBlockPos = pos(11, 11);
    const pushedBlockEntryTeleportPos = pos(11, 10);
    const blockedBlockExitTeleportPos = pos(13, 12);
    const fallbackBlockExitTeleportPos = pos(13, 10);
    const blockingBlockExitStepPos = pos(13, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north);
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[preferredExitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[pushedBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[pushedBlockEntryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[blockedBlockExitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[fallbackBlockExitTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[blockingBlockExitStepPos]!.top.id = MS_TILE.Block_Static;

    const next = advanceMsInteractiveSession(
      createMsInteractiveSession(
        createRequest(),
        createLevel({
          cells,
          creaturePositions: [chipPos],
        }),
      ),
      MS_DIRECTION.north,
    );

    expect(next.state.internal.chipPos).toBe(preferredExitTeleportPos);
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.north));
    expect(next.state.engine.map.cells[preferredExitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[fallbackBlockExitTeleportPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(next.state.engine.map.cells[fallbackBlockExitTeleportPos]?.bottom.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[pushedBlockPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("preserves a clone-machine source block when block floor movement dies on a bomb", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(5, 5);
    const bombPos = pos(5, 6);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.CloneMachine;
    cells[bombPos]!.top.id = MS_TILE.Bomb;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, blockPos],
      }),
    );

    session.state.internal.blocks[0]!.floorMovement = "slide";
    session.state.internal.blocks[0]!.floorMovementDir = MS_DIRECTION.south;
    session.state.internal.blocks[0]!.sliding = false;
    session.state.internal.blocks[0]!.slipOrder = 0;
    session.state.internal.nextSlipOrder = 1;
    session.state.engine.timer.currentTime = 1;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: blockPos,
      dir: MS_DIRECTION.south,
      hidden: true,
      floorMovement: "none",
      floorMovementDir: MS_DIRECTION.none,
    });
    expect(session.state.engine.map.cells[blockPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.engine.map.cells[blockPos]?.bottom.id).toBe(MS_TILE.CloneMachine);
    expect(session.state.engine.map.cells[bombPos]?.top.id).toBe(MS_TILE.Empty);
    expect(session.state.engine.soundEffects & (1 << MS_SOUND.BombExplodes)).not.toBe(0);
  });

  it("keeps a blocked tracked block on teleport floor movement with its original slip direction", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(10, 10);
    const blockedExitPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Teleport;
    cells[blockedExitPos]!.top.id = MS_TILE.Wall;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );
    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.west,
      hidden: false,
      released: false,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
      slideDelayPending: false,
      slipOrder: 0,
    });

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);
    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.internal.blocks[0]).toMatchObject({
      pos: blockPos,
      dir: MS_DIRECTION.west,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.south,
      sliding: false,
    });
  });

  it("teleports a pushed block immediately instead of leaving it on the entry teleport", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(10, 11);
    const entryTeleportPos = pos(10, 12);
    const destinationTeleportPos = pos(5, 5);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[entryTeleportPos]!.top.id = MS_TILE.Teleport;
    cells[destinationTeleportPos]!.top.id = MS_TILE.Teleport;

    const session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );
    const next = advanceMsInteractiveSession(session, MS_DIRECTION.south);

    expect(next.state.engine.map.cells[entryTeleportPos]?.top.id).toBe(MS_TILE.Teleport);
    expect(next.state.engine.map.cells[destinationTeleportPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(next.state.internal.blocks).toHaveLength(1);
    expect(next.state.internal.blocks[0]).toMatchObject({
      pos: destinationTeleportPos,
      dir: MS_DIRECTION.south,
      floorMovement: "teleport",
      floorMovementDir: MS_DIRECTION.south,
    });
  });

  it("does not let block floor movement wrap east off the right edge", () => {
    const cells = createEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(31, 2);
    const wrappedPos = pos(0, 3);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Slide_East;

    let session = createMsInteractiveSession(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
    );
    session.state.internal.blocks.push({
      pos: blockPos,
      dir: MS_DIRECTION.south,
      hidden: false,
      released: false,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.east,
      sliding: false,
      slideDelayPending: false,
      slipOrder: 0,
    });
    session.state.engine.timer.currentTime = 1;

    session = advanceMsInteractiveSession(session, MS_DIRECTION.none);

    expect(session.state.internal.blocks[0]?.pos).toBe(blockPos);
    expect(session.state.engine.map.cells[blockPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(session.state.engine.map.cells[wrappedPos]?.top.id).toBe(MS_TILE.Empty);
  });

  it("resolves a Chip-pushed red button block immediately during post-chip-movement", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const redButtonPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, blockPos],
      }),
      replay,
      1,
    );

    const postChipMovement = trace.steps[0]?.phases.find((phase) => phase.phase === "post-chip-movement");
    const redButtonCell = postChipMovement?.map.cells[redButtonPos];

    expect(postChipMovement).toBeDefined();
    expect(redButtonCell?.top.id).toBe(MS_TILE.Block_Static);
    expect(redButtonCell?.bottom.id).toBe(MS_TILE.Button_Red);
    expect(redButtonCell?.bottom.state).toBe(0);
    expect((postChipMovement?.soundEffects ?? 0) & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
  });

  it("clears deferred buttons after a failed Chip push that moves a block", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const pushedBlockPos = pos(11, 10);
    const redButtonPos = pos(12, 10);
    const cloneSourcePos = pos(20, 20);
    const cloneExitPos = pos(21, 20);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[pushedBlockPos]!.top.id = MS_TILE.Block_Static;
    cells[pushedBlockPos]!.bottom.id = MS_TILE.CloneMachine;
    cells[redButtonPos]!.top.id = MS_TILE.Button_Red;
    cells[cloneSourcePos]!.top.id = msCreatureTile(MS_TILE.Glider, MS_DIRECTION.east);
    cells[cloneSourcePos]!.bottom.id = MS_TILE.CloneMachine;
    cells[cloneExitPos]!.top.id = MS_TILE.Empty;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos],
        cloners: [{ from: redButtonPos, to: cloneSourcePos }],
      }),
      replay,
      1,
    );

    const postChipMovement = trace.steps[0]?.phases.find((phase) => phase.phase === "post-chip-movement");
    const postCloneRelease = trace.steps[0]?.phases.find((phase) => phase.phase === "post-clone-release");

    expect(postChipMovement).toBeDefined();
    expect(postChipMovement?.map.cells[redButtonPos]?.top.id).toBe(MS_TILE.Block_Static);
    expect(postChipMovement?.map.cells[redButtonPos]?.bottom.id).toBe(MS_TILE.Button_Red);
    expect(postChipMovement?.map.cells[redButtonPos]?.bottom.state).toBe(0);
    expect(postChipMovement?.boardFlags).toEqual([]);
    expect((postChipMovement?.soundEffects ?? 0) & (1 << MS_SOUND.CantMove)).not.toBe(0);
    expect((postChipMovement?.soundEffects ?? 0) & (1 << MS_SOUND.ButtonPushed)).not.toBe(0);
    expect(postCloneRelease?.map.cells[cloneSourcePos]?.bottom.state).toBe(0);
    expect(postCloneRelease?.activeCreatures?.some((creature) => creature.position.pos === cloneSourcePos)).toBe(false);
  });

  it("keeps a clone-machine block facing none after a failed Chip push", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const blockPos = pos(11, 10);
    const wallPos = pos(12, 10);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.CloneMachine;
    cells[wallPos]!.top.id = MS_TILE.Wall;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.east }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [chipPos, blockPos],
      }),
      replay,
      1,
    );

    const postChipMovement = trace.steps[0]?.phases.find((phase) => phase.phase === "post-chip-movement");
    expect(postChipMovement).toBeDefined();
    expect(postChipMovement?.blocks[0]?.dir).toBe("none");
    expect((postChipMovement?.soundEffects ?? 0) & (1 << MS_SOUND.CantMove)).not.toBe(0);
  });

  it("arms teleport floor movement without setting lastSlipDir until the forced move runs", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const teleportPos = pos(10, 11);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[teleportPos]!.top.id = MS_TILE.Teleport;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.south }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      1,
    );

    const postChipMovement = trace.steps[0]?.phases.find((phase) => phase.phase === "post-chip-movement");

    expect(postChipMovement?.chipFloor.movementMode).toBe("teleport");
    expect(postChipMovement?.chipFloor.slipDir).toBe("south");
    expect(postChipMovement?.lastSlipDir).toBe("none");
    expect(postChipMovement?.slipList).toHaveLength(1);
    expect(postChipMovement?.slipList[0]).toMatchObject({
      creatureIndex: 0,
      dir: "south",
    });
  });

  it("records post-chip-floor-movement after Chip's forced teleport step", () => {
    const cells = createEmptyCells();
    const chipPos = pos(10, 10);
    const teleportPos = pos(10, 11);
    const exitPos = pos(10, 12);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[teleportPos]!.top.id = MS_TILE.Teleport;

    const replay: ReplaySolutionPayload = {
      flags: 0,
      randomSlideDirection: MS_DIRECTION.north,
      stepping: 0,
      randomSeed: 123456789,
      moves: [{ when: 0, dir: MS_DIRECTION.south }],
    };

    const trace = runMsReplayTraceDebug(
      createRequest(),
      createLevel({
        cells,
        creaturePositions: [],
      }),
      replay,
      3,
    );

    const postChipFloorMovement = trace.steps[2]?.phases.find((phase) => phase.phase === "post-chip-floor-movement");

    expect(postChipFloorMovement?.activeCreatures[0]?.position.pos).toBe(exitPos);
    expect(postChipFloorMovement?.activeCreatures[0]?.floor.id).toBe(MS_TILE.Empty);
    expect(postChipFloorMovement?.chipFloor.movementMode).toBe("none");
    expect(postChipFloorMovement?.lastSlipDir).toBe("south");
  });
});

import { describe, expect, it } from "vitest";
import { MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
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
import type { LynxLevel } from "@ruleset-lynx/api/level";
import type { EngineMapCell } from "@game-core/api/model";

function createCell(pos: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: { x: pos % 32, y: Math.floor(pos / 32), pos },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function createLevel(
  cells: EngineMapCell[],
  creaturePositions?: number[],
  overrides: Partial<Pick<LynxLevel, "traps" | "cloners">> = {},
): LynxLevel {
  const board = Array.from({ length: 32 * 32 }, (_, pos) => createCell(pos, MS_TILE.Empty));
  for (const cell of cells) {
    board[cell.position.pos] = cell;
  }

  return {
    number: 1,
    timeLimitTicks: 4000,
    chipsNeeded: 0,
    hintText: "",
    cells: board,
    traps: overrides.traps?.map((connection) => ({ ...connection })) ?? [],
    cloners: overrides.cloners?.map((connection) => ({ ...connection })) ?? [],
    creaturePositions:
      creaturePositions ??
      cells.filter((cell) => cell.top.id !== MS_TILE.Empty || cell.bottom.id !== MS_TILE.Empty).map((cell) => cell.position.pos),
    statusFlags: 0,
  };
}

function createRequest() {
  return { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" as const };
}

function advanceLynxTicks(
  session: ReturnType<typeof createLynxInteractiveSession>,
  ticks: number,
  firstInputCode = 0,
) {
  let current = session;
  for (let tick = 0; tick < ticks; tick += 1) {
    current = advanceLynxInteractiveSession(current, tick === 0 ? firstInputCode : 0);
  }
  return current;
}

describe("initializeLynxEngineState", () => {
  it("removes Chip from the map without claiming the floor", () => {
    const level = createLevel([createCell(33, msCreatureTile(MS_TILE.Chip, 4), MS_TILE.Empty)]);
    const state = initializeLynxEngineState(
      { seriesFile: "intro-lynx.dac", levelNumber: 1, ruleset: "Lynx" },
      level,
    );

    expect(state.map.cells[33]).toEqual({
      position: { x: 1, y: 1, pos: 33 },
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
      position: { x: 1, y: 2, pos: 65 },
      top: { id: MS_TILE.Fire, state: 0x40 },
      bottom: { id: MS_TILE.Empty, state: 0 },
    });
    expect(state.map.cells[66]).toEqual({
      position: { x: 2, y: 2, pos: 66 },
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
    const runtime = teleported.state as typeof teleported.state & {
      lynxRuntimeState?: { chipTeleported?: boolean };
    };

    expect(teleported.chipPos).toBe(exitTeleportPos);
    expect(runtime.lynxRuntimeState?.chipTeleported).toBe(true);
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

  it("rewinds Chip's death animation to the source tile on a mid-step collision", () => {
    const chipPos = 33;
    const bugPos = 34;
    const session = createLynxInteractiveSession(
      createRequest(),
      createLevel(
        [
          createCell(chipPos, msCreatureTile(MS_TILE.Chip, 8)),
          createCell(bugPos, msCreatureTile(MS_TILE.Bug, 1)),
        ],
        [chipPos, bugPos],
      ),
    );

    const collided = advanceLynxInteractiveSession(session, 8);
    const runtime = collided.state as typeof collided.state & {
      lynxRuntimeState?: { animations: Array<{ pos: number; tileId: number }> };
    };

    expect(collided.endGameResult).toBe("failed");
    expect(collided.chipPos).toBe(chipPos);
    expect(runtime.lynxRuntimeState?.animations).toEqual(
      expect.arrayContaining([expect.objectContaining({ pos: bugPos, tileId: 0x76 })]),
    );
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
    const runtime = collided.state as typeof collided.state & {
      lynxRuntimeState?: { animations: Array<{ pos: number; tileId: number }> };
    };

    expect(collided.endGameResult).toBe("failed");
    expect(runtime.lynxRuntimeState?.animations).toEqual(
      expect.arrayContaining([expect.objectContaining({ pos: ballPos, tileId: 0x76 })]),
    );
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
});

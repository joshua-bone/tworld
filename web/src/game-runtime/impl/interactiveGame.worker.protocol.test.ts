import { describe, expect, it } from "vitest";
import type { InteractiveGameVisibleLayer } from "@game-core/api/interactive";
import type { EngineMapCell } from "@game-core/api/model";
import type { ReplayRecordedMove } from "@game-core/api/codec";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  applyWorkerInteractiveGameSessionUpdate,
  toWorkerInteractiveGameSessionHandle,
  toWorkerInteractiveGameSessionUpdate,
} from "@game-runtime/impl/interactiveGame.worker.protocol";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createCell(
  pos: number,
  z = 1,
  topId: number = MS_TILE.Empty,
  bottomId: number = MS_TILE.Empty,
  topState = 0,
  bottomState = 0,
): EngineMapCell {
  return {
    position: {
      x: pos % 32,
      y: Math.floor(pos / 32),
      z,
      pos,
    },
    top: { id: topId, state: topState },
    bottom: { id: bottomId, state: bottomState },
  };
}

function createLayer(z: number, cells: EngineMapCell[]): InteractiveGameVisibleLayer {
  return {
    z,
    cells,
  };
}

function createSession(options: {
  checkpointTicks?: number[];
  currentTick?: number;
  currentTime?: number;
  currentZ?: number;
  visibleLayers?: InteractiveGameVisibleLayer[];
  hintText?: string | null;
  latestTick?: number;
  previousCheckpointTick?: number | null;
  previousTick?: number | null;
  recordedMoves?: ReplayRecordedMove[];
  recentTicks?: number[] | undefined;
  tick?: number;
} = {}): InteractiveGameSession {
  const currentTick = options.currentTick ?? 4;
  const latestTick = options.latestTick ?? currentTick;
  const tick = options.tick ?? currentTick;
  const currentTime = options.currentTime ?? currentTick;
  const checkpointTicks = options.checkpointTicks ?? [-1, 4];
  const recentTicks = options.recentTicks ?? (currentTick >= 0 ? [currentTick - 1] : []);
  const visibleLayers =
    options.visibleLayers ??
    [
      createLayer(1, [createCell(0, 1)]),
    ];

  return {
    request: {
      levelNumber: 1,
      randomSeed: 123,
      ruleset: "MS",
      seriesFile: "intro-ms.dac",
    },
    mode: "manual",
    hintText: options.hintText ?? null,
    frame: {
      snapshot: {
        phase: "tick",
        input: "none",
        inputCode: 0,
        status: "playing",
        tick,
        currentTime,
        timeOffset: 0,
        secondsPlayed: 0,
        timelimit: 1000,
        chipsNeeded: 0,
        statusFlags: 0,
        lastMoveCode: 0,
        lastMove: "none",
        stepping: 0,
        initRandomSlideDir: "north",
        replayCursor: 0,
        randomState: {
          main: { initial: "123", value: "123", shared: false },
          lynx: { prng1: 0, prng2: 0 },
        },
        soundEffects: 0,
        view: { x: 0, y: 0 },
        inventory: { keys: [0, 0, 0, 0], boots: [0, 0, 0, 0], tools: [0] },
        chip: null,
        creatureCount: 0,
        creaturesHash: "",
        mapHash: "",
        creatures: [],
      },
      cells: visibleLayers[0]?.cells ?? [],
      currentZ: options.currentZ ?? visibleLayers[0]?.z ?? 1,
      visibleLayers,
      tileOverlays: [],
      render: null,
    },
    history: {
      enabled: true,
      initialTick: -1,
      currentTick,
      latestTick,
      checkpointCount: checkpointTicks.length,
      checkpointTicks,
      recentTicks,
      previousTick: options.previousTick ?? (currentTick > -1 ? currentTick - 1 : null),
      previousCheckpointTick:
        options.previousCheckpointTick ?? checkpointTicks[checkpointTicks.length - 1] ?? null,
      timelineId: "main",
      timelineCount: 1,
      restoreMode: "live",
      restoredFromTick: null,
      replayTargetTick: null,
    },
    run: {
      undoUsedCount: 0,
      replayAvailable: (options.recordedMoves?.length ?? 0) > 0,
      result: null,
    },
    recordedMoveCount: (options.recordedMoves ?? []).length,
    recordedMoves: options.recordedMoves ?? [],
    handle: toWorkerInteractiveGameSessionHandle(7),
  };
}

function toLiveClientSession(session: InteractiveGameSession): InteractiveGameSession {
  return {
    ...session,
    history: {
      ...session.history,
      checkpointTicks: undefined,
      recentTicks: session.history.recentTicks ? [...session.history.recentTicks] : undefined,
    },
    recordedMoves: undefined,
  };
}

describe("interactiveGame.worker.protocol", () => {
  it("builds lightweight patches for advancing live sessions and reconstructs the client session", () => {
    const workerPrevious = createSession({
      checkpointTicks: [-1, 4],
      currentTick: 4,
      currentTime: 4,
      currentZ: 2,
      hintText: "lower hint",
      latestTick: 4,
      previousCheckpointTick: 4,
      previousTick: 3,
      recordedMoves: [{ when: 0, dir: MS_DIRECTION.east, modifierMask: 0 }],
      recentTicks: [3, 2, 1],
      tick: 4,
      visibleLayers: [
        createLayer(2, [
          createCell(0, 2, MS_TILE.Empty),
          createCell(1, 2, MS_TILE.Empty),
        ]),
        createLayer(1, [
          createCell(0, 1, MS_TILE.Empty),
          createCell(1, 1, MS_TILE.Empty),
        ]),
      ],
    });
    const clientPrevious = toLiveClientSession(workerPrevious);
    const workerNext = createSession({
      checkpointTicks: [-1, 4, 5],
      currentTick: 5,
      currentTime: 5,
      currentZ: 2,
      hintText: "upper hint",
      latestTick: 5,
      previousCheckpointTick: 5,
      previousTick: 4,
      recordedMoves: [
        { when: 0, dir: MS_DIRECTION.east, modifierMask: 0 },
        { when: 5, dir: MS_DIRECTION.north, modifierMask: 1 },
      ],
      recentTicks: [4, 3, 2, 1],
      tick: 5,
      visibleLayers: [
        createLayer(2, [
          createCell(0, 2, MS_TILE.Empty),
          createCell(1, 2, MS_TILE.Wall),
        ]),
        createLayer(1, [
          createCell(0, 1, MS_TILE.Empty, MS_TILE.Empty, 0, 1),
          createCell(1, 1, MS_TILE.Empty),
        ]),
      ],
    });
    const clientNext = toLiveClientSession(workerNext);

    const update = toWorkerInteractiveGameSessionUpdate(workerPrevious, workerNext);

    expect(update.history.checkpointCount).toBe(3);
    expect(update.recordedMoveCount).toBe(2);
    expect(update.frame.visibleLayers).toEqual({
      mode: "patch",
      layers: [
        {
          kind: "patch",
          z: 2,
          changedCells: [{ index: 1, top: { id: MS_TILE.Wall, state: 0 }, bottom: { id: MS_TILE.Empty, state: 0 } }],
        },
        {
          kind: "patch",
          z: 1,
          changedCells: [{ index: 0, top: { id: MS_TILE.Empty, state: 0 }, bottom: { id: MS_TILE.Empty, state: 1 } }],
        },
      ],
    });
    expect(applyWorkerInteractiveGameSessionUpdate(clientPrevious, update)).toEqual(clientNext);
  });

  it("falls back to replace patches when visible-layer layouts no longer match", () => {
    const workerPrevious = createSession({
      checkpointTicks: [-1, 4, 8],
      currentTick: 8,
      currentZ: 2,
      latestTick: 8,
      previousCheckpointTick: 8,
      previousTick: 7,
      recordedMoves: [
        { when: 0, dir: MS_DIRECTION.east, modifierMask: 0 },
        { when: 4, dir: MS_DIRECTION.south, modifierMask: 0 },
      ],
      recentTicks: [7, 6, 5, 4],
      tick: 8,
      visibleLayers: [
        createLayer(2, [createCell(0, 2, MS_TILE.Empty), createCell(1, 2, MS_TILE.Empty)]),
        createLayer(1, [createCell(0, 1, MS_TILE.Empty), createCell(1, 1, MS_TILE.Empty)]),
      ],
    });
    const clientPrevious = toLiveClientSession(workerPrevious);
    const workerNext = createSession({
      checkpointTicks: [-1, 6],
      currentTick: 6,
      currentTime: 6,
      currentZ: 1,
      latestTick: 6,
      previousCheckpointTick: 6,
      previousTick: 5,
      recordedMoves: [{ when: 2, dir: MS_DIRECTION.west, modifierMask: 0 }],
      recentTicks: [5, 4, 3, 2],
      tick: 6,
      visibleLayers: [
        createLayer(1, [createCell(0, 1, MS_TILE.Wall), createCell(1, 1, MS_TILE.Empty)]),
      ],
    });
    const clientNext = toLiveClientSession(workerNext);

    const update = toWorkerInteractiveGameSessionUpdate(workerPrevious, workerNext);

    expect(update.history.checkpointCount).toBe(2);
    expect(update.recordedMoveCount).toBe(1);
    expect(update.frame.visibleLayers).toEqual({
      mode: "replace",
      layers: workerNext.frame.visibleLayers,
    });
    expect(applyWorkerInteractiveGameSessionUpdate(clientPrevious, update)).toEqual(clientNext);
  });
});

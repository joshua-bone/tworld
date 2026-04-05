import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import type { ReplayRecordedMove } from "@game-core/api/codec";
import type { InteractiveGameSession } from "@game-runtime/ports/InteractiveGameEngine";
import {
  applyWorkerInteractiveGameSessionUpdate,
  toWorkerInteractiveGameSessionHandle,
  toWorkerInteractiveGameSessionUpdate,
} from "@game-runtime/impl/interactiveGame.worker.protocol";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

function createCell(pos: number): EngineMapCell {
  return {
    position: {
      x: pos % 32,
      y: Math.floor(pos / 32),
      z: 1,
      pos,
    },
    top: { id: MS_TILE.Empty, state: 0 },
    bottom: { id: MS_TILE.Empty, state: 0 },
  };
}

function createSession(options: {
  checkpointTicks?: number[];
  currentTick?: number;
  currentTime?: number;
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
      cells: [createCell(0)],
      currentZ: 1,
      visibleLayers: [{ z: 1, cells: [createCell(0)] }],
      tileOverlays: [],
      render: null,
    },
    history: {
      enabled: true,
      initialTick: -1,
      currentTick,
      latestTick,
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
    recordedMoves: options.recordedMoves ?? [],
    handle: toWorkerInteractiveGameSessionHandle(7),
  };
}

describe("interactiveGame.worker.protocol", () => {
  it("builds append patches for advancing live sessions and reconstructs the full client session", () => {
    const previous = createSession({
      checkpointTicks: [-1, 4],
      currentTick: 4,
      currentTime: 4,
      hintText: "lower hint",
      latestTick: 4,
      previousCheckpointTick: 4,
      previousTick: 3,
      recordedMoves: [{ when: 0, dir: MS_DIRECTION.east, modifierMask: 0 }],
      recentTicks: [3, 2, 1],
      tick: 4,
    });
    const next = createSession({
      checkpointTicks: [-1, 4, 5],
      currentTick: 5,
      currentTime: 5,
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
    });

    const update = toWorkerInteractiveGameSessionUpdate(previous, next);

    expect(update.history.checkpointTicks).toEqual({
      mode: "append",
      totalCount: 3,
      values: [5],
    });
    expect(update.recordedMoves).toEqual({
      mode: "append",
      totalCount: 2,
      values: [{ when: 5, dir: MS_DIRECTION.north, modifierMask: 1 }],
    });
    expect(applyWorkerInteractiveGameSessionUpdate(previous, update)).toEqual(next);
  });

  it("falls back to replace patches when history or replay prefixes no longer match", () => {
    const previous = createSession({
      checkpointTicks: [-1, 4, 8],
      currentTick: 8,
      latestTick: 8,
      previousCheckpointTick: 8,
      previousTick: 7,
      recordedMoves: [
        { when: 0, dir: MS_DIRECTION.east, modifierMask: 0 },
        { when: 4, dir: MS_DIRECTION.south, modifierMask: 0 },
      ],
      recentTicks: [7, 6, 5, 4],
      tick: 8,
    });
    const next = createSession({
      checkpointTicks: [-1, 6],
      currentTick: 6,
      currentTime: 6,
      latestTick: 6,
      previousCheckpointTick: 6,
      previousTick: 5,
      recordedMoves: [{ when: 2, dir: MS_DIRECTION.west, modifierMask: 0 }],
      recentTicks: [5, 4, 3, 2],
      tick: 6,
    });

    const update = toWorkerInteractiveGameSessionUpdate(previous, next);

    expect(update.history.checkpointTicks).toEqual({
      mode: "replace",
      totalCount: 2,
      values: [-1, 6],
    });
    expect(update.recordedMoves).toEqual({
      mode: "replace",
      totalCount: 1,
      values: [{ when: 2, dir: MS_DIRECTION.west, modifierMask: 0 }],
    });
    expect(applyWorkerInteractiveGameSessionUpdate(previous, update)).toEqual(next);
  });
});

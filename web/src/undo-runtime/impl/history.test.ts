import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import type { MsLevel } from "@ruleset-ms/api/level";
import {
  MS_DIRECTION,
  MS_GRID_WIDTH,
  MS_TILE,
  msCreatureTile,
} from "@ruleset-ms/api/tiles";
import {
  advanceMsInteractiveSession,
  createMsInteractiveSession,
  type MsInteractiveSessionState,
} from "@ruleset-ms/impl/engine";
import { digestMsInteractiveSession } from "@undo-runtime/impl/sessionDigest";
import {
  captureMsUndoCheckpoint,
  restoreMsUndoCheckpoint,
} from "@undo-runtime/impl/msCheckpoint";
import {
  createMsUndoHistory,
  recordMsUndoTick,
  restoreMsUndoHistoryToTick,
} from "@undo-runtime/impl/msHistory";

function pos(x: number, y: number): number {
  return y * MS_GRID_WIDTH + x;
}

function createMsEmptyCells(): EngineMapCell[] {
  return Array.from({ length: 32 * 32 }, (_, cellPos) => ({
    position: {
      x: cellPos % 32,
      y: Math.floor(cellPos / 32),
      pos: cellPos,
    },
    top: { id: MS_TILE.Empty, state: 0 },
    bottom: { id: MS_TILE.Empty, state: 0 },
  }));
}

function createMsLevel(overrides: Partial<MsLevel> & { cells: EngineMapCell[]; creaturePositions?: number[] }): MsLevel {
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

function createMsRequest() {
  return {
    seriesFile: "undo-ms.dac",
    levelNumber: 1,
    ruleset: "MS" as const,
    randomSeed: 123456789,
  };
}

function createScenarioSession(): MsInteractiveSessionState {
  const cells = createMsEmptyCells();
  const chipPos = pos(2, 2);
  const blockPos = pos(3, 2);
  const waterPos = pos(4, 2);
  cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
  cells[blockPos]!.top.id = MS_TILE.Block_Static;
  cells[waterPos]!.top.id = MS_TILE.Water;
  cells[blockPos]!.bottom.id = MS_TILE.Button_Brown;

  return createMsInteractiveSession(
    createMsRequest(),
    createMsLevel({
      cells,
      creaturePositions: [blockPos],
    }),
  );
}

describe("MS undo checkpoints", () => {
  it("captures checkpoints by value instead of retaining live references", () => {
    const session = createScenarioSession();
    const checkpoint = captureMsUndoCheckpoint(session);
    const before = checkpoint.stateDigest;

    session.state.internal.currentInput = GAME_INPUT_CODES.east;
    session.state.engine.timer.currentTime = 99;

    expect(checkpoint.stateDigest).toBe(before);
    expect(digestMsInteractiveSession(restoreMsUndoCheckpoint(checkpoint))).toBe(before);
  });
});

describe("MS undo history", () => {
  it("records every tick including none inputs", () => {
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, 2);

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      session = advanceMsInteractiveSession(session, inputCode);
      history = recordMsUndoTick(history, session, inputCode);
    }

    expect(history.events.map((event) => [event.tick, event.inputCode])).toEqual([
      [0, GAME_INPUT_CODES.east],
      [1, GAME_INPUT_CODES.none],
      [2, GAME_INPUT_CODES.none],
    ]);
    expect(history.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([1]);
  });

  it("restores exact MS session state by checkpoint plus replay", () => {
    const inputs = [
      GAME_INPUT_CODES.east,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
      GAME_INPUT_CODES.none,
    ];
    let session = createScenarioSession();
    let history = createMsUndoHistory(session, 2);
    const originalDigests = new Map<number, string>([
      [session.state.engine.timer.currentTime, digestMsInteractiveSession(session)],
    ]);

    for (const inputCode of inputs) {
      session = advanceMsInteractiveSession(session, inputCode);
      history = recordMsUndoTick(history, session, inputCode);
      originalDigests.set(session.state.engine.timer.currentTime, digestMsInteractiveSession(session));
    }

    for (const tick of [0, 1, 2, 3, 4]) {
      const restored = restoreMsUndoHistoryToTick(history, tick);
      expect(digestMsInteractiveSession(restored.session)).toBe(originalDigests.get(tick));
    }

    const restoredInitial = restoreMsUndoHistoryToTick(history, -1);
    expect(digestMsInteractiveSession(restoredInitial.session)).toBe(originalDigests.get(-1));
    expect(restoredInitial.replayedEventCount).toBe(0);
  });
});

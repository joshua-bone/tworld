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
import type { LynxLevel } from "@ruleset-lynx/api/level";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
  type LynxInteractiveSessionState,
} from "@ruleset-lynx/impl/engine";
import {
  digestLynxInteractiveSession,
  digestMsInteractiveSession,
  lynxInteractiveSessionsEqual,
  msInteractiveSessionsEqual,
} from "@undo-runtime/impl/sessionDigest";

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

function createLynxCell(cellPos: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: {
      x: cellPos % 32,
      y: Math.floor(cellPos / 32),
      pos: cellPos,
    },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function pos(x: number, y: number): number {
  return y * MS_GRID_WIDTH + x;
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

function createLynxLevel(
  cells: EngineMapCell[],
  creaturePositions?: number[],
  hintText = "",
): LynxLevel {
  const board = Array.from({ length: 32 * 32 }, (_, cellPos) => createLynxCell(cellPos, MS_TILE.Empty));
  for (const cell of cells) {
    board[cell.position.pos] = cell;
  }

  return {
    number: 1,
    timeLimitTicks: 4000,
    chipsNeeded: 0,
    hintText,
    cells: board,
    traps: [],
    cloners: [],
    creaturePositions:
      creaturePositions ??
      cells.filter((cell) => cell.top.id !== MS_TILE.Empty || cell.bottom.id !== MS_TILE.Empty).map((cell) => cell.position.pos),
    statusFlags: 0,
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

function createLynxRequest() {
  return {
    seriesFile: "undo-lynx.dac",
    levelNumber: 1,
    ruleset: "Lynx" as const,
    randomSeed: 123456789,
  };
}

function cloneMsSession(session: MsInteractiveSessionState): MsInteractiveSessionState {
  return structuredClone(session);
}

function cloneLynxSession(session: LynxInteractiveSessionState): LynxInteractiveSessionState {
  return structuredClone(session);
}

describe("undo session digests", () => {
  it("produces identical MS digests for equivalent sessions", () => {
    const cells = createMsEmptyCells();
    const chipPos = pos(2, 2);
    const blockPos = pos(3, 2);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    cells[blockPos]!.top.id = MS_TILE.Block_Static;
    cells[blockPos]!.bottom.id = MS_TILE.Button_Brown;

    let left = createMsInteractiveSession(
      createMsRequest(),
      createMsLevel({
        cells,
        creaturePositions: [blockPos],
      }),
    );
    let right = createMsInteractiveSession(
      createMsRequest(),
      createMsLevel({
        cells: structuredClone(cells),
        creaturePositions: [blockPos],
      }),
    );

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      left = advanceMsInteractiveSession(left, inputCode);
      right = advanceMsInteractiveSession(right, inputCode);
    }

    expect(digestMsInteractiveSession(left)).toBe(digestMsInteractiveSession(right));
    expect(msInteractiveSessionsEqual(left, right)).toBe(true);
  });

  it("includes MS session-only runtime state in the digest", () => {
    const cells = createMsEmptyCells();
    const chipPos = pos(5, 5);
    cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);

    const base = createMsInteractiveSession(
      createMsRequest(),
      createMsLevel({
        cells,
      }),
    );
    const changedInternal = cloneMsSession(base);
    changedInternal.state.internal.currentInput = GAME_INPUT_CODES.east;

    const changedReplayCursor = cloneMsSession(base);
    changedReplayCursor.lastInput = {
      tick: 7,
      inputCode: GAME_INPUT_CODES.west,
      inputName: "west",
    };

    expect(digestMsInteractiveSession(changedInternal)).not.toBe(digestMsInteractiveSession(base));
    expect(digestMsInteractiveSession(changedReplayCursor)).not.toBe(digestMsInteractiveSession(base));
    expect(msInteractiveSessionsEqual(changedInternal, base)).toBe(false);
  });

  it("produces identical Lynx digests for equivalent sessions", () => {
    const chipPos = pos(1, 1);
    const bugPos = pos(2, 1);
    let left = createLynxInteractiveSession(
      createLynxRequest(),
      createLynxLevel(
        [
          createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
          createLynxCell(bugPos, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west)),
        ],
        [chipPos, bugPos],
      ),
    );
    let right = createLynxInteractiveSession(
      createLynxRequest(),
      createLynxLevel(
        [
          createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
          createLynxCell(bugPos, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west)),
        ],
        [chipPos, bugPos],
      ),
    );

    for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
      left = advanceLynxInteractiveSession(left, inputCode);
      right = advanceLynxInteractiveSession(right, inputCode);
    }

    expect(digestLynxInteractiveSession(left)).toBe(digestLynxInteractiveSession(right));
    expect(lynxInteractiveSessionsEqual(left, right)).toBe(true);
  });

  it("includes Lynx runtime-only state and level data in the digest", () => {
    const chipPos = pos(1, 1);
    const bugPos = pos(2, 1);
    const base = createLynxInteractiveSession(
      createLynxRequest(),
      createLynxLevel(
        [
          createLynxCell(chipPos, msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east)),
          createLynxCell(bugPos, msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west)),
        ],
        [chipPos, bugPos],
        "base hint",
      ),
    );
    const changedQueuedInput = cloneLynxSession(base);
    changedQueuedInput.queuedChipInputCode = GAME_INPUT_CODES.east | GAME_INPUT_CODES.north;

    const changedLevel = cloneLynxSession(base);
    changedLevel.level.hintText = "changed hint";

    expect(changedQueuedInput.actors.length).toBeGreaterThan(0);
    changedQueuedInput.actors[0]!.hidden = !changedQueuedInput.actors[0]!.hidden;

    expect(digestLynxInteractiveSession(changedQueuedInput)).not.toBe(digestLynxInteractiveSession(base));
    expect(digestLynxInteractiveSession(changedLevel)).not.toBe(digestLynxInteractiveSession(base));
    expect(lynxInteractiveSessionsEqual(changedQueuedInput, base)).toBe(false);
  });
});

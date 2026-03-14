import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { EngineMapCell } from "@game-core/api/model";
import { GAME_INPUT_CODES } from "@game-core/api/command";
import type { LynxLevel } from "@ruleset-lynx/api/level";
import {
  advanceLynxInteractiveSession,
  createLynxInteractiveSession,
} from "@ruleset-lynx/impl/engine";
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
} from "@ruleset-ms/impl/engine";
import {
  digestLynxInteractiveSession,
  digestMsInteractiveSession,
} from "@undo-runtime/impl/sessionDigest";

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

function buildMsFixture(): unknown {
  const cells = createMsEmptyCells();
  const chipPos = pos(2, 2);
  const blockPos = pos(3, 2);
  cells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
  cells[blockPos]!.top.id = MS_TILE.Block_Static;
  cells[blockPos]!.bottom.id = MS_TILE.Button_Brown;

  let session = createMsInteractiveSession(
    createMsRequest(),
    createMsLevel({
      cells,
      creaturePositions: [blockPos],
    }),
  );

  for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
    session = advanceMsInteractiveSession(session, inputCode);
  }

  return JSON.parse(digestMsInteractiveSession(session));
}

function buildLynxFixture(): unknown {
  const chipPos = pos(1, 1);
  const bugPos = pos(2, 1);
  let session = createLynxInteractiveSession(
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

  for (const inputCode of [GAME_INPUT_CODES.east, GAME_INPUT_CODES.none, GAME_INPUT_CODES.none]) {
    session = advanceLynxInteractiveSession(session, inputCode);
  }

  return JSON.parse(digestLynxInteractiveSession(session));
}

async function writeFixture(name: string, value: unknown): Promise<void> {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const outputPath = resolve(currentDir, "fixtures", `${name}.json`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main(): Promise<void> {
  await writeFixture("ms-interactive-session", buildMsFixture());
  await writeFixture("lynx-interactive-session", buildLynxFixture());
}

void main();

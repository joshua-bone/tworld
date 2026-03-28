import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { createEmptyTestBoard, createTestCell, boardPos } from "@game-core/impl/testBoards";
import { createTestEngineState } from "@game-core/impl/testEngineState";
import type { StatefulActorRuntimeEntry, StatefulActorRuntimeStore } from "@game-core/impl/statefulActorRuntime";
import type { MsLevel } from "@ruleset-ms/api/level";
import { MS_GRID_HEIGHT, MS_GRID_WIDTH, MS_TILE } from "@ruleset-ms/api/tiles";

type MsRuntimeOverlay = {
  z: number;
  pos: number;
  kind: string;
  ttl: number;
  tileId?: number;
};

export function createCell(pos: number, topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return createTestCell(pos, topId, bottomId, 1, MS_GRID_WIDTH);
}

export function createEmptyCells(): EngineMapCell[] {
  return createEmptyTestBoard(MS_GRID_WIDTH, MS_GRID_HEIGHT, MS_TILE.Empty);
}

export function createEmptyCellsAtZ(z: number): EngineMapCell[] {
  return createEmptyTestBoard(MS_GRID_WIDTH, MS_GRID_HEIGHT, MS_TILE.Empty, z);
}

export function pos(x: number, y: number): number {
  return boardPos(x, y, MS_GRID_WIDTH);
}

export function createLevel(
  overrides: Partial<MsLevel> & { cells: EngineMapCell[]; creaturePositions?: number[] },
): MsLevel {
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

export function createRequest() {
  return {
    seriesFile: "test-ms.dac",
    levelNumber: 1,
    ruleset: "MS" as const,
    randomSeed: 123456789,
  };
}

export function createEngineState(cells: EngineMapCell[]): EngineState {
  return createTestEngineState(cells, "MS");
}

export function msTileOverlays(state: EngineState): MsRuntimeOverlay[] {
  return ((state as EngineState & { msRuntimeState?: { tileOverlays?: MsRuntimeOverlay[] } }).msRuntimeState?.tileOverlays ??
    []);
}

export function msStatefulActorsForTest(state: { internal: { statefulActors: StatefulActorRuntimeStore<StatefulActorRuntimeEntry> } }) {
  return state.internal.statefulActors;
}

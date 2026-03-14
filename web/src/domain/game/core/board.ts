import type { EngineMapCell, EngineTile } from "@domain/game/model";

export function cloneBoardCells(cells: EngineMapCell[]): EngineMapCell[] {
  return cells.map((cell) => ({
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  }));
}

export function pushBoardTile(cells: EngineMapCell[], pos: number, tile: EngineTile): void {
  const cell = cells[pos]!;
  cell.bottom = { ...cell.top };
  cell.top = { ...tile };
}

export function promoteBottomTile(cells: EngineMapCell[], pos: number, emptyTileId: number): void {
  const cell = cells[pos]!;
  cell.top = { ...cell.bottom };
  cell.bottom = { id: emptyTileId, state: 0 };
}

export function popBoardTile(cells: EngineMapCell[], pos: number, emptyTileId: number): EngineTile {
  const cell = cells[pos]!;
  const tile = { ...cell.top };
  promoteBottomTile(cells, pos, emptyTileId);
  return tile;
}

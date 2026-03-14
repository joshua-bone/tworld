import type { EngineMapCell, EngineTile } from "@domain/game/model";

export function cloneBoardCells(cells: EngineMapCell[]): EngineMapCell[] {
  return cells.map((cell) => ({
    position: { ...cell.position },
    top: { ...cell.top },
    bottom: { ...cell.bottom },
  }));
}

export function boardCell(cells: EngineMapCell[], pos: number): EngineMapCell {
  return cells[pos]!;
}

export function topTile(cells: EngineMapCell[], pos: number): EngineTile {
  return boardCell(cells, pos).top;
}

export function bottomTile(cells: EngineMapCell[], pos: number): EngineTile {
  return boardCell(cells, pos).bottom;
}

export function topTileId(cells: EngineMapCell[], pos: number): number {
  return topTile(cells, pos).id;
}

export function bottomTileId(cells: EngineMapCell[], pos: number): number {
  return bottomTile(cells, pos).id;
}

export function pushBoardTile(cells: EngineMapCell[], pos: number, tile: EngineTile): void {
  const cell = boardCell(cells, pos);
  cell.bottom = { ...cell.top };
  cell.top = { ...tile };
}

export function promoteBottomTile(cells: EngineMapCell[], pos: number, emptyTileId: number): void {
  const cell = boardCell(cells, pos);
  cell.top = { ...cell.bottom };
  cell.bottom = { id: emptyTileId, state: 0 };
}

export function popBoardTile(cells: EngineMapCell[], pos: number, emptyTileId: number): EngineTile {
  const cell = boardCell(cells, pos);
  const tile = { ...cell.top };
  promoteBottomTile(cells, pos, emptyTileId);
  return tile;
}

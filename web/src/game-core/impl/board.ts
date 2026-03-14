import type { EngineMapCell, EngineTile } from "@game-core/api/model";

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

export function hasBoardCell(cells: EngineMapCell[], pos: number): boolean {
  return cells[pos] !== undefined;
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

export function topTileIdOr(cells: EngineMapCell[], pos: number, fallback: number): number {
  return hasBoardCell(cells, pos) ? topTileId(cells, pos) : fallback;
}

export function bottomTileIdOr(cells: EngineMapCell[], pos: number, fallback: number): number {
  return hasBoardCell(cells, pos) ? bottomTileId(cells, pos) : fallback;
}

export function topTileState(cells: EngineMapCell[], pos: number): number {
  return topTile(cells, pos).state;
}

export function bottomTileState(cells: EngineMapCell[], pos: number): number {
  return bottomTile(cells, pos).state;
}

export function hasTopTileFlags(cells: EngineMapCell[], pos: number, flags: number): boolean {
  return (topTileState(cells, pos) & flags) !== 0;
}

export function hasBottomTileFlags(cells: EngineMapCell[], pos: number, flags: number): boolean {
  return (bottomTileState(cells, pos) & flags) !== 0;
}

export function replaceTopTile(cells: EngineMapCell[], pos: number, tile: EngineTile): void {
  boardCell(cells, pos).top = { ...tile };
}

export function replaceBottomTile(cells: EngineMapCell[], pos: number, tile: EngineTile): void {
  boardCell(cells, pos).bottom = { ...tile };
}

export function addTopTileFlags(cells: EngineMapCell[], pos: number, flags: number): void {
  boardCell(cells, pos).top.state |= flags;
}

export function removeTopTileFlags(cells: EngineMapCell[], pos: number, flags: number): void {
  boardCell(cells, pos).top.state &= ~flags;
}

export function addBottomTileFlags(cells: EngineMapCell[], pos: number, flags: number): void {
  boardCell(cells, pos).bottom.state |= flags;
}

export function removeBottomTileFlags(cells: EngineMapCell[], pos: number, flags: number): void {
  boardCell(cells, pos).bottom.state &= ~flags;
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

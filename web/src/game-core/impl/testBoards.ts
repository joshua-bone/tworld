import type { EngineMapCell } from "@game-core/api/model";

export function boardPos(x: number, y: number, width: number): number {
  return y * width + x;
}

export function createTestCell(
  pos: number,
  topId: number,
  bottomId: number,
  z = 1,
  width = 32,
): EngineMapCell {
  return {
    position: {
      x: pos % width,
      y: Math.floor(pos / width),
      z,
      pos,
    },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

export function createEmptyTestBoard(
  width: number,
  height: number,
  emptyTileId: number,
  z = 1,
): EngineMapCell[] {
  return Array.from({ length: width * height }, (_, pos) => createTestCell(pos, emptyTileId, emptyTileId, z, width));
}

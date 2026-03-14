import type { GamePosition } from "@game-core/api/types";

export function boardGamePosition(pos: number, width: number, z = 1): GamePosition {
  const x = pos % width;
  const y = Math.floor(pos / width);
  if (z <= 1) {
    return { x, y, pos };
  }

  return { x, y, z, pos };
}

export function projectGamePosition(position: GamePosition): GamePosition {
  if ((position.z ?? 1) <= 1) {
    return {
      x: position.x,
      y: position.y,
      pos: position.pos,
    };
  }

  return {
    x: position.x,
    y: position.y,
    z: position.z,
    pos: position.pos,
  };
}

import { stripRuntimeInputModifiers } from "@game-core/api/command";

export interface BoardPosition {
  x: number;
  y: number;
  z?: number;
  pos: number;
}

export function directionName(dir: number): string {
  switch (stripRuntimeInputModifiers(dir)) {
    case 1:
      return "north";
    case 2:
      return "west";
    case 4:
      return "south";
    case 8:
      return "east";
    default:
      return "none";
  }
}

export function directionCode(name: string): number {
  switch (name) {
    case "north":
      return 1;
    case "west":
      return 2;
    case "south":
      return 4;
    case "east":
      return 8;
    default:
      return 0;
  }
}

export function normalizeCardinalDirection(dir: number): number {
  let next = stripRuntimeInputModifiers(dir);
  if ((next & (1 | 4)) !== 0 && (next & (2 | 8)) !== 0) {
    next &= 1 | 4;
  }
  return next;
}

export function reverseDirection(dir: number): number {
  switch (stripRuntimeInputModifiers(dir)) {
    case 1:
      return 4;
    case 2:
      return 8;
    case 4:
      return 1;
    case 8:
      return 2;
    default:
      return 0;
  }
}

export function directionDelta(dir: number, width: number): number {
  switch (stripRuntimeInputModifiers(dir)) {
    case 1:
      return -width;
    case 2:
      return -1;
    case 4:
      return width;
    case 8:
      return 1;
    default:
      return 0;
  }
}

export function nextPosition(pos: number, dir: number, width: number): number {
  return pos + directionDelta(dir, width);
}

export function advancePositionIfPossible(pos: number, dir: number, width: number, height: number): number | null {
  return canAdvancePosition(pos, dir, width, height) ? nextPosition(pos, dir, width) : null;
}

export function advanceToCell<T>(
  cells: readonly T[],
  pos: number,
  dir: number,
  width: number,
  height: number,
): { pos: number; cell: T } | null {
  const nextPos = advancePositionIfPossible(pos, dir, width, height);
  if (nextPos === null) {
    return null;
  }

  const cell = cells[nextPos];
  if (cell === undefined) {
    return null;
  }

  return { pos: nextPos, cell };
}

export function isDirectionalInput(inputCode: number): boolean {
  const normalized = stripRuntimeInputModifiers(inputCode);
  return normalized >= 1 && normalized <= 15;
}

export function isDiagonalInput(inputCode: number): boolean {
  const normalized = stripRuntimeInputModifiers(inputCode);
  return (normalized & (1 | 4)) !== 0 && (normalized & (2 | 8)) !== 0;
}

export function canAdvancePosition(pos: number, dir: number, width: number, height: number): boolean {
  const normalized = stripRuntimeInputModifiers(dir);
  if (isDiagonalInput(normalized)) {
    return (
      ((normalized & 1) === 0 || canAdvancePosition(pos, 1, width, height)) &&
      ((normalized & 2) === 0 || canAdvancePosition(pos, 2, width, height)) &&
      ((normalized & 4) === 0 || canAdvancePosition(pos, 4, width, height)) &&
      ((normalized & 8) === 0 || canAdvancePosition(pos, 8, width, height))
    );
  }

  switch (normalized) {
    case 1:
      return pos >= width;
    case 2:
      return (pos % width) !== 0;
    case 4:
      return pos < width * (height - 1);
    case 8:
      return (pos % width) !== width - 1;
    default:
      return false;
  }
}

export function isPositionInBounds(pos: number, width: number, height: number): boolean {
  return pos >= 0 && pos < width * height;
}

export function roundedBoardPosition(viewX: number, viewY: number, width: number, height: number, tileSize: number): BoardPosition {
  const x = Math.max(0, Math.min(width - 1, Math.round(viewX / tileSize)));
  const y = Math.max(0, Math.min(height - 1, Math.round(viewY / tileSize)));
  return {
    x,
    y,
    pos: x + y * width,
  };
}

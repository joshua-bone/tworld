import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import type {
  DihedralOrientation,
  DihedralTransform,
} from "@player-web/impl/specialModesSettings";

export interface DihedralMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
}

export const DIHEDRAL_MATRICES: Readonly<Record<DihedralOrientation, DihedralMatrix>> = {
  identity: { a: 1, b: 0, c: 0, d: 1 },
  "rotate-90": { a: 0, b: 1, c: -1, d: 0 },
  "rotate-180": { a: -1, b: 0, c: 0, d: -1 },
  "rotate-270": { a: 0, b: -1, c: 1, d: 0 },
  "flip-horizontal": { a: -1, b: 0, c: 0, d: 1 },
  "flip-vertical": { a: 1, b: 0, c: 0, d: -1 },
  "flip-rising-diagonal": { a: 0, b: -1, c: -1, d: 0 },
  "flip-falling-diagonal": { a: 0, b: 1, c: 1, d: 0 },
};

function matrixKey(matrix: DihedralMatrix): string {
  return `${matrix.a},${matrix.b},${matrix.c},${matrix.d}`;
}

const ORIENTATION_BY_MATRIX = new Map(
  Object.entries(DIHEDRAL_MATRICES).map(([orientation, matrix]) => [matrixKey(matrix), orientation as DihedralOrientation]),
);

function multiply(left: DihedralMatrix, right: DihedralMatrix): DihedralMatrix {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
  };
}

export function composeDihedralOrientation(
  current: DihedralOrientation,
  operation: DihedralTransform,
): DihedralOrientation {
  const matrix = multiply(DIHEDRAL_MATRICES[operation], DIHEDRAL_MATRICES[current]);
  const orientation = ORIENTATION_BY_MATRIX.get(matrixKey(matrix));
  if (!orientation) {
    throw new Error(`Invalid dihedral composition: ${current} then ${operation}`);
  }
  return orientation;
}

export function inverseDihedralOrientation(orientation: DihedralOrientation): DihedralOrientation {
  const matrix = DIHEDRAL_MATRICES[orientation];
  const inverse = { a: matrix.a, b: matrix.c, c: matrix.b, d: matrix.d };
  const result = ORIENTATION_BY_MATRIX.get(matrixKey(inverse));
  if (!result) {
    throw new Error(`Invalid dihedral inverse: ${orientation}`);
  }
  return result;
}

function directionVector(direction: number): { x: number; y: number } {
  switch (direction) {
    case MS_DIRECTION.north:
      return { x: 0, y: -1 };
    case MS_DIRECTION.west:
      return { x: -1, y: 0 };
    case MS_DIRECTION.south:
      return { x: 0, y: 1 };
    case MS_DIRECTION.east:
      return { x: 1, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

function vectorDirection(x: number, y: number): number {
  if (x === 0 && y === -1) return MS_DIRECTION.north;
  if (x === -1 && y === 0) return MS_DIRECTION.west;
  if (x === 0 && y === 1) return MS_DIRECTION.south;
  if (x === 1 && y === 0) return MS_DIRECTION.east;
  return MS_DIRECTION.none;
}

export function transformDirection(direction: number, orientation: DihedralOrientation): number {
  const vector = directionVector(direction);
  const matrix = DIHEDRAL_MATRICES[orientation];
  return vectorDirection(
    matrix.a * vector.x + matrix.c * vector.y,
    matrix.b * vector.x + matrix.d * vector.y,
  );
}

export function displayedDirectionToEngineDirection(
  direction: number,
  orientation: DihedralOrientation,
): number {
  return transformDirection(direction, inverseDihedralOrientation(orientation));
}

function nextRandomState(value: number): number {
  let state = value | 0;
  state ^= state << 13;
  state ^= state >>> 17;
  state ^= state << 5;
  return state >>> 0;
}

export function seededTransformAt(
  seed: number,
  index: number,
  allowed: readonly DihedralTransform[],
): DihedralTransform {
  if (allowed.length === 0) {
    throw new Error("At least one random transform must be enabled.");
  }

  let state = (seed ^ 0x9e_37_79_b9) >>> 0;
  for (let iteration = 0; iteration <= index; iteration += 1) {
    state = nextRandomState(state || 0x6d_2b_79_f5);
  }
  return allowed[state % allowed.length]!;
}

export function interpolateDihedralMatrix(
  from: DihedralOrientation,
  to: DihedralOrientation,
  progress: number,
): DihedralMatrix {
  const clamped = Math.max(0, Math.min(1, progress));
  const left = DIHEDRAL_MATRICES[from];
  const right = DIHEDRAL_MATRICES[to];
  return {
    a: left.a + (right.a - left.a) * clamped,
    b: left.b + (right.b - left.b) * clamped,
    c: left.c + (right.c - left.c) * clamped,
    d: left.d + (right.d - left.d) * clamped,
  };
}

export function transformGameplayRate(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return clamped < 0.5 ? 1 - clamped * 2 : (clamped - 0.5) * 2;
}

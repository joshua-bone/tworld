import { encodeLatin1, readUint32 } from "@content/api/contentBinary";

const NORTH = 1;
const WEST = 2;
const SOUTH = 4;
const EAST = 8;
const IDX_DIR8 = [NORTH, WEST, SOUTH, EAST, NORTH | WEST, SOUTH | WEST, NORTH | EAST, SOUTH | EAST] as const;
const DIR_IDX8 = new Map<number, number>(IDX_DIR8.map((dir, index) => [dir, index]));

export interface SolutionMove {
  when: number;
  dir: number;
}

export interface ExpandedSolutionData {
  flags: number;
  randomSlideDirection: number;
  stepping: number;
  randomSeed: number;
  moves: SolutionMove[];
}

export function normalizeSolutionPassword(password: string): string {
  if (password.length !== 4) {
    throw new Error(`password must be exactly 4 characters: ${password}`);
  }
  return password;
}

function dirToIndex(dir: number): number {
  const index = DIR_IDX8.get(dir);
  if (index === undefined) {
    throw new Error(`direction is not representable in solution encoding: ${dir}`);
  }
  return index;
}

function indexToDir(index: number): number {
  const direction = IDX_DIR8[index];
  if (direction === undefined) {
    throw new Error(`invalid solution direction index: ${index}`);
  }
  return direction;
}

function isMouseMove(dir: number): boolean {
  return !DIR_IDX8.has(dir);
}

function isDiagonal(dir: number): boolean {
  const index = DIR_IDX8.get(dir);
  return index !== undefined && index > 3;
}

function isOrthogonal(dir: number): boolean {
  const index = DIR_IDX8.get(dir);
  return index !== undefined && index <= 3;
}

export function expandSolutionData(data: Uint8Array): ExpandedSolutionData | null {
  if (data.length <= 16) {
    return null;
  }

  const moves: SolutionMove[] = [];
  let when = -1;
  let cursor = 16;

  while (cursor < data.length) {
    switch (data[cursor]! & 0x03) {
      case 0:
        moves.push({ when: (when += 4), dir: indexToDir((data[cursor]! >> 2) & 0x03) });
        moves.push({ when: (when += 4), dir: indexToDir((data[cursor]! >> 4) & 0x03) });
        moves.push({ when: (when += 4), dir: indexToDir((data[cursor]! >> 6) & 0x03) });
        cursor += 1;
        break;
      case 1:
        moves.push({
          when: (when += ((data[cursor]! >> 5) & 0x07) + 1),
          dir: indexToDir((data[cursor]! >> 2) & 0x07),
        });
        cursor += 1;
        break;
      case 2:
        if (cursor + 2 > data.length) {
          throw new Error("truncated solution data");
        }
        moves.push({
          when: (when += ((data[cursor]! >> 5) & 0x07) + (data[cursor + 1]! << 3) + 1),
          dir: indexToDir((data[cursor]! >> 2) & 0x07),
        });
        cursor += 2;
        break;
      case 3:
        if ((data[cursor]! & 0x10) !== 0) {
          const extraBytes = (data[cursor]! >> 2) & 0x03;
          if (cursor + 2 + extraBytes > data.length) {
            throw new Error("truncated solution data");
          }
          let nextWhen = when + ((data[cursor + 1]! >> 6) & 0x03);
          for (let extraIndex = extraBytes - 1; extraIndex >= 0; extraIndex -= 1) {
            nextWhen += data[cursor + 2 + extraIndex]! << (2 + extraIndex * 8);
          }
          moves.push({
            when: nextWhen + 1,
            dir: ((data[cursor]! >> 5) & 0x07) | ((data[cursor + 1]! & 0x3f) << 3),
          });
          when = nextWhen + 1;
          cursor += 2 + extraBytes;
        } else {
          if (cursor + 4 > data.length) {
            throw new Error("truncated solution data");
          }
          when +=
            ((data[cursor]! >> 5) & 0x07) |
            (data[cursor + 1]! << 3) |
            (data[cursor + 2]! << 11) |
            (data[cursor + 3]! << 19);
          when += 1;
          moves.push({
            when,
            dir: indexToDir((data[cursor]! >> 2) & 0x03),
          });
          cursor += 4;
        }
        break;
      default:
        break;
    }
  }

  return {
    flags: data[6]!,
    randomSlideDirection: indexToDir(data[7]! & 0x07),
    stepping: (data[7]! >> 3) & 0x07,
    randomSeed: readUint32(data, 8),
    moves,
  };
}

export function contractSolutionData(
  levelNumber: number,
  password: string,
  bestTimeTicks: number,
  solution: ExpandedSolutionData,
): Uint8Array {
  normalizeSolutionPassword(password);
  if (!solution.moves.length) {
    return new Uint8Array();
  }

  const data: number[] = [
    levelNumber & 0xff,
    (levelNumber >> 8) & 0xff,
    ...encodeLatin1(password),
    solution.flags & 0xff,
    dirToIndex(solution.randomSlideDirection) | ((solution.stepping & 0x07) << 3),
    solution.randomSeed & 0xff,
    (solution.randomSeed >> 8) & 0xff,
    (solution.randomSeed >> 16) & 0xff,
    (solution.randomSeed >> 24) & 0xff,
    bestTimeTicks & 0xff,
    (bestTimeTicks >> 8) & 0xff,
    (bestTimeTicks >> 16) & 0xff,
    (bestTimeTicks >> 24) & 0xff,
  ];

  let when = -1;
  for (let index = 0; index < solution.moves.length; index += 1) {
    const move = solution.moves[index]!;
    let delta = -when - 1;
    when = move.when;
    delta += when;

    if (isMouseMove(move.dir) || (isDiagonal(move.dir) && delta >= 1 << 11)) {
      data.push(0x13 | ((move.dir << 5) & 0xe0));
      data.push(((move.dir >> 3) & 0x3f) | ((delta & 0x03) << 6));
      if (delta >= 1 << 2) {
        data.push((delta >> 2) & 0xff);
        if (delta < 1 << 10) {
          data[data.length - 3] = (data[data.length - 3] ?? 0) | (1 << 2);
        } else {
          data.push((delta >> 10) & 0xff);
          if (delta < 1 << 18) {
            data[data.length - 4] = (data[data.length - 4] ?? 0) | (2 << 2);
          } else {
            data.push((delta >> 18) & 0xff);
            data[data.length - 5] = (data[data.length - 5] ?? 0) | (3 << 2);
          }
        }
      }
      continue;
    }

    if (
      delta === 3 &&
      index + 2 < solution.moves.length &&
      isOrthogonal(move.dir) &&
      solution.moves[index + 1]!.when - move.when === 4 &&
      isOrthogonal(solution.moves[index + 1]!.dir) &&
      solution.moves[index + 2]!.when - solution.moves[index + 1]!.when === 4 &&
      isOrthogonal(solution.moves[index + 2]!.dir)
    ) {
      data.push(
        (dirToIndex(move.dir) << 2) |
          (dirToIndex(solution.moves[index + 1]!.dir) << 4) |
          (dirToIndex(solution.moves[index + 2]!.dir) << 6),
      );
      index += 2;
      when = solution.moves[index]!.when;
      continue;
    }

    if (delta < 1 << 3) {
      data.push(0x01 | (dirToIndex(move.dir) << 2) | ((delta << 5) & 0xe0));
      continue;
    }

    if (delta < 1 << 11) {
      data.push(0x02 | (dirToIndex(move.dir) << 2) | ((delta << 5) & 0xe0));
      data.push((delta >> 3) & 0xff);
      continue;
    }

    data.push(0x03 | (dirToIndex(move.dir) << 2) | ((delta << 5) & 0xe0));
    data.push((delta >> 3) & 0xff);
    data.push((delta >> 11) & 0xff);
    data.push((delta >> 19) & 0xff);
  }

  return Uint8Array.from(data);
}

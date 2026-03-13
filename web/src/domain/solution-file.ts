import type { RulesetName } from "@domain/ruleset";
import { parseSolutionRulesetByte, solutionRulesetByte } from "@domain/ruleset";

const CSSIG = 0x999b3335;
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

export interface SolutionFileEntry {
  levelNumber: number;
  password: string;
  bestTimeTicks: number | null;
  solutionData: Uint8Array | null;
  expandedSolution: ExpandedSolutionData | null;
}

export interface ParsedSolutionFile {
  ruleset: Exclude<RulesetName, "None">;
  flags: number;
  extraHeader: Uint8Array;
  setName: string | null;
  entries: SolutionFileEntry[];
}

function readUint8(data: Uint8Array, offset: number): number {
  if (offset >= data.length) {
    throw new Error("unexpected end of file while reading uint8");
  }
  return data[offset]!;
}

function readUint16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new Error("unexpected end of file while reading uint16");
  }
  return data[offset]! | (data[offset + 1]! << 8);
}

function readUint32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error("unexpected end of file while reading uint32");
  }
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}

function decodeLatin1(data: Uint8Array): string {
  return Array.from(data, (value) => String.fromCharCode(value)).join("").replace(/\0+$/g, "");
}

function encodeLatin1(text: string): number[] {
  return Array.from(text, (char) => {
    const code = char.charCodeAt(0);
    if (code > 0xff) {
      throw new Error(`non-Latin1 character in solution payload: ${char}`);
    }
    return code;
  });
}

function normalizePassword(password: string): string {
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
  normalizePassword(password);
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

export function parseSolutionFile(data: Uint8Array): ParsedSolutionFile {
  let cursor = 0;
  if (readUint32(data, cursor) !== CSSIG) {
    throw new Error("not a valid solution file");
  }
  cursor += 4;

  const ruleset = parseSolutionRulesetByte(readUint8(data, cursor));
  cursor += 1;
  const flags = readUint16(data, cursor);
  cursor += 2;
  const extraSize = readUint8(data, cursor);
  cursor += 1;
  if (cursor + extraSize > data.length) {
    throw new Error("not a valid solution file");
  }
  const extraHeader = data.slice(cursor, cursor + extraSize);
  cursor += extraSize;

  const entries: SolutionFileEntry[] = [];
  let setName: string | null = null;

  while (cursor < data.length) {
    if (cursor + 4 > data.length) {
      throw new Error("truncated solution file entry");
    }
    const size = readUint32(data, cursor);
    cursor += 4;
    if (size === 0) {
      continue;
    }
    if (cursor + size > data.length) {
      throw new Error("truncated solution file entry");
    }

    const entryData = data.slice(cursor, cursor + size);
    cursor += size;
    if (entryData.length <= 16 && entryData.length !== 6) {
      throw new Error("invalid data in solution file");
    }

    const levelNumber = readUint16(entryData, 0);
    const password = decodeLatin1(entryData.slice(2, 6));
    if (entryData.length === 6) {
      entries.push({
        levelNumber,
        password,
        bestTimeTicks: null,
        solutionData: null,
        expandedSolution: null,
      });
      continue;
    }

    const bestTimeTicks = readUint32(entryData, 12);
    if (levelNumber === 0 && password.length === 0) {
      setName = decodeLatin1(entryData.slice(16));
      continue;
    }

    entries.push({
      levelNumber,
      password,
      bestTimeTicks,
      solutionData: entryData,
      expandedSolution: expandSolutionData(entryData),
    });
  }

  return {
    ruleset,
    flags,
    extraHeader,
    setName,
    entries,
  };
}

export function serializeSolutionFile(file: ParsedSolutionFile): Uint8Array {
  const data: number[] = [
    CSSIG & 0xff,
    (CSSIG >> 8) & 0xff,
    (CSSIG >> 16) & 0xff,
    (CSSIG >> 24) & 0xff,
    solutionRulesetByte(file.ruleset),
    file.flags & 0xff,
    (file.flags >> 8) & 0xff,
    file.extraHeader.length & 0xff,
    ...file.extraHeader,
  ];

  if (file.setName) {
    const setNameBytes = [...encodeLatin1(file.setName), 0];
    const size = setNameBytes.length + 16;
    data.push(size & 0xff, (size >> 8) & 0xff, (size >> 16) & 0xff, (size >> 24) & 0xff);
    data.push(...new Array(16).fill(0));
    data.push(...setNameBytes);
  }

  for (const entry of file.entries) {
    normalizePassword(entry.password);
    let payload: Uint8Array;
    if (entry.solutionData) {
      payload = entry.solutionData;
    } else if (entry.expandedSolution && entry.bestTimeTicks !== null) {
      payload = contractSolutionData(entry.levelNumber, entry.password, entry.bestTimeTicks, entry.expandedSolution);
    } else {
      payload = Uint8Array.from([
        entry.levelNumber & 0xff,
        (entry.levelNumber >> 8) & 0xff,
        ...encodeLatin1(entry.password),
      ]);
    }

    data.push(payload.length & 0xff, (payload.length >> 8) & 0xff, (payload.length >> 16) & 0xff, (payload.length >> 24) & 0xff);
    data.push(...payload);
  }

  return Uint8Array.from(data);
}

import {
  contractSolutionData,
  expandSolutionData,
  type ExpandedSolutionData,
  type SolutionMove,
} from "@content/api/solution-file";
import { normalizeGameInputModifierMask } from "@game-core/api/command";

export interface ReplayRecordedMove extends SolutionMove {
  modifierMask?: number;
}

export interface ReplaySolutionPayload {
  flags: number;
  randomSlideDirection: number;
  stepping: number;
  randomSeed: number;
  moves: SolutionMove[];
  modifierMasks?: number[];
}

export interface DecodedReplaySolution {
  levelNumber: number;
  password: string;
  bestTimeTicks: number;
  payload: ReplaySolutionPayload;
}

export interface ReplaySolutionCodec {
  decode(payload: Uint8Array): ReplaySolutionPayload | null;
  inspect(payload: Uint8Array): DecodedReplaySolution | null;
  encode(levelNumber: number, password: string, bestTimeTicks: number, payload: ReplaySolutionPayload): Uint8Array;
}

export function normalizeReplayModifierMasks(moveCount: number, modifierMasks: readonly number[] | null | undefined): number[] {
  const normalized = Array.from({ length: moveCount }, (_, index) =>
    normalizeGameInputModifierMask(modifierMasks?.[index] ?? 0),
  );
  let lastNonZeroIndex = -1;
  for (let index = normalized.length - 1; index >= 0; index -= 1) {
    if (normalized[index] !== 0) {
      lastNonZeroIndex = index;
      break;
    }
  }
  return lastNonZeroIndex < 0 ? [] : normalized.slice(0, lastNonZeroIndex + 1);
}

function readUint16(data: Uint8Array, offset: number): number {
  if (offset + 2 > data.length) {
    throw new Error("unexpected end of replay payload while reading uint16");
  }
  return data[offset]! | (data[offset + 1]! << 8);
}

function readUint32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error("unexpected end of replay payload while reading uint32");
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

export const replaySolutionCodec: ReplaySolutionCodec = {
  decode(payload: Uint8Array): ReplaySolutionPayload | null {
    const expanded = expandSolutionData(payload);
    if (!expanded) {
      return null;
    }
    return {
      ...expanded,
      modifierMasks: [],
    };
  },

  inspect(payload: Uint8Array): DecodedReplaySolution | null {
    const expanded = expandSolutionData(payload);
    if (!expanded) {
      return null;
    }

    return {
      levelNumber: readUint16(payload, 0),
      password: decodeLatin1(payload.slice(2, 6)),
      bestTimeTicks: readUint32(payload, 12),
      payload: {
        ...expanded,
        modifierMasks: [],
      },
    };
  },

  encode(levelNumber: number, password: string, bestTimeTicks: number, payload: ReplaySolutionPayload): Uint8Array {
    return contractSolutionData(levelNumber, password, bestTimeTicks, payload as ExpandedSolutionData);
  },
};

import {
  normalizeReplayModifierMasks,
  replaySolutionCodec,
  type DecodedReplaySolution,
  type ReplaySolutionPayload,
} from "@game-core/api/codec";

const TWSX_MAGIC = Uint8Array.from([0x54, 0x57, 0x53, 0x58]);
const TWSX_VERSION = 1;
const TWSX_HEADER_SIZE = 14;

export interface EncodedReplayTransfer {
  bytes: Uint8Array;
  extension: "tws" | "twsx";
}

function readUint32(data: Uint8Array, offset: number): number {
  if (offset + 4 > data.length) {
    throw new Error("unexpected end of replay transfer while reading uint32");
  }
  return (
    data[offset]! |
    (data[offset + 1]! << 8) |
    (data[offset + 2]! << 16) |
    (data[offset + 3]! << 24)
  ) >>> 0;
}

function writeUint32(value: number): number[] {
  return [
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  ];
}

function isTworldReplayTransferWrapper(bytes: Uint8Array): boolean {
  return TWSX_MAGIC.every((value, index) => bytes[index] === value);
}

function packModifierMasks(masks: readonly number[], moveCount: number): Uint8Array {
  const packed = new Uint8Array(Math.ceil(moveCount / 8));
  for (let index = 0; index < moveCount; index += 1) {
    if ((masks[index] ?? 0) === 0) {
      continue;
    }
    packed[index >> 3] = (packed[index >> 3] ?? 0) | (1 << (index & 7));
  }
  return packed;
}

function unpackModifierMasks(packed: Uint8Array, moveCount: number): number[] {
  return Array.from({ length: moveCount }, (_, index) =>
    ((packed[index >> 3] ?? 0) & (1 << (index & 7))) !== 0 ? 1 : 0,
  );
}

export const replayTransferCodec = {
  encode(levelNumber: number, password: string, bestTimeTicks: number, payload: ReplaySolutionPayload): EncodedReplayTransfer {
    const normalizedMasks = normalizeReplayModifierMasks(payload.moves.length, payload.modifierMasks);
    const baseBytes = replaySolutionCodec.encode(levelNumber, password, bestTimeTicks, payload);
    if (normalizedMasks.length === 0) {
      return {
        bytes: baseBytes,
        extension: "tws",
      };
    }

    const packedMasks = packModifierMasks(normalizedMasks, payload.moves.length);
    const bytes = Uint8Array.from([
      ...TWSX_MAGIC,
      TWSX_VERSION,
      0,
      ...writeUint32(baseBytes.length),
      ...writeUint32(payload.moves.length),
      ...baseBytes,
      ...packedMasks,
    ]);

    return {
      bytes,
      extension: "twsx",
    };
  },

  inspect(bytes: Uint8Array): DecodedReplaySolution | null {
    if (!isTworldReplayTransferWrapper(bytes)) {
      return replaySolutionCodec.inspect(bytes);
    }

    if (bytes.length < TWSX_HEADER_SIZE || bytes[4] !== TWSX_VERSION) {
      return null;
    }

    try {
      const baseLength = readUint32(bytes, 6);
      const moveCount = readUint32(bytes, 10);
      const baseStart = TWSX_HEADER_SIZE;
      const baseEnd = baseStart + baseLength;
      if (baseEnd > bytes.length) {
        return null;
      }

      const packedMasks = bytes.slice(baseEnd);
      const expectedPackedLength = Math.ceil(moveCount / 8);
      if (packedMasks.length !== expectedPackedLength) {
        return null;
      }

      const decoded = replaySolutionCodec.inspect(bytes.slice(baseStart, baseEnd));
      if (!decoded || decoded.payload.moves.length !== moveCount) {
        return null;
      }

      return {
        ...decoded,
        payload: {
          ...decoded.payload,
          modifierMasks: unpackModifierMasks(packedMasks, moveCount),
        },
      };
    } catch {
      return null;
    }
  },
};

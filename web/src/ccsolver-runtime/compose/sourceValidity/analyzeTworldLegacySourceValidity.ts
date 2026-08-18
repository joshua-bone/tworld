const BOARD_WIDTH = 32;
const BOARD_HEIGHT = 32;
const BOARD_CELL_COUNT = BOARD_WIDTH * BOARD_HEIGHT;
const MAX_LAYER_COUNT = 65_536 / BOARD_CELL_COUNT;
const FLOOR_SOURCE_FILE_CODE = 0;
const RLE_MARKER = 0xff;

const LEGACY_INVALID_SOURCE_FILE_CODES = new Set<number>([
  32,
  51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63,
]);

export const TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION =
  "dattools-cell-validity:68be18aca0dc42fa3929ff8160c6c8acea8c18e5";

export type TworldLegacySourceValidityStatus = "valid" | "invalid";

export type TworldLegacySourceValidityReason =
  | "legacy-invalid-file-code"
  | "lower-plane-actor"
  | "nonactor-upper-masks-lower-terrain";

export type TworldLegacySourcePlane = "upper" | "lower";

export interface TworldLegacySourceValidityIssueV1 {
  readonly reason: TworldLegacySourceValidityReason;
  /** One-based source-layer coordinate, matching the DAT decoder. */
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** Zero-based row-major cell ordinal within the source layer. */
  readonly cell: number;
  readonly plane: TworldLegacySourcePlane;
  /** The source file code directly responsible for this issue. */
  readonly sourceFileCode: number;
  readonly upperSourceFileCode: number;
  readonly lowerSourceFileCode: number;
}

export interface TworldLegacySourceValidityReportV1 {
  readonly artifact: "tworld-legacy-source-validity";
  readonly version: 1;
  readonly policyRevision: typeof TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION;
  readonly status: TworldLegacySourceValidityStatus;
  readonly geometry: {
    readonly width: 32;
    readonly height: 32;
    readonly depth: number;
  };
  readonly inspectedCellCount: number;
  readonly issues: readonly TworldLegacySourceValidityIssueV1[];
}

export interface AnalyzeTworldLegacySourceValidityInput {
  /** Bottom-to-top raw DAT level records for one logical map. */
  readonly layerData: readonly Uint8Array[];
}

interface RawSourceLayer {
  readonly upper: readonly number[];
  readonly lower: readonly number[];
}

function requireUint16(data: Uint8Array, offset: number, z: number, field: string): number {
  if (offset < 0 || offset + 2 > data.byteLength) {
    throw new Error(`invalid raw DAT level at z ${z}: missing ${field}`);
  }
  return data[offset]! | (data[offset + 1]! << 8);
}

function decodeRawPlane(
  data: Uint8Array,
  start: number,
  size: number,
  z: number,
  plane: TworldLegacySourcePlane,
): readonly number[] {
  const end = start + size;
  if (!Number.isSafeInteger(end) || start < 0 || size < 0 || end > data.byteLength) {
    throw new Error(`invalid raw DAT level at z ${z}: ${plane} plane exceeds record`);
  }

  const sourceCodes: number[] = [];
  let offset = start;
  while (offset < end) {
    const token = data[offset]!;
    offset += 1;
    if (token !== RLE_MARKER) {
      sourceCodes.push(token);
    } else {
      if (offset + 2 > end) {
        throw new Error(`invalid raw DAT level at z ${z}: truncated ${plane} RLE run`);
      }
      const count = data[offset]!;
      const sourceFileCode = data[offset + 1]!;
      offset += 2;
      if (count === 0) {
        throw new Error(`invalid raw DAT level at z ${z}: empty ${plane} RLE run`);
      }
      if (sourceCodes.length + count > BOARD_CELL_COUNT) {
        throw new Error(`invalid raw DAT level at z ${z}: ${plane} plane exceeds 1024 cells`);
      }
      for (let index = 0; index < count; index += 1) {
        sourceCodes.push(sourceFileCode);
      }
    }

    if (sourceCodes.length > BOARD_CELL_COUNT) {
      throw new Error(`invalid raw DAT level at z ${z}: ${plane} plane exceeds 1024 cells`);
    }
  }

  if (sourceCodes.length !== BOARD_CELL_COUNT) {
    throw new Error(
      `invalid raw DAT level at z ${z}: ${plane} plane expands to ${sourceCodes.length} cells, expected 1024`,
    );
  }
  return sourceCodes;
}

function decodeRawLayer(data: Uint8Array, z: number): RawSourceLayer {
  if (!(data instanceof Uint8Array) || data.byteLength < 14) {
    throw new Error(`invalid raw DAT level at z ${z}: record is too short`);
  }

  const upperSize = requireUint16(data, 8, z, "upper plane size");
  const upperStart = 10;
  const upper = decodeRawPlane(data, upperStart, upperSize, z, "upper");
  const lowerSizeOffset = upperStart + upperSize;
  const lowerSize = requireUint16(data, lowerSizeOffset, z, "lower plane size");
  const lowerStart = lowerSizeOffset + 2;
  const lower = decodeRawPlane(data, lowerStart, lowerSize, z, "lower");
  const metadataSizeOffset = lowerStart + lowerSize;
  const metadataSize = requireUint16(data, metadataSizeOffset, z, "metadata size");
  const recordEnd = metadataSizeOffset + 2 + metadataSize;
  if (!Number.isSafeInteger(recordEnd) || recordEnd !== data.byteLength) {
    throw new Error(`invalid raw DAT level at z ${z}: metadata does not end at record boundary`);
  }

  return { upper, lower };
}

function isInRange(sourceFileCode: number, start: number, end: number): boolean {
  return sourceFileCode >= start && sourceFileCode <= end;
}

/** Mirrors DATTools' source-format actor placement classification. */
function isSourceActor(sourceFileCode: number, z: number, hasHigherLayers: boolean): boolean {
  if (sourceFileCode === 57 && hasHigherLayers) {
    return false;
  }
  if (sourceFileCode === 114 && z > 1) {
    return false;
  }

  return sourceFileCode === 10
    || isInRange(sourceFileCode, 14, 17)
    || isInRange(sourceFileCode, 51, 53)
    || isInRange(sourceFileCode, 57, 99)
    || isInRange(sourceFileCode, 108, 117);
}

function isAllowedInvalidCode(sourceFileCode: number, z: number, hasHigherLayers: boolean): boolean {
  return (sourceFileCode === 32 && z > 1)
    || (sourceFileCode === 57 && hasHigherLayers);
}

function isInvalidSourceCode(sourceFileCode: number, z: number, hasHigherLayers: boolean): boolean {
  return LEGACY_INVALID_SOURCE_FILE_CODES.has(sourceFileCode)
    && !isAllowedInvalidCode(sourceFileCode, z, hasHigherLayers);
}

function isAllowedTerrainPair(upperSourceFileCode: number, lowerSourceFileCode: number, z: number): boolean {
  if (z <= 1) {
    return false;
  }
  return (upperSourceFileCode === 32 && lowerSourceFileCode === 32)
    || (upperSourceFileCode === 114 && lowerSourceFileCode === 32);
}

function issue(
  reason: TworldLegacySourceValidityReason,
  z: number,
  cell: number,
  plane: TworldLegacySourcePlane,
  sourceFileCode: number,
  upperSourceFileCode: number,
  lowerSourceFileCode: number,
): TworldLegacySourceValidityIssueV1 {
  return {
    reason,
    z,
    x: cell % BOARD_WIDTH,
    y: Math.floor(cell / BOARD_WIDTH),
    cell,
    plane,
    sourceFileCode,
    upperSourceFileCode,
    lowerSourceFileCode,
  };
}

export function analyzeTworldLegacySourceValidity(
  input: AnalyzeTworldLegacySourceValidityInput,
): TworldLegacySourceValidityReportV1 {
  if (!Array.isArray(input.layerData) || input.layerData.length < 1 || input.layerData.length > MAX_LAYER_COUNT) {
    throw new Error(`raw DAT source must contain 1 through ${MAX_LAYER_COUNT} layers`);
  }

  const layers = input.layerData.map((data, index) => decodeRawLayer(data, index + 1));
  const hasHigherLayers = layers.length > 1;
  const issues: TworldLegacySourceValidityIssueV1[] = [];

  for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
    const z = layerIndex + 1;
    const layer = layers[layerIndex]!;
    for (let cell = 0; cell < BOARD_CELL_COUNT; cell += 1) {
      const upperSourceFileCode = layer.upper[cell]!;
      const lowerSourceFileCode = layer.lower[cell]!;
      const upperIsActor = isSourceActor(upperSourceFileCode, z, hasHigherLayers);
      const lowerIsActor = isSourceActor(lowerSourceFileCode, z, hasHigherLayers);

      if (isInvalidSourceCode(upperSourceFileCode, z, hasHigherLayers)) {
        issues.push(issue(
          "legacy-invalid-file-code",
          z,
          cell,
          "upper",
          upperSourceFileCode,
          upperSourceFileCode,
          lowerSourceFileCode,
        ));
      }
      if (isInvalidSourceCode(lowerSourceFileCode, z, hasHigherLayers)) {
        issues.push(issue(
          "legacy-invalid-file-code",
          z,
          cell,
          "lower",
          lowerSourceFileCode,
          upperSourceFileCode,
          lowerSourceFileCode,
        ));
      }
      if (lowerIsActor) {
        issues.push(issue(
          "lower-plane-actor",
          z,
          cell,
          "lower",
          lowerSourceFileCode,
          upperSourceFileCode,
          lowerSourceFileCode,
        ));
      } else if (
        !upperIsActor
        && lowerSourceFileCode !== FLOOR_SOURCE_FILE_CODE
        && !isAllowedTerrainPair(upperSourceFileCode, lowerSourceFileCode, z)
      ) {
        issues.push(issue(
          "nonactor-upper-masks-lower-terrain",
          z,
          cell,
          "lower",
          lowerSourceFileCode,
          upperSourceFileCode,
          lowerSourceFileCode,
        ));
      }
    }
  }

  return {
    artifact: "tworld-legacy-source-validity",
    version: 1,
    policyRevision: TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION,
    status: issues.length === 0 ? "valid" : "invalid",
    geometry: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      depth: layers.length,
    },
    inspectedCellCount: layers.length * BOARD_CELL_COUNT,
    issues,
  };
}

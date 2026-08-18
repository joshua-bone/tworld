const BOARD_WIDTH = 32;
const MAX_LAYER_COUNT = 65_536 / (BOARD_WIDTH * BOARD_WIDTH);
const RLE_MARKER = 0xff;

/**
 * Nonstandard DAT extensions supported by Tile World's game engines but
 * deliberately outside every CCSolver facts, analysis, runtime, and corpus
 * input. These are the six named expansion slots in DATTools, not ordinary
 * CC1 elements.
 */
export const TWORLD_SOLVER_EXPANDED_TILES = [
  { sourceFileCode: 0x70, displayName: "Sandbag" },
  { sourceFileCode: 0x71, displayName: "Bowling Ball" },
  { sourceFileCode: 0x72, displayName: "Cloud" },
  { sourceFileCode: 0x73, displayName: "Hook" },
  { sourceFileCode: 0x74, displayName: "Ice Block" },
  { sourceFileCode: 0x75, displayName: "Pet Carrier" },
] as const;

export const TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION =
  "ccsolver-source-scope:no-expanded-cc1-tiles:dattools-68be18aca0dc42fa3929ff8160c6c8acea8c18e5:v1";

export type TworldSolverExpandedTileDisplayName =
  (typeof TWORLD_SOLVER_EXPANDED_TILES)[number]["displayName"];

export interface TworldSolverSourceScopeIssueV1 {
  readonly reason: "expanded-nonstandard-tile";
  /** One-based source-layer coordinate, matching the DAT decoder. */
  readonly z: number;
  readonly x: number;
  readonly y: number;
  /** Zero-based decoded cell ordinal within the source plane. */
  readonly cell: number;
  readonly plane: "upper" | "lower";
  readonly sourceFileCode: number;
  readonly displayName: TworldSolverExpandedTileDisplayName;
}

export interface TworldSolverSourceScopeReportV1 {
  readonly artifact: "tworld-solver-source-scope";
  readonly version: 1;
  readonly policyRevision: typeof TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION;
  readonly status: "eligible" | "excluded";
  readonly inspectedLayerCount: number;
  readonly issues: readonly TworldSolverSourceScopeIssueV1[];
}

export interface AnalyzeTworldSolverSourceScopeInput {
  /** Bottom-to-top raw DAT level records for one logical map. */
  readonly layerData: readonly Uint8Array[];
}

export class TworldSolverSourceScopeError extends Error {
  override readonly name = "TworldSolverSourceScopeError";
  readonly code = "solver-source.expanded-tile" as const;

  constructor(readonly report: TworldSolverSourceScopeReportV1) {
    const first = report.issues[0];
    super(first === undefined
      ? `source is excluded under ${report.policyRevision}`
      : `source uses excluded expanded tile ${first.displayName} `
        + `(0x${first.sourceFileCode.toString(16).padStart(2, "0")}) `
        + `at z ${first.z}, x ${first.x}, y ${first.y}`);
  }
}

const expandedTileBySourceFileCode = new Map<number, TworldSolverExpandedTileDisplayName>(
  TWORLD_SOLVER_EXPANDED_TILES.map((tile) => [tile.sourceFileCode, tile.displayName]),
);

function requireUint16(data: Uint8Array, offset: number, z: number, field: string): number {
  if (offset < 0 || offset + 2 > data.byteLength) {
    throw new Error(`invalid raw DAT level at z ${z}: missing ${field}`);
  }
  return data[offset]! | (data[offset + 1]! << 8);
}

function inspectSourceCode(
  issues: TworldSolverSourceScopeIssueV1[],
  sourceFileCode: number,
  z: number,
  plane: "upper" | "lower",
  startCell: number,
  count: number,
): void {
  const displayName = expandedTileBySourceFileCode.get(sourceFileCode);
  if (displayName === undefined) return;
  for (let offset = 0; offset < count; offset += 1) {
    const cell = startCell + offset;
    issues.push({
      reason: "expanded-nonstandard-tile",
      z,
      x: cell % BOARD_WIDTH,
      y: Math.floor(cell / BOARD_WIDTH),
      cell,
      plane,
      sourceFileCode,
      displayName,
    });
  }
}

function inspectPlane(
  data: Uint8Array,
  start: number,
  size: number,
  z: number,
  plane: "upper" | "lower",
  issues: TworldSolverSourceScopeIssueV1[],
): void {
  const end = start + size;
  if (!Number.isSafeInteger(end) || start < 0 || size < 0 || end > data.byteLength) {
    throw new Error(`invalid raw DAT level at z ${z}: ${plane} plane exceeds record`);
  }

  let cell = 0;
  let offset = start;
  while (offset < end) {
    const token = data[offset]!;
    offset += 1;
    if (token !== RLE_MARKER) {
      inspectSourceCode(issues, token, z, plane, cell, 1);
      cell += 1;
      continue;
    }
    if (offset + 2 > end) {
      throw new Error(`invalid raw DAT level at z ${z}: truncated ${plane} RLE run`);
    }
    const count = data[offset]!;
    const sourceFileCode = data[offset + 1]!;
    offset += 2;
    if (count === 0) {
      throw new Error(`invalid raw DAT level at z ${z}: empty ${plane} RLE run`);
    }
    inspectSourceCode(issues, sourceFileCode, z, plane, cell, count);
    cell += count;
  }
}

function inspectLayer(
  data: Uint8Array,
  z: number,
  issues: TworldSolverSourceScopeIssueV1[],
): void {
  if (!(data instanceof Uint8Array) || data.byteLength < 14) {
    throw new Error(`invalid raw DAT level at z ${z}: record is too short`);
  }
  const upperSize = requireUint16(data, 8, z, "upper plane size");
  const upperStart = 10;
  inspectPlane(data, upperStart, upperSize, z, "upper", issues);
  const lowerSizeOffset = upperStart + upperSize;
  const lowerSize = requireUint16(data, lowerSizeOffset, z, "lower plane size");
  const lowerStart = lowerSizeOffset + 2;
  inspectPlane(data, lowerStart, lowerSize, z, "lower", issues);
  const metadataSizeOffset = lowerStart + lowerSize;
  const metadataSize = requireUint16(data, metadataSizeOffset, z, "metadata size");
  const recordEnd = metadataSizeOffset + 2 + metadataSize;
  if (!Number.isSafeInteger(recordEnd) || recordEnd !== data.byteLength) {
    throw new Error(`invalid raw DAT level at z ${z}: metadata does not end at record boundary`);
  }
}

export function analyzeTworldSolverSourceScope(
  input: AnalyzeTworldSolverSourceScopeInput,
): TworldSolverSourceScopeReportV1 {
  if (
    !Array.isArray(input.layerData)
    || input.layerData.length < 1
    || input.layerData.length > MAX_LAYER_COUNT
  ) {
    throw new Error(`raw DAT source must contain 1 through ${MAX_LAYER_COUNT} layers`);
  }
  const issues: TworldSolverSourceScopeIssueV1[] = [];
  for (let index = 0; index < input.layerData.length; index += 1) {
    inspectLayer(input.layerData[index]!, index + 1, issues);
  }
  return {
    artifact: "tworld-solver-source-scope",
    version: 1,
    policyRevision: TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
    status: issues.length === 0 ? "eligible" : "excluded",
    inspectedLayerCount: input.layerData.length,
    issues,
  };
}

export function assertTworldSolverSourceScope(
  input: AnalyzeTworldSolverSourceScopeInput,
): TworldSolverSourceScopeReportV1 {
  const report = analyzeTworldSolverSourceScope(input);
  if (report.status !== "eligible") throw new TworldSolverSourceScopeError(report);
  return report;
}

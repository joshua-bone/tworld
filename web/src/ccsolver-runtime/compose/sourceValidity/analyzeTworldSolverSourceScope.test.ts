import { describe, expect, it } from "vitest";
import {
  TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
  TworldSolverSourceScopeError,
  analyzeTworldSolverSourceScope,
  assertTworldSolverSourceScope,
} from "./analyzeTworldSolverSourceScope";

const BOARD_CELL_COUNT = 32 * 32;

function encodePlane(sourceCodes: readonly number[]): number[] {
  const encoded: number[] = [];
  for (let start = 0; start < sourceCodes.length;) {
    const sourceCode = sourceCodes[start]!;
    let count = 1;
    while (
      start + count < sourceCodes.length
      && sourceCodes[start + count] === sourceCode
      && count < 0xff
    ) {
      count += 1;
    }
    if (count === 1 && sourceCode !== 0xff) encoded.push(sourceCode);
    else encoded.push(0xff, count, sourceCode);
    start += count;
  }
  return encoded;
}

function levelData(
  upperOverrides: Readonly<Record<number, number>> = {},
  lowerOverrides: Readonly<Record<number, number>> = {},
): Uint8Array {
  const upper = Array<number>(BOARD_CELL_COUNT).fill(0);
  const lower = Array<number>(BOARD_CELL_COUNT).fill(0);
  for (const [cell, sourceCode] of Object.entries(upperOverrides)) upper[Number(cell)] = sourceCode;
  for (const [cell, sourceCode] of Object.entries(lowerOverrides)) lower[Number(cell)] = sourceCode;
  const encodedUpper = encodePlane(upper);
  const encodedLower = encodePlane(lower);
  return Uint8Array.from([
    1, 0,
    0, 0,
    0, 0,
    0, 0,
    encodedUpper.length & 0xff, encodedUpper.length >> 8,
    ...encodedUpper,
    encodedLower.length & 0xff, encodedLower.length >> 8,
    ...encodedLower,
    0, 0,
  ]);
}

describe("the CCSolver source-scope policy", () => {
  it("pins the expanded-tile catalog authority to the audited DATTools revision", () => {
    expect(TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION).toBe(
      "ccsolver-source-scope:no-expanded-cc1-tiles:dattools-68be18aca0dc42fa3929ff8160c6c8acea8c18e5:v1",
    );
  });

  it("excludes the exact six Tile World expanded DAT codes with human names", () => {
    const report = analyzeTworldSolverSourceScope({
      layerData: [levelData({
        0: 0x70,
        1: 0x71,
        2: 0x72,
        3: 0x73,
        4: 0x74,
        5: 0x75,
      })],
    });

    expect(report).toMatchObject({
      artifact: "tworld-solver-source-scope",
      version: 1,
      policyRevision: TWORLD_SOLVER_EXPANDED_TILE_POLICY_REVISION,
      status: "excluded",
      inspectedLayerCount: 1,
    });
    expect(report.issues.map((issue) => ({
      cell: issue.cell,
      displayName: issue.displayName,
      plane: issue.plane,
      sourceFileCode: issue.sourceFileCode,
    }))).toEqual([
      { cell: 0, displayName: "Sandbag", plane: "upper", sourceFileCode: 0x70 },
      { cell: 1, displayName: "Bowling Ball", plane: "upper", sourceFileCode: 0x71 },
      { cell: 2, displayName: "Cloud", plane: "upper", sourceFileCode: 0x72 },
      { cell: 3, displayName: "Hook", plane: "upper", sourceFileCode: 0x73 },
      { cell: 4, displayName: "Ice Block", plane: "upper", sourceFileCode: 0x74 },
      { cell: 5, displayName: "Pet Carrier", plane: "upper", sourceFileCode: 0x75 },
    ]);
  });

  it("excludes expanded codes on either plane and on every source layer", () => {
    const report = analyzeTworldSolverSourceScope({
      layerData: [
        levelData({}, { 7: 0x70 }),
        levelData({ 8: 0x72 }),
      ],
    });

    expect(report.issues).toEqual([
      expect.objectContaining({ z: 1, cell: 7, plane: "lower", sourceFileCode: 0x70 }),
      expect.objectContaining({ z: 2, cell: 8, plane: "upper", sourceFileCode: 0x72 }),
    ]);
  });

  it("leaves standard CC1 tiles eligible and fails closed through the assertion seam", () => {
    expect(analyzeTworldSolverSourceScope({
      layerData: [levelData({ 0: 0x31 })],
    })).toMatchObject({ status: "eligible", issues: [] });

    expect(() => assertTworldSolverSourceScope({
      layerData: [levelData({ 12: 0x74 })],
    })).toThrow(TworldSolverSourceScopeError);
    try {
      assertTworldSolverSourceScope({ layerData: [levelData({ 12: 0x74 })] });
    } catch (error) {
      expect(error).toMatchObject({
        code: "solver-source.expanded-tile",
        report: {
          status: "excluded",
          issues: [expect.objectContaining({ displayName: "Ice Block" })],
        },
      });
    }
  });
});

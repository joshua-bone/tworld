import { describe, expect, it } from "vitest";
import {
  TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION,
  analyzeTworldLegacySourceValidity,
} from "./analyzeTworldLegacySourceValidity";

const BOARD_WIDTH = 32;
const BOARD_CELL_COUNT = BOARD_WIDTH * BOARD_WIDTH;
const FLOOR = 0;

function encodePlane(sourceCodes: readonly number[]): number[] {
  const encoded: number[] = [];
  let start = 0;

  while (start < sourceCodes.length) {
    const sourceCode = sourceCodes[start]!;
    let count = 1;
    while (
      start + count < sourceCodes.length
      && sourceCodes[start + count] === sourceCode
      && count < 0xff
    ) {
      count += 1;
    }

    if (count === 1 && sourceCode !== 0xff) {
      encoded.push(sourceCode);
    } else {
      encoded.push(0xff, count, sourceCode);
    }
    start += count;
  }

  return encoded;
}

function createLevelData(
  upperOverrides: Readonly<Record<number, number>> = {},
  lowerOverrides: Readonly<Record<number, number>> = {},
): Uint8Array {
  const upper = Array<number>(BOARD_CELL_COUNT).fill(FLOOR);
  const lower = Array<number>(BOARD_CELL_COUNT).fill(FLOOR);
  for (const [cell, sourceCode] of Object.entries(upperOverrides)) {
    upper[Number(cell)] = sourceCode;
  }
  for (const [cell, sourceCode] of Object.entries(lowerOverrides)) {
    lower[Number(cell)] = sourceCode;
  }

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

describe("analyzeTworldLegacySourceValidity", () => {
  it("accepts ordinary actor-over-terrain cells", () => {
    const report = analyzeTworldLegacySourceValidity({
      layerData: [createLevelData({ 37: 108 }, { 37: 3 })],
    });

    expect(report).toEqual({
      artifact: "tworld-legacy-source-validity",
      version: 1,
      policyRevision: TWORLD_LEGACY_SOURCE_VALIDITY_POLICY_REVISION,
      status: "valid",
      geometry: { width: 32, height: 32, depth: 1 },
      inspectedCellCount: 1_024,
      issues: [],
    });
  });

  it("rejects a nonactor upper tile that masks meaningful lower terrain", () => {
    const report = analyzeTworldLegacySourceValidity({
      layerData: [createLevelData({}, { 65: 3 })],
    });

    expect(report.status).toBe("invalid");
    expect(report.issues).toEqual([
      {
        reason: "nonactor-upper-masks-lower-terrain",
        z: 1,
        x: 1,
        y: 2,
        cell: 65,
        plane: "lower",
        sourceFileCode: 3,
        upperSourceFileCode: 0,
        lowerSourceFileCode: 3,
      },
    ]);
  });

  it("rejects actors on the lower plane", () => {
    const report = analyzeTworldLegacySourceValidity({
      layerData: [createLevelData({ 7: 1 }, { 7: 64 })],
    });

    expect(report.issues).toEqual([
      {
        reason: "lower-plane-actor",
        z: 1,
        x: 7,
        y: 0,
        cell: 7,
        plane: "lower",
        sourceFileCode: 64,
        upperSourceFileCode: 1,
        lowerSourceFileCode: 64,
      },
    ]);
  });

  it("retains invalid source file codes through RLE instead of accepting decoder aliases", () => {
    const report = analyzeTworldLegacySourceValidity({
      layerData: [createLevelData({ 900: 54 })],
    });

    expect(report.issues).toEqual([
      {
        reason: "legacy-invalid-file-code",
        z: 1,
        x: 4,
        y: 28,
        cell: 900,
        plane: "upper",
        sourceFileCode: 54,
        upperSourceFileCode: 54,
        lowerSourceFileCode: 0,
      },
    ]);
  });

  it("allows the exact 3D air, cloud, and elevator source encodings", () => {
    const lowerLayer = createLevelData({ 2: 57 });
    const upperLayer = createLevelData(
      { 0: 32, 1: 114 },
      { 0: 32, 1: 32 },
    );

    const report = analyzeTworldLegacySourceValidity({
      layerData: [lowerLayer, upperLayer],
    });

    expect(report.status).toBe("valid");
    expect(report.geometry.depth).toBe(2);
    expect(report.inspectedCellCount).toBe(2_048);
    expect(report.issues).toEqual([]);
  });

  it("does not allow the 3D-only air and elevator aliases outside their remap contexts", () => {
    const singleLayer = analyzeTworldLegacySourceValidity({
      layerData: [createLevelData({ 0: 32, 1: 57 })],
    });
    const airOnZ1 = analyzeTworldLegacySourceValidity({
      layerData: [createLevelData({ 0: 32 }), createLevelData()],
    });

    expect(singleLayer.issues.map((issue) => ({
      cell: issue.cell,
      reason: issue.reason,
      sourceFileCode: issue.sourceFileCode,
    }))).toEqual([
      { cell: 0, reason: "legacy-invalid-file-code", sourceFileCode: 32 },
      { cell: 1, reason: "legacy-invalid-file-code", sourceFileCode: 57 },
    ]);
    expect(airOnZ1.issues).toEqual([
      expect.objectContaining({
        reason: "legacy-invalid-file-code",
        z: 1,
        cell: 0,
        sourceFileCode: 32,
      }),
    ]);
  });

  it("orders independent violations canonically and is byte-stable across cloned inputs", () => {
    const layer = createLevelData(
      { 40: 54, 3: 1 },
      { 40: 64, 3: 3 },
    );
    const first = analyzeTworldLegacySourceValidity({ layerData: [layer] });
    const second = analyzeTworldLegacySourceValidity({
      layerData: [new Uint8Array(layer)],
    });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(first.issues.map((issue) => [issue.cell, issue.reason, issue.plane])).toEqual([
      [3, "nonactor-upper-masks-lower-terrain", "lower"],
      [40, "legacy-invalid-file-code", "upper"],
      [40, "lower-plane-actor", "lower"],
    ]);
  });

  it("rejects a record without its trailing metadata-size field", () => {
    const complete = createLevelData();
    const truncated = complete.slice(0, complete.byteLength - 2);

    expect(() => analyzeTworldLegacySourceValidity({
      layerData: [truncated],
    })).toThrow("missing metadata size");
  });
});

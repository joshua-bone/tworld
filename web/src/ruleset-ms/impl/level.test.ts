import { describe, expect, it } from "vitest";
import { decodeMsLevelData, prepareMsLevel } from "@ruleset-ms/api/level";
import { MS_STATUS_FLAG, MS_TICKS_PER_SECOND, MS_TILE } from "@ruleset-ms/api/tiles";

function createMinimalLevelData(): Uint8Array {
  return Uint8Array.from([
    7, 0,
    12, 0,
    3, 0,
    0, 0,
    1, 0,
    1,
    0, 0,
    0, 0,
  ]);
}

describe("ms level preparation", () => {
  it("decodes DAT bytes into raw level data", () => {
    const decoded = decodeMsLevelData(createMinimalLevelData());

    expect(decoded.number).toBe(7);
    expect(decoded.timeLimitSeconds).toBe(12);
    expect(decoded.chipsNeeded).toBe(3);
    expect(decoded.cells[0]?.top.id).toBe(MS_TILE.Wall);
    expect(decoded.cells[1]?.top.id).toBe(0);
    expect(decoded.badTiles).toBe(false);
  });

  it("prepares decoded MS level data into runtime ticks and flags", () => {
    const prepared = prepareMsLevel({
      number: 9,
      timeLimitSeconds: 15,
      chipsNeeded: 4,
      hintText: "hint",
      cells: [],
      traps: [],
      cloners: [],
      creaturePositions: [12],
      badTiles: true,
    });

    expect(prepared.timeLimitTicks).toBe(15 * MS_TICKS_PER_SECOND);
    expect(prepared.statusFlags).toBe(MS_STATUS_FLAG.BadTiles);
    expect(prepared.creaturePositions).toEqual([12]);
    expect(prepared.hintText).toBe("hint");
  });
});

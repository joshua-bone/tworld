import { describe, expect, it } from "vitest";
import {
  advanceToCell,
  advancePositionIfPossible,
  canAdvancePosition,
  directionCode,
  directionDelta,
  directionName,
  isPositionInBounds,
  nextPosition,
  normalizeCardinalDirection,
  reverseDirection,
  roundedBoardPosition,
} from "@game-core/impl/grid";

describe("grid core helpers", () => {
  it("maps direction names and codes", () => {
    expect(directionName(1)).toBe("north");
    expect(directionName(8)).toBe("east");
    expect(directionName(0)).toBe("none");
    expect(directionCode("south")).toBe(4);
    expect(directionCode("none")).toBe(0);
  });

  it("normalizes diagonal cardinal input to vertical movement", () => {
    expect(normalizeCardinalDirection(1 | 8)).toBe(1);
    expect(normalizeCardinalDirection(4 | 2)).toBe(4);
    expect(normalizeCardinalDirection(8)).toBe(8);
  });

  it("computes reverse directions and position stepping", () => {
    expect(reverseDirection(1)).toBe(4);
    expect(reverseDirection(2)).toBe(8);
    expect(reverseDirection(3)).toBe(0);
    expect(directionDelta(1, 32)).toBe(-32);
    expect(directionDelta(8, 32)).toBe(1);
    expect(nextPosition(33, 1, 32)).toBe(1);
  });

  it("checks board bounds and diagonal advance legality", () => {
    expect(isPositionInBounds(0, 32, 32)).toBe(true);
    expect(isPositionInBounds(1024, 32, 32)).toBe(false);
    expect(canAdvancePosition(0, 2, 32, 32)).toBe(false);
    expect(canAdvancePosition(0, 8, 32, 32)).toBe(true);
    expect(canAdvancePosition(0, 1 | 8, 32, 32)).toBe(false);
    expect(canAdvancePosition(33, 1 | 8, 32, 32)).toBe(true);
    expect(advancePositionIfPossible(0, 2, 32, 32)).toBeNull();
    expect(advancePositionIfPossible(0, 8, 32, 32)).toBe(1);
    expect(advanceToCell(["a", "b"], 0, 8, 2, 1)).toEqual({ pos: 1, cell: "b" });
    expect(advanceToCell(["a", "b"], 0, 2, 2, 1)).toBeNull();
  });

  it("rounds view coordinates to a board position", () => {
    expect(roundedBoardPosition(15, 23, 32, 32, 8)).toEqual({ x: 2, y: 3, pos: 98 });
    expect(roundedBoardPosition(-20, 999, 32, 32, 8)).toEqual({ x: 0, y: 31, pos: 992 });
  });
});

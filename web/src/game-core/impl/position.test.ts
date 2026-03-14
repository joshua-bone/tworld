import { describe, expect, it } from "vitest";
import { boardGamePosition, projectGamePosition } from "@game-core/impl/position";

describe("position helpers", () => {
  it("omits z for base-layer board positions", () => {
    expect(boardGamePosition(33, 32)).toEqual({ x: 1, y: 1, pos: 33 });
    expect(boardGamePosition(33, 32, 1)).toEqual({ x: 1, y: 1, pos: 33 });
  });

  it("preserves z for upper-layer board positions", () => {
    expect(boardGamePosition(33, 32, 2)).toEqual({ x: 1, y: 1, z: 2, pos: 33 });
  });

  it("projects runtime positions without leaking z1", () => {
    expect(projectGamePosition({ x: 1, y: 2, z: 1, pos: 65 })).toEqual({ x: 1, y: 2, pos: 65 });
    expect(projectGamePosition({ x: 1, y: 2, z: 3, pos: 65 })).toEqual({ x: 1, y: 2, z: 3, pos: 65 });
  });
});

import { describe, expect, it } from "vitest";
import { cloneBoardCells, popBoardTile, promoteBottomTile, pushBoardTile } from "@domain/game/core/board";
import type { EngineMapCell } from "@domain/game/model";

function makeCell(): EngineMapCell {
  return {
    position: { x: 1, y: 2, pos: 65 },
    top: { id: 10, state: 11 },
    bottom: { id: 20, state: 21 },
  };
}

describe("board core helpers", () => {
  it("clones board cells deeply enough for engine projection use", () => {
    const source = [makeCell()];
    const clone = cloneBoardCells(source);

    expect(clone).toEqual(source);
    expect(clone[0]).not.toBe(source[0]);
    expect(clone[0]?.top).not.toBe(source[0]?.top);
    expect(clone[0]?.bottom).not.toBe(source[0]?.bottom);
  });

  it("pushes a tile onto the top layer", () => {
    const cells = [makeCell()];

    pushBoardTile(cells, 0, { id: 30, state: 31 });

    expect(cells[0]).toEqual({
      position: { x: 1, y: 2, pos: 65 },
      top: { id: 30, state: 31 },
      bottom: { id: 10, state: 11 },
    });
  });

  it("promotes the bottom tile and clears the lower layer", () => {
    const cells = [makeCell()];

    promoteBottomTile(cells, 0, 1);

    expect(cells[0]).toEqual({
      position: { x: 1, y: 2, pos: 65 },
      top: { id: 20, state: 21 },
      bottom: { id: 1, state: 0 },
    });
  });

  it("pops the top tile while returning the removed tile", () => {
    const cells = [makeCell()];

    const tile = popBoardTile(cells, 0, 1);

    expect(tile).toEqual({ id: 10, state: 11 });
    expect(cells[0]).toEqual({
      position: { x: 1, y: 2, pos: 65 },
      top: { id: 20, state: 21 },
      bottom: { id: 1, state: 0 },
    });
  });
});

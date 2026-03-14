import { describe, expect, it } from "vitest";
import {
  addBottomTileFlags,
  addTopTileFlags,
  boardCell,
  bottomTile,
  bottomTileId,
  cloneBoardCells,
  popBoardTile,
  promoteBottomTile,
  pushBoardTile,
  removeBottomTileFlags,
  removeTopTileFlags,
  replaceBottomTile,
  replaceTopTile,
  topTile,
  topTileId,
} from "@domain/game/core/board";
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

  it("reads the active cell layers through shared accessors", () => {
    const cells = [makeCell()];

    expect(boardCell(cells, 0)).toBe(cells[0]);
    expect(topTile(cells, 0)).toBe(cells[0]?.top);
    expect(bottomTile(cells, 0)).toBe(cells[0]?.bottom);
    expect(topTileId(cells, 0)).toBe(10);
    expect(bottomTileId(cells, 0)).toBe(20);
  });

  it("replaces and mutates top and bottom layers through shared helpers", () => {
    const cells = [makeCell()];

    replaceTopTile(cells, 0, { id: 30, state: 1 });
    replaceBottomTile(cells, 0, { id: 40, state: 2 });
    addTopTileFlags(cells, 0, 4);
    addBottomTileFlags(cells, 0, 8);
    removeTopTileFlags(cells, 0, 1);
    removeBottomTileFlags(cells, 0, 2);

    expect(cells[0]).toEqual({
      position: { x: 1, y: 2, pos: 65 },
      top: { id: 30, state: 4 },
      bottom: { id: 40, state: 8 },
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

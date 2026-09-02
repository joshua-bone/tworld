import { describe, expect, it } from "vitest";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import {
  attenuatingSightCell,
  clearSightCell,
  computeSpecialModesLineOfSight,
  opaqueSightCell,
  type SpecialModesSightCell,
} from "@player-web/impl/specialModesVisibility";

function grid(width: number, height: number, fill: () => SpecialModesSightCell): SpecialModesSightCell[] {
  return Array.from({ length: width * height }, fill);
}

function pos(x: number, y: number, width: number): number {
  return y * width + x;
}

describe("specialModesVisibility", () => {
  it("fans through a hallway opening but preserves the shadows cast by its corners", () => {
    const width = 9;
    const height = 9;
    const cells = grid(width, height, opaqueSightCell);
    for (let x = 1; x <= 4; x += 1) cells[pos(x, 4, width)] = clearSightCell();
    for (let y = 2; y <= 6; y += 1) {
      for (let x = 5; x <= 8; x += 1) cells[pos(x, y, width)] = clearSightCell();
    }

    const visible = computeSpecialModesLineOfSight({ cells, originPos: pos(1, 4, width), width, height });
    expect(visible[pos(7, 4, width)]).toBe(1);
    expect(visible[pos(7, 3, width)]).toBe(1);
    expect(visible[pos(7, 2, width)]).toBe(0);
  });

  it("does not bend visibility around an L-shaped corner", () => {
    const width = 8;
    const height = 8;
    const cells = grid(width, height, opaqueSightCell);
    for (let x = 1; x <= 4; x += 1) cells[pos(x, 2, width)] = clearSightCell();
    for (let y = 2; y <= 6; y += 1) cells[pos(4, y, width)] = clearSightCell();

    const visible = computeSpecialModesLineOfSight({ cells, originPos: pos(1, 2, width), width, height });
    expect(visible[pos(4, 2, width)]).toBe(1);
    expect(visible[pos(4, 5, width)]).toBe(0);
  });

  it("shows opaque boundary cells but hides cells behind them", () => {
    const cells = grid(5, 1, clearSightCell);
    cells[2] = opaqueSightCell();
    const visible = computeSpecialModesLineOfSight({ cells, originPos: 0, width: 5, height: 1 });
    expect([...visible]).toEqual([1, 1, 1, 0, 0]);
  });

  it("halves transmission beyond pickups and uses the strongest clear path", () => {
    const cells = grid(5, 3, clearSightCell);
    cells[pos(2, 1, 5)] = attenuatingSightCell();
    const visible = computeSpecialModesLineOfSight({ cells, originPos: pos(0, 1, 5), width: 5, height: 3 });
    expect(visible[pos(4, 1, 5)]).toBe(0.5);
    expect(visible[pos(4, 0, 5)]).toBe(1);
  });

  it("blocks sight at thin-wall edges without making the whole cell opaque", () => {
    const cells = grid(3, 2, clearSightCell);
    cells[pos(1, 0, 3)] = { transmission: 1, edgeMask: MS_DIRECTION.east };
    const visible = computeSpecialModesLineOfSight({ cells, originPos: pos(0, 0, 3), width: 3, height: 2 });
    expect(visible[pos(1, 0, 3)]).toBe(1);
    expect(visible[pos(2, 0, 3)]).toBe(0);
    expect(visible[pos(2, 1, 3)]).toBe(1);
  });
});

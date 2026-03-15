import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import { projectInteractiveVisibleLayers } from "@game-core/impl/interactiveProjection";

function createLayer(z: number): { z: number; cells: EngineMapCell[] } {
  return {
    z,
    cells: [
      {
        position: {
          x: 0,
          y: 0,
          z,
          pos: 0,
        },
        top: {
          id: z,
          state: 0,
        },
        bottom: {
          id: 0,
          state: 0,
        },
      },
    ],
  };
}

describe("projectInteractiveVisibleLayers", () => {
  it("projects the current layer and up to the next three lower layers", () => {
    const layers = [createLayer(1), createLayer(2), createLayer(3), createLayer(4), createLayer(5)];

    const visible = projectInteractiveVisibleLayers(layers[4]!.cells, 5, layers);

    expect(visible.map((layer) => layer.z)).toEqual([5, 4, 3, 2]);
    expect(visible[0]!.cells[0]!.top.id).toBe(5);
    expect(visible[1]!.cells[0]!.top.id).toBe(4);
  });

  it("falls back to a single visible layer for ordinary 2d frames", () => {
    const cells = [
      {
        position: {
          x: 0,
          y: 0,
          pos: 0,
        },
        top: {
          id: 7,
          state: 0,
        },
        bottom: {
          id: 0,
          state: 0,
        },
      },
    ] satisfies EngineMapCell[];

    const visible = projectInteractiveVisibleLayers(cells, 1);

    expect(visible.map((layer) => layer.z)).toEqual([1]);
    expect(visible[0]!.cells).not.toBe(cells);
    expect(visible[0]!.cells[0]!.position.z).toBeUndefined();
  });
});

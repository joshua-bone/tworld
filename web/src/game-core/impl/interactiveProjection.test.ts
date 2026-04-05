import { describe, expect, it } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import { projectInteractiveFrame, projectInteractiveVisibleLayers } from "@game-core/impl/interactiveProjection";

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

function createTwoCellLayer(z: number, topIds: [number, number]): { z: number; cells: EngineMapCell[] } {
  return {
    z,
    cells: topIds.map((topId, pos) => ({
      position: {
        x: pos,
        y: 0,
        z,
        pos,
      },
      top: {
        id: topId,
        state: 0,
      },
      bottom: {
        id: 0,
        state: 0,
      },
    })),
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

  it("prefers the layer cells that match the current z when layered runtime state is available", () => {
    const layers = [createLayer(1), createLayer(2)];

    const visible = projectInteractiveVisibleLayers(layers[0]!.cells, 2, layers);

    expect(visible.map((layer) => layer.z)).toEqual([2, 1]);
    expect(visible[0]!.cells[0]!.top.id).toBe(2);
    expect(visible[1]!.cells[0]!.top.id).toBe(1);
  });

  it("reuses unchanged projected layers from the previous frame", () => {
    const layers = [createLayer(1), createLayer(2)];
    const previous = projectInteractiveFrame({} as never, layers[1]!.cells, null, {
      currentZ: 2,
      layers,
    });

    const next = projectInteractiveFrame({} as never, layers[1]!.cells, null, {
      currentZ: 2,
      layers,
      previousFrame: previous,
    });

    expect(next.visibleLayers[0]).toBe(previous.visibleLayers[0]);
    expect(next.visibleLayers[1]).toBe(previous.visibleLayers[1]);
    expect(next.cells).toBe(previous.cells);
  });

  it("replaces only the changed projected cells when a layered board mutates", () => {
    const layers = [createLayer(1), createTwoCellLayer(2, [2, 2])];
    const previous = projectInteractiveFrame({} as never, layers[1]!.cells, null, {
      currentZ: 2,
      layers,
    });

    layers[1]!.cells[1]!.top.id = 9;

    const next = projectInteractiveFrame({} as never, layers[1]!.cells, null, {
      currentZ: 2,
      layers,
      previousFrame: previous,
    });

    expect(next.visibleLayers[0]).not.toBe(previous.visibleLayers[0]);
    expect(next.visibleLayers[0]!.cells[0]).toBe(previous.visibleLayers[0]!.cells[0]);
    expect(next.visibleLayers[0]!.cells[1]).not.toBe(previous.visibleLayers[0]!.cells[1]);
    expect(next.visibleLayers[1]).toBe(previous.visibleLayers[1]);
  });
});

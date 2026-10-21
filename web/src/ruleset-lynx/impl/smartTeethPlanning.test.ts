import { describe, expect, it } from "vitest";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { createBoardAtZ, createCell, pos } from "@ruleset-lynx/impl/testSupport";
import { lynxSmartTeethNeighbors, type LynxSmartTeethProbeContext } from "@ruleset-lynx/impl/smartTeeth";
import { lynxToggledWallTileId } from "@ruleset-lynx/impl/catalog";

describe("Lynx safe route probes", () => {
  it("records the physical portal entrance for a remote teleport step", () => {
    const cells = createBoardAtZ(1);
    cells[pos(4, 3)] = createCell(pos(4, 3), MS_TILE.Teleport);
    cells[pos(20, 3)] = createCell(pos(20, 3), MS_TILE.Teleport);
    const agent = { serial: 1, pos: pos(3, 3), dir: MS_DIRECTION.east, z: 1 };
    const context = { cells, currentTime: 8, effectiveTileId: (id: number) => id, isBlocked: () => false };
    expect(lynxSmartTeethNeighbors(context, agent, agent))
      .toContainEqual({ pos: pos(20, 3), dir: MS_DIRECTION.east, via: pos(4, 3) });
  });

  it("opens closed toggle walls in the simulated state after a green-button arrival without mutating the board", () => {
    const cells = createBoardAtZ(1);
    cells[pos(3, 3)] = createCell(pos(3, 3), MS_TILE.Button_Green);
    cells[pos(4, 3)] = createCell(pos(4, 3), MS_TILE.SwitchWall_Closed);
    const before = structuredClone(cells);
    const agent = { serial: 1, pos: pos(3, 4), dir: MS_DIRECTION.north, z: 1 };
    const context = { cells, currentTime: 8, effectiveTileId: (id: number) => id, isBlocked: () => false };
    const arrival = lynxSmartTeethNeighbors(context, agent, agent).find((candidate) => candidate.pos === pos(3, 3));
    expect(arrival).toEqual({ pos: pos(3, 3), dir: MS_DIRECTION.north, toggled: true });
    expect(lynxSmartTeethNeighbors(context, agent, arrival!))
      .toContainEqual({ pos: pos(4, 3), dir: MS_DIRECTION.east, toggled: true });
    expect(cells).toEqual(before);
  });

  it("blocks newly closed walls and restores the original parity on a second button arrival", () => {
    const cells = createBoardAtZ(1);
    cells[pos(4, 3)] = createCell(pos(4, 3), MS_TILE.SwitchWall_Open);
    cells[pos(3, 2)] = createCell(pos(3, 2), MS_TILE.Button_Green);
    const agent = { serial: 1, pos: pos(3, 4), dir: MS_DIRECTION.north, z: 1 };
    const context = { cells, currentTime: 8, effectiveTileId: (id: number) => id, isBlocked: () => false };
    const toggled = { pos: pos(3, 3), dir: MS_DIRECTION.north, toggled: true };
    const neighbors = lynxSmartTeethNeighbors(context, agent, toggled);
    expect(neighbors.map((candidate) => candidate.pos)).not.toContain(pos(4, 3));
    expect(neighbors).toContainEqual({ pos: pos(3, 2), dir: MS_DIRECTION.north });
  });

  it("composes planned parity with an already pending real toggle", () => {
    const cells = createBoardAtZ(1);
    cells[pos(4, 3)] = createCell(pos(4, 3), MS_TILE.SwitchWall_Closed);
    const agent = { serial: 1, pos: pos(3, 3), dir: MS_DIRECTION.east, z: 1 };
    const context = { cells, currentTime: 8, effectiveTileId: lynxToggledWallTileId, isBlocked: () => false };
    expect(lynxSmartTeethNeighbors(context, agent, agent)).toContainEqual({ pos: pos(4, 3), dir: MS_DIRECTION.east });
    expect(lynxSmartTeethNeighbors(context, agent, { ...agent, toggled: true }).map((candidate) => candidate.pos))
      .not.toContain(pos(4, 3));
  });

  it("follows the held direction through an open trap without changing any cells", () => {
    const cells = createBoardAtZ(1);
    cells[pos(3, 3)] = createCell(pos(3, 3), MS_TILE.Beartrap);
    const before = structuredClone(cells);
    const agent = { serial: 1, pos: pos(3, 3), dir: MS_DIRECTION.east, z: 1 };
    const context: LynxSmartTeethProbeContext = {
      cells,
      currentTime: 8,
      effectiveTileId: (id) => id,
      isBlocked: () => false,
      isReleased: () => true,
    };
    expect(lynxSmartTeethNeighbors(context, agent, agent)).toEqual([{ pos: pos(4, 3), dir: MS_DIRECTION.east }]);
    expect(cells).toEqual(before);
  });

  it("turns a corner-ice arrival once and keeps an already turned actor facing", () => {
    const cells = createBoardAtZ(1);
    cells[pos(3, 3)] = createCell(pos(3, 3), MS_TILE.IceWall_Northeast);
    const context = { cells, currentTime: 8, effectiveTileId: (id: number) => id, isBlocked: () => false };
    const agent = { serial: 1, pos: pos(4, 3), dir: MS_DIRECTION.west, z: 1 };
    expect(lynxSmartTeethNeighbors(context, agent, { pos: pos(3, 3), dir: MS_DIRECTION.west }))
      .toEqual([{ pos: pos(3, 2), dir: MS_DIRECTION.north }]);
    const turnedActor = { ...agent, pos: pos(3, 3), dir: MS_DIRECTION.north };
    expect(lynxSmartTeethNeighbors(context, turnedActor, turnedActor))
      .toEqual([{ pos: pos(3, 2), dir: MS_DIRECTION.north }]);
    const arrivingActor = { ...turnedActor, dir: MS_DIRECTION.west };
    expect(lynxSmartTeethNeighbors({ ...context, rootMoving: true }, arrivingActor, arrivingActor))
      .toEqual([{ pos: pos(3, 2), dir: MS_DIRECTION.north }]);
  });

  it("does not invent an ice bounce when the forward move is physically legal but lethal", () => {
    const cells = createBoardAtZ(1);
    cells[pos(3, 3)] = createCell(pos(3, 3), MS_TILE.Ice);
    cells[pos(4, 3)] = createCell(pos(4, 3), MS_TILE.Water);
    const agent = { serial: 1, pos: pos(3, 3), dir: MS_DIRECTION.east, z: 1 };
    expect(lynxSmartTeethNeighbors({ cells, currentTime: 8, effectiveTileId: (id) => id, isBlocked: () => false }, agent, agent))
      .toEqual([]);
  });
});

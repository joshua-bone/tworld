import { describe, expect, it, vi } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import { moveMsCreatureDownOneLayer, moveMsCreaturePlanar, type MsCreatureMovementContext, type MsCreatureMovementCreature } from "@ruleset-ms/impl/creatureMovement";
import { createEmptyCells, createEmptyCellsAtZ, pos } from "@ruleset-ms/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

function createCreature(overrides: Partial<MsCreatureMovementCreature> = {}): MsCreatureMovementCreature {
  return {
    serial: 1,
    id: MS_TILE.Ball,
    dir: MS_DIRECTION.east,
    pos: pos(1, 1),
    z: 1,
    hidden: false,
    moving: 0,
    released: false,
    turning: false,
    hasMoved: false,
    floorMovement: "none",
    floorMovementDir: MS_DIRECTION.none,
    ...overrides,
  };
}

function createContext(overrides: Partial<MsCreatureMovementContext> = {}): MsCreatureMovementContext {
  return {
    pushTile: () => {},
    popTile: () => {},
    applyMobExitFloorEffect: () => {},
    updateCreatureTile: () => {},
    handlePreMoveCollision: () => null,
    resolveButtonFloorEffects: () => 0,
    isTrapOpen: () => false,
    hasTrapConnection: () => false,
    chipActsWallForMobs: () => false,
    arrivalOutcome: () => "none",
    runtimeCellZ: (cells: EngineMapCell[], position: number) => cells[position]!.position.z ?? 1,
    clearCreatureFloorMovement: () => {},
    syncCreatureFloorMovement: () => {},
    syncVerticalFloorMovement: () => {},
    applyArrivalEffects: () => 0,
    removeStatefulActor: () => {},
    findTeleportDestination: (cells: EngineMapCell[], start: number) => start,
    ...overrides,
  };
}

describe("ms creatureMovement", () => {
  it("does not preserve tank hasMoved when slip direction is missing", () => {
    const cells = createEmptyCells();
    const oldPos = pos(1, 1);
    const nextPos = pos(2, 1);
    cells[oldPos]!.top.id = msCreatureTile(MS_TILE.Tank, MS_DIRECTION.east);
    cells[nextPos]!.top.id = MS_TILE.Empty;
    const creature = createCreature({
      id: MS_TILE.Tank,
      pos: oldPos,
      turning: true,
      hasMoved: true,
      floorMovement: "slide",
      floorMovementDir: MS_DIRECTION.none,
    });

    moveMsCreaturePlanar(createContext(), cells, creature, MS_DIRECTION.east, () => {});

    expect(creature.hasMoved).toBe(false);
  });

  it("clears creature floor movement instead of syncing when dropping onto ice", () => {
    const sourceCells = createEmptyCellsAtZ(2);
    const targetCells = createEmptyCellsAtZ(1);
    const creaturePos = pos(1, 1);
    sourceCells[creaturePos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    targetCells[creaturePos]!.top.id = MS_TILE.IceWall_Southeast;
    const creature = createCreature({
      pos: creaturePos,
      z: 2,
      floorMovement: "air",
      floorMovementDir: MS_DIRECTION.south,
    });
    const clearCreatureFloorMovement = vi.fn((trackedCreature: MsCreatureMovementCreature) => {
      trackedCreature.floorMovement = "none";
      trackedCreature.floorMovementDir = MS_DIRECTION.none;
    });
    const syncCreatureFloorMovement = vi.fn();
    const syncVerticalFloorMovement = vi.fn();
    const context = createContext({
      clearCreatureFloorMovement,
      syncCreatureFloorMovement,
      syncVerticalFloorMovement,
    });

    const result = moveMsCreatureDownOneLayer(context, sourceCells, targetCells, creature, () => {});

    expect(result.status).toBe("moved");
    expect(clearCreatureFloorMovement).toHaveBeenCalledTimes(1);
    expect(syncCreatureFloorMovement).not.toHaveBeenCalled();
    expect(syncVerticalFloorMovement).not.toHaveBeenCalled();
    expect(creature.z).toBe(1);
    expect(creature.floorMovement).toBe("none");
    expect(creature.floorMovementDir).toBe(MS_DIRECTION.none);
  });

  it("routes air-landing Chip collision through support-family hooks", () => {
    const sourceCells = createEmptyCellsAtZ(2);
    const targetCells = createEmptyCellsAtZ(1);
    const creaturePos = pos(1, 1);
    sourceCells[creaturePos]!.top.id = msCreatureTile(MS_TILE.Ball, MS_DIRECTION.east);
    targetCells[creaturePos]!.bottom.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.south);
    const creature = createCreature({
      pos: creaturePos,
      z: 2,
      floorMovement: "air",
    });
    const setChipCollided = vi.fn();

    moveMsCreatureDownOneLayer(createContext(), sourceCells, targetCells, creature, setChipCollided);

    expect(setChipCollided).toHaveBeenCalledTimes(1);
  });
});

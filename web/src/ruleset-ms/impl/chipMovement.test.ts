import { describe, expect, it, vi } from "vitest";
import type { EngineMapCell } from "@game-core/api/model";
import type { MsChipEnteredTileResolution } from "@ruleset-ms/impl/chipArrival";
import { moveMsChipDownOneLayer, type MsChipMovementContext, type MsChipMovementInternal } from "@ruleset-ms/impl/chipMovement";
import { createEmptyCellsAtZ, pos } from "@ruleset-ms/impl/testSupport";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";

function createInternal(overrides: Partial<MsChipMovementInternal> = {}): MsChipMovementInternal {
  return {
    chipPos: pos(1, 1),
    chipZ: 2,
    chipDir: MS_DIRECTION.east,
    goalPos: -1,
    chipStatus: "okay",
    chipReleased: false,
    floorMovement: "air",
    floorMovementDir: MS_DIRECTION.south,
    completed: false,
    ...overrides,
  };
}

function createEnteredTileResolution(tileId: number): MsChipEnteredTileResolution {
  return {
    enteredTeleport: false,
    soundEffects: 0,
    floorTileBeforeMove: { id: tileId, state: 0 },
    movementFloorTile: { id: tileId, state: 0 },
  };
}

function createContext(
  internal: MsChipMovementInternal,
  overrides: Partial<MsChipMovementContext> = {},
): MsChipMovementContext {
  return {
    internal,
    runtimeCellZ: (cells: EngineMapCell[], position: number) => cells[position]!.position.z ?? 1,
    applyEnterEffects: () => createEnteredTileResolution(MS_TILE.IceWall_Southeast),
    teleportDestination: () => ({ destination: internal.chipPos, soundEffects: 0 }),
    popTile: () => {},
    applyMobExitFloorEffect: () => {},
    pushTile: () => {},
    settlePrimedToolDrop: () => {},
    preservesUnderlyingFloor: () => false,
    updateChipTile: () => {},
    resolveButtonFloorEffects: () => 0,
    isTrapOpen: () => false,
    hasTrapConnection: () => false,
    refreshFloorMovement: () => {},
    handleDeferredButtons: () => 0,
    isExitFloor: () => false,
    hasIceBoot: () => false,
    elevatorDestinationFloor: (cell) => cell.top.id,
    isValidElevatorDestinationFloor: () => true,
    pushStaticBlock: () => false,
    normalizeDirection: (dir) => dir,
    ...overrides,
  };
}

describe("ms chipMovement", () => {
  it("does not refresh floor movement when dropping onto ice without ice boots", () => {
    const sourceCells = createEmptyCellsAtZ(2);
    const targetCells = createEmptyCellsAtZ(1);
    const chipPos = pos(1, 1);
    sourceCells[chipPos]!.top.id = msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east);
    targetCells[chipPos]!.top.id = MS_TILE.IceWall_Southeast;
    const internal = createInternal({ chipPos });
    const refreshFloorMovement = vi.fn();
    const updateChipTile = vi.fn();
    const context = createContext(internal, { refreshFloorMovement, updateChipTile });

    const result = moveMsChipDownOneLayer(context, sourceCells, targetCells);

    expect(result.status).toBe("moved");
    expect(refreshFloorMovement).not.toHaveBeenCalled();
    expect(updateChipTile).toHaveBeenCalledTimes(1);
    expect(internal.floorMovement).toBe("none");
    expect(internal.floorMovementDir).toBe(MS_DIRECTION.none);
    expect(internal.chipDir).toBe(MS_DIRECTION.east);
    expect(targetCells[chipPos]!.top.id).toBe(msCreatureTile(MS_TILE.Chip, MS_DIRECTION.east));
  });
});

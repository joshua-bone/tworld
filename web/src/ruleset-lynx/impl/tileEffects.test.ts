import { describe, expect, it } from "vitest";
import type { EngineMapCell, EngineState } from "@game-core/api/model";
import { createActorInventoryOwnerId, createKeysBootsActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { MS_DIRECTION, MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  applyLynxBlockedChipEnterEffect,
  applyLynxMobExitFloorEffect,
  applyLynxTileActivationEffect,
  resolveLynxTileSupportBelow,
} from "@ruleset-lynx/impl/tileEffects";

function makeCell(topId: number, bottomId: number = MS_TILE.Empty): EngineMapCell {
  return {
    position: { x: 0, y: 0, z: 1, pos: 0 },
    top: { id: topId, state: 0 },
    bottom: { id: bottomId, state: 0 },
  };
}

function makeState(cell: EngineMapCell): EngineState {
  return {
    request: { seriesFile: "", levelNumber: 1, ruleset: "Lynx" },
    status: "playing",
    timer: { tick: 0, currentTime: 0, timeOffset: 0, secondsPlayed: 0, timeLimit: 0 },
    inventory: {
      keys: [0, 0, 0, 0],
      boots: [0, 0, 0, 0],
      tools: [0],
      chipsNeeded: 0,
    },
    replay: {
      cursor: 0,
      stepping: 0,
      moveCount: 0,
      bestTimeTicks: 0,
      initialRandomSlideDirection: "north",
      randomState: {
        main: { initial: "0", value: "0", shared: false },
        lynx: { prng1: 0, prng2: 0 },
      },
    },
    chip: null,
    actors: [],
    map: {
      hash: "",
      creaturesHash: "",
      creatureCount: 0,
      cells: [cell],
    },
    view: { x: 0, y: 0 },
    soundEffects: 0,
    statusFlags: 0,
    lastMove: { code: 0, name: "none" },
  };
}

describe("lynx tile effects", () => {
  it("reveals blocked hidden walls through the blocked-enter effect", () => {
    const state = makeState(makeCell(MS_TILE.BlueWall_Real));

    expect(applyLynxBlockedChipEnterEffect(state, 0)).toBe(true);
    expect(state.map.cells[0]!.top.id).toBe(MS_TILE.Wall);
  });

  it("reveals a blocked hidden wall under an occupant through the blocked-enter effect", () => {
    const state = makeState(makeCell(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west), MS_TILE.BlueWall_Real));

    expect(applyLynxBlockedChipEnterEffect(state, 0)).toBe(true);
    expect(state.map.cells[0]!.top.id).toBe(msCreatureTile(MS_TILE.Bug, MS_DIRECTION.west));
    expect(state.map.cells[0]!.bottom.id).toBe(MS_TILE.Wall);
  });

  it("routes button activation through callbacks", () => {
    let toggled = false;
    const sound = applyLynxTileActivationEffect(
      {
        queueTankReversals: () => {},
        toggleWalls: () => {
          toggled = true;
        },
        activateCloner: () => false,
        buttonPushedSound: 1,
      },
      0,
      MS_TILE.Button_Green,
    );

    expect(toggled).toBe(true);
    expect(sound).toBe(1);
  });

  it("uses support tile effects to open fake blue walls out from under Chip", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    const lowerCells = [makeCell(MS_TILE.BlueWall_Fake, MS_TILE.Empty)];

    const result = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner: null,
      },
    );

    expect(result).toBe("unsupported");
    expect(lowerCells[0]!.top.id).toBe(MS_TILE.Empty);
  });

  it("uses tile support handlers to treat a lower clone machine as support", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    const lowerCells = [makeCell(MS_TILE.Empty, MS_TILE.CloneMachine)];

    const result = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner: null,
      },
    );

    expect(result).toBe("supported");
  });

  it("uses tile support handlers to open a supporting green door when the actor has the key", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    const lowerCells = [makeCell(MS_TILE.Door_Green, MS_TILE.Empty)];
    const inventoryOwner = createKeysBootsActorLocalInventoryOwner(createActorInventoryOwnerId("test", 1), {
      keys: [0, 0, 0, 1],
      boots: [0, 0, 0, 0],
    });

    const result = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner,
      },
    );

    expect(result).toBe("unsupported");
    expect(lowerCells[0]!.top.id).toBe(MS_TILE.Empty);
    expect(inventoryOwner.inventory.keys[3]).toBe(1);
  });

  it("uses tile support handlers to open a supporting socket once chips are no longer needed", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    const lowerCells = [makeCell(MS_TILE.Socket, MS_TILE.Empty)];

    const result = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner: null,
      },
    );

    expect(result).toBe("unsupported");
    expect(lowerCells[0]!.top.id).toBe(MS_TILE.Empty);
  });

  it("treats a fake blue wall as support for non-chip actors", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    const lowerCells = [makeCell(MS_TILE.BlueWall_Fake, MS_TILE.Empty)];

    const result = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "non-chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner: null,
      },
    );

    expect(result).toBe("supported");
    expect(lowerCells[0]!.top.id).toBe(MS_TILE.BlueWall_Fake);
  });

  it("treats a portable item as support for non-chip actors but not for Chip", () => {
    const state = makeState(makeCell(MS_TILE.Empty));
    const lowerCells = [makeCell(MS_TILE.Sandbag, MS_TILE.Empty)];

    const supported = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "non-chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner: null,
      },
    );
    const unsupported = resolveLynxTileSupportBelow(
      {
        state,
        chipPos: 0,
        chipZ: 1,
        addTileOverlay: () => {},
        chipActsWallForMobs: () => false,
        findVisibleActorAt: () => null,
      },
      lowerCells,
      0,
      1,
      2,
      {
        supportHooks: {
          airHook: "chip-support",
          unsupportedOutcome: "fall",
          supportLossOutcome: "fall",
          fallingCollisionBehavior: "default",
        },
        inventoryOwner: null,
      },
    );

    expect(supported).toBe("supported");
    expect(unsupported).toBe("unsupported");
  });

  it("turns an exited top-layer cloud into air", () => {
    const cells = [makeCell(MS_TILE.Cloud)];

    expect(applyLynxMobExitFloorEffect(cells, 0)).toBe(true);
    expect(cells[0]!.top.id).toBe(MS_TILE.Air);
  });

  it("turns an exited underlying cloud into air beneath a portable item", () => {
    const cells = [makeCell(MS_TILE.Sandbag, MS_TILE.Cloud)];

    expect(applyLynxMobExitFloorEffect(cells, 0)).toBe(true);
    expect(cells[0]!.top.id).toBe(MS_TILE.Sandbag);
    expect(cells[0]!.bottom.id).toBe(MS_TILE.Air);
  });
});

import { describe, expect, it, vi } from "vitest";
import { GAME_INPUT_CODES, GAME_INPUT_MODIFIER_MASKS, encodeRuntimeInputCode } from "@game-core/api/command";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import { PET_CARRIER_ACTION_COOLDOWN_TICKS, createPetCarrierCooldownState, createPetCarrierState } from "@game-core/impl/petCarrier";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  applyMsPortableToolAction,
  applyMsPortableToolPostMoveAction,
  msPortableToolMoveModifierEnabled,
  msPortableToolMoveModifierEnabledForCarriedItem,
} from "@ruleset-ms/impl/portableToolActions";
import type { MsPortableToolStateStore, MsToolInventoryProjection } from "@ruleset-ms/impl/portableItems";

function createInventory(tileId = 0): MsToolInventoryProjection {
  return {
    tools: [tileId],
  };
}

function createStore(item?: MsPortableToolStateStore["portableItems"][number]): MsPortableToolStateStore {
  return {
    portableItems: item ? [item] : [],
    nextPortableItemSerial: 2,
    primedToolDrop: null,
    pendingToolDropAfterSettle: null,
  };
}

describe("ms portableToolActions", () => {
  it("primes non-bowling portable tools through the shared drop flow", () => {
    const store = createStore({
      serial: 1,
      family: "sandbag",
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });
    const inventory = createInventory(MS_TILE.Sandbag);
    const tryActivateMovingItem = vi.fn();

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryActivateMovingItem,
        snatchFacingMob: () => null,
      }),
    ).toBe(true);

    expect(store.primedToolDrop).toEqual({
      tileId: MS_TILE.Sandbag,
      pos: 44,
      z: 1,
    });
    expect(tryActivateMovingItem).not.toHaveBeenCalled();
  });

  it("routes bowling-ball action to the throw callback", () => {
    const store = createStore({
      serial: 1,
      family: "bowling-ball",
      tileId: MS_TILE.BowlingBall_Still,
      inventorySlot: "tools",
      bowlingBallState: createStillBowlingBallState(MS_DIRECTION.east),
      state: { mode: "carried" },
    });
    const inventory = createInventory(MS_TILE.BowlingBall_Still);
    const tryActivateMovingItem = vi.fn(() => true);

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryActivateMovingItem,
        snatchFacingMob: () => null,
      }),
    ).toBe(true);

    expect(tryActivateMovingItem).toHaveBeenCalledWith(store.portableItems[0], MS_DIRECTION.east);
    expect(store.primedToolDrop).toBeNull();
    expect(inventory.tools).toEqual([MS_TILE.BowlingBall_Still]);
  });

  it("keeps a bowling ball carried when throw activation fails", () => {
    const item = {
      serial: 1,
      family: "bowling-ball" as const,
      tileId: MS_TILE.BowlingBall_Still,
      inventorySlot: "tools" as const,
      bowlingBallState: createStillBowlingBallState(MS_DIRECTION.east),
      state: { mode: "carried" as const },
    };
    const store = createStore(item);
    const inventory = createInventory(MS_TILE.BowlingBall_Still);

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryActivateMovingItem: () => false,
        snatchFacingMob: () => null,
      }),
    ).toBe(false);

    expect(store.portableItems[0]).toBe(item);
    expect(store.portableItems[0]?.state).toEqual({ mode: "carried" });
    expect(inventory.tools).toEqual([MS_TILE.BowlingBall_Still]);
    expect(store.primedToolDrop).toBeNull();
  });

  it("does not prime a hook through the portable Action1 flow", () => {
    const store = createStore({
      serial: 1,
      family: "hook",
      tileId: MS_TILE.Hook,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });
    const inventory = createInventory(MS_TILE.Hook);

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.west,
        tryActivateMovingItem: () => false,
        snatchFacingMob: () => null,
      }),
    ).toBe(false);

    expect(store.primedToolDrop).toBeNull();
    expect(inventory.tools).toEqual([MS_TILE.Hook]);
  });

  it("enables the movement modifier only for a carried hook with Action1 held", () => {
    const hookStore = createStore({
      serial: 1,
      family: "hook",
      tileId: MS_TILE.Hook,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });
    const sandbagStore = createStore({
      serial: 1,
      family: "sandbag",
      tileId: MS_TILE.Sandbag,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });
    const action1Input = encodeRuntimeInputCode(GAME_INPUT_CODES.none, GAME_INPUT_MODIFIER_MASKS.action1);

    expect(msPortableToolMoveModifierEnabled(hookStore, action1Input)).toBe(true);
    expect(msPortableToolMoveModifierEnabled(sandbagStore, action1Input)).toBe(false);
    expect(
      msPortableToolMoveModifierEnabledForCarriedItem(hookStore.portableItems[0], GAME_INPUT_MODIFIER_MASKS.action1),
    ).toBe(true);
  });

  it("routes empty pet carrier action to the snatch callback and stores cooldown state", () => {
    const store = createStore({
      serial: 1,
      family: "pet-carrier",
      tileId: MS_TILE.PetCarrier,
      inventorySlot: "tools",
      petCarrierState: createPetCarrierState(),
      state: { mode: "carried" },
    });
    const inventory = createInventory(MS_TILE.PetCarrier);
    const snatchFacingMob = vi.fn(() => ({
      actorId: MS_TILE.Bug,
      dir: MS_DIRECTION.north,
    }));

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryActivateMovingItem: () => false,
        snatchFacingMob,
      }),
    ).toBe(true);

    expect(snatchFacingMob).toHaveBeenCalledTimes(1);
    expect(store.portableItems[0]).toMatchObject({
      family: "pet-carrier",
      petCarrierState: {
        occupant: {
          actorId: MS_TILE.Bug,
          dir: MS_DIRECTION.north,
        },
        cooldown: {
          kind: "after-snatch",
          remainingTicks: PET_CARRIER_ACTION_COOLDOWN_TICKS,
        },
      },
    });
  });

  it("does not snatch with an occupied or cooling-down pet carrier", () => {
    const occupiedStore = createStore({
      serial: 1,
      family: "pet-carrier",
      tileId: MS_TILE.PetCarrier,
      inventorySlot: "tools",
      petCarrierState: createPetCarrierState({
        occupant: {
          actorId: MS_TILE.Bug,
          dir: MS_DIRECTION.west,
        },
      }),
      state: { mode: "carried" },
    });
    const coolingStore = createStore({
      serial: 1,
      family: "pet-carrier",
      tileId: MS_TILE.PetCarrier,
      inventorySlot: "tools",
      petCarrierState: createPetCarrierState({
        cooldown: createPetCarrierCooldownState("after-release"),
      }),
      state: { mode: "carried" },
    });
    const snatchFacingMob = vi.fn(() => ({
      actorId: MS_TILE.Bug,
      dir: MS_DIRECTION.east,
    }));

    expect(
      applyMsPortableToolAction({
        store: occupiedStore,
        inventory: createInventory(MS_TILE.PetCarrier),
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryActivateMovingItem: () => false,
        snatchFacingMob,
      }),
    ).toBe(false);
    expect(
      applyMsPortableToolAction({
        store: coolingStore,
        inventory: createInventory(MS_TILE.PetCarrier),
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryActivateMovingItem: () => false,
        snatchFacingMob,
      }),
    ).toBe(false);

    expect(snatchFacingMob).not.toHaveBeenCalled();
    expect(occupiedStore.portableItems[0]).toMatchObject({
      petCarrierState: {
        occupant: {
          actorId: MS_TILE.Bug,
          dir: MS_DIRECTION.west,
        },
      },
    });
    expect(coolingStore.portableItems[0]).toMatchObject({
      petCarrierState: {
        occupant: null,
        cooldown: {
          kind: "after-release",
          remainingTicks: PET_CARRIER_ACTION_COOLDOWN_TICKS,
        },
      },
    });
  });

  it("runs post-move hook tug only after a successful same-layer move", () => {
    const resolveSourceStep = vi.fn((originPos: number, dir: number) => ({
      pos: originPos + dir,
      supportTileId: MS_TILE.Empty,
    }));
    const sourceHasMoveModifierTarget = vi.fn(() => true);
    const applyMoveModifier = vi.fn();

    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: true,
      originPos: 10,
      originZ: 1,
      landedPos: 11,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      resolveSourceStep,
      sourceHasMoveModifierTarget,
      applyMoveModifier,
    });
    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: false,
      originPos: 10,
      originZ: 1,
      landedPos: 11,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      resolveSourceStep,
      sourceHasMoveModifierTarget,
      applyMoveModifier,
    });
    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: true,
      originPos: 10,
      originZ: 1,
      landedPos: 10,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      resolveSourceStep,
      sourceHasMoveModifierTarget,
      applyMoveModifier,
    });

    expect(resolveSourceStep).toHaveBeenCalledTimes(1);
    expect(sourceHasMoveModifierTarget).toHaveBeenCalledTimes(1);
    expect(applyMoveModifier).toHaveBeenCalledTimes(1);
    expect(applyMoveModifier).toHaveBeenCalledWith(12, MS_DIRECTION.east);
  });

  it("skips the move modifier when the source step is clone-machine backed or untuggable", () => {
    const applyMoveModifier = vi.fn();

    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: true,
      originPos: 10,
      originZ: 1,
      landedPos: 11,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      resolveSourceStep: () => ({ pos: 9, supportTileId: MS_TILE.CloneMachine }),
      sourceHasMoveModifierTarget: () => true,
      applyMoveModifier,
    });
    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: true,
      originPos: 10,
      originZ: 1,
      landedPos: 11,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      resolveSourceStep: () => ({ pos: 9, supportTileId: MS_TILE.Empty }),
      sourceHasMoveModifierTarget: () => false,
      applyMoveModifier,
    });

    expect(applyMoveModifier).not.toHaveBeenCalled();
  });
});

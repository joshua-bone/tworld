import { describe, expect, it, vi } from "vitest";
import { GAME_INPUT_CODES, GAME_INPUT_MODIFIER_MASKS, encodeRuntimeInputCode } from "@game-core/api/command";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
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
    const tryThrowBowlingBall = vi.fn();

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryThrowBowlingBall,
      }),
    ).toBe(true);

    expect(store.primedToolDrop).toEqual({
      tileId: MS_TILE.Sandbag,
      pos: 44,
      z: 1,
    });
    expect(tryThrowBowlingBall).not.toHaveBeenCalled();
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
    const tryThrowBowlingBall = vi.fn(() => true);

    expect(
      applyMsPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        tryThrowBowlingBall,
      }),
    ).toBe(true);

    expect(tryThrowBowlingBall).toHaveBeenCalledWith(store.portableItems[0], MS_DIRECTION.east);
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
        tryThrowBowlingBall: () => false,
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
        tryThrowBowlingBall: () => false,
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

  it("runs post-move hook tug only after a successful same-layer move", () => {
    const applyHookTug = vi.fn();

    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: true,
      originPos: 10,
      originZ: 1,
      landedPos: 11,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      applyHookTug,
    });
    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: false,
      originPos: 10,
      originZ: 1,
      landedPos: 11,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      applyHookTug,
    });
    applyMsPortableToolPostMoveAction({
      moveModifierEnabled: true,
      movementSucceeded: true,
      originPos: 10,
      originZ: 1,
      landedPos: 10,
      landedZ: 1,
      moveDir: MS_DIRECTION.east,
      applyHookTug,
    });

    expect(applyHookTug).toHaveBeenCalledTimes(1);
    expect(applyHookTug).toHaveBeenCalledWith(10, 1, MS_DIRECTION.east);
  });
});

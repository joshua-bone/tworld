import { describe, expect, it, vi } from "vitest";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { applyLynxPortableToolAction } from "@ruleset-lynx/impl/portableToolActions";
import type { LynxPortableToolStateStore, LynxToolInventoryProjection } from "@ruleset-lynx/impl/portableItems";

function createInventory(tileId = 0): LynxToolInventoryProjection {
  return {
    tools: [tileId],
  };
}

function createStore(item?: LynxPortableToolStateStore["portableItems"][number]): LynxPortableToolStateStore {
  return {
    portableItems: item ? [item] : [],
    nextPortableItemSerial: 2,
    primedToolDrop: null,
  };
}

describe("lynx portableToolActions", () => {
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
      applyLynxPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        moveInputDir: MS_DIRECTION.none,
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
      applyLynxPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        moveInputDir: MS_DIRECTION.none,
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
      applyLynxPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.east,
        moveInputDir: MS_DIRECTION.none,
        tryThrowBowlingBall: () => false,
      }),
    ).toBe(false);

    expect(store.portableItems[0]).toBe(item);
    expect(store.portableItems[0]?.state).toEqual({ mode: "carried" });
    expect(inventory.tools).toEqual([MS_TILE.BowlingBall_Still]);
    expect(store.primedToolDrop).toBeNull();
  });

  it("does not prime a hook during directional Action1 input", () => {
    const store = createStore({
      serial: 1,
      family: "hook",
      tileId: MS_TILE.Hook,
      inventorySlot: "tools",
      state: { mode: "carried" },
    });
    const inventory = createInventory(MS_TILE.Hook);

    expect(
      applyLynxPortableToolAction({
        store,
        inventory,
        chipPos: 44,
        chipZ: 1,
        chipDir: MS_DIRECTION.west,
        moveInputDir: MS_DIRECTION.west,
        tryThrowBowlingBall: () => false,
      }),
    ).toBe(false);

    expect(store.primedToolDrop).toBeNull();
    expect(inventory.tools).toEqual([MS_TILE.Hook]);
  });
});

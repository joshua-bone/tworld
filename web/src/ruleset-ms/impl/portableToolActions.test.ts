import { describe, expect, it, vi } from "vitest";
import { createStillBowlingBallState } from "@game-core/impl/bowlingBall";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { applyMsPortableToolAction } from "@ruleset-ms/impl/portableToolActions";
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
});

import { describe, expect, it, vi } from "vitest";
import {
  actorFloorImpactBombDestroys,
  actorFloorImpactDestroysEnteringActor,
  actorFloorImpactHoldsDirection,
  actorFloorImpactRevertsPortable,
  actorFloorImpactTeleports,
  actorFloorImpactTransformClearsFloor,
  actorFloorImpactTransformTurnsToDirt,
  actorFloorImpactTransformsFloor,
  applyActorFloorImpactAction,
} from "@game-core/impl/floorImpact";

describe("floorImpact", () => {
  it("collects chips and items through the shared floor-impact helper", () => {
    const clearFloor = vi.fn();
    const consumeEnteredOverlay = vi.fn();

    const chipArrival = applyActorFloorImpactAction("collect-chip", {
      clearFloor,
      consumeEnteredOverlay,
      collectTile: () => ({ collected: true, collectedChip: true }),
      soundEffects: {
        icCollected: 4,
        itemCollected: 8,
      },
    });
    expect(chipArrival).toEqual({ status: "resolved", soundEffects: 4 });

    const itemArrival = applyActorFloorImpactAction("collect-item", {
      clearFloor,
      consumeEnteredOverlay,
      collectTile: () => ({ collected: true, collectedChip: false }),
      soundEffects: {
        icCollected: 4,
        itemCollected: 8,
      },
    });
    expect(itemArrival).toEqual({ status: "resolved", soundEffects: 8 });
    expect(consumeEnteredOverlay).toHaveBeenCalledTimes(2);
    expect(clearFloor).not.toHaveBeenCalled();
  });

  it("opens doors and sockets only when their guards succeed", () => {
    const clearFloor = vi.fn();
    const consumeEnteredOverlay = vi.fn();

    expect(
      applyActorFloorImpactAction("open-door", {
        clearFloor,
        consumeEnteredOverlay,
        tryOpenDoor: () => false,
        soundEffects: { doorOpened: 1 },
      }),
    ).toEqual({ status: "none", soundEffects: 0 });

    expect(
      applyActorFloorImpactAction("open-socket", {
        clearFloor,
        consumeEnteredOverlay,
        tryOpenSocket: () => true,
        soundEffects: { socketOpened: 2 },
      }),
    ).toEqual({ status: "resolved", soundEffects: 2 });

    expect(consumeEnteredOverlay).toHaveBeenCalledTimes(1);
    expect(clearFloor).not.toHaveBeenCalled();
  });

  it("routes trap, button, popup wall, thief, and exit through explicit outcomes", () => {
    const popupWall = vi.fn();
    const clearBootsAndTools = vi.fn();

    expect(
      applyActorFloorImpactAction("button", {
        resolveButtonEffects: () => 3,
        soundEffects: {},
      }),
    ).toEqual({ status: "resolved", soundEffects: 3 });

    expect(
      applyActorFloorImpactAction("trap", {
        soundEffects: { trapEntered: 5 },
      }),
    ).toEqual({ status: "resolved", soundEffects: 5 });

    expect(
      applyActorFloorImpactAction("popup-wall", {
        popupWall,
        soundEffects: { wallCreated: 6 },
      }),
    ).toEqual({ status: "resolved", soundEffects: 6 });

    expect(
      applyActorFloorImpactAction("steal-boots-tools", {
        clearBootsAndTools,
        soundEffects: { bootsStolen: 7 },
      }),
    ).toEqual({ status: "resolved", soundEffects: 7 });

    expect(
      applyActorFloorImpactAction("exit", {
        soundEffects: { chipWins: 9 },
      }),
    ).toEqual({ status: "completed", soundEffects: 9 });

    expect(popupWall).toHaveBeenCalledOnce();
    expect(clearBootsAndTools).toHaveBeenCalledOnce();
  });

  it("exposes typed metadata for destructive, transform, held, teleport, and reversion outcomes", () => {
    expect(actorFloorImpactDestroysEnteringActor("destroy-water")).toBe(true);
    expect(actorFloorImpactDestroysEnteringActor("destroy-fire")).toBe(true);
    expect(actorFloorImpactBombDestroys("destroy-bomb")).toBe(true);
    expect(actorFloorImpactTransformsFloor("transform-to-dirt")).toBe(true);
    expect(actorFloorImpactTransformTurnsToDirt("transform-to-dirt")).toBe(true);
    expect(actorFloorImpactTransformClearsFloor("transform-to-empty")).toBe(true);
    expect(actorFloorImpactHoldsDirection("hold-direction")).toBe(true);
    expect(actorFloorImpactTeleports("teleport")).toBe(true);
    expect(actorFloorImpactRevertsPortable("revert-portable")).toBe(true);
  });
});

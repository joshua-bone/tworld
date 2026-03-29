import { describe, expect, it } from "vitest";
import {
  msActorAirHook,
  msActorArrivalAction,
  msActorBlockedMoveKind,
  msActorClonerFamilyHooks,
  msActorClonerHook,
  msActorCapabilityPolicy,
  msActorCollisionStrategyId,
  msActorControlMode,
  msActorEntryMask,
  msActorGlobalProgressKind,
  msActorHazardResponse,
  msActorHasTag,
  msActorItemCollectionKind,
  msActorLocalInventoryMode,
  msActorMovementStrategyId,
  msActorSupportFamilyHooks,
  msActorThiefHook,
  msActorTrapFamilyHooks,
  msActorTrapHook,
  msBlockMovementMask,
  msChipMovementMask,
  msIsOverlayFloorTile,
  msPreservesUnderlyingFloor,
} from "@ruleset-ms/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

describe("MS catalog actor families", () => {
  it("surfaces actor tags and capability policies", () => {
    expect(msActorHasTag(MS_TILE.Fireball, "fire-immune")).toBe(true);
    expect(msActorHasTag(MS_TILE.Glider, "water-immune")).toBe(true);
    expect(msActorHasTag(MS_TILE.Chip, "chip")).toBe(true);
    expect(msActorCapabilityPolicy(MS_TILE.Chip).control.mode).toBe("player-input");
    expect(msActorControlMode(MS_TILE.Bug)).toBe("ai");
    expect(msActorControlMode(MS_TILE.BowlingBall)).toBe("ballistic");
    expect(msActorLocalInventoryMode(MS_TILE.Chip)).toBe("keys-boots-tools");
    expect(msActorLocalInventoryMode(MS_TILE.BowlingBall)).toBe("keys-boots");
    expect(msActorItemCollectionKind(MS_TILE.Chip)).toBe("keys-boots-tools");
    expect(msActorItemCollectionKind(MS_TILE.BowlingBall)).toBe("keys-boots");
    expect(msActorGlobalProgressKind(MS_TILE.Chip)).toBe("collect-chips");
    expect(msActorGlobalProgressKind(MS_TILE.BowlingBall)).toBe("collect-chips");
    expect(msActorMovementStrategyId(MS_TILE.Block)).toBe("block-like");
    expect(msActorMovementStrategyId(MS_TILE.BowlingBall)).toBe("ballistic-like");
    expect(msActorBlockedMoveKind(MS_TILE.Block)).toBe("stay");
    expect(msActorBlockedMoveKind(MS_TILE.BowlingBall)).toBe("revert-portable");
    expect(msActorTrapHook(MS_TILE.Ball)).toBe("default");
    expect(msActorTrapHook(MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(msActorClonerHook(MS_TILE.Ball)).toBe("default");
    expect(msActorClonerHook(MS_TILE.BowlingBall)).toBe("hold-direction");
    expect(msActorThiefHook(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(msActorThiefHook(MS_TILE.BowlingBall)).toBe("steal-boots-tools");
    expect(msActorAirHook(MS_TILE.Chip)).toBe("chip-support");
    expect(msActorAirHook(MS_TILE.BowlingBall)).toBe("chip-support");
    expect(msActorTrapFamilyHooks(MS_TILE.BowlingBall).releaseBehavior).toBe("move-current-direction");
    expect(msActorClonerFamilyHooks(MS_TILE.BowlingBall).runtimeCloneBehavior).toBe("clone-family-runtime");
    expect(msActorSupportFamilyHooks(MS_TILE.BowlingBall).fallingCollisionBehavior).toBe("default");
    expect(msActorCollisionStrategyId(MS_TILE.Ball)).toBe("default");
  });

  it("provides actor-vs-tile entry, hazard, arrival, and overlay helpers", () => {
    expect(msActorEntryMask(MS_TILE.Dirt, MS_TILE.Block)).toBe(msBlockMovementMask(MS_TILE.Dirt));
    expect(msActorEntryMask(MS_TILE.Door_Blue, MS_TILE.Chip)).toBe(msChipMovementMask(MS_TILE.Door_Blue));
    expect(msActorEntryMask(MS_TILE.Door_Blue, MS_TILE.BowlingBall)).toBe(msChipMovementMask(MS_TILE.Door_Blue));
    expect(msActorHazardResponse(MS_TILE.Glider, "water")).toBe("ignore");
    expect(msActorHazardResponse(MS_TILE.Bug, "fire")).toBe("deny");
    expect(msActorHazardResponse(MS_TILE.BowlingBall, "fire")).toBe("destroy");
    expect(msActorArrivalAction(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(msActorArrivalAction(MS_TILE.Water, MS_TILE.Glider)).toBe("none");
    expect(msActorArrivalAction(MS_TILE.Water, MS_TILE.Bug)).toBe("creature-water");
    expect(msActorArrivalAction(MS_TILE.Fire, MS_TILE.Fireball)).toBe("none");
    expect(msActorArrivalAction(MS_TILE.Fire, MS_TILE.Glider)).toBe("creature-fire");
    expect(msActorArrivalAction(MS_TILE.Bomb, MS_TILE.Block)).toBe("block-bomb");
    expect(msActorArrivalAction(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
    expect(msIsOverlayFloorTile(MS_TILE.Key_Red)).toBe(true);
    expect(msIsOverlayFloorTile(MS_TILE.Bug)).toBe(true);
    expect(msPreservesUnderlyingFloor(MS_TILE.Empty)).toBe(true);
    expect(msPreservesUnderlyingFloor(MS_TILE.Boots_Ice)).toBe(false);
  });
});

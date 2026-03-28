import { describe, expect, it } from "vitest";
import {
  msActorAirHook,
  msActorBlockedMoveKind,
  msActorClonerHook,
  msActorCapabilityPolicy,
  msActorCollisionStrategyId,
  msActorControlMode,
  msActorEntryMask,
  msActorGlobalProgressKind,
  msActorHazardResponse,
  msActorThiefHook,
  msActorTrapHook,
  msActorArrivalAction,
  msActorHasTag,
  msActorItemCollectionKind,
  msActorLocalInventoryMode,
  msActorMovementStrategyId,
  msBlockMovementMask,
  msButtonAction,
  msChipMovementMask,
  msChipEnterAction,
  msCreatureMovementMask,
  msDoorKeyIndex,
  msExitMovementMask,
  msIceWallTurn,
  msInventoryIndex,
  msInventorySlot,
  msPortableItemFamily,
  msIsOverlayFloorTile,
  msPreservesUnderlyingFloor,
  msRequiresReleaseToExit,
  msSlideDirection,
  msTileForcedFloorKind,
  msRulesetCatalog,
  msTileHasCapability,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

describe("MS ruleset catalog", () => {
  it("covers every MS tile id", () => {
    const tileIds = Object.values(MS_TILE).filter((value) => typeof value === "number") as number[];

    expect(msRulesetCatalog.name).toBe("ms");
    expect(msRulesetCatalog.tiles.size).toBe(tileIds.length);
    expect(msRulesetCatalog.getTile(MS_TILE.Teleport)?.code).toBe("ms:teleport");
    expect(msRulesetCatalog.getTile(MS_TILE.Button_Blue)?.name).toBe("Button Blue");
  });

  it("surfaces tags and capabilities for core tile families", () => {
    expect(msTileHasTag(MS_TILE.Button_Red, "button")).toBe(true);
    expect(msTileHasTag(MS_TILE.Door_Blue, "door")).toBe(true);
    expect(msTileHasTag(MS_TILE.Key_Green, "collectible")).toBe(true);
    expect(msTileHasTag(MS_TILE.Boots_Fire, "boots")).toBe(true);
    expect(msTileHasTag(MS_TILE.Teleport, "teleport")).toBe(true);
    expect(msTileHasTag(MS_TILE.Air, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Beartrap, "trap")).toBe(true);
    expect(msTileHasTag(MS_TILE.CloneMachine, "cloner")).toBe(true);
    expect(msTileHasTag(MS_TILE.Ice, "ice")).toBe(true);
    expect(msTileHasTag(MS_TILE.Slide_East, "slide")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Key_Red, "collect-on-entry")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Teleport, "forces-movement")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Air, "forces-movement")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Bomb, "kills-on-entry")).toBe(true);
  });

  it("provides movement masks for chip, creatures, and blocks", () => {
    expect(msChipMovementMask(MS_TILE.Empty)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(msChipMovementMask(MS_TILE.IceWall_Northwest)).toBe(
      MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(msChipMovementMask(MS_TILE.Wall_East)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(msCreatureMovementMask(MS_TILE.CloneMachine)).toBe(0);
    expect(msBlockMovementMask(MS_TILE.Dirt)).toBe(0);
    expect(msBlockMovementMask(MS_TILE.Water)).toBe(msChipMovementMask(MS_TILE.Water));
  });

  it("provides inventory and door lookup policy", () => {
    expect(msInventorySlot(MS_TILE.Key_Blue)).toBe("keys");
    expect(msInventoryIndex(MS_TILE.Key_Blue)).toBe(1);
    expect(msInventorySlot(MS_TILE.Boots_Fire)).toBe("boots");
    expect(msInventoryIndex(MS_TILE.Boots_Fire)).toBe(2);
    expect(msPortableItemFamily(MS_TILE.Sandbag)).toBe("sandbag");
    expect(msPortableItemFamily(MS_TILE.Key_Blue)).toBeNull();
    expect(msDoorKeyIndex(MS_TILE.Door_Yellow)).toBe(2);
    expect(msDoorKeyIndex(MS_TILE.Teleport)).toBeNull();
  });

  it("provides chip entry and button policy actions", () => {
    expect(msChipEnterAction(MS_TILE.Key_Red)).toBe("collect-item");
    expect(msChipEnterAction(MS_TILE.Bomb)).toBe("explode-bomb");
    expect(msChipEnterAction(MS_TILE.Water)).toBe("water-death");
    expect(msChipEnterAction(MS_TILE.Fire)).toBe("fire-death");
    expect(msChipEnterAction(MS_TILE.Teleport)).toBe("teleport");
    expect(msChipEnterAction(MS_TILE.Bug)).toBe("collision");
    expect(msButtonAction(MS_TILE.Button_Blue)).toBe("turn-tanks");
    expect(msButtonAction(MS_TILE.Button_Green)).toBe("toggle-walls");
    expect(msButtonAction(MS_TILE.Button_Red)).toBe("activate-cloner");
    expect(msButtonAction(MS_TILE.Button_Brown)).toBe("spring-trap");
  });

  it("provides actor and floor-layer policy helpers", () => {
    expect(msActorHasTag(MS_TILE.Fireball, "fire-immune")).toBe(true);
    expect(msActorHasTag(MS_TILE.Glider, "water-immune")).toBe(true);
    expect(msActorHasTag(MS_TILE.Chip, "chip")).toBe(true);
    expect(msActorCapabilityPolicy(MS_TILE.Chip).control.mode).toBe("player-input");
    expect(msActorControlMode(MS_TILE.Bug)).toBe("ai");
    expect(msActorLocalInventoryMode(MS_TILE.Chip)).toBe("keys-boots-tools");
    expect(msActorItemCollectionKind(MS_TILE.Chip)).toBe("keys-boots-tools");
    expect(msActorGlobalProgressKind(MS_TILE.Chip)).toBe("collect-chips");
    expect(msActorMovementStrategyId(MS_TILE.Block)).toBe("block-like");
    expect(msActorBlockedMoveKind(MS_TILE.Block)).toBe("stay");
    expect(msActorTrapHook(MS_TILE.Ball)).toBe("default");
    expect(msActorClonerHook(MS_TILE.Ball)).toBe("default");
    expect(msActorThiefHook(MS_TILE.Chip)).toBe("steal-boots-tools");
    expect(msActorAirHook(MS_TILE.Chip)).toBe("chip-support");
    expect(msActorCollisionStrategyId(MS_TILE.Ball)).toBe("default");
    expect(msActorEntryMask(MS_TILE.Dirt, MS_TILE.Block)).toBe(msBlockMovementMask(MS_TILE.Dirt));
    expect(msActorEntryMask(MS_TILE.Door_Blue, MS_TILE.Chip)).toBe(msChipMovementMask(MS_TILE.Door_Blue));
    expect(msActorHazardResponse(MS_TILE.Glider, "water")).toBe("ignore");
    expect(msActorHazardResponse(MS_TILE.Bug, "fire")).toBe("deny");
    expect(msIsOverlayFloorTile(MS_TILE.Key_Red)).toBe(true);
    expect(msIsOverlayFloorTile(MS_TILE.Bug)).toBe(true);
    expect(msPreservesUnderlyingFloor(MS_TILE.Empty)).toBe(true);
    expect(msPreservesUnderlyingFloor(MS_TILE.Boots_Ice)).toBe(false);
  });

  it("provides forced-floor policy helpers", () => {
    expect(msTileForcedFloorKind(MS_TILE.Ice)).toBe("ice");
    expect(msTileForcedFloorKind(MS_TILE.Slide_Random)).toBe("slide");
    expect(msTileForcedFloorKind(MS_TILE.Teleport)).toBe("teleport");
    expect(msTileForcedFloorKind(MS_TILE.Air)).toBe("air");
    expect(msSlideDirection(MS_TILE.Slide_East, MS_DIRECTION.north)).toBe(MS_DIRECTION.east);
    expect(msSlideDirection(MS_TILE.Slide_Random, MS_DIRECTION.west)).toBe(MS_DIRECTION.west);
    expect(msIceWallTurn(MS_TILE.IceWall_Northwest, MS_DIRECTION.south)).toBe(MS_DIRECTION.west);
  });

  it("provides exit and arrival policy helpers", () => {
    expect(msExitMovementMask(MS_TILE.Wall_North)).toBe(
      MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(msExitMovementMask(MS_TILE.Wall_Southeast)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west,
    );
    expect(msRequiresReleaseToExit(MS_TILE.Beartrap)).toBe(true);
    expect(msRequiresReleaseToExit(MS_TILE.Empty)).toBe(false);
    expect(msActorArrivalAction(MS_TILE.Water, MS_TILE.Block)).toBe("block-water");
    expect(msActorArrivalAction(MS_TILE.Water, MS_TILE.Glider)).toBe("none");
    expect(msActorArrivalAction(MS_TILE.Water, MS_TILE.Bug)).toBe("creature-water");
    expect(msActorArrivalAction(MS_TILE.Fire, MS_TILE.Fireball)).toBe("none");
    expect(msActorArrivalAction(MS_TILE.Fire, MS_TILE.Glider)).toBe("creature-fire");
    expect(msActorArrivalAction(MS_TILE.Bomb, MS_TILE.Block)).toBe("block-bomb");
    expect(msActorArrivalAction(MS_TILE.Bomb, MS_TILE.Ball)).toBe("creature-bomb");
  });
});

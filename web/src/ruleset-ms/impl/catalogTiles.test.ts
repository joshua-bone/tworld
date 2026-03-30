import { describe, expect, it } from "vitest";
import {
  msBlockMovementMask,
  msButtonAction,
  msChipEnterAction,
  msChipMovementMask,
  msCreatureMovementMask,
  msDoorKeyIndex,
  msExitMovementMask,
  msIceWallTurn,
  msInventoryIndex,
  msInventorySlot,
  msPortableItemFamily,
  msRequiresReleaseToExit,
  msSlideDirection,
  msTileForcedFloorKind,
  msTileMobExitAction,
  msTileHasCapability,
  msTileHasTag,
} from "@ruleset-ms/impl/catalog";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

describe("MS catalog tile families", () => {
  it("surfaces tags and capabilities for terrain, pickups, and buttons", () => {
    expect(msTileHasTag(MS_TILE.Button_Red, "button")).toBe(true);
    expect(msTileHasTag(MS_TILE.Button_Red, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Door_Blue, "door")).toBe(true);
    expect(msTileHasTag(MS_TILE.Door_Blue, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Key_Green, "collectible")).toBe(true);
    expect(msTileHasTag(MS_TILE.Key_Green, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Boots_Fire, "boots")).toBe(true);
    expect(msTileHasTag(MS_TILE.Teleport, "teleport")).toBe(true);
    expect(msTileHasTag(MS_TILE.Air, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Cloud, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Wall_East, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.HiddenWall_Temp, "walkable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Beartrap, "trap")).toBe(true);
    expect(msTileHasTag(MS_TILE.CloneMachine, "cloner")).toBe(true);
    expect(msTileHasTag(MS_TILE.Ice, "ice")).toBe(true);
    expect(msTileHasTag(MS_TILE.IceBlock_Static, "pushable")).toBe(true);
    expect(msTileHasTag(MS_TILE.Slide_East, "slide")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Key_Red, "collect-on-entry")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Teleport, "forces-movement")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Air, "forces-movement")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Elevator, "forces-movement")).toBe(false);
    expect(msTileHasCapability(MS_TILE.Bomb, "kills-on-entry")).toBe(true);
    expect(msTileHasCapability(MS_TILE.IceBlock_Static, "accepts-blocks")).toBe(true);
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

  it("provides inventory, portable-item, and door lookup policy", () => {
    expect(msInventorySlot(MS_TILE.Key_Blue)).toBe("keys");
    expect(msInventoryIndex(MS_TILE.Key_Blue)).toBe(1);
    expect(msInventorySlot(MS_TILE.Boots_Fire)).toBe("boots");
    expect(msInventoryIndex(MS_TILE.Boots_Fire)).toBe(2);
    expect(msPortableItemFamily(MS_TILE.Sandbag)).toBe("sandbag");
    expect(msPortableItemFamily(MS_TILE.Hook)).toBe("hook");
    expect(msPortableItemFamily(MS_TILE.BowlingBall_Still)).toBe("bowling-ball");
    expect(msPortableItemFamily(MS_TILE.Key_Blue)).toBeNull();
    expect(msDoorKeyIndex(MS_TILE.Door_Yellow)).toBe(2);
    expect(msDoorKeyIndex(MS_TILE.Teleport)).toBeNull();
  });

  it("provides chip-entry, button, forced-floor, and exit policy helpers", () => {
    expect(msChipEnterAction(MS_TILE.Empty)).toBe("clear-floor");
    expect(msChipEnterAction(MS_TILE.Key_Red)).toBe("collect-item");
    expect(msChipEnterAction(MS_TILE.BowlingBall_Still)).toBe("collect-item");
    expect(msChipEnterAction(MS_TILE.BowlingBall)).toBe("collision");
    expect(msChipEnterAction(MS_TILE.IceBlock)).toBe("collision");
    expect(msChipEnterAction(MS_TILE.Bomb)).toBe("explode-bomb");
    expect(msChipEnterAction(MS_TILE.Water)).toBe("water-death");
    expect(msChipEnterAction(MS_TILE.Fire)).toBe("fire-death");
    expect(msChipEnterAction(MS_TILE.Teleport)).toBe("teleport");
    expect(msChipEnterAction(MS_TILE.Bug)).toBe("collision");
    expect(msButtonAction(MS_TILE.Button_Blue)).toBe("turn-tanks");
    expect(msButtonAction(MS_TILE.Button_Green)).toBe("toggle-walls");
    expect(msButtonAction(MS_TILE.Button_Red)).toBe("activate-cloner");
    expect(msButtonAction(MS_TILE.Button_Brown)).toBe("spring-trap");
    expect(msTileForcedFloorKind(MS_TILE.Ice)).toBe("ice");
    expect(msTileForcedFloorKind(MS_TILE.Slide_Random)).toBe("slide");
    expect(msTileForcedFloorKind(MS_TILE.Teleport)).toBe("teleport");
    expect(msTileForcedFloorKind(MS_TILE.Air)).toBe("air");
    expect(msTileMobExitAction(MS_TILE.Cloud)).toBe("turn-to-air");
    expect(msSlideDirection(MS_TILE.Slide_East, MS_DIRECTION.north)).toBe(MS_DIRECTION.east);
    expect(msSlideDirection(MS_TILE.Slide_Random, MS_DIRECTION.west)).toBe(MS_DIRECTION.west);
    expect(msIceWallTurn(MS_TILE.IceWall_Northwest, MS_DIRECTION.south)).toBe(MS_DIRECTION.west);
    expect(msExitMovementMask(MS_TILE.Wall_North)).toBe(
      MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(msExitMovementMask(MS_TILE.Wall_Southeast)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west,
    );
    expect(msRequiresReleaseToExit(MS_TILE.Beartrap)).toBe(true);
    expect(msRequiresReleaseToExit(MS_TILE.Empty)).toBe(false);
  });
});

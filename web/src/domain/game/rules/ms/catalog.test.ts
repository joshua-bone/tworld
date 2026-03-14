import { describe, expect, it } from "vitest";
import {
  msBlockMovementMask,
  msChipMovementMask,
  msCreatureMovementMask,
  msDoorKeyIndex,
  msInventoryIndex,
  msInventorySlot,
  msRulesetCatalog,
  msTileHasCapability,
  msTileHasTag,
} from "@domain/game/rules/ms/catalog";
import { MS_DIRECTION, MS_TILE } from "@domain/game/rules/ms/tiles";

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
    expect(msTileHasTag(MS_TILE.Beartrap, "trap")).toBe(true);
    expect(msTileHasTag(MS_TILE.CloneMachine, "cloner")).toBe(true);
    expect(msTileHasTag(MS_TILE.Ice, "ice")).toBe(true);
    expect(msTileHasTag(MS_TILE.Slide_East, "slide")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Key_Red, "collect-on-entry")).toBe(true);
    expect(msTileHasCapability(MS_TILE.Teleport, "forces-movement")).toBe(true);
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
    expect(msDoorKeyIndex(MS_TILE.Door_Yellow)).toBe(2);
    expect(msDoorKeyIndex(MS_TILE.Teleport)).toBeNull();
  });
});

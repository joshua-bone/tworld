import { describe, expect, it } from "vitest";
import {
  lynxActorHasTag,
  lynxButtonAction,
  lynxBlockMovementMask,
  lynxChipEnterAction,
  lynxChipMovementMask,
  lynxCreatureMovementMask,
  lynxDoorKeyIndex,
  lynxFixedSlideDirection,
  lynxIceWallTurn,
  lynxInventoryIndex,
  lynxInventorySlot,
  lynxRulesetCatalog,
  lynxTileForcedFloorKind,
  lynxTileHasCapability,
  lynxTileHasTag,
} from "@domain/game/rules/lynx/catalog";
import { MS_DIRECTION, MS_TILE } from "@domain/game/rules/ms/tiles";

describe("Lynx ruleset catalog", () => {
  it("covers every shared tile id", () => {
    const tileIds = Object.values(MS_TILE).filter((value) => typeof value === "number") as number[];

    expect(lynxRulesetCatalog.name).toBe("lynx");
    expect(lynxRulesetCatalog.tiles.size).toBe(tileIds.length);
    expect(lynxRulesetCatalog.getTile(MS_TILE.Teleport)?.code).toBe("lynx:teleport");
    expect(lynxRulesetCatalog.getTile(MS_TILE.Button_Blue)?.name).toBe("Button Blue");
  });

  it("surfaces core tags and capabilities", () => {
    expect(lynxTileHasTag(MS_TILE.Button_Red, "button")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Door_Blue, "door")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Key_Green, "collectible")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Boots_Fire, "boots")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Teleport, "teleport")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Beartrap, "trap")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Exit, "exit")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Ice, "ice")).toBe(true);
    expect(lynxTileHasTag(MS_TILE.Slide_East, "slide")).toBe(true);
    expect(lynxTileHasCapability(MS_TILE.Key_Red, "collect-on-entry")).toBe(true);
    expect(lynxTileHasCapability(MS_TILE.Teleport, "forces-movement")).toBe(true);
    expect(lynxTileHasCapability(MS_TILE.Bomb, "kills-on-entry")).toBe(true);
  });

  it("provides inventory and button policy lookups", () => {
    expect(lynxInventorySlot(MS_TILE.Key_Blue)).toBe("keys");
    expect(lynxInventoryIndex(MS_TILE.Key_Blue)).toBe(1);
    expect(lynxInventorySlot(MS_TILE.Boots_Fire)).toBe("boots");
    expect(lynxInventoryIndex(MS_TILE.Boots_Fire)).toBe(2);
    expect(lynxDoorKeyIndex(MS_TILE.Door_Yellow)).toBe(2);
    expect(lynxDoorKeyIndex(MS_TILE.Teleport)).toBeNull();
    expect(lynxButtonAction(MS_TILE.Button_Blue)).toBe("turn-tanks");
    expect(lynxButtonAction(MS_TILE.Button_Green)).toBe("toggle-walls");
    expect(lynxButtonAction(MS_TILE.Button_Red)).toBe("activate-cloner");
    expect(lynxButtonAction(MS_TILE.Button_Brown)).toBe("spring-trap");
  });

  it("provides forced-floor policy helpers", () => {
    expect(lynxTileForcedFloorKind(MS_TILE.Ice)).toBe("ice");
    expect(lynxTileForcedFloorKind(MS_TILE.Slide_Random)).toBe("slide");
    expect(lynxTileForcedFloorKind(MS_TILE.Teleport)).toBe("teleport");
    expect(lynxFixedSlideDirection(MS_TILE.Slide_East)).toBe(MS_DIRECTION.east);
    expect(lynxFixedSlideDirection(MS_TILE.Slide_Random)).toBe(MS_DIRECTION.none);
    expect(lynxIceWallTurn(MS_TILE.IceWall_Northwest, MS_DIRECTION.south)).toBe(MS_DIRECTION.west);
  });

  it("provides movement masks and chip arrival actions", () => {
    expect(lynxChipMovementMask(MS_TILE.Empty)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(lynxChipMovementMask(MS_TILE.Wall_North)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.east,
    );
    expect(lynxCreatureMovementMask(MS_TILE.Gravel)).toBe(MS_DIRECTION.none);
    expect(lynxBlockMovementMask(MS_TILE.Gravel)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(lynxCreatureMovementMask(MS_TILE.Key_Blue)).toBe(
      MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east,
    );
    expect(lynxChipEnterAction(MS_TILE.Dirt)).toBe("clear-floor");
    expect(lynxChipEnterAction(MS_TILE.ICChip)).toBe("collect-chip");
    expect(lynxChipEnterAction(MS_TILE.Boots_Water)).toBe("collect-item");
    expect(lynxChipEnterAction(MS_TILE.Door_Blue)).toBe("open-door");
    expect(lynxChipEnterAction(MS_TILE.Beartrap)).toBe("trap");
    expect(lynxChipEnterAction(MS_TILE.Exit)).toBe("exit");
    expect(lynxChipEnterAction(MS_TILE.Fire)).toBe("fire-death");
  });

  it("provides actor tags for the shared creature families", () => {
    expect(lynxActorHasTag(MS_TILE.Chip, "chip")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Chip, "pushes-blocks")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Glider, "water-immune")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Fireball, "fire-immune")).toBe(true);
    expect(lynxActorHasTag(MS_TILE.Block, "block")).toBe(true);
  });
});

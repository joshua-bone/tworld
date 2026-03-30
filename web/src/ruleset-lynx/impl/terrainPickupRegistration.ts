import type { InteractiveGameTileOverlayRender } from "@game-core/api/interactive";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { LynxInventorySlot, LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";
import {
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  lynxPortableItemFamilyRegistrations,
  type LynxPortableItemFamilyRegistration,
} from "@ruleset-lynx/impl/portableItemRegistration";

export {
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  type LynxPortableItemFamilyRegistration,
} from "@ruleset-lynx/impl/portableItemRegistration";

export type LynxTerrainPickupFamilyId = "keys" | "boots" | "portable-items" | "doors" | "buttons";

export interface LynxTerrainPickupTileRegistration {
  tileId: number;
  inventorySlot?: LynxInventorySlot;
  inventoryIndex?: number;
  doorKeyIndex?: number;
  portableItemFamily?: LynxPortableItemFamily;
}

export interface LynxTerrainPickupFamilyRegistration {
  familyId: LynxTerrainPickupFamilyId;
  tiles: readonly LynxTerrainPickupTileRegistration[];
}

export const lynxTerrainPickupFamilyRegistrations = [
  {
    familyId: "keys",
    tiles: [
      { tileId: MS_TILE.Key_Red, inventorySlot: "keys", inventoryIndex: 0 },
      { tileId: MS_TILE.Key_Blue, inventorySlot: "keys", inventoryIndex: 1 },
      { tileId: MS_TILE.Key_Yellow, inventorySlot: "keys", inventoryIndex: 2 },
      { tileId: MS_TILE.Key_Green, inventorySlot: "keys", inventoryIndex: 3 },
    ],
  },
  {
    familyId: "boots",
    tiles: [
      { tileId: MS_TILE.Boots_Ice, inventorySlot: "boots", inventoryIndex: 0 },
      { tileId: MS_TILE.Boots_Slide, inventorySlot: "boots", inventoryIndex: 1 },
      { tileId: MS_TILE.Boots_Fire, inventorySlot: "boots", inventoryIndex: 2 },
      { tileId: MS_TILE.Boots_Water, inventorySlot: "boots", inventoryIndex: 3 },
    ],
  },
  {
    familyId: "portable-items",
    tiles: lynxPortableItemFamilyRegistrations.map((registration) => ({
      tileId: registration.tileId,
      inventorySlot: registration.inventorySlot,
      inventoryIndex: 0,
      portableItemFamily: registration.familyId,
    })),
  },
  {
    familyId: "doors",
    tiles: [
      { tileId: MS_TILE.Door_Red, doorKeyIndex: 0 },
      { tileId: MS_TILE.Door_Blue, doorKeyIndex: 1 },
      { tileId: MS_TILE.Door_Yellow, doorKeyIndex: 2 },
      { tileId: MS_TILE.Door_Green, doorKeyIndex: 3 },
    ],
  },
  {
    familyId: "buttons",
    tiles: [
      { tileId: MS_TILE.Button_Blue },
      { tileId: MS_TILE.Button_Green },
      { tileId: MS_TILE.Button_Red },
      { tileId: MS_TILE.Button_Brown },
    ],
  },
] as const satisfies readonly LynxTerrainPickupFamilyRegistration[];

const lynxTerrainPickupFamilyByTileId = new Map<number, LynxTerrainPickupFamilyRegistration>();
const lynxTerrainPickupTileRegistrationByTileId = new Map<number, LynxTerrainPickupTileRegistration>();

for (const familyRegistration of lynxTerrainPickupFamilyRegistrations) {
  for (const tileRegistration of familyRegistration.tiles) {
    lynxTerrainPickupFamilyByTileId.set(tileRegistration.tileId, familyRegistration);
    lynxTerrainPickupTileRegistrationByTileId.set(tileRegistration.tileId, tileRegistration);
  }
}

export function lookupLynxTerrainPickupFamilyRegistration(
  tileId: number,
): LynxTerrainPickupFamilyRegistration | undefined {
  return lynxTerrainPickupFamilyByTileId.get(tileId);
}

export function lookupLynxTerrainPickupTileRegistration(
  tileId: number,
): LynxTerrainPickupTileRegistration | undefined {
  return lynxTerrainPickupTileRegistrationByTileId.get(tileId);
}

export function projectLynxRegisteredPortableItemRender(
  tileId: number,
  alpha: number,
): InteractiveGameTileOverlayRender | null {
  const registration = lookupLynxPortableItemFamilyRegistrationByTileId(tileId);
  if (!registration) {
    return null;
  }

  return {
    mode: "tile",
    tileId,
    artworkSpriteId: registration.artworkSpriteId,
    alpha,
  };
}

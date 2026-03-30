import type { InteractiveGameTileOverlayRender } from "@game-core/api/interactive";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsInventorySlot, MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";
import {
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  msPortableItemFamilyRegistrations,
  type MsPortableItemFamilyRegistration,
} from "@ruleset-ms/impl/portableItemRegistration";

export {
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  type MsPortableItemFamilyRegistration,
} from "@ruleset-ms/impl/portableItemRegistration";

export type MsTerrainPickupFamilyId = "keys" | "boots" | "portable-items" | "doors" | "buttons";

export interface MsTerrainPickupTileRegistration {
  tileId: number;
  inventorySlot?: MsInventorySlot;
  inventoryIndex?: number;
  doorKeyIndex?: number;
  portableItemFamily?: MsPortableItemFamily;
}

export interface MsTerrainPickupFamilyRegistration {
  familyId: MsTerrainPickupFamilyId;
  tiles: readonly MsTerrainPickupTileRegistration[];
}

export const msTerrainPickupFamilyRegistrations = [
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
    tiles: msPortableItemFamilyRegistrations.map((registration) => ({
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
] as const satisfies readonly MsTerrainPickupFamilyRegistration[];

const msTerrainPickupFamilyByTileId = new Map<number, MsTerrainPickupFamilyRegistration>();
const msTerrainPickupTileRegistrationByTileId = new Map<number, MsTerrainPickupTileRegistration>();

for (const familyRegistration of msTerrainPickupFamilyRegistrations) {
  for (const tileRegistration of familyRegistration.tiles) {
    msTerrainPickupFamilyByTileId.set(tileRegistration.tileId, familyRegistration);
    msTerrainPickupTileRegistrationByTileId.set(tileRegistration.tileId, tileRegistration);
  }
}

export function lookupMsTerrainPickupFamilyRegistration(
  tileId: number,
): MsTerrainPickupFamilyRegistration | undefined {
  return msTerrainPickupFamilyByTileId.get(tileId);
}

export function lookupMsTerrainPickupTileRegistration(
  tileId: number,
): MsTerrainPickupTileRegistration | undefined {
  return msTerrainPickupTileRegistrationByTileId.get(tileId);
}

export function projectMsRegisteredPortableItemRender(
  tileId: number,
  alpha: number,
): InteractiveGameTileOverlayRender | null {
  const registration = lookupMsPortableItemFamilyRegistrationByTileId(tileId);
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

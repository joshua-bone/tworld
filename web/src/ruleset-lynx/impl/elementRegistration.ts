import type { ActorDefinition } from "@game-core/api/ruleset";
import { lynxLevelLoadRegistration, type LynxLevelLoadRegistration } from "@ruleset-lynx/api/levelLoader";
import { lookupLynxActorDefinition } from "@ruleset-lynx/impl/catalogActors";
import type { LynxInventorySlot, LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";
import { msBuiltinLevelDecodeRegistration, type MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export type LynxActorFamilyId = "chip" | "block" | "creature" | "bowling-ball";
export type LynxTerrainPickupFamilyId = "keys" | "boots" | "portable-items" | "doors" | "buttons";

export interface LynxActorFamilyRegistration {
  familyId: LynxActorFamilyId;
  actorIds: readonly number[];
}

export interface LynxPortableItemFamilyRegistration {
  familyId: LynxPortableItemFamily;
  tileId: number;
  inventorySlot: "tools";
}

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

export interface LynxElementFamilyRegistration {
  actorFamilies: readonly LynxActorFamilyRegistration[];
  portableItemFamilies: readonly LynxPortableItemFamilyRegistration[];
  terrainPickupFamilies: readonly LynxTerrainPickupFamilyRegistration[];
  levelDecodeRegistration: MsLevelDecodeRegistration;
  levelLoadRegistration: LynxLevelLoadRegistration;
}

const LYNX_ACTOR_FAMILY_REGISTRATIONS = [
  {
    familyId: "chip",
    actorIds: [MS_TILE.Chip, MS_TILE.Swimming_Chip, MS_TILE.Pushing_Chip],
  },
  {
    familyId: "block",
    actorIds: [MS_TILE.Block],
  },
  {
    familyId: "bowling-ball",
    actorIds: [MS_TILE.BowlingBall],
  },
  {
    familyId: "creature",
    actorIds: [
      MS_TILE.Tank,
      MS_TILE.Ball,
      MS_TILE.Glider,
      MS_TILE.Fireball,
      MS_TILE.Walker,
      MS_TILE.Blob,
      MS_TILE.Teeth,
      MS_TILE.Bug,
      MS_TILE.Paramecium,
    ],
  },
] as const satisfies readonly LynxActorFamilyRegistration[];

const LYNX_PORTABLE_ITEM_FAMILY_REGISTRATIONS = [
  {
    familyId: "sandbag",
    tileId: MS_TILE.Sandbag,
    inventorySlot: "tools",
  },
  {
    familyId: "hook",
    tileId: MS_TILE.Hook,
    inventorySlot: "tools",
  },
  {
    familyId: "bowling-ball",
    tileId: MS_TILE.BowlingBall_Still,
    inventorySlot: "tools",
  },
] as const satisfies readonly LynxPortableItemFamilyRegistration[];

const LYNX_TERRAIN_PICKUP_FAMILY_REGISTRATIONS = [
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
    tiles: LYNX_PORTABLE_ITEM_FAMILY_REGISTRATIONS.map((registration) => ({
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

export const lynxElementFamilyRegistration: LynxElementFamilyRegistration = {
  actorFamilies: LYNX_ACTOR_FAMILY_REGISTRATIONS,
  portableItemFamilies: LYNX_PORTABLE_ITEM_FAMILY_REGISTRATIONS,
  terrainPickupFamilies: LYNX_TERRAIN_PICKUP_FAMILY_REGISTRATIONS,
  levelDecodeRegistration: msBuiltinLevelDecodeRegistration,
  levelLoadRegistration: lynxLevelLoadRegistration,
};

const lynxActorFamilyByActorId = new Map<number, LynxActorFamilyRegistration>(
  LYNX_ACTOR_FAMILY_REGISTRATIONS.flatMap((registration) =>
    registration.actorIds.map((actorId) => [actorId, registration] as const),
  ),
);

const lynxPortableItemFamilyByFamilyId = new Map<LynxPortableItemFamily, LynxPortableItemFamilyRegistration>(
  LYNX_PORTABLE_ITEM_FAMILY_REGISTRATIONS.map((registration) => [registration.familyId, registration] as const),
);

const lynxPortableItemFamilyByTileId = new Map<number, LynxPortableItemFamilyRegistration>(
  LYNX_PORTABLE_ITEM_FAMILY_REGISTRATIONS.map((registration) => [registration.tileId, registration] as const),
);

const lynxTerrainPickupFamilyByTileId = new Map<number, LynxTerrainPickupFamilyRegistration>();
const lynxTerrainPickupTileRegistrationByTileId = new Map<number, LynxTerrainPickupTileRegistration>();

for (const familyRegistration of LYNX_TERRAIN_PICKUP_FAMILY_REGISTRATIONS) {
  for (const tileRegistration of familyRegistration.tiles) {
    lynxTerrainPickupFamilyByTileId.set(tileRegistration.tileId, familyRegistration);
    lynxTerrainPickupTileRegistrationByTileId.set(tileRegistration.tileId, tileRegistration);
  }
}

export function lookupLynxActorFamilyRegistration(actorId: number): LynxActorFamilyRegistration | undefined {
  const definition = lookupLynxActorDefinition(actorId);
  return definition ? lynxActorFamilyByActorId.get(definition.id) : undefined;
}

export function lookupLynxActorDefinitionRegistration(actorId: number): ActorDefinition<number> | undefined {
  return lookupLynxActorDefinition(actorId);
}

export function lookupLynxPortableItemFamilyRegistration(
  familyId: LynxPortableItemFamily,
): LynxPortableItemFamilyRegistration | undefined {
  return lynxPortableItemFamilyByFamilyId.get(familyId);
}

export function lookupLynxPortableItemFamilyRegistrationByTileId(
  tileId: number,
): LynxPortableItemFamilyRegistration | undefined {
  return lynxPortableItemFamilyByTileId.get(tileId);
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

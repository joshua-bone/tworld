import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msLevelLoadRegistration,
  type MsLevelLoadRegistration,
} from "@ruleset-ms/api/levelLoader";
import {
  msBuiltinLevelDecodeRegistration,
  type MsLevelDecodeRegistration,
} from "@ruleset-ms/api/levelRegistration";
import { lookupMsActorDefinition } from "@ruleset-ms/impl/catalogActors";
import {
  MS_BOWLING_BALL_ACTOR_FAMILY,
  MS_BOWLING_BALL_ACTOR_ID,
  MS_BOWLING_BALL_ACTOR_IDS,
  projectMsBowlingBallActorRenderSprite,
} from "@ruleset-ms/impl/elements/actors/families/bowlingBall";
import {
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  msPortableItemFamilyRegistrations,
  type MsPortableItemFamilyRegistration,
} from "@ruleset-ms/impl/portableItemRegistration";
import type { MsStatefulActorRuntimeEntry } from "@ruleset-ms/impl/statefulActors";
import type { MsInventorySlot, MsPortableItemFamily } from "@ruleset-ms/impl/catalogTiles";

export {
  lookupMsPortableItemFamilyRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  type MsPortableItemFamilyRegistration,
} from "@ruleset-ms/impl/portableItemRegistration";

export type MsActorFamilyId = "chip" | "block" | "creature" | "bowling-ball";
export type MsTerrainPickupFamilyId = "keys" | "boots" | "portable-items" | "doors" | "buttons";

export interface MsActorFamilyRegistration {
  familyId: MsActorFamilyId;
  actorIds: readonly number[];
  projectRenderSprite?: (
    actor: {
      id: number;
      dir: number;
      moving: number;
      frame: number;
    },
    runtimeEntry: MsStatefulActorRuntimeEntry | null,
  ) => InteractiveGameRenderSprite;
}

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

export interface MsElementFamilyRegistration {
  actorFamilies: readonly MsActorFamilyRegistration[];
  portableItemFamilies: readonly MsPortableItemFamilyRegistration[];
  terrainPickupFamilies: readonly MsTerrainPickupFamilyRegistration[];
  levelDecodeRegistration: MsLevelDecodeRegistration;
  levelLoadRegistration: MsLevelLoadRegistration;
}

const MS_ACTOR_FAMILY_REGISTRATIONS = [
  {
    familyId: "chip",
    actorIds: [MS_TILE.Chip, MS_TILE.Swimming_Chip, MS_TILE.Pushing_Chip],
  },
  {
    familyId: "block",
    actorIds: [MS_TILE.Block],
  },
  {
    familyId: MS_BOWLING_BALL_ACTOR_FAMILY,
    actorIds: MS_BOWLING_BALL_ACTOR_IDS,
    projectRenderSprite(actor, runtimeEntry) {
      return projectMsBowlingBallActorRenderSprite(
        actor,
        runtimeEntry?.kind === MS_BOWLING_BALL_ACTOR_FAMILY ? runtimeEntry.state : null,
      );
    },
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
] as const satisfies readonly MsActorFamilyRegistration[];

const MS_TERRAIN_PICKUP_FAMILY_REGISTRATIONS = [
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

export const msElementFamilyRegistration: MsElementFamilyRegistration = {
  actorFamilies: MS_ACTOR_FAMILY_REGISTRATIONS,
  portableItemFamilies: msPortableItemFamilyRegistrations,
  terrainPickupFamilies: MS_TERRAIN_PICKUP_FAMILY_REGISTRATIONS,
  levelDecodeRegistration: msBuiltinLevelDecodeRegistration,
  levelLoadRegistration: msLevelLoadRegistration,
};

const msActorFamilyByActorId = new Map<number, MsActorFamilyRegistration>(
  MS_ACTOR_FAMILY_REGISTRATIONS.flatMap((registration) =>
    registration.actorIds.map((actorId) => [actorId, registration] as const),
  ),
);

const msTerrainPickupFamilyByTileId = new Map<number, MsTerrainPickupFamilyRegistration>();
const msTerrainPickupTileRegistrationByTileId = new Map<number, MsTerrainPickupTileRegistration>();

for (const familyRegistration of MS_TERRAIN_PICKUP_FAMILY_REGISTRATIONS) {
  for (const tileRegistration of familyRegistration.tiles) {
    msTerrainPickupFamilyByTileId.set(tileRegistration.tileId, familyRegistration);
    msTerrainPickupTileRegistrationByTileId.set(tileRegistration.tileId, tileRegistration);
  }
}

export function lookupMsActorFamilyRegistration(actorId: number): MsActorFamilyRegistration | undefined {
  const definition = lookupMsActorDefinition(actorId);
  return definition ? msActorFamilyByActorId.get(definition.id) : undefined;
}

export function lookupMsActorDefinitionRegistration(actorId: number): ActorDefinition<number> | undefined {
  return lookupMsActorDefinition(actorId);
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

export function projectMsRegisteredActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: MsStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  const familyRegistration =
    runtimeEntry?.kind === MS_BOWLING_BALL_ACTOR_FAMILY
      ? msActorFamilyByActorId.get(MS_BOWLING_BALL_ACTOR_ID)
      : lookupMsActorFamilyRegistration(actor.id);
  const familyRender = familyRegistration?.projectRenderSprite;
  if (familyRender) {
    return familyRender(actor, runtimeEntry);
  }

  return {
    kind: "creature",
    tileId: actor.id,
    dir: actor.dir ?? MS_DIRECTION.none,
    moving: actor.moving,
    frame: actor.frame,
  };
}

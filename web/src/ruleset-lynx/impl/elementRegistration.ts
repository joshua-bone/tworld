import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { createLynxLevelLoadRegistration, type LynxLevelLoadRegistration } from "@ruleset-lynx/api/levelLoader";
import { lookupLynxActorDefinition } from "@ruleset-lynx/impl/catalogActors";
import {
  LYNX_BOWLING_BALL_ACTOR_FAMILY,
  LYNX_BOWLING_BALL_ACTOR_ID,
  LYNX_BOWLING_BALL_ACTOR_IDS,
  projectLynxBowlingBallActorRenderSprite,
} from "@ruleset-lynx/impl/elements/actors/families/bowlingBall";
import {
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  lynxPortableItemFamilyRegistrations,
  type LynxPortableItemFamilyRegistration,
} from "@ruleset-lynx/impl/portableItemRegistration";
import type { LynxStatefulActorRuntimeEntry } from "@ruleset-lynx/impl/statefulActors";
import type { LynxInventorySlot, LynxPortableItemFamily } from "@ruleset-lynx/impl/catalogTiles";

export {
  lookupLynxPortableItemFamilyRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  type LynxPortableItemFamilyRegistration,
} from "@ruleset-lynx/impl/portableItemRegistration";
import type { MsLevelDecodeRegistration } from "@ruleset-ms/api/levelRegistration";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { msRegisteredLevelDecodeRegistration } from "@ruleset-ms/impl/elementRegistration";

export type LynxActorFamilyId = "chip" | "block" | "creature" | "bowling-ball";
export type LynxTerrainPickupFamilyId = "keys" | "boots" | "portable-items" | "doors" | "buttons";

export interface LynxActorFamilyRegistration {
  familyId: LynxActorFamilyId;
  actorIds: readonly number[];
  projectRenderSprite?: (
    actor: {
      id: number;
      dir: number;
      moving: number;
      frame: number;
    },
    runtimeEntry: LynxStatefulActorRuntimeEntry | null,
  ) => InteractiveGameRenderSprite;
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
    familyId: LYNX_BOWLING_BALL_ACTOR_FAMILY,
    actorIds: LYNX_BOWLING_BALL_ACTOR_IDS,
    projectRenderSprite(actor, runtimeEntry) {
      return projectLynxBowlingBallActorRenderSprite(
        actor,
        runtimeEntry?.kind === LYNX_BOWLING_BALL_ACTOR_FAMILY ? runtimeEntry.state : null,
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
] as const satisfies readonly LynxActorFamilyRegistration[];

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

export const lynxRegisteredLevelDecodeRegistration = msRegisteredLevelDecodeRegistration;
export const lynxRegisteredLevelLoadRegistration = createLynxLevelLoadRegistration(lynxRegisteredLevelDecodeRegistration);

export const lynxElementFamilyRegistration: LynxElementFamilyRegistration = {
  actorFamilies: LYNX_ACTOR_FAMILY_REGISTRATIONS,
  portableItemFamilies: lynxPortableItemFamilyRegistrations,
  terrainPickupFamilies: LYNX_TERRAIN_PICKUP_FAMILY_REGISTRATIONS,
  levelDecodeRegistration: lynxRegisteredLevelDecodeRegistration,
  levelLoadRegistration: lynxRegisteredLevelLoadRegistration,
};

const lynxActorFamilyByActorId = new Map<number, LynxActorFamilyRegistration>(
  LYNX_ACTOR_FAMILY_REGISTRATIONS.flatMap((registration) =>
    registration.actorIds.map((actorId) => [actorId, registration] as const),
  ),
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

export function projectLynxRegisteredActorRenderSprite(
  actor: {
    id: number;
    dir: number;
    moving: number;
    frame: number;
  },
  runtimeEntry: LynxStatefulActorRuntimeEntry | null,
): InteractiveGameRenderSprite {
  const familyRegistration =
    runtimeEntry?.kind === LYNX_BOWLING_BALL_ACTOR_FAMILY
      ? lynxActorFamilyByActorId.get(LYNX_BOWLING_BALL_ACTOR_ID)
      : lookupLynxActorFamilyRegistration(actor.id);
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

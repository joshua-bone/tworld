import type {
  InteractiveGameRenderSprite,
  InteractiveGameTileOverlayRender,
} from "@game-core/api/interactive";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { MS_DIRECTION } from "@ruleset-ms/api/tiles";
import { MS_TILE, msCreatureTile } from "@ruleset-ms/api/tiles";
import {
  createMsLevelLoadRegistration,
  type MsLevelLoadRegistration,
} from "@ruleset-ms/api/levelLoader";
import {
  createMsLevelDecodeRegistration,
  type MsLevelDecodeContext,
  type MsLevelDecodeRegistration,
  type MsLevelDecodeRegistrationEntry,
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

const MS_BUILTIN_LEVEL_DECODE_ENTRIES = [
  MS_TILE.Empty,
  MS_TILE.Wall,
  MS_TILE.ICChip,
  MS_TILE.Water,
  MS_TILE.Fire,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.Wall_North,
  MS_TILE.Wall_West,
  MS_TILE.Wall_South,
  MS_TILE.Wall_East,
  MS_TILE.Block_Static,
  MS_TILE.Dirt,
  MS_TILE.Ice,
  MS_TILE.Slide_South,
  msCreatureTile(MS_TILE.Block, 1),
  msCreatureTile(MS_TILE.Block, 2),
  msCreatureTile(MS_TILE.Block, 4),
  msCreatureTile(MS_TILE.Block, 8),
  MS_TILE.Slide_North,
  MS_TILE.Slide_East,
  MS_TILE.Slide_West,
  MS_TILE.Exit,
  MS_TILE.Door_Blue,
  MS_TILE.Door_Red,
  MS_TILE.Door_Green,
  MS_TILE.Door_Yellow,
  MS_TILE.IceWall_Southeast,
  MS_TILE.IceWall_Southwest,
  MS_TILE.IceWall_Northwest,
  MS_TILE.IceWall_Northeast,
  MS_TILE.BlueWall_Fake,
  MS_TILE.BlueWall_Real,
  MS_TILE.Overlay_Buffer,
  MS_TILE.Burglar,
  MS_TILE.Socket,
  MS_TILE.Button_Green,
  MS_TILE.Button_Red,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.SwitchWall_Open,
  MS_TILE.Button_Brown,
  MS_TILE.Button_Blue,
  MS_TILE.Teleport,
  MS_TILE.Bomb,
  MS_TILE.Beartrap,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.Gravel,
  MS_TILE.PopupWall,
  MS_TILE.HintButton,
  MS_TILE.Wall_Southeast,
  MS_TILE.CloneMachine,
  MS_TILE.Slide_Random,
  MS_TILE.Drowned_Chip,
  MS_TILE.Burned_Chip,
  MS_TILE.Bombed_Chip,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.HiddenWall_Perm,
  MS_TILE.Exited_Chip,
  MS_TILE.Exit_Extra_1,
  MS_TILE.Exit_Extra_2,
  msCreatureTile(MS_TILE.Swimming_Chip, 1),
  msCreatureTile(MS_TILE.Swimming_Chip, 2),
  msCreatureTile(MS_TILE.Swimming_Chip, 4),
  msCreatureTile(MS_TILE.Swimming_Chip, 8),
  msCreatureTile(MS_TILE.Bug, 1),
  msCreatureTile(MS_TILE.Bug, 2),
  msCreatureTile(MS_TILE.Bug, 4),
  msCreatureTile(MS_TILE.Bug, 8),
  msCreatureTile(MS_TILE.Fireball, 1),
  msCreatureTile(MS_TILE.Fireball, 2),
  msCreatureTile(MS_TILE.Fireball, 4),
  msCreatureTile(MS_TILE.Fireball, 8),
  msCreatureTile(MS_TILE.Ball, 1),
  msCreatureTile(MS_TILE.Ball, 2),
  msCreatureTile(MS_TILE.Ball, 4),
  msCreatureTile(MS_TILE.Ball, 8),
  msCreatureTile(MS_TILE.Tank, 1),
  msCreatureTile(MS_TILE.Tank, 2),
  msCreatureTile(MS_TILE.Tank, 4),
  msCreatureTile(MS_TILE.Tank, 8),
  msCreatureTile(MS_TILE.Glider, 1),
  msCreatureTile(MS_TILE.Glider, 2),
  msCreatureTile(MS_TILE.Glider, 4),
  msCreatureTile(MS_TILE.Glider, 8),
  msCreatureTile(MS_TILE.Teeth, 1),
  msCreatureTile(MS_TILE.Teeth, 2),
  msCreatureTile(MS_TILE.Teeth, 4),
  msCreatureTile(MS_TILE.Teeth, 8),
  msCreatureTile(MS_TILE.Walker, 1),
  msCreatureTile(MS_TILE.Walker, 2),
  msCreatureTile(MS_TILE.Walker, 4),
  msCreatureTile(MS_TILE.Walker, 8),
  msCreatureTile(MS_TILE.Blob, 1),
  msCreatureTile(MS_TILE.Blob, 2),
  msCreatureTile(MS_TILE.Blob, 4),
  msCreatureTile(MS_TILE.Blob, 8),
  msCreatureTile(MS_TILE.Paramecium, 1),
  msCreatureTile(MS_TILE.Paramecium, 2),
  msCreatureTile(MS_TILE.Paramecium, 4),
  msCreatureTile(MS_TILE.Paramecium, 8),
  MS_TILE.Key_Blue,
  MS_TILE.Key_Red,
  MS_TILE.Key_Green,
  MS_TILE.Key_Yellow,
  MS_TILE.Boots_Water,
  MS_TILE.Boots_Fire,
  MS_TILE.Boots_Ice,
  MS_TILE.Boots_Slide,
  msCreatureTile(MS_TILE.Chip, 1),
  msCreatureTile(MS_TILE.Chip, 2),
  msCreatureTile(MS_TILE.Chip, 4),
  msCreatureTile(MS_TILE.Chip, 8),
  MS_TILE.Sandbag,
  MS_TILE.BowlingBall_Still,
  MS_TILE.Cloud,
  MS_TILE.Hook,
] as const;

function remapBuiltinMsTile(tileId: number, context: MsLevelDecodeContext): number {
  if (context.z > 1 && tileId === MS_TILE.Overlay_Buffer) {
    return MS_TILE.Air;
  }

  if (tileId === MS_TILE.Cloud && context.z <= 1) {
    return MS_TILE.Empty;
  }

  if (context.hasHigherLayers && tileId === MS_TILE.Exited_Chip) {
    return MS_TILE.Elevator;
  }

  return tileId;
}

export const msRegisteredLevelDecodeEntries = MS_BUILTIN_LEVEL_DECODE_ENTRIES.map((tileId, fileCode) => ({
  fileCode,
  tileId,
  resolveTileId: remapBuiltinMsTile,
})) as readonly MsLevelDecodeRegistrationEntry[];

export const msRegisteredLevelDecodeRegistration = createMsLevelDecodeRegistration(msRegisteredLevelDecodeEntries);
export const msRegisteredLevelLoadRegistration = createMsLevelLoadRegistration(msRegisteredLevelDecodeRegistration);

export const msElementFamilyRegistration: MsElementFamilyRegistration = {
  actorFamilies: MS_ACTOR_FAMILY_REGISTRATIONS,
  portableItemFamilies: msPortableItemFamilyRegistrations,
  terrainPickupFamilies: MS_TERRAIN_PICKUP_FAMILY_REGISTRATIONS,
  levelDecodeRegistration: msRegisteredLevelDecodeRegistration,
  levelLoadRegistration: msRegisteredLevelLoadRegistration,
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

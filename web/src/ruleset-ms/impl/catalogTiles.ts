import {
  composeTileBehaviors,
  type TileCapability,
  type TileDefinition,
  type TileHookName,
  type TileTag,
} from "@game-core/api/ruleset";
import { composeRulesetTilePolicy, createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import { isMsCreature, msCreatureId, MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { createMsAirTileFamily } from "@ruleset-ms/impl/elements/tiles/families/air";
import { createMsButtonTileFamily } from "@ruleset-ms/impl/elements/tiles/families/button";
import { createMsClonerTileFamily } from "@ruleset-ms/impl/elements/tiles/families/cloner";
import { createMsConcreteTileBehavior } from "@ruleset-ms/impl/elements/tiles/concrete/registration";
import { createMsDoorTileFamily } from "@ruleset-ms/impl/elements/tiles/families/door";
import { createMsFloorTileFamily } from "@ruleset-ms/impl/elements/tiles/families/floor";
import { createMsForcedFloorTileFamily } from "@ruleset-ms/impl/elements/tiles/families/forcedFloor";
import { createMsLeaveTileBehavior } from "@ruleset-ms/impl/elements/tiles/families/leave";
import { createMsPickupTileFamily } from "@ruleset-ms/impl/elements/tiles/families/pickup";
import { MS_FULL_MOVEMENT_MASK, type MsTileFamilyDefinition } from "@ruleset-ms/impl/elements/tiles/families/shared";
import { createMsSupportTileBehavior } from "@ruleset-ms/impl/elements/tiles/families/support";
import { createMsTrapTileFamily } from "@ruleset-ms/impl/elements/tiles/families/trap";
import { createMsWallTileFamily } from "@ruleset-ms/impl/elements/tiles/families/wall";
import { createMsChipEnterTileBehavior } from "@ruleset-ms/impl/chipEnterBehavior";

export type MsInventorySlot = "keys" | "boots" | "tools";
export type MsPortableItemFamily = "sandbag" | "hook" | "bowling-ball";
export type MsForcedFloorKind = "none" | "slide" | "ice" | "teleport" | "air" | "elevator";
export type MsMobExitAction = "none" | "turn-to-air";
export type MsChipEnterAction =
  | "none"
  | "clear-floor"
  | "collect-chip"
  | "popup-wall"
  | "open-door"
  | "collect-item"
  | "open-socket"
  | "steal-boots"
  | "explode-bomb"
  | "water-death"
  | "fire-death"
  | "teleport"
  | "collision";
export type MsButtonAction = "none" | "turn-tanks" | "toggle-walls" | "activate-cloner" | "spring-trap";

export interface MsTilePolicyDefinition {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
  readonly chipMovementMask: number;
  readonly creatureMovementMask: number;
  readonly blockMovementMask: number;
  readonly exitMovementMask: number;
  readonly requiresReleaseToExit: boolean;
  readonly inventorySlot?: MsInventorySlot;
  readonly portableItemFamily?: MsPortableItemFamily;
  readonly inventoryIndex?: number;
  readonly doorKeyIndex?: number;
  readonly forcedFloorKind: MsForcedFloorKind;
  readonly mobExitAction: MsMobExitAction;
  readonly chipEnterAction: MsChipEnterAction;
  readonly buttonAction: MsButtonAction;
}

const KEY_TILE_IDS = [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green] as const;
const BOOT_TILE_IDS = [MS_TILE.Boots_Ice, MS_TILE.Boots_Slide, MS_TILE.Boots_Fire, MS_TILE.Boots_Water] as const;
const DOOR_TILE_IDS = [MS_TILE.Door_Red, MS_TILE.Door_Blue, MS_TILE.Door_Yellow, MS_TILE.Door_Green] as const;
const BUTTON_TILE_IDS = [
  MS_TILE.Button_Blue,
  MS_TILE.Button_Green,
  MS_TILE.Button_Red,
  MS_TILE.Button_Brown,
] as const;
const SLIDE_TILE_IDS = [
  MS_TILE.Slide_North,
  MS_TILE.Slide_West,
  MS_TILE.Slide_South,
  MS_TILE.Slide_East,
  MS_TILE.Slide_Random,
] as const;
const ICE_TILE_IDS = [
  MS_TILE.Ice,
  MS_TILE.IceWall_Northwest,
  MS_TILE.IceWall_Northeast,
  MS_TILE.IceWall_Southwest,
  MS_TILE.IceWall_Southeast,
] as const;
const ACTOR_TILE_IDS = [
  MS_TILE.Chip,
  MS_TILE.Block,
  MS_TILE.Tank,
  MS_TILE.Ball,
  MS_TILE.Glider,
  MS_TILE.Fireball,
  MS_TILE.Walker,
  MS_TILE.Blob,
  MS_TILE.Teeth,
  MS_TILE.Bug,
  MS_TILE.Paramecium,
  MS_TILE.Swimming_Chip,
  MS_TILE.Pushing_Chip,
  MS_TILE.BowlingBall,
] as const;

const ENTRY_MASK_BY_TILE = new Map<number, number>([
  [MS_TILE.IceWall_Northwest, MS_DIRECTION.south | MS_DIRECTION.east],
  [MS_TILE.IceWall_Northeast, MS_DIRECTION.south | MS_DIRECTION.west],
  [MS_TILE.IceWall_Southwest, MS_DIRECTION.north | MS_DIRECTION.east],
  [MS_TILE.IceWall_Southeast, MS_DIRECTION.north | MS_DIRECTION.west],
  [MS_TILE.Wall_North, MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.east],
  [MS_TILE.Wall_West, MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south],
  [MS_TILE.Wall_South, MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east],
  [MS_TILE.Wall_East, MS_DIRECTION.north | MS_DIRECTION.south | MS_DIRECTION.east],
  [MS_TILE.Wall_Southeast, MS_DIRECTION.south | MS_DIRECTION.east],
]);

const EXIT_MASK_BY_TILE = new Map<number, number>([
  [MS_TILE.Wall_North, MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east],
  [MS_TILE.Wall_West, MS_DIRECTION.north | MS_DIRECTION.south | MS_DIRECTION.east],
  [MS_TILE.Wall_South, MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.east],
  [MS_TILE.Wall_East, MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south],
  [MS_TILE.Wall_Southeast, MS_DIRECTION.north | MS_DIRECTION.west],
]);

const DEFAULT_MS_TILE_POLICY: MsTilePolicyDefinition = {
  tags: [],
  capabilities: [],
  hooks: [],
  chipMovementMask: 0,
  creatureMovementMask: 0,
  blockMovementMask: 0,
  exitMovementMask: MS_FULL_MOVEMENT_MASK,
  requiresReleaseToExit: false,
  forcedFloorKind: "none",
  mobExitAction: "none",
  chipEnterAction: "none",
  buttonAction: "none",
};

function msTileConstName(id: number): string {
  for (const [name, value] of Object.entries(MS_TILE)) {
    if (value === id) {
      return name;
    }
  }
  return `Unknown_${id}`;
}

function humanizeMsTileName(name: string): string {
  return name.replaceAll("_", " ");
}

function msButtonActionForTile(id: number): MsButtonAction {
  switch (id) {
    case MS_TILE.Button_Blue:
      return "turn-tanks";
    case MS_TILE.Button_Green:
      return "toggle-walls";
    case MS_TILE.Button_Red:
      return "activate-cloner";
    case MS_TILE.Button_Brown:
      return "spring-trap";
    default:
      return "none";
  }
}

const msTileFamilies: readonly MsTileFamilyDefinition[] = [
  createMsFloorTileFamily({
    name: "floor",
    tileIds: [MS_TILE.Empty],
    chipEnterAction: "clear-floor",
  }),
  createMsFloorTileFamily({
    name: "gravel",
    tileIds: [MS_TILE.Gravel],
    creatureMovementMask: 0,
  }),
  createMsAirTileFamily({
    name: "cloud",
    tileIds: [MS_TILE.Cloud],
    hooks: ["after-leave"],
    mobExitAction: "turn-to-air",
  }),
  createMsAirTileFamily({
    name: "air",
    tileIds: [MS_TILE.Air],
    capabilities: ["trigger-on-entry", "forces-movement"],
    forcedFloorKind: "air",
  }),
  createMsAirTileFamily({
    name: "elevator",
    tileIds: [MS_TILE.Elevator],
    forcedFloorKind: "elevator",
  }),
  createMsFloorTileFamily({
    name: "clear-floor",
    tileIds: [MS_TILE.Dirt, MS_TILE.BlueWall_Fake],
    chipEnterAction: "clear-floor",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createMsFloorTileFamily({
    name: "water",
    tileIds: [MS_TILE.Water],
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    chipEnterAction: "water-death",
  }),
  createMsFloorTileFamily({
    name: "fire",
    tileIds: [MS_TILE.Fire],
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    chipEnterAction: "fire-death",
  }),
  createMsFloorTileFamily({
    name: "bomb",
    tileIds: [MS_TILE.Bomb],
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    hooks: ["after-enter"],
    chipEnterAction: "explode-bomb",
  }),
  createMsFloorTileFamily({
    name: "burglar",
    tileIds: [MS_TILE.Burglar],
    capabilities: ["trigger-on-entry"],
    hooks: ["after-enter"],
    chipEnterAction: "steal-boots",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createMsFloorTileFamily({
    name: "hint",
    tileIds: [MS_TILE.HintButton],
    tags: ["hint"],
  }),
  createMsFloorTileFamily({
    name: "socket",
    tileIds: [MS_TILE.Socket],
    tags: ["socket"],
    capabilities: ["trigger-on-entry"],
    hooks: ["after-enter"],
    chipEnterAction: "open-socket",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createMsFloorTileFamily({
    name: "exit",
    tileIds: [MS_TILE.Exit],
    tags: ["exit"],
    capabilities: ["trigger-on-entry"],
    hooks: ["after-enter"],
    creatureMovementMask: 0,
  }),
  createMsFloorTileFamily({
    name: "popup-wall",
    tileIds: [MS_TILE.PopupWall],
    tags: ["blocking"],
    chipEnterAction: "popup-wall",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createMsFloorTileFamily({
    name: "open-toggle-wall",
    tileIds: [MS_TILE.SwitchWall_Open],
    tags: ["toggleable"],
  }),
  createMsFloorTileFamily({
    name: "block-static",
    tileIds: [MS_TILE.Block_Static],
    tags: ["pushable"],
    capabilities: ["accepts-blocks"],
    chipEnterAction: "collision",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createMsPickupTileFamily({
    name: "chip-pickup",
    tileIds: [MS_TILE.ICChip],
    chipEnterAction: "collect-chip",
  }),
  createMsPickupTileFamily({
    name: "keys",
    tileIds: KEY_TILE_IDS,
    tags: ["key", "collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "keys",
    inventoryIndex: (id) => id - MS_TILE.Key_Red,
    creatureMovementMask: MS_FULL_MOVEMENT_MASK,
    blockMovementMask: MS_FULL_MOVEMENT_MASK,
  }),
  createMsPickupTileFamily({
    name: "boots",
    tileIds: BOOT_TILE_IDS,
    tags: ["boots", "collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "boots",
    inventoryIndex: (id) => id - MS_TILE.Boots_Ice,
    blockMovementMask: MS_FULL_MOVEMENT_MASK,
  }),
  createMsPickupTileFamily({
    name: "sandbag",
    tileIds: [MS_TILE.Sandbag],
    tags: ["collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "tools",
    portableItemFamily: "sandbag",
    inventoryIndex: () => 0,
  }),
  createMsPickupTileFamily({
    name: "hook",
    tileIds: [MS_TILE.Hook],
    tags: ["collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "tools",
    portableItemFamily: "hook",
    inventoryIndex: () => 0,
  }),
  createMsPickupTileFamily({
    name: "bowling-ball-still",
    tileIds: [MS_TILE.BowlingBall_Still],
    tags: ["collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "tools",
    portableItemFamily: "bowling-ball",
    inventoryIndex: () => 0,
  }),
  createMsDoorTileFamily({
    name: "doors",
    tileIds: DOOR_TILE_IDS,
    doorKeyIndex: (id) => id - MS_TILE.Door_Red,
  }),
  createMsButtonTileFamily({
    name: "buttons",
    tileIds: BUTTON_TILE_IDS,
    action: msButtonActionForTile,
  }),
  createMsForcedFloorTileFamily({
    name: "slides",
    tileIds: SLIDE_TILE_IDS,
    tags: ["slide"],
    forcedFloorKind: "slide",
    creatureMovementMask: (id) => (id === MS_TILE.Slide_Random ? 0 : MS_FULL_MOVEMENT_MASK),
  }),
  createMsForcedFloorTileFamily({
    name: "ice",
    tileIds: ICE_TILE_IDS,
    tags: ["ice"],
    forcedFloorKind: "ice",
    chipMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? MS_FULL_MOVEMENT_MASK,
    creatureMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? MS_FULL_MOVEMENT_MASK,
    blockMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? MS_FULL_MOVEMENT_MASK,
  }),
  createMsForcedFloorTileFamily({
    name: "teleport",
    tileIds: [MS_TILE.Teleport],
    tags: ["teleport"],
    capabilities: ["trigger-on-entry"],
    hooks: ["after-enter"],
    forcedFloorKind: "teleport",
    chipEnterAction: "teleport",
  }),
  createMsTrapTileFamily({
    name: "trap",
    tileIds: [MS_TILE.Beartrap],
  }),
  createMsClonerTileFamily({
    name: "cloner",
    tileIds: [MS_TILE.CloneMachine],
  }),
  createMsWallTileFamily({
    name: "solid-walls",
    tileIds: [MS_TILE.Wall, MS_TILE.HiddenWall_Perm],
  }),
  createMsWallTileFamily({
    name: "partial-walls",
    tileIds: [MS_TILE.Wall_North, MS_TILE.Wall_West, MS_TILE.Wall_South, MS_TILE.Wall_East, MS_TILE.Wall_Southeast],
    tags: ["walkable"],
    chipMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? 0,
    creatureMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? 0,
    blockMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? 0,
    exitMovementMask: (id) => EXIT_MASK_BY_TILE.get(id) ?? MS_FULL_MOVEMENT_MASK,
  }),
  createMsWallTileFamily({
    name: "reveal-walls",
    tileIds: [MS_TILE.HiddenWall_Temp, MS_TILE.BlueWall_Real],
    tags: ["walkable"],
    chipMovementMask: MS_FULL_MOVEMENT_MASK,
  }),
  createMsWallTileFamily({
    name: "closed-toggle-wall",
    tileIds: [MS_TILE.SwitchWall_Closed],
    tags: ["toggleable"],
  }),
  createRulesetTileFamily<MsTilePolicyDefinition, number>({
    name: "actors",
    tileIds: ACTOR_TILE_IDS,
    policy: {
      chipEnterAction: "collision",
    },
  }),
];

function createMsTilePolicyDefinition(id: number): MsTilePolicyDefinition {
  return composeRulesetTilePolicy(DEFAULT_MS_TILE_POLICY, id, msTileFamilies);
}

function createMsTileDefinition(id: number): TileDefinition<number> {
  const name = msTileConstName(id);
  const policy = createMsTilePolicyDefinition(id);
  return {
    id,
    code: `ms:${name.toLowerCase()}`,
    name: humanizeMsTileName(name),
    tags: policy.tags,
    capabilities: policy.capabilities,
    hooks: policy.hooks,
    behavior: composeTileBehaviors(
      createMsChipEnterTileBehavior(policy),
      createMsLeaveTileBehavior(policy),
      createMsSupportTileBehavior(policy, id),
      createMsConcreteTileBehavior(id),
    ),
  };
}

export const msTileDefinitions = (Object.values(MS_TILE).filter((value) => typeof value === "number") as number[]).map((id) =>
  createMsTileDefinition(id),
);

const msTilePolicies = new Map<number, MsTilePolicyDefinition>(
  msTileDefinitions.map((tile) => [tile.id, createMsTilePolicyDefinition(tile.id)] as const),
);

export function lookupMsTilePolicy(id: number): MsTilePolicyDefinition {
  if (msTilePolicies.has(id)) {
    return msTilePolicies.get(id)!;
  }
  if (id === MS_TILE.Block_Static) {
    return msTilePolicies.get(MS_TILE.Block_Static)!;
  }
  if (isMsCreature(id)) {
    return msTilePolicies.get(msCreatureId(id))!;
  }
  return DEFAULT_MS_TILE_POLICY;
}

export function msSlideDirection(id: number, randomDirection: number): number {
  switch (id) {
    case MS_TILE.Slide_North:
      return MS_DIRECTION.north;
    case MS_TILE.Slide_West:
      return MS_DIRECTION.west;
    case MS_TILE.Slide_South:
      return MS_DIRECTION.south;
    case MS_TILE.Slide_East:
      return MS_DIRECTION.east;
    case MS_TILE.Slide_Random:
      return randomDirection;
    default:
      return MS_DIRECTION.none;
  }
}

export function msIceWallTurn(id: number, dir: number): number {
  switch (id) {
    case MS_TILE.IceWall_Northeast:
      return dir === MS_DIRECTION.south ? MS_DIRECTION.east : dir === MS_DIRECTION.west ? MS_DIRECTION.north : dir;
    case MS_TILE.IceWall_Southwest:
      return dir === MS_DIRECTION.north ? MS_DIRECTION.west : dir === MS_DIRECTION.east ? MS_DIRECTION.south : dir;
    case MS_TILE.IceWall_Northwest:
      return dir === MS_DIRECTION.south ? MS_DIRECTION.west : dir === MS_DIRECTION.east ? MS_DIRECTION.north : dir;
    case MS_TILE.IceWall_Southeast:
      return dir === MS_DIRECTION.north ? MS_DIRECTION.east : dir === MS_DIRECTION.west ? MS_DIRECTION.south : dir;
    default:
      return dir;
  }
}

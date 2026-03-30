import {
  composeTileBehaviors,
  type TileCapability,
  type TileDefinition,
  type TileHookName,
  type TileTag,
} from "@game-core/api/ruleset";
import { composeRulesetTilePolicy, createRulesetTileFamily } from "@game-core/impl/tileFamilies";
import { isMsCreature, msCreatureId, MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import { createLynxAirTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/air";
import { createLynxButtonTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/button";
import { createLynxClonerTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/cloner";
import { createLynxConcreteTileBehavior } from "@ruleset-lynx/impl/elements/tiles/concrete/registration";
import { createLynxDoorTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/door";
import { createLynxFloorTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/floor";
import { createLynxForcedFloorTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/forcedFloor";
import { createLynxLeaveTileBehavior } from "@ruleset-lynx/impl/elements/tiles/families/leave";
import { createLynxPickupTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/pickup";
import { createLynxChipEnterTileBehavior } from "@ruleset-lynx/impl/chipEnterBehavior";
import { createLynxSupportTileBehavior } from "@ruleset-lynx/impl/elements/tiles/families/support";
import {
  LYNX_FULL_MOVEMENT_MASK,
  type LynxTileFamilyDefinition,
} from "@ruleset-lynx/impl/elements/tiles/families/shared";
import { createLynxTrapTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/trap";
import { createLynxWallTileFamily } from "@ruleset-lynx/impl/elements/tiles/families/wall";

export type LynxInventorySlot = "keys" | "boots" | "tools";
export type LynxPortableItemFamily = "sandbag" | "hook" | "bowling-ball";
export type LynxForcedFloorKind = "none" | "slide" | "ice" | "teleport" | "air" | "elevator";
export type LynxCreatureFloorAction = "none" | "hold-direction";
export type LynxMobExitAction = "none" | "turn-to-air";
export type LynxChipEnterAction =
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
  | "trap"
  | "button"
  | "exit";
export type LynxButtonAction = "none" | "turn-tanks" | "toggle-walls" | "activate-cloner" | "spring-trap";
export type LynxAnimationKind = "none" | "water-splash" | "bomb-explosion";
export type LynxFloorSoundAction =
  | "none"
  | "fire-walk"
  | "water-walk"
  | "ice-walk"
  | "skate-forward"
  | "skate-turn"
  | "slide-walk"
  | "slide";

export interface LynxTilePolicyDefinition {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
  readonly chipMovementMask: number;
  readonly creatureMovementMask: number;
  readonly blockMovementMask: number;
  readonly exitMovementMask: number;
  readonly requiresReleaseToExit: boolean;
  readonly creatureFloorAction: LynxCreatureFloorAction;
  readonly inventorySlot?: LynxInventorySlot;
  readonly portableItemFamily?: LynxPortableItemFamily;
  readonly inventoryIndex?: number;
  readonly doorKeyIndex?: number;
  readonly forcedFloorKind: LynxForcedFloorKind;
  readonly mobExitAction: LynxMobExitAction;
  readonly chipEnterAction: LynxChipEnterAction;
  readonly buttonAction: LynxButtonAction;
}

export interface LynxChipMoveSoundOptions {
  readonly hasFireBoots: boolean;
  readonly hasWaterBoots: boolean;
  readonly hasIceBoots: boolean;
  readonly hasSlideBoots: boolean;
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
  [MS_TILE.IceWall_Northwest, MS_DIRECTION.north | MS_DIRECTION.west],
  [MS_TILE.IceWall_Northeast, MS_DIRECTION.north | MS_DIRECTION.east],
  [MS_TILE.IceWall_Southwest, MS_DIRECTION.south | MS_DIRECTION.west],
  [MS_TILE.IceWall_Southeast, MS_DIRECTION.south | MS_DIRECTION.east],
]);

const DEFAULT_LYNX_TILE_POLICY: LynxTilePolicyDefinition = {
  tags: [],
  capabilities: [],
  hooks: [],
  chipMovementMask: 0,
  creatureMovementMask: 0,
  blockMovementMask: 0,
  exitMovementMask: LYNX_FULL_MOVEMENT_MASK,
  requiresReleaseToExit: false,
  creatureFloorAction: "none",
  forcedFloorKind: "none",
  mobExitAction: "none",
  chipEnterAction: "none",
  buttonAction: "none",
};

function lynxTileConstName(id: number): string {
  for (const [name, value] of Object.entries(MS_TILE)) {
    if (value === id) {
      return name;
    }
  }
  return `Unknown_${id}`;
}

function humanizeLynxTileName(name: string): string {
  return name.replaceAll("_", " ");
}

function lynxButtonActionForTile(id: number): LynxButtonAction {
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

const lynxTileFamilies: readonly LynxTileFamilyDefinition[] = [
  createLynxFloorTileFamily({
    name: "floor",
    tileIds: [MS_TILE.Empty],
  }),
  createLynxFloorTileFamily({
    name: "gravel",
    tileIds: [MS_TILE.Gravel],
    creatureMovementMask: 0,
  }),
  createLynxAirTileFamily({
    name: "cloud",
    tileIds: [MS_TILE.Cloud],
    hooks: ["after-leave"],
    mobExitAction: "turn-to-air",
  }),
  createLynxAirTileFamily({
    name: "air",
    tileIds: [MS_TILE.Air],
    capabilities: ["forces-movement"],
    forcedFloorKind: "air",
  }),
  createLynxAirTileFamily({
    name: "elevator",
    tileIds: [MS_TILE.Elevator],
    capabilities: ["forces-movement"],
    forcedFloorKind: "elevator",
  }),
  createLynxFloorTileFamily({
    name: "clear-floor",
    tileIds: [MS_TILE.Dirt, MS_TILE.BlueWall_Fake],
    chipEnterAction: "clear-floor",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createLynxFloorTileFamily({
    name: "water",
    tileIds: [MS_TILE.Water],
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    chipEnterAction: "water-death",
  }),
  createLynxFloorTileFamily({
    name: "fire",
    tileIds: [MS_TILE.Fire],
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    chipEnterAction: "fire-death",
  }),
  createLynxFloorTileFamily({
    name: "bomb",
    tileIds: [MS_TILE.Bomb],
    tags: ["deadly"],
    capabilities: ["kills-on-entry"],
    hooks: ["after-enter"],
    chipEnterAction: "explode-bomb",
  }),
  createLynxFloorTileFamily({
    name: "burglar",
    tileIds: [MS_TILE.Burglar],
    capabilities: ["trigger-on-entry"],
    chipEnterAction: "steal-boots",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createLynxFloorTileFamily({
    name: "hint",
    tileIds: [MS_TILE.HintButton],
    tags: ["hint"],
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createLynxFloorTileFamily({
    name: "socket",
    tileIds: [MS_TILE.Socket],
    tags: ["socket"],
    capabilities: ["trigger-on-entry"],
    chipEnterAction: "open-socket",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createLynxFloorTileFamily({
    name: "exit",
    tileIds: [MS_TILE.Exit],
    tags: ["exit"],
    capabilities: ["trigger-on-entry"],
    chipEnterAction: "exit",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createLynxFloorTileFamily({
    name: "popup-wall",
    tileIds: [MS_TILE.PopupWall],
    tags: ["blocking"],
    chipEnterAction: "popup-wall",
    creatureMovementMask: 0,
    blockMovementMask: 0,
  }),
  createLynxFloorTileFamily({
    name: "open-toggle-wall",
    tileIds: [MS_TILE.SwitchWall_Open],
    tags: ["toggleable"],
  }),
  createLynxPickupTileFamily({
    name: "chip-pickup",
    tileIds: [MS_TILE.ICChip],
    chipEnterAction: "collect-chip",
  }),
  createLynxPickupTileFamily({
    name: "red-blue-keys",
    tileIds: [MS_TILE.Key_Red, MS_TILE.Key_Blue],
    tags: ["key", "collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "keys",
    inventoryIndex: (id) => id - MS_TILE.Key_Red,
    creatureMovementMask: LYNX_FULL_MOVEMENT_MASK,
    blockMovementMask: LYNX_FULL_MOVEMENT_MASK,
  }),
  createLynxPickupTileFamily({
    name: "yellow-green-keys",
    tileIds: [MS_TILE.Key_Yellow, MS_TILE.Key_Green],
    tags: ["key", "collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "keys",
    inventoryIndex: (id) => id - MS_TILE.Key_Red,
  }),
  createLynxPickupTileFamily({
    name: "boots",
    tileIds: BOOT_TILE_IDS,
    tags: ["boots", "collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "boots",
    inventoryIndex: (id) => id - MS_TILE.Boots_Ice,
  }),
  createLynxPickupTileFamily({
    name: "sandbag",
    tileIds: [MS_TILE.Sandbag],
    tags: ["collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "tools",
    portableItemFamily: "sandbag",
    inventoryIndex: () => 0,
  }),
  createLynxPickupTileFamily({
    name: "hook",
    tileIds: [MS_TILE.Hook],
    tags: ["collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "tools",
    portableItemFamily: "hook",
    inventoryIndex: () => 0,
  }),
  createLynxPickupTileFamily({
    name: "bowling-ball-still",
    tileIds: [MS_TILE.BowlingBall_Still],
    tags: ["collectible"],
    chipEnterAction: "collect-item",
    inventorySlot: "tools",
    portableItemFamily: "bowling-ball",
    inventoryIndex: () => 0,
  }),
  createLynxDoorTileFamily({
    name: "doors",
    tileIds: DOOR_TILE_IDS,
    doorKeyIndex: (id) => id - MS_TILE.Door_Red,
  }),
  createLynxButtonTileFamily({
    name: "buttons",
    tileIds: BUTTON_TILE_IDS,
    action: lynxButtonActionForTile,
  }),
  createLynxForcedFloorTileFamily({
    name: "slides",
    tileIds: SLIDE_TILE_IDS,
    tags: ["slide"],
    forcedFloorKind: "slide",
  }),
  createLynxForcedFloorTileFamily({
    name: "ice",
    tileIds: ICE_TILE_IDS,
    tags: ["ice"],
    forcedFloorKind: "ice",
    chipMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? LYNX_FULL_MOVEMENT_MASK,
    creatureMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? LYNX_FULL_MOVEMENT_MASK,
    blockMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? LYNX_FULL_MOVEMENT_MASK,
  }),
  createLynxForcedFloorTileFamily({
    name: "teleport",
    tileIds: [MS_TILE.Teleport],
    tags: ["teleport"],
    hooks: ["after-enter"],
    forcedFloorKind: "teleport",
  }),
  createLynxTrapTileFamily({
    name: "trap",
    tileIds: [MS_TILE.Beartrap],
  }),
  createLynxClonerTileFamily({
    name: "cloner",
    tileIds: [MS_TILE.CloneMachine],
  }),
  createLynxWallTileFamily({
    name: "solid-walls",
    tileIds: [MS_TILE.Wall, MS_TILE.HiddenWall_Perm],
  }),
  createLynxWallTileFamily({
    name: "partial-walls",
    tileIds: [MS_TILE.Wall_North, MS_TILE.Wall_West, MS_TILE.Wall_South, MS_TILE.Wall_East, MS_TILE.Wall_Southeast],
    chipMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? 0,
    creatureMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? 0,
    blockMovementMask: (id) => ENTRY_MASK_BY_TILE.get(id) ?? 0,
    exitMovementMask: (id) => EXIT_MASK_BY_TILE.get(id) ?? LYNX_FULL_MOVEMENT_MASK,
  }),
  createLynxWallTileFamily({
    name: "reveal-walls",
    tileIds: [MS_TILE.HiddenWall_Temp, MS_TILE.BlueWall_Real],
  }),
  createLynxWallTileFamily({
    name: "closed-toggle-wall",
    tileIds: [MS_TILE.SwitchWall_Closed],
    tags: ["toggleable"],
  }),
  createRulesetTileFamily<LynxTilePolicyDefinition, number>({
    name: "ice-wall-exits",
    tileIds: [
      MS_TILE.IceWall_Northwest,
      MS_TILE.IceWall_Northeast,
      MS_TILE.IceWall_Southwest,
      MS_TILE.IceWall_Southeast,
    ],
    policy: (id) => ({
      exitMovementMask: EXIT_MASK_BY_TILE.get(id) ?? LYNX_FULL_MOVEMENT_MASK,
    }),
  }),
  createRulesetTileFamily<LynxTilePolicyDefinition, number>({
    name: "block-static",
    tileIds: [MS_TILE.Block_Static],
    policy: {
      tags: ["pushable"],
      capabilities: ["accepts-blocks"],
    },
  }),
];

function createLynxTilePolicyDefinition(id: number): LynxTilePolicyDefinition {
  return composeRulesetTilePolicy(DEFAULT_LYNX_TILE_POLICY, id, lynxTileFamilies);
}

function createLynxTileDefinition(id: number): TileDefinition<number> {
  const name = lynxTileConstName(id);
  const policy = createLynxTilePolicyDefinition(id);
  return {
    id,
    code: `lynx:${name.toLowerCase()}`,
    name: humanizeLynxTileName(name),
    tags: policy.tags,
    capabilities: policy.capabilities,
    hooks: policy.hooks,
    behavior: composeTileBehaviors(
      createLynxChipEnterTileBehavior(policy),
      createLynxLeaveTileBehavior(policy),
      createLynxSupportTileBehavior(policy, id),
      createLynxConcreteTileBehavior(id),
    ),
  };
}

export const lynxTileDefinitions = (Object.values(MS_TILE).filter((value) => typeof value === "number") as number[]).map((id) =>
  createLynxTileDefinition(id),
);

const lynxTilePolicies = new Map<number, LynxTilePolicyDefinition>(
  lynxTileDefinitions.map((tile) => [tile.id, createLynxTilePolicyDefinition(tile.id)] as const),
);

export function lookupLynxTilePolicy(id: number): LynxTilePolicyDefinition {
  if (lynxTilePolicies.has(id)) {
    return lynxTilePolicies.get(id)!;
  }
  if (id === MS_TILE.Block_Static) {
    return lynxTilePolicies.get(MS_TILE.Block_Static)!;
  }
  if (isMsCreature(id)) {
    return lynxTilePolicies.get(msCreatureId(id))!;
  }
  return DEFAULT_LYNX_TILE_POLICY;
}

export function lynxToggledWallTileId(id: number): number {
  if (id === MS_TILE.SwitchWall_Open || id === MS_TILE.SwitchWall_Closed) {
    return id ^ (MS_TILE.SwitchWall_Open ^ MS_TILE.SwitchWall_Closed);
  }
  return id;
}

export function lynxFixedSlideDirection(id: number): number {
  switch (id) {
    case MS_TILE.Slide_North:
      return MS_DIRECTION.north;
    case MS_TILE.Slide_West:
      return MS_DIRECTION.west;
    case MS_TILE.Slide_South:
      return MS_DIRECTION.south;
    case MS_TILE.Slide_East:
      return MS_DIRECTION.east;
    default:
      return MS_DIRECTION.none;
  }
}

export function lynxIceWallTurn(id: number, dir: number): number {
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

export function lynxChipMoveSoundAction(
  tileId: number,
  options: LynxChipMoveSoundOptions,
): LynxFloorSoundAction {
  if (tileId === MS_TILE.Fire) {
    return options.hasFireBoots ? "fire-walk" : "none";
  }
  if (tileId === MS_TILE.Water) {
    return options.hasWaterBoots ? "water-walk" : "none";
  }
  if (tileId === MS_TILE.Ice) {
    return options.hasIceBoots ? "ice-walk" : "skate-forward";
  }
  if (lookupLynxTilePolicy(tileId).forcedFloorKind === "ice") {
    return options.hasIceBoots ? "ice-walk" : "skate-turn";
  }
  if (lookupLynxTilePolicy(tileId).forcedFloorKind === "slide") {
    return options.hasSlideBoots ? "slide-walk" : "slide";
  }
  return "none";
}

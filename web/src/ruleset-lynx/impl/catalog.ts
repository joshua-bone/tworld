import type {
  ActorAirHook,
  ActorBlockedMoveKind,
  ActorCapabilityPolicy,
  ActorClonerHook,
  ActorCollisionStrategyId,
  ActorControlMode,
  ActorGlobalProgressKind,
  ActorHazardName,
  ActorHazardResponse,
  ActorItemCollectionKind,
  ActorLocalInventoryMode,
  ActorMovementStrategyId,
  ActorThiefHook,
  ActorTrapHook,
} from "@game-core/api/actorCapabilities";
import {
  actorAirHook,
  actorBlockedMoveKind,
  actorClonerHook,
  actorCollisionStrategyId,
  actorControlMode,
  actorGlobalProgressKind,
  actorHazardResponse,
  actorItemCollectionKind,
  actorLocalInventoryMode,
  actorMovementStrategyId,
  actorThiefHook,
  actorTrapHook,
} from "@game-core/api/actorCapabilities";
import {
  createRulesetCatalog,
  type ActorDefinition,
  type ActorTag,
  type TileCapability,
  type TileDefinition,
  type TileHookName,
  type TileTag,
} from "@game-core/api/ruleset";
import { isMsCreature, msCreatureId, MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";

type InventorySlot = "keys" | "boots" | "tools";
type PortableItemFamily = "sandbag";
type LynxForcedFloorKind = "none" | "slide" | "ice" | "teleport" | "air" | "elevator";
type LynxCreatureFloorAction = "none" | "hold-direction";
type LynxChipEnterAction =
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
type LynxButtonAction = "none" | "turn-tanks" | "toggle-walls" | "activate-cloner" | "spring-trap";
type LynxCreatureArrivalAction =
  | "none"
  | "trap"
  | "button"
  | "clear-key-blue"
  | "block-water"
  | "block-bomb"
  | "creature-water"
  | "creature-bomb";
type LynxAnimationKind = "none" | "water-splash" | "bomb-explosion";
type LynxFloorSoundAction =
  | "none"
  | "fire-walk"
  | "water-walk"
  | "ice-walk"
  | "skate-forward"
  | "skate-turn"
  | "slide-walk"
  | "slide";

interface LynxTilePolicyDefinition {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
  readonly chipMovementMask: number;
  readonly creatureMovementMask: number;
  readonly blockMovementMask: number;
  readonly exitMovementMask: number;
  readonly requiresReleaseToExit: boolean;
  readonly creatureFloorAction: LynxCreatureFloorAction;
  readonly inventorySlot?: InventorySlot;
  readonly portableItemFamily?: PortableItemFamily;
  readonly inventoryIndex?: number;
  readonly doorKeyIndex?: number;
  readonly forcedFloorKind: LynxForcedFloorKind;
  readonly chipEnterAction: LynxChipEnterAction;
  readonly buttonAction: LynxButtonAction;
}

interface LynxChipMoveSoundOptions {
  readonly hasFireBoots: boolean;
  readonly hasWaterBoots: boolean;
  readonly hasIceBoots: boolean;
  readonly hasSlideBoots: boolean;
}

const FULL_MOVEMENT_MASK =
  MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;

const KEY_TILE_IDS = [MS_TILE.Key_Red, MS_TILE.Key_Blue, MS_TILE.Key_Yellow, MS_TILE.Key_Green] as const;
const BOOT_TILE_IDS = [MS_TILE.Boots_Ice, MS_TILE.Boots_Slide, MS_TILE.Boots_Fire, MS_TILE.Boots_Water] as const;
const TOOL_TILE_IDS = [MS_TILE.Sandbag] as const;
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
const DEADLY_TILE_IDS = [MS_TILE.Water, MS_TILE.Fire, MS_TILE.Bomb] as const;
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
] as const;

const KEY_TILE_SET = new Set<number>(KEY_TILE_IDS);
const BOOT_TILE_SET = new Set<number>(BOOT_TILE_IDS);
const TOOL_TILE_SET = new Set<number>(TOOL_TILE_IDS);
const DOOR_TILE_SET = new Set<number>(DOOR_TILE_IDS);
const BUTTON_TILE_SET = new Set<number>(BUTTON_TILE_IDS);
const SLIDE_TILE_SET = new Set<number>(SLIDE_TILE_IDS);
const ICE_TILE_SET = new Set<number>(ICE_TILE_IDS);
const DEADLY_TILE_SET = new Set<number>(DEADLY_TILE_IDS);

const CHIPPABLE_TILE_IDS = new Set<number>([
  MS_TILE.Empty,
  MS_TILE.Air,
  MS_TILE.Elevator,
  ...SLIDE_TILE_IDS,
  MS_TILE.Ice,
  MS_TILE.Water,
  MS_TILE.Fire,
  MS_TILE.Bomb,
  MS_TILE.Beartrap,
  MS_TILE.Burglar,
  MS_TILE.HintButton,
  ...BUTTON_TILE_IDS,
  MS_TILE.Teleport,
  ...DOOR_TILE_IDS,
  MS_TILE.Socket,
  MS_TILE.Exit,
  MS_TILE.ICChip,
  ...KEY_TILE_IDS,
  ...BOOT_TILE_IDS,
  ...TOOL_TILE_IDS,
  MS_TILE.Gravel,
  MS_TILE.Dirt,
  MS_TILE.BlueWall_Fake,
  MS_TILE.SwitchWall_Open,
  MS_TILE.PopupWall,
]);

const CREATURE_BLOCKED_TILE_IDS = new Set<number>([
  MS_TILE.Gravel,
  MS_TILE.Dirt,
  MS_TILE.Burglar,
  MS_TILE.HintButton,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.BlueWall_Real,
  MS_TILE.BlueWall_Fake,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.PopupWall,
  MS_TILE.CloneMachine,
  ...DOOR_TILE_IDS,
  MS_TILE.Socket,
  MS_TILE.Exit,
  MS_TILE.ICChip,
  MS_TILE.Key_Yellow,
  MS_TILE.Key_Green,
  ...BOOT_TILE_IDS,
  ...TOOL_TILE_IDS,
  MS_TILE.Block_Static,
]);

const BLOCK_BLOCKED_TILE_IDS = new Set<number>([
  MS_TILE.Dirt,
  MS_TILE.Burglar,
  MS_TILE.HintButton,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.BlueWall_Real,
  MS_TILE.BlueWall_Fake,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.PopupWall,
  MS_TILE.CloneMachine,
  ...DOOR_TILE_IDS,
  MS_TILE.Socket,
  MS_TILE.Exit,
  MS_TILE.ICChip,
  MS_TILE.Key_Yellow,
  MS_TILE.Key_Green,
  ...BOOT_TILE_IDS,
  ...TOOL_TILE_IDS,
  MS_TILE.Block_Static,
]);

const MOVEMENT_MASK_BY_TILE = new Map<number, number>([
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

function defaultLynxTileTags(id: number): TileTag[] {
  const tags: TileTag[] = [];

  if (CHIPPABLE_TILE_IDS.has(id) || MOVEMENT_MASK_BY_TILE.has(id)) {
    tags.push("walkable");
  }
  if (id === MS_TILE.Air) {
    tags.push("walkable");
  }
  if (id === MS_TILE.Elevator) {
    tags.push("walkable");
  }

  if (DOOR_TILE_SET.has(id)) {
    tags.push("door");
  }
  if (KEY_TILE_SET.has(id)) {
    tags.push("key", "collectible", "walkable");
  }
  if (BOOT_TILE_SET.has(id)) {
    tags.push("boots", "collectible", "walkable");
  }
  if (TOOL_TILE_SET.has(id)) {
    tags.push("collectible", "walkable");
  }
  if (BUTTON_TILE_SET.has(id)) {
    tags.push("button", "walkable");
  }
  if (SLIDE_TILE_SET.has(id)) {
    tags.push("slide", "walkable");
  }
  if (ICE_TILE_SET.has(id)) {
    tags.push("ice", "walkable");
  }
  if (DEADLY_TILE_SET.has(id)) {
    tags.push("deadly", "walkable");
  }

  switch (id) {
    case MS_TILE.Teleport:
      tags.push("teleport", "walkable");
      break;
    case MS_TILE.Beartrap:
      tags.push("trap", "walkable");
      break;
    case MS_TILE.CloneMachine:
      tags.push("cloner");
      break;
    case MS_TILE.SwitchWall_Open:
    case MS_TILE.SwitchWall_Closed:
      tags.push("toggleable");
      break;
    case MS_TILE.Exit:
      tags.push("exit");
      break;
    case MS_TILE.Socket:
      tags.push("socket");
      break;
    case MS_TILE.HintButton:
      tags.push("hint");
      break;
    case MS_TILE.Block_Static:
      tags.push("pushable");
      break;
  }

  if (
    id === MS_TILE.Wall ||
    id === MS_TILE.Wall_North ||
    id === MS_TILE.Wall_West ||
    id === MS_TILE.Wall_South ||
    id === MS_TILE.Wall_East ||
    id === MS_TILE.Wall_Southeast ||
    id === MS_TILE.HiddenWall_Perm ||
    id === MS_TILE.HiddenWall_Temp ||
    id === MS_TILE.BlueWall_Real ||
    id === MS_TILE.SwitchWall_Closed ||
    id === MS_TILE.CloneMachine
  ) {
    tags.push("blocking");
  }

  return [...new Set(tags)];
}

function defaultLynxTileCapabilities(id: number): TileCapability[] {
  const capabilities: TileCapability[] = [];

  if (KEY_TILE_SET.has(id) || BOOT_TILE_SET.has(id) || TOOL_TILE_SET.has(id) || id === MS_TILE.ICChip) {
    capabilities.push("collect-on-entry");
  }
  if (BUTTON_TILE_SET.has(id) || id === MS_TILE.Burglar || id === MS_TILE.Socket || id === MS_TILE.Exit) {
    capabilities.push("trigger-on-entry");
  }
  if (id === MS_TILE.Teleport || id === MS_TILE.Air || id === MS_TILE.Elevator || SLIDE_TILE_SET.has(id) || ICE_TILE_SET.has(id)) {
    capabilities.push("forces-movement");
  }
  if (DEADLY_TILE_SET.has(id)) {
    capabilities.push("kills-on-entry");
  }
  if (id === MS_TILE.Block_Static) {
    capabilities.push("accepts-blocks");
  }
  if (BUTTON_TILE_SET.has(id)) {
    capabilities.push("trigger-on-leave");
  }

  return [...new Set(capabilities)];
}

function defaultLynxTileHooks(id: number): TileHookName[] {
  const hooks: TileHookName[] = [];

  if (
    BUTTON_TILE_SET.has(id) ||
    id === MS_TILE.Burglar ||
    id === MS_TILE.Socket ||
    id === MS_TILE.Exit ||
    id === MS_TILE.Teleport ||
    id === MS_TILE.Bomb ||
    id === MS_TILE.Beartrap
  ) {
    hooks.push("after-enter");
  }

  if (BUTTON_TILE_SET.has(id)) {
    hooks.push("after-leave");
  }

  return [...new Set(hooks)];
}

function defaultLynxForcedFloorKind(id: number): LynxForcedFloorKind {
  if (id === MS_TILE.Teleport) {
    return "teleport";
  }
  if (id === MS_TILE.Air) {
    return "air";
  }
  if (id === MS_TILE.Elevator) {
    return "elevator";
  }
  if (SLIDE_TILE_SET.has(id)) {
    return "slide";
  }
  if (ICE_TILE_SET.has(id)) {
    return "ice";
  }
  return "none";
}

function defaultLynxButtonAction(id: number): LynxButtonAction {
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

function defaultLynxChipEnterAction(id: number): LynxChipEnterAction {
  switch (id) {
    case MS_TILE.Dirt:
    case MS_TILE.BlueWall_Fake:
      return "clear-floor";
    case MS_TILE.ICChip:
      return "collect-chip";
    case MS_TILE.PopupWall:
      return "popup-wall";
    case MS_TILE.Door_Red:
    case MS_TILE.Door_Blue:
    case MS_TILE.Door_Yellow:
    case MS_TILE.Door_Green:
      return "open-door";
    case MS_TILE.Key_Red:
    case MS_TILE.Key_Blue:
    case MS_TILE.Key_Yellow:
    case MS_TILE.Key_Green:
    case MS_TILE.Boots_Ice:
    case MS_TILE.Boots_Slide:
    case MS_TILE.Boots_Fire:
    case MS_TILE.Boots_Water:
    case MS_TILE.Sandbag:
      return "collect-item";
    case MS_TILE.Socket:
      return "open-socket";
    case MS_TILE.Burglar:
      return "steal-boots";
    case MS_TILE.Bomb:
      return "explode-bomb";
    case MS_TILE.Water:
      return "water-death";
    case MS_TILE.Fire:
      return "fire-death";
    case MS_TILE.Button_Blue:
    case MS_TILE.Button_Green:
    case MS_TILE.Button_Red:
    case MS_TILE.Button_Brown:
      return "button";
    case MS_TILE.Beartrap:
      return "trap";
    case MS_TILE.Exit:
      return "exit";
    default:
      return "none";
  }
}

function defaultLynxChipMovementMask(id: number): number {
  if (MOVEMENT_MASK_BY_TILE.has(id)) {
    return MOVEMENT_MASK_BY_TILE.get(id) ?? 0;
  }
  return CHIPPABLE_TILE_IDS.has(id) ? FULL_MOVEMENT_MASK : 0;
}

function defaultLynxCreatureMovementMask(id: number): number {
  if (CREATURE_BLOCKED_TILE_IDS.has(id)) {
    return 0;
  }
  if (id === MS_TILE.Key_Red || id === MS_TILE.Key_Blue) {
    return FULL_MOVEMENT_MASK;
  }
  return defaultLynxChipMovementMask(id);
}

function defaultLynxBlockMovementMask(id: number): number {
  if (BLOCK_BLOCKED_TILE_IDS.has(id)) {
    return 0;
  }
  if (id === MS_TILE.Gravel || id === MS_TILE.Key_Red || id === MS_TILE.Key_Blue) {
    return FULL_MOVEMENT_MASK;
  }
  return defaultLynxChipMovementMask(id);
}

function defaultLynxExitMovementMask(id: number): number {
  switch (id) {
    case MS_TILE.Wall_North:
      return MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;
    case MS_TILE.Wall_West:
      return MS_DIRECTION.north | MS_DIRECTION.south | MS_DIRECTION.east;
    case MS_TILE.Wall_South:
      return MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.east;
    case MS_TILE.Wall_East:
      return MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south;
    case MS_TILE.Wall_Southeast:
    case MS_TILE.IceWall_Northwest:
      return MS_DIRECTION.north | MS_DIRECTION.west;
    case MS_TILE.IceWall_Northeast:
      return MS_DIRECTION.north | MS_DIRECTION.east;
    case MS_TILE.IceWall_Southwest:
      return MS_DIRECTION.south | MS_DIRECTION.west;
    case MS_TILE.IceWall_Southeast:
      return MS_DIRECTION.south | MS_DIRECTION.east;
    default:
      return FULL_MOVEMENT_MASK;
  }
}

function defaultLynxRequiresReleaseToExit(id: number): boolean {
  return id === MS_TILE.Beartrap || id === MS_TILE.CloneMachine;
}

function defaultLynxCreatureFloorAction(id: number): LynxCreatureFloorAction {
  return id === MS_TILE.CloneMachine || id === MS_TILE.Beartrap ? "hold-direction" : "none";
}

function inventoryPolicy(
  id: number,
): Pick<LynxTilePolicyDefinition, "inventorySlot" | "portableItemFamily" | "inventoryIndex" | "doorKeyIndex"> {
  if (KEY_TILE_SET.has(id)) {
    return {
      inventorySlot: "keys",
      inventoryIndex: id - MS_TILE.Key_Red,
    };
  }
  if (BOOT_TILE_SET.has(id)) {
    return {
      inventorySlot: "boots",
      inventoryIndex: id - MS_TILE.Boots_Ice,
    };
  }
  if (TOOL_TILE_SET.has(id)) {
    return {
      inventorySlot: "tools",
      portableItemFamily: "sandbag",
      inventoryIndex: 0,
    };
  }
  if (DOOR_TILE_SET.has(id)) {
    return {
      doorKeyIndex: id - MS_TILE.Door_Red,
    };
  }
  return {};
}

function createLynxTilePolicyDefinition(id: number): LynxTilePolicyDefinition {
  return {
    tags: defaultLynxTileTags(id),
    capabilities: defaultLynxTileCapabilities(id),
    hooks: defaultLynxTileHooks(id),
    chipMovementMask: defaultLynxChipMovementMask(id),
    creatureMovementMask: defaultLynxCreatureMovementMask(id),
    blockMovementMask: defaultLynxBlockMovementMask(id),
    exitMovementMask: defaultLynxExitMovementMask(id),
    requiresReleaseToExit: defaultLynxRequiresReleaseToExit(id),
    creatureFloorAction: defaultLynxCreatureFloorAction(id),
    forcedFloorKind: defaultLynxForcedFloorKind(id),
    chipEnterAction: defaultLynxChipEnterAction(id),
    buttonAction: defaultLynxButtonAction(id),
    ...inventoryPolicy(id),
  };
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
  };
}

const LYNX_CHIP_ACTOR_CAPABILITIES = {
  control: {
    mode: "player-input",
  },
  inventory: {
    localInventoryMode: "keys-boots-tools",
    itemCollectionKind: "keys-boots-tools",
    globalProgressKind: "collect-chips",
  },
  movement: {
    strategyId: "chip-like",
    blockedMoveKind: "stay",
    trapHook: "default",
    clonerHook: "default",
    airHook: "chip-support",
  },
  interaction: {
    thiefHook: "steal-boots-tools",
    collisionStrategyId: "default",
  },
  hazards: {
    responses: {
      water: "destroy",
      fire: "destroy",
      bomb: "destroy",
    },
  },
} as const satisfies ActorCapabilityPolicy;

const LYNX_BLOCK_ACTOR_CAPABILITIES = {
  control: {
    mode: "passive",
  },
  inventory: {
    localInventoryMode: "none",
    itemCollectionKind: "none",
    globalProgressKind: "none",
  },
  movement: {
    strategyId: "block-like",
    blockedMoveKind: "stay",
    trapHook: "default",
    clonerHook: "default",
    airHook: "non-chip-support",
  },
  interaction: {
    thiefHook: "none",
    collisionStrategyId: "default",
  },
  hazards: {
    responses: {
      water: "transform",
      fire: "ignore",
      bomb: "transform",
    },
  },
} as const satisfies ActorCapabilityPolicy;

const LYNX_CREATURE_ACTOR_CAPABILITIES = {
  control: {
    mode: "ai",
  },
  inventory: {
    localInventoryMode: "none",
    itemCollectionKind: "none",
    globalProgressKind: "none",
  },
  movement: {
    strategyId: "creature-like",
    blockedMoveKind: "stay",
    trapHook: "default",
    clonerHook: "default",
    airHook: "non-chip-support",
  },
  interaction: {
    thiefHook: "none",
    collisionStrategyId: "default",
  },
  hazards: {
    responses: {
      water: "destroy",
      fire: "deny",
      bomb: "destroy",
    },
  },
} as const satisfies ActorCapabilityPolicy;

const LYNX_WATER_IMMUNE_CREATURE_CAPABILITIES = {
  ...LYNX_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    responses: {
      ...LYNX_CREATURE_ACTOR_CAPABILITIES.hazards.responses,
      water: "ignore",
    },
  },
} as const satisfies ActorCapabilityPolicy;

const LYNX_FIRE_IMMUNE_CREATURE_CAPABILITIES = {
  ...LYNX_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    responses: {
      ...LYNX_CREATURE_ACTOR_CAPABILITIES.hazards.responses,
      fire: "ignore",
    },
  },
} as const satisfies ActorCapabilityPolicy;

function defaultLynxActorCapabilities(id: number): ActorCapabilityPolicy {
  switch (id) {
    case MS_TILE.Chip:
    case MS_TILE.Swimming_Chip:
    case MS_TILE.Pushing_Chip:
      return LYNX_CHIP_ACTOR_CAPABILITIES;
    case MS_TILE.Block:
      return LYNX_BLOCK_ACTOR_CAPABILITIES;
    case MS_TILE.Glider:
      return LYNX_WATER_IMMUNE_CREATURE_CAPABILITIES;
    case MS_TILE.Fireball:
      return LYNX_FIRE_IMMUNE_CREATURE_CAPABILITIES;
    default:
      return LYNX_CREATURE_ACTOR_CAPABILITIES;
  }
}

function createLynxActorDefinition(id: number): ActorDefinition<number> {
  const name = lynxTileConstName(id);
  const tags =
    id === MS_TILE.Chip || id === MS_TILE.Swimming_Chip || id === MS_TILE.Pushing_Chip
      ? (["chip", "collects-items", "pushes-blocks"] as const)
      : id === MS_TILE.Block
        ? (["block", "fire-immune"] as const)
        : id === MS_TILE.Glider
          ? (["creature", "water-immune"] as const)
          : id === MS_TILE.Fireball
            ? (["creature", "fire-immune"] as const)
            : (["creature"] as const);

  return {
    id,
    code: `lynx:${name.toLowerCase()}`,
    name: humanizeLynxTileName(name),
    tags,
    capabilities: defaultLynxActorCapabilities(id),
  };
}

const lynxTileDefinitions = (Object.values(MS_TILE).filter((value) => typeof value === "number") as number[]).map((id) =>
  createLynxTileDefinition(id),
);

const lynxActorDefinitions = ACTOR_TILE_IDS.map((id) => createLynxActorDefinition(id));

const lynxTilePolicies = new Map<number, LynxTilePolicyDefinition>(
  lynxTileDefinitions.map((tile) => [tile.id, createLynxTilePolicyDefinition(tile.id)] as const),
);

const lynxActorDefinitionsById = new Map<number, ActorDefinition<number>>(
  lynxActorDefinitions.map((actor) => [actor.id, actor] as const),
);

export const lynxRulesetCatalog = createRulesetCatalog({
  name: "lynx",
  tiles: lynxTileDefinitions,
  actors: lynxActorDefinitions,
});

function lynxTilePolicy(id: number): LynxTilePolicyDefinition {
  return (
    lynxTilePolicies.get(id) ?? {
      tags: [],
      capabilities: [],
      hooks: [],
      chipMovementMask: 0,
      creatureMovementMask: 0,
      blockMovementMask: 0,
      exitMovementMask: FULL_MOVEMENT_MASK,
      requiresReleaseToExit: false,
      creatureFloorAction: "none",
      forcedFloorKind: "none",
      chipEnterAction: "none",
      buttonAction: "none",
    }
  );
}

function lynxActorDefinition(id: number): ActorDefinition<number> | undefined {
  if (lynxActorDefinitionsById.has(id)) {
    return lynxActorDefinitionsById.get(id);
  }
  if (isMsCreature(id)) {
    return lynxActorDefinitionsById.get(msCreatureId(id));
  }
  return undefined;
}

export function lynxTileHasTag(id: number, tag: TileTag): boolean {
  return lynxTilePolicy(id).tags.includes(tag);
}

export function lynxTileHasCapability(id: number, capability: TileCapability): boolean {
  return lynxTilePolicy(id).capabilities.includes(capability);
}

export function lynxInventorySlot(id: number): InventorySlot | null {
  return lynxTilePolicy(id).inventorySlot ?? null;
}

export function lynxPortableItemFamily(id: number): PortableItemFamily | null {
  return lynxTilePolicy(id).portableItemFamily ?? null;
}

export function lynxInventoryIndex(id: number): number | null {
  return lynxTilePolicy(id).inventoryIndex ?? null;
}

export function lynxDoorKeyIndex(id: number): number | null {
  return lynxTilePolicy(id).doorKeyIndex ?? null;
}

export function lynxChipMovementMask(id: number): number {
  return lynxTilePolicy(id).chipMovementMask;
}

export function lynxCreatureMovementMask(id: number): number {
  return lynxTilePolicy(id).creatureMovementMask;
}

export function lynxBlockMovementMask(id: number): number {
  return lynxTilePolicy(id).blockMovementMask;
}

export function lynxExitMovementMask(id: number): number {
  return lynxTilePolicy(id).exitMovementMask;
}

export function lynxRequiresReleaseToExit(id: number): boolean {
  return lynxTilePolicy(id).requiresReleaseToExit;
}

export function lynxCreatureFloorAction(id: number): LynxCreatureFloorAction {
  return lynxTilePolicy(id).creatureFloorAction;
}

export function lynxTileForcedFloorKind(id: number): LynxForcedFloorKind {
  return lynxTilePolicy(id).forcedFloorKind;
}

export function lynxChipEnterAction(id: number): LynxChipEnterAction {
  return lynxTilePolicy(id).chipEnterAction;
}

export function lynxButtonAction(id: number): LynxButtonAction {
  return lynxTilePolicy(id).buttonAction;
}

export function lynxActorHasTag(id: number, tag: ActorTag): boolean {
  return lynxActorDefinition(id)?.tags.includes(tag) ?? false;
}

export function lynxActorCapabilityPolicy(id: number): ActorCapabilityPolicy {
  return lynxActorDefinition(id)?.capabilities ?? LYNX_CREATURE_ACTOR_CAPABILITIES;
}

export function lynxActorControlMode(id: number): ActorControlMode {
  return actorControlMode(lynxActorCapabilityPolicy(id));
}

export function lynxActorLocalInventoryMode(id: number): ActorLocalInventoryMode {
  return actorLocalInventoryMode(lynxActorCapabilityPolicy(id));
}

export function lynxActorItemCollectionKind(id: number): ActorItemCollectionKind {
  return actorItemCollectionKind(lynxActorCapabilityPolicy(id));
}

export function lynxActorGlobalProgressKind(id: number): ActorGlobalProgressKind {
  return actorGlobalProgressKind(lynxActorCapabilityPolicy(id));
}

export function lynxActorMovementStrategyId(id: number): ActorMovementStrategyId {
  return actorMovementStrategyId(lynxActorCapabilityPolicy(id));
}

export function lynxActorBlockedMoveKind(id: number): ActorBlockedMoveKind {
  return actorBlockedMoveKind(lynxActorCapabilityPolicy(id));
}

export function lynxActorTrapHook(id: number): ActorTrapHook {
  return actorTrapHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorClonerHook(id: number): ActorClonerHook {
  return actorClonerHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorThiefHook(id: number): ActorThiefHook {
  return actorThiefHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorAirHook(id: number): ActorAirHook {
  return actorAirHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorCollisionStrategyId(id: number): ActorCollisionStrategyId {
  return actorCollisionStrategyId(lynxActorCapabilityPolicy(id));
}

export function lynxActorEntryMask(tileId: number, actorId: number): number {
  switch (lynxActorMovementStrategyId(actorId)) {
    case "chip-like":
      return lynxChipMovementMask(tileId);
    case "block-like":
      return lynxBlockMovementMask(tileId);
    default:
      return lynxCreatureMovementMask(tileId);
  }
}

export function lynxActorHazardResponse(actorId: number, hazard: ActorHazardName): ActorHazardResponse {
  return actorHazardResponse(lynxActorCapabilityPolicy(actorId), hazard);
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

export function lynxCreatureArrivalAction(tileId: number, actorId: number): LynxCreatureArrivalAction {
  if (tileId === MS_TILE.Beartrap) {
    return "trap";
  }
  if (BUTTON_TILE_SET.has(tileId)) {
    return "button";
  }
  if (tileId === MS_TILE.Key_Blue) {
    return "clear-key-blue";
  }
  if (tileId === MS_TILE.Water) {
    switch (lynxActorHazardResponse(actorId, "water")) {
      case "transform":
        return "block-water";
      case "destroy":
        return "creature-water";
      default:
        return "none";
    }
  }
  if (tileId === MS_TILE.Bomb) {
    switch (lynxActorHazardResponse(actorId, "bomb")) {
      case "transform":
        return "block-bomb";
      case "destroy":
        return "creature-bomb";
      default:
        return "none";
    }
  }
  return "none";
}

export function lynxArrivalAnimationKind(tileId: number, actorId: number): LynxAnimationKind {
  switch (lynxCreatureArrivalAction(tileId, actorId)) {
    case "block-water":
    case "creature-water":
      return "water-splash";
    case "block-bomb":
    case "creature-bomb":
      return "bomb-explosion";
    default:
      return "none";
  }
}

export function lynxChipMoveSoundAction(tileId: number, options: LynxChipMoveSoundOptions): LynxFloorSoundAction {
  if (tileId === MS_TILE.Fire) {
    return options.hasFireBoots ? "fire-walk" : "none";
  }
  if (tileId === MS_TILE.Water) {
    return options.hasWaterBoots ? "water-walk" : "none";
  }
  if (tileId === MS_TILE.Ice) {
    return options.hasIceBoots ? "ice-walk" : "skate-forward";
  }
  if (lynxTileForcedFloorKind(tileId) === "ice") {
    return options.hasIceBoots ? "ice-walk" : "skate-turn";
  }
  if (lynxTileForcedFloorKind(tileId) === "slide") {
    return options.hasSlideBoots ? "slide-walk" : "slide";
  }
  return "none";
}

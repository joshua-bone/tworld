import type {
  ActorAirHook,
  ActorBlockedMoveKind,
  ActorCapabilityPolicy,
  ActorClonerHook,
  ActorCollisionHook,
  ActorControlMode,
  ActorGlobalProgressKind,
  ActorHazardName,
  ActorHazardResponse,
  ActorItemCollectionKind,
  ActorLocalInventoryMode,
  ActorThiefHook,
  ActorTrapHook,
  ActorTraversalKind,
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
type MsForcedFloorKind = "none" | "slide" | "ice" | "teleport" | "air" | "elevator";
type MsChipEnterAction =
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
type MsButtonAction = "none" | "turn-tanks" | "toggle-walls" | "activate-cloner" | "spring-trap";
type MsActorArrivalAction =
  | "none"
  | "block-water"
  | "block-bomb"
  | "creature-water"
  | "creature-fire"
  | "creature-bomb";

interface MsTilePolicyDefinition {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
  readonly chipMovementMask: number;
  readonly creatureMovementMask: number;
  readonly blockMovementMask: number;
  readonly exitMovementMask: number;
  readonly requiresReleaseToExit: boolean;
  readonly inventorySlot?: InventorySlot;
  readonly inventoryIndex?: number;
  readonly doorKeyIndex?: number;
  readonly forcedFloorKind: MsForcedFloorKind;
  readonly chipEnterAction: MsChipEnterAction;
  readonly buttonAction: MsButtonAction;
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
const ACTOR_TILE_SET = new Set<number>(ACTOR_TILE_IDS);

const CHIPPABLE_TILE_IDS = new Set<number>([
  MS_TILE.Empty,
  MS_TILE.Air,
  MS_TILE.Elevator,
  ...SLIDE_TILE_IDS,
  MS_TILE.Ice,
  MS_TILE.Gravel,
  MS_TILE.Dirt,
  MS_TILE.Water,
  MS_TILE.Fire,
  MS_TILE.Bomb,
  MS_TILE.Beartrap,
  MS_TILE.Burglar,
  MS_TILE.HintButton,
  ...BUTTON_TILE_IDS,
  MS_TILE.Teleport,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.BlueWall_Real,
  MS_TILE.BlueWall_Fake,
  MS_TILE.SwitchWall_Open,
  MS_TILE.PopupWall,
  ...DOOR_TILE_IDS,
  MS_TILE.Socket,
  MS_TILE.Exit,
  MS_TILE.ICChip,
  ...KEY_TILE_IDS,
  ...BOOT_TILE_IDS,
  ...TOOL_TILE_IDS,
  MS_TILE.Block_Static,
]);

const CREATURE_BLOCKED_TILE_IDS = new Set<number>([
  MS_TILE.Slide_Random,
  MS_TILE.Gravel,
  MS_TILE.Dirt,
  MS_TILE.Burglar,
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
  ...BOOT_TILE_IDS,
  ...TOOL_TILE_IDS,
  MS_TILE.Block_Static,
]);

const BLOCK_BLOCKED_TILE_IDS = new Set<number>([
  MS_TILE.Dirt,
  MS_TILE.Burglar,
  MS_TILE.HiddenWall_Temp,
  MS_TILE.BlueWall_Real,
  MS_TILE.BlueWall_Fake,
  MS_TILE.SwitchWall_Closed,
  MS_TILE.PopupWall,
  MS_TILE.CloneMachine,
  ...DOOR_TILE_IDS,
  MS_TILE.Socket,
  MS_TILE.ICChip,
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

function defaultMsTileTags(id: number): TileTag[] {
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
    tags.push("key", "collectible");
  }
  if (BOOT_TILE_SET.has(id)) {
    tags.push("boots", "collectible");
  }
  if (TOOL_TILE_SET.has(id)) {
    tags.push("collectible");
  }
  if (BUTTON_TILE_SET.has(id)) {
    tags.push("button");
  }
  if (SLIDE_TILE_SET.has(id)) {
    tags.push("slide");
  }
  if (ICE_TILE_SET.has(id)) {
    tags.push("ice");
  }
  if (DEADLY_TILE_SET.has(id)) {
    tags.push("deadly");
  }
  switch (id) {
    case MS_TILE.Teleport:
      tags.push("teleport");
      break;
    case MS_TILE.Beartrap:
      tags.push("trap");
      break;
    case MS_TILE.CloneMachine:
      tags.push("cloner", "blocking");
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
    id === MS_TILE.PopupWall
  ) {
    tags.push("blocking");
  }
  return [...new Set(tags)];
}

function defaultMsTileCapabilities(id: number): TileCapability[] {
  const capabilities: TileCapability[] = [];
  if (KEY_TILE_SET.has(id) || BOOT_TILE_SET.has(id) || TOOL_TILE_SET.has(id) || id === MS_TILE.ICChip) {
    capabilities.push("collect-on-entry");
  }
  if (BUTTON_TILE_SET.has(id) || id === MS_TILE.Burglar || id === MS_TILE.Socket || id === MS_TILE.Exit) {
    capabilities.push("trigger-on-entry");
  }
  if (id === MS_TILE.Teleport || id === MS_TILE.Air) {
    capabilities.push("trigger-on-entry", "forces-movement");
  }
  if (SLIDE_TILE_SET.has(id) || ICE_TILE_SET.has(id)) {
    capabilities.push("forces-movement");
  }
  if (DEADLY_TILE_SET.has(id)) {
    capabilities.push("kills-on-entry");
  }
  if (id === MS_TILE.Block_Static) {
    capabilities.push("accepts-blocks");
  }
  if (id === MS_TILE.Button_Blue || id === MS_TILE.Button_Green || id === MS_TILE.Button_Red || id === MS_TILE.Button_Brown) {
    capabilities.push("trigger-on-leave");
  }
  return [...new Set(capabilities)];
}

function defaultMsTileHooks(id: number): TileHookName[] {
  const hooks: TileHookName[] = [];
  if (
    BUTTON_TILE_SET.has(id) ||
    id === MS_TILE.Burglar ||
    id === MS_TILE.Socket ||
    id === MS_TILE.Exit ||
    id === MS_TILE.Teleport ||
    id === MS_TILE.Bomb
  ) {
    hooks.push("after-enter");
  }
  if (id === MS_TILE.Button_Blue || id === MS_TILE.Button_Green || id === MS_TILE.Button_Red || id === MS_TILE.Button_Brown) {
    hooks.push("after-leave");
  }
  return [...new Set(hooks)];
}

function defaultForcedFloorKind(id: number): MsForcedFloorKind {
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

function defaultChipEnterAction(id: number): MsChipEnterAction {
  switch (id) {
    case MS_TILE.Empty:
    case MS_TILE.BlueWall_Fake:
    case MS_TILE.Dirt:
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
    case MS_TILE.Teleport:
      return "teleport";
    default:
      return ACTOR_TILE_SET.has(id) || isMsCreature(id) || id === MS_TILE.Block_Static ? "collision" : "none";
  }
}

function defaultButtonAction(id: number): MsButtonAction {
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

function defaultChipMovementMask(id: number): number {
  if (MOVEMENT_MASK_BY_TILE.has(id)) {
    return MOVEMENT_MASK_BY_TILE.get(id) ?? 0;
  }
  return CHIPPABLE_TILE_IDS.has(id) ? FULL_MOVEMENT_MASK : 0;
}

function defaultCreatureMovementMask(id: number): number {
  if (CREATURE_BLOCKED_TILE_IDS.has(id)) {
    return 0;
  }
  return defaultChipMovementMask(id);
}

function defaultBlockMovementMask(id: number): number {
  if (BLOCK_BLOCKED_TILE_IDS.has(id)) {
    return 0;
  }
  return defaultChipMovementMask(id);
}

function defaultMsExitMovementMask(id: number): number {
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
      return MS_DIRECTION.north | MS_DIRECTION.west;
    default:
      return FULL_MOVEMENT_MASK;
  }
}

function defaultMsRequiresReleaseToExit(id: number): boolean {
  return id === MS_TILE.Beartrap;
}

function inventoryPolicy(id: number): Pick<MsTilePolicyDefinition, "inventorySlot" | "inventoryIndex" | "doorKeyIndex"> {
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

function createMsTilePolicyDefinition(id: number): MsTilePolicyDefinition {
  return {
    tags: defaultMsTileTags(id),
    capabilities: defaultMsTileCapabilities(id),
    hooks: defaultMsTileHooks(id),
    chipMovementMask: defaultChipMovementMask(id),
    creatureMovementMask: defaultCreatureMovementMask(id),
    blockMovementMask: defaultBlockMovementMask(id),
    exitMovementMask: defaultMsExitMovementMask(id),
    requiresReleaseToExit: defaultMsRequiresReleaseToExit(id),
    forcedFloorKind: defaultForcedFloorKind(id),
    chipEnterAction: defaultChipEnterAction(id),
    buttonAction: defaultButtonAction(id),
    ...inventoryPolicy(id),
  };
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
  };
}

const MS_CHIP_ACTOR_CAPABILITIES = {
  controlMode: "player-input",
  localInventoryMode: "keys-boots-tools",
  itemCollectionKind: "keys-boots-tools",
  globalProgressKind: "collect-chips",
  traversalKind: "chip",
  blockedMoveKind: "stay",
  trapHook: "default",
  clonerHook: "default",
  thiefHook: "steal-boots-tools",
  airHook: "chip-support",
  collisionHook: "default",
  hazards: {
    water: "destroy",
    fire: "destroy",
    bomb: "destroy",
  },
} as const satisfies ActorCapabilityPolicy;

const MS_BLOCK_ACTOR_CAPABILITIES = {
  controlMode: "passive",
  localInventoryMode: "none",
  itemCollectionKind: "none",
  globalProgressKind: "none",
  traversalKind: "block",
  blockedMoveKind: "stay",
  trapHook: "default",
  clonerHook: "default",
  thiefHook: "none",
  airHook: "non-chip-support",
  collisionHook: "default",
  hazards: {
    water: "transform",
    fire: "ignore",
    bomb: "transform",
  },
} as const satisfies ActorCapabilityPolicy;

const MS_CREATURE_ACTOR_CAPABILITIES = {
  controlMode: "ai",
  localInventoryMode: "none",
  itemCollectionKind: "none",
  globalProgressKind: "none",
  traversalKind: "creature",
  blockedMoveKind: "stay",
  trapHook: "default",
  clonerHook: "default",
  thiefHook: "none",
  airHook: "non-chip-support",
  collisionHook: "default",
  hazards: {
    water: "destroy",
    fire: "destroy",
    bomb: "destroy",
  },
} as const satisfies ActorCapabilityPolicy;

const MS_WATER_IMMUNE_CREATURE_CAPABILITIES = {
  ...MS_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    ...MS_CREATURE_ACTOR_CAPABILITIES.hazards,
    water: "ignore",
  },
} as const satisfies ActorCapabilityPolicy;

const MS_FIRE_IMMUNE_CREATURE_CAPABILITIES = {
  ...MS_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    ...MS_CREATURE_ACTOR_CAPABILITIES.hazards,
    fire: "ignore",
  },
} as const satisfies ActorCapabilityPolicy;

const MS_FIRE_DENY_CREATURE_CAPABILITIES = {
  ...MS_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    ...MS_CREATURE_ACTOR_CAPABILITIES.hazards,
    fire: "deny",
  },
} as const satisfies ActorCapabilityPolicy;

function defaultMsActorCapabilities(id: number): ActorCapabilityPolicy {
  switch (id) {
    case MS_TILE.Chip:
    case MS_TILE.Swimming_Chip:
    case MS_TILE.Pushing_Chip:
      return MS_CHIP_ACTOR_CAPABILITIES;
    case MS_TILE.Block:
      return MS_BLOCK_ACTOR_CAPABILITIES;
    case MS_TILE.Glider:
      return MS_WATER_IMMUNE_CREATURE_CAPABILITIES;
    case MS_TILE.Fireball:
      return MS_FIRE_IMMUNE_CREATURE_CAPABILITIES;
    case MS_TILE.Bug:
    case MS_TILE.Walker:
      return MS_FIRE_DENY_CREATURE_CAPABILITIES;
    default:
      return MS_CREATURE_ACTOR_CAPABILITIES;
  }
}

function createMsActorDefinition(id: number): ActorDefinition<number> {
  const name = msTileConstName(id);
  const tags =
    id === MS_TILE.Chip || id === MS_TILE.Swimming_Chip || id === MS_TILE.Pushing_Chip
      ? (["chip", "collects-items"] as const)
      : id === MS_TILE.Block
        ? (["block"] as const)
        : id === MS_TILE.Glider
          ? (["creature", "water-immune"] as const)
          : id === MS_TILE.Fireball
            ? (["creature", "fire-immune"] as const)
            : (["creature"] as const);

  return {
    id,
    code: `ms:${name.toLowerCase()}`,
    name: humanizeMsTileName(name),
    tags,
    capabilities: defaultMsActorCapabilities(id),
  };
}

const msTileDefinitions = (Object.values(MS_TILE).filter((value) => typeof value === "number") as number[])
  .map((id) => createMsTileDefinition(id));

const msActorDefinitions = ACTOR_TILE_IDS.map((id) => createMsActorDefinition(id));

const msTilePolicies = new Map<number, MsTilePolicyDefinition>(
  msTileDefinitions.map((tile) => [tile.id, createMsTilePolicyDefinition(tile.id)] as const),
);
const msActorDefinitionsById = new Map<number, ActorDefinition<number>>(
  msActorDefinitions.map((actor) => [actor.id, actor] as const),
);

export const msRulesetCatalog = createRulesetCatalog({
  name: "ms",
  tiles: msTileDefinitions,
  actors: msActorDefinitions,
});

function msActorDefinition(id: number): ActorDefinition<number> | undefined {
  if (msActorDefinitionsById.has(id)) {
    return msActorDefinitionsById.get(id);
  }
  if (isMsCreature(id)) {
    return msActorDefinitionsById.get(msCreatureId(id));
  }
  return undefined;
}

function msTilePolicy(id: number): MsTilePolicyDefinition {
  if (msTilePolicies.has(id)) {
    return msTilePolicies.get(id)!;
  }
  if (id === MS_TILE.Block_Static) {
    return msTilePolicies.get(MS_TILE.Block)!;
  }
  if (isMsCreature(id)) {
    return msTilePolicies.get(msCreatureId(id))!;
  }
  return {
    tags: [],
    capabilities: [],
    hooks: [],
    chipMovementMask: 0,
    creatureMovementMask: 0,
    blockMovementMask: 0,
    exitMovementMask: FULL_MOVEMENT_MASK,
    requiresReleaseToExit: false,
    forcedFloorKind: "none",
    chipEnterAction: "none",
    buttonAction: "none",
  };
}

export function msTileHasTag(id: number, tag: TileTag): boolean {
  return msTilePolicy(id).tags.includes(tag);
}

export function msTileHasCapability(id: number, capability: TileCapability): boolean {
  return msTilePolicy(id).capabilities.includes(capability);
}

export function msChipMovementMask(id: number): number {
  return msTilePolicy(id).chipMovementMask;
}

export function msCreatureMovementMask(id: number): number {
  return msTilePolicy(id).creatureMovementMask;
}

export function msBlockMovementMask(id: number): number {
  return msTilePolicy(id).blockMovementMask;
}

export function msExitMovementMask(id: number): number {
  return msTilePolicy(id).exitMovementMask;
}

export function msRequiresReleaseToExit(id: number): boolean {
  return msTilePolicy(id).requiresReleaseToExit;
}

export function msInventorySlot(id: number): InventorySlot | null {
  return msTilePolicy(id).inventorySlot ?? null;
}

export function msInventoryIndex(id: number): number | null {
  return msTilePolicy(id).inventoryIndex ?? null;
}

export function msDoorKeyIndex(id: number): number | null {
  return msTilePolicy(id).doorKeyIndex ?? null;
}

export function msTileForcedFloorKind(id: number): MsForcedFloorKind {
  return msTilePolicy(id).forcedFloorKind;
}

export function msChipEnterAction(id: number): MsChipEnterAction {
  return msTilePolicy(id).chipEnterAction;
}

export function msButtonAction(id: number): MsButtonAction {
  return msTilePolicy(id).buttonAction;
}

export function msActorHasTag(id: number, tag: ActorTag): boolean {
  return msActorDefinition(id)?.tags.includes(tag) ?? false;
}

export function msActorCapabilityPolicy(id: number): ActorCapabilityPolicy {
  return msActorDefinition(id)?.capabilities ?? MS_CREATURE_ACTOR_CAPABILITIES;
}

export function msActorControlMode(id: number): ActorControlMode {
  return msActorCapabilityPolicy(id).controlMode;
}

export function msActorLocalInventoryMode(id: number): ActorLocalInventoryMode {
  return msActorCapabilityPolicy(id).localInventoryMode;
}

export function msActorItemCollectionKind(id: number): ActorItemCollectionKind {
  return msActorCapabilityPolicy(id).itemCollectionKind;
}

export function msActorGlobalProgressKind(id: number): ActorGlobalProgressKind {
  return msActorCapabilityPolicy(id).globalProgressKind;
}

export function msActorTraversalKind(id: number): ActorTraversalKind {
  return msActorCapabilityPolicy(id).traversalKind;
}

export function msActorBlockedMoveKind(id: number): ActorBlockedMoveKind {
  return msActorCapabilityPolicy(id).blockedMoveKind;
}

export function msActorTrapHook(id: number): ActorTrapHook {
  return msActorCapabilityPolicy(id).trapHook;
}

export function msActorClonerHook(id: number): ActorClonerHook {
  return msActorCapabilityPolicy(id).clonerHook;
}

export function msActorThiefHook(id: number): ActorThiefHook {
  return msActorCapabilityPolicy(id).thiefHook;
}

export function msActorAirHook(id: number): ActorAirHook {
  return msActorCapabilityPolicy(id).airHook;
}

export function msActorCollisionHook(id: number): ActorCollisionHook {
  return msActorCapabilityPolicy(id).collisionHook;
}

export function msActorEntryMask(tileId: number, actorId: number): number {
  switch (msActorTraversalKind(actorId)) {
    case "chip":
      return msChipMovementMask(tileId);
    case "block":
      return msBlockMovementMask(tileId);
    default:
      return msCreatureMovementMask(tileId);
  }
}

export function msActorHazardResponse(actorId: number, hazard: ActorHazardName): ActorHazardResponse {
  return msActorCapabilityPolicy(actorId).hazards[hazard];
}

export function msActorArrivalAction(tileId: number, actorId: number): MsActorArrivalAction {
  if (tileId === MS_TILE.Water) {
    switch (msActorHazardResponse(actorId, "water")) {
      case "transform":
        return "block-water";
      case "destroy":
        return "creature-water";
      default:
        return "none";
    }
  }
  if (tileId === MS_TILE.Fire) {
    return msActorHazardResponse(actorId, "fire") === "destroy" ? "creature-fire" : "none";
  }
  if (tileId === MS_TILE.Bomb) {
    switch (msActorHazardResponse(actorId, "bomb")) {
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

export function msIsActorTile(id: number): boolean {
  return msActorDefinition(id) !== undefined;
}

export function msIsOverlayFloorTile(id: number): boolean {
  return msTileHasTag(id, "collectible") || msIsActorTile(id);
}

export function msPreservesUnderlyingFloor(id: number): boolean {
  return !msIsOverlayFloorTile(id);
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

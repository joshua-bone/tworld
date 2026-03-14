import {
  createRulesetCatalog,
  type ActorDefinition,
  type TileCapability,
  type TileDefinition,
  type TileHookName,
  type TileTag,
} from "@domain/game/core/ruleset";
import { MS_DIRECTION, MS_TILE } from "@domain/game/rules/ms/tiles";

type InventorySlot = "keys" | "boots";

interface MsTilePolicyDefinition {
  readonly tags: readonly TileTag[];
  readonly capabilities: readonly TileCapability[];
  readonly hooks: readonly TileHookName[];
  readonly chipMovementMask: number;
  readonly creatureMovementMask: number;
  readonly blockMovementMask: number;
  readonly inventorySlot?: InventorySlot;
  readonly inventoryIndex?: number;
  readonly doorKeyIndex?: number;
}

const FULL_MOVEMENT_MASK =
  MS_DIRECTION.north | MS_DIRECTION.west | MS_DIRECTION.south | MS_DIRECTION.east;

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
const DOOR_TILE_SET = new Set<number>(DOOR_TILE_IDS);
const BUTTON_TILE_SET = new Set<number>(BUTTON_TILE_IDS);
const SLIDE_TILE_SET = new Set<number>(SLIDE_TILE_IDS);
const ICE_TILE_SET = new Set<number>(ICE_TILE_IDS);
const DEADLY_TILE_SET = new Set<number>(DEADLY_TILE_IDS);

const CHIPPABLE_TILE_IDS = new Set<number>([
  MS_TILE.Empty,
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
  if (DOOR_TILE_SET.has(id)) {
    tags.push("door");
  }
  if (KEY_TILE_SET.has(id)) {
    tags.push("key", "collectible");
  }
  if (BOOT_TILE_SET.has(id)) {
    tags.push("boots", "collectible");
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
  if (KEY_TILE_SET.has(id) || BOOT_TILE_SET.has(id) || id === MS_TILE.ICChip) {
    capabilities.push("collect-on-entry");
  }
  if (BUTTON_TILE_SET.has(id) || id === MS_TILE.Burglar || id === MS_TILE.Socket || id === MS_TILE.Exit) {
    capabilities.push("trigger-on-entry");
  }
  if (id === MS_TILE.Teleport) {
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
  };
}

const msTileDefinitions = (Object.values(MS_TILE).filter((value) => typeof value === "number") as number[])
  .map((id) => createMsTileDefinition(id));

const msActorDefinitions = ACTOR_TILE_IDS.map((id) => createMsActorDefinition(id));

const msTilePolicies = new Map<number, MsTilePolicyDefinition>(
  msTileDefinitions.map((tile) => [tile.id, createMsTilePolicyDefinition(tile.id)] as const),
);

export const msRulesetCatalog = createRulesetCatalog({
  name: "ms",
  tiles: msTileDefinitions,
  actors: msActorDefinitions,
});

function msTilePolicy(id: number): MsTilePolicyDefinition {
  return (
    msTilePolicies.get(id) ?? {
      tags: [],
      capabilities: [],
      hooks: [],
      chipMovementMask: 0,
      creatureMovementMask: 0,
      blockMovementMask: 0,
    }
  );
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

export function msInventorySlot(id: number): InventorySlot | null {
  return msTilePolicy(id).inventorySlot ?? null;
}

export function msInventoryIndex(id: number): number | null {
  return msTilePolicy(id).inventoryIndex ?? null;
}

export function msDoorKeyIndex(id: number): number | null {
  return msTilePolicy(id).doorKeyIndex ?? null;
}

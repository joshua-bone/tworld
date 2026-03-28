import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

export const LYNX_CHIP_ACTOR_CAPABILITIES = {
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

export const LYNX_BLOCK_ACTOR_CAPABILITIES = {
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

export const LYNX_CREATURE_ACTOR_CAPABILITIES = {
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

export const lynxActorDefinitions = ACTOR_TILE_IDS.map((id) => createLynxActorDefinition(id));

const lynxActorDefinitionsById = new Map<number, ActorDefinition<number>>(
  lynxActorDefinitions.map((actor) => [actor.id, actor] as const),
);

export function lookupLynxActorDefinition(id: number): ActorDefinition<number> | undefined {
  if (lynxActorDefinitionsById.has(id)) {
    return lynxActorDefinitionsById.get(id);
  }
  if (isMsCreature(id)) {
    return lynxActorDefinitionsById.get(msCreatureId(id));
  }
  return undefined;
}

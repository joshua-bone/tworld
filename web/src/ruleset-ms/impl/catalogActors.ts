import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import type { ActorDefinition } from "@game-core/api/ruleset";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";

export const MS_CHIP_ACTOR_CAPABILITIES = {
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

export const MS_BLOCK_ACTOR_CAPABILITIES = {
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

export const MS_CREATURE_ACTOR_CAPABILITIES = {
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
      fire: "destroy",
      bomb: "destroy",
    },
  },
} as const satisfies ActorCapabilityPolicy;

export const MS_BOWLING_BALL_ACTOR_CAPABILITIES = {
  control: {
    mode: "ballistic",
  },
  inventory: {
    localInventoryMode: "keys-boots",
    itemCollectionKind: "keys-boots",
    globalProgressKind: "collect-chips",
  },
  movement: {
    strategyId: "ballistic-like",
    blockedMoveKind: "revert-portable",
    trapHook: "hold-direction",
    clonerHook: "hold-direction",
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

const MS_WATER_IMMUNE_CREATURE_CAPABILITIES = {
  ...MS_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    responses: {
      ...MS_CREATURE_ACTOR_CAPABILITIES.hazards.responses,
      water: "ignore",
    },
  },
} as const satisfies ActorCapabilityPolicy;

const MS_FIRE_IMMUNE_CREATURE_CAPABILITIES = {
  ...MS_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    responses: {
      ...MS_CREATURE_ACTOR_CAPABILITIES.hazards.responses,
      fire: "ignore",
    },
  },
} as const satisfies ActorCapabilityPolicy;

const MS_FIRE_DENY_CREATURE_CAPABILITIES = {
  ...MS_CREATURE_ACTOR_CAPABILITIES,
  hazards: {
    responses: {
      ...MS_CREATURE_ACTOR_CAPABILITIES.hazards.responses,
      fire: "deny",
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
  MS_TILE.BowlingBall,
] as const;

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

function defaultMsActorCapabilities(id: number): ActorCapabilityPolicy {
  switch (id) {
    case MS_TILE.Chip:
    case MS_TILE.Swimming_Chip:
    case MS_TILE.Pushing_Chip:
      return MS_CHIP_ACTOR_CAPABILITIES;
    case MS_TILE.Block:
      return MS_BLOCK_ACTOR_CAPABILITIES;
    case MS_TILE.BowlingBall:
      return MS_BOWLING_BALL_ACTOR_CAPABILITIES;
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
        : id === MS_TILE.BowlingBall
          ? (["creature", "collects-items"] as const)
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

export const msActorDefinitions = ACTOR_TILE_IDS.map((id) => createMsActorDefinition(id));

const msActorDefinitionsById = new Map<number, ActorDefinition<number>>(
  msActorDefinitions.map((actor) => [actor.id, actor] as const),
);

export function lookupMsActorDefinition(id: number): ActorDefinition<number> | undefined {
  if (msActorDefinitionsById.has(id)) {
    return msActorDefinitionsById.get(id);
  }
  if (isMsCreature(id)) {
    return msActorDefinitionsById.get(msCreatureId(id));
  }
  return undefined;
}

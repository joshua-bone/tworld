import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import { composeActorBehaviors, type ActorDefinition, type ActorTag } from "@game-core/api/ruleset";
import { composeRulesetActorPolicy } from "@game-core/impl/actorFamilies";
import { createActorInteractionBehavior } from "@game-core/impl/actorInteractionBehavior";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";
import { createMsBallisticActorFamily } from "@ruleset-ms/impl/elements/actors/families/ballistic";
import { createMsBlockActorFamily } from "@ruleset-ms/impl/elements/actors/families/block";
import { createMsMobActorFamily } from "@ruleset-ms/impl/elements/actors/families/mob";
import { createMsMonsterActorFamily } from "@ruleset-ms/impl/elements/actors/families/monster";
import { createMsPlayerLikeActorFamily } from "@ruleset-ms/impl/elements/actors/families/playerLike";
import { createMsPortableBackedActorFamily } from "@ruleset-ms/impl/elements/actors/families/portableBacked";
import { createMsSpecialFloorActorBehavior } from "@ruleset-ms/impl/elements/actors/families/specialFloors";

const CHIP_ACTOR_IDS = [MS_TILE.Chip, MS_TILE.Swimming_Chip, MS_TILE.Pushing_Chip] as const;
const MONSTER_ACTOR_IDS = [
  MS_TILE.Tank,
  MS_TILE.Ball,
  MS_TILE.Glider,
  MS_TILE.Fireball,
  MS_TILE.Walker,
  MS_TILE.Blob,
  MS_TILE.Teeth,
  MS_TILE.Bug,
  MS_TILE.Paramecium,
] as const;
const ACTIVE_MOB_ACTOR_IDS = [...CHIP_ACTOR_IDS, ...MONSTER_ACTOR_IDS, MS_TILE.BowlingBall] as const;

const BLOCK_ACTOR_IDS = [MS_TILE.Block, MS_TILE.IceBlock] as const;

const ACTOR_TILE_IDS = [...CHIP_ACTOR_IDS, ...BLOCK_ACTOR_IDS, ...MONSTER_ACTOR_IDS, MS_TILE.BowlingBall] as const;

const MS_ACTOR_BASE_POLICY = {
  tags: [],
  capabilities: {
    control: {
      mode: "passive",
    },
    inventory: {
      localInventoryMode: "none",
      itemCollectionKind: "none",
      globalProgressKind: "none",
    },
    movement: {
      strategyId: "creature-like",
      blockedMoveKind: "stay",
      trapHook: "none",
      clonerHook: "none",
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
  },
} as const satisfies {
  tags: readonly ActorTag[];
  capabilities: ActorCapabilityPolicy;
};

const MS_ACTOR_FAMILIES = [
  createMsMobActorFamily({
    name: "active-mob",
    actorIds: ACTIVE_MOB_ACTOR_IDS,
  }),
  createMsPlayerLikeActorFamily({
    name: "chip",
    actorIds: CHIP_ACTOR_IDS,
  }),
  createMsBlockActorFamily({
    name: "block",
    actorIds: BLOCK_ACTOR_IDS,
  }),
  createMsMonsterActorFamily({
    name: "monster",
    actorIds: MONSTER_ACTOR_IDS,
  }),
  createMsMonsterActorFamily({
    name: "glider",
    actorIds: [MS_TILE.Glider],
    hazardResponses: {
      water: "ignore",
    },
  }),
  createMsMonsterActorFamily({
    name: "fireball",
    actorIds: [MS_TILE.Fireball],
    hazardResponses: {
      fire: "ignore",
    },
  }),
  createMsMonsterActorFamily({
    name: "fire-deny",
    actorIds: [MS_TILE.Bug, MS_TILE.Walker],
    hazardResponses: {
      fire: "deny",
    },
  }),
  createMsBallisticActorFamily({
    name: "ballistic",
    actorIds: [MS_TILE.BowlingBall],
  }),
  createMsPortableBackedActorFamily({
    name: "portable-backed",
    actorIds: [MS_TILE.BowlingBall],
    localInventoryMode: "keys-boots",
    itemCollectionKind: "keys-boots",
    globalProgressKind: "collect-chips",
  }),
] as const;

function msActorPolicy(id: number) {
  return composeRulesetActorPolicy(MS_ACTOR_BASE_POLICY, id, MS_ACTOR_FAMILIES);
}

export const MS_CHIP_ACTOR_CAPABILITIES = msActorPolicy(MS_TILE.Chip).capabilities;
export const MS_BLOCK_ACTOR_CAPABILITIES = msActorPolicy(MS_TILE.Block).capabilities;
export const MS_CREATURE_ACTOR_CAPABILITIES = msActorPolicy(MS_TILE.Tank).capabilities;
export const MS_BOWLING_BALL_ACTOR_CAPABILITIES = msActorPolicy(MS_TILE.BowlingBall).capabilities;

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

function createMsActorDefinition(id: number): ActorDefinition<number> {
  const name = msTileConstName(id);
  const policy = msActorPolicy(id);

  return {
    id,
    code: `ms:${name.toLowerCase()}`,
    name: humanizeMsTileName(name),
    tags: policy.tags,
    capabilities: policy.capabilities,
    behavior: composeActorBehaviors(
      createActorInteractionBehavior(policy.capabilities),
      createMsSpecialFloorActorBehavior(policy.capabilities),
    ),
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

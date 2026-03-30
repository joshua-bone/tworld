import type { ActorCapabilityPolicy } from "@game-core/api/actorCapabilities";
import { composeActorBehaviors, type ActorDefinition, type ActorTag } from "@game-core/api/ruleset";
import { composeRulesetActorPolicy } from "@game-core/impl/actorFamilies";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";
import { createLynxBallisticActorFamily } from "@ruleset-lynx/impl/elements/actors/families/ballistic";
import { createLynxBlockActorFamily } from "@ruleset-lynx/impl/elements/actors/families/block";
import { createLynxMobActorFamily } from "@ruleset-lynx/impl/elements/actors/families/mob";
import { createLynxMonsterActorFamily } from "@ruleset-lynx/impl/elements/actors/families/monster";
import { createLynxPlayerLikeActorFamily } from "@ruleset-lynx/impl/elements/actors/families/playerLike";
import { createLynxPortableBackedActorFamily } from "@ruleset-lynx/impl/elements/actors/families/portableBacked";
import { createLynxSpecialFloorActorBehavior } from "@ruleset-lynx/impl/elements/actors/families/specialFloors";

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

const ACTOR_TILE_IDS = [
  ...CHIP_ACTOR_IDS,
  MS_TILE.Block,
  ...MONSTER_ACTOR_IDS,
  MS_TILE.BowlingBall,
] as const;

const LYNX_ACTOR_BASE_POLICY = {
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

const LYNX_ACTOR_FAMILIES = [
  createLynxMobActorFamily({
    name: "active-mob",
    actorIds: ACTIVE_MOB_ACTOR_IDS,
  }),
  createLynxPlayerLikeActorFamily({
    name: "chip",
    actorIds: CHIP_ACTOR_IDS,
  }),
  createLynxBlockActorFamily({
    name: "block",
    actorIds: [MS_TILE.Block],
  }),
  createLynxMonsterActorFamily({
    name: "monster",
    actorIds: MONSTER_ACTOR_IDS,
  }),
  createLynxMonsterActorFamily({
    name: "glider",
    actorIds: [MS_TILE.Glider],
    hazardResponses: {
      water: "ignore",
    },
  }),
  createLynxMonsterActorFamily({
    name: "fireball",
    actorIds: [MS_TILE.Fireball],
    hazardResponses: {
      fire: "ignore",
    },
  }),
  createLynxBallisticActorFamily({
    name: "ballistic",
    actorIds: [MS_TILE.BowlingBall],
  }),
  createLynxPortableBackedActorFamily({
    name: "portable-backed",
    actorIds: [MS_TILE.BowlingBall],
    localInventoryMode: "keys-boots",
    itemCollectionKind: "keys-boots",
    globalProgressKind: "collect-chips",
  }),
] as const;

function lynxActorPolicy(id: number) {
  return composeRulesetActorPolicy(LYNX_ACTOR_BASE_POLICY, id, LYNX_ACTOR_FAMILIES);
}

export const LYNX_CHIP_ACTOR_CAPABILITIES = lynxActorPolicy(MS_TILE.Chip).capabilities;
export const LYNX_BLOCK_ACTOR_CAPABILITIES = lynxActorPolicy(MS_TILE.Block).capabilities;
export const LYNX_CREATURE_ACTOR_CAPABILITIES = lynxActorPolicy(MS_TILE.Tank).capabilities;
export const LYNX_BOWLING_BALL_ACTOR_CAPABILITIES = lynxActorPolicy(MS_TILE.BowlingBall).capabilities;

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

function createLynxActorDefinition(id: number): ActorDefinition<number> {
  const name = lynxTileConstName(id);
  const policy = lynxActorPolicy(id);

  return {
    id,
    code: `lynx:${name.toLowerCase()}`,
    name: humanizeLynxTileName(name),
    tags: policy.tags,
    capabilities: policy.capabilities,
    behavior: composeActorBehaviors(
      createLynxSpecialFloorActorBehavior(policy.capabilities),
    ),
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

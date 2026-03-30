import type {
  ActorAirHook,
  ActorBlockedMoveKind,
  ActorClonerHook,
  ActorCollisionStrategyId,
  ActorGlobalProgressKind,
  ActorHazardName,
  ActorHazardResponse,
  ActorItemCollectionKind,
  ActorLocalInventoryMode,
  ActorThiefHook,
  ActorTrapHook,
} from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";
import { createRulesetActorFamily, type RulesetActorFamilyDefinition } from "@game-core/impl/actorFamilies";

type HazardResponseMap = Partial<Record<ActorHazardName, ActorHazardResponse>>;

export interface MobActorFamilyBuilderOptions<TActorId extends number = number> {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly tags?: readonly ActorTag[];
  readonly blockedMoveKind?: ActorBlockedMoveKind;
  readonly trapHook?: ActorTrapHook;
  readonly clonerHook?: ActorClonerHook;
  readonly airHook?: ActorAirHook;
  readonly thiefHook?: ActorThiefHook;
  readonly collisionStrategyId?: ActorCollisionStrategyId;
  readonly hazardResponses?: HazardResponseMap;
}

export interface MonsterActorFamilyBuilderOptions<TActorId extends number = number> {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: HazardResponseMap;
  readonly defaultHazardResponses?: HazardResponseMap;
}

export interface BlockActorFamilyBuilderOptions<TActorId extends number = number> {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: HazardResponseMap;
  readonly baseTags?: readonly ActorTag[];
}

export interface BallisticActorFamilyBuilderOptions<TActorId extends number = number> {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly tags?: readonly ActorTag[];
  readonly hazardResponses?: HazardResponseMap;
}

export interface PlayerLikeActorFamilyBuilderOptions<TActorId extends number = number> {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly localInventoryMode?: ActorLocalInventoryMode;
  readonly itemCollectionKind?: ActorItemCollectionKind;
  readonly globalProgressKind?: ActorGlobalProgressKind;
  readonly tags?: readonly ActorTag[];
  readonly baseTags?: readonly ActorTag[];
}

export interface PortableBackedActorFamilyBuilderOptions<TActorId extends number = number> {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly localInventoryMode: ActorLocalInventoryMode;
  readonly itemCollectionKind: ActorItemCollectionKind;
  readonly globalProgressKind: ActorGlobalProgressKind;
  readonly thiefHook?: ActorThiefHook;
  readonly tags?: readonly ActorTag[];
  readonly baseTags?: readonly ActorTag[];
}

export function createMobActorFamilyDefinition<TActorId extends number = number>(
  options: MobActorFamilyBuilderOptions<TActorId>,
): RulesetActorFamilyDefinition<TActorId> {
  const movement = {
    blockedMoveKind: options.blockedMoveKind ?? "stay",
    trapHook: options.trapHook ?? "default",
    clonerHook: options.clonerHook ?? "default",
    ...(options.airHook ? { airHook: options.airHook } : {}),
  } as const;

  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    matches: options.matches,
    policy: {
      tags: options.tags ?? [],
      movement,
      interaction: {
        thiefHook: options.thiefHook ?? "none",
        collisionStrategyId: options.collisionStrategyId ?? "default",
      },
      hazards: {
        responses: {
          water: "destroy",
          fire: "destroy",
          bomb: "destroy",
          ...(options.hazardResponses ?? {}),
        },
      },
    },
  });
}

export function createMonsterActorFamilyDefinition<TActorId extends number = number>(
  options: MonsterActorFamilyBuilderOptions<TActorId>,
): RulesetActorFamilyDefinition<TActorId> {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    matches: options.matches,
    policy: {
      tags: ["creature", ...(options.tags ?? [])],
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
        airHook: "non-chip-support",
      },
      hazards: {
        responses: {
          ...(options.defaultHazardResponses ?? {}),
          ...(options.hazardResponses ?? {}),
        },
      },
    },
  });
}

export function createBlockActorFamilyDefinition<TActorId extends number = number>(
  options: BlockActorFamilyBuilderOptions<TActorId>,
): RulesetActorFamilyDefinition<TActorId> {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    matches: options.matches,
    policy: {
      tags: [...(options.baseTags ?? ["block"]), ...(options.tags ?? [])],
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
          ...(options.hazardResponses ?? {}),
        },
      },
    },
  });
}

export function createBallisticActorFamilyDefinition<TActorId extends number = number>(
  options: BallisticActorFamilyBuilderOptions<TActorId>,
): RulesetActorFamilyDefinition<TActorId> {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    matches: options.matches,
    policy: {
      tags: ["creature", ...(options.tags ?? [])],
      control: {
        mode: "ballistic",
      },
      movement: {
        strategyId: "ballistic-like",
        blockedMoveKind: "revert-portable",
        trapHook: "hold-direction",
        clonerHook: "hold-direction",
        airHook: "chip-support",
      },
      interaction: {
        collisionStrategyId: "ballistic-destroy",
      },
      hazards: {
        responses: options.hazardResponses ?? {},
      },
    },
  });
}

export function createPlayerLikeActorFamilyDefinition<TActorId extends number = number>(
  options: PlayerLikeActorFamilyBuilderOptions<TActorId>,
): RulesetActorFamilyDefinition<TActorId> {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    matches: options.matches,
    policy: {
      tags: [...(options.baseTags ?? ["chip", "collects-items"]), ...(options.tags ?? [])],
      control: {
        mode: "player-input",
      },
      inventory: {
        localInventoryMode: options.localInventoryMode ?? "keys-boots-tools",
        itemCollectionKind: options.itemCollectionKind ?? "keys-boots-tools",
        globalProgressKind: options.globalProgressKind ?? "collect-chips",
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
    },
  });
}

export function createPortableBackedActorFamilyDefinition<TActorId extends number = number>(
  options: PortableBackedActorFamilyBuilderOptions<TActorId>,
): RulesetActorFamilyDefinition<TActorId> {
  return createRulesetActorFamily({
    name: options.name,
    actorIds: options.actorIds,
    matches: options.matches,
    policy: {
      tags: [...(options.baseTags ?? ["collects-items"]), ...(options.tags ?? [])],
      inventory: {
        localInventoryMode: options.localInventoryMode,
        itemCollectionKind: options.itemCollectionKind,
        globalProgressKind: options.globalProgressKind,
      },
      interaction: {
        thiefHook: options.thiefHook ?? "steal-boots-tools",
      },
    },
  });
}

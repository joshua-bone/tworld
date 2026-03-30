import type {
  ActorCapabilityPolicy,
  ActorCollisionStrategyId,
  ActorControlMode,
  ActorHazardName,
  ActorHazardResponse,
  ActorItemCollectionKind,
  ActorLocalInventoryMode,
  ActorGlobalProgressKind,
  ActorMovementStrategyId,
  ActorBlockedMoveKind,
  ActorTrapHook,
  ActorClonerHook,
  ActorAirHook,
  ActorThiefHook,
} from "@game-core/api/actorCapabilities";
import type { ActorTag } from "@game-core/api/ruleset";

interface RulesetActorPolicyMetadata {
  readonly tags: readonly ActorTag[];
  readonly capabilities: ActorCapabilityPolicy;
}

interface MutableActorPolicyMetadata {
  tags: ActorTag[];
  capabilities: {
    control: { mode: ActorControlMode };
    inventory: {
      localInventoryMode: ActorLocalInventoryMode;
      itemCollectionKind: ActorItemCollectionKind;
      globalProgressKind: ActorGlobalProgressKind;
    };
    movement: {
      strategyId: ActorMovementStrategyId;
      blockedMoveKind: ActorBlockedMoveKind;
      trapHook: ActorTrapHook;
      clonerHook: ActorClonerHook;
      airHook: ActorAirHook;
    };
    interaction: {
      thiefHook: ActorThiefHook;
      collisionStrategyId: ActorCollisionStrategyId;
    };
    hazards: {
      responses: Record<ActorHazardName, ActorHazardResponse>;
    };
  };
}

export interface RulesetActorCapabilityPatch {
  readonly tags?: readonly ActorTag[];
  readonly control?: {
    readonly mode?: ActorControlMode;
  };
  readonly inventory?: {
    readonly localInventoryMode?: ActorLocalInventoryMode;
    readonly itemCollectionKind?: ActorItemCollectionKind;
    readonly globalProgressKind?: ActorGlobalProgressKind;
  };
  readonly movement?: {
    readonly strategyId?: ActorMovementStrategyId;
    readonly blockedMoveKind?: ActorBlockedMoveKind;
    readonly trapHook?: ActorTrapHook;
    readonly clonerHook?: ActorClonerHook;
    readonly airHook?: ActorAirHook;
  };
  readonly interaction?: {
    readonly thiefHook?: ActorThiefHook;
    readonly collisionStrategyId?: ActorCollisionStrategyId;
  };
  readonly hazards?: {
    readonly responses?: Partial<Record<ActorHazardName, ActorHazardResponse>>;
  };
}

export interface RulesetActorFamilyDefinition<TActorId extends number = number> {
  readonly name: string;
  matches(id: TActorId): boolean;
  policy(id: TActorId): RulesetActorCapabilityPatch;
}

export function createRulesetActorFamily<TActorId extends number = number>(options: {
  readonly name: string;
  readonly actorIds?: readonly TActorId[];
  readonly matches?: (id: TActorId) => boolean;
  readonly policy: RulesetActorCapabilityPatch | ((id: TActorId) => RulesetActorCapabilityPatch);
}): RulesetActorFamilyDefinition<TActorId> {
  const actorIdSet = options.actorIds ? new Set(options.actorIds) : null;
  return {
    name: options.name,
    matches(id) {
      if (options.matches) {
        return options.matches(id);
      }
      return actorIdSet?.has(id) ?? false;
    },
    policy(id) {
      return typeof options.policy === "function" ? options.policy(id) : options.policy;
    },
  };
}

function mergeUnique<T>(left: readonly T[], right: readonly T[] | undefined): T[] {
  if (!right || right.length === 0) {
    return [...left];
  }
  return [...new Set([...left, ...right])];
}

export function composeRulesetActorPolicy<TActorId extends number = number>(
  basePolicy: RulesetActorPolicyMetadata,
  id: TActorId,
  families: readonly RulesetActorFamilyDefinition<TActorId>[],
): RulesetActorPolicyMetadata {
  const next: MutableActorPolicyMetadata = {
    tags: [...basePolicy.tags],
    capabilities: {
      control: { ...basePolicy.capabilities.control },
      inventory: { ...basePolicy.capabilities.inventory },
      movement: { ...basePolicy.capabilities.movement },
      interaction: { ...basePolicy.capabilities.interaction },
      hazards: {
        responses: { ...basePolicy.capabilities.hazards.responses },
      },
    },
  };

  for (const family of families) {
    if (!family.matches(id)) {
      continue;
    }

    const patch = family.policy(id);
    next.tags = mergeUnique(next.tags, patch.tags);

    if (patch.control) {
      next.capabilities.control = {
        ...next.capabilities.control,
        ...patch.control,
      };
    }

    if (patch.inventory) {
      next.capabilities.inventory = {
        ...next.capabilities.inventory,
        ...patch.inventory,
      };
    }

    if (patch.movement) {
      next.capabilities.movement = {
        ...next.capabilities.movement,
        ...patch.movement,
      };
    }

    if (patch.interaction) {
      next.capabilities.interaction = {
        ...next.capabilities.interaction,
        ...patch.interaction,
      };
    }

    if (patch.hazards?.responses) {
      next.capabilities.hazards = {
        responses: {
          ...next.capabilities.hazards.responses,
          ...patch.hazards.responses,
        },
      };
    }
  }

  return {
    tags: [...next.tags],
    capabilities: next.capabilities,
  };
}

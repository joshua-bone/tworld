import type {
  ActorHazardName,
  ActorHazardResponse,
  ActorCollisionStrategyId,
  ActorThiefHook,
} from "@game-core/api/actorCapabilities";

export const ACTOR_INTERACTION_TARGET_KIND = {
  empty: "empty",
  runtimeActor: "runtime-actor",
  portableItem: "portable-item",
  chip: "chip",
} as const;

export type ActorInteractionTargetKind =
  (typeof ACTOR_INTERACTION_TARGET_KIND)[keyof typeof ACTOR_INTERACTION_TARGET_KIND];

export interface ActorInteractionTarget {
  readonly kind: ActorInteractionTargetKind;
  readonly actorId?: number;
  readonly tileId?: number;
  readonly movingDir?: number;
  readonly targetDir?: number;
  readonly sameDirection?: boolean;
}

export interface ActorCollisionOutcome {
  readonly chipFails: boolean;
  readonly denyMove: boolean;
  readonly removeMovingActor: boolean;
  readonly removeTargetActor: boolean;
  readonly preserveTarget: boolean;
  readonly consumeTarget: boolean;
  readonly transformTargetTileId: number | null;
}

export type ActorArrivalOutcome =
  | "none"
  | "trap"
  | "button"
  | "clear-key-blue"
  | "block-water"
  | "block-bomb"
  | "creature-water"
  | "creature-fire"
  | "creature-bomb";

export type ActorHazardOutcome =
  | "none"
  | "deny-entry"
  | "block-water"
  | "block-bomb"
  | "creature-water"
  | "creature-fire"
  | "creature-bomb";

export type ActorHeldFloorOutcome = "none" | "hold-direction";

export type ActorThiefOutcome = "none" | "steal-boots-tools";

export function noActorCollisionOutcome(): ActorCollisionOutcome {
  return {
    chipFails: false,
    denyMove: false,
    removeMovingActor: false,
    removeTargetActor: false,
    preserveTarget: false,
    consumeTarget: false,
    transformTargetTileId: null,
  };
}

export function denyMoveCollisionOutcome(): ActorCollisionOutcome {
  return {
    chipFails: false,
    denyMove: true,
    removeMovingActor: false,
    removeTargetActor: false,
    preserveTarget: false,
    consumeTarget: false,
    transformTargetTileId: null,
  };
}

export function destroyMovingActorCollisionOutcome(): ActorCollisionOutcome {
  return {
    chipFails: false,
    denyMove: false,
    removeMovingActor: true,
    removeTargetActor: false,
    preserveTarget: false,
    consumeTarget: false,
    transformTargetTileId: null,
  };
}

export function chipFailAndDestroyMovingActorCollisionOutcome(): ActorCollisionOutcome {
  return {
    chipFails: true,
    denyMove: false,
    removeMovingActor: true,
    removeTargetActor: false,
    preserveTarget: false,
    consumeTarget: false,
    transformTargetTileId: null,
  };
}

export function destroyMovingActorAndTargetCollisionOutcome(
  chipFails = false,
): ActorCollisionOutcome {
  return {
    chipFails,
    denyMove: false,
    removeMovingActor: true,
    removeTargetActor: true,
    preserveTarget: false,
    consumeTarget: false,
    transformTargetTileId: null,
  };
}

export function chipFailCollisionOutcome(removeTargetActor = false, preserveTarget = false): ActorCollisionOutcome {
  return {
    chipFails: true,
    denyMove: false,
    removeMovingActor: false,
    removeTargetActor,
    preserveTarget,
    consumeTarget: false,
    transformTargetTileId: null,
  };
}

export function consumeTargetCollisionOutcome(transformTargetTileId: number | null = null): ActorCollisionOutcome {
  return {
    chipFails: false,
    denyMove: false,
    removeMovingActor: false,
    removeTargetActor: true,
    preserveTarget: false,
    consumeTarget: true,
    transformTargetTileId,
  };
}

export function destroyMovingActorAndConsumeTargetCollisionOutcome(
  transformTargetTileId: number | null = null,
): ActorCollisionOutcome {
  return {
    chipFails: false,
    denyMove: false,
    removeMovingActor: true,
    removeTargetActor: true,
    preserveTarget: false,
    consumeTarget: true,
    transformTargetTileId,
  };
}

export function preserveActorCollisionOutcome(outcome: ActorCollisionOutcome): ActorCollisionOutcome {
  return {
    ...outcome,
    preserveTarget: true,
  };
}

export function actorHazardOutcome(
  hazard: ActorHazardName,
  response: ActorHazardResponse,
): ActorHazardOutcome {
  switch (hazard) {
    case "water":
      switch (response) {
        case "transform":
          return "block-water";
        case "destroy":
          return "creature-water";
        case "deny":
          return "deny-entry";
        default:
          return "none";
      }
    case "fire":
      switch (response) {
        case "destroy":
          return "creature-fire";
        case "deny":
          return "deny-entry";
        default:
          return "none";
      }
    case "bomb":
      switch (response) {
        case "transform":
          return "block-bomb";
        case "destroy":
          return "creature-bomb";
        case "deny":
          return "deny-entry";
        default:
          return "none";
      }
  }
}

export function actorHazardDeniesEntry(outcome: ActorHazardOutcome): boolean {
  return outcome === "deny-entry";
}

export function actorThiefOutcome(hook: ActorThiefHook): ActorThiefOutcome {
  return hook === "steal-boots-tools" ? "steal-boots-tools" : "none";
}

export interface ResolveActorInteractionOutcomeContext {
  readonly movingStrategyId: ActorCollisionStrategyId;
  readonly targetStrategyId?: ActorCollisionStrategyId | null;
  readonly movingIsChip: boolean;
  readonly targetIsChip: boolean;
  readonly defaultChipCollisionRemovesTarget: boolean;
  readonly target: ActorInteractionTarget;
}

function targetUsesBallisticDestroyStrategy(
  context: ResolveActorInteractionOutcomeContext,
): boolean {
  return (
    (context.target.kind === ACTOR_INTERACTION_TARGET_KIND.runtimeActor ||
      context.target.kind === ACTOR_INTERACTION_TARGET_KIND.chip) &&
    context.targetStrategyId === "ballistic-destroy"
  );
}

function resolveDefaultInteractionOutcome(
  context: ResolveActorInteractionOutcomeContext,
): ActorCollisionOutcome {
  if (context.target.kind === ACTOR_INTERACTION_TARGET_KIND.empty) {
    return noActorCollisionOutcome();
  }

  if (targetUsesBallisticDestroyStrategy(context)) {
    if (context.movingIsChip && context.target.sameDirection) {
      return denyMoveCollisionOutcome();
    }
    if (context.movingIsChip || context.targetIsChip) {
      return chipFailCollisionOutcome(true);
    }
    return destroyMovingActorAndTargetCollisionOutcome();
  }

  if (context.target.kind === ACTOR_INTERACTION_TARGET_KIND.portableItem) {
    return context.movingIsChip ? noActorCollisionOutcome() : denyMoveCollisionOutcome();
  }

  return context.movingIsChip || context.targetIsChip
    ? chipFailCollisionOutcome(context.defaultChipCollisionRemovesTarget)
    : noActorCollisionOutcome();
}

function resolveBallisticDestroyInteractionOutcome(
  context: ResolveActorInteractionOutcomeContext,
): ActorCollisionOutcome {
  switch (context.target.kind) {
    case ACTOR_INTERACTION_TARGET_KIND.empty:
      return noActorCollisionOutcome();
    case ACTOR_INTERACTION_TARGET_KIND.portableItem:
      return destroyMovingActorAndConsumeTargetCollisionOutcome();
    case ACTOR_INTERACTION_TARGET_KIND.chip:
      return chipFailAndDestroyMovingActorCollisionOutcome();
    default:
      return destroyMovingActorAndTargetCollisionOutcome();
  }
}

export function resolveActorInteractionOutcome(
  context: ResolveActorInteractionOutcomeContext,
): ActorCollisionOutcome {
  switch (context.movingStrategyId) {
    case "ballistic-destroy":
      return resolveBallisticDestroyInteractionOutcome(context);
    default:
      return resolveDefaultInteractionOutcome(context);
  }
}

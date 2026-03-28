import type {
  ActorHazardName,
  ActorHazardResponse,
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

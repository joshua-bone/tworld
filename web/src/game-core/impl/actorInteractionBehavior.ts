import type {
  ActorBlockedMoveKind,
  ActorCapabilityPolicy,
  ActorCollisionStrategyId,
  ActorHazardName,
} from "@game-core/api/actorCapabilities";
import {
  actorBlockedMoveKind,
  actorCollisionStrategyId,
  actorHazardResponse,
} from "@game-core/api/actorCapabilities";
import type {
  ActorArrivalOutcome,
  ActorHazardOutcome,
} from "@game-core/api/actorInteractions";
import { actorHazardOutcome } from "@game-core/api/actorInteractions";
import { createActorBehavior, type ActorBehavior, type ActorBehaviorContext } from "@game-core/api/ruleset";

export interface ActorBlockedMovePolicyBehaviorContext extends ActorBehaviorContext<number, number> {
  blockedMoveKind: ActorBlockedMoveKind;
}

export interface ActorCollisionPolicyBehaviorContext extends ActorBehaviorContext<number, number> {
  collisionStrategyId: ActorCollisionStrategyId;
}

export interface ActorArrivalPolicyBehaviorContext extends ActorBehaviorContext<number, number> {
  readonly tileId: number;
  readonly hazardName: ActorHazardName | null;
  hazardOutcome: ActorHazardOutcome;
  arrivalOutcome: ActorArrivalOutcome;
}

export function createActorInteractionBehavior(policy: ActorCapabilityPolicy): ActorBehavior<number, number> {
  return createActorBehavior({
    blockedMove: (context: ActorBehaviorContext<number, number>) => {
      (context as ActorBlockedMovePolicyBehaviorContext).blockedMoveKind = actorBlockedMoveKind(policy);
    },
    collision: (context: ActorBehaviorContext<number, number>) => {
      (context as ActorCollisionPolicyBehaviorContext).collisionStrategyId = actorCollisionStrategyId(policy);
    },
    arrival: (context: ActorBehaviorContext<number, number>) => {
      const behaviorContext = context as ActorArrivalPolicyBehaviorContext;
      if (behaviorContext.hazardName === null) {
        return;
      }

      const hazard = actorHazardOutcome(
        behaviorContext.hazardName,
        actorHazardResponse(policy, behaviorContext.hazardName),
      );
      behaviorContext.hazardOutcome = hazard;
      if (hazard !== "deny-entry") {
        behaviorContext.arrivalOutcome = hazard;
      }
    },
  });
}

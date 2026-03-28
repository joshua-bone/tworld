export type ActorLocalInventoryMode = "none" | "keys-boots" | "keys-boots-tools";

export type ActorControlMode = "player-input" | "ai" | "ballistic" | "passive";

export type ActorMovementStrategyId = "chip-like" | "creature-like" | "block-like";

export type ActorItemCollectionKind = "none" | "keys-boots" | "keys-boots-tools";

export type ActorGlobalProgressKind = "none" | "collect-chips";

export type ActorCollectibleSlot = "keys" | "boots" | "tools";

export type ActorBlockedMoveKind = "stay" | "hold-direction" | "revert-portable";

export type ActorTrapHook = "none" | "default" | "hold-direction";

export type ActorClonerHook = "none" | "default" | "hold-direction";

export type ActorThiefHook = "none" | "steal-boots-tools";

export type ActorAirHook = "chip-support" | "non-chip-support";

export type ActorCollisionStrategyId = "default";

export type ActorHazardName = "water" | "fire" | "bomb";

export type ActorHazardResponse = "ignore" | "deny" | "destroy" | "transform";

export interface ActorControlPolicy {
  readonly mode: ActorControlMode;
}

export interface ActorInventoryPolicy {
  readonly localInventoryMode: ActorLocalInventoryMode;
  readonly itemCollectionKind: ActorItemCollectionKind;
  readonly globalProgressKind: ActorGlobalProgressKind;
}

export interface ActorMovementPolicy {
  readonly strategyId: ActorMovementStrategyId;
  readonly blockedMoveKind: ActorBlockedMoveKind;
  readonly trapHook: ActorTrapHook;
  readonly clonerHook: ActorClonerHook;
  readonly airHook: ActorAirHook;
}

export interface ActorInteractionPolicy {
  readonly thiefHook: ActorThiefHook;
  readonly collisionStrategyId: ActorCollisionStrategyId;
}

export interface ActorHazardPolicy {
  readonly responses: Readonly<Record<ActorHazardName, ActorHazardResponse>>;
}

export interface ActorCapabilityPolicy {
  readonly control: ActorControlPolicy;
  readonly inventory: ActorInventoryPolicy;
  readonly movement: ActorMovementPolicy;
  readonly interaction: ActorInteractionPolicy;
  readonly hazards: ActorHazardPolicy;
}

export function actorControlMode(policy: ActorCapabilityPolicy): ActorControlMode {
  return policy.control.mode;
}

export function actorLocalInventoryMode(policy: ActorCapabilityPolicy): ActorLocalInventoryMode {
  return policy.inventory.localInventoryMode;
}

export function actorItemCollectionKind(policy: ActorCapabilityPolicy): ActorItemCollectionKind {
  return policy.inventory.itemCollectionKind;
}

export function actorGlobalProgressKind(policy: ActorCapabilityPolicy): ActorGlobalProgressKind {
  return policy.inventory.globalProgressKind;
}

export function actorMovementStrategyId(policy: ActorCapabilityPolicy): ActorMovementStrategyId {
  return policy.movement.strategyId;
}

export function actorBlockedMoveKind(policy: ActorCapabilityPolicy): ActorBlockedMoveKind {
  return policy.movement.blockedMoveKind;
}

export function actorTrapHook(policy: ActorCapabilityPolicy): ActorTrapHook {
  return policy.movement.trapHook;
}

export function actorClonerHook(policy: ActorCapabilityPolicy): ActorClonerHook {
  return policy.movement.clonerHook;
}

export function actorAirHook(policy: ActorCapabilityPolicy): ActorAirHook {
  return policy.movement.airHook;
}

export function actorThiefHook(policy: ActorCapabilityPolicy): ActorThiefHook {
  return policy.interaction.thiefHook;
}

export function actorCollisionStrategyId(policy: ActorCapabilityPolicy): ActorCollisionStrategyId {
  return policy.interaction.collisionStrategyId;
}

export function actorHazardResponse(policy: ActorCapabilityPolicy, hazard: ActorHazardName): ActorHazardResponse {
  return policy.hazards.responses[hazard];
}

export function actorCollectionAllowsSlot(kind: ActorItemCollectionKind, slot: ActorCollectibleSlot): boolean {
  switch (kind) {
    case "keys-boots-tools":
      return true;
    case "keys-boots":
      return slot !== "tools";
    default:
      return false;
  }
}

export function actorCollectsChips(kind: ActorGlobalProgressKind): boolean {
  return kind === "collect-chips";
}

export function actorBlockedMoveKeepsDirection(kind: ActorBlockedMoveKind): boolean {
  return kind === "hold-direction";
}

export function actorBlockedMoveRevertsPortable(kind: ActorBlockedMoveKind): boolean {
  return kind === "revert-portable";
}

export function actorThiefStealsBootsAndTools(hook: ActorThiefHook): boolean {
  return hook === "steal-boots-tools";
}

export function actorUsesChipSupport(hook: ActorAirHook): boolean {
  return hook === "chip-support";
}

export type ActorLocalInventoryMode = "none" | "keys-boots" | "keys-boots-tools";

export type ActorControlMode = "player-input" | "ai" | "ballistic" | "passive";

export type ActorTraversalKind = "chip" | "creature" | "block";

export type ActorItemCollectionKind = "none" | "keys-boots" | "keys-boots-tools";

export type ActorGlobalProgressKind = "none" | "collect-chips";

export type ActorCollectibleSlot = "keys" | "boots" | "tools";

export type ActorBlockedMoveKind = "stay" | "hold-direction" | "revert-portable";

export type ActorTrapHook = "default" | "hold-direction";

export type ActorClonerHook = "default";

export type ActorThiefHook = "none" | "steal-boots-tools";

export type ActorAirHook = "chip-support" | "non-chip-support";

export type ActorHazardName = "water" | "fire" | "bomb";

export type ActorHazardResponse = "ignore" | "deny" | "destroy" | "transform";

export interface ActorCapabilityPolicy {
  readonly controlMode: ActorControlMode;
  readonly localInventoryMode: ActorLocalInventoryMode;
  readonly itemCollectionKind: ActorItemCollectionKind;
  readonly globalProgressKind: ActorGlobalProgressKind;
  readonly traversalKind: ActorTraversalKind;
  readonly blockedMoveKind: ActorBlockedMoveKind;
  readonly trapHook: ActorTrapHook;
  readonly clonerHook: ActorClonerHook;
  readonly thiefHook: ActorThiefHook;
  readonly airHook: ActorAirHook;
  readonly hazards: Readonly<Record<ActorHazardName, ActorHazardResponse>>;
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

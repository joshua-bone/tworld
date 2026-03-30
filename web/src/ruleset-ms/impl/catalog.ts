import type {
  ActorAirHook,
  ActorBlockedMoveKind,
  ActorClonerHook,
  ActorCollisionStrategyId,
  ActorControlMode,
  ActorGlobalProgressKind,
  ActorHazardName,
  ActorHazardResponse,
  ActorItemCollectionKind,
  ActorLocalInventoryMode,
  ActorMovementStrategyId,
  ActorThiefHook,
  ActorTrapHook,
} from "@game-core/api/actorCapabilities";
import {
  actorAirHook,
  actorBlockedMoveKind,
  actorClonerHook,
  actorCollisionStrategyId,
  actorControlMode,
  actorGlobalProgressKind,
  actorHazardResponse,
  actorItemCollectionKind,
  actorLocalInventoryMode,
  actorMovementStrategyId,
  actorThiefHook,
  actorTrapHook,
} from "@game-core/api/actorCapabilities";
import type {
  ActorClonerFamilyHooks,
  ActorSupportFamilyHooks,
  ActorTrapFamilyHooks,
} from "@game-core/api/actorSpecialFloorHooks";
import {
  actorClonerFamilyHooks,
  actorSupportFamilyHooks,
  actorTrapFamilyHooks,
} from "@game-core/api/actorSpecialFloorHooks";
import {
  createRulesetCatalog,
  type ActorTag,
  type TileCapability,
  type TileTag,
} from "@game-core/api/ruleset";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import {
  msActorDefinitions,
  MS_CREATURE_ACTOR_CAPABILITIES,
} from "@ruleset-ms/impl/catalogActors";
import {
  lookupMsTilePolicy,
  msIceWallTurn as msIceWallTurnFromTiles,
  msSlideDirection as msSlideDirectionFromTiles,
  msTileDefinitions,
  type MsButtonAction,
  type MsChipEnterAction,
  type MsForcedFloorKind,
  type MsInventorySlot,
  type MsMobExitAction,
  type MsPortableItemFamily,
} from "@ruleset-ms/impl/catalogTiles";
import {
  lookupMsActorDefinitionRegistration,
  lookupMsPortableItemFamilyRegistrationByTileId,
  lookupMsTerrainPickupTileRegistration,
} from "@ruleset-ms/impl/elementRegistration";

type MsActorArrivalAction =
  | "none"
  | "block-water"
  | "block-bomb"
  | "creature-water"
  | "creature-fire"
  | "creature-bomb";

export const msRulesetCatalog = createRulesetCatalog({
  name: "ms",
  tiles: msTileDefinitions,
  actors: msActorDefinitions,
});

export function msTileHasTag(id: number, tag: TileTag): boolean {
  return lookupMsTilePolicy(id).tags.includes(tag);
}

export function msTileHasCapability(id: number, capability: TileCapability): boolean {
  return lookupMsTilePolicy(id).capabilities.includes(capability);
}

export function msChipMovementMask(id: number): number {
  return lookupMsTilePolicy(id).chipMovementMask;
}

export function msCreatureMovementMask(id: number): number {
  return lookupMsTilePolicy(id).creatureMovementMask;
}

export function msBlockMovementMask(id: number): number {
  return lookupMsTilePolicy(id).blockMovementMask;
}

export function msExitMovementMask(id: number): number {
  return lookupMsTilePolicy(id).exitMovementMask;
}

export function msRequiresReleaseToExit(id: number): boolean {
  return lookupMsTilePolicy(id).requiresReleaseToExit;
}

export function msInventorySlot(id: number): MsInventorySlot | null {
  return lookupMsTerrainPickupTileRegistration(id)?.inventorySlot ?? lookupMsTilePolicy(id).inventorySlot ?? null;
}

export function msPortableItemFamily(id: number): MsPortableItemFamily | null {
  return (
    lookupMsPortableItemFamilyRegistrationByTileId(id)?.familyId ?? lookupMsTilePolicy(id).portableItemFamily ?? null
  );
}

export function msInventoryIndex(id: number): number | null {
  return lookupMsTerrainPickupTileRegistration(id)?.inventoryIndex ?? lookupMsTilePolicy(id).inventoryIndex ?? null;
}

export function msDoorKeyIndex(id: number): number | null {
  return lookupMsTerrainPickupTileRegistration(id)?.doorKeyIndex ?? lookupMsTilePolicy(id).doorKeyIndex ?? null;
}

export function msTileForcedFloorKind(id: number): MsForcedFloorKind {
  return lookupMsTilePolicy(id).forcedFloorKind;
}

export function msTileMobExitAction(id: number): MsMobExitAction {
  return lookupMsTilePolicy(id).mobExitAction;
}

export function msChipEnterAction(id: number): MsChipEnterAction {
  return lookupMsTilePolicy(id).chipEnterAction;
}

export function msButtonAction(id: number): MsButtonAction {
  return lookupMsTilePolicy(id).buttonAction;
}

export function msActorHasTag(id: number, tag: ActorTag): boolean {
  return lookupMsActorDefinitionRegistration(id)?.tags.includes(tag) ?? false;
}

export function msActorCapabilityPolicy(id: number) {
  return lookupMsActorDefinitionRegistration(id)?.capabilities ?? MS_CREATURE_ACTOR_CAPABILITIES;
}

export function msActorControlMode(id: number): ActorControlMode {
  return actorControlMode(msActorCapabilityPolicy(id));
}

export function msActorLocalInventoryMode(id: number): ActorLocalInventoryMode {
  return actorLocalInventoryMode(msActorCapabilityPolicy(id));
}

export function msActorItemCollectionKind(id: number): ActorItemCollectionKind {
  return actorItemCollectionKind(msActorCapabilityPolicy(id));
}

export function msActorGlobalProgressKind(id: number): ActorGlobalProgressKind {
  return actorGlobalProgressKind(msActorCapabilityPolicy(id));
}

export function msActorMovementStrategyId(id: number): ActorMovementStrategyId {
  return actorMovementStrategyId(msActorCapabilityPolicy(id));
}

export function msActorBlockedMoveKind(id: number): ActorBlockedMoveKind {
  return actorBlockedMoveKind(msActorCapabilityPolicy(id));
}

export function msActorTrapHook(id: number): ActorTrapHook {
  return actorTrapHook(msActorCapabilityPolicy(id));
}

export function msActorClonerHook(id: number): ActorClonerHook {
  return actorClonerHook(msActorCapabilityPolicy(id));
}

export function msActorThiefHook(id: number): ActorThiefHook {
  return actorThiefHook(msActorCapabilityPolicy(id));
}

export function msActorAirHook(id: number): ActorAirHook {
  return actorAirHook(msActorCapabilityPolicy(id));
}

export function msActorTrapFamilyHooks(id: number): ActorTrapFamilyHooks {
  return actorTrapFamilyHooks(msActorCapabilityPolicy(id));
}

export function msActorClonerFamilyHooks(id: number): ActorClonerFamilyHooks {
  return actorClonerFamilyHooks(msActorCapabilityPolicy(id));
}

export function msActorSupportFamilyHooks(id: number): ActorSupportFamilyHooks {
  return actorSupportFamilyHooks(msActorCapabilityPolicy(id));
}

export function msActorCollisionStrategyId(id: number): ActorCollisionStrategyId {
  return actorCollisionStrategyId(msActorCapabilityPolicy(id));
}

function usesBallisticCloneMachineEntry(actorId: number): boolean {
  return (
    msActorMovementStrategyId(actorId) === "ballistic-like" &&
    msActorClonerFamilyHooks(actorId).entryBehavior === "occupy-and-hold"
  );
}

export function msActorEntryMask(tileId: number, actorId: number): number {
  if (tileId === MS_TILE.CloneMachine && usesBallisticCloneMachineEntry(actorId)) {
    return msChipMovementMask(MS_TILE.Empty);
  }

  switch (msActorMovementStrategyId(actorId)) {
    case "chip-like":
    case "ballistic-like":
      return msChipMovementMask(tileId);
    case "block-like":
      return msBlockMovementMask(tileId);
    default:
      return msCreatureMovementMask(tileId);
  }
}

export function msActorHazardResponse(actorId: number, hazard: ActorHazardName): ActorHazardResponse {
  return actorHazardResponse(msActorCapabilityPolicy(actorId), hazard);
}

export function msActorArrivalAction(tileId: number, actorId: number): MsActorArrivalAction {
  if (tileId === MS_TILE.Water) {
    switch (msActorHazardResponse(actorId, "water")) {
      case "transform":
        return "block-water";
      case "destroy":
        return "creature-water";
      default:
        return "none";
    }
  }
  if (tileId === MS_TILE.Fire) {
    return msActorHazardResponse(actorId, "fire") === "destroy" ? "creature-fire" : "none";
  }
  if (tileId === MS_TILE.Bomb) {
    switch (msActorHazardResponse(actorId, "bomb")) {
      case "transform":
        return "block-bomb";
      case "destroy":
        return "creature-bomb";
      default:
        return "none";
    }
  }
  return "none";
}

export function msIsActorTile(id: number): boolean {
  return lookupMsActorDefinitionRegistration(id) !== undefined;
}

export function msIsOverlayFloorTile(id: number): boolean {
  return msTileHasTag(id, "collectible") || msIsActorTile(id);
}

export function msPreservesUnderlyingFloor(id: number): boolean {
  return !msIsOverlayFloorTile(id);
}

export function msSlideDirection(id: number, randomDirection: number): number {
  return msSlideDirectionFromTiles(id, randomDirection);
}

export function msIceWallTurn(id: number, dir: number): number {
  return msIceWallTurnFromTiles(id, dir);
}

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
  lynxActorDefinitions,
  LYNX_CREATURE_ACTOR_CAPABILITIES,
} from "@ruleset-lynx/impl/catalogActors";
import {
  lookupLynxTilePolicy,
  lynxChipMoveSoundAction as lynxChipMoveSoundActionFromTiles,
  lynxFixedSlideDirection as lynxFixedSlideDirectionFromTiles,
  lynxIceWallTurn as lynxIceWallTurnFromTiles,
  lynxTileDefinitions,
  lynxToggledWallTileId as lynxToggledWallTileIdFromTiles,
  type LynxAnimationKind,
  type LynxButtonAction,
  type LynxChipEnterAction,
  type LynxChipMoveSoundOptions,
  type LynxCreatureFloorAction,
  type LynxFloorSoundAction,
  type LynxForcedFloorKind,
  type LynxInventorySlot,
  type LynxMobExitAction,
  type LynxPortableItemFamily,
} from "@ruleset-lynx/impl/catalogTiles";
import {
  lookupLynxActorDefinitionRegistration,
  lookupLynxPortableItemFamilyRegistrationByTileId,
  lookupLynxTerrainPickupTileRegistration,
} from "@ruleset-lynx/impl/elementRegistration";

type LynxCreatureArrivalAction =
  | "none"
  | "trap"
  | "button"
  | "clear-key-blue"
  | "block-water"
  | "block-bomb"
  | "creature-water"
  | "creature-bomb";

export const lynxRulesetCatalog = createRulesetCatalog({
  name: "lynx",
  tiles: lynxTileDefinitions,
  actors: lynxActorDefinitions,
});

export function lynxTileHasTag(id: number, tag: TileTag): boolean {
  return lookupLynxTilePolicy(id).tags.includes(tag);
}

export function lynxTileHasCapability(id: number, capability: TileCapability): boolean {
  return lookupLynxTilePolicy(id).capabilities.includes(capability);
}

export function lynxInventorySlot(id: number): LynxInventorySlot | null {
  return lookupLynxTerrainPickupTileRegistration(id)?.inventorySlot ?? lookupLynxTilePolicy(id).inventorySlot ?? null;
}

export function lynxPortableItemFamily(id: number): LynxPortableItemFamily | null {
  return (
    lookupLynxPortableItemFamilyRegistrationByTileId(id)?.familyId ??
    lookupLynxTilePolicy(id).portableItemFamily ??
    null
  );
}

export function lynxInventoryIndex(id: number): number | null {
  return lookupLynxTerrainPickupTileRegistration(id)?.inventoryIndex ?? lookupLynxTilePolicy(id).inventoryIndex ?? null;
}

export function lynxDoorKeyIndex(id: number): number | null {
  return lookupLynxTerrainPickupTileRegistration(id)?.doorKeyIndex ?? lookupLynxTilePolicy(id).doorKeyIndex ?? null;
}

export function lynxChipMovementMask(id: number): number {
  return lookupLynxTilePolicy(id).chipMovementMask;
}

export function lynxCreatureMovementMask(id: number): number {
  return lookupLynxTilePolicy(id).creatureMovementMask;
}

export function lynxBlockMovementMask(id: number): number {
  return lookupLynxTilePolicy(id).blockMovementMask;
}

export function lynxExitMovementMask(id: number): number {
  return lookupLynxTilePolicy(id).exitMovementMask;
}

export function lynxRequiresReleaseToExit(id: number): boolean {
  return lookupLynxTilePolicy(id).requiresReleaseToExit;
}

export function lynxCreatureFloorAction(id: number): LynxCreatureFloorAction {
  return lookupLynxTilePolicy(id).creatureFloorAction;
}

export function lynxTileForcedFloorKind(id: number): LynxForcedFloorKind {
  return lookupLynxTilePolicy(id).forcedFloorKind;
}

export function lynxTileMobExitAction(id: number): LynxMobExitAction {
  return lookupLynxTilePolicy(id).mobExitAction;
}

export function lynxChipEnterAction(id: number): LynxChipEnterAction {
  return lookupLynxTilePolicy(id).chipEnterAction;
}

export function lynxButtonAction(id: number): LynxButtonAction {
  return lookupLynxTilePolicy(id).buttonAction;
}

export function lynxActorHasTag(id: number, tag: ActorTag): boolean {
  return lookupLynxActorDefinitionRegistration(id)?.tags.includes(tag) ?? false;
}

export function lynxActorCapabilityPolicy(id: number) {
  return lookupLynxActorDefinitionRegistration(id)?.capabilities ?? LYNX_CREATURE_ACTOR_CAPABILITIES;
}

export function lynxActorControlMode(id: number): ActorControlMode {
  return actorControlMode(lynxActorCapabilityPolicy(id));
}

export function lynxActorLocalInventoryMode(id: number): ActorLocalInventoryMode {
  return actorLocalInventoryMode(lynxActorCapabilityPolicy(id));
}

export function lynxActorItemCollectionKind(id: number): ActorItemCollectionKind {
  return actorItemCollectionKind(lynxActorCapabilityPolicy(id));
}

export function lynxActorGlobalProgressKind(id: number): ActorGlobalProgressKind {
  return actorGlobalProgressKind(lynxActorCapabilityPolicy(id));
}

export function lynxActorMovementStrategyId(id: number): ActorMovementStrategyId {
  return actorMovementStrategyId(lynxActorCapabilityPolicy(id));
}

export function lynxActorBlockedMoveKind(id: number): ActorBlockedMoveKind {
  return actorBlockedMoveKind(lynxActorCapabilityPolicy(id));
}

export function lynxActorTrapHook(id: number): ActorTrapHook {
  return actorTrapHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorClonerHook(id: number): ActorClonerHook {
  return actorClonerHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorThiefHook(id: number): ActorThiefHook {
  return actorThiefHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorAirHook(id: number): ActorAirHook {
  return actorAirHook(lynxActorCapabilityPolicy(id));
}

export function lynxActorTrapFamilyHooks(id: number): ActorTrapFamilyHooks {
  return actorTrapFamilyHooks(lynxActorCapabilityPolicy(id));
}

export function lynxActorClonerFamilyHooks(id: number): ActorClonerFamilyHooks {
  return actorClonerFamilyHooks(lynxActorCapabilityPolicy(id));
}

export function lynxActorSupportFamilyHooks(id: number): ActorSupportFamilyHooks {
  return actorSupportFamilyHooks(lynxActorCapabilityPolicy(id));
}

export function lynxActorCollisionStrategyId(id: number): ActorCollisionStrategyId {
  return actorCollisionStrategyId(lynxActorCapabilityPolicy(id));
}

export function lynxActorEntryMask(tileId: number, actorId: number): number {
  switch (lynxActorMovementStrategyId(actorId)) {
    case "chip-like":
    case "ballistic-like":
      return lynxChipMovementMask(tileId);
    case "block-like":
      return lynxBlockMovementMask(tileId);
    default:
      return lynxCreatureMovementMask(tileId);
  }
}

export function lynxActorHazardResponse(actorId: number, hazard: ActorHazardName): ActorHazardResponse {
  return actorHazardResponse(lynxActorCapabilityPolicy(actorId), hazard);
}

export function lynxToggledWallTileId(id: number): number {
  return lynxToggledWallTileIdFromTiles(id);
}

export function lynxFixedSlideDirection(id: number): number {
  return lynxFixedSlideDirectionFromTiles(id);
}

export function lynxIceWallTurn(id: number, dir: number): number {
  return lynxIceWallTurnFromTiles(id, dir);
}

export function lynxCreatureArrivalAction(tileId: number, actorId: number): LynxCreatureArrivalAction {
  if (tileId === MS_TILE.Beartrap) {
    return "trap";
  }
  if (lynxButtonAction(tileId) !== "none") {
    return "button";
  }
  if (tileId === MS_TILE.Key_Blue) {
    return "clear-key-blue";
  }
  if (tileId === MS_TILE.Water) {
    switch (lynxActorHazardResponse(actorId, "water")) {
      case "transform":
        return "block-water";
      case "destroy":
        return "creature-water";
      default:
        return "none";
    }
  }
  if (tileId === MS_TILE.Bomb) {
    switch (lynxActorHazardResponse(actorId, "bomb")) {
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

export function lynxArrivalAnimationKind(tileId: number, actorId: number): LynxAnimationKind {
  switch (lynxCreatureArrivalAction(tileId, actorId)) {
    case "block-water":
    case "creature-water":
      return "water-splash";
    case "block-bomb":
    case "creature-bomb":
      return "bomb-explosion";
    default:
      return "none";
  }
}

export function lynxChipMoveSoundAction(tileId: number, options: LynxChipMoveSoundOptions): LynxFloorSoundAction {
  return lynxChipMoveSoundActionFromTiles(tileId, options);
}

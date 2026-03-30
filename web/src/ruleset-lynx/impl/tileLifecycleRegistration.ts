import type { TileLifecycleHookName, TileLifecyclePhase } from "@game-core/api/ruleset";
import type { TileLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { createTileLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";
import { lynxRulesetCatalog } from "@ruleset-lynx/impl/catalog";

let lynxTileLifecycleRegistry: TileLifecycleRegistry<number, number> | null = null;

export function getLynxRegisteredTileLifecycleRegistry(): TileLifecycleRegistry<number, number> {
  lynxTileLifecycleRegistry ??= createTileLifecycleRegistry(Array.from(lynxRulesetCatalog.tiles.values()));
  return lynxTileLifecycleRegistry;
}

function normalizeLynxTileLifecycleId(tileId: number): number {
  if (tileId === MS_TILE.Block_Static) {
    return tileId;
  }
  if (isMsCreature(tileId)) {
    return msCreatureId(tileId);
  }
  return tileId;
}

export function lookupLynxTileLifecycleBehavior(tileId: number) {
  return getLynxRegisteredTileLifecycleRegistry().getBehavior(normalizeLynxTileLifecycleId(tileId));
}

export function lookupLynxTileLifecyclePhase(tileId: number, phase: TileLifecyclePhase) {
  return getLynxRegisteredTileLifecycleRegistry().getPhase(normalizeLynxTileLifecycleId(tileId), phase);
}

export function lookupLynxTileLifecycleHook(tileId: number, hook: TileLifecycleHookName) {
  return getLynxRegisteredTileLifecycleRegistry().getHook(normalizeLynxTileLifecycleId(tileId), hook);
}

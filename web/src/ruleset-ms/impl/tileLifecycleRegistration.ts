import type { TileLifecycleHookName, TileLifecyclePhase } from "@game-core/api/ruleset";
import type { TileLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { createTileLifecycleRegistry } from "@game-core/api/lifecycleRegistry";
import { MS_TILE, isMsCreature, msCreatureId } from "@ruleset-ms/api/tiles";
import { msRulesetCatalog } from "@ruleset-ms/impl/catalog";

let msTileLifecycleRegistry: TileLifecycleRegistry<number, number> | null = null;

export function getMsRegisteredTileLifecycleRegistry(): TileLifecycleRegistry<number, number> {
  msTileLifecycleRegistry ??= createTileLifecycleRegistry(Array.from(msRulesetCatalog.tiles.values()));
  return msTileLifecycleRegistry;
}

function normalizeMsTileLifecycleId(tileId: number): number {
  if (tileId === MS_TILE.Block_Static) {
    return tileId;
  }
  if (isMsCreature(tileId)) {
    return msCreatureId(tileId);
  }
  return tileId;
}

export function lookupMsTileLifecycleBehavior(tileId: number) {
  return getMsRegisteredTileLifecycleRegistry().getBehavior(normalizeMsTileLifecycleId(tileId));
}

export function lookupMsTileLifecyclePhase(tileId: number, phase: TileLifecyclePhase) {
  return getMsRegisteredTileLifecycleRegistry().getPhase(normalizeMsTileLifecycleId(tileId), phase);
}

export function lookupMsTileLifecycleHook(tileId: number, hook: TileLifecycleHookName) {
  return getMsRegisteredTileLifecycleRegistry().getHook(normalizeMsTileLifecycleId(tileId), hook);
}

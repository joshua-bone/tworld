import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import {
  applyActorFloorImpactAction,
  continuePortablePickupIntoRevealedLowerTile,
  type ActorFloorImpactAction,
} from "@game-core/impl/floorImpact";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { mapHash } from "@game-core/impl/hash";
import { actorInventoryUseKey } from "@game-core/impl/actorLocalInventory";
import { collectLynxActorTile, projectLynxActorInventoryOwner } from "@ruleset-lynx/impl/actorCollections";
import { lookupLynxTerrainPickupFamilyRegistration } from "@ruleset-lynx/impl/elementRegistration";
import { lookupLynxTilePolicy } from "@ruleset-lynx/impl/catalogTiles";
import type { LynxTilePolicyDefinition } from "@ruleset-lynx/impl/catalogTiles";
import type { LynxCompletedChipMoveContext } from "@ruleset-lynx/impl/chipArrival";
import { lynxFloorImpactAction, lynxTilePostEntryAction } from "@ruleset-lynx/impl/floorImpactPolicy";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxChipEnterTileBehaviorContext extends TileBehaviorContext<number, number> {
  readonly runtime: Pick<
    LynxCompletedChipMoveContext,
    "state" | "soundBits" | "resolveButtonEffects" | "applyThiefHook" | "queueCollectedTool"
  >;
  readonly pos: number;
  soundEffects: number;
  resolved: boolean;
  completed: boolean;
  continueIntoRevealedLowerTile: boolean;
}

function handleLynxChipEnterTileBehavior(
  policy: LynxTilePolicyDefinition,
  context: LynxChipEnterTileBehaviorContext,
): void {
  const floorImpactAction = lynxFloorImpactAction(policy.chipEnterAction);
  if (floorImpactAction === null || floorImpactAction === "destroy-water" || floorImpactAction === "destroy-fire" || floorImpactAction === "destroy-bomb") {
    return;
  }

  const chipInventory = projectLynxActorInventoryOwner(MS_TILE.Chip, context.runtime.state.inventory);
  const arrival = applyActorFloorImpactAction(floorImpactAction, {
    clearFloor: () => {
      const cell = context.runtime.state.map.cells[context.pos];
      if (!cell) {
        return;
      }
      replaceTopTile(context.runtime.state.map.cells, context.pos, { ...cell.top, id: MS_TILE.Empty });
      context.runtime.state.map.hash = mapHash(context.runtime.state.map.cells);
    },
    consumeEnteredOverlay: () => {
      promoteBottomTile(context.runtime.state.map.cells, context.pos, MS_TILE.Empty);
      context.runtime.state.map.hash = mapHash(context.runtime.state.map.cells);
    },
    popupWall: () => {
      const cell = context.runtime.state.map.cells[context.pos];
      if (!cell) {
        return;
      }
      replaceTopTile(context.runtime.state.map.cells, context.pos, { ...cell.top, id: MS_TILE.Wall });
      context.runtime.state.map.hash = mapHash(context.runtime.state.map.cells);
    },
    collectTile: () => {
      const cell = context.runtime.state.map.cells[context.pos];
      return collectLynxActorTile(MS_TILE.Chip, context.runtime.state.inventory, cell?.top.id ?? MS_TILE.Empty);
    },
    afterCollect: (resolution) => {
      const cell = context.runtime.state.map.cells[context.pos];
      const collectedPortableItem =
        lookupLynxTerrainPickupFamilyRegistration(context.tileId)?.familyId === "portable-items";
      const revealedFloorImpact = lynxTilePostEntryAction(cell?.top.id ?? MS_TILE.Empty);
      context.continueIntoRevealedLowerTile = continuePortablePickupIntoRevealedLowerTile(
        collectedPortableItem,
        revealedFloorImpact,
      );
      if (resolution.slot === "tools") {
        context.runtime.queueCollectedTool(context.pos, context.tileId);
      }
    },
    tryOpenDoor: () => {
      const doorKeyIndex = lookupLynxTilePolicy(context.tileId).doorKeyIndex ?? null;
      return doorKeyIndex !== null && actorInventoryUseKey(chipInventory, doorKeyIndex, { consume: doorKeyIndex !== 3 });
    },
    tryOpenSocket: () => context.runtime.state.inventory.chipsNeeded === 0,
    clearBootsAndTools: () => context.runtime.applyThiefHook(),
    resolveButtonEffects: () => context.runtime.resolveButtonEffects(context.pos, context.tileId),
    soundEffects: context.runtime.soundBits,
  });

  context.soundEffects |= arrival.soundEffects;
  context.resolved ||= arrival.status === "resolved";
  context.completed ||= arrival.status === "completed";
}

export function createLynxChipEnterTileBehavior(
  policy: LynxTilePolicyDefinition,
): TileBehavior<number, number> | undefined {
  switch (policy.chipEnterAction) {
    case "none":
    case "water-death":
    case "fire-death":
    case "explode-bomb":
      return undefined;
    default:
      return createTileBehavior({
        "begin-enter": (context) => {
          handleLynxChipEnterTileBehavior(policy, context as LynxChipEnterTileBehaviorContext);
        },
      });
  }
}

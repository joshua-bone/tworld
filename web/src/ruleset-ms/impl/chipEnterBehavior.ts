import type { EngineMapCell } from "@game-core/api/model";
import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import {
  applyActorFloorImpactAction,
  continuePortablePickupIntoRevealedLowerTile,
  type ActorFloorImpactAction,
} from "@game-core/impl/floorImpact";
import { popBoardTile } from "@game-core/impl/board";
import {
  actorInventoryClearBoots,
  actorInventoryHasBoot,
  actorInventoryUseKey,
} from "@game-core/impl/actorLocalInventory";
import { MS_FLOOR_STATE, MS_SOUND, MS_TILE } from "@ruleset-ms/api/tiles";
import { lookupMsTerrainPickupFamilyRegistration } from "@ruleset-ms/impl/elementRegistration";
import { collectMsActorTile, projectMsActorInventoryOwner } from "@ruleset-ms/impl/actorCollections";
import { clearMsToolInventory, queueMsToolInventoryReplacement } from "@ruleset-ms/impl/portableItems";
import { msActorThiefOutcome } from "@ruleset-ms/impl/actorInteractions";
import { msFloorImpactAction, msTilePostEntryAction } from "@ruleset-ms/impl/floorImpactPolicy";
import { lookupMsTilePolicy } from "@ruleset-ms/impl/catalogTiles";
import type { MsTilePolicyDefinition } from "@ruleset-ms/impl/catalogTiles";
import type { MsChipEntryContext, MsChipEntryState } from "@ruleset-ms/impl/chipArrival";

export interface MsChipEnterTileBehaviorContext extends TileBehaviorContext<number, number> {
  readonly cells: EngineMapCell[];
  readonly chip: MsChipEntryState;
  readonly runtime: MsChipEntryContext;
  readonly nextPos: number;
  readonly nextCell: EngineMapCell;
  readonly chipInventory: ReturnType<typeof projectMsActorInventoryOwner>;
  soundEffects: number;
  enteredTeleport: boolean;
  continueIntoRevealedLowerTile: boolean;
  floorTileBeforeMove: EngineMapCell["top"];
}

function handleMsChipEnterTileBehavior(
  policy: MsTilePolicyDefinition,
  context: MsChipEnterTileBehaviorContext,
): void {
  const floorImpactAction = msFloorImpactAction(policy.chipEnterAction);
  if (floorImpactAction === null) {
    return;
  }

  if (floorImpactAction === "destroy-bomb") {
    context.chip.chipStatus = "bombed";
    context.soundEffects |= 1 << MS_SOUND.BombExplodes;
    return;
  }

  if (floorImpactAction === "destroy-water") {
    if (!actorInventoryHasBoot(context.chipInventory, 3)) {
      context.chip.chipStatus = "drowned";
    }
    return;
  }

  if (floorImpactAction === "destroy-fire") {
    if (!actorInventoryHasBoot(context.chipInventory, 2)) {
      context.chip.chipStatus = "burned";
    }
    return;
  }

  if (floorImpactAction === "teleport") {
    if ((context.floorTileBeforeMove.state & MS_FLOOR_STATE.Broken) === 0) {
      context.enteredTeleport = true;
    }
    return;
  }

  context.soundEffects |= applyActorFloorImpactAction(floorImpactAction, {
    clearFloor: () => {
      popBoardTile(context.cells, context.nextPos, MS_TILE.Empty);
    },
    popupWall: () => {
      if (context.nextCell.top.id === MS_TILE.Empty) {
        popBoardTile(context.cells, context.nextPos, MS_TILE.Empty);
        return;
      }
      context.nextCell.top.id = MS_TILE.Wall;
      context.floorTileBeforeMove.id = MS_TILE.Wall;
    },
    collectTile: () => collectMsActorTile(MS_TILE.Chip, context.runtime.inventory, context.tileId),
    afterCollect: (collected) => {
      const collectedPortableItem =
        lookupMsTerrainPickupFamilyRegistration(context.tileId)?.familyId === "portable-items";
      const revealedFloorImpact = msTilePostEntryAction(context.nextCell.top.id);
      context.continueIntoRevealedLowerTile = continuePortablePickupIntoRevealedLowerTile(
        collectedPortableItem,
        revealedFloorImpact,
      );
      if (collected.slot !== "tools") {
        return;
      }
      queueMsToolInventoryReplacement(
        context.runtime.portableTools,
        context.runtime.inventory,
        context.tileId,
        context.nextPos,
        context.runtime.runtimeCellZ(context.nextPos),
      );
    },
    tryOpenDoor: () => {
      const doorKeyIndex = lookupMsTilePolicy(context.tileId).doorKeyIndex ?? null;
      return (
        doorKeyIndex !== null &&
        actorInventoryUseKey(context.chipInventory, doorKeyIndex, { consume: context.tileId !== MS_TILE.Door_Green })
      );
    },
    tryOpenSocket: () => true,
    clearBootsAndTools: () => {
      if (msActorThiefOutcome(MS_TILE.Chip) !== "steal-boots-tools") {
        return false;
      }
      actorInventoryClearBoots(context.chipInventory);
      clearMsToolInventory(context.runtime.portableTools, context.runtime.inventory);
      return true;
    },
    soundEffects: {
      doorOpened: 1 << MS_SOUND.DoorOpened,
      socketOpened: 1 << MS_SOUND.SocketOpened,
      bootsStolen: 1 << MS_SOUND.BootsStolen,
      itemCollected: 1 << MS_SOUND.ItemCollected,
      icCollected: 1 << MS_SOUND.IcCollected,
      wallCreated: 0,
    },
  }).soundEffects;
}

export function createMsChipEnterTileBehavior(
  policy: MsTilePolicyDefinition,
): TileBehavior<number, number> | undefined {
  switch (policy.chipEnterAction) {
    case "none":
    case "collision":
      return undefined;
    default:
      return createTileBehavior({
        "begin-enter": (context) => {
          handleMsChipEnterTileBehavior(policy, context as MsChipEnterTileBehaviorContext);
        },
      });
  }
}

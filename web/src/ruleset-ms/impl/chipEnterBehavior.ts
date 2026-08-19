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
import { msInventoryIndex, msInventorySlot } from "@ruleset-ms/impl/catalog";
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
    if (context.chip.chipStatus === "okay") {
      context.chip.chipStatus = "bombed";
      const z = context.runtime.runtimeCellZ(context.nextPos);
      context.runtime.recordCausalEvent?.({
        kind: "player-died",
        actorId: MS_TILE.Chip,
        actorSerial: null,
        tileId: context.tileId,
        sourceTileId: context.tileId,
        sourcePosition: { pos: context.nextPos, z },
        sourceStratum: "terrain",
        cause: "cc1:bombed",
        before: { pos: context.nextPos, z },
        after: { pos: context.nextPos, z },
        phase: "terminal-latch",
      });
    }
    context.soundEffects |= 1 << MS_SOUND.BombExplodes;
    return;
  }

  if (floorImpactAction === "destroy-water") {
    if (!actorInventoryHasBoot(context.chipInventory, 3)) {
      context.chip.chipStatus = "drowned";
      const z = context.runtime.runtimeCellZ(context.nextPos);
      context.runtime.recordCausalEvent?.({
        kind: "player-died",
        actorId: MS_TILE.Chip,
        actorSerial: null,
        tileId: context.tileId,
        sourceTileId: context.tileId,
        sourcePosition: { pos: context.nextPos, z },
        sourceStratum: "terrain",
        cause: "cc1:drowned",
        before: { pos: context.nextPos, z },
        after: { pos: context.nextPos, z },
        phase: "terminal-latch",
      });
    }
    return;
  }

  if (floorImpactAction === "destroy-fire") {
    if (!actorInventoryHasBoot(context.chipInventory, 2)) {
      context.chip.chipStatus = "burned";
      const z = context.runtime.runtimeCellZ(context.nextPos);
      context.runtime.recordCausalEvent?.({
        kind: "player-died",
        actorId: MS_TILE.Chip,
        actorSerial: null,
        tileId: context.tileId,
        sourceTileId: context.tileId,
        sourcePosition: { pos: context.nextPos, z },
        sourceStratum: "terrain",
        cause: "cc1:burned",
        before: { pos: context.nextPos, z },
        after: { pos: context.nextPos, z },
        phase: "terminal-latch",
      });
    }
    return;
  }

  if (floorImpactAction === "teleport") {
    if ((context.floorTileBeforeMove.state & MS_FLOOR_STATE.Broken) === 0) {
      context.enteredTeleport = true;
    }
    return;
  }

  const resourceSlot = floorImpactAction === "collect-chip"
    ? "chips-needed"
    : floorImpactAction === "open-door"
      ? "keys"
      : msInventorySlot(context.tileId);
  const resourceIndex = floorImpactAction === "open-door"
    ? lookupMsTilePolicy(context.tileId).doorKeyIndex ?? null
    : msInventoryIndex(context.tileId);
  const resourceCount = (): number | null => {
    if (resourceSlot === "chips-needed") return context.runtime.inventory.chipsNeeded;
    if (resourceSlot === "keys" || resourceSlot === "boots" || resourceSlot === "tools") {
      if (resourceIndex === null) return null;
      return context.runtime.inventory[resourceSlot][resourceIndex] ?? null;
    }
    return null;
  };
  const resourceBeforeCount = resourceCount();

  const arrival = applyActorFloorImpactAction(floorImpactAction, {
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
      const bootsBefore = [...context.runtime.inventory.boots];
      actorInventoryClearBoots(context.chipInventory);
      clearMsToolInventory(context.runtime.portableTools, context.runtime.inventory);
      const z = context.runtime.runtimeCellZ(context.nextPos);
      for (const [index, beforeCount] of bootsBefore.entries()) {
        const afterCount = context.runtime.inventory.boots[index] ?? 0;
        if (beforeCount === afterCount) continue;
        context.runtime.recordCausalEvent?.({
          kind: "inventory-changed",
          actorId: MS_TILE.Chip,
          actorSerial: null,
          tileId: context.tileId,
          resourceCounter: {
            slot: "boots",
            index,
            beforeCount,
            afterCount,
          },
          action: "cc1:thief-stole",
          before: { pos: context.nextPos, z },
          after: { pos: context.nextPos, z },
          phase: "arrival-effect",
        });
      }
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
  });
  context.soundEffects |= arrival.soundEffects;
  if (arrival.status !== "resolved") return;
  const kind = floorImpactAction === "collect-chip" || floorImpactAction === "collect-item"
    ? "collect"
    : floorImpactAction === "open-door"
      ? "open-door"
      : floorImpactAction === "open-socket"
        ? "open-socket"
        : null;
  if (kind !== null) {
    const z = context.runtime.runtimeCellZ(context.nextPos);
    context.runtime.recordCausalEvent?.({
      kind,
      actorId: MS_TILE.Chip,
      actorSerial: null,
      tileId: context.tileId,
      resultingTileId: context.nextCell.top.id,
      resourceCounter: resourceSlot !== null && resourceBeforeCount !== null
        ? {
            slot: resourceSlot,
            index: resourceIndex,
            beforeCount: resourceBeforeCount,
            afterCount: resourceCount() ?? resourceBeforeCount,
          }
        : null,
      before: { pos: context.nextPos, z },
      after: { pos: context.nextPos, z },
      phase: "arrival-effect",
    });
  }
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

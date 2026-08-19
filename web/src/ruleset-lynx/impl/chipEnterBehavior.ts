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
import { lynxInventoryIndex, lynxInventorySlot } from "@ruleset-lynx/impl/catalog";
import { MS_TILE } from "@ruleset-ms/api/tiles";

export interface LynxChipEnterTileBehaviorContext extends TileBehaviorContext<number, number> {
  readonly runtime: Pick<
    LynxCompletedChipMoveContext,
    | "state"
    | "soundBits"
    | "resolveButtonEffects"
    | "applyThiefHook"
    | "queueCollectedTool"
    | "activeLayerZ"
    | "recordCausalEvent"
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
  const resourceSlot = floorImpactAction === "collect-chip"
    ? "chips-needed"
    : floorImpactAction === "open-door"
      ? "keys"
      : lynxInventorySlot(context.tileId);
  const resourceIndex = floorImpactAction === "open-door"
    ? lookupLynxTilePolicy(context.tileId).doorKeyIndex ?? null
    : lynxInventoryIndex(context.tileId);
  const resourceCount = (): number | null => {
    if (resourceSlot === "chips-needed") return context.runtime.state.inventory.chipsNeeded;
    if (resourceSlot === "keys" || resourceSlot === "boots" || resourceSlot === "tools") {
      if (resourceIndex === null) return null;
      return context.runtime.state.inventory[resourceSlot][resourceIndex] ?? null;
    }
    return null;
  };
  const resourceBeforeCount = resourceCount();
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
    clearBootsAndTools: () => {
      const bootsBefore = [...context.runtime.state.inventory.boots];
      const applied = context.runtime.applyThiefHook();
      if (!applied) return false;
      const z = context.runtime.activeLayerZ();
      for (const [index, beforeCount] of bootsBefore.entries()) {
        const afterCount = context.runtime.state.inventory.boots[index] ?? 0;
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
          before: { pos: context.pos, z },
          after: { pos: context.pos, z },
          phase: "arrival-effect",
        });
      }
      return true;
    },
    resolveButtonEffects: () => context.runtime.resolveButtonEffects(context.pos, context.tileId),
    soundEffects: context.runtime.soundBits,
  });

  context.soundEffects |= arrival.soundEffects;
  context.resolved ||= arrival.status === "resolved";
  context.completed ||= arrival.status === "completed";
  if (arrival.status !== "resolved") return;
  const kind = floorImpactAction === "collect-chip" || floorImpactAction === "collect-item"
    ? "collect"
    : floorImpactAction === "open-door"
      ? "open-door"
      : floorImpactAction === "open-socket"
        ? "open-socket"
        : null;
  if (kind !== null) {
    const z = context.runtime.activeLayerZ();
    context.runtime.recordCausalEvent?.({
      kind,
      actorId: MS_TILE.Chip,
      actorSerial: null,
      tileId: context.tileId,
      resultingTileId: context.runtime.state.map.cells[context.pos]?.top.id ?? MS_TILE.Empty,
      resourceCounter: resourceSlot !== null && resourceBeforeCount !== null
        ? {
            slot: resourceSlot,
            index: resourceIndex,
            beforeCount: resourceBeforeCount,
            afterCount: resourceCount() ?? resourceBeforeCount,
          }
        : null,
      before: { pos: context.pos, z },
      after: { pos: context.pos, z },
      phase: "arrival-effect",
    });
  }
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

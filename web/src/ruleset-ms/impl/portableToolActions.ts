import { reverseDirection as backDirection } from "@game-core/impl/grid";
import { decodeRuntimeInputCode, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import type { PetCarrierMobSnapshot } from "@game-core/impl/petCarrier";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
import {
  carriedMsPortableToolItem,
  primedMsPortableToolItem,
  primeMsToolDrop,
  msPortableItemDefinitionForFamily,
  type MsPortableItem,
  type MsPortableToolStateStore,
  type MsToolInventoryProjection,
} from "@ruleset-ms/impl/portableItems";

export interface MsPortableToolActionContext {
  store: MsPortableToolStateStore;
  inventory: MsToolInventoryProjection;
  chipPos: number;
  chipZ: number;
  chipDir: number;
  tryActivateMovingItem(item: MsPortableItem, dir: number): boolean;
  snatchFacingMob(): PetCarrierMobSnapshot | null;
  releaseFacingMob(snapshot: PetCarrierMobSnapshot): boolean;
}

interface MsPortableToolSourceStep {
  pos: number;
  supportTileId: number;
}

export interface MsPortableToolPostMoveContext {
  moveModifierEnabled: boolean;
  movementSucceeded: boolean;
  originPos: number;
  originZ: number;
  landedPos: number;
  landedZ: number;
  moveDir: number;
  resolveSourceStep(originPos: number, dir: number): MsPortableToolSourceStep | null;
  sourceHasMoveModifierTarget(pos: number, z: number): boolean;
  applyMoveModifier(pos: number, moveDir: number): void;
}

function msHookTugModifierEnabledForCarriedItem(
  carried: MsPortableItem | undefined,
  modifierMask: number,
): boolean {
  return carried?.family === "hook" && (modifierMask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0;
}

export function applyMsPortableToolAction(context: MsPortableToolActionContext): boolean {
  const carried = carriedMsPortableToolItem(context.store);
  if (!carried) {
    return false;
  }

  return (
    msPortableItemDefinitionForFamily(carried.family).applyAction1?.({
      store: context.store,
      inventory: context.inventory,
      carried,
      chipPos: context.chipPos,
      chipZ: context.chipZ,
      chipDir: context.chipDir,
      hasPrimedDrop: primedMsPortableToolItem(context.store) !== undefined,
      primeDrop: () => primeMsToolDrop(context.store, context.inventory, context.chipPos, context.chipZ),
      throwMovingItem: (item, dir) => context.tryActivateMovingItem(item, dir),
      snatchFacingMob: () => context.snatchFacingMob(),
      releaseFacingMob: (snapshot) => context.releaseFacingMob(snapshot),
    }) ?? false
  );
}

export function msPortableToolMoveModifierEnabled(store: MsPortableToolStateStore, inputCode: number): boolean {
  return msHookTugModifierEnabledForCarriedItem(
    carriedMsPortableToolItem(store),
    decodeRuntimeInputCode(inputCode).modifierMask,
  );
}

export function msPortableToolMoveModifierEnabledForCarriedItem(
  carried: MsPortableItem | undefined,
  modifierMask: number,
): boolean {
  return msHookTugModifierEnabledForCarriedItem(carried, modifierMask);
}

export function applyMsPortableToolPostMoveAction(context: MsPortableToolPostMoveContext): void {
  if (!context.moveModifierEnabled || !context.movementSucceeded) {
    return;
  }
  if (context.originPos === context.landedPos || context.originZ !== context.landedZ) {
    return;
  }
  const sourceDir = backDirection(context.moveDir);
  if (sourceDir === MS_DIRECTION.none || context.moveDir === MS_DIRECTION.none) {
    return;
  }

  const sourceStep = context.resolveSourceStep(context.originPos, sourceDir);
  if (!sourceStep || sourceStep.supportTileId === MS_TILE.CloneMachine) {
    return;
  }
  if (!context.sourceHasMoveModifierTarget(sourceStep.pos, context.originZ)) {
    return;
  }

  context.applyMoveModifier(sourceStep.pos, context.moveDir);
}

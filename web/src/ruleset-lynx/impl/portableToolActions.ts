import { decodeRuntimeInputCode, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import {
  carriedLynxPortableToolItem,
  primedLynxPortableToolItem,
  primeLynxToolDrop,
  lynxPortableItemDefinitionForFamily,
  type LynxPortableItem,
  type LynxPortableToolStateStore,
  type LynxToolInventoryProjection,
} from "@ruleset-lynx/impl/portableItems";

export interface LynxPortableToolActionContext {
  store: LynxPortableToolStateStore;
  inventory: LynxToolInventoryProjection;
  chipPos: number;
  chipZ: number;
  chipDir: number;
  tryThrowBowlingBall(item: LynxPortableItem, dir: number): boolean;
}

export interface LynxPortableToolPostMoveContext {
  moveModifierEnabled: boolean;
  movementSucceeded: boolean;
  originPos: number;
  originZ: number;
  landedPos: number;
  landedZ: number;
  moveDir: number;
  applyHookTug(originPos: number, originZ: number, moveDir: number): void;
}

function lynxHookTugModifierEnabledForCarriedItem(
  carried: LynxPortableItem | undefined,
  modifierMask: number,
): boolean {
  return carried?.family === "hook" && (modifierMask & GAME_INPUT_MODIFIER_MASKS.action1) !== 0;
}

export function applyLynxPortableToolAction(context: LynxPortableToolActionContext): boolean {
  const carried = carriedLynxPortableToolItem(context.store);
  if (!carried) {
    return false;
  }

  return (
    lynxPortableItemDefinitionForFamily(carried.family).applyAction1?.({
      store: context.store,
      inventory: context.inventory,
      carried,
      chipPos: context.chipPos,
      chipZ: context.chipZ,
      chipDir: context.chipDir,
      hasPrimedDrop: primedLynxPortableToolItem(context.store) !== undefined,
      primeDrop: () => primeLynxToolDrop(context.store, context.inventory, context.chipPos, context.chipZ),
      throwMovingItem: (item, dir) => context.tryThrowBowlingBall(item, dir),
    }) ?? false
  );
}

export function lynxPortableToolMoveModifierEnabled(store: LynxPortableToolStateStore, inputCode: number): boolean {
  return lynxHookTugModifierEnabledForCarriedItem(
    carriedLynxPortableToolItem(store),
    decodeRuntimeInputCode(inputCode).modifierMask,
  );
}

export function lynxPortableToolMoveModifierEnabledForCarriedItem(
  carried: LynxPortableItem | undefined,
  modifierMask: number,
): boolean {
  return lynxHookTugModifierEnabledForCarriedItem(carried, modifierMask);
}

export function applyLynxPortableToolPostMoveAction(context: LynxPortableToolPostMoveContext): void {
  if (!context.moveModifierEnabled || !context.movementSucceeded) {
    return;
  }
  if (context.originPos === context.landedPos || context.originZ !== context.landedZ) {
    return;
  }

  context.applyHookTug(context.originPos, context.originZ, context.moveDir);
}

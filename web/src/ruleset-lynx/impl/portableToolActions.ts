import { reverseDirection as backDirection } from "@game-core/impl/grid";
import { decodeRuntimeInputCode, GAME_INPUT_MODIFIER_MASKS } from "@game-core/api/command";
import type { PetCarrierMobSnapshot } from "@game-core/impl/petCarrier";
import { MS_DIRECTION, MS_TILE } from "@ruleset-ms/api/tiles";
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
  tryActivateMovingItem(item: LynxPortableItem, dir: number): boolean;
  snatchFacingMob(): PetCarrierMobSnapshot | null;
  releaseFacingMob(snapshot: PetCarrierMobSnapshot): boolean;
}

interface LynxPortableToolSourceStep {
  pos: number;
  supportTileId: number;
}

export interface LynxPortableToolPostMoveContext {
  moveModifierEnabled: boolean;
  movementSucceeded: boolean;
  originPos: number;
  originZ: number;
  landedPos: number;
  landedZ: number;
  moveDir: number;
  resolveSourceStep(originPos: number, dir: number): LynxPortableToolSourceStep | null;
  sourceHasMoveModifierTarget(pos: number, z: number): boolean;
  applyMoveModifier(pos: number, moveDir: number): void;
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
      throwMovingItem: (item, dir) => context.tryActivateMovingItem(item, dir),
      snatchFacingMob: () => context.snatchFacingMob(),
      releaseFacingMob: (snapshot) => context.releaseFacingMob(snapshot),
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

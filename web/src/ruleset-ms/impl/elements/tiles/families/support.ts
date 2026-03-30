import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport } from "@game-core/api/actorCapabilities";
import type { ActorSupportFamilyHooks } from "@game-core/api/actorSpecialFloorHooks";
import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import type { ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { applyMsDoorSupportBehavior, hasMsDoorSupportBehavior } from "@ruleset-ms/impl/elements/tiles/support/doors";
import { applyMsPortableSupportBehavior, hasMsPortableSupportBehavior } from "@ruleset-ms/impl/elements/tiles/support/portable";
import { applyMsSocketSupportBehavior, hasMsSocketSupportBehavior } from "@ruleset-ms/impl/elements/tiles/support/socket";
import {
  applyMsSpecialFloorSupportBehavior,
  hasMsSpecialFloorSupportBehavior,
} from "@ruleset-ms/impl/elements/tiles/support/specialFloors";
import { applyMsWallSupportBehavior, hasMsWallSupportBehavior } from "@ruleset-ms/impl/elements/tiles/support/walls";

export interface MsTileSupportContext {
  inventory: EngineState["inventory"];
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number, tileId?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
}

export interface MsTileSupportSubject {
  supportHooks: ActorSupportFamilyHooks;
  inventoryOwner: ActorLocalInventoryOwner | null;
}

export interface MsTileSupportBehaviorContext extends TileBehaviorContext<number, number> {
  readonly lowerCells: EngineMapCell[];
  readonly pos: number;
  readonly currentZ: number;
  readonly cellZ: number;
  readonly layer: "top" | "bottom";
  readonly support: MsTileSupportContext;
  readonly subject: MsTileSupportSubject;
  resolved: boolean;
  result: VerticalSupportResult;
}

export function markMsSupported(context: MsTileSupportBehaviorContext): void {
  context.support.addTileOverlay(context.currentZ, context.pos, "support");
  context.resolved = true;
  context.result = VERTICAL_SUPPORT_RESULT.supported;
}

export function markMsUnsupported(context: MsTileSupportBehaviorContext): void {
  context.resolved = true;
  context.result = VERTICAL_SUPPORT_RESULT.unsupported;
}

function handleMsSupportBehavior(context: MsTileSupportBehaviorContext): void {
  const chipSupport = actorUsesChipSupport(context.subject.supportHooks.airHook);

  if (applyMsSpecialFloorSupportBehavior(context)) {
    return;
  }
  if (applyMsPortableSupportBehavior(context, chipSupport)) {
    return;
  }
  if (applyMsWallSupportBehavior(context, chipSupport)) {
    return;
  }
  if (applyMsDoorSupportBehavior(context)) {
    return;
  }
  applyMsSocketSupportBehavior(context);
}

export function createMsSupportTileBehavior(
  tileId: number,
): TileBehavior<number, number> | undefined {
  const hasSupportBehavior =
    hasMsPortableSupportBehavior(tileId) ||
    hasMsDoorSupportBehavior(tileId) ||
    hasMsSocketSupportBehavior(tileId) ||
    hasMsSpecialFloorSupportBehavior(tileId) ||
    hasMsWallSupportBehavior(tileId);
  if (!hasSupportBehavior) {
    return undefined;
  }
  return createTileBehavior({
    "probe-support": (context) => {
      handleMsSupportBehavior(context as MsTileSupportBehaviorContext);
    },
  });
}

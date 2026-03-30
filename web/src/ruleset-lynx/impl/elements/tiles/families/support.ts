import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport } from "@game-core/api/actorCapabilities";
import type { ActorSupportFamilyHooks } from "@game-core/api/actorSpecialFloorHooks";
import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import type { ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { applyLynxDoorSupportBehavior, hasLynxDoorSupportBehavior } from "@ruleset-lynx/impl/elements/tiles/support/doors";
import { applyLynxPortableSupportBehavior, hasLynxPortableSupportBehavior } from "@ruleset-lynx/impl/elements/tiles/support/portable";
import { applyLynxSocketSupportBehavior, hasLynxSocketSupportBehavior } from "@ruleset-lynx/impl/elements/tiles/support/socket";
import {
  applyLynxSpecialFloorSupportBehavior,
  hasLynxSpecialFloorSupportBehavior,
} from "@ruleset-lynx/impl/elements/tiles/support/specialFloors";
import { applyLynxWallSupportBehavior, hasLynxWallSupportBehavior } from "@ruleset-lynx/impl/elements/tiles/support/walls";

export interface LynxTileSupportContext {
  state: EngineState;
  chipPos: number;
  chipZ: number;
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
  findVisibleActorAt(pos: number, z: number): { id: number } | null;
}

export interface LynxTileSupportSubject {
  supportHooks: ActorSupportFamilyHooks;
  inventoryOwner: ActorLocalInventoryOwner | null;
}

export interface LynxTileSupportBehaviorContext extends TileBehaviorContext<number, number> {
  readonly lowerCells: EngineMapCell[];
  readonly pos: number;
  readonly z: number;
  readonly currentZ: number;
  readonly layer: "top" | "bottom";
  readonly support: LynxTileSupportContext;
  readonly subject: LynxTileSupportSubject;
  resolved: boolean;
  result: VerticalSupportResult;
}

export function markLynxSupported(context: LynxTileSupportBehaviorContext): void {
  context.support.addTileOverlay(context.currentZ, context.pos, "support");
  context.resolved = true;
  context.result = VERTICAL_SUPPORT_RESULT.supported;
}

export function markLynxUnsupported(context: LynxTileSupportBehaviorContext): void {
  context.resolved = true;
  context.result = VERTICAL_SUPPORT_RESULT.unsupported;
}

function handleLynxSupportBehavior(context: LynxTileSupportBehaviorContext): void {
  const chipSupport = actorUsesChipSupport(context.subject.supportHooks.airHook);

  if (applyLynxSpecialFloorSupportBehavior(context)) {
    return;
  }
  if (applyLynxPortableSupportBehavior(context, chipSupport)) {
    return;
  }
  if (applyLynxWallSupportBehavior(context, chipSupport)) {
    return;
  }
  if (applyLynxDoorSupportBehavior(context)) {
    return;
  }
  applyLynxSocketSupportBehavior(context);
}

export function createLynxSupportTileBehavior(
  tileId: number,
): TileBehavior<number, number> | undefined {
  const hasSupportBehavior =
    hasLynxPortableSupportBehavior(tileId) ||
    hasLynxDoorSupportBehavior(tileId) ||
    hasLynxSocketSupportBehavior(tileId) ||
    hasLynxSpecialFloorSupportBehavior(tileId) ||
    hasLynxWallSupportBehavior(tileId);
  if (!hasSupportBehavior) {
    return undefined;
  }
  return createTileBehavior({
    "probe-support": (context) => {
      handleLynxSupportBehavior(context as LynxTileSupportBehaviorContext);
    },
  });
}

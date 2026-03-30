import type { EngineMapCell, EngineState } from "@game-core/api/model";
import type { InteractiveGameTileOverlayKind } from "@game-core/api/interactive";
import { actorUsesChipSupport, type ActorAirHook } from "@game-core/api/actorCapabilities";
import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { VERTICAL_SUPPORT_RESULT, type VerticalSupportResult } from "@game-core/api/verticalMovement";
import { actorInventoryUseKey, type ActorLocalInventoryOwner } from "@game-core/impl/actorLocalInventory";
import { promoteBottomTile, replaceTopTile } from "@game-core/impl/board";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsTilePolicyDefinition } from "@ruleset-ms/impl/catalogTiles";

export interface MsTileSupportContext {
  inventory: EngineState["inventory"];
  addTileOverlay(z: number, pos: number, kind: InteractiveGameTileOverlayKind, ttl?: number, tileId?: number): void;
  chipActsWallForMobs(pos: number, z: number): boolean;
}

export interface MsTileSupportSubject {
  airHook: ActorAirHook;
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

function isMsSupportingWallTile(id: number): boolean {
  switch (id) {
    case MS_TILE.Wall:
    case MS_TILE.HiddenWall_Perm:
    case MS_TILE.HiddenWall_Temp:
    case MS_TILE.BlueWall_Real:
    case MS_TILE.SwitchWall_Closed:
      return true;
    default:
      return false;
  }
}

function support(context: MsTileSupportBehaviorContext): void {
  context.support.addTileOverlay(context.currentZ, context.pos, "support");
  context.resolved = true;
  context.result = VERTICAL_SUPPORT_RESULT.supported;
}

function unsupported(context: MsTileSupportBehaviorContext): void {
  context.resolved = true;
  context.result = VERTICAL_SUPPORT_RESULT.unsupported;
}

function handleMsSupportBehavior(
  policy: MsTilePolicyDefinition,
  context: MsTileSupportBehaviorContext,
): void {
  const chipSupport = actorUsesChipSupport(context.subject.airHook);

  if (context.tileId === MS_TILE.CloneMachine || context.tileId === MS_TILE.Elevator) {
    support(context);
    return;
  }

  if (context.layer !== "top") {
    return;
  }

  if (!chipSupport && policy.inventorySlot === "tools") {
    support(context);
    return;
  }

  if (isMsSupportingWallTile(context.tileId)) {
    if (context.tileId === MS_TILE.BlueWall_Real) {
      const cell = context.lowerCells[context.pos];
      if (cell) {
        replaceTopTile(context.lowerCells, context.pos, { ...cell.top, id: MS_TILE.Wall });
      }
    }
    support(context);
    return;
  }

  if (context.tileId === MS_TILE.BlueWall_Fake) {
    promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
    unsupported(context);
    return;
  }

  if (policy.tags.includes("door")) {
    const doorKeyIndex = policy.doorKeyIndex ?? null;
    if (
      doorKeyIndex !== null &&
      context.subject.inventoryOwner &&
      actorInventoryUseKey(context.subject.inventoryOwner, doorKeyIndex, { consume: context.tileId !== MS_TILE.Door_Green })
    ) {
      promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
      unsupported(context);
      return;
    }
    support(context);
    return;
  }

  if (context.tileId === MS_TILE.Socket) {
    if (context.support.inventory.chipsNeeded === 0) {
      promoteBottomTile(context.lowerCells, context.pos, MS_TILE.Empty);
      unsupported(context);
      return;
    }
    support(context);
  }
}

export function createMsSupportTileBehavior(
  policy: MsTilePolicyDefinition,
  tileId: number,
): TileBehavior<number, number> | undefined {
  const hasSupportBehavior =
    policy.inventorySlot === "tools" ||
    policy.tags.includes("door") ||
    tileId === MS_TILE.CloneMachine ||
    tileId === MS_TILE.Elevator ||
    tileId === MS_TILE.Socket ||
    tileId === MS_TILE.BlueWall_Fake ||
    isMsSupportingWallTile(tileId);
  if (!hasSupportBehavior) {
    return undefined;
  }
  return createTileBehavior({
    "probe-support": (context) => {
      handleMsSupportBehavior(policy, context as MsTileSupportBehaviorContext);
    },
  });
}

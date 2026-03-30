import type { EngineMapCell } from "@game-core/api/model";
import type { ActorCollisionOutcome } from "@game-core/api/actorInteractions";
import { findVisibleActorAtPosition, type HiddenPositionedActor } from "@game-core/impl/actors";
import { hasTopTileFlags } from "@game-core/impl/board";

export const OCCUPANCY_TARGET_KIND = {
  empty: "empty",
  runtimeActor: "runtime-actor",
  staticBlock: "static-block",
  portableItem: "portable-item",
  chip: "chip",
  blockedVisual: "blocked-visual",
} as const;

export type OccupancyTargetKind =
  (typeof OCCUPANCY_TARGET_KIND)[keyof typeof OCCUPANCY_TARGET_KIND];

export interface OccupancyTarget<
  TRuntimeActor = unknown,
  TPortableItem = unknown,
> {
  kind: OccupancyTargetKind;
  pos: number;
  z: number;
  tileId: number;
  claimed: boolean;
  runtimeActor?: TRuntimeActor;
  portableItem?: TPortableItem;
}

export function occupancyAllowsChipTeleportExitCollision(
  target: OccupancyTarget,
  interaction: ActorCollisionOutcome,
): boolean {
  return !interaction.denyMove && target.kind === OCCUPANCY_TARGET_KIND.runtimeActor;
}

export function findVisibleActorOnFlaggedTopCell<T extends HiddenPositionedActor>(
  cells: EngineMapCell[],
  actors: T[],
  pos: number,
  flags: number,
  predicate: (actor: T) => boolean = () => true,
): T | undefined {
  if (!hasTopTileFlags(cells, pos, flags)) {
    return undefined;
  }

  return findVisibleActorAtPosition(actors, pos, predicate);
}

export function hasVisibleActorOnFlaggedTopCell<T extends HiddenPositionedActor>(
  cells: EngineMapCell[],
  actors: T[],
  pos: number,
  flags: number,
  predicate: (actor: T) => boolean = () => true,
): boolean {
  return findVisibleActorOnFlaggedTopCell(cells, actors, pos, flags, predicate) !== undefined;
}

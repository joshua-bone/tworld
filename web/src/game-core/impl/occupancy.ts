import type { EngineMapCell } from "@game-core/api/model";
import { findVisibleActorAtPosition, type HiddenPositionedActor } from "@game-core/impl/actors";
import { hasTopTileFlags } from "@game-core/impl/board";

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

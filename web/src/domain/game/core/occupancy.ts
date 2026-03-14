import type { EngineMapCell } from "@domain/game/model";
import { findVisibleActorAtPosition, type HiddenPositionedActor } from "@domain/game/core/actors";
import { hasTopTileFlags } from "@domain/game/core/board";

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

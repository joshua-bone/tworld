import { createTileBehavior, type TileBehavior, type TileBehaviorContext } from "@game-core/api/ruleset";
import { replaceBottomTile, replaceTopTile } from "@game-core/impl/board";
import type { EngineMapCell } from "@game-core/api/model";
import { MS_TILE } from "@ruleset-ms/api/tiles";
import type { MsTilePolicyDefinition } from "@ruleset-ms/impl/catalogTiles";

export interface MsTileLeaveBehaviorContext extends TileBehaviorContext<number, number> {
  readonly cells: EngineMapCell[];
  readonly pos: number;
  readonly layer: "top" | "bottom";
  applied: boolean;
}

function handleMsLeaveBehavior(context: MsTileLeaveBehaviorContext): void {
  const cell = context.cells[context.pos];
  if (!cell) {
    return;
  }
  const replacement = context.layer === "top" ? { ...cell.top, id: MS_TILE.Air, state: 0 } : { ...cell.bottom, id: MS_TILE.Air, state: 0 };
  if (context.layer === "top") {
    replaceTopTile(context.cells, context.pos, replacement);
  } else {
    replaceBottomTile(context.cells, context.pos, replacement);
  }
  context.applied = true;
}

export function createMsLeaveTileBehavior(policy: MsTilePolicyDefinition): TileBehavior<number, number> | undefined {
  if (policy.mobExitAction !== "turn-to-air") {
    return undefined;
  }
  return createTileBehavior({
    "complete-exit": (context) => {
      handleMsLeaveBehavior(context as MsTileLeaveBehaviorContext);
    },
  });
}
